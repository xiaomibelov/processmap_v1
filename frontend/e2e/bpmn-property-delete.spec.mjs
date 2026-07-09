import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

function seedXmlWithProperty() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="E2E Process" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Task baseline">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="priority" value="high" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="290" y="148" width="170" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="560" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="206" y="188" />
        <di:waypoint x="290" y="188" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="188" />
        <di:waypoint x="560" y="188" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function getServerBpmnXml(request, sessionId, token) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?include_overlay=0`, {
    headers: withAuthHeaders(token),
  });
  if (!res.ok()) return "";
  return res.text();
}

test("deleting an additional BPMN property removes it from the element", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXmlWithProperty());

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });

  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }

  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);

  // Select the task to open its sidebar.
  const taskShape = page.locator('g[data-element-id="Task_1"]').first();
  await expect(taskShape).toBeVisible();
  await taskShape.click();

  const discussionsBtn = page.getByRole("button", { name: "Обсуждения" });
  await expect(discussionsBtn).toBeVisible();
  await discussionsBtn.click();

  const nodeSectionBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Выбранный узел']");
  await expect(nodeSectionBtn).toBeVisible();
  await nodeSectionBtn.click();

  const propertiesAccordion = page.locator(".sidebarAccordionHead").filter({ hasText: /^Свойства$/ }).first();
  await expect(propertiesAccordion).toBeVisible();
  await propertiesAccordion.click();

  // Additional BPMN properties is the primary editable block and stays expanded by default.

  // The seeded property should be visible.
  const rows = page.locator(".sidebarBpmnPropertyItem");
  await expect(rows).toHaveCount(1);

  // Delete the property.
  const deleteBtn = rows.first().locator(".sidebarPropertyActionBtn--danger").first();
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // Row should disappear immediately and stay gone.
  await expect(rows).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(rows).toHaveCount(0);

  // The deletion is flushed immediately, so the server XML should already
  // reflect the removal before any global save.
  await expect.poll(async () => {
    const xml = await getServerBpmnXml(request, fixture.sessionId, auth.accessToken);
    return xml.includes('name="priority"');
  }).toBe(false);

  // Save via the global footer and verify the row does not reappear.
  const saveBtn = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить всё" });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(saveBtn).not.toContainText("Сохраняю...", { timeout: 15000 });
  await expect.poll(async () => rows.count()).toBe(0);

  const serverXml = await getServerBpmnXml(request, fixture.sessionId, auth.accessToken);
  expect(serverXml).not.toContain('name="priority"');
});
