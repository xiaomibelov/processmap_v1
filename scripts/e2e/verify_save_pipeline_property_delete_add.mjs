import { chromium } from "playwright-core";

const BASE_URL = process.env.TEST_BASE_URL || "http://clearvestnic.ru:5177";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_verify" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_verify" name="Verify me">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="fromXmlProp" value="xml-value-42" />
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

async function login(page) {
  console.log("[e2e] login");
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]', { timeout: 15000 });
  await page.waitForURL(/\/app/, { timeout: 15000 });
  try {
    await page.waitForSelector('h1:has-text("Выберите организацию")', { timeout: 5000 });
    await page.click('button:has-text("Default")');
    await page.waitForURL(/\/app/, { timeout: 15000 });
  } catch {
    // org screen not shown
  }
  console.log("[e2e] logged in", page.url());
}

async function createTestSession(page) {
  const accessToken = await page.evaluate(() => {
    try {
      return String(window.localStorage?.getItem("fpc_auth_access_token") || "").trim();
    } catch {
      return "";
    }
  });
  if (!accessToken) throw new Error("access token not found in localStorage");

  console.log("[e2e] creating test session");
  const createRes = await page.evaluate(
    async ({ projectId, token }) => {
      const res = await fetch(`/api/projects/${projectId}/sessions?mode=quick_skeleton`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: `save-pipeline e2e ${Date.now()}` }),
      });
      return res.json();
    },
    { projectId: PROJECT_ID, token: accessToken },
  );
  const sessionId = createRes?.session?.id || createRes?.id;
  if (!sessionId) throw new Error(`session create failed: ${JSON.stringify(createRes)}`);

  const sessionBefore = await page.evaluate(
    async ({ sid, token }) => {
      const res = await fetch(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    { sid: sessionId, token: accessToken },
  );
  const baseVersion = sessionBefore?.diagram_state_version ?? sessionBefore?.bpmn_xml_version ?? 0;

  const putRes = await page.evaluate(
    async ({ sessionId: sid, xml, token, version }) => {
      const res = await fetch(`/api/sessions/${sid}/bpmn`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ xml, base_diagram_state_version: version }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    { sessionId, xml: BPMN_XML, token: accessToken, version: baseVersion },
  );
  if (putRes.status >= 400) throw new Error(`BPMN PUT failed: ${putRes.status} ${JSON.stringify(putRes.body)}`);
  console.log("[e2e] BPMN PUT response", putRes.status, JSON.stringify(putRes.body).slice(0, 400));
  console.log("[e2e] BPMN saved to session", sessionId);
  return sessionId;
}

async function openSession(page, sessionId) {
  const sessionUrl = `${BASE_URL}/app?project=${PROJECT_ID}&session=${sessionId}`;
  console.log("[e2e] open session", sessionUrl);
  await page.goto(sessionUrl);
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
}

async function selectTask(page) {
  const taskSelector = '[data-element-id="Task_verify"].djs-shape';
  await page.waitForSelector(taskSelector, { timeout: 15000 });
  const box = await page.locator(taskSelector).first().boundingBox();
  console.log("[e2e] task bbox:", JSON.stringify(box));
  if (!box) {
    await page.locator(taskSelector).first().click({ force: true });
  } else {
    // Click the upper-left quadrant to avoid the horizontal sequence flow line.
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  }
  await page.waitForTimeout(800);
}

async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(300);
  }
}

async function expandCamundaPropertiesGroup(page) {
  const groupSelector = '[data-testid="camunda-properties-group"]';
  await page.waitForSelector(groupSelector, { timeout: 10000, state: "visible" });

  await page.evaluate((sel) => {
    const group = document.querySelector(sel);
    if (!group) return;
    const accordion = group.closest(".sidebarAccordion");
    const head = accordion?.querySelector(":scope > .sidebarAccordionHead");
    if (head && head.getAttribute("aria-expanded") !== "true") head.click();
  }, groupSelector);
  await page.waitForTimeout(400);

  const innerToggle = page.locator(`${groupSelector} .sidebarPropertiesBlockToggle`).filter({
    has: page.locator('.sidebarPropertiesBlockTitle:has-text("Дополнительные BPMN-свойства")'),
  });
  if (await innerToggle.isVisible().catch(() => false)) {
    if ((await innerToggle.getAttribute("aria-expanded")) !== "true") {
      await innerToggle.click({ force: true });
      await page.waitForTimeout(400);
    }
  }
}

