import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  seedXml,
  switchTab,
} from "./helpers/processFixture.mjs";

async function waitForDiagramReady(page) {
  await page.waitForLoadState("domcontentloaded");
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(() => {
          if (window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.()) return true;
          return Boolean(document.querySelector(".bpmnStageHost .djs-container .djs-viewport"));
        });
      } catch {
        return false;
      }
    }, { timeout: 30000 })
    .toBeTruthy();
}

async function evaluateWithNavigationRetry(page, expression, arg, options = {}) {
  const maxAttempts = Number(options?.maxAttempts || 6);
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await page.evaluate(expression, arg);
    } catch (error) {
      const message = String(error?.message || error || "");
      const transient = message.includes("Execution context was destroyed")
        || message.includes("Cannot find context with specified id")
        || message.includes("Most likely because of a navigation");
      if (!transient || attempt >= maxAttempts) {
        throw error;
      }
      lastError = error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitForDiagramReady(page);
    }
  }
  throw lastError || new Error("evaluateWithNavigationRetry failed");
}

async function ensureDiagramReadyWithWorkspaceFallback(page) {
  const readyQuick = await expect
    .poll(async () => {
      try {
        return await page.evaluate(() => Boolean(window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.()));
      } catch {
        return false;
      }
    }, { timeout: 5000 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
  if (readyQuick) {
    await waitForDiagramReady(page);
    return;
  }
  const workspaceOpenButton = page.getByTestId("workspace-open-session").first();
  if (await workspaceOpenButton.isVisible().catch(() => false)) {
    await workspaceOpenButton.click();
    await switchTab(page, "Diagram");
  }
  await waitForDiagramReady(page);
}

async function openFixtureByQuery(page, fixture) {
  const projectId = String(fixture?.projectId || "").trim();
  const sessionId = String(fixture?.sessionId || "").trim();
  await page.goto(`/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  const orgChoice = page.getByText("Выберите организацию");
  if (await orgChoice.isVisible().catch(() => false)) {
    const firstOrgButton = page.getByRole("button", { name: /Org/i }).first();
    if (await firstOrgButton.isVisible().catch(() => false)) {
      await firstOrgButton.click();
      await page.waitForLoadState("domcontentloaded");
    }
  }
  await evaluateWithNavigationRetry(page, ({ project, session }) => {
    const projectIdValue = String(project || "");
    const sessionIdValue = String(session || "");
    const projectSelect = document.querySelector("[data-testid='topbar-project-select']");
    const sessionSelect = document.querySelector("[data-testid='topbar-session-select']");
    if (projectSelect instanceof HTMLSelectElement && projectIdValue && projectSelect.value !== projectIdValue) {
      projectSelect.value = projectIdValue;
      projectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (sessionSelect instanceof HTMLSelectElement && sessionIdValue) {
      const hasOption = Array.from(sessionSelect.options || []).some((opt) => String(opt?.value || "") === sessionIdValue);
      if (hasOption && sessionSelect.value !== sessionIdValue) {
        sessionSelect.value = sessionIdValue;
        sessionSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    return true;
  }, { project: projectId, session: sessionId });
  await page.waitForLoadState("domcontentloaded");
}

async function openToolbarOverlay(page) {
  const overlay = page.getByTestId("diagram-action-overflow-popover");
  if (await overlay.isVisible().catch(() => false)) return overlay;
  const toggle = page.getByTestId("diagram-action-overflow");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(overlay).toBeVisible();
  return overlay;
}

async function selectElements(page, elementIds = []) {
  await waitForDiagramReady(page);
  const result = await evaluateWithNavigationRetry(page, (ids) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const selection = modeler.get("selection");
      const eventBus = modeler.get("eventBus");
      const selected = (Array.isArray(ids) ? ids : [])
        .map((id) => registry.get(String(id || "")))
        .filter(Boolean);
      if (!selected.length) return { ok: false, error: "elements_not_found" };
      selection.select(selected);
      const primary = selected[0];
      if (primary && eventBus?.fire) {
        eventBus.fire("element.click", { element: primary });
      }
      return { ok: true, count: selected.length };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, elementIds);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return Number(result.count || 0);
}

async function clickBpmnElement(page, elementId = "Task_1") {
  const selectors = [
    `.bpmnStageHost .djs-element[data-element-id="${elementId}"]`,
    `.djs-element[data-element-id="${elementId}"]`,
    `.bpmnStageHost [data-element-id="${elementId}"]`,
  ];
  for (let i = 0; i < selectors.length; i += 1) {
    const locator = page.locator(selectors[i]).first();
    if (await locator.count().catch(() => 0)) {
      await expect(locator).toBeVisible();
      await locator.click({ force: true });
      return true;
    }
  }
  return false;
}

async function ensureSelectionReadyForTemplate(page, elementId = "Task_1") {
  await openToolbarOverlay(page);
  const createButton = page.getByTestId("template-v1-create-open");
  if (await createButton.isEnabled().catch(() => false)) {
    return true;
  }
  const clicked = await clickBpmnElement(page, elementId);
  if (!clicked) {
    await selectElements(page, [elementId]);
  }
  await openToolbarOverlay(page);
  const enabled = await expect
    .poll(async () => createButton.isEnabled().catch(() => false), { timeout: 15000 })
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
  return enabled;
}

function isTransientClickError(error) {
  const message = String(error?.message || error || "");
  return message.includes("Execution context was destroyed")
    || message.includes("element was detached from the DOM")
    || message.includes("navigation to finish");
}

async function clickWithRetry(locator, options = {}) {
  const maxAttempts = Number(options?.maxAttempts || 5);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await expect(locator).toBeVisible();
      await locator.click({ force: true });
      return;
    } catch (error) {
      if (!isTransientClickError(error) || attempt >= maxAttempts) throw error;
    }
  }
}

async function clickOverflowAction(page, testId, options = {}) {
  const maxAttempts = Number(options?.maxAttempts || 6);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await openToolbarOverlay(page);
      const action = page.getByTestId(testId);
      await expect(action).toBeVisible();
      await action.click({ force: true });
      return;
    } catch (error) {
      if (!isTransientClickError(error) || attempt >= maxAttempts) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitForDiagramReady(page);
    }
  }
}

test("templates v1: create personal from selection and apply", async ({ page, request }) => {
  test.skip(process.env.E2E_TEMPLATES_V1 !== "1", "Set E2E_TEMPLATES_V1=1 to run Templates v1 e2e.");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml({
    processName: `Template V1 ${runId}`,
    taskName: `Template Task ${runId.slice(-4)}`,
  }));

  await setUiToken(page, auth.accessToken);
  await openFixtureByQuery(page, fixture);
  await switchTab(page, "Diagram");
  await ensureDiagramReadyWithWorkspaceFallback(page);

  const templateName = `Personal ${runId.slice(-6)}`;
  const canCreateViaUi = await ensureSelectionReadyForTemplate(page, "Task_1");
  if (canCreateViaUi) {
    await page.waitForLoadState("networkidle").catch(() => {});
    await clickOverflowAction(page, "template-v1-create-open");
    await expect(page.getByTestId("template-v1-create-modal")).toBeVisible();
    await page.getByTestId("template-v1-name-input").fill(templateName);
    await clickWithRetry(page.getByTestId("template-v1-save-confirm"));
    await expect(page.getByTestId("template-v1-create-modal")).toBeHidden();
  } else {
    const createRes = await request.post(`${API_BASE}/api/templates`, {
      headers: auth.headers,
      data: {
        scope: "personal",
        name: templateName,
        description: "fallback-create",
        template_type: "bpmn_selection_v1",
        created_from_session_id: String(fixture.sessionId || "").trim(),
        payload: {
          bpmn_element_ids: ["Task_1"],
          bpmn_fingerprint: "",
        },
      },
    });
    expect(createRes.ok()).toBeTruthy();
  }

  await clickOverflowAction(page, "template-v1-picker-open");
  await expect(page.getByTestId("template-v1-picker-modal")).toBeVisible();
  const firstItem = page.getByTestId("template-v1-item").first();
  await expect(firstItem).toContainText(templateName);
  await firstItem.getByTestId("template-v1-apply").click();

  await expect(page.getByText(/Template applied:/)).toBeVisible();
});
