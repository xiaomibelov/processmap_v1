const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.STAGE_BASE || "http://clearvestnic.ru:5177";
const OUT = path.join(__dirname, "profiles");
fs.mkdirSync(OUT, { recursive: true });

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill('input[type="email"]', "admin@local");
  await page.fill('input[type="password"]', "admin");
  await page.click('button[type="submit"]');
  await page.waitForURL(url => url.pathname === "/app", { timeout: 15000 });
  await page.click("text=Default");
  await page.waitForTimeout(3000);
}

async function collectProfile(page, scenarioName) {
  const cdp = await page.context().newCDPSession(page);
  const traceEvents = [];
  let traceCompleteResolve;
  const traceCompletePromise = new Promise((resolve) => { traceCompleteResolve = resolve; });

  cdp.on("Tracing.dataCollected", (payload) => {
    traceEvents.push(...(payload.value || []));
  });
  cdp.on("Tracing.tracingComplete", () => {
    fs.writeFileSync(path.join(OUT, `${scenarioName}_trace.json`), JSON.stringify(traceEvents));
    traceCompleteResolve();
  });

  const networkLog = [];
  page.on("request", (req) => {
    networkLog.push({
      time: Date.now(),
      method: req.method(),
      url: req.url(),
    });
  });

  const consoleLog = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/FPC-OVERLAY|selection|note|property|Camunda|reconcile|emitElementSelection/i.test(text)) {
      consoleLog.push({ time: Date.now(), type: msg.type(), text });
    }
  });

  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame," +
      "v8,disabled-by-default-v8.cpu_profiler,disabled-by-default-v8.cpu_profiler.hires",
    options: "sampling-frequency=10000",
    transferMode: "ReportEvents",
  });

  await page.goto(`${BASE}/app?project=d3b9ae9fda&session=f1f727aee7`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".djs-container svg, .bjs-container svg, .bpmnStageHost svg", { timeout: 30000 });
  await page.waitForTimeout(3000);

  const openBtn = page.locator(".leftSidebarHandleOpenBtn").first();
  if (await openBtn.count()) await openBtn.click({ force: true });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    window.__selectionAudit = {
      mutations: 0,
      addedNodes: 0,
      removedNodes: 0,
      longTasks: [],
    };
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        window.__selectionAudit.mutations++;
        window.__selectionAudit.addedNodes += r.addedNodes.length;
        window.__selectionAudit.removedNodes += r.removedNodes.length;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: false });
    const taskObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__selectionAudit.longTasks.push(e);
    });
    taskObs.observe({ entryTypes: ["longtask"] });
  });

  const shapes = await page.locator(".djs-shape").all();
  const targetShapes = shapes.slice(0, 6);
  console.log(`[${scenarioName}] found ${shapes.length} shapes, clicking ${targetShapes.length}`);

  const clickResults = [];
  for (let i = 0; i < targetShapes.length; i++) {
    const shape = targetShapes[i];
    const label = (await shape.textContent().catch(() => "")).trim().slice(0, 40);
    const elementId = await shape.getAttribute("data-element-id");

    await page.evaluate(() => {
      window.__selectionAudit.mutations = 0;
      window.__selectionAudit.addedNodes = 0;
      window.__selectionAudit.removedNodes = 0;
    });

    const t0 = Date.now();
    await shape.click({ force: true });
    await page.waitForSelector(".djs-element.selected, .djs-shape.selected, [class*='selected']", { timeout: 5000 });
    const tHighlight = Date.now();
    // Let any immediate post-selection effects (network, renders) settle
    await page.waitForTimeout(100);
    const t1 = Date.now();

    const counters = await page.evaluate(() => ({
      mutations: window.__selectionAudit.mutations,
      addedNodes: window.__selectionAudit.addedNodes,
      removedNodes: window.__selectionAudit.removedNodes,
    }));

    const requestsDuringClick = networkLog.filter(r => r.time >= t0 && r.time <= t1);
    clickResults.push({
      index: i,
      label,
      elementId,
      highlightMs: tHighlight - t0,
      settleMs: t1 - t0,
      ...counters,
      requests: requestsDuringClick.map(r => ({ method: r.method, url: r.url })),
    });
  }

  await cdp.send("Tracing.end");
  await traceCompletePromise;

  const finalAudit = await page.evaluate(() => ({
    longTasks: window.__selectionAudit.longTasks,
  }));

  fs.writeFileSync(path.join(OUT, `${scenarioName}_network.json`), JSON.stringify(networkLog, null, 2));
  fs.writeFileSync(path.join(OUT, `${scenarioName}_clicks.json`), JSON.stringify(clickResults, null, 2));
  fs.writeFileSync(path.join(OUT, `${scenarioName}_longtasks.json`), JSON.stringify(finalAudit.longTasks, null, 2));
  fs.writeFileSync(path.join(OUT, `${scenarioName}_console.json`), JSON.stringify(consoleLog, null, 2));

  return {
    scenarioName,
    shapeCount: shapes.length,
    clicks: clickResults.length,
    avgHighlightMs: clickResults.reduce((a, c) => a + c.highlightMs, 0) / clickResults.length,
    maxHighlightMs: Math.max(...clickResults.map(c => c.highlightMs)),
    avgSettleMs: clickResults.reduce((a, c) => a + c.settleMs, 0) / clickResults.length,
    maxSettleMs: Math.max(...clickResults.map(c => c.settleMs)),
    totalLongTasks: finalAudit.longTasks.length,
    longTasksOver100ms: finalAudit.longTasks.filter(t => t.duration > 100).length,
    totalRequestsOnSelection: clickResults.reduce((a, c) => a + c.requests.length, 0),
    noteThreadsRequests: clickResults.reduce((a, c) => a + c.requests.filter(r => r.url.includes("/note-threads")).length, 0),
    propertyDictionaryRequests: clickResults.reduce((a, c) => a + c.requests.filter(r => r.url.includes("/property-dictionary/operations")).length, 0),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await login(page);
  const summary = await collectProfile(page, "selection_change_after_fix");
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
})();
