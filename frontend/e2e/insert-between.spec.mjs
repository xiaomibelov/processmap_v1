import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

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

async function createFixture(request, runId, token) {
  const authHeaders = { Authorization: `Bearer ${token}` };
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: { title: `E2E insert-between ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E insert-between session ${runId}`,
        roles: ["Линия A", "Линия B"],
        start_role: "Линия A",
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

test("Diagram insert-between replaces selected flow atomically and persists", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const login = await apiLogin(request);
  const fixture = await createFixture(request, runId, login.accessToken);
  const sid = fixture.sessionId;
  const insertedName = `INS_DIAG_${runId.slice(-4)}`;

  const putSignals = [];
  page.on("response", (res) => {
    if (
      res.request().method() === "PUT"
      && responsePath(res.url()) === `/api/sessions/${sid}/bpmn`
      && res.status() === 200
    ) {
      putSignals.push(res.url());
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
    window.localStorage.setItem("fpc_debug_trace", "1");
    window.localStorage.setItem("fpc_debug_ai_ops", "1");
  });
  await setUiToken(page, login.accessToken);

  await openFixture(page, fixture);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);

  let beforeData = null;
  await expect.poll(async () => {
    beforeData = await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      if (!modeler) return { ready: false };
      const registry = modeler.get("elementRegistry");
      const flows = (registry.filter?.((el) => el.type === "bpmn:SequenceFlow") || []);
      const tasks = (registry.filter?.((el) => el.type === "bpmn:Task") || []);
      const firstFlow = flows[0] || null;
      return {
        ready: !!firstFlow,
        flowCount: flows.length,
        taskCount: tasks.length,
        flowId: String(firstFlow?.id || ""),
        fromId: String(firstFlow?.source?.id || ""),
        toId: String(firstFlow?.target?.id || ""),
      };
    });
    return beforeData?.ready === true;
  }).toBe(true);

  expect(String(beforeData.flowId || "")).not.toBe("");

  await page.evaluate((flowId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const flow = modeler?.get?.("elementRegistry")?.get?.(flowId);
    if (!flow) return;
    modeler.get("selection").select([flow]);
  }, beforeData.flowId);

  const insertOpenBtn = page.getByTestId("diagram-canvas-insert-between");
  await expect(insertOpenBtn).toBeVisible();
  await expect(insertOpenBtn).toBeEnabled();
  await insertOpenBtn.click();

  const modal = page.getByTestId("diagram-insert-between-modal");
  await expect(modal).toBeVisible();
  await page.getByTestId("diagram-insert-between-name").fill(insertedName);
  const putOk = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && responsePath(resp.url()) === `/api/sessions/${sid}/bpmn`
      && resp.status() === 200;
  });
  await page.getByTestId("diagram-insert-between-confirm").click();
  await putOk;
  await expect(modal).toHaveCount(0);
  await expect.poll(() => putSignals.length).toBeGreaterThan(0);

  const after = await page.evaluate((payload) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_not_ready" };
    const registry = modeler.get("elementRegistry");
    const tasks = (registry.filter?.((el) => el.type === "bpmn:Task") || []);
    const flows = (registry.filter?.((el) => el.type === "bpmn:SequenceFlow") || []);
    const oldFlowExists = !!registry.get(payload.oldFlowId);
    const insertedTask = tasks.find((el) => String(el?.businessObject?.name || "") === String(payload.insertedName || ""));
    return {
      ok: true,
      flowCount: flows.length,
      taskCount: tasks.length,
      oldFlowExists,
      insertedTaskId: String(insertedTask?.id || ""),
    };
  }, { oldFlowId: beforeData.flowId, insertedName });

  expect(after.ok, JSON.stringify(after)).toBeTruthy();
  expect(after.oldFlowExists).toBeFalsy();
  expect(after.flowCount).toBe(beforeData.flowCount + 1);
  expect(after.taskCount).toBe(beforeData.taskCount + 1);
  expect(after.insertedTaskId).not.toBe("");

  await switchTab(page, "XML");
  const xmlValue = await page.locator(".xmlEditorTextarea").first().inputValue();
  expect(xmlValue.includes(insertedName), "inserted task should be present in XML").toBeTruthy();

  await switchTab(page, "Diagram");
  await waitDiagramReady(page);
  const stillThere = await page.evaluate((name) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return false;
    const registry = modeler.get("elementRegistry");
    const tasks = registry.filter?.((el) => el.type === "bpmn:Task") || [];
    return tasks.some((el) => String(el?.businessObject?.name || "") === String(name || ""));
  }, insertedName);
  expect(stillThere).toBeTruthy();
});
