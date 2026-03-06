import fs from "node:fs/promises";
import path from "node:path";

import { chromium, request } from "../frontend/node_modules/@playwright/test/index.mjs";

import { apiLogin, setUiToken } from "../frontend/e2e/helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml, switchTab } from "../frontend/e2e/helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "../frontend/e2e/helpers/diagramReady.mjs";

function nowTs() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function asObject(v) {
  return v && typeof v === "object" ? v : {};
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function patchDrawioMeta(apiRequest, headers, sessionId) {
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 120\"><rect id=\"shape1\" x=\"60\" y=\"30\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>",
        transform: { x: 260, y: 130 },
      },
    },
  };
  const res = await apiRequest.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  if (!res.ok()) {
    throw new Error(`patch drawio meta failed: ${res.status()} ${await res.text()}`);
  }
}

function stackLines(textRaw = "", maxLines = 80) {
  return String(textRaw || "")
    .split("\n")
    .slice(0, maxLines)
    .join("\n")
    .trim();
}

async function main() {
  const ts = nowTs();
  const APP_BASE = String(process.env.E2E_APP_BASE_URL || "http://127.0.0.1:4177").trim();
  const runId = `drawio_forensics_${ts}`;
  const apiRequest = await request.newContext();
  const auth = await apiLogin(apiRequest, { apiBase: API_BASE });
  let fixture = {
    projectId: String(process.env.E2E_PROJECT_ID || "").trim(),
    sessionId: String(process.env.E2E_SESSION_ID || "").trim(),
  };
  if (!fixture.projectId || !fixture.sessionId) {
    fixture = await createFixture(
      apiRequest,
      runId,
      auth.headers,
      seedXml({ processName: `Drawio forensics ${runId}`, taskName: "Drawio forensics task" }),
    );
  } else {
    const check = await apiRequest.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}`, { headers: auth.headers });
    if (!check.ok()) {
      fixture = await createFixture(
        apiRequest,
        runId,
        auth.headers,
        seedXml({ processName: `Drawio forensics ${runId}`, taskName: "Drawio forensics task" }),
      );
    }
  }
  const sessionId = String(fixture.sessionId || "").trim();
  await patchDrawioMeta(apiRequest, auth.headers, sessionId);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: APP_BASE });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    consoleErrors.push({
      text: msg.text(),
      location: msg.location(),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push({
      message: String(error?.message || error || ""),
      stack: String(error?.stack || ""),
    });
  });

  await page.addInitScript(() => {
    window.__DRAWIO_FX_LOG__ = {
      stopPropagationCalls: [],
      setPointerCaptureCalls: [],
      drawioPointerDown: [],
      canvasPointerDown: [],
      drawioMouseDown: [],
      canvasMouseDown: [],
      hybridMoveCount: 0,
    };
    const toText = (v) => String(v || "").trim();
    const oldStop = Event.prototype.stopPropagation;
    Event.prototype.stopPropagation = function patchedStopPropagation(...args) {
      try {
        if (this?.type === "pointerdown" || this?.type === "mousedown") {
          const target = this?.target;
          window.__DRAWIO_FX_LOG__.stopPropagationCalls.push({
            type: toText(this?.type),
            pointerId: Number(this?.pointerId ?? NaN),
            targetTag: target && target.tagName ? toText(target.tagName).toLowerCase() : "",
            targetId: target && typeof target.getAttribute === "function" ? toText(target.getAttribute("id")) : "",
            ts: Date.now(),
          });
        }
      } catch {
      }
      return oldStop.apply(this, args);
    };
    const oldSetPointerCapture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function patchedSetPointerCapture(pointerId) {
      try {
        window.__DRAWIO_FX_LOG__.setPointerCaptureCalls.push({
          pointerId: Number(pointerId ?? NaN),
          tag: this && this.tagName ? toText(this.tagName).toLowerCase() : "",
          id: this && typeof this.getAttribute === "function" ? toText(this.getAttribute("id")) : "",
          ts: Date.now(),
        });
      } catch {
      }
      return oldSetPointerCapture.call(this, pointerId);
    };
    document.addEventListener("pointerdown", (event) => {
      try {
        const target = event?.target;
        const hitNode = target?.closest?.("[data-drawio-el-id]");
        if (hitNode) {
          window.__DRAWIO_FX_LOG__.drawioPointerDown.push({
            pointerId: Number(event?.pointerId ?? NaN),
            elementId: toText(hitNode.getAttribute("data-drawio-el-id")),
            ts: Date.now(),
          });
          return;
        }
        const canvasNode = target?.closest?.(".bpmnCanvas");
        if (canvasNode) {
          window.__DRAWIO_FX_LOG__.canvasPointerDown.push({
            pointerId: Number(event?.pointerId ?? NaN),
            tag: target && target.tagName ? toText(target.tagName).toLowerCase() : "",
            ts: Date.now(),
          });
        }
      } catch {
      }
    }, true);
    document.addEventListener("mousedown", (event) => {
      try {
        const target = event?.target;
        const hitNode = target?.closest?.("[data-drawio-el-id]");
        if (hitNode) {
          window.__DRAWIO_FX_LOG__.drawioMouseDown.push({
            button: Number(event?.button ?? NaN),
            elementId: toText(hitNode.getAttribute("data-drawio-el-id")),
            ts: Date.now(),
          });
          return;
        }
        const canvasNode = target?.closest?.(".bpmnCanvas");
        if (canvasNode) {
          window.__DRAWIO_FX_LOG__.canvasMouseDown.push({
            button: Number(event?.button ?? NaN),
            tag: target && target.tagName ? toText(target.tagName).toLowerCase() : "",
            ts: Date.now(),
          });
        }
      } catch {
      }
    }, true);
    document.addEventListener("pointermove", (event) => {
      try {
        const target = event?.target;
        if (target?.closest?.("[data-testid='hybrid-placement-hit-layer']")) {
          window.__DRAWIO_FX_LOG__.hybridMoveCount += 1;
        }
      } catch {
      }
    }, true);
    document.addEventListener("mousemove", (event) => {
      try {
        const target = event?.target;
        if (target?.closest?.("[data-testid='hybrid-placement-hit-layer']")) {
          window.__DRAWIO_FX_LOG__.hybridMoveCount += 1;
        }
      } catch {
      }
    }, true);
  });

  await setUiToken(page, auth.accessToken);
  try {
    await openSessionInTopbar(page, { projectId: fixture.projectId, sessionId }, { timeout: 60000 });
  } catch {
    await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(sessionId)}`);
    const orgChoice = page.getByText("Выберите организацию");
    if (await orgChoice.isVisible().catch(() => false)) {
      const firstOrgButton = page.getByRole("button", { name: /Org|Default|Организац/i }).first();
      if (await firstOrgButton.count()) {
        await firstOrgButton.click({ force: true }).catch(() => {});
      }
    }
  }
  const diagramTab = page.locator(".segBtn").filter({ hasText: /^Diagram$/i }).first();
  if (await diagramTab.isVisible().catch(() => false)) {
    await switchTab(page, "Diagram");
  }
  await waitForDiagramReady(page);

  const layersBtn = page.getByTestId("diagram-action-layers");
  await layersBtn.click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await popover.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await popover.getByTestId("diagram-action-layers-mode-edit").click({ force: true });
  await layersBtn.click({ force: true });

  await page.waitForTimeout(300);
  const toolBefore = await page.evaluate(() => window.__FPC_E2E_HYBRID__?.getState?.() || null);
  const runtimeToolSet = await page.evaluate(() => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api) return false;
    if (typeof api.ensureEditVisible === "function") api.ensureEditVisible();
    if (typeof api.selectTool === "function") api.selectTool("rect");
    return true;
  });
  const toolAfter = await page.evaluate(() => window.__FPC_E2E_HYBRID__?.getState?.() || null);
  const toolAfterKeyboard = await (async () => {
    await page.keyboard.press("r");
    return page.evaluate(() => window.__FPC_E2E_HYBRID__?.getState?.() || null);
  })();
  const ghostVisible = await page.getByTestId("hybrid-v2-ghost").isVisible().catch(() => false);

  const beforePlaceCount = await page.evaluate(() => {
    const doc = window.__FPC_E2E_HYBRID__?.readDoc?.() || {};
    return Array.isArray(doc?.elements) ? doc.elements.length : 0;
  });
  const canvas = page.locator(".bpmnLayer--editor.on .bpmnCanvas").first();
  await canvas.hover({ position: { x: 360, y: 250 }, force: true });
  const ghostVisibleAfterMove = await page.getByTestId("hybrid-v2-ghost").isVisible().catch(() => false);
  await canvas.click({ position: { x: 360, y: 250 }, force: true });
  const afterPlaceCountImmediate = await page.evaluate(() => {
    const doc = window.__FPC_E2E_HYBRID__?.readDoc?.() || {};
    return Array.isArray(doc?.elements) ? doc.elements.length : 0;
  });
  await page.waitForTimeout(1000);
  const afterPlaceCountDelayed = await page.evaluate(() => {
    const doc = window.__FPC_E2E_HYBRID__?.readDoc?.() || {};
    return Array.isArray(doc?.elements) ? doc.elements.length : 0;
  });

  const sessionRes = await apiRequest.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { headers: auth.headers });
  const sessionBody = sessionRes.ok() ? await sessionRes.json() : {};
  const meta = asObject(sessionBody?.bpmn_meta || sessionBody?.meta || {});
  const persistedHybrid = asObject(meta.hybrid_v2);
  const persistedCount = Array.isArray(persistedHybrid?.elements) ? persistedHybrid.elements.length : null;

  await page.evaluate(() => {
    const api = window.__FPC_E2E_HYBRID__;
    if (api && typeof api.selectTool === "function") {
      api.selectTool("select");
    }
  });
  await page.waitForTimeout(100);

  const drawioRect = page.getByTestId("drawio-el-shape1");
  await drawioRect.waitFor({ state: "visible", timeout: 10000 });
  const drawioBoxBefore = await drawioRect.boundingBox();
  const viewboxBeforeDrag = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvasSvc = modeler?.get?.("canvas");
    return canvasSvc?.viewbox?.() || null;
  });
  const drawioMetaBefore = await page.evaluate(() => window.__FPC_E2E_DRAWIO__?.readMeta?.() || null);

  const dragStartX = num(drawioBoxBefore?.x) + num(drawioBoxBefore?.width) / 2;
  const dragStartY = num(drawioBoxBefore?.y) + num(drawioBoxBefore?.height) / 2;
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 64, dragStartY + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const drawioBoxAfter = await drawioRect.boundingBox();
  const viewboxAfterDrag = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvasSvc = modeler?.get?.("canvas");
    return canvasSvc?.viewbox?.() || null;
  });
  const drawioMetaAfter = await page.evaluate(() => window.__FPC_E2E_DRAWIO__?.readMeta?.() || null);

  const drawioBoxBeforePan = await drawioRect.boundingBox();
  const viewboxBeforePan = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvasSvc = modeler?.get?.("canvas");
    return canvasSvc?.viewbox?.() || null;
  });
  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvasSvc = modeler?.get?.("canvas");
    const vb = canvasSvc?.viewbox?.();
    if (canvasSvc && vb) canvasSvc.viewbox({ ...vb, x: Number(vb.x || 0) + 120, y: Number(vb.y || 0) + 80 });
  });
  await page.waitForTimeout(150);
  const drawioBoxAfterPan = await drawioRect.boundingBox();
  const viewboxAfterPan = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvasSvc = modeler?.get?.("canvas");
    return canvasSvc?.viewbox?.() || null;
  });

  const pointerLogs = await page.evaluate(() => window.__DRAWIO_FX_LOG__ || {});

  await context.close();
  await browser.close();
  await apiRequest.dispose();

  const viewboxChangedOnDrawioDrag = Math.abs(num(viewboxAfterDrag?.x) - num(viewboxBeforeDrag?.x)) > 0.1
    || Math.abs(num(viewboxAfterDrag?.y) - num(viewboxBeforeDrag?.y)) > 0.1
    || Math.abs(num(viewboxAfterDrag?.scale, 1) - num(viewboxBeforeDrag?.scale, 1)) > 0.001;
  const drawioTransformDeltaX = num(asObject(drawioMetaAfter?.transform).x) - num(asObject(drawioMetaBefore?.transform).x);
  const drawioTransformDeltaY = num(asObject(drawioMetaAfter?.transform).y) - num(asObject(drawioMetaBefore?.transform).y);
  const drawioBBoxDeltaX = num(drawioBoxAfter?.x) - num(drawioBoxBefore?.x);
  const drawioBBoxDeltaY = num(drawioBoxAfter?.y) - num(drawioBoxBefore?.y);

  const placeHandlerLikelyCalled = (afterPlaceCountImmediate > beforePlaceCount)
    || (afterPlaceCountDelayed > beforePlaceCount);
  const afterPlaceGrowth = afterPlaceCountDelayed - beforePlaceCount;
  const drawioPointerDownCount = Array.isArray(pointerLogs.drawioPointerDown)
    ? pointerLogs.drawioPointerDown.length
    : 0;
  const canvasPointerDownCount = Array.isArray(pointerLogs.canvasPointerDown)
    ? pointerLogs.canvasPointerDown.length
    : 0;

  const drawioPanDx = num(drawioBoxAfterPan?.x) - num(drawioBoxBeforePan?.x);
  const drawioPanDy = num(drawioBoxAfterPan?.y) - num(drawioBoxBeforePan?.y);
  const viewboxPanDx = num(viewboxAfterPan?.x) - num(viewboxBeforePan?.x);
  const viewboxPanDy = num(viewboxAfterPan?.y) - num(viewboxBeforePan?.y);
  const viewboxScale = num(viewboxAfterPan?.scale || viewboxBeforePan?.scale || 1, 1) || 1;
  const expectedPanDx = -viewboxPanDx * viewboxScale;
  const expectedPanDy = -viewboxPanDy * viewboxScale;
  const panDrift = {
    dxMismatch: Math.abs(drawioPanDx - expectedPanDx),
    dyMismatch: Math.abs(drawioPanDy - expectedPanDy),
  };
  const drawioMouseDownCount = Array.isArray(pointerLogs.drawioMouseDown) ? pointerLogs.drawioMouseDown.length : 0;
  const canvasMouseDownCount = Array.isArray(pointerLogs.canvasMouseDown) ? pointerLogs.canvasMouseDown.length : 0;

  const firstErrors = [
    ...pageErrors.map((row) => `PAGEERROR: ${row.message}\n${stackLines(row.stack)}`),
    ...consoleErrors.map((row) => `CONSOLE: ${row.text}\n${JSON.stringify(row.location || {})}`),
  ].slice(0, 2);

  const factpackPath = path.resolve(
    process.cwd(),
    "..",
    "docs",
    "debug",
    `drawio_stability_factpack_v2_${ts}.md`,
  );

  const md = `# Draw.io stability factpack v2

## Session
- session_id: \`${sessionId}\`
- project_id: \`${fixture.projectId}\`
- timestamp: \`${ts}\`

## Repro steps
1. Open session in Diagram tab.
2. Enable Hybrid + Edit mode from Layers.
3. Press \`R\` (Rect tool) and click canvas once.
4. Attempt draw.io element drag on \`shape1\`.
5. Pan BPMN viewbox by script (\`+120,+80\`) and compare overlay displacement.

## Console errors (first 1-2)
${firstErrors.length ? firstErrors.map((row, idx) => `### Error ${idx + 1}\n\`\`\`text\n${row}\n\`\`\``).join("\n\n") : "No runtime pageerror/console-error captured in this run."}

