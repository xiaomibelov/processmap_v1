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
  await apiJson(res, "patch drawio browser-runtime meta");
}

function center(box) {
  if (!box) return { x: NaN, y: NaN };
  return {
    x: Number(box.x || 0) + Number(box.width || 0) / 2,
    y: Number(box.y || 0) + Number(box.height || 0) / 2,
  };
}

async function openLayersPopover(page) {
  const popover = page.getByTestId("diagram-action-layers-popover");
  if (await popover.isVisible().catch(() => false)) {
    return popover;
  }
  const button = page.getByTestId("diagram-action-layers");
  await expect(button).toBeVisible();
  await button.click({ force: true });
  await expect(popover).toBeVisible();
  return popover;
}

async function readShapeOffsetX(page) {
  return page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const row = rows.find((item) => String(item?.id || "") === "shape1") || {};
    return Number(row?.offset_x || 0);
  });
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
      const rect = page.getByTestId("drawio-el-shape1");
      const style = String(await rect.getAttribute("style") || "");
      return style.includes("cursor:move") && style.includes("pointer-events:auto");
    })
    .toBeTruthy();
}

async function dragShape(page, rect) {
  const box = await rect.boundingBox();
  expect(box).toBeTruthy();
  const fromX = Number(box?.x || 0) + Number(box?.width || 0) / 2;
  const fromY = Number(box?.y || 0) + Number(box?.height || 0) / 2;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(fromX + 84, fromY + 36, { steps: 10 });
  await page.mouse.up();
}

