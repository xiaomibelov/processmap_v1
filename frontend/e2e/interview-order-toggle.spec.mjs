import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function responsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

async function apiJson(res, opLabel) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  expect(res.ok(), `${opLabel}: ${txt}`).toBeTruthy();
  return body;
}

async function createFixture(request, runId, accessToken) {
  const authHeaders = withAuthHeaders(accessToken);
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: { title: `E2E interview order ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E interview order session ${runId}`,
        roles: ["Лайн A", "Лайн B"],
        start_role: "Лайн A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  const expected = String(title || "").trim().toLowerCase();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const active = await page.evaluate(
      () => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase(),
    );
    if (active === expected) return;
    await btn.click();
    const next = await page.evaluate(
      () => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase(),
    );
    if (next === expected) return;
  }
  await expect
    .poll(async () => {
      return await page.evaluate(
        () => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase(),
      );
    })
    .toBe(expected);
}

async function openFixture(page, fixture) {
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
}

async function waitDiagramReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return { ok: false, registryCount: 0, svgRect: "0x0" };
        const registry = modeler.get("elementRegistry");
        const all = registry?.getAll?.() || [];
        const canvas = modeler.get("canvas");
        const svg = canvas?._container?.querySelector?.("svg");
        const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
        const w = Math.round(Number(rect.width || 0));
        const h = Math.round(Number(rect.height || 0));
        return { ok: all.length > 0 && w > 0 && h > 0, registryCount: all.length, svgRect: `${w}x${h}` };
      });
    })
    .toMatchObject({ ok: true });
}

async function stepActionValues(page) {
  return await page.locator('.interviewStepRow input[placeholder="Глагол + объект"]')
    .evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
}

async function addQuickSteps(page, names) {
  const actionInputs = page.locator('.interviewStepRow input[placeholder="Глагол + объект"]');
  const quickInput = page.locator(".interviewQuickStepInput");
  await expect(quickInput).toBeVisible();
  for (const name of names) {
    const before = await actionInputs.count();
    await quickInput.fill(name);
    await quickInput.press("Enter");
    await expect(actionInputs).toHaveCount(before + 1);
  }
}

test("Interview order toggle enables manual reorder and keeps order across tabs", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.accessToken);
  const sid = fixture.sessionId;
  const names = [`ORDER_A_${runId.slice(-4)}`, `ORDER_B_${runId.slice(-4)}`, `ORDER_C_${runId.slice(-4)}`];

  const patchSignals = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    if (res.request().method() === "PATCH" && path === `/api/sessions/${sid}` && res.status() === 200) {
      patchSignals.push(path);
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_trace", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken);

  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();

  await addQuickSteps(page, names);
  await expect.poll(() => patchSignals.length).toBeGreaterThan(0);

  const before = await stepActionValues(page);
  const idxA = before.indexOf(names[0]);
  const idxB = before.indexOf(names[1]);
  const idxC = before.indexOf(names[2]);
  expect(idxA).toBeGreaterThanOrEqual(0);
  expect(idxB).toBeGreaterThan(idxA);
  expect(idxC).toBeGreaterThan(idxB);

  await page.getByTestId("interview-order-interview-btn").click();
  const rowForC = page.locator(".interviewStepRow").nth(idxC);
  await rowForC.getByRole("button", { name: "↑" }).click();

  await expect.poll(async () => {
    const values = await stepActionValues(page);
    return values.indexOf(names[2]) < values.indexOf(names[1]);
  }).toBeTruthy();

  await switchTab(page, "Diagram");
  await waitDiagramReady(page);
  await switchTab(page, "Interview");

  await expect.poll(async () => {
    const values = await stepActionValues(page);
    return values.indexOf(names[2]) < values.indexOf(names[1]);
  }).toBeTruthy();

  await page.getByTestId("interview-order-bpmn-btn").click();
  const afterReorder = await stepActionValues(page);
  const idxBNow = afterReorder.indexOf(names[1]);
  if (idxBNow > 0 && idxBNow < afterReorder.length - 1) {
    const upBtn = page.locator(".interviewStepRow").nth(idxBNow).getByRole("button", { name: "↑" });
    await expect(upBtn).toBeDisabled();
  }
});