## Pointer ownership log
- stopPropagation calls (pointer/mouse down): \`${Array.isArray(pointerLogs.stopPropagationCalls) ? pointerLogs.stopPropagationCalls.length : 0}\`
- setPointerCapture calls: \`${Array.isArray(pointerLogs.setPointerCaptureCalls) ? pointerLogs.setPointerCaptureCalls.length : 0}\`
- First stopPropagation event:
\`\`\`json
${JSON.stringify((pointerLogs.stopPropagationCalls || [])[0] || null, null, 2)}
\`\`\`
- First setPointerCapture event:
\`\`\`json
${JSON.stringify((pointerLogs.setPointerCaptureCalls || [])[0] || null, null, 2)}
\`\`\`

## Viewbox during draw.io drag
- viewbox changed while dragging draw.io: **${viewboxChangedOnDrawioDrag ? "YES" : "NO"}**
- viewbox before:
\`\`\`json
${JSON.stringify(viewboxBeforeDrag || null, null, 2)}
\`\`\`
- viewbox after:
\`\`\`json
${JSON.stringify(viewboxAfterDrag || null, null, 2)}
\`\`\`

## Drag behavior facts (draw.io)
- drawio transform delta: \`dx=${drawioTransformDeltaX.toFixed(2)}, dy=${drawioTransformDeltaY.toFixed(2)}\`
- drawio bbox delta on screen: \`dx=${drawioBBoxDeltaX.toFixed(2)}, dy=${drawioBBoxDeltaY.toFixed(2)}\`
- Interpretation:
  - if transform delta ~= 0 and bbox delta ~= 0 -> drag not applied.
  - if transform changes but bbox not -> overlay transform/render mismatch.

## Placement log
- tool before \`R\`:
\`\`\`json
${JSON.stringify(toolBefore || null, null, 2)}
\`\`\`
- tool set via runtime selectTool("rect"): **${runtimeToolSet ? "YES" : "NO"}**
- tool after runtime set:
\`\`\`json
${JSON.stringify(toolAfter || null, null, 2)}
\`\`\`
- tool after keyboard \`R\`:
\`\`\`json
${JSON.stringify(toolAfterKeyboard || null, null, 2)}
\`\`\`
- ghost visible: **${ghostVisible ? "YES" : "NO"}**
- ghost visible (before move): **${ghostVisible ? "YES" : "NO"}**
- ghost visible (after move): **${ghostVisibleAfterMove ? "YES" : "NO"}**
- click on canvas invoked place handler (derived by model growth): **${placeHandlerLikelyCalled ? "YES" : "NO"}**
- model count before place: \`${beforePlaceCount}\`
- model count immediate after click: \`${afterPlaceCountImmediate}\`
- model count after 1s: \`${afterPlaceCountDelayed}\`
- model growth after 1s: \`${afterPlaceGrowth}\`
- persisted hybrid_v2.elements count: \`${persistedCount === null ? "null/unavailable" : persistedCount}\`
- Placement conclusion:
  - if immediate count grows and delayed/persisted shrinks -> merge/persist overwrite.
  - if immediate count does not grow -> place handler path not reached.

## Pan drift check
- viewbox pan delta: \`dx=${viewboxPanDx.toFixed(2)}, dy=${viewboxPanDy.toFixed(2)}, scale=${viewboxScale.toFixed(3)}\`
- expected drawio screen delta from viewbox: \`dx=${expectedPanDx.toFixed(2)}, dy=${expectedPanDy.toFixed(2)}\`
- Draw.io bbox delta on pan: \`dx=${drawioPanDx.toFixed(2)}, dy=${drawioPanDy.toFixed(2)}\`
- mismatch: \`dx=${panDrift.dxMismatch.toFixed(2)}, dy=${panDrift.dyMismatch.toFixed(2)}\`
- Drift verdict: **${panDrift.dxMismatch > 8 || panDrift.dyMismatch > 8 ? "DRIFT DETECTED" : "NO MATERIAL DRIFT"}**

## Pointer hit trace
- draw.io pointerdown events captured: \`${drawioPointerDownCount}\`
- canvas pointerdown events captured: \`${canvasPointerDownCount}\`
- draw.io mousedown events captured: \`${drawioMouseDownCount}\`
- canvas mousedown events captured: \`${canvasMouseDownCount}\`
- hybrid placement moveCount: \`${Number(pointerLogs.hybridMoveCount || 0)}\`
- First draw.io pointerdown:
\`\`\`json
${JSON.stringify((pointerLogs.drawioPointerDown || [])[0] || null, null, 2)}
\`\`\`
- First canvas pointerdown:
\`\`\`json
${JSON.stringify((pointerLogs.canvasPointerDown || [])[0] || null, null, 2)}
\`\`\`
- First draw.io mousedown:
\`\`\`json
${JSON.stringify((pointerLogs.drawioMouseDown || [])[0] || null, null, 2)}
\`\`\`
- First canvas mousedown:
\`\`\`json
${JSON.stringify((pointerLogs.canvasMouseDown || [])[0] || null, null, 2)}
\`\`\`
`;

  await fs.writeFile(factpackPath, md, "utf8");
  process.stdout.write(`FACTPACK_PATH=${factpackPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`[collect_drawio_forensics_v2] ${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