function additionalPropertiesBlock(page) {
  // The "additional properties" block is the one that contains the add-property
  // button. Relying on the title is brittle because the block may be hidden when
  // it has no rows after a delete/reload.
  return page.locator('[data-testid="camunda-properties-group"] .sidebarPropertiesBlock--secondary, [data-testid="camunda-properties-group"] .sidebarPropertiesBlock').filter({
    has: page.locator('text=+ Добавить BPMN-свойство'),
  });
}

function propertyRowLocator(page, key) {
  return additionalPropertiesBlock(page).locator(".sidebarBpmnPropertyItem").filter({
    has: page.locator(`.sidebarBpmnPropertyPreviewKey:has-text("${key}")`),
  });
}

async function waitForSaveToast(page) {
  try {
    const toast = page.locator('[data-testid="process-save-ack-toast"]');
    await toast.waitFor({ state: "visible", timeout: 5000 });
    const text = await toast.locator('[data-testid="process-save-ack-toast-description"]').textContent()
      .catch(() => toast.textContent());
    console.log("[e2e] toast:", text?.trim());
    return text?.trim() || "";
  } catch {
    return "";
  }
}

async function verifyPropertyVisible(page, key, value) {
  const row = propertyRowLocator(page, key);
  await row.waitFor({ state: "visible", timeout: 10000 });
  const actualValue = await row.locator(".sidebarBpmnPropertyPreviewValue").textContent();
  if (actualValue?.trim() !== value) {
    throw new Error(`expected ${key}=${value}, got ${actualValue?.trim()}`);
  }
  console.log(`[e2e] property visible: ${key}=${actualValue?.trim()}`);
}

async function verifyPropertyAbsent(page, key) {
  const row = propertyRowLocator(page, key);
  const visible = await row.isVisible().catch(() => false);
  if (visible) {
    const keys = await page.locator('[data-testid="camunda-properties-group"] .sidebarBpmnPropertyPreviewKey').allTextContents();
    throw new Error(`expected ${key} to be absent, but found keys: ${JSON.stringify(keys)}`);
  }
  console.log(`[e2e] property absent: ${key}`);
}

async function deleteProperty(page, key) {
  const row = propertyRowLocator(page, key);
  const deleteBtn = row.locator(`button[aria-label="Удалить BPMN-свойство ${key}"]`);
  await deleteBtn.click();
  await page.waitForTimeout(2000);
  console.log(`[e2e] clicked delete for ${key}`);
}

async function addProperty(page, key, value) {
  const block = additionalPropertiesBlock(page);
  const addBtn = block.locator(".secondaryBtn.sidebarPropertiesActionBtn").filter({
    has: page.locator('text=+ Добавить BPMN-свойство'),
  });
  await addBtn.click();
  await page.waitForTimeout(300);

  const rows = block.locator(".sidebarBpmnPropertyItem");
  await rows.last().waitFor({ state: "visible", timeout: 5000 });
  const lastRow = rows.last();
  const editBtn = lastRow.locator(".sidebarBpmnPropertyEditBtn");
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    await page.waitForTimeout(200);
  }
  const inputs = lastRow.locator(".sidebarBpmnPropertyEditor input");
  await inputs.nth(0).fill(key);
  await inputs.nth(1).fill(value);
  console.log(`[e2e] filled new property ${key}=${value}`);
}

async function clickSaveProperties(page) {
  const block = additionalPropertiesBlock(page);
  const saveBtn = block.locator(".primaryBtn.sidebarPropertiesActionBtn").filter({
    has: page.locator('text=Сохранить'),
  });
  await saveBtn.click();
  console.log("[e2e] clicked save properties");
  try {
    await saveBtn.locator('text=Сохраняю...').waitFor({ state: "visible", timeout: 5000 });
    console.log("[e2e] save in progress");
  } catch {
    // may be too fast
  }
  await saveBtn.locator('text=Сохранить').waitFor({ state: "visible", timeout: 30000 });
  console.log("[e2e] save button ready again");
}

