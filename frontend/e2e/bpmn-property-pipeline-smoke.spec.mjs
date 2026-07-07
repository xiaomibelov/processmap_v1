import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

function seedXml() {
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

async function openNodeProperties(page) {
  const discussionsBtn = page.getByRole("button", { name: "Обсуждения" });
  await expect(discussionsBtn).toBeVisible();
  await discussionsBtn.click();

  const nodeSectionBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Выбранный узел']");
  await expect(nodeSectionBtn).toBeVisible();
  await nodeSectionBtn.click();

  const propertiesAccordion = page.locator(".sidebarAccordionHead").filter({ hasText: /^Свойства$/ }).first();
  await expect(propertiesAccordion).toBeVisible();
  await propertiesAccordion.click();

  const sectionToggle = page.locator(".sidebarPropertiesBlockTitle", { hasText: "Дополнительные BPMN-свойства" });
  await expect(sectionToggle).toBeVisible();
  await sectionToggle.locator("..").click();
}

async function getServerBpmnXml(request, sessionId, token) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?include_overlay=0`, {
    headers: withAuthHeaders(token),
  });
  if (!res.ok()) return "";
  return res.text();
}

test("add/edit/delete additional BPMN property persists without duplicates or missing-XML error", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml());

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

  await openNodeProperties(page);

  const rows = page.locator(".sidebarBpmnPropertyItem");
  await expect(rows).toHaveCount(0);

  // Add a property row.
  const addBtn = page.getByRole("button", { name: /Добавить BPMN-свойство/ });
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  // The new row should be the only one.
  await expect(rows).toHaveCount(1);

  // Expand the row to reveal inputs.
  const row = rows.first();
  await row.locator(".sidebarBpmnPropertySummary").click();

  const nameInput = row.locator(".sidebarBpmnPropertyEditor input").nth(0);
  const valueInput = row.locator(".sidebarBpmnPropertyEditor input").nth(1);
  await expect(nameInput).toBeVisible();
  await expect(valueInput).toBeVisible();

  await nameInput.fill("priority");
  await valueInput.fill("high");

  // Save and wait for the operation to finish.
  const saveBtn = page.locator(".sidebarPropertiesBlock--secondary .primaryBtn", { hasText: "Сохранить" }).first();
  await saveBtn.click();

  await expect
    .poll(async () => saveBtn.isEnabled(), { timeout: 15000 })
    .toBe(true);

  // No missing-XML error should appear.
  await expect(page.getByText("Отсутствует BPMN XML")).toHaveCount(0);

  // Row count should remain exactly one (no duplication).
  await expect.poll(async () => rows.count()).toBe(1);
  await expect(row.locator(".sidebarBpmnPropertyPreviewKey")).toHaveText("priority");
  await expect(row.locator(".sidebarBpmnPropertyPreviewValue")).toHaveText("high");

  // Server XML should contain the saved property.
  let serverXml = await getServerBpmnXml(request, fixture.sessionId, auth.accessToken);
  expect(serverXml).toContain('name="priority"');
  expect(serverXml).toContain('value="high"');

  // Hard reload and verify persistence.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);

  await page.locator('g[data-element-id="Task_1"]').first().click();
  await openNodeProperties(page);

  await expect.poll(async () => rows.count()).toBe(1);
  await expect(rows.first().locator(".sidebarBpmnPropertyPreviewKey")).toHaveText("priority");
  await expect(rows.first().locator(".sidebarBpmnPropertyPreviewValue")).toHaveText("high");

  // Edit the value.
  const reloadedRow = rows.first();
  await reloadedRow.locator(".sidebarBpmnPropertySummary").click();
  const editValue = reloadedRow.locator(".sidebarBpmnPropertyEditor input").nth(1);
  await editValue.fill("urgent");
  await saveBtn.click();

  await expect
    .poll(async () => saveBtn.isEnabled(), { timeout: 15000 })
    .toBe(true);

  await expect(page.getByText("Отсутствует BPMN XML")).toHaveCount(0);
  await expect.poll(async () => rows.count()).toBe(1);
  await expect(reloadedRow.locator(".sidebarBpmnPropertyPreviewValue")).toHaveText("urgent");

  serverXml = await getServerBpmnXml(request, fixture.sessionId, auth.accessToken);
  expect(serverXml).toContain('name="priority"');
  expect(serverXml).toContain('value="urgent"');
  expect(serverXml).not.toContain('value="high"');

  // Delete the property.
  const deleteBtn = page.getByRole("button", { name: /Удалить BPMN-свойство/ });
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();
  await expect(rows).toHaveCount(0);

  await saveBtn.click();
  await expect
    .poll(async () => saveBtn.isEnabled(), { timeout: 15000 })
    .toBe(true);
  await expect(page.getByText("Отсутствует BPMN XML")).toHaveCount(0);
  await expect.poll(async () => rows.count()).toBe(0);

  serverXml = await getServerBpmnXml(request, fixture.sessionId, auth.accessToken);
  expect(serverXml).not.toContain('name="priority"');
});
