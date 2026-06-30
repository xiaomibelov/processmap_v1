import { chromium } from "playwright-core";

const BASE_URL = process.env.TEST_BASE_URL || "http://clearvestnic.ru:5177";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
  console.log("[verify] login");
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
  console.log("[verify] logged in", page.url());
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

  console.log("[verify] creating test session");
  const createRes = await page.evaluate(
    async ({ projectId, token }) => {
      const res = await fetch(`/api/projects/${projectId}/sessions?mode=quick_skeleton`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Verify BPMN props ${Date.now()}` }),
      });
      return res.json();
    },
    { projectId: PROJECT_ID, token: accessToken },
  );
  if (!createRes?.session?.id) throw new Error(`session create failed: ${JSON.stringify(createRes)}`);
  const sessionId = createRes.session.id;

  await page.evaluate(
    async ({ sessionId: sid, xml, token }) => {
      const res = await fetch(`/api/sessions/${sid}/bpmn`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ xml }),
      });
      return res.json();
    },
    { sessionId, xml: BPMN_XML, token: accessToken },
  );
  console.log("[verify] BPMN saved to session", sessionId);
  return sessionId;
}

async function run() {
  console.log(`[verify] starting browser for ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));

  await login(page);
  const sessionId = await createTestSession(page);

  const sessionUrl = `${BASE_URL}/app?project=${PROJECT_ID}&session=${sessionId}`;
  console.log("[verify] open session", sessionUrl);
  await page.goto(sessionUrl);
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);

  const taskSelector = '[data-element-id="Task_verify"]';
  await page.waitForSelector(taskSelector, { timeout: 15000 });
  console.log("[verify] task element found on canvas");
  await page.locator(taskSelector).first().click();
  await page.waitForTimeout(500);

  const groupSelector = '[data-testid="camunda-properties-group"]';
  await page.waitForSelector(groupSelector, { timeout: 10000 });
  console.log("[verify] camunda properties group visible");

  const propertyItem = await page.locator(`${groupSelector} .sidebarBpmnPropertyItem`).filter({
    has: page.locator('.sidebarBpmnPropertyPreviewKey:has-text("fromXmlProp")'),
  });
  const isVisible = await propertyItem.isVisible().catch(() => false);
  if (!isVisible) {
    const keys = await page.locator(`${groupSelector} .sidebarBpmnPropertyPreviewKey`).allTextContents();
    throw new Error(`expected property "fromXmlProp" not found. keys: ${JSON.stringify(keys)}`);
  }
  const value = await propertyItem.locator(".sidebarBpmnPropertyPreviewValue").textContent();
  console.log("[verify] property visible in sidebar:", value?.trim());

  // Full page reload should still show the XML-originated property (C path).
  console.log("[verify] full reload");
  await page.reload();
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.locator(taskSelector).first().click();
  await page.waitForTimeout(500);
  await page.waitForSelector(groupSelector, { timeout: 10000 });

  const propertyItemAfterReload = await page.locator(`${groupSelector} .sidebarBpmnPropertyItem`).filter({
    has: page.locator('.sidebarBpmnPropertyPreviewKey:has-text("fromXmlProp")'),
  });
  const visibleAfterReload = await propertyItemAfterReload.isVisible().catch(() => false);
  if (!visibleAfterReload) {
    const keys = await page.locator(`${groupSelector} .sidebarBpmnPropertyPreviewKey`).allTextContents();
    throw new Error(`after reload property "fromXmlProp" not found. keys: ${JSON.stringify(keys)}`);
  }
  const valueAfterReload = await propertyItemAfterReload.locator(".sidebarBpmnPropertyPreviewValue").textContent();
  console.log("[verify] property visible after reload:", valueAfterReload?.trim());

  await browser.close();
  console.log("[verify] SUCCESS: BPMN XML property visible in sidebar before and after reload");
}

run().catch((err) => {
  console.error("[verify] FAILED", err);
  process.exit(1);
});
