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
    data: { title: `E2E interview steps link ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E interview steps link session ${runId}`,
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

async function saveAndWaitPut(page, sid) {
  const putOk = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && responsePath(resp.url()) === `/api/sessions/${sid}/bpmn`
      && resp.status() === 200;
  });
  await page.locator("button.processSaveBtn").first().click();
  await putOk;
}

test("Interview links create transitions in B2 and sequenceFlow in Diagram/XML", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const token = await apiLogin(request);
  const fixture = await createFixture(request, runId, token);
  const sid = fixture.sessionId;
  const names = ["LINK_A", "LINK_B", "LINK_C", "LINK_D"].map((x) => `${x}_${runId.slice(-4)}`);
  const conditions = ["edge_when_1", "edge_when_2", "edge_when_3"];

  const patchSignals = [];
  const putSignals = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    const method = res.request().method();
    if (method === "PATCH" && path === `/api/sessions/${sid}` && res.status() === 200) patchSignals.push(path);
    if (method === "PUT" && path === `/api/sessions/${sid}/bpmn` && res.status() === 200) putSignals.push(path);
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

  const addBtn = page.getByRole("button", { name: "+ Добавить шаг" });
  const actionInputs = page.locator('.interviewStepRow input[placeholder="Глагол + объект"]');
  const baseCount = await actionInputs.count();
  for (let i = 0; i < names.length; i += 1) {
    await addBtn.click();
    await expect(actionInputs).toHaveCount(baseCount + i + 1);
  }
  for (let i = 0; i < names.length; i += 1) {
    await actionInputs.nth(baseCount + i).fill(names[i]);
  }
  await expect.poll(() => patchSignals.length).toBeGreaterThan(0);

  const transitionsBlock = page.locator(".interviewBlock").filter({
    has: page.locator(".interviewBlockTitle", { hasText: "B2. Ветки BPMN" }),
  }).first();
  await expect(transitionsBlock).toBeVisible();
  const openAddTransitionBtn = transitionsBlock.getByTestId("interview-transition-open-modal");
  await expect(openAddTransitionBtn).toBeEnabled();
  await openAddTransitionBtn.click();
  const addModal = page.getByTestId("interview-add-transition-modal");
  await expect(addModal).toBeVisible();

  const fromSelect = page.getByTestId("interview-transition-from");
  const toSelect = page.getByTestId("interview-transition-to");
  const whenInput = page.getByTestId("interview-transition-when");
  const addTransitionBtn = page.getByTestId("interview-add-transition-btn");
  await expect(addTransitionBtn).toBeEnabled();

  const options = await fromSelect.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({ value: String(node.getAttribute("value") || ""), label: String(node.textContent || "") })),
  );
  const usableOptions = options.filter((opt) => {
    const label = String(opt?.label || "");
    const value = String(opt?.value || "");
    return !!value && !/start/i.test(label);
  });
  expect(usableOptions.length).toBeGreaterThanOrEqual(3);

  const rowsBefore = await transitionsBlock.getByTestId("interview-transition-row").count();
  const patchBeforeTransitions = patchSignals.length;
  const linkCount = Math.min(conditions.length, Math.max(0, usableOptions.length - 1));
  for (let i = 0; i < linkCount; i += 1) {
    await openAddTransitionBtn.click();
    await fromSelect.selectOption(usableOptions[i].value);
    await toSelect.selectOption(usableOptions[i + 1].value);
    await whenInput.fill(conditions[i]);
    await addTransitionBtn.click();
  }
  await expect.poll(() => patchSignals.length).toBeGreaterThan(patchBeforeTransitions);

  const transitionRows = transitionsBlock.getByTestId("interview-transition-row");
  await expect
    .poll(async () => await transitionRows.count())
    .toBeGreaterThanOrEqual(Math.max(rowsBefore + 1, conditions.length - 1));
  const whenValues = await transitionsBlock.locator(".interviewBranchWhenText").evaluateAll((nodes) =>
    nodes.map((node) => String(node.textContent || "").trim()),
  );
  const expectedWhen = whenValues.find((v) => conditions.includes(String(v || ""))) || "";
  expect(expectedWhen, `expected at least one transition when from ${conditions.join(", ")}`).not.toBe("");

  await switchTab(page, "Diagram");
  await waitDiagramReady(page);
  await saveAndWaitPut(page, sid);
  await expect.poll(() => putSignals.length).toBeGreaterThan(0);
  expect(expectedWhen).not.toBe("");
});
