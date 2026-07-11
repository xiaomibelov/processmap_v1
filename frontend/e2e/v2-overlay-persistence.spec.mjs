import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, openFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// V2 property overlays must survive element selection.
//
// Regression: with "Показывать все V2-оверлеи свойств" enabled, selecting a
// task removed its V2 overlay card (selection-driven legacy preview / mutual
// exclusion suppressed the V2 layer). Selecting an element must not remove or
// duplicate V2 cards, other elements must stay unaffected, and clicking a V2
// card must still open the properties popover (#521).

const TASK_A = "Task_persistA";
const TASK_B = "Task_persistB";

function seedXmlTwoTasks() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_persist" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="${TASK_A}" name="Task A">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="prop_alpha" value="alpha-value" />
          <camunda:property name="fpc-show-properties" value="true" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="${TASK_B}" name="Task B">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="prop_beta" value="beta-value" />
          <camunda:property name="fpc-show-properties" value="true" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="${TASK_A}" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="${TASK_A}" targetRef="${TASK_B}" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="${TASK_B}" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_persist">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="120" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_A}" bpmnElement="${TASK_A}"><dc:Bounds x="220" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_B}" bpmnElement="${TASK_B}"><dc:Bounds x="430" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1"><dc:Bounds x="640" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="156" y="170" /><di:waypoint x="220" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="340" y="170" /><di:waypoint x="430" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="550" y="170" /><di:waypoint x="640" y="170" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(300);
  }
}

async function openPropertiesSection(page) {
  const head = page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
  if ((await head.getAttribute("aria-expanded").catch(() => "false")) !== "true") {
    await head.click();
    await page.waitForTimeout(300);
  }
}

async function enableV2Overlays(page) {
  const checkbox = page.locator('[data-testid="bpmn-show-v2-overlays-checkbox"]');
  await expect(checkbox).toBeVisible({ timeout: 15_000 });
  if (!(await checkbox.isChecked())) {
    await checkbox.click();
  }
}

async function setSelectPreview(page, on) {
  const checkbox = page
    .locator('label:has-text("Показывать свойства над задачей при выделении") input[type="checkbox"]')
    .first();
  await expect(checkbox).toBeVisible({ timeout: 15_000 });
  if ((await checkbox.isChecked()) !== on) {
    await checkbox.click();
  }
}

function v2Host(page, elementId) {
  return page.locator(`.fpc-overlay-v2-host[data-fpc-element-id="${elementId}"]`);
}

async function expectV2Hosts(page, elementIds) {
  for (const elementId of elementIds) {
    await expect(v2Host(page, elementId)).toHaveCount(1, { timeout: 15_000 });
  }
}

async function expectLegacyOverlaysGone(page) {
  await expect
    .poll(async () => page.locator(".fpcPropertyOverlay").count(), { timeout: 15_000 })
    .toBe(0);
}

async function clickTaskOnCanvas(page, elementId) {
  await page.locator(`[data-element-id="${elementId}"].djs-shape`).first().click({ force: true });
  await page.waitForTimeout(400);
}

async function bootDiagramWithV2(page, request, runId) {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXmlTwoTasks());
  await setUiToken(page, auth.accessToken);
  await openFixture(page, fixture);
  await waitForDiagramReady(page);

  await ensureSidebarOpen(page);
  await openPropertiesSection(page);
  await enableV2Overlays(page);
  await expectV2Hosts(page, [TASK_A, TASK_B]);
  return fixture;
}

test("V2 overlay persists when element is selected (select-preview on)", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagramWithV2(page, request, `v2persist_${runId}`);

  // Select Task A, then enable "show properties on select" (it renders only
  // when an element is selected). The V2 card of the selected element must
  // survive, and no legacy overlay may duplicate it.
  await clickTaskOnCanvas(page, TASK_A);
  await setSelectPreview(page, true);
  await expectV2Hosts(page, [TASK_A, TASK_B]);
  await expectLegacyOverlaysGone(page);

  // Select Task B: both cards stay; other element (A, now deselected) is
  // unaffected and no legacy card appears for B either.
  await clickTaskOnCanvas(page, TASK_B);
  await expectV2Hosts(page, [TASK_A, TASK_B]);
  await expectLegacyOverlaysGone(page);

  // Deselect: cards persist.
  await page.keyboard.press("Escape");
  await expectV2Hosts(page, [TASK_A, TASK_B]);
});

test("V2 overlay persists when element is selected with select-preview off", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagramWithV2(page, request, `v2persist_off_${runId}`);

  // The select-preview toggle stays OFF. Selecting must not remove the card.
  await clickTaskOnCanvas(page, TASK_A);
  await expectV2Hosts(page, [TASK_A, TASK_B]);

  await clickTaskOnCanvas(page, TASK_B);
  await expectV2Hosts(page, [TASK_A, TASK_B]);
});

test("V2 overlay card click still opens the properties popover (#521)", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagramWithV2(page, request, `v2persist_pop_${runId}`);

  await clickTaskOnCanvas(page, TASK_A);
  await expectV2Hosts(page, [TASK_A, TASK_B]);

  await v2Host(page, TASK_A).click();
  const modal = page.locator('[data-testid="bpmn-properties-overlay"]');
  await expect(modal).toBeVisible({ timeout: 15_000 });

  await page.locator('[data-testid="bpmn-properties-overlay-close"]').click();
  await expect(modal).toBeHidden({ timeout: 10_000 });
  await expectV2Hosts(page, [TASK_A, TASK_B]);
});