async function run() {
  console.log(`[e2e] starting browser for ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_BPMN__ = true;
    try { window.localStorage?.setItem("fpc_debug_bpmn", "1"); } catch {}
  });
  let putIndex = 0;
  await page.route(/\/api\/sessions\/[^/]+\/bpmn/, async (route) => {
    const request = route.request();
    const body = request.postData() || "";
    console.log(`[route] ${request.method()} ${request.url()} body bytes=${body.length}`);
    if (request.method() === "PUT") {
      putIndex += 1;
      const fs = await import("fs");
      fs.writeFileSync(`/tmp/put_${putIndex}.json`, body);
      try {
        const parsed = JSON.parse(body);
        console.log(`[route] PUT #${putIndex} source_action=${parsed.source_action || "(none)"}`);
      } catch {}
      const response = await route.fetch();
      const respBody = await response.text().catch(() => "");
      console.log(`[route] PUT #${putIndex} response status=${response.status()} body=${respBody.slice(0, 200)}`);
      await route.fulfill({ response, body: respBody });
      return;
    }
    await route.continue();
  });
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));


  await login(page);
  const sessionId = await createTestSession(page);

  const accessToken2 = await page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || ""));
  const sessionCheck = await page.evaluate(
    async ({ sid, token }) => {
      const res = await fetch(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    { sid: sessionId, token: accessToken2 },
  );
  console.log("[e2e] session diagram_state_version", sessionCheck?.diagram_state_version);
  console.log("[e2e] bpmn_xml length", (sessionCheck?.bpmn_xml || "").length);
  console.log("[e2e] bpmn_xml contains prop", (sessionCheck?.bpmn_xml || "").includes('fromXmlProp'));
  console.log("[e2e] camunda ext keys", Object.keys(sessionCheck?.camunda_extensions_by_element_id || {}));

  await openSession(page, sessionId);
  await page.waitForTimeout(2500);
  await selectTask(page);
  await page.waitForTimeout(1000);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);

  const debugState = await page.evaluate(() => ({
    selectedElementId: window.__FPC_E2E_SELECTED_ELEMENT_ID__,
    draftCamundaKeys: Object.keys(window.__FPC_E2E_DRAFT__?.bpmn_meta?.camunda_extensions_by_element_id || {}),
    draftXmlLen: (window.__FPC_E2E_DRAFT__?.bpmn_xml || "").length,
    draftXmlHasProp: (window.__FPC_E2E_DRAFT__?.bpmn_xml || "").includes("fromXmlProp"),
  }));
  console.log("[e2e] debug state:", JSON.stringify(debugState));

  const groupText = await page.locator('[data-testid="camunda-properties-group"]').innerText();
  console.log("[e2e] group text:\n" + groupText);

  await page.screenshot({ path: "/tmp/e2e_before_verify.png" });
  console.log("[e2e] screenshot /tmp/e2e_before_verify.png");

  // 1. Initial property from XML is visible.
  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");

  // 2. Delete property and save.
  await deleteProperty(page, "fromXmlProp");
  const afterDeleteCount = await additionalPropertiesBlock(page).locator(".sidebarBpmnPropertyItem").count();
  console.log("[e2e] additional property row count after delete:", afterDeleteCount);
  await page.waitForTimeout(500);
  await clickSaveProperties(page);
  await page.waitForTimeout(1000);
  const afterSaveText = await page.locator('[data-testid="camunda-properties-group"]').innerText();
  console.log("[e2e] group text after save:\n" + afterSaveText);
  const debugAfterSave = await page.evaluate(() => ({
    selectedElementId: window.__FPC_E2E_SELECTED_ELEMENT_ID__,
    draftCamundaKeys: Object.keys(window.__FPC_E2E_DRAFT__?.bpmn_meta?.camunda_extensions_by_element_id || {}),
    draftXmlLen: (window.__FPC_E2E_DRAFT__?.bpmn_xml || "").length,
    draftXmlProp: (window.__FPC_E2E_DRAFT__?.bpmn_xml || "").includes("fromXmlProp"),
    draftXmlSnippet: (window.__FPC_E2E_DRAFT__?.bpmn_xml || "").replace(/\n/g, "").slice(0, 700),
  }));
  console.log("[e2e] debug after save:", JSON.stringify(debugAfterSave));

  const tokenAfterDelete = await page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || ""));
  const sessionAfterDelete = await page.evaluate(
    async ({ sid, token }) => {
      const res = await fetch(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    { sid: sessionId, token: tokenAfterDelete },
  );
  const xmlAfterDelete = sessionAfterDelete?.bpmn_xml || "";
  console.log("[e2e] xml after delete contains fromXmlProp:", xmlAfterDelete.includes("fromXmlProp"));
  console.log("[e2e] session camunda ext keys after delete:", Object.keys(sessionAfterDelete?.camunda_extensions_by_element_id || {}));
  console.log("[e2e] session camunda ext after delete:", JSON.stringify(sessionAfterDelete?.camunda_extensions_by_element_id || {}));

  const modelerXmlAfterDelete = await page.evaluate(async () => {
    try {
      // Use the same API the lifecycle flush uses.
      const snapshot = await window.__FPC_E2E_BPMN_API__?.getRuntimeXmlSnapshot?.({ format: true });
      if (snapshot?.xml) return String(snapshot.xml);
      const m = window.__FPC_E2E_MODELER__;
      if (!m || typeof m.saveXML !== "function") return "";
      const out = await m.saveXML({ format: true });
      return String(out?.xml || "");
    } catch (e) {
      return String(e?.message || e);
    }
  });
  console.log("[e2e] modeler xml after delete len:", modelerXmlAfterDelete.length, "prop:", modelerXmlAfterDelete.includes("fromXmlProp"));
  console.log("[e2e] modeler xml snippet:", modelerXmlAfterDelete.replace(/\n/g, "").slice(0, 700));

  // 3. Reload and verify property is gone.
  await page.reload();
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  const sessionAfterReload = await page.evaluate(
    async ({ sid, token }) => {
      const res = await fetch(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    { sid: sessionId, token: tokenAfterDelete },
  );
  console.log("[e2e] after reload session bpmn_xml prop:", (sessionAfterReload?.bpmn_xml || "").includes("fromXmlProp"));
  console.log("[e2e] after reload session camunda ext keys:", Object.keys(sessionAfterReload?.camunda_extensions_by_element_id || {}));
  const modelerXmlAfterReload = await page.evaluate(async () => {
    try {
      const snapshot = await window.__FPC_E2E_BPMN_API__?.getRuntimeXmlSnapshot?.({ format: true });
      if (snapshot?.xml) return String(snapshot.xml);
      const m = window.__FPC_E2E_MODELER__;
      if (!m || typeof m.saveXML !== "function") return "";
      const out = await m.saveXML({ format: true });
      return String(out?.xml || "");
    } catch (e) {
      return String(e?.message || e);
    }
  });
  console.log("[e2e] modeler xml after reload prop:", modelerXmlAfterReload.includes("fromXmlProp"));
  const debugAfterReload = await page.evaluate(() => ({
    draftCamundaKeys: Object.keys(window.__FPC_E2E_DRAFT__?.bpmn_meta?.camunda_extensions_by_element_id || {}),
    draftXmlProp: (window.__FPC_E2E_DRAFT__?.bpmn_xml || "").includes("fromXmlProp"),
    storeXmlProp: (window.__FPC_E2E_BPMN_API__?.getState?.()?.xml || "").includes("fromXmlProp"),
  }));
  console.log("[e2e] debug after reload pre-select:", JSON.stringify(debugAfterReload));
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await verifyPropertyAbsent(page, "fromXmlProp");

  // 4. Add a new property and save.
  await addProperty(page, "newProp", "new-value");
  await clickSaveProperties(page);
  await page.waitForTimeout(1000);

  const tokenAfterAdd = await page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || ""));
  const sessionAfterAdd = await page.evaluate(
    async ({ sid, token }) => {
      const res = await fetch(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    { sid: sessionId, token: tokenAfterAdd },
  );
  console.log("[e2e] after add save server xml contains newProp:", (sessionAfterAdd?.bpmn_xml || "").includes("newProp"));
  console.log("[e2e] after add save server camunda ext keys:", Object.keys(sessionAfterAdd?.camunda_extensions_by_element_id || {}));

  // 5. Reload and verify new property is present.
  await page.reload();
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await verifyPropertyVisible(page, "newProp", "new-value");

  await browser.close();
  console.log("[e2e] SUCCESS: property delete/add roundtrip verified");
}

run().catch((err) => {
  console.error("[e2e] FAILED", err);
  process.exit(1);
});
