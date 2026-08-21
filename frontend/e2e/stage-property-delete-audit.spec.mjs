import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Stage regression audit: property add/edit/delete timing and UI state.
// Uses real UI selectors discovered on stage (sidebar redesign + propertyCrudBoundary).
// Run with:
//   E2E_APP_BASE_URL=https://stage.processmap.ru \
//   E2E_API_BASE_URL=https://stage.processmap.ru \
//   E2E_USER=... E2E_PASS=... \
//   npx playwright test e2e/stage-property-delete-audit.spec.mjs --workers=1

test("property add/edit/delete timing and UI state", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  await setUiToken(page, auth.accessToken);

  // Always create a fresh fixture so no leftover frontend draft rows interfere.
  const fixture = await createFixture(
    request,
    `stage-audit-property-delete-${Date.now()}`,
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
    <bpmn:task id="Task_audit" name="Audit task">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="audit_prop" value="10" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
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

  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForTimeout(3000);

  // Handle org picker on stage.
  const orgHeading = page.getByRole("heading", { name: "Выберите организацию" });
  if (await orgHeading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /Default/i }).first().click();
    await page.waitForTimeout(3000);
  }

  // If project/session not found in Default, try switching org via topbar.
  const orgNames = ["Роботизация производств", "Тестовое пространство"];
  for (const orgName of orgNames) {
    const notFound = await page.getByText("project not found").isVisible().catch(() => false);
    const sessionUnavailable = await page.getByText("Сессия недоступна").isVisible().catch(() => false);
    if (!notFound && !sessionUnavailable) break;

    const orgDropdown = page.locator("[data-testid='topbar-org-select']").first();
    if (await orgDropdown.isVisible().catch(() => false)) {
      await orgDropdown.click();
      await page.waitForTimeout(500);
      await page.getByRole("option", { name: new RegExp(orgName, "i") }).first().click();
      await page.waitForTimeout(4000);
    }
  }

  await waitForDiagramReady(page);

  // Capture console errors/warnings from the very beginning of interactions.
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.type() === "warning") consoleWarnings.push(msg.text());
  });

  // Capture all network requests (save endpoint may vary).
  const requests = [];
  page.on("request", (req) => {
    requests.push({ method: req.method(), url: req.url(), started: Date.now() });
  });
  page.on("requestfinished", (req) => {
    const entry = requests.find((r) => r.url === req.url() && r.method === req.method() && !r.finished);
    if (entry) {
      entry.finished = Date.now();
      entry.status = req.response()?.status?.().catch(() => undefined);
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    const method = res.request().method();
    if (["PUT", "PATCH", "POST"].includes(method)) {
      const entry = requests.find((r) => r.url === url && r.method === method && !r.status);
      if (entry) entry.status = res.status();
    }
  });

  // Open sidebar properties for Task_audit.
  await page.click('[data-element-id="Task_audit"]');
  await page.waitForTimeout(1000);

  // Ensure sidebar is open.
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(500);
  }

  // Expand properties accordion.
  const propsHead = page.locator("[data-section-id='properties'] .sidebarAccordionHead").first();
  if (await propsHead.isVisible().catch(() => false)) {
    const expanded = await propsHead.getAttribute("aria-expanded");
    if (expanded !== "true") {
      await propsHead.click();
      await page.waitForTimeout(500);
    }
  }

  const propertyName = "audit_prop";

  // 1. Edit existing BPMN property (audit_prop: 10 -> 15).
  const propsSection = page.locator("[data-testid='property-section']").first();
  await expect(propsSection).toBeVisible();

  const propertyRow = page.getByLabel(new RegExp(`Редактировать свойство ${propertyName}`)).first();
  await expect(propertyRow).toBeVisible();
  await propertyRow.click();

  const editRow = propsSection.locator(".sidebarSchemaPropertyRow.isEditing").first();
  await expect(editRow).toBeVisible();
  const editValueInput = editRow.locator('input[placeholder="Значение"]').first();
  await editValueInput.fill("15");
  await editValueInput.press("Enter");
  await expect(editRow).toHaveCount(0, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);

  // Property edits are dirty until explicit save via the sidebar «Сохранить» button.
  const saveBtn = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить", exact: true });
  await expect(saveBtn).toBeEnabled({ timeout: 10000 });

  const editStart = Date.now();
  let editResponse = null;
  try {
    [editResponse] = await Promise.all([
      page.waitForResponse(
        (res) => (res.url().includes("/api/sessions/") || res.url().includes("/api/bpmn")) && ["PUT", "PATCH"].includes(res.request().method()),
        { timeout: 30000 },
      ),
      saveBtn.click(),
    ]);
  } catch {
    // save may hang — capture timing anyway
  }
  const editElapsed = Date.now() - editStart;

  await page.waitForTimeout(500);

  // 2. Delete property.
  const rowToDelete = page.getByLabel(new RegExp(`Редактировать свойство ${propertyName}`)).first();
  await expect(rowToDelete).toBeVisible();
  await rowToDelete.hover();
  const deleteBtn = rowToDelete.locator(".sidebarPropertyActionBtn--danger").first();
  await expect(deleteBtn).toBeVisible();
  const deleteBtnEnabled = await deleteBtn.isEnabled({ timeout: 5000 }).catch(() => false);
  let deleteElapsed = null;
  let deleteResponse = null;

  if (deleteBtnEnabled) {
    await deleteBtn.click();
    await page.waitForTimeout(300);

    // Save after delete — this is where the reported hang occurs.
    const saveBtnAfterDelete = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить", exact: true });
    const saveEnabled = await saveBtnAfterDelete.isEnabled({ timeout: 5000 }).catch(() => false);
    if (saveEnabled) {
      const deleteStart = Date.now();
      try {
        [deleteResponse] = await Promise.all([
          page.waitForResponse(
            (res) => (res.url().includes("/api/sessions/") || res.url().includes("/api/bpmn")) && ["PUT", "PATCH"].includes(res.request().method()),
            { timeout: 30000 },
          ),
          saveBtnAfterDelete.click(),
        ]);
      } catch {
        // timeout or no request
      }
      deleteElapsed = Date.now() - deleteStart;
    } else {
      deleteElapsed = null;
    }
  } else {
    deleteElapsed = null;
  }


  await page.waitForTimeout(1000);

  // 3. Try to add a property after delete.
  const addBtnAfterDelete = propsSection.locator(".sidebarAddBtn").filter({ hasText: /Добавить BPMN-свойство/i }).first();
  const canAddAfterDelete = await addBtnAfterDelete.isEnabled({ timeout: 5000 }).catch(() => false);
  let inputEditableAfterDelete = false;
  let secondAddElapsed = null;

  if (canAddAfterDelete) {
    const secondPropertyName = `audit2_${Date.now()}`;
    await addBtnAfterDelete.click();
    const secondEditRow = propsSection.locator(".sidebarSchemaPropertyRow.isEditing").first();
    const secondNameInput = secondEditRow.locator('input[placeholder="Название"]').first();
    const secondValueInput = secondEditRow.locator('input[placeholder="Значение"]').first();
    await secondNameInput.fill(secondPropertyName);
    await secondValueInput.fill("20");
    await secondValueInput.press("Enter");
    await page.waitForTimeout(300);

    inputEditableAfterDelete = await secondNameInput.isEditable().catch(() => false);

    const saveBtnSecond = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить", exact: true });
    const saveEnabled = await saveBtnSecond.isEnabled({ timeout: 5000 }).catch(() => false);
    if (saveEnabled) {
      const secondAddStart = Date.now();
      try {
        await Promise.all([
          page.waitForResponse(
            (res) => (res.url().includes("/api/sessions/") || res.url().includes("/api/bpmn")) && ["PUT", "PATCH"].includes(res.request().method()),
            { timeout: 30000 },
          ),
          saveBtnSecond.click(),
        ]);
        secondAddElapsed = Date.now() - secondAddStart;
      } catch {
        secondAddElapsed = Date.now() - secondAddStart;
      }
    }
  }

  // Audit report logging.
  const relevantRequests = requests
    .filter((r) => ["PUT", "PATCH", "POST"].includes(r.method) && r.url.includes("/api/"))
    .map((r) => ({ ...r, elapsedMs: r.finished ? r.finished - r.started : null, status: r.status }));

  console.log("[AUDIT] edit save elapsed:", editElapsed, "ms");
  console.log("[AUDIT] edit response status:", editResponse?.status?.() ?? "none");
  console.log("[AUDIT] delete button enabled:", deleteBtnEnabled);
  console.log("[AUDIT] delete save elapsed:", deleteElapsed, "ms");
  console.log("[AUDIT] delete response status:", deleteResponse?.status?.() ?? "none");
  console.log("[AUDIT] second add save elapsed:", secondAddElapsed, "ms");
  console.log("[AUDIT] can add after delete:", canAddAfterDelete);
  console.log("[AUDIT] input editable after delete:", inputEditableAfterDelete);
  console.log("[AUDIT] console errors:", consoleErrors);
  console.log("[AUDIT] console warnings:", consoleWarnings);
  console.log("[AUDIT] relevant requests:", JSON.stringify(relevantRequests, null, 2));

  // Audit spec should collect data, not fail because the bug exists.
  // We only assert that the test reached the key checkpoints.
  expect(editElapsed).toBeDefined();
  const editStatus = editResponse ? await editResponse.status() : undefined;
  expect([200, 201, 202, 204, undefined]).toContain(editStatus);
});
