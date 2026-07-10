const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.STAGE_BASE || "http://clearvestnic.ru:5177";
const PROJECT = process.env.PROJECT || "d3b9ae9fda";
const SESSION = process.env.SESSION || "f1f727aee7";
const OUT = path.join(__dirname, "profiles");
fs.mkdirSync(OUT, { recursive: true });

async function login(page) {
  await page.addInitScript(() => {
    const origError = window.console.error;
    window.console.error = function (...args) {
      const text = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
      if (text.includes("Maximum update depth")) {
        window.__fpcMaxDepthStack = (window.__fpcMaxDepthStack || "")
          + "\n--- MAX DEPTH ---\n"
          + text
          + "\n"
          + (new Error().stack || "")
          + "\n";
      }
      return origError.apply(this, args);
    };
  });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill('input[type="email"]', "admin@local");
  await page.fill('input[type="password"]', "admin");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/app", { timeout: 15000 });
  await page.click("text=Default");
  await page.waitForTimeout(3000);
}

async function collectDragProfile(page, scenarioName) {
  const cdp = await page.context().newCDPSession(page);
  const traceEvents = [];
  let traceCompleteResolve;
  const traceCompletePromise = new Promise((resolve) => { traceCompleteResolve = resolve; });

  cdp.on("Tracing.dataCollected", (payload) => traceEvents.push(...(payload.value || [])));
  cdp.on("Tracing.tracingComplete", () => {
    fs.writeFileSync(path.join(OUT, `${scenarioName}_trace.json`), JSON.stringify(traceEvents));
    traceCompleteResolve();
  });

  const networkLog = [];
  page.on("request", (req) => networkLog.push({ time: Date.now(), method: req.method(), url: req.url() }));

  const consoleLog = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/\[MAIN\]|\[WDYR\]|\[VP_SRC\]|why-did-you-render|ProcessStage|BpmnStage|Overlay|FPC-OVERLAY|autosave|save|presence|element\.changed|commandStack\.changed|drag|pan|Camunda|reconcile/i.test(text)) {
      consoleLog.push({ time: Date.now(), type: msg.type(), text });
    }
  });

  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame," +
      "blink.user_timing,v8,disabled-by-default-v8.cpu_profiler,disabled-by-default-v8.cpu_profiler.hires",
    options: "sampling-frequency=10000",
    transferMode: "ReportEvents",
  });

  await page.goto(`${BASE}/app?project=${PROJECT}&session=${SESSION}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".djs-container svg, .bjs-container svg, .bpmnStageHost svg", { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Count shapes and pick a task-like shape (skip pools/lanes by preferring smaller bbox)
  const shapes = await page.locator(".djs-shape").all();
  const shapeInfo = [];
  for (const s of shapes) {
    const box = await s.boundingBox().catch(() => null);
    if (box) shapeInfo.push({ shape: s, box, area: box.width * box.height });
  }
  shapeInfo.sort((a, b) => a.area - b.area);
  const target = shapeInfo.find((s) => s.area > 1000 && s.area < 20000)?.shape || shapes[0];

  // Start drag: click target, move ~200 px, release
  const startBox = await target.boundingBox();
  const startX = startBox.x + startBox.width / 2;
  const startY = startBox.y + startBox.height / 2;

  const t0 = Date.now();
  await page.evaluate(() => performance.mark("drag-start"));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(startX + i * 7, startY + Math.sin(i * 0.4) * 30);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.evaluate(() => performance.mark("drag-end"));
  const dragEndMs = Date.now() - t0;

  // Pan canvas for ~2 seconds
  const canvas = await page.$(".bpmnStageHost, .djs-container, .bjs-container");
  const cBox = await canvas.boundingBox();
  const cx = cBox.x + cBox.width / 2;
  const cy = cBox.y + cBox.height / 2;
  await page.evaluate(() => performance.mark("pan-start"));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(cx + Math.sin(i * 0.5) * 200, cy + Math.cos(i * 0.5) * 100);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.evaluate(() => performance.mark("pan-end"));

  await page.waitForTimeout(500);
  await cdp.send("Tracing.end");
  await traceCompletePromise;

  const longTasks = await page.evaluate(() =>
    performance.getEntriesByType("longtask").map((e) => ({ startTime: e.startTime, duration: e.duration }))
  );

  const viewportCounters = await page.evaluate(() => {
    const counts = window.__fpcEffectCounts || {};
    const topEffects = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k, c]) => ({ key: String(k).slice(0, 200), count: c }));
    return {
      scheduleApplyCount: window.__fpcScheduleApplyCount || 0,
      applyViewboxCount: window.__fpcApplyViewboxCount || 0,
      processStageRenderCount: window.__fpcProcessStageRenderCount || 0,
      hostRectCount: window.__fpcHostRectCount || 0,
      viewboxEmitCount: window.__fpcViewboxEmitCount || 0,
      maxDepthStack: window.__fpcMaxDepthStack || "",
      topEffects,
      useEffectPatchCalls: window.__fpcUseEffectPatchCalls || 0,
      psLoaded: window.__FPC_PS_LOADED || false,
    };
  });

  fs.writeFileSync(path.join(OUT, `${scenarioName}_network.json`), JSON.stringify(networkLog, null, 2));
  fs.writeFileSync(path.join(OUT, `${scenarioName}_console.json`), JSON.stringify(consoleLog, null, 2));
  fs.writeFileSync(path.join(OUT, `${scenarioName}_longtasks.json`), JSON.stringify(longTasks, null, 2));
  fs.writeFileSync(path.join(OUT, `${scenarioName}_maxdepth.txt`), String(viewportCounters.maxDepthStack || ""));

  return {
    scenarioName,
    dragDurationMs: dragEndMs,
    networkDuringDragAndPan: networkLog.filter(r => r.time >= t0).length,
    putBpmnCount: networkLog.filter(r => r.method === "PUT" && r.url.includes("/bpmn")).length,
    postPresenceCount: networkLog.filter(r => r.method === "POST" && r.url.includes("/presence")).length,
    propertyDictionaryCount: networkLog.filter(r => r.url.includes("/property-dictionary")).length,
    noteThreadsCount: networkLog.filter(r => r.url.includes("/note-threads")).length,
    longTaskCount: longTasks.length,
    longTasksOver100ms: longTasks.filter(t => t.duration > 100).length,
    scheduleApplyCount: viewportCounters.scheduleApplyCount,
    applyViewboxCount: viewportCounters.applyViewboxCount,
    processStageRenderCount: viewportCounters.processStageRenderCount,
    hostRectCount: viewportCounters.hostRectCount,
    viewboxEmitCount: viewportCounters.viewboxEmitCount,
    maxDepthStackPreview: String(viewportCounters.maxDepthStack || "").slice(0, 500),
    topEffects: viewportCounters.topEffects,
    useEffectPatchCalls: viewportCounters.useEffectPatchCalls,
    psLoaded: viewportCounters.psLoaded,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await login(page);
  const summary = await collectDragProfile(page, "drag_baseline");
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
})();
