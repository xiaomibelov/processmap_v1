import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// V2 property overlays must survive element selection.
//
// Regression: with "Показывать все V2-оверлеи свойств" enabled, selecting a
// task removed its V2 overlay card (selection-driven legacy preview / mutual
// exclusion suppressed the V2 layer). Selecting an element must not remove or
// duplicate V2 cards, other elements must stay unaffected, and clicking a V2
// card must still open the properties popover (#521).
//
// Adaptation (property-panel-redesign port, B3): while V2 is on, the legacy
// display mode is forced to «Скрыто» and its segmented control is locked —
// the legacy select-preview cannot be toggled independently anymore.

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

async function setV2Overlays(page, on) {
  const toggle = page.locator('[data-testid="v2-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute("aria-checked")) !== (on ? "true" : "false")) {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-checked", on ? "true" : "false");
}

async function setSelectPreview(page, on) {
  // P1 UX redesign: the on-select checkbox became the display-mode
  // segmented control — hover = on, hidden = off.
  const segment = page.locator(`[data-testid="display-mode-segment-${on ? "hover" : "hidden"}"]`);
  await expect(segment).toBeVisible({ timeout: 15_000 });
  await segment.click();
  await expect(segment).toHaveAttribute("aria-checked", "true");
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
  // The stage user belongs to many orgs: pin the fixture org so the app does
  // not stop at the org chooser, and open the session directly from the URL.
  const orgId = String(fixture.orgId || auth.activeOrgId || "").trim();
  await page.addInitScript((value) => {
    if (value) window.localStorage.setItem("fpc_active_org_id", value);
  }, orgId);
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  // The org chooser may appear after a delay; race it against the diagram.
  const chooser = page.getByText("Выберите организацию").first();
  for (let i = 0; i < 40; i += 1) {
    if (await chooser.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /Default/i }).first().click();
      break;
    }
    if (await page.locator(".bpmnStageHost").isVisible().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  await waitForDiagramReady(page);

  await ensureSidebarOpen(page);
  await openPropertiesSection(page);
  await setV2Overlays(page, true);
  await expectV2Hosts(page, [TASK_A, TASK_B]);
  return fixture;
}

test("V2 overlay persists when element is selected (legacy select-preview toggled while V2 off)", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagramWithV2(page, request, `v2persist_${runId}`);

  // While V2 is on the legacy display mode is forced to «Скрыто» and locked.
  const hidden = page.locator('[data-testid="display-mode-segment-hidden"]');
  await expect(hidden).toHaveAttribute("aria-checked", "true");
  await expect(hidden).toBeDisabled();

  // Turn V2 off and enable the select-preview (it renders only when an
  // element is selected), then re-enable V2: the V2 cards of selected and
  // deselected elements must survive and no legacy overlay may duplicate them.
  await setV2Overlays(page, false);
  await clickTaskOnCanvas(page, TASK_A);
  await setSelectPreview(page, true);
  await setV2Overlays(page, true);
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
