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
    data: { title: `E2E subprocess group ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E subprocess group session ${runId}`,
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

test("Interview groups selected steps into subprocess and shows it after tab switch", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.accessToken);
  const sid = fixture.sessionId;
  const names = [`SP_A_${runId.slice(-4)}`, `SP_B_${runId.slice(-4)}`, `SP_C_${runId.slice(-4)}`, `SP_D_${runId.slice(-4)}`];
  const subprocessLabel = `SUBPROC_${runId.slice(-6)}`;

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

  const values = await stepActionValues(page);
  const idxB = values.indexOf(names[1]);
  const idxC = values.indexOf(names[2]);
  const idxD = values.indexOf(names[3]);
  expect(idxB).toBeGreaterThanOrEqual(0);
  expect(idxC).toBeGreaterThanOrEqual(0);
  expect(idxD).toBeGreaterThanOrEqual(0);

  const checks = page.getByTestId("interview-step-select");
  await checks.nth(idxB).check();
  await checks.nth(idxC).check();
  await checks.nth(idxD).check();

  await page.getByTestId("interview-step-more-btn").click();
  await page.locator(".interviewSubprocessInput").fill(subprocessLabel);
  const groupBtn = page.getByTestId("interview-group-subprocess-btn");
  await expect(groupBtn).toBeEnabled();
  const patchBeforeGroup = patchSignals.length;
  await groupBtn.click();
  await expect.poll(() => patchSignals.length).toBeGreaterThan(patchBeforeGroup);

  await expect(page.locator(".interviewSubprocessTag").filter({ hasText: subprocessLabel })).toBeVisible();

  await switchTab(page, "Diagram");
  await waitDiagramReady(page);
  await expect.poll(async () => {
    return await page.evaluate((label) => {
      return Array.from(document.querySelectorAll(".fpcInterviewSubprocessLabel"))
        .some((el) => String(el?.textContent || "").includes(String(label || "")));
    }, subprocessLabel);
  }).toBeTruthy();

  await switchTab(page, "Interview");
  await expect(page.locator(".interviewSubprocessTag").filter({ hasText: subprocessLabel })).toBeVisible();
});
