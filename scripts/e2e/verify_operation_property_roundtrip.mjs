import { chromium } from "playwright-core";

const BASE_URL = process.env.TEST_BASE_URL || "http://clearvestnic.ru:5177";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";

const OPERATION_KEY = `op_rt_${Date.now()}`;
const PROPERTY_KEY = `prop_rt_${Date.now()}`;
const PROPERTY_LABEL = `Roundtrip prop ${Date.now()}`;
const INITIAL_VALUE = "before-save";
const CHANGED_VALUE = "after-save";

function buildBpmnXml(propertyKey, propertyValue) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_verify" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_verify" name="Verify me">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="${propertyKey}" value="${propertyValue}" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_verify" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_verify" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_verify">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="152" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_Task_verify" bpmnElement="Task_verify">
        <dc:Bounds x="240" y="130" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1">
        <dc:Bounds x="412" y="152" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="170" />
        <di:waypoint x="240" y="170" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="170" />
        <di:waypoint x="412" y="170" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function login(page) {
  console.log("[verify] login");
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 15000 });
  try {
    await page.waitForSelector('h1:has-text("Выберите организацию")', { timeout: 5000 });
    await page.click('button:has-text("Default")');
    await page.waitForURL(/\/app/, { timeout: 15000 });
  } catch {
    // org screen not shown
  }
}

async function getAccessToken(page) {
  return page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || "").trim());
}

async function apiCall(page, { method, path, body }) {
  const token = await getAccessToken(page);
  const res = await page.evaluate(
    async ({ method: m, path: p, body: b, token: t }) => {
      const opts = { method: m, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } };
      if (b !== undefined) opts.body = JSON.stringify(b);
      const r = await fetch(p, opts);
      const text = await r.text().catch(() => "");
      let json = null;
      try { json = JSON.parse(text); } catch { /* ignore */ }
      return { status: r.status, text, json };
    },
    { method, path, body, token },
  );
  return res;
}

async function createDictionary(page, orgId) {
  console.log("[verify] create dictionary", OPERATION_KEY, PROPERTY_KEY);
  const opRes = await apiCall(page, {
    method: "POST",
    path: `/api/orgs/${orgId}/property-dictionary/operations`,
    body: { operation_key: OPERATION_KEY, operation_label: `Roundtrip ${Date.now()}`, is_active: true, sort_order: 1 },
  });
  if (opRes.status >= 400) throw new Error(`create operation failed: ${opRes.status} ${opRes.text}`);

  const propRes = await apiCall(page, {
    method: "POST",
    path: `/api/orgs/${orgId}/property-dictionary/operations/${OPERATION_KEY}/properties`,
    body: {
      property_key: PROPERTY_KEY,
      property_label: PROPERTY_LABEL,
      input_mode: "free_text",
      allow_custom_value: true,
      required: false,
      is_active: true,
      sort_order: 1,
    },
  });
  if (propRes.status >= 400) throw new Error(`create property failed: ${propRes.status} ${propRes.text}`);
}

async function deleteDictionary(page, orgId) {
  console.log("[verify] cleanup dictionary");
  await apiCall(page, { method: "DELETE", path: `/api/orgs/${orgId}/property-dictionary/operations/${OPERATION_KEY}/properties/${PROPERTY_KEY}` });
  // Operation endpoints only support POST/PATCH/GET; deactivate via PATCH.
  await apiCall(page, {
    method: "PATCH",
    path: `/api/orgs/${orgId}/property-dictionary/operations/${OPERATION_KEY}`,
    body: { operation_key: OPERATION_KEY, operation_label: `Roundtrip ${Date.now()}`, is_active: false, sort_order: 1 },
  });
}

