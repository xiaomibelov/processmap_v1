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
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 120\"><rect id=\"shape1\" x=\"60\" y=\"30\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>",
        transform: { x: 260, y: 130 },
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
  await apiJson(res, "patch drawio meta");
}

async function openLayersPopover(page) {
  const layersBtn = page.getByTestId("diagram-action-layers");
  await expect(layersBtn).toBeVisible();
  await layersBtn.click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  return popover;
}

function isIgnorableConsoleError(messageRaw) {
  const msg = String(messageRaw || "");
  if (!msg) return true;
  if (msg.includes("Download the React DevTools")) return true;
  if (msg.includes("net::ERR_BLOCKED_BY_CLIENT")) return true;
  return false;
}

test("drawio smoke: create/edit/drag/reload + overlay zoom-pan", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_SMOKE !== "1", "Set E2E_DRAWIO_SMOKE=1 to run drawio production smoke.");

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error || ""));
  });

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_smoke`,
    auth.headers,
    seedXml({ processName: `Drawio smoke ${runId}`, taskName: "Drawio smoke task" }),
  );
  await patchDrawioMeta(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken);
  await openSessionInTopbar(page, {
    projectId: fixture.projectId,
    sessionId: fixture.sessionId,
  });
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const drawioRoot = page.getByTestId("drawio-overlay-root");
  const drawioRect = page.getByTestId("drawio-el-shape1");
  const bpmnTask = page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='Task_1']").first();
  await expect(drawioRoot).toBeVisible();
  await expect(drawioRect).toBeVisible();
  await expect(bpmnTask).toBeVisible();
  await expect(drawioRect).toHaveAttribute("data-drawio-el-id", "shape1");
  const beforeZoom = await drawioRect.boundingBox();
  const bpmnBefore = await bpmnTask.boundingBox();
  expect(beforeZoom).toBeTruthy();
  expect(bpmnBefore).toBeTruthy();

  const popover = await openLayersPopover(page);
  await expect(popover.getByTestId("diagram-action-layers-drawio-open")).toBeVisible();
  await page.getByTestId("diagram-action-layers").click({ force: true });

  const bpmnDragStart = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const elementRegistry = modeler?.get?.("elementRegistry");
    const task = elementRegistry?.get?.("Task_1");
    return task ? { x: Number(task.x || 0), y: Number(task.y || 0) } : null;
  });
  expect(bpmnDragStart).toBeTruthy();
  await bpmnTask.click({ force: true });
  const bpmnMove = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const elementRegistry = modeler?.get?.("elementRegistry");
    const modeling = modeler?.get?.("modeling");
    if (!elementRegistry || !modeling) return { ok: false, error: "services_unavailable" };
    const task = elementRegistry.get("Task_1");
    if (!task) return { ok: false, error: "task_missing" };
    modeling.moveElements([task], { x: 48, y: 24 });
    return { ok: true };
  });
  expect(bpmnMove?.ok).toBeTruthy();
  await expect
    .poll(async () => {
      const pos = await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        const elementRegistry = modeler?.get?.("elementRegistry");
        const task = elementRegistry?.get?.("Task_1");
        return task ? Number(task.x || 0) : NaN;
      });
      return Number(pos || 0);
    }, { timeout: 10000 })
    .toBeGreaterThan(Number(bpmnDragStart?.x || 0) + 8);

  const drawioOffsetBefore = await page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const shape = rows.find((row) => String(row?.id || "") === "shape1") || {};
    return Number(shape?.offset_x || 0);
  });
  const drawioEditState = await page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const layers = Array.isArray(meta?.drawio_layers_v1) ? meta.drawio_layers_v1 : [];
    const elements = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const shape = elements.find((row) => String(row?.id || "") === "shape1") || null;
    const layer = shape ? layers.find((row) => String(row?.id || "") === String(shape?.layer_id || "")) : null;
    return {
      metaLocked: meta?.locked === true,
      shapeLocked: !!shape?.locked,
      shapeVisible: shape ? shape.visible !== false : false,
      layerLocked: !!layer?.locked,
      layerVisible: layer ? layer.visible !== false : false,
    };
  });
  expect(drawioEditState.metaLocked).toBeFalsy();
  expect(drawioEditState.layerLocked).toBeFalsy();
  expect(drawioEditState.shapeLocked).toBeFalsy();
  expect(drawioEditState.shapeVisible).toBeTruthy();
  expect(drawioEditState.layerVisible).toBeTruthy();
  const drawioBox = await drawioRect.boundingBox();
  expect(drawioBox).toBeTruthy();
  await drawioRect.click({ force: true });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      const value = await page.evaluate(() => {
        const api = window.__FPC_E2E_DRAWIO__;
        const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
        const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
        const shape = rows.find((row) => String(row?.id || "") === "shape1") || {};
        return Number(shape?.offset_x || 0);
      });
      return Number(value || 0);
    }, { timeout: 10000 })
    .toBeGreaterThan(Number(drawioOffsetBefore || 0) + 8);
  const movedOffsetX = await page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const shape = rows.find((row) => String(row?.id || "") === "shape1") || {};
    return Number(shape?.offset_x || 0);
  });

  await page.getByTestId("diagram-action-fullscreen-mode").click({ force: true });
  await expect
    .poll(async () => page.evaluate(() => !!document.fullscreenElement), { timeout: 10000 })
    .toBeTruthy();
  await page.getByTestId("diagram-action-fullscreen-mode").click({ force: true });
  await expect
    .poll(async () => page.evaluate(() => !!document.fullscreenElement), { timeout: 10000 })
    .toBeFalsy();

  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const saveFromBridge = await page.evaluate(async () => {
    const api = window.__FPC_E2E_DRAWIO__;
    return api?.savePayload?.({
      docXml: "<mxfile host=\"app.diagrams.net\"></mxfile>",
      svgCache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 120\"><rect id=\"shape1\" x=\"60\" y=\"30\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(16,185,129,0.25)\" stroke=\"#059669\" stroke-width=\"3\"/></svg>",
    });
  });
  expect(saveFromBridge).toBeTruthy();
  await expect
    .poll(async () => page.evaluate(() => {
      const api = window.__FPC_E2E_DRAWIO__;
      const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
      return {
        hasDoc: String(meta?.doc_xml || "").includes("<mxfile"),
        hasPreview: String(meta?.svg_cache || "").includes("shape1"),
      };
    }), { timeout: 10000 })
    .toEqual({ hasDoc: true, hasPreview: true });

  await page.getByTestId("diagram-zoom-in").click();
  await page.getByTestId("diagram-zoom-in").click();
  await expect
    .poll(async () => {
      const box = await drawioRect.boundingBox();
      return Number(box?.width || 0);
    }, { timeout: 12000 })
    .toBeGreaterThan(Number(beforeZoom?.width || 0) + 2);

  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const vb = canvas?.viewbox?.();
    if (!canvas || !vb) return false;
    canvas.viewbox({ ...vb, x: Number(vb.x || 0) + 120, y: Number(vb.y || 0) + 80 });
    return true;
  });
  await expect(drawioRect).toBeVisible();

  await page.reload();
  await openSessionInTopbar(page, {
    projectId: fixture.projectId,
    sessionId: fixture.sessionId,
  });
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await expect(drawioRoot).toBeVisible();
  await expect(drawioRect).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => {
      const api = window.__FPC_E2E_DRAWIO__;
      const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
      const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
      const shape = rows.find((row) => String(row?.id || "") === "shape1") || {};
      return Number(shape?.offset_x || 0);
    }), { timeout: 10000 })
    .toBeGreaterThan(Number(movedOffsetX || 0) - 1);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
