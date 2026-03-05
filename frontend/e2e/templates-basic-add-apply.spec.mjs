import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

async function apiJson(res, label) {
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  expect(res.ok(), `${label}: status=${res.status()} body=${text}`).toBeTruthy();
  return body;
}

async function createProjectAndSession(request, authHeaders, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: {
      title: `E2E Templates Project ${runId}`,
      passport: {},
    },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Templates Session ${runId}`,
      roles: ["Lane 1", "Lane 2"],
      start_role: "Lane 1",
    },
  });
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openWorkspaceSession(page, fixture) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await page.goto("/app");
  const projectSelect = page.locator(".topbar .topSelect--project");
  await expect(projectSelect).toBeVisible({ timeout: 15000 });
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function assertDiagramReady(page) {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      if (!modeler) return false;
      const registry = modeler.get("elementRegistry");
      return (registry?.getAll?.() || []).length > 0;
    });
  }).toBe(true);
}

async function createTemplateFragmentFromDiagram(page, marker) {
  const result = await page.evaluate((prefix) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const source = registry.get("Task_1_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")))
        || registry.get("StartEvent_1")
        || (registry.getAll() || []).find((el) => /startevent$/i.test(String(el?.type || "")));
      if (!source) return { ok: false, error: "anchor_not_found" };
      const root = source.parent;
      const first = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(source.x || 0) + 220, y: Number(source.y || 0) + 20 },
        root,
      );
      const second = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(source.x || 0) + 430, y: Number(source.y || 0) + 20 },
        root,
      );
      modeling.updateLabel(first, `${prefix}_A`);
      modeling.updateLabel(second, `${prefix}_B`);
      modeling.connect(first, second, { type: "bpmn:SequenceFlow" });
      return { ok: true, ids: [String(first.id || ""), String(second.id || "")] };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result.ids || [];
}

async function selectBpmnElementsById(page, ids) {
  const uniqueIds = Array.from(new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean)));
  expect(uniqueIds.length).toBeGreaterThan(0);
  const first = page.locator(`[data-element-id="${uniqueIds[0]}"]`).first();
  await expect(first).toBeVisible();
  await first.click({ force: true });
  for (let i = 1; i < uniqueIds.length; i += 1) {
    const locator = page.locator(`[data-element-id="${uniqueIds[i]}"]`).first();
    await expect(locator).toBeVisible();
    await locator.click({ force: true, modifiers: ["Shift"] });
  }
}

function byTestIds(page, ids) {
  const selector = ids.map((id) => `[data-testid="${String(id || "").trim()}"]`).join(", ");
  return page.locator(selector).first();
}

test("templates smoke: add from selection and apply restores selection", async ({ page, request }) => {
  test.skip(process.env.E2E_TEMPLATES !== "1", "Set E2E_TEMPLATES=1 to run templates add/apply smoke.");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = `TPLSMK_${runId.slice(-4)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createProjectAndSession(request, auth.headers, runId);

  await setUiToken(page, auth.accessToken);
  await openWorkspaceSession(page, fixture);
  await assertDiagramReady(page);

  const createdIds = await createTemplateFragmentFromDiagram(page, marker);
  expect(createdIds.length).toBe(2);
  const addTemplateButton = byTestIds(page, ["btn-add-template", "template-pack-save-open"]);
  await selectBpmnElementsById(page, createdIds);
  await expect(addTemplateButton).toBeEnabled();
  await expect(addTemplateButton).toContainText("(2)");

  await addTemplateButton.click();
  await expect(byTestIds(page, ["modal-create-template", "template-pack-save-modal"])).toBeVisible();
  await byTestIds(page, ["input-template-name", "template-pack-title-input"]).fill(`Smoke ${marker}`);
  await byTestIds(page, ["btn-save-template", "template-pack-save-confirm"]).click();
  await expect(page.getByText(new RegExp(`(Saved|Шаблон сохранён): Smoke ${marker}`))).toBeVisible();

  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    modeler?.get?.("selection")?.select?.([]);
  });
  await expect(addTemplateButton).toBeDisabled();

  const templatesButton = byTestIds(page, ["btn-templates", "template-pack-insert-open"]);
  await expect(templatesButton).toBeEnabled();
  await templatesButton.click();
  await expect(byTestIds(page, ["templates-picker", "template-pack-modal"])).toBeVisible();
  const targetTemplateRow = page
    .locator("[data-testid^='template-item-'], [data-testid='template-pack-item']")
    .filter({ hasText: `Smoke ${marker}` })
    .first();
  await expect(targetTemplateRow).toBeVisible();
  await targetTemplateRow
    .locator("[data-testid^='btn-apply-template-'], [data-testid='template-pack-insert-after']")
    .first()
    .click();
  await expect(addTemplateButton).toBeEnabled();
  await expect(addTemplateButton).toContainText("(2)");
});
