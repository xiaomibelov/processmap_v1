import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

function seedNestedExpandedSubprocessXml(runId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${runId}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Nested expanded ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="Activity_05u8k9l" name="Outer Subprocess">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="StartEvent_outer" name="Start outer">
        <bpmn:outgoing>Flow_outer_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:subProcess id="Activity_0o23kco" name="Inner Subprocess">
        <bpmn:incoming>Flow_outer_1</bpmn:incoming>
        <bpmn:outgoing>Flow_outer_2</bpmn:outgoing>
        <bpmn:startEvent id="StartEvent_inner" name="Start inner">
          <bpmn:outgoing>Flow_inner_1</bpmn:outgoing>
        </bpmn:startEvent>
        <bpmn:task id="Task_inner_1" name="Inner task 1">
          <bpmn:incoming>Flow_inner_1</bpmn:incoming>
          <bpmn:outgoing>Flow_inner_2</bpmn:outgoing>
        </bpmn:task>
        <bpmn:task id="Task_inner_2" name="Inner task 2">
          <bpmn:incoming>Flow_inner_2</bpmn:incoming>
          <bpmn:outgoing>Flow_inner_3</bpmn:outgoing>
        </bpmn:task>
        <bpmn:endEvent id="EndEvent_inner" name="End inner">
          <bpmn:incoming>Flow_inner_3</bpmn:incoming>
        </bpmn:endEvent>
        <bpmn:sequenceFlow id="Flow_inner_1" sourceRef="StartEvent_inner" targetRef="Task_inner_1" />
        <bpmn:sequenceFlow id="Flow_inner_2" sourceRef="Task_inner_1" targetRef="Task_inner_2" />
        <bpmn:sequenceFlow id="Flow_inner_3" sourceRef="Task_inner_2" targetRef="EndEvent_inner" />
      </bpmn:subProcess>
      <bpmn:endEvent id="EndEvent_outer" name="End outer">
        <bpmn:incoming>Flow_outer_2</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="Flow_outer_1" sourceRef="StartEvent_outer" targetRef="Activity_0o23kco" />
      <bpmn:sequenceFlow id="Flow_outer_2" sourceRef="Activity_0o23kco" targetRef="EndEvent_outer" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_05u8k9l" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_05u8k9l" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_05u8k9l_di" bpmnElement="Activity_05u8k9l" isExpanded="false">
        <dc:Bounds x="260" y="128" width="180" height="110" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="540" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="260" y="183" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="183" />
        <di:waypoint x="540" y="178" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="BPMNDiagram_outer">
    <bpmndi:BPMNPlane id="BPMNPlane_outer" bpmnElement="Activity_05u8k9l">
      <bpmndi:BPMNShape id="StartEvent_outer_di" bpmnElement="StartEvent_outer">
        <dc:Bounds x="120" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0o23kco_di" bpmnElement="Activity_0o23kco" isExpanded="true">
        <dc:Bounds x="180" y="80" width="620" height="270" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_outer_di" bpmnElement="EndEvent_outer">
        <dc:Bounds x="880" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_outer_1_di" bpmnElement="Flow_outer_1">
        <di:waypoint x="156" y="138" />
        <di:waypoint x="180" y="138" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_outer_2_di" bpmnElement="Flow_outer_2">
        <di:waypoint x="800" y="215" />
        <di:waypoint x="880" y="168" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="StartEvent_inner_di" bpmnElement="StartEvent_inner">
        <dc:Bounds x="222" y="222" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_inner_1_di" bpmnElement="Task_inner_1">
        <dc:Bounds x="310" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_inner_2_di" bpmnElement="Task_inner_2">
        <dc:Bounds x="520" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_inner_di" bpmnElement="EndEvent_inner">
        <dc:Bounds x="720" y="222" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_inner_1_di" bpmnElement="Flow_inner_1">
        <di:waypoint x="258" y="240" />
        <di:waypoint x="310" y="240" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_inner_2_di" bpmnElement="Flow_inner_2">
        <di:waypoint x="410" y="240" />
        <di:waypoint x="520" y="240" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_inner_3_di" bpmnElement="Flow_inner_3">
        <di:waypoint x="620" y="240" />
        <di:waypoint x="720" y="240" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function getCurrentRootId(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return "";
    const canvas = modeler.get("canvas");
    const root = canvas?.getRootElement?.();
    return String(root?.businessObject?.id || root?.id || "");
  });
}

