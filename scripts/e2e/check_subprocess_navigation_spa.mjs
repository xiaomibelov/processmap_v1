import { chromium } from "playwright-core";

const BASE_URL = process.env.TEST_BASE_URL || "http://clearvestnic.ru:5177";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";
const ROOT_SESSION_ID = process.env.TEST_ROOT_SESSION_ID || "4fe9e94289";

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
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: `E2E SPA Navigation ${Date.now()}` }),
      });
      return res.json();
    },
    { projectId: PROJECT_ID, token: accessToken },
  );
  if (!createRes?.session?.id) throw new Error(`session create failed: ${JSON.stringify(createRes)}`);
  const rootSessionId = createRes.session.id;

  await page.evaluate(
    async ({ sessionId, xml, token }) => {
      const res = await fetch(`/api/sessions/${sessionId}/bpmn-xml`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ xml }),
      });
      return res.json();
    },
    { sessionId: rootSessionId, xml: SUBPROCESS_BPMN_XML, token: accessToken },
  );
  console.log("[e2e] BPMN saved");
  return rootSessionId;
}

async function readCanvasViewbox(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".bpmnStageHost");
    if (!host) return null;
    const svg = host.querySelector("svg");
    if (!svg) return null;
    // Read the SVG viewBox attribute as a cheap proxy for canvas pan/zoom.
    const vb = svg.getAttribute("viewBox");
    const zoom = Number(window.getComputedStyle(svg).getPropertyValue("--fpc-zoom") || 1);
    return { viewBox: vb, zoom };
  });
}

async function run() {
  console.log(`[e2e] starting browser for ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  let fullReloadCount = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      fullReloadCount += 1;
      console.log("[e2e] main frame navigated (full reload)");
    }
  });
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));

  await login(page);

  const rootSessionId = await createTestSession(page);
  const sessionUrl = `${BASE_URL}/app?project=${PROJECT_ID}&session=${rootSessionId}`;
  console.log("[e2e] open test session", sessionUrl);
  await page.goto(sessionUrl);
  await ensureOrgSelected(page);
  await waitForCanvas(page);

  const reloadsBeforeDrilldown = fullReloadCount;

  const drilldownSelector = ".bpmnStageHost .bjs-drilldown";
  await page.waitForSelector(drilldownSelector, { timeout: 20000 });
  console.log("[e2e] drilldown arrow visible");
  await page.locator(drilldownSelector).first().evaluate((node) => node.click());

  await page.waitForFunction(
    (sid) => !window.location.href.includes(`session=${sid}`),
    rootSessionId,
    { timeout: 15000 },
  );
  const childUrl = page.url();
  console.log("[e2e] child url", childUrl);
  if (!childUrl.includes("parent=")) throw new Error(`child URL missing parent param: ${childUrl}`);

  const reloadsAfterDrilldown = fullReloadCount;
  if (reloadsAfterDrilldown !== reloadsBeforeDrilldown) {
    throw new Error(`drilldown triggered ${reloadsAfterDrilldown - reloadsBeforeDrilldown} full page reload(s)`);
  }
  console.log("[e2e] drilldown is SPA (no full reload)");

  await page.waitForSelector('[data-testid="diagram-ready"]', { timeout: 15000 });
  const breadcrumb = await page.locator('[data-testid="subprocess-breadcrumbs"]').isVisible().catch(() => false);
  if (!breadcrumb) throw new Error("subprocess breadcrumb not visible");
  console.log("[e2e] breadcrumb visible");

  const viewportInChild = await readCanvasViewbox(page);
  console.log("[e2e] child viewport", viewportInChild);

  const backBtn = page.locator('button[title="Назад"]');
  if (!(await backBtn.isVisible().catch(() => false))) throw new Error("subprocess back button not found");

  const reloadsBeforeBack = fullReloadCount;
  await backBtn.click();
  await page.waitForURL(new RegExp(`session=${rootSessionId}`), { timeout: 15000 });
  const parentUrl = page.url();
  console.log("[e2e] returned to parent", parentUrl);
  if (parentUrl.includes("parent=")) throw new Error(`still on a child session: ${parentUrl}`);

  const reloadsAfterBack = fullReloadCount;
  if (reloadsAfterBack !== reloadsBeforeBack) {
    throw new Error(`back navigation triggered ${reloadsAfterBack - reloadsBeforeBack} full page reload(s)`);
  }
  console.log("[e2e] back navigation is SPA (no full reload)");

  await browser.close();
  console.log("[e2e] SUCCESS: subprocess SPA navigation, breadcrumb, no reload");
}

run().catch((err) => {
  console.error("[e2e] FAILED", err);
  process.exit(1);
});
