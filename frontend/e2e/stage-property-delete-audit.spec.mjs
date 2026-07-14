import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Stage regression audit: property delete → long save / UI lock.
// Run with:
//   E2E_APP_BASE_URL=https://stage.processmap.ru \
//   E2E_API_BASE_URL=https://stage.processmap.ru \
//   E2E_USER=... E2E_PASS=... \
//   npx playwright test e2e/stage-property-delete-audit.spec.mjs --workers=1

test("property add/edit/delete timing and UI state", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    "stage-audit-property-delete",
    auth.headers,
    `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_audit"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_audit" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_audit" name="Audit task" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_audit" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_audit" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_audit">
      <bpmndi:BPMNShape id="_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="120" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_Task_audit" bpmnElement="Task_audit"><dc:Bounds x="220" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_EndEvent_1" bpmnElement="EndEvent_1"><dc:Bounds x="400" y="152" width="36" height="36" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,
  );

  await setUiToken(page, auth.accessToken);
  const orgId = String(fixture.orgId || auth.activeOrgId || "").trim();
  await page.addInitScript((org) => {
    if (org) window.localStorage.setItem("fpc_active_org_id", org);
  }, orgId);
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await waitForDiagramReady(page);

  // Capture all network requests to the session/bpmn endpoints.
  const requests = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/sessions/") || url.includes("/api/bpmn")) {
      requests.push({ method: req.method(), url, started: Date.now() });
    }
  });
  page.on("requestfinished", (req) => {
    const entry = requests.find((r) => r.url === req.url() && r.method === req.method());
    if (entry) entry.finished = Date.now();
  });

  // Open sidebar properties for Task_audit.
  await page.click('[data-element-id="Task_audit"]');
  await page.waitForSelector('[data-testid="properties-subtab"]', { state: "visible" });
  await page.click('[data-testid="properties-subtab"]');

  // 1. Add property.
  await page.click('text=Добавить свойство');
  const nameInput = page.locator('[data-testid="property-name-input"]').last();
  const valueInput = page.locator('[data-testid="property-value-input"]').last();
  await nameInput.fill("ee_time");
  await valueInput.fill("10");
  await page.keyboard.press("Enter");

  const addStart = Date.now();
  await page.waitForResponse((res) => res.url().includes("/api/sessions/") && ["PUT", "PATCH"].includes(res.request().method()), { timeout: 30000 });
  const addElapsed = Date.now() - addStart;

  // 2. Edit property.
  await valueInput.fill("15");
  await page.keyboard.press("Enter");
  const editStart = Date.now();
  await page.waitForResponse((res) => res.url().includes("/api/sessions/") && ["PUT", "PATCH"].includes(res.request().method()), { timeout: 30000 });
  const editElapsed = Date.now() - editStart;

  // 3. Delete property.
  const deleteButton = page.locator('[data-testid="property-delete-btn"]').last();
  await deleteButton.click();
  const deleteStart = Date.now();
  let deleteElapsed = null;
  try {
    await page.waitForResponse((res) => res.url().includes("/api/sessions/") && ["PUT", "PATCH"].includes(res.request().method()), { timeout: 30000 });
    deleteElapsed = Date.now() - deleteStart;
  } catch {
    deleteElapsed = Date.now() - deleteStart;
  }

  // 4. Try to add another property after delete.
  const canAddAfterDelete = await page.locator('text=Добавить свойство').isEnabled({ timeout: 5000 });
  const secondNameInput = page.locator('[data-testid="property-name-input"]').last();
  const inputEditable = await secondNameInput.isEditable().catch(() => false);

  // Collect console errors.
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Assertions / audit report.
  console.log("[AUDIT] add property elapsed:", addElapsed, "ms");
  console.log("[AUDIT] edit property elapsed:", editElapsed, "ms");
  console.log("[AUDIT] delete property elapsed:", deleteElapsed, "ms");
  console.log("[AUDIT] requests:", JSON.stringify(requests, null, 2));
  console.log("[AUDIT] can add after delete:", canAddAfterDelete);
  console.log("[AUDIT] input editable after delete:", inputEditable);
  console.log("[AUDIT] console errors:", consoleErrors);

  expect(addElapsed).toBeLessThan(5000);
  expect(editElapsed).toBeLessThan(5000);
  expect(deleteElapsed).toBeLessThan(5000);
  expect(canAddAfterDelete).toBe(true);
  expect(inputEditable).toBe(true);
  expect(consoleErrors).toEqual([]);
});
