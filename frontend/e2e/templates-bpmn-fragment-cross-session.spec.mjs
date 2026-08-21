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

async function createProjectAndSession(request, authHeaders, runId, titleSuffix) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: {
      title: `E2E Fragment Project ${runId}`,
      passport: {},
    },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Fragment Session ${titleSuffix}`,
      roles: ["Lane 1", "Lane 2"],
      start_role: "Lane 1",
    },
  });
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function createSessionInProject(request, authHeaders, projectId, titleSuffix) {
  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Fragment Session ${titleSuffix}`,
      roles: ["Lane 1", "Lane 2"],
      start_role: "Lane 1",
    },
  });
  const session = await apiJson(sessionRes, "create second session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return sessionId;
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

function byTestIds(page, ids) {
  const selector = ids.map((id) => `[data-testid="${String(id || "").trim()}"]`).join(", ");
  return page.locator(selector).first();
}

async function resolveAddTemplateButton(page) {
  const direct = byTestIds(page, ["btn-add-template", "template-pack-save-open"]);
  if (await direct.isVisible().catch(() => false)) {
    return { button: direct, via: "direct" };
  }
  const overflowToggle = page.getByTestId("diagram-action-overflow").first();
  await expect(overflowToggle).toBeVisible();
  await overflowToggle.click();
  const overflowButton = page.getByRole("button", { name: /Добавить шаблон/i }).first();
  await expect(overflowButton).toBeVisible();
  return { button: overflowButton, via: "overflow" };
}

async function closeOverflowIfOpen(page) {
  const popover = page.getByTestId("diagram-action-overflow-popover");
  const isOpen = await popover.isVisible().catch(() => false);
  if (!isOpen) return;
  const overflowToggle = page.getByTestId("diagram-action-overflow").first();
  if (await overflowToggle.isVisible().catch(() => false)) {
    await overflowToggle.click();
  }
}

async function resolveTemplatesButton(page) {
  const direct = byTestIds(page, ["btn-templates", "template-pack-insert-open"]);
  if (await direct.isVisible().catch(() => false)) {
    return { button: direct, via: "direct" };
  }
  const overflowToggle = page.getByTestId("diagram-action-overflow").first();
  await expect(overflowToggle).toBeVisible();
  await overflowToggle.click();
  const overflowButton = page.getByRole("button", { name: /Шаблоны|Templates/i }).first();
  await expect(overflowButton).toBeVisible();
  return { button: overflowButton, via: "overflow" };
}

async function openWorkspaceSession(page, fixture) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
}

async function createAndSelectFragment(page, marker) {
  const result = await page.evaluate((prefix) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const selection = modeler.get("selection");
      const source = registry.get("Task_1_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")))
        || registry.get("StartEvent_1")
        || (registry.getAll() || []).find((el) => /startevent$/i.test(String(el?.type || "")));
      if (!source) return { ok: false, error: "source_missing" };
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
      selection.select([first, second]);
      return {
        ok: true,
        firstId: String(first.id || ""),
        secondId: String(second.id || ""),
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

test("templates bpmn fragment: save in session A and place in session B", async ({ page, request }) => {
  test.skip(process.env.E2E_TEMPLATES !== "1", "Set E2E_TEMPLATES=1 to run BPMN fragment cross-session smoke.");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = `FRG_${runId.slice(-4)}`;
  const templateName = `Fragment ${marker}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const first = await createProjectAndSession(request, auth.headers, runId, "A");
  const secondSessionId = await createSessionInProject(request, auth.headers, first.projectId, "B");

  await setUiToken(page, auth.accessToken);
  await openWorkspaceSession(page, first);
  await createAndSelectFragment(page, marker);

  const addTemplateAction = await resolveAddTemplateButton(page);
  await addTemplateAction.button.click();
  await expect(page.getByTestId("modal-create-template")).toBeVisible();
  await page.getByTestId("input-template-name").fill(templateName);
  await page.getByTestId("btn-save-template").click();
  await expect(page.getByTestId("modal-create-template")).toBeHidden({ timeout: 20000 });
  await closeOverflowIfOpen(page);

  await openWorkspaceSession(page, { projectId: first.projectId, sessionId: secondSessionId });

  const templatesAction = await resolveTemplatesButton(page);
  await templatesAction.button.click();
  await expect(page.getByTestId("templates-menu-panel")).toBeVisible();
  const templateRow = page.locator("[data-testid^='template-item-']").filter({ hasText: templateName }).first();
  await expect(templateRow).toBeVisible();
  await templateRow.locator("button").first().click();
  const applyFooter = page.getByRole("button", { name: /Применить в сессию/i }).last();
  await expect(applyFooter).toBeVisible();
  const putResponse = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await applyFooter.click();
  await expect
    .poll(async () => {
      return await page.evaluate(() => window.__FPC_E2E_TEMPLATE_FRAGMENT_INSERT__ || null);
    }, { timeout: 10000 })
    .not.toBeNull();
  await putResponse;
  await expect
    .poll(async () => {
      return await page.evaluate(() => Boolean(window.__FPC_E2E_TEMPLATE_FRAGMENT_INSERT__?.ok));
    }, { timeout: 10000 })
    .toBeTruthy();
  await expect(page.getByTestId("bpmn-fragment-ghost")).toBeHidden({ timeout: 10000 });

  await switchTab(page, "XML");
  const xmlText = await page.locator(".xmlEditorTextarea").inputValue();
  expect(xmlText).toContain(`${marker}_A`);
  expect(xmlText).toContain(`${marker}_B`);

  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await page.reload();
  await waitForDiagramReady(page);
  await switchTab(page, "XML");
  const xmlReloaded = await page.locator(".xmlEditorTextarea").inputValue();
  expect(xmlReloaded).toContain(`${marker}_A`);
  expect(xmlReloaded).toContain(`${marker}_B`);
});
