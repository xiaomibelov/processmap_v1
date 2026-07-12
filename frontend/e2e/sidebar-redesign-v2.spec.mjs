import { expect, test } from "@playwright/test";

import {
  bootDiagram,
  collectConsoleProblems,
  ensureSidebarOpen,
  fetchBpmnXml,
  openPropertiesSection,
  saveAll,
  selectTask,
  settleOrgChooser,
  taskBlock,
} from "./helpers/sidebarRedesignBoot.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Sidebar redesign v2 (feature/sidebar-redesign-v2).
//
// Focused coverage on top of the reused property-panel-redesign spec:
// 1. reference quick-property set (ee_time + ingredient group + equipment)
//    surfaces in the Quick block and in the overlay chips;
// 2. extension-state mini indicator lives in the ACCORDION HEADER (G1) and
//    flips saved -> dirty on an inline edit;
// 3. add -> edit -> save -> reload -> delete roundtrip through the global
//    save pipeline (XML truth), incl. chip visibility after reload.

const PROCESS_ID = "Process_srv2";
const TASK_A = "Task_srv2A";

function seedXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${PROCESS_ID}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="${TASK_A}" name="Task A">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="0.33" />
          <camunda:property name="ingredient_value" value="5" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="${TASK_A}" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="${TASK_A}" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${PROCESS_ID}">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="120" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_A}" bpmnElement="${TASK_A}"><dc:Bounds x="260" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1"><dc:Bounds x="460" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="156" y="170" /><di:waypoint x="260" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="380" y="170" /><di:waypoint x="460" y="170" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function propertiesHead(page) {
  return page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
}

function headerMiniIndicator(page) {
  return propertiesHead(page).locator('.sidebarAccordionHeaderRight [data-testid="extension-state-mini"]');
}

// --- Scenario 1 (G2): reference quick set in Quick block + chips -------------

test("reference quick set: 5 quick rows + matching overlay chips", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `srv2_quick_${runId}`, seedXml());

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  // Quick block renders one row per default quick name (filled or empty).
  const quickBlock = page.locator('[data-testid="camunda-properties-group"] .sidebarPropertiesBlock--primary');
  await expect(quickBlock).toBeVisible({ timeout: 15_000 });
  for (const name of ["ee_time", "ingredient", "ingredient_um", "ingredient_value", "equipment"]) {
    await expect(quickBlock).toContainText(name);
  }

  // Same reference set is offered as overlay chips.
  for (const name of ["ee_time", "ingredient", "ingredient_um", "ingredient_value", "equipment"]) {
    await expect(page.locator(`[data-testid="overlay-field-chip-${name}"]`)).toBeVisible();
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 2 (G1): mini indicator in the accordion HEADER -----------------

test("save indicator lives in the accordion header: saved -> dirty on edit", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `srv2_mini_${runId}`, seedXml());

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const mini = headerMiniIndicator(page);
  await expect(mini).toBeVisible({ timeout: 15_000 });
  await expect(mini).toHaveAttribute("data-tone", "saved");

  // The indicator is in the head, not in the body content.
  await expect(
    page.locator('.sidebarAccordion[data-section-id="properties"] .sidebarAccordionBody [data-testid="extension-state-mini"]'),
  ).toHaveCount(0);

  // Inline edit -> dirty.
  await page.getByLabel("Редактировать свойство ee_time").click();
  const valueInput = page.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(valueInput).toBeVisible({ timeout: 10_000 });
  await valueInput.fill("0.77");
  await valueInput.press("Enter");
  await expect(mini).toHaveAttribute("data-tone", "dirty", { timeout: 15_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 3 (G4): add -> edit -> save -> reload -> delete ----------------

test("quick property roundtrip: add ingredient -> edit -> save -> reload -> delete", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `srv2_rt_${runId}`, seedXml());

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  // Add: the empty «ingredient» quick row creates the property on commit.
  // Exact labels — «ingredient» is a substring of «ingredient_um»/«ingredient_value».
  const ingredientInput = page.getByLabel("Добавить значение для ingredient", { exact: true });
  await expect(ingredientInput).toBeVisible({ timeout: 15_000 });
  await ingredientInput.fill("Молоко");
  await ingredientInput.press("Enter");
  await expect(page.getByLabel("Редактировать свойство ingredient", { exact: true })).toBeVisible({ timeout: 10_000 });

  // Edit: change the value inline.
  await page.getByLabel("Редактировать свойство ingredient", { exact: true }).click();
  const valueInput = page.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(valueInput).toBeVisible({ timeout: 10_000 });
  await valueInput.fill("Сливки");
  await valueInput.press("Enter");

  // Save + XML truth.
  await saveAll(page);
  await expect
    .poll(async () => taskBlock(await fetchBpmnXml(request, fixture), TASK_A), { timeout: 20_000 })
    .toContain('name="ingredient" value="Сливки"');

  // Reload: value persists in the sidebar (the row IS the labelled button).
  await page.reload();
  await settleOrgChooser(page);
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);
  await selectTask(page, TASK_A);
  await openPropertiesSection(page);
  const ingredientRow = page.getByRole("button", { name: "Редактировать свойство ingredient", exact: true });
  await expect(ingredientRow).toBeVisible({ timeout: 15_000 });
  await expect(ingredientRow).toContainText("Сливки");

  // Delete: row returns to the empty state; quick-delete auto-saves
  // (handleQuickDelete flushes onSaveExtensionState — no global Save needed).
  const deletePut = page.waitForResponse(
    (res) => res.url().includes("/bpmn") && res.request().method() === "PUT",
    { timeout: 30_000 },
  );
  await page.getByLabel("Удалить свойство ingredient", { exact: true }).click();
  const deleteRes = await deletePut;
  expect(deleteRes.ok(), `auto-save after delete: ${deleteRes.status()}`).toBeTruthy();
  await expect(page.getByLabel("Редактировать свойство ingredient", { exact: true })).toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(async () => taskBlock(await fetchBpmnXml(request, fixture), TASK_A), { timeout: 20_000 })
    .not.toContain('name="ingredient"');

  expect(problems, problems.join("\n")).toEqual([]);
});
