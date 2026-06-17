import { chromium } from "playwright-core";
const BASE_URL = "http://clearvestnic.ru:5177";
const EMAIL = "admin@local";
const PASSWORD = "admin";
const PROJECT_ID = "0715811eb7";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_root" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:startEvent id="SubStart_1" />
      <bpmn:task id="SubTask_1" name="Inside" />
      <bpmn:endEvent id="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Root">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_root">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_SubProcess_1" bpmnElement="SubProcess_1" isExpanded="false"><dc:Bounds x="250" y="120" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1"><dc:Bounds x="412" y="152" width="36" height="36" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', m => console.log('PAGE', m.text()));
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 15000 });
  try { await page.click('button:has-text("Default")'); await page.waitForURL(/\/app/, { timeout: 10000 }); } catch {}
  const token = await page.evaluate(() => String(window.localStorage?.getItem("fpc_auth_access_token") || ""));
  const createRes = await page.evaluate(async ({ projectId, token }) => {
    const res = await fetch(`/api/projects/${projectId}/sessions?mode=quick_skeleton`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: `DBG ${Date.now()}` }), credentials: "include" });
    return res.json();
  }, { projectId: PROJECT_ID, token });
  const sid = createRes.id;
  await page.evaluate(async ({ sessionId, xml, token }) => {
    await fetch(`/api/sessions/${sessionId}/bpmn`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ xml, source_action: "import_bpmn", base_diagram_state_version: 0 }), credentials: "include" });
  }, { sessionId: sid, xml: BPMN_XML, token });
  await page.goto(`${BASE_URL}/app?project=${PROJECT_ID}&session=${sid}`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const btn = document.querySelector('.bjs-drilldown');
    if (btn) btn.click();
  });
  await page.waitForTimeout(2000);
  console.log('URL after direct click:', page.url());
  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
