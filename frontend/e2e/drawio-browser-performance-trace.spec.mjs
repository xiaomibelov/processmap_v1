import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function patchDrawioMeta(request, headers, sessionId) {
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 280 160\"><rect id=\"shape1\" x=\"80\" y=\"45\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>",
        transform: { x: 220, y: 120 },
        drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
        drawio_elements_v1: [
          { id: "shape1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1, offset_x: 0, offset_y: 0, z_index: 1 },
        ],
      },
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  await apiJson(res, "patch drawio browser-trace meta");
}

async function openLayersPopover(page) {
  const button = page.getByTestId("diagram-action-layers");
  await expect(button).toBeVisible();
  await button.click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  return popover;
}

async function ensureDrawioEditMode(page, popover) {
  const modeEdit = popover.getByTestId("diagram-action-layers-mode-edit");
  const drawioToggle = popover.getByTestId("diagram-action-layers-drawio-toggle");
  if (await modeEdit.isDisabled()) {
    await drawioToggle.check({ force: true });
    await expect(modeEdit).toBeEnabled();
  }
  await modeEdit.click({ force: true });
  await expect
    .poll(async () => {
      const style = String(await page.getByTestId("drawio-el-shape1").getAttribute("style") || "");
      return style.includes("cursor:move") && style.includes("pointer-events:auto");
    }, { timeout: 10000 })
    .toBeTruthy();
}

function toMs(usRaw) {
  return Number(usRaw || 0) / 1000;
}

function sumDurationMs(events, names) {
  const nameSet = new Set(names);
  return events
    .filter((ev) => ev?.ph === "X" && nameSet.has(String(ev?.name || "")) && Number.isFinite(Number(ev?.dur)))
    .reduce((sum, ev) => sum + toMs(ev.dur), 0);
}