test("drawio browser runtime: anchoring + renderer transform + drag/pointer gating", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_SMOKE !== "1", "Set E2E_DRAWIO_SMOKE=1 to run browser-runtime drawio checks.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_browser_runtime`,
    auth.headers,
    seedXml({ processName: `Drawio browser runtime ${runId}`, taskName: "Drawio browser task" }),
  );
  await patchDrawioMeta(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DELETE_TRACE_ENABLE__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const drawioRoot = page.getByTestId("drawio-overlay-root");
  const drawioRect = page.getByTestId("drawio-el-shape1");
  const bpmnTask = page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='Task_1']").first();
  const svgGroup = page.locator("[data-testid='drawio-overlay-svg'] > g").first();
  await expect(drawioRoot).toBeVisible();
  await expect(drawioRect).toBeVisible();
  await expect(bpmnTask).toBeVisible();
  await expect(svgGroup).toBeVisible();

  const transformBefore = String(await svgGroup.getAttribute("transform") || "");
  expect(transformBefore.includes("matrix(")).toBeTruthy();
  expect(transformBefore.includes("translate(")).toBeFalsy();
  const styleBefore = String(await drawioRect.getAttribute("style") || "");
  expect(/translate3d|matrix\(/i.test(styleBefore)).toBeFalsy();

  const beforeRect = await drawioRect.boundingBox();
  const bpmnBeforeRect = await bpmnTask.boundingBox();
  const beforeRectCenter = center(beforeRect);
  const viewboxBefore = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const vb = canvas?.viewbox?.() || {};
    return {
      vbX: Number(vb?.x || 0),
      vbY: Number(vb?.y || 0),
      vbWidth: Math.max(1, Number(vb?.width || 0)),
      vbHeight: Math.max(1, Number(vb?.height || 0)),
    };
  });

  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const vb = canvas?.viewbox?.();
    if (!canvas || !vb) return false;
    canvas.viewbox({
      ...vb,
      x: Number(vb.x || 0) + 140,
      y: Number(vb.y || 0) + 90,
      width: Number(vb.width || 0) * 1.18,
      height: Number(vb.height || 0) * 1.18,
    });
    return true;
  });
  await page.waitForTimeout(250);

  const afterRect = await drawioRect.boundingBox();
  const bpmnAfterRect = await bpmnTask.boundingBox();
  const afterRectCenter = center(afterRect);
  const transformAfterPan = String(await svgGroup.getAttribute("transform") || "");
  expect(transformAfterPan.includes("matrix(")).toBeTruthy();
  expect(transformAfterPan.includes("translate(")).toBeFalsy();
  expect(Math.abs(afterRectCenter.x - beforeRectCenter.x)).toBeGreaterThan(8);
  expect(Math.abs(afterRectCenter.y - beforeRectCenter.y)).toBeGreaterThan(8);
  const drawioScaleRatio = Number(afterRect?.width || 1) / Math.max(1, Number(beforeRect?.width || 1));
  const bpmnScaleRatio = Number(bpmnAfterRect?.width || 1) / Math.max(1, Number(bpmnBeforeRect?.width || 1));
  expect(Math.abs(drawioScaleRatio - bpmnScaleRatio)).toBeLessThan(0.18);

  await page.evaluate((vbRaw) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    if (!canvas) return false;
    canvas.viewbox({
      x: Number(vbRaw?.vbX || 0),
      y: Number(vbRaw?.vbY || 0),
      width: Number(vbRaw?.vbWidth || 1),
      height: Number(vbRaw?.vbHeight || 1),
    });
    return true;
  }, viewboxBefore);
  await page.waitForTimeout(250);
  const restoredRect = await drawioRect.boundingBox();
  const restoredCenter = center(restoredRect);
  expect(Math.abs(restoredCenter.x - beforeRectCenter.x)).toBeLessThan(10);
  expect(Math.abs(restoredCenter.y - beforeRectCenter.y)).toBeLessThan(10);

  const popover = await openLayersPopover(page);
  await ensureDrawioEditMode(page, popover);
  const commitCountBefore = await page.evaluate(() => {
    const trace = Array.isArray(window.__FPC_DELETE_TRACE__) ? window.__FPC_DELETE_TRACE__ : [];
    return trace.filter((row) => String(row?.stage || "") === "drawio_drag_commit").length;
  });
  await dragShape(page, drawioRect);
  const afterDragBox = await drawioRect.boundingBox();
  await page.waitForTimeout(300);
  const stableBox = await drawioRect.boundingBox();
  expect(Number(afterDragBox?.x || 0)).toBeGreaterThan(Number(beforeRect?.x || 0) + 10);
  expect(Math.abs(Number(stableBox?.x || 0) - Number(afterDragBox?.x || 0))).toBeLessThan(6);
  const offsetAfterDrag = await readShapeOffsetX(page);
  expect(offsetAfterDrag).toBeGreaterThan(8);
  const commitCountAfter = await page.evaluate(() => {
    const trace = Array.isArray(window.__FPC_DELETE_TRACE__) ? window.__FPC_DELETE_TRACE__ : [];
    return trace.filter((row) => String(row?.stage || "") === "drawio_drag_commit").length;
  });
  expect(commitCountAfter).toBeGreaterThanOrEqual(commitCountBefore);

  await popover.getByTestId("diagram-action-layers-mode-view").click({ force: true });
  await expect
    .poll(async () => {
      const style = String(await drawioRect.getAttribute("style") || "");
      return style.includes("cursor:default") && style.includes("pointer-events:none");
    })
    .toBeTruthy();
  const offsetBeforeViewDrag = await readShapeOffsetX(page);
  await dragShape(page, drawioRect);
  await page.waitForTimeout(300);
  const offsetAfterViewDrag = await readShapeOffsetX(page);
  expect(Math.abs(offsetAfterViewDrag - offsetBeforeViewDrag)).toBeLessThan(0.5);

  await expect(bpmnTask).toBeVisible();
  const bpmnDragStartX = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.("elementRegistry");
    const task = registry?.get?.("Task_1");
    return Number(task?.x || NaN);
  });
  await bpmnTask.click({ force: true });
  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.("elementRegistry");
    const modeling = modeler?.get?.("modeling");
    const task = registry?.get?.("Task_1");
    if (!task || !modeling) return false;
    modeling.moveElements([task], { x: 42, y: 18 });
    return true;
  });
  await expect
    .poll(async () => page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const registry = modeler?.get?.("elementRegistry");
      const task = registry?.get?.("Task_1");
      return Number(task?.x || NaN);
    }))
    .toBeGreaterThan(Number(bpmnDragStartX || 0) + 6);

  const popoverToggle = await openLayersPopover(page);
  const toggle = popoverToggle.getByTestId("diagram-action-layers-drawio-toggle");
  await toggle.uncheck({ force: true });
  await expect(drawioRoot).toHaveCount(0);
  await toggle.check({ force: true });
  await expect(drawioRoot).toBeVisible();
});
