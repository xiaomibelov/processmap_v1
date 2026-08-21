import { expect, test } from "@playwright/test";

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

async function apiLogin(request) {
  const email = process.env.E2E_ADMIN_EMAIL || "admin@local";
  const password = process.env.E2E_ADMIN_PASSWORD || "admin";
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email, password },
  });
  const body = await apiJson(res, "auth login");
  const token = String(body?.access_token || "").trim();
  expect(token).not.toBe("");
  return token;
}

async function createFixture(request, runId, token) {
  const authHeaders = { Authorization: `Bearer ${token}` };
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: { title: `E2E interview steps insert-between ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E interview steps insert-between session ${runId}`,
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
    const active = await page.evaluate(() => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase());
    if (active === expected) return;
    await btn.click();
    const next = await page.evaluate(() => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase());
    if (next === expected) return;
  }
  await expect
    .poll(async () => {
      return await page.evaluate(() => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase());
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

test("Interview insert-between and delete keeps transitions/diagram consistent", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const token = await apiLogin(request);
  const fixture = await createFixture(request, runId, token);
  const sid = fixture.sessionId;
  const stepA = `INS_A_${runId.slice(-4)}`;
  const stepB = `INS_B_${runId.slice(-4)}`;
  const stepC = `INS_C_${runId.slice(-4)}`;

  const patchSignals = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    const method = res.request().method();
    if (method === "PATCH" && path === `/api/sessions/${sid}` && res.status() === 200) patchSignals.push(path);
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
    window.localStorage.setItem("fpc_debug_trace", "1");
  });
  await page.addInitScript((accessToken) => {
    window.localStorage.setItem("fpc_auth_access_token", String(accessToken || ""));
  }, token);

  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();

  const actionInputs = page.locator('.interviewStepRow input[placeholder="Глагол + объект"]');
  const baseStepCount = await actionInputs.count();
  const addBtn = page.getByRole("button", { name: "+ Добавить шаг" });
  await addBtn.click();
  await expect(actionInputs).toHaveCount(baseStepCount + 1);
  await addBtn.click();
  await expect(actionInputs).toHaveCount(baseStepCount + 2);
  await actionInputs.nth(baseStepCount).fill(stepA);
  await actionInputs.nth(baseStepCount + 1).fill(stepB);
  await expect(actionInputs).toHaveCount(baseStepCount + 2);
  await expect.poll(() => patchSignals.length).toBeGreaterThan(0);

  const transitionsBlock = page.locator(".interviewBlock").filter({
    has: page.locator(".interviewBlockTitle", { hasText: "B2. Ветки BPMN" }),
  }).first();
  await expect(transitionsBlock).toBeVisible();
  const openAddTransitionBtn = transitionsBlock.getByTestId("interview-transition-open-modal");
  const fromSelect = page.getByTestId("interview-transition-from");
  const toSelect = page.getByTestId("interview-transition-to");
  const whenInput = page.getByTestId("interview-transition-when");
  const addTransitionBtn = page.getByTestId("interview-add-transition-btn");

  await openAddTransitionBtn.click();
  const options = await fromSelect.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({ value: String(node.getAttribute("value") || ""), label: String(node.textContent || "") })),
  );
  const fromValue = String(options.find((x) => x.label.includes(stepA))?.value || "");
  const toValue = String(options.find((x) => x.label.includes(stepB))?.value || "");
  expect(fromValue).not.toBe("");
  expect(toValue).not.toBe("");

  const transitionsBefore = await transitionsBlock.getByTestId("interview-transition-row").count();
  await fromSelect.selectOption(fromValue);
  await toSelect.selectOption(toValue);
  await whenInput.fill("between_when");
  await addTransitionBtn.click();
  await expect
    .poll(async () => await transitionsBlock.getByTestId("interview-transition-row").count())
    .toBeGreaterThanOrEqual(Math.max(transitionsBefore + 1, 1));

  const insertBetweenBtn = transitionsBlock.getByTestId("interview-insert-between-btn").first();
  await expect(insertBetweenBtn).toBeVisible();
  await insertBetweenBtn.click();
  const insertRow = transitionsBlock.getByTestId("interview-insert-between-row");
  await expect(insertRow).toBeVisible();
  await insertRow.getByTestId("interview-insert-between-title").fill(stepC);
  const patchBeforeInsert = patchSignals.length;
  await insertRow.getByTestId("interview-insert-between-confirm").click();
  await expect(insertRow).toHaveCount(0);
  await expect.poll(() => patchSignals.length).toBeGreaterThan(patchBeforeInsert);

  await expect(actionInputs).toHaveCount(baseStepCount + 3);
  const valuesAfterInsert = await actionInputs.evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
  expect(valuesAfterInsert.includes(stepC)).toBeTruthy();

  const transitionsAfterInsert = transitionsBlock.getByTestId("interview-transition-row");
  await expect
    .poll(async () => await transitionsAfterInsert.count())
    .toBeGreaterThanOrEqual(Math.max(transitionsBefore + 1, 2));
  const valuesBeforeDelete = await actionInputs.evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
  const deleteRowIndex = valuesBeforeDelete.findIndex((value) => String(value || "") === stepC);
  expect(deleteRowIndex, `missing step '${stepC}' before delete`).toBeGreaterThanOrEqual(0);
  const rowToDelete = page.locator(".interviewStepRow").nth(deleteRowIndex);
  await expect(rowToDelete).toBeVisible();
  const patchBeforeDelete = patchSignals.length;
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await rowToDelete.getByTestId("interview-step-more-actions").click();
  await rowToDelete.getByTestId("interview-step-delete-action").click();
  await expect.poll(() => patchSignals.length).toBeGreaterThan(patchBeforeDelete);
  await expect
    .poll(async () => {
      const values = await actionInputs.evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
      return values.includes(stepC);
    })
    .toBeFalsy();
  await expect(transitionsBlock).not.toContainText(stepC);

  await switchTab(page, "Diagram");
  await waitDiagramReady(page);
  const diagramAfterDelete = await page.evaluate((insertedLabel) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, hasTask: false, badEdges: 0 };
    const registry = modeler.get("elementRegistry");
    const tasks = (registry.filter?.((el) => el.type === "bpmn:Task") || []);
    const edges = (registry.filter?.((el) => el.type === "bpmn:SequenceFlow") || []);
    const hasTask = tasks.some((el) => String(el?.businessObject?.name || "").includes(String(insertedLabel)));
    const badEdges = edges.filter((el) => {
      const src = String(el?.source?.businessObject?.name || "");
      const dst = String(el?.target?.businessObject?.name || "");
      return src.includes(String(insertedLabel)) || dst.includes(String(insertedLabel));
    }).length;
    return { ok: true, hasTask, badEdges };
  }, stepC);
  expect(diagramAfterDelete.ok, JSON.stringify(diagramAfterDelete)).toBeTruthy();
  expect(diagramAfterDelete.hasTask).toBeFalsy();
  expect(diagramAfterDelete.badEdges).toBe(0);
});
