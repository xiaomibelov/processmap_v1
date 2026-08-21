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
        interaction_mode: "view",
        opacity: 1,
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 260 140\"><rect id=\"shape1\" x=\"70\" y=\"35\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>",
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
  await apiJson(res, "patch drawio visual parity meta");
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

async function measureAtZoom(page, targetZoom) {
  await page.evaluate((zoomTarget) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    if (!canvas) return false;
    canvas.zoom(Number(zoomTarget || 1));
    return true;
  }, Number(targetZoom || 1));
  await page.waitForTimeout(260);
  return page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const zoom = Number(canvas?.zoom?.() || NaN);
    const vb = canvas?.viewbox?.() || {};
    const viewportNodes = Array.from(
      document.querySelectorAll(".bpmnLayer--editor.on .djs-container g.viewport, .bpmnLayer--editor.on .djs-container g.djs-viewport"),
    );
    const viewport = viewportNodes.find((node) => String(node?.getAttribute?.("transform") || "").includes("matrix(")) || viewportNodes[0] || null;
    const viewportTransform = String(viewport?.getAttribute?.("transform") || "");
    let visualScale = Number.NaN;
    const match = viewportTransform.match(/matrix\(([^)]+)\)/i);
    if (match) {
      const parts = String(match[1] || "")
        .split(",")
        .map((row) => Number(String(row || "").trim()));
      visualScale = Number.isFinite(parts[0]) ? parts[0] : Number.NaN;
    }
    const bpmn = viewport?.querySelector?.("g.djs-element.djs-shape[data-element-id='Task_1']")
      || document.querySelector(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='Task_1']");
    const bpmnRectNode = bpmn?.querySelector?.("g.djs-visual rect, rect");
    const drawio = document.querySelector("[data-testid='drawio-el-shape1']");
    const bpmnBox = bpmn?.getBoundingClientRect?.();
    const bpmnRectBox = bpmnRectNode?.getBoundingClientRect?.();
    const drawioBox = drawio?.getBoundingClientRect?.();
    return {
      zoom,
      viewbox: {
        x: Number(vb?.x || 0),
        y: Number(vb?.y || 0),
        width: Number(vb?.width || 0),
        height: Number(vb?.height || 0),
      },
      viewportTransform,
      visualScale,
      bpmn: bpmnBox
        ? { x: bpmnBox.x, y: bpmnBox.y, width: bpmnBox.width, height: bpmnBox.height }
        : null,
      bpmnRect: bpmnRectBox
        ? { x: bpmnRectBox.x, y: bpmnRectBox.y, width: bpmnRectBox.width, height: bpmnRectBox.height }
        : null,
      drawio: drawioBox
        ? { x: drawioBox.x, y: drawioBox.y, width: drawioBox.width, height: drawioBox.height }
        : null,
    };
  });
}

test("drawio visual scale parity: bpmn+drawio bbox ratios stay coupled across zoom levels", async ({ page, request }, testInfo) => {
  test.skip(process.env.E2E_DRAWIO_SMOKE !== "1", "Set E2E_DRAWIO_SMOKE=1 to run drawio visual scale parity checks.");
  test.setTimeout(240000);

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_visual_scale`,
    auth.headers,
    seedXml({ processName: `Drawio visual scale ${runId}`, taskName: "Drawio visual scale task" }),
  );
  await patchDrawioMeta(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  await expect(page.getByTestId("drawio-el-shape1")).toBeVisible();
  await expect(page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='Task_1']").first()).toBeVisible();

  const zoomLevels = [0.5, 1, 1.5, 2];
  const measurements = [];
  for (const level of zoomLevels) {
    const snap = await measureAtZoom(page, level);
    expect(snap?.bpmnRect?.width || snap?.bpmn?.width).toBeGreaterThan(1);
    expect(snap?.drawio?.width).toBeGreaterThan(1);
    measurements.push(snap);
    await page.screenshot({ path: testInfo.outputPath(`drawio-scale-parity-z${String(level).replace(".", "_")}.png`) });
  }

  const baseline = measurements.find((row) => Math.abs(Number(row.zoom || 0) - 1) < 0.2) || measurements[1] || measurements[0];
  const baseBpmnWidth = Number(baseline?.bpmnRect?.width || baseline?.bpmn?.width || 1);
  const baseDrawioWidth = Number(baseline?.drawio?.width || 1);
  const baseWidthRatio = baseDrawioWidth / Math.max(1, baseBpmnWidth);

  const parityRows = measurements.map((row) => {
    const bpmnWidth = Number(row?.bpmnRect?.width || row?.bpmn?.width || 1);
    const bpmnScale = bpmnWidth / Math.max(1, baseBpmnWidth);
    const drawioScale = Number(row?.drawio?.width || 1) / Math.max(1, baseDrawioWidth);
    const widthRatio = Number(row?.drawio?.width || 1) / Math.max(1, bpmnWidth);
    return {
      zoom: round(row.zoom, 4),
      visualScale: round(row?.visualScale, 4),
      viewboxW: round(row?.viewbox?.width, 4),
      viewboxH: round(row?.viewbox?.height, 4),
      viewportTransform: String(row?.viewportTransform || ""),
      bpmnWidth: round(bpmnWidth, 4),
      bpmnGroupWidth: round(row?.bpmn?.width, 4),
      drawioWidth: round(row?.drawio?.width, 4),
      bpmnScale: round(bpmnScale, 4),
      drawioScale: round(drawioScale, 4),
      scaleDelta: round(Math.abs(drawioScale - bpmnScale), 4),
      widthRatio: round(widthRatio, 4),
      ratioDeltaFromBase: round(Math.abs(widthRatio - baseWidthRatio), 4),
    };
  });

  console.log(`[drawio-visual-scale-parity] ${JSON.stringify(parityRows)}`);

  for (const row of parityRows) {
    expect(row.scaleDelta).toBeLessThan(0.14);
    expect(row.ratioDeltaFromBase).toBeLessThan(0.2);
  }
});
