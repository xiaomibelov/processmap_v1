import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  seedXml,
  switchTab,
} from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function createAndSelectBpmnPair(page, marker) {
  const result = await page.evaluate((prefix) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const selection = modeler.get("selection");
      const elementFactory = modeler.get("elementFactory");
      const anchor = registry.get("Task_1")
        || registry.get("StartEvent_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")));
      if (!anchor) return { ok: false, error: "anchor_missing" };
      const parent = anchor.parent;
      const first = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 220, y: Number(anchor.y || 0) },
        parent,
      );
      const second = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 430, y: Number(anchor.y || 0) },
        parent,
      );
      modeling.updateLabel(first, `${prefix}_Folder_A`);
      modeling.updateLabel(second, `${prefix}_Folder_B`);
      selection.select([first, second]);
      return { ok: true, ids: [String(first.id || ""), String(second.id || "")] };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result.ids || [];
}

test("templates folders smoke: create personal folder and place template under it", async ({ page, request }) => {
  test.skip(process.env.E2E_TEMPLATES !== "1", "Set E2E_TEMPLATES=1 to run templates folders smoke.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = `TPLFD_${runId.slice(-4)}`;
  const templateName = `FolderTemplate_${marker}`;
  const folderName = `Folder_${marker}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    runId,
    auth.headers,
    seedXml({ processName: `Templates folders ${runId}`, taskName: "Task base" }),
  );

  await setUiToken(page, auth.accessToken);
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const createdIds = await createAndSelectBpmnPair(page, marker);
  expect(createdIds.length).toBe(2);

  const addTemplateButton = page.getByTestId("btn-add-template");
  await expect(addTemplateButton).toBeEnabled();
  await addTemplateButton.click();

  const modal = page.getByTestId("modal-create-template");
  await expect(modal).toBeVisible();
  await page.getByTestId("input-template-name").fill(templateName);
  await page.getByTestId("create-template-scope-personal").check();

  page.once("dialog", (dialog) => {
    dialog.accept(folderName).catch(() => {});
  });
  await page.getByTestId("create-template-folder-create").click();
  await expect
    .poll(async () => {
      return await page.getByTestId("create-template-folder-select").locator(`option:text("${folderName}")`).count();
    })
    .toBeGreaterThan(0);
  await page.getByTestId("create-template-folder-select").selectOption({ label: folderName });

  const orgScopeToggle = page.getByTestId("create-template-scope-org");
  if (await orgScopeToggle.isVisible()) {
    const orgDisabled = await orgScopeToggle.isDisabled();
    if (orgDisabled) {
      await expect(page.getByTestId("create-template-folder-create")).toBeDisabled();
    }
  }

  await page.getByTestId("btn-save-template").click();
  await expect(modal).toBeHidden({ timeout: 20000 });

  await page.getByTestId("templates-menu-button").click();
  const panel = page.getByTestId("templates-menu-panel");
  await expect(panel).toBeVisible();
  await page.getByTestId("templates-menu-scope-my").click();
  await panel.getByRole("button", { name: folderName }).first().click();
  await expect(panel.locator("[data-testid^='templates-item-']").filter({ hasText: templateName }).first()).toBeVisible();
});

