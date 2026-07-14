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
    data: { title: `E2E Property Project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Property Session ${runId}`,
      roles: ["Lane 1", "Lane 2"],
      start_role: "Lane 1",
    },
  });
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function createSessionInProject(request, authHeaders, projectId, runId) {
  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Property Session B ${runId}`,
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

async function openWorkspaceSession(page, fixture, accessToken) {
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

async function createServiceTaskWithProperty(page, marker) {
  const result = await page.evaluate((prefix) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const moddle = modeler.get("moddle");
      const selection = modeler.get("selection");

      const source = registry.get("Task_1_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")))
        || registry.get("StartEvent_1")
        || (registry.getAll() || []).find((el) => /startevent$/i.test(String(el?.type || "")));
      if (!source) return { ok: false, error: "anchor_source_missing" };

      const root = source.parent;
      const serviceTask = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:ServiceTask" }),
        { x: Number(source.x || 0) + 220, y: Number(source.y || 0) + 20 },
        root,
      );
      modeling.updateLabel(serviceTask, `${prefix}_Service`);

      const bo = serviceTask.businessObject;
      const props = moddle.create("camunda:Properties", {
        values: [
          moddle.create("camunda:Property", { name: "robot.code", value: `${prefix}_R-42` }),
          moddle.create("camunda:Property", { name: "risk", value: "high" }),
        ],
      });
      const ext = moddle.create("bpmn:ExtensionElements", { values: [props] });
      bo.extensionElements = ext;

      selection.select([serviceTask]);
      return { ok: true, taskId: String(serviceTask.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result.taskId || "";
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

test("template property transfer: camunda properties survive save and insert", async ({ page, request }) => {
  test.skip(process.env.E2E_TEMPLATES !== "1", "Set E2E_TEMPLATES=1 to run template property transfer test.");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = `TPLPROP_${runId.slice(-4)}`;
  const templateName = `Property ${marker}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });

  const first = await createProjectAndSession(request, auth.headers, runId);
  const secondSessionId = await createSessionInProject(request, auth.headers, first.projectId, runId);

  await setUiToken(page, auth.accessToken);
  await openWorkspaceSession(page, first, auth.accessToken);
  await assertDiagramReady(page);

  await createServiceTaskWithProperty(page, marker);

  await byTestIds(page, ["btn-add-template", "template-pack-save-open"]).click();
  await expect(byTestIds(page, ["modal-create-template", "template-pack-save-modal"])).toBeVisible();
  await byTestIds(page, ["input-template-name", "template-pack-title-input"]).fill(templateName);
  await byTestIds(page, ["btn-save-template", "template-pack-save-confirm"]).click();
  await expect(page.getByText(new RegExp(`(Saved|Шаблон сохранён): ${templateName}`))).toBeVisible();

  await page.selectOption(".topbar .topSelect--project", first.projectId);
  await expect(page.locator(`.topbar .topSelect--session option[value="${secondSessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", secondSessionId);
  await switchTab(page, "Diagram");
  await assertDiagramReady(page);

  await byTestIds(page, ["btn-templates", "template-pack-insert-open"]).click();
  await expect(byTestIds(page, ["templates-menu-panel", "templates-picker", "template-pack-modal"])).toBeVisible();

  const targetTemplateRow = page
    .locator("[data-testid^='template-item-'], [data-testid^='templates-item-'], [data-testid='template-pack-item']")
    .filter({ hasText: templateName })
    .first();
  await expect(targetTemplateRow).toBeVisible();
  await targetTemplateRow.locator("button").first().click();
  await expect(page.getByRole("button", { name: /Применить в сессию/i }).last()).toBeVisible();

  const putResponse = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await page.getByRole("button", { name: /Применить в сессию/i }).last().click();
  await putResponse;

  await placeFragmentIfNeeded(page);

  await switchTab(page, "XML");
  const xmlText = await page.locator(".xmlEditorTextarea").inputValue();
  expect(xmlText).toContain(`${marker}_Service`);
  expect(xmlText).toContain(`${marker}_R-42`);
  expect(xmlText).toContain('name="risk"');
  expect(xmlText).toContain('value="high"');
});