function mean(values) {
  if (!Array.isArray(values) || !values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function classifyRootCause({
  scriptingMs,
  renderingMs,
  paintingMs,
  layoutMs,
  longTasksCount,
  frameBudgetMissRate,
}) {
  const buckets = [
    { key: "scripting", value: scriptingMs },
    { key: "rendering", value: renderingMs },
    { key: "painting", value: paintingMs },
    { key: "layout", value: layoutMs },
  ].sort((a, b) => b.value - a.value);
  const top = buckets[0] || { key: "unknown", value: 0 };
  if (longTasksCount > 0 && top.key === "scripting") return "app scripting / main-thread long tasks";
  if (top.key === "painting") return "svg paint/compositing dominant";
  if (top.key === "layout") return "layout/reflow dominant";
  if (top.key === "rendering") return "render pipeline (style/layout/prepaint) dominant";
  if (frameBudgetMissRate > 0.35) return "mixed frame-budget pressure";
  return "no clear single bottleneck (mixed/within budget)";
}

async function startBrowserTrace(page) {
  const cdp = await page.context().newCDPSession(page);
  const categories = [
    "devtools.timeline",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame",
    "toplevel",
    "blink.user_timing",
    "v8",
  ].join(",");
  await cdp.send("Tracing.start", {
    categories,
    transferMode: "ReturnAsStream",
  });
  return cdp;
}

async function stopBrowserTrace(cdp) {
  const tracingComplete = new Promise((resolve) => {
    cdp.once("Tracing.tracingComplete", resolve);
  });
  await cdp.send("Tracing.end");
  const event = await tracingComplete;
  const stream = String(event?.stream || "");
  let content = "";
  while (stream) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    content += String(chunk?.data || "");
    if (chunk?.eof) break;
  }
  if (stream) {
    await cdp.send("IO.close", { handle: stream });
  }
  let parsed = { traceEvents: [] };
  try {
    parsed = JSON.parse(content || "{\"traceEvents\":[]}");
  } catch {
    parsed = { traceEvents: [] };
  }
  await cdp.detach();
  return parsed;
}

function getRendererMainThread(traceEvents) {
  const metadata = Array.isArray(traceEvents) ? traceEvents : [];
  const threadNames = metadata.filter((ev) => ev?.ph === "M" && ev?.name === "thread_name");
  const main = threadNames.find((ev) => String(ev?.args?.name || "") === "CrRendererMain")
    || threadNames.find((ev) => String(ev?.args?.name || "").toLowerCase().includes("renderer"));
  if (!main) return null;
  return { pid: main.pid, tid: main.tid };
}

function analyzeTrace(trace) {
  const traceEvents = Array.isArray(trace?.traceEvents) ? trace.traceEvents : [];
  const mainThread = getRendererMainThread(traceEvents);
  const completeEvents = traceEvents.filter((ev) => ev?.ph === "X" && Number.isFinite(Number(ev?.dur)));
  const mainCompleteEvents = mainThread
    ? completeEvents.filter((ev) => ev?.pid === mainThread.pid && ev?.tid === mainThread.tid)
    : completeEvents;

  const scriptingMs = sumDurationMs(mainCompleteEvents, [
    "FunctionCall",
    "EvaluateScript",
    "RunTask",
    "RunMicrotasks",
    "EventDispatch",
    "TimerFire",
    "FireAnimationFrame",
  ]);
  const renderingMs = sumDurationMs(mainCompleteEvents, [
    "UpdateLayoutTree",
    "Layout",
    "RecalculateStyles",
    "PrePaint",
    "UpdateLayerTree",
    "HitTest",
  ]);
  const paintingMs = sumDurationMs(mainCompleteEvents, [
    "Paint",
    "PaintImage",
    "CompositeLayers",
    "RasterTask",
    "DrawFrame",
    "CommitCompositorFrame",
  ]);
  const layoutMs = sumDurationMs(mainCompleteEvents, [
    "Layout",
    "RecalculateStyles",
    "UpdateLayoutTree",
  ]);

  const longTasks = mainCompleteEvents.filter((ev) => String(ev?.name || "") === "RunTask" && Number(ev?.dur || 0) > 50000);
  const longTaskMaxMs = longTasks.length
    ? Math.max(...longTasks.map((ev) => toMs(ev.dur)))
    : 0;

  const frameEvents = mainCompleteEvents
    .filter((ev) => ["DrawFrame", "CompositeLayers", "CommitCompositorFrame"].includes(String(ev?.name || "")))
    .sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
  const frameTimesMs = [];
  for (let i = 1; i < frameEvents.length; i += 1) {
    const prev = Number(frameEvents[i - 1]?.ts || 0);
    const next = Number(frameEvents[i]?.ts || 0);
    if (next > prev) frameTimesMs.push((next - prev) / 1000);
  }
  const avgFrameMs = mean(frameTimesMs);
  const fpsApprox = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
  const frameBudgetMisses = frameTimesMs.filter((value) => Number(value || 0) > 16.7).length;
  const frameBudgetMissRate = frameTimesMs.length ? frameBudgetMisses / frameTimesMs.length : 0;

  return {
    eventCount: traceEvents.length,
    mainThreadEventCount: mainCompleteEvents.length,
    scriptingMs,
    renderingMs,
    paintingMs,
    layoutMs,
    longTasksCount: longTasks.length,
    longTaskMaxMs,
    frameSamples: frameTimesMs.length,
    avgFrameMs,
    fpsApprox,
    frameBudgetMisses,
    frameBudgetMissRate,
    rootCause: classifyRootCause({
      scriptingMs,
      renderingMs,
      paintingMs,
      layoutMs,
      longTasksCount: longTasks.length,
      frameBudgetMissRate,
    }),
  };
}

function isSessionWriteRequest(requestUrlRaw, methodRaw, sessionIdRaw) {
  const url = String(requestUrlRaw || "");
  const method = String(methodRaw || "").toUpperCase();
  const sessionId = String(sessionIdRaw || "");
  if (!sessionId || (method !== "PATCH" && method !== "PUT")) return false;
  return (
    url.includes(`/api/sessions/${encodeURIComponent(sessionId)}`)
    || url.includes(`/api/sessions/${sessionId}`)
  );
}

test("drawio browser performance trace: drag/pan/zoom runtime classification", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_TRACE !== "1", "Set E2E_DRAWIO_TRACE=1 to run browser performance trace.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_browser_trace`,
    auth.headers,
    seedXml({ processName: `Drawio browser trace ${runId}`, taskName: "Drawio browser trace task" }),
  );
  await patchDrawioMeta(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DRAWIO_PERF_ENABLE__ = true;
    window.__FPC_DRAWIO_PERF__ = {
      counters: {},
      samples: {},
      marks: {},
      startedAt: Date.now(),
      resetAt: Date.now(),
    };
  });

  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const drawioRect = page.getByTestId("drawio-el-shape1");
  await expect(drawioRect).toBeVisible();
  const popover = await openLayersPopover(page);
  await ensureDrawioEditMode(page, popover);
  await page.getByTestId("diagram-action-layers").click({ force: true });

  await page.evaluate(() => {
    window.__FPC_DRAWIO_PERF__ = {
      counters: {},
      samples: {},
      marks: {},
      startedAt: Date.now(),
      resetAt: Date.now(),
    };
  });

  let dragActive = false;
  const requestLog = [];
  page.on("request", (req) => {
    if (!isSessionWriteRequest(req.url(), req.method(), fixture.sessionId)) return;
    requestLog.push({
      ts: Date.now(),
      method: req.method(),
      url: req.url(),
      duringDrag: dragActive,
    });
  });

  const cdp = await startBrowserTrace(page);

  const box = await drawioRect.boundingBox();
  expect(box).toBeTruthy();
  const startX = Number(box.x || 0) + Number(box.width || 0) / 2;
  const startY = Number(box.y || 0) + Number(box.height || 0) / 2;

  dragActive = true;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 30; i += 1) {
    await page.mouse.move(startX + (i * 3), startY + ((i % 3) * 2), { steps: 1 });
    await page.waitForTimeout(6);
  }
  await page.mouse.up();
  dragActive = false;

  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const vb = canvas?.viewbox?.();
    if (!canvas || !vb) return false;
    canvas.viewbox({
      ...vb,
      x: Number(vb.x || 0) + 120,
      y: Number(vb.y || 0) + 70,
      width: Number(vb.width || 0) * 1.15,
      height: Number(vb.height || 0) * 1.15,
    });
    return true;
  });
  await page.waitForTimeout(180);

  await page.getByTestId("diagram-zoom-in").click({ force: true });
  await page.getByTestId("diagram-zoom-out").click({ force: true });
  await page.waitForTimeout(220);

  const overlayTogglePopover = await openLayersPopover(page);
  const drawioToggle = overlayTogglePopover.getByTestId("diagram-action-layers-drawio-toggle");
  await drawioToggle.uncheck({ force: true });
  await drawioToggle.check({ force: true });
  await page.getByTestId("diagram-action-layers").click({ force: true });
  await drawioRect.click({ force: true });
  await page.waitForTimeout(350);

  const trace = await stopBrowserTrace(cdp);
  const traceStats = analyzeTrace(trace);
  const runtimePerf = await page.evaluate(() => window.__FPC_DRAWIO_PERF__ || null);
  const runtimeCounters = runtimePerf?.counters || {};
  const runtimeSamples = runtimePerf?.samples || {};
  const runtimeRafDelta = runtimeSamples["drawio.drag.rafDeltaMs"] || null;
  const runtimeFrameSamples = Number(runtimeRafDelta?.count || 0);
  const runtimeAvgFrameMs = Number(runtimeRafDelta?.avg || 0);
  const runtimeFpsApprox = runtimeAvgFrameMs > 0 ? 1000 / runtimeAvgFrameMs : 0;
  const runtimeOverBudget = Number(runtimeCounters["drawio.drag.rafDelta.overBudget"] || 0);
  const runtimeFrameBudgetMissRate = runtimeFrameSamples > 0
    ? runtimeOverBudget / runtimeFrameSamples
    : 0;

  expect(Number(traceStats.eventCount || 0)).toBeGreaterThan(500);
  expect(Number(traceStats.mainThreadEventCount || 0)).toBeGreaterThan(30);
  expect(Math.max(Number(traceStats.frameSamples || 0), runtimeFrameSamples)).toBeGreaterThan(2);
  expect(Number(traceStats.longTaskMaxMs || 0)).toBeLessThan(220);
  expect(requestLog.filter((entry) => entry.duringDrag).length).toBe(0);

  // eslint-disable-next-line no-console
  console.info("[drawio-browser-trace]", JSON.stringify({
    sessionId: fixture.sessionId,
    trace: traceStats,
    runtimePerfCounters: runtimeCounters,
    runtimePerfSamples: runtimeSamples,
    runtimeFrameFallback: {
      samples: runtimeFrameSamples,
      avgFrameMs: runtimeAvgFrameMs,
      fpsApprox: runtimeFpsApprox,
      frameBudgetMissRate: runtimeFrameBudgetMissRate,
    },
    writes: {
      totalSessionWrites: requestLog.length,
      writesDuringDrag: requestLog.filter((entry) => entry.duringDrag).length,
    },
  }));
});
