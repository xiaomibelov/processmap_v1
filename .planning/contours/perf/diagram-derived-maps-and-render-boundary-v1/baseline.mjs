import { chromium } from "playwright";

const BASE = "http://clearvestnic.ru:5180";
const PROJECT_ID = "b1c8a56b6e";
const SESSION_ID = "4c515d1c6e";

async function measure(page, label) {
  const totalDOM = await page.evaluate(() => document.querySelectorAll("*").length);
  const svgDOM = await page.evaluate(() => document.querySelectorAll("svg *").length);
  const overlays = await page.evaluate(() => document.querySelectorAll(".fpcPropertyOverlay").length);
  const djsOverlays = await page.evaluate(() => document.querySelectorAll(".djs-overlay").length);
  const focusDim = await page.evaluate(() => document.querySelectorAll(".fpcFocusDim").length);
  const bendpoints = await page.evaluate(() => document.querySelectorAll(".djs-bendpoint").length);
  const segmentDraggers = await page.evaluate(() => document.querySelectorAll(".djs-segment-dragger").length);
  const analyticsSelected = await page.evaluate(() => document.querySelectorAll(".fpcAnalyticsSelected").length);
  return {
    label,
    totalDOM,
    svgDOM,
    overlays,
    djsOverlays,
    focusDim,
    bendpoints,
    segmentDraggers,
    analyticsSelected,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  // Collect network PUT/PATCH/versions
  const networkCalls = [];
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (method === "PUT" || method === "PATCH" || url.includes("/versions?")) {
      networkCalls.push({ method, url: url.replace(/\?.*$/, "") });
    }
  });

  console.log("Navigating to project...");
  await page.goto(`${BASE}/projects/${PROJECT_ID}/sessions/${SESSION_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Click Diagram tab if not already active
  const diagramTab = await page.locator('text=Diagram').first();
  if (await diagramTab.isVisible().catch(() => false)) {
    await diagramTab.click();
    await page.waitForTimeout(2000);
  }

  const results = [];

  // Scenario A: Idle
  results.push(await measure(page, "A_idle"));
  await page.waitForTimeout(500);
  results.push(await measure(page, "A_idle_2"));

  // Scenario B: Select 10 elements
  const elements = await page.locator(".djs-element").all();
  const selectable = elements.slice(0, 10);
  for (let i = 0; i < selectable.length; i++) {
    const before = await measure(page, `B_select_${i}_before`);
    await selectable[i].click();
    await page.waitForTimeout(300);
    const after = await measure(page, `B_select_${i}_after`);
    results.push({ ...after, deltaDOM: after.totalDOM - before.totalDOM, deltaSVG: after.svgDOM - before.svgDOM });
  }

  // Scenario C: Hover 10 elements
  for (let i = 0; i < 10; i++) {
    const el = elements[i] || selectable[i];
    if (!el) continue;
    await el.hover();
    await page.waitForTimeout(200);
    results.push(await measure(page, `C_hover_${i}`));
  }

  // Scenario D: Pan/zoom 5 cycles
  const canvas = await page.locator(".djs-container svg").first();
  for (let i = 0; i < 5; i++) {
    const before = await measure(page, `D_pan_${i}_before`);
    await canvas.dragTo(canvas, { sourcePosition: { x: 100, y: 100 }, targetPosition: { x: 200, y: 200 } });
    await page.waitForTimeout(300);
    const after = await measure(page, `D_pan_${i}_after`);
    results.push({ ...after, deltaDOM: after.totalDOM - before.totalDOM, deltaSVG: after.svgDOM - before.svgDOM });
    await canvas.evaluate((el) => el.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true })));
    await page.waitForTimeout(300);
    results.push(await measure(page, `D_zoom_${i}`));
  }

  // Scenario E: Switch Analysis↔Diagram
  const analysisTab = await page.locator('text=Analysis').first();
  if (await analysisTab.isVisible().catch(() => false)) {
    await analysisTab.click();
    await page.waitForTimeout(1500);
    results.push(await measure(page, "E_analysis"));
    await diagramTab.click();
    await page.waitForTimeout(1500);
    results.push(await measure(page, "E_diagram_back"));
  }

  await browser.close();

  console.log(JSON.stringify({
    results,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
    networkCalls: networkCalls.slice(0, 50),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
