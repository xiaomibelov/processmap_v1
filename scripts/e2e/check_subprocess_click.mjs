import { chromium } from "playwright-core";

const BASE_URL = process.env.TEST_BASE_URL || "http://clearvestnic.ru:5177";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";
const ROOT_SESSION_ID = process.env.TEST_ROOT_SESSION_ID || "4fe9e94289";
const CHILD_SESSION_ID = process.env.TEST_CHILD_SESSION_ID || "547f33d6ea";
const CALL_ACTIVITY_ID = process.env.TEST_CALL_ACTIVITY_ID || "CallActivity_1";

async function run() {
  console.log(`[e2e] starting browser for ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));

  // Login
  console.log("[e2e] login");
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 15000 });
  console.log("[e2e] logged in", page.url());

  // Handle org selection if presented
  async function ensureOrgSelected() {
    try {
      await page.waitForSelector('h1:has-text("Выберите организацию")', { timeout: 10000 });
      console.log("[e2e] selecting org Default");
      await page.click('button:has-text("Default")');
      await page.waitForURL(/\/app/, { timeout: 15000 });
    } catch {
      // org screen not shown
    }
  }

  // Open root session
  const sessionUrl = `${BASE_URL}/app?project=${PROJECT_ID}&session=${ROOT_SESSION_ID}`;
  console.log("[e2e] open session", sessionUrl);
  await page.goto(sessionUrl);
  await ensureOrgSelected();

  // Wait for BPMN canvas
  try {
    await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  } catch (e) {
    console.error("[e2e] BPMN canvas not found");
    await page.screenshot({ path: "/tmp/e2e_no_canvas.png", fullPage: true });
    console.log("[e2e] current url:", page.url());
    throw e;
  }
  await page.waitForTimeout(2000);

  // Wait for CallActivity shape to be marked clickable
  const callActivitySelector = `[data-element-id="${CALL_ACTIVITY_ID}"].fpc-call-activity-clickable`;
  try {
    await page.waitForSelector(callActivitySelector, { timeout: 20000 });
  } catch (e) {
    console.error("[e2e] clickable call activity not found");
    await page.screenshot({ path: "/tmp/e2e_no_clickable.png", fullPage: true });
    throw e;
  }
  console.log("[e2e] call activity found", CALL_ACTIVITY_ID);

  // Click center of the CallActivity shape
  const box = await page.locator(callActivitySelector).first().boundingBox();
  if (!box) throw new Error("CallActivity bounding box not found");
  console.log("[e2e] call activity box", box);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // Wait for navigation to child session
  console.log("[e2e] waiting for child session URL", CHILD_SESSION_ID);
  await page.waitForURL(new RegExp(`session=${CHILD_SESSION_ID}`), { timeout: 15000 });
  const url = page.url();
  console.log("[e2e] current url", url);

  // Check breadcrumbs
  const breadcrumbs = await page.locator(".subprocess-breadcrumbs").textContent().catch(() => "");
  console.log("[e2e] breadcrumbs", breadcrumbs);

  await browser.close();

  if (!url.includes(CHILD_SESSION_ID)) {
    throw new Error(`Expected URL to include child session ${CHILD_SESSION_ID}, got ${url}`);
  }
  console.log("[e2e] SUCCESS: subprocess navigation from canvas works");
}

run().catch((err) => {
  console.error("[e2e] FAILED", err);
  process.exit(1);
});
