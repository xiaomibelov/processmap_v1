import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

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
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
}

async function assertDiagramReady(page) {
  await waitForDiagramReady(page);
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

async function placeFragmentIfNeeded(page) {
  const ghost = page.getByTestId("bpmn-fragment-ghost");
  const host = page.locator(".bpmnStageHost").first();
  await expect(host).toBeVisible();
  let visible = await ghost.isVisible().catch(() => false);
  if (!visible) {
    const probeBox = await host.boundingBox();
    if (probeBox) {
      const px = Number(probeBox.x || 0) + Math.round(Number(probeBox.width || 0) / 2);
      const py = Number(probeBox.y || 0) + Math.round(Number(probeBox.height || 0) / 2);
      await page.mouse.move(px, py);
      visible = await ghost.isVisible().catch(() => false);
    }
  }
  if (!visible) return false;
  const box = await host.boundingBox();
  expect(box).toBeTruthy();
  const x = Number(box.x || 0) + Math.max(80, Math.round(Number(box.width || 0) * 0.55));
  const y = Number(box.y || 0) + Math.max(60, Math.round(Number(box.height || 0) * 0.35));
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await expect
    .poll(async () => {
      return await page.evaluate(() => Boolean(window.__FPC_E2E_TEMPLATE_FRAGMENT_INSERT__?.ok));
    }, { timeout: 10000 })
    .toBeTruthy();
  await expect(ghost).toBeHidden({ timeout: 10000 });
  return true;
}

test("templates smoke: add from selection and apply restores selection", async ({ page, request }) => {
  test.skip(process.env.E2E_TEMPLATES !== "1", "Set E2E_TEMPLATES=1 to run templates add/apply smoke.");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = `TPLSMK_${runId.slice(-4)}`;
  const templateName = `Smoke ${marker}`;
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
  const createTemplateModal = byTestIds(page, ["modal-create-template", "template-pack-save-modal"]);
  await expect(createTemplateModal).toBeVisible();
  await page
    .locator('[data-testid="input-template-name"]:visible, [data-testid="template-pack-title-input"]:visible')
    .first()
    .fill(templateName);
  const saveTemplateButton = page
    .locator('[data-testid="btn-save-template"]:visible, [data-testid="template-pack-save-confirm"]:visible')
    .first();
  await expect(saveTemplateButton).toBeEnabled();
  await saveTemplateButton.click({ force: true });
  await expect(createTemplateModal).toBeHidden({ timeout: 20000 });

  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    modeler?.get?.("selection")?.select?.([]);
  });
  await expect(addTemplateButton).toBeDisabled();

  const templatesButton = byTestIds(page, ["btn-templates", "template-pack-insert-open"]);
  await expect(templatesButton).toBeEnabled();
  await templatesButton.click();
  const templatesPicker = byTestIds(page, ["templates-picker", "template-pack-modal"]);
  await expect(templatesPicker).toBeVisible();
  const targetTemplateRow = page
    .locator("[data-testid^='template-item-'], [data-testid='template-pack-item']")
    .filter({ hasText: templateName })
    .first();
  await expect(targetTemplateRow).toBeVisible();
  await targetTemplateRow
    .locator("[data-testid^='btn-apply-template-'], [data-testid='template-pack-insert-after']")
    .first()
    .click();
  const placed = await placeFragmentIfNeeded(page);
  if (!placed) {
    await expect(addTemplateButton).toBeEnabled();
    await expect(addTemplateButton).toContainText("(2)");
  } else {
    await switchTab(page, "XML");
    const xmlText = await page.locator(".xmlEditorTextarea").inputValue();
    expect(xmlText).toContain(`${marker}_A`);
    expect(xmlText).toContain(`${marker}_B`);
  }
});
