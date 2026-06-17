import { chromium } from "playwright-core";

const BASE_URL = process.env.TEST_BASE_URL || "http://clearvestnic.ru:5177";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";
const ROOT_SESSION_ID = process.env.TEST_ROOT_SESSION_ID || "4fe9e94289";
const CALL_ACTIVITY_ID = process.env.TEST_CALL_ACTIVITY_ID || "CallActivity_1";

const SUBPROCESS_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_root" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:startEvent id="SubStart_1" />
      <bpmn:task id="SubTask_1" name="Inside subprocess" />
      <bpmn:endEvent id="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Root">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_root">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="152" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_SubProcess_1" bpmnElement="SubProcess_1" isExpanded="false">
        <dc:Bounds x="250" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1">
        <dc:Bounds x="412" y="152" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function ensureOrgSelected(page) {
  try {
    await page.waitForSelector('h1:has-text("Выберите организацию")', { timeout: 10000 });
    console.log("[e2e] selecting org Default");
    await page.click('button:has-text("Default")');
    await page.waitForURL(/\/app/, { timeout: 15000 });
  } catch {
    // org screen not shown
  }
}

async function login(page) {
  console.log("[e2e] login");
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 15000 });
  await ensureOrgSelected(page);
  console.log("[e2e] logged in", page.url());
}

async function waitForCanvas(page) {
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(2000);
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: `E2E SubProcess ${Date.now()}` }),
        credentials: "include",
      });
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    },
    { projectId: PROJECT_ID, token: accessToken },
  );
  if (!createRes.ok) {
    console.error("[e2e] failed to create session", createRes);
    throw new Error("create session failed");
  }
  const rootSessionId = String(createRes.data?.id || "");
  if (!rootSessionId) throw new Error("no session id returned");
  console.log("[e2e] created root session", rootSessionId);

  const saveRes = await page.evaluate(
    async ({ sessionId, xml, token }) => {
      const res = await fetch(`/api/sessions/${sessionId}/bpmn`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ xml, source_action: "import_bpmn", base_diagram_state_version: 0 }),
        credentials: "include",
      });
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    },
    { sessionId: rootSessionId, xml: SUBPROCESS_BPMN_XML, token: accessToken },
  );
  if (!saveRes.ok) {
    console.error("[e2e] failed to save bpmn", saveRes);
    throw new Error("save bpmn failed");
  }
  console.log("[e2e] BPMN saved");
  return rootSessionId;
}

async function assertSingleClickDoesNotNavigate(page, elementId, rootSessionId) {
  const shapeSelector = `[data-element-id="${elementId}"].djs-shape`;
  await page.waitForSelector(shapeSelector, { timeout: 20000 });
  const box = await page.locator(shapeSelector).first().boundingBox();
  if (!box) throw new Error(`bounding box not found for ${elementId}`);
  console.log(`[e2e] ${elementId} box`, box);

  const urlBefore = page.url();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1500);
  const urlAfter = page.url();
  if (urlAfter !== urlBefore) {
    throw new Error(`Single click on ${elementId} navigated unexpectedly: ${urlAfter}`);
  }
  console.log(`[e2e] single click on ${elementId} stayed on`, urlAfter);
}

async function run() {
  console.log(`[e2e] starting browser for ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));

  await login(page);

  // Regression check: single click on CallActivity must only select, not navigate.
  const callActivityUrl = `${BASE_URL}/app?project=${PROJECT_ID}&session=${ROOT_SESSION_ID}`;
  console.log("[e2e] open CallActivity session", callActivityUrl);
  await page.goto(callActivityUrl);
  await ensureOrgSelected(page);
  await waitForCanvas(page);
  await assertSingleClickDoesNotNavigate(page, CALL_ACTIVITY_ID, ROOT_SESSION_ID);

  // Drill-down check: create a session with a collapsed SubProcess and use the
  // bpmn-js drilldown arrow overlay to navigate to the child session.
  const rootSessionId = await createTestSession(page);
  const subprocessUrl = `${BASE_URL}/app?project=${PROJECT_ID}&session=${rootSessionId}`;
  console.log("[e2e] open SubProcess session", subprocessUrl);
  await page.goto(subprocessUrl);
  await ensureOrgSelected(page);
  await waitForCanvas(page);

  // Single click on the SubProcess body must not navigate.
  await assertSingleClickDoesNotNavigate(page, "SubProcess_1", rootSessionId);

  // Click the drilldown arrow overlay. In headless Playwright the hover SVG can
  // sit above the arrow hit-area, so we trigger the button click directly.
  const drilldownSelector = ".bpmnStageHost .bjs-drilldown";
  await page.waitForSelector(drilldownSelector, { timeout: 20000 });
  console.log("[e2e] drilldown arrow visible");
  await page.locator(drilldownSelector).first().evaluate((node) => node.click());

  console.log("[e2e] waiting for child session URL");
  const childUrlPattern = new RegExp(`parent=${rootSessionId}`);
  await page.waitForURL(childUrlPattern, { timeout: 15000 });
  const childUrl = page.url();
  console.log("[e2e] current url", childUrl);
  const childSessionIdMatch = childUrl.match(/session=([a-f0-9]+)/);
  const childSessionId = childSessionIdMatch ? childSessionIdMatch[1] : "";
  if (!childSessionId) throw new Error("child session id not found in URL");
  console.log("[e2e] child session", childSessionId);

  const backBtn = page.locator('button[title="Назад"]');
  const backVisible = await backBtn.isVisible().catch(() => false);
  console.log("[e2e] back button visible", backVisible);
  if (!backVisible) throw new Error("Subprocess back button not found");

  const breadcrumbText = await backBtn.locator("..").textContent().catch(() => "");
  console.log("[e2e] breadcrumb text", breadcrumbText);

  const childHost = await page.locator(".bpmnStageHost").count();
  console.log("[e2e] child BPMN hosts", childHost);
  if (childHost < 1) throw new Error("Child subprocess BPMN canvas not found");

  console.log("[e2e] clicking back button to return to parent");
  await backBtn.click();
  await page.waitForURL(new RegExp(`session=${rootSessionId}`), { timeout: 15000 });
  const parentUrl = page.url();
  console.log("[e2e] returned to parent", parentUrl);
  if (parentUrl.includes("parent=")) {
    throw new Error(`still on a child session: ${parentUrl}`);
  }

  await browser.close();
  console.log("[e2e] SUCCESS: single click selects, drilldown arrow navigates");
}

run().catch((err) => {
  console.error("[e2e] FAILED", err);
  process.exit(1);
});
