import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

function seedCollapsedSubprocessXml(runId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${runId}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Collapsed ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="Collapsed Source">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1">
        <bpmn:outgoing>SubFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="InnerTask_1" name="Inner task">
        <bpmn:incoming>SubFlow_1</bpmn:incoming>
        <bpmn:outgoing>SubFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="SubEnd_1">
        <bpmn:incoming>SubFlow_2</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="SubFlow_1" sourceRef="SubStart_1" targetRef="InnerTask_1" />
      <bpmn:sequenceFlow id="SubFlow_2" sourceRef="InnerTask_1" targetRef="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:task id="Task_1" name="Neighbor task">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubProcess_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="false">
        <dc:Bounds x="260" y="128" width="180" height="110" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="540" y="143" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="260" y="183" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="183" />
        <di:waypoint x="540" y="183" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function createDiagramElementThread(request, sessionId, headers, elementId, elementName) {
  const res = await request.post(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/note-threads`, {
    headers,
    data: {
      scope_type: "diagram_element",
      scope_ref: {
        element_id: elementId,
        element_name: elementName,
        element_type: "bpmn:Task",
      },
      body: `Discussion for ${elementId}`,
      priority: "normal",
      requires_attention: false,
    },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function getElementState(page, id) {
  return await page.evaluate((elementId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "no_modeler" };
    const selection = modeler.get("selection");
    const selected = selection?.get?.() || [];
    const ids = selected.map((el) => el.id || el.businessObject?.id || "").filter(Boolean);
    const shape = modeler.get("elementRegistry").get(elementId);
    return {
      ok: true,
      selectedIds: ids,
      isSelected: ids.includes(elementId),
      shapeFound: !!shape,
      subprocessCollapsed: shape?.parent?.collapsed === true,
      subprocessExpanded: shape?.parent?.collapsed === false,
    };
  }, id);
}

async function getSubprocessCollapsedState(page, id) {
  return await page.evaluate((subprocessId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;
    const shape = modeler.get("elementRegistry").get(subprocessId);
    return shape?.collapsed === true;
  }, id);
}

async function openSessionAndHandleOrgChooser(page, fixture, auth) {
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
}

test("focus linked element inside collapsed subprocess stays on parent canvas and expands subprocess", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedCollapsedSubprocessXml(runId));

  const thread = await createDiagramElementThread(request, fixture.sessionId, auth.headers, "InnerTask_1", "Inner task");
  expect(thread?.thread?.id).toBeTruthy();

  page.on("pageerror", (error) => console.error("[PAGEERROR]", error?.message || error));
  page.on("console", (msg) => { if (msg.type() === "error") console.error("[CONSOLE]", msg.text()); });

  await openSessionAndHandleOrgChooser(page, fixture, auth);

  // SubProcess is initially collapsed.
  await expect.poll(async () => getSubprocessCollapsedState(page, "SubProcess_1"), { timeout: 10000 }).toBe(true);

  // Open the discussions panel and select the thread.
  await page.getByTestId("diagram-action-notes").click();
  await expect(page.getByTestId("notes-panel-header")).toBeVisible();

  const threadRow = page.locator("[data-testid='notes-thread-list'] button").filter({ hasText: "Discussion for InnerTask_1" }).first();
  await expect(threadRow).toBeVisible();
  await threadRow.click();

  // Click "Перейти к элементу на схеме".
  const focusButton = page.getByTestId("notes-thread-focus-linked-element");
  await expect(focusButton).toBeVisible();
  await focusButton.click();

  // We must stay on the parent session URL.
  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);

  // SubProcess should now be expanded.
  await expect.poll(async () => getSubprocessCollapsedState(page, "SubProcess_1"), { timeout: 10000 }).toBe(false);

  // Inner element should be selected/focused.
  await expect.poll(async () => {
    const state = await getElementState(page, "InnerTask_1");
    return state.isSelected;
  }, { timeout: 10000 }).toBe(true);

  // The inner element shape is actually rendered on the parent canvas.
  await expect(page.locator("[data-element-id='InnerTask_1']").first()).toBeVisible();

  await page.screenshot({ path: "/mnt/agents/output/subprocess_expand_focus_success.png" });
});

test("focus linked element in root process works without drilldown", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedCollapsedSubprocessXml(runId));

  const thread = await createDiagramElementThread(request, fixture.sessionId, auth.headers, "Task_1", "Neighbor task");
  expect(thread?.thread?.id).toBeTruthy();

  await openSessionAndHandleOrgChooser(page, fixture, auth);

  await page.getByTestId("diagram-action-notes").click();
  await expect(page.getByTestId("notes-panel-header")).toBeVisible();

  const threadRow = page.locator("[data-testid='notes-thread-list'] button").filter({ hasText: "Discussion for Task_1" }).first();
  await expect(threadRow).toBeVisible();
  await threadRow.click();

  const focusButton = page.getByTestId("notes-thread-focus-linked-element");
  await expect(focusButton).toBeVisible();
  await focusButton.click();

  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);

  await expect.poll(async () => {
    const state = await getElementState(page, "Task_1");
    return state.isSelected;
  }, { timeout: 10000 }).toBe(true);
});

test("clicking session breadcrumb in current session closes panel without reloading canvas", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedCollapsedSubprocessXml(runId));

  const thread = await createDiagramElementThread(request, fixture.sessionId, auth.headers, "Task_1", "Neighbor task");
  expect(thread?.thread?.id).toBeTruthy();

  await openSessionAndHandleOrgChooser(page, fixture, auth);

  await page.getByTestId("diagram-action-notes").click();
  await expect(page.getByTestId("notes-panel-header")).toBeVisible();

  const threadRow = page.locator("[data-testid='notes-thread-list'] button").filter({ hasText: "Discussion for Task_1" }).first();
  await expect(threadRow).toBeVisible();
  await threadRow.click();

  // The session breadcrumb is the second button in the thread breadcrumb row.
  const sessionBreadcrumb = page.locator("[data-testid='notes-thread-breadcrumb'] button").nth(1);
  await expect(sessionBreadcrumb).toBeVisible();
  const urlBeforeBreadcrumb = page.url();
  await sessionBreadcrumb.click();

  // Panel should close and URL must stay exactly the same (no openSession reload).
  await expect(page.getByTestId("notes-panel-header")).not.toBeVisible();
  await expect.poll(async () => page.url()).toBe(urlBeforeBreadcrumb);
});