async function createTestSession(page) {
  const createRes = await apiCall(page, {
    method: "POST",
    path: `/api/projects/${PROJECT_ID}/sessions?mode=quick_skeleton`,
    body: { title: `op-roundtrip ${Date.now()}` },
  });
  const sessionId = createRes.json?.session?.id || createRes.json?.id;
  if (!sessionId) throw new Error(`session create failed: ${createRes.status} ${createRes.text}`);

  const sessionBefore = await apiCall(page, { method: "GET", path: `/api/sessions/${sessionId}` });
  const baseVersion = sessionBefore.json?.diagram_state_version ?? sessionBefore.json?.bpmn_xml_version ?? 0;

  const putRes = await apiCall(page, {
    method: "PUT",
    path: `/api/sessions/${sessionId}/bpmn`,
    body: { xml: buildBpmnXml(PROPERTY_KEY, INITIAL_VALUE), base_diagram_state_version: baseVersion },
  });
  if (putRes.status >= 400) throw new Error(`BPMN PUT failed: ${putRes.status} ${putRes.text}`);
  return sessionId;
}

async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(300);
  }
}

async function openAccordionSection(page, sectionId) {
  const head = page.locator(`.sidebarAccordion[data-section-id="${sectionId}"] > .sidebarAccordionHead`);
  if ((await head.getAttribute("aria-expanded").catch(() => "false")) !== "true") {
    await head.click();
    await page.waitForTimeout(400);
  }
}

async function openOperationSection(page) {
  const toggle = page.locator('[data-testid="camunda-properties-group"] .sidebarPropertiesBlockTitle:has-text("Операция")').locator("..");
  const expanded = await toggle.getAttribute("aria-expanded").catch(() => "false");
  if (expanded !== "true") {
    await toggle.click();
    await page.waitForTimeout(400);
  }
}

async function openOperationPropertiesSection(page) {
  const toggle = page.locator('[data-testid="camunda-properties-group"] .sidebarPropertiesBlockTitle:has-text("Свойства операции")').locator("..");
  const expanded = await toggle.getAttribute("aria-expanded").catch(() => "false");
  if (expanded !== "true") {
    await toggle.click();
    await page.waitForTimeout(400);
  }
}

async function openAdditionalBpmnSection(page) {
  const toggle = page.locator('[data-testid="camunda-properties-group"] .sidebarPropertiesBlockTitle:has-text("Дополнительные BPMN-свойства")').locator("..");
  const expanded = await toggle.getAttribute("aria-expanded").catch(() => "false");
  if (expanded !== "true") {
    await toggle.click();
    await page.waitForTimeout(400);
  }
}

async function selectOperation(page, operationKey) {
  console.log("[verify] select operation", operationKey);
  await openOperationSection(page);
  const select = page.locator('[data-testid="camunda-properties-group"] select').first();
  await select.selectOption(operationKey);
  // wait for bundle network response
  await page.waitForResponse(
    (resp) => resp.url().includes(`/api/orgs/`) && resp.url().includes(`/property-dictionary/operations/${operationKey}`),
    { timeout: 10000 },
  );
  await page.waitForTimeout(500);
}

async function changeSchemaPropertyValue(page, value) {
  console.log("[verify] change schema property value to", value);
  await openOperationPropertiesSection(page);
  const input = page.locator('[data-testid="camunda-properties-group"] .sidebarSchemaPropertyRow input').first();
  await input.fill(value);
  await page.waitForTimeout(300);
}

async function clickSaveAll(page) {
  console.log("[verify] click Save All");
  const saveBtn = page.locator('.sidebarGlobalFooter button:has-text("Сохранить всё")');
  await saveBtn.click();
  // wait until busy state finishes
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('.sidebarGlobalFooter button');
      return btn && !btn.disabled && btn.textContent.trim() !== "Сохраняю...";
    },
    { timeout: 30000 },
  );
  await page.waitForTimeout(800);
}

async function getSchemaRowValue(page) {
  await openOperationPropertiesSection(page);
  const input = page.locator('[data-testid="camunda-properties-group"] .sidebarSchemaPropertyRow input').first();
  if (!(await input.isVisible().catch(() => false))) return null;
  return input.inputValue();
}

