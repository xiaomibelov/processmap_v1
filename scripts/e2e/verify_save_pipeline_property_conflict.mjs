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

function buildConflictingXml(baseXml) {
  // Add a second property so the server version bumps and the UI's stale base
  // version is rejected with HTTP 409.
  return baseXml.replace(
    '<camunda:property name="fromXmlProp" value="xml-value-42" />',
    '<camunda:property name="fromXmlProp" value="xml-value-42" />\n          <camunda:property name="conflictProp" value="conflict-value" />',
  );
}

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
  const accessToken = await page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || "").trim());
  if (!accessToken) throw new Error("access token not found in localStorage");

  console.log("[e2e] creating test session");
  const createRes = await page.evaluate(
    async ({ projectId, token }) => {
      const res = await fetch(`/api/projects/${projectId}/sessions?mode=quick_skeleton`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: `save-pipeline-conflict e2e ${Date.now()}` }),
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
  console.log("[e2e] seeded session", sessionId, "status", putRes.status);
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
  return page.locator('[data-testid="camunda-properties-group"] .sidebarPropertiesBlock--secondary, [data-testid="camunda-properties-group"] .sidebarPropertiesBlock').filter({
    has: page.locator('text=+ Добавить BPMN-свойство'),
  });
}

function propertyRowLocator(page, key) {
  return additionalPropertiesBlock(page).locator(".sidebarBpmnPropertyItem").filter({
    has: page.locator(`.sidebarBpmnPropertyPreviewKey:has-text("${key}")`),
  });
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

async function clickSaveProperties(page) {
  const block = additionalPropertiesBlock(page);
  const saveBtn = block.locator(".primaryBtn.sidebarPropertiesActionBtn").filter({
    has: page.locator('text=Сохранить'),
  });
  await saveBtn.click();
  console.log("[e2e] clicked save properties");
}

async function bumpServerVersion(sessionId, token) {
  const session = await (await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const currentXml = session?.bpmn_xml || "";
  const currentVersion = session?.diagram_state_version ?? session?.bpmn_xml_version ?? 0;
  const newXml = buildConflictingXml(currentXml || BPMN_XML);
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/bpmn`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ xml: newXml, base_diagram_state_version: currentVersion }),
  });
  const body = await res.json().catch(() => ({}));
  console.log("[e2e] bumped server version", res.status, "new", body?.diagram_state_version ?? body?.stored_diagram_state_version ?? "?");
  if (res.status >= 400) throw new Error(`bump failed: ${res.status} ${JSON.stringify(body)}`);
  return body;
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
  let lastPutStatus = 0;
  await page.route(/\/api\/sessions\/[^/]+\/bpmn/, async (route) => {
    const request = route.request();
    const body = request.postData() || "";
    console.log(`[route] ${request.method()} ${request.url()} body bytes=${body.length}`);
    if (request.method() === "PUT") {
      const response = await route.fetch();
      lastPutStatus = response.status();
      console.log(`[route] PUT response status=${lastPutStatus}`);
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));

  await login(page);
  const sessionId = await createTestSession(page);

  await openSession(page, sessionId);
  await page.waitForTimeout(2500);
  await selectTask(page);
  await page.waitForTimeout(1000);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);

  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");

  // Delete the property in the UI but do not save yet.
  await deleteProperty(page, "fromXmlProp");
  await verifyPropertyAbsent(page, "fromXmlProp");

  // Simulate another client bumping the server version while the UI still holds
  // the stale base diagram-state version.
  const accessToken = await page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || ""));
  await bumpServerVersion(sessionId, accessToken);

  // Now the UI save must be rejected with 409.
  lastPutStatus = 0;
  await clickSaveProperties(page);
  await page.waitForTimeout(2500);

  if (lastPutStatus !== 409) {
    throw new Error(`expected PUT status 409, got ${lastPutStatus}`);
  }
  console.log("[e2e] server returned 409 as expected");

  // ProcessStage should show the conflict toast and modal.
  const conflictToast = page.locator('[data-testid="process-save-ack-toast"]');
  const toastVisible = await conflictToast.isVisible().catch(() => false);
  const toastText = toastVisible ? await conflictToast.textContent() : "";
  console.log("[e2e] toast visible:", toastVisible, "text:", toastText?.trim());

  const modal = page.locator('[data-testid="diagram-save-conflict-modal"]');
  await modal.waitFor({ state: "visible", timeout: 10000 });
  console.log("[e2e] conflict modal visible");

  // Click "Остаться" — the optimistic change should roll back locally.
  await page.locator('[data-testid="diagram-save-conflict-modal-stay"]').click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "/tmp/e2e_conflict_after_stay.png" });
  console.log("[e2e] screenshot /tmp/e2e_conflict_after_stay.png");
  const groupTextAfterStay = await page.locator('[data-testid="camunda-properties-group"]').innerText().catch(() => "");
  console.log("[e2e] group text after stay:\n" + groupTextAfterStay);

  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");
  console.log("[e2e] optimistic delete rolled back after 409");

  await browser.close();
  console.log("[e2e] SUCCESS: property delete conflict modal and rollback verified");
}

run().catch((err) => {
  console.error("[e2e] FAILED", err);
  process.exit(1);
});