async function collapseSubprocessShape(page, elementId) {
  return await page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return false;
    const registry = modeler.get("elementRegistry");
    const modeling = modeler.get("modeling");
    const el = registry.get(id);
    if (!el || !modeling || typeof modeling.toggleCollapse !== "function") return false;
    modeling.toggleCollapse(el);
    return true;
  }, elementId);
}

async function getElementBounds(page, elementId) {
  return await page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;
    const registry = modeler.get("elementRegistry");
    const el = registry.get(id);
    if (!el) return null;
    return {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    };
  }, elementId);
}

test("drilldown into expanded subprocess shape without dedicated plane preserves layout", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedNestedExpandedSubprocessXml(runId));

  page.on("pageerror", (error) => {
    console.error("[PAGEERROR]", error?.message || error);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[CONSOLE]", msg.text());
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(`/app?project=${fixture.projectId}&session=${fixture.sessionId}`);
  try {
    await page.locator("h1:has-text('Выберите организацию')").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("button").filter({ has: page.locator("div", { hasText: "Default" }) }).first().click();
  } catch {
    // org chooser not shown
  }
  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);
  await waitForDiagramReady(page);

  // Drill down into Activity_05u8k9l (dedicated plane).
  const outerDrilldown = page.locator(".bjs-drilldown").filter({ has: page.locator("[data-element-id='Activity_05u8k9l']") }).first();
  // Fallback: any drilldown arrow on the root canvas.
  const anyDrilldown = page.locator(".bjs-drilldown").first();
  await expect(anyDrilldown, "drilldown arrow for outer subprocess should be rendered").toBeVisible();
  await anyDrilldown.click({ force: true });

  await expect.poll(async () => {
    const url = page.url();
    const match = url.match(/[?&]session=([^&]+)/);
    const currentSession = match ? decodeURIComponent(match[1]) : "";
    return currentSession && currentSession !== fixture.sessionId ? currentSession : "";
  }, { timeout: 15000 }).not.toBe("");

  const outerChildSessionId = await page.evaluate(() => {
    const m = window.location.href.match(/[?&]session=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  });

  await waitForDiagramReady(page);
  await expect.poll(async () => getCurrentRootId(page), { timeout: 15000 }).toBe("Activity_05u8k9l");

  // The inner subprocess Activity_0o23kco should be rendered expanded with its children visible.
  await expect(page.locator("[data-element-id='Activity_0o23kco']").first()).toBeVisible();
  await expect(page.locator("[data-element-id='Task_inner_1']").first()).toBeVisible();

  // Drill down into Activity_0o23kco (no dedicated plane, DI extracted from expanded shape).
  // The inner subprocess is rendered expanded, so collapse it first to reveal the bpmn-js
  // drilldown overlay arrow.
  const innerSubprocessShape = page.locator("[data-element-id='Activity_0o23kco']").first();
  await expect(innerSubprocessShape, "inner expanded subprocess shape should be rendered").toBeVisible();
  expect(await collapseSubprocessShape(page, "Activity_0o23kco"), "collapse API should succeed").toBe(true);
  await page.waitForTimeout(500);
  const innerDrilldown = page.locator(".bjs-drilldown").first();
  await expect(innerDrilldown, "drilldown arrow for inner subprocess should be rendered").toBeVisible();
  await innerDrilldown.click({ force: true });

  await expect.poll(async () => {
    const url = page.url();
    const match = url.match(/[?&]session=([^&]+)/);
    const currentSession = match ? decodeURIComponent(match[1]) : "";
    return currentSession && currentSession !== outerChildSessionId ? currentSession : "";
  }, { timeout: 15000 }).not.toBe("");

  await waitForDiagramReady(page);
  await expect.poll(async () => getCurrentRootId(page), { timeout: 15000 }).toBe("Activity_0o23kco");

  // Verify all inner elements are present.
  for (const id of ["StartEvent_inner", "Task_inner_1", "Task_inner_2", "EndEvent_inner"]) {
    await expect(page.locator(`[data-element-id='${id}']`).first()).toBeVisible();
  }

  // Verify layout is left-to-right (not the grid fallback).
  const start = await getElementBounds(page, "StartEvent_inner");
  const task1 = await getElementBounds(page, "Task_inner_1");
  const task2 = await getElementBounds(page, "Task_inner_2");
  const end = await getElementBounds(page, "EndEvent_inner");
  expect(start && task1 && task2 && end, "all inner element bounds should be available").toBeTruthy();

  const xs = [start.x, task1.x, task2.x, end.x];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  expect(maxX - minX, "inner elements should span a wide horizontal layout").toBeGreaterThan(350);

  await page.screenshot({ path: "/mnt/agents/output/expanded_shape_success.png" });
});