async function getCustomRowValue(page, key) {
  await openAdditionalBpmnSection(page);
  const row = page.locator('[data-testid="camunda-properties-group"] .sidebarBpmnPropertyItem').filter({
    has: page.locator(`.sidebarBpmnPropertyPreviewKey:has-text("${key}")`),
  });
  if (!(await row.isVisible().catch(() => false))) return null;
  return row.locator(".sidebarBpmnPropertyPreviewValue").textContent();
}

async function verifyState(page, label) {
  console.log("[verify] checking state:", label);
  const schemaValue = await getSchemaRowValue(page);
  const customValue = await getCustomRowValue(page, PROPERTY_KEY);
  console.log(`[verify] ${label}: schema=${schemaValue}, custom=${customValue}`);
  if (schemaValue !== CHANGED_VALUE) {
    throw new Error(`${label}: expected schema value "${CHANGED_VALUE}", got "${schemaValue}"`);
  }
  if (customValue !== null) {
    throw new Error(`${label}: expected property absent from custom rows, but found value "${customValue}"`);
  }
}

async function run() {
  console.log(`[verify] starting round-trip test at ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));

  try {
    await login(page);
    const projectRes = await apiCall(page, { method: "GET", path: `/api/projects/${PROJECT_ID}` });
    const orgId = projectRes.json?.org_id;
    if (!orgId) throw new Error(`project org_id not found: ${projectRes.text}`);
    console.log("[verify] orgId", orgId);

    await createDictionary(page, orgId);
    const sessionId = await createTestSession(page);
    console.log("[verify] session", sessionId);

    await page.goto(`${BASE_URL}/app?project=${PROJECT_ID}&session=${sessionId}`);
    await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.locator('[data-element-id="Task_verify"].djs-shape').first().click({ force: true });
    await page.waitForTimeout(800);
    await ensureSidebarOpen(page);
    await openAccordionSection(page, "properties");

    // Before selecting operation, the property should be in additional BPMN properties
    await openAdditionalBpmnSection(page);
    const beforeCustom = await getCustomRowValue(page, PROPERTY_KEY);
    console.log("[verify] custom value before operation selection:", beforeCustom);
    if (beforeCustom !== INITIAL_VALUE) {
      throw new Error(`expected custom value "${INITIAL_VALUE}" before operation selection, got "${beforeCustom}"`);
    }

    await selectOperation(page, OPERATION_KEY);
    await openOperationPropertiesSection(page);
    const schemaBefore = await getSchemaRowValue(page);
    console.log("[verify] schema value after operation selection:", schemaBefore);
    if (schemaBefore !== INITIAL_VALUE) {
      throw new Error(`expected schema value "${INITIAL_VALUE}" after operation selection, got "${schemaBefore}"`);
    }

    await changeSchemaPropertyValue(page, CHANGED_VALUE);
    await clickSaveAll(page);

    // Verify immediately after save + refresh
    await verifyState(page, "after save");

    // Full page reload should keep the property in schema rows
    console.log("[verify] full reload");
    await page.reload();
    await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.locator('[data-element-id="Task_verify"].djs-shape').first().click({ force: true });
    await page.waitForTimeout(800);
    await ensureSidebarOpen(page);
    await openAccordionSection(page, "properties");
    await verifyState(page, "after reload");

    console.log("[verify] SUCCESS: operation property stayed in schema rows after save and reload");
  } finally {
    try {
      const projectRes = await apiCall(page, { method: "GET", path: `/api/projects/${PROJECT_ID}` });
      const orgId = projectRes.json?.org_id;
      if (orgId) await deleteDictionary(page, orgId);
    } catch (e) {
      console.error("[verify] cleanup error", e);
    }
    await browser.close();
  }
}

run().catch((err) => {
  console.error("[verify] FAILED", err);
  process.exit(1);
});
