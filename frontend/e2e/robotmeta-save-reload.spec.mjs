import { expect, test } from "@playwright/test";
import { apiLogin, withAuthHeaders } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  seedXml,
  switchTab,
} from "./helpers/processFixture.mjs";

async function readSessionBpmnMeta(request, accessToken, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn_meta`, {
    headers: withAuthHeaders(accessToken),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  expect(res.ok(), `read bpmn_meta failed: ${text}`).toBeTruthy();
  return body;
}

function e2eUiCreds() {
  return {
    email: String(process.env.E2E_USER || process.env.E2E_ADMIN_EMAIL || "admin@local").trim(),
    password: String(process.env.E2E_PASS || process.env.E2E_ADMIN_PASSWORD || "admin"),
  };
}

async function uiLogin(page) {
  const creds = e2eUiCreds();
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Пароль").fill(creds.password);
  await page.getByRole("button", { name: "Войти в систему" }).click();
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
}

async function openFixtureInTopbar(page, fixture) {
  await page.goto("/app");
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");
  await expect(projectSelect).toBeVisible();
  await projectSelect.selectOption(String(fixture.projectId || ""));
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await sessionSelect.selectOption(String(fixture.sessionId || ""));
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return Boolean(window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.());
      });
    })
    .toBeTruthy();
}

async function ensureSidebarOpen(page) {
  const openBtn = page.getByRole("button", { name: "Открыть панель" });
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click();
  }
}

async function selectElementForDetails(page, elementId = "Task_1") {
  const selected = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const element = modeler.get("elementRegistry").get(String(targetId || "Task_1"));
      if (!element) return { ok: false, error: "element_missing" };
      const selection = modeler.get("selection");
      selection?.select?.(element);
      modeler.get("eventBus")?.fire?.("element.click", { element });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, elementId);
  expect(selected.ok, JSON.stringify(selected)).toBeTruthy();
}

test("robot meta: save and survive reload", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    runId,
    auth.headers,
    seedXml({ processName: `RobotMeta ${runId}`, taskName: "Robot Task" }),
  );
  const sid = String(fixture.sessionId || "").trim();
  expect(sid).not.toBe("");

  let patchMetaOkCount = 0;
  page.on("response", (res) => {
    try {
      const url = new URL(res.url());
      if (
        res.request().method() === "PATCH"
        && url.pathname === `/api/sessions/${sid}/bpmn_meta`
        && res.status() === 200
      ) {
        patchMetaOkCount += 1;
      }
    } catch {
      // ignore parse issues
    }
  });

  await uiLogin(page);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await ensureSidebarOpen(page);
  await selectElementForDetails(page, "Task_1");

  await expect(page.getByTestId("robotmeta-mode")).toBeVisible();
  await page.getByTestId("robotmeta-mode").selectOption("machine");
  await page.getByTestId("robotmeta-executor").selectOption("node_red");
  await page.getByTestId("robotmeta-action-key").fill("");
  await expect(page.getByTestId("robotmeta-incomplete-warning")).toBeVisible();

  await page.getByTestId("robotmeta-action-key").fill("robot.mix");
  await page.getByTestId("robotmeta-timeout-sec").fill("45");
  await page.getByTestId("robotmeta-retry-max").fill("3");
  await page.getByTestId("robotmeta-retry-backoff").fill("5");
  await page.getByTestId("robotmeta-from-zone").fill("cold");
  await page.getByTestId("robotmeta-to-zone").fill("heat");
  await page.getByTestId("robotmeta-qc-critical").check();
  await page.getByTestId("robotmeta-save").click();

  await expect.poll(() => patchMetaOkCount).toBeGreaterThan(0);

  const savedMeta = await readSessionBpmnMeta(request, auth.accessToken, sid);
  const row = savedMeta?.robot_meta_by_element_id?.Task_1 || {};
  expect(row?.robot_meta_version).toBe("v1");
  expect(row?.exec?.mode).toBe("machine");
  expect(row?.exec?.executor).toBe("node_red");
  expect(row?.exec?.action_key).toBe("robot.mix");
  expect(row?.mat?.from_zone).toBe("cold");
  expect(row?.mat?.to_zone).toBe("heat");
  expect(Boolean(row?.qc?.critical)).toBeTruthy();

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await ensureSidebarOpen(page);
  await selectElementForDetails(page, "Task_1");

  await expect(page.getByTestId("robotmeta-mode")).toHaveValue("machine");
  await expect(page.getByTestId("robotmeta-executor")).toHaveValue("node_red");
  await expect(page.getByTestId("robotmeta-action-key")).toHaveValue("robot.mix");
  await expect(page.getByTestId("robotmeta-timeout-sec")).toHaveValue("45");
  await expect(page.getByTestId("robotmeta-retry-max")).toHaveValue("3");
  await expect(page.getByTestId("robotmeta-retry-backoff")).toHaveValue("5");
  await expect(page.getByTestId("robotmeta-from-zone")).toHaveValue("cold");
  await expect(page.getByTestId("robotmeta-to-zone")).toHaveValue("heat");
  await expect(page.getByTestId("robotmeta-qc-critical")).toBeChecked();
});
