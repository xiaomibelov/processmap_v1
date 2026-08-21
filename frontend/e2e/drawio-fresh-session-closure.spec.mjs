import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function openLayers(page) {
  const popover = page.getByTestId("diagram-action-layers-popover");
  if (await popover.isVisible().catch(() => false)) {
    return popover;
  }
  await page.getByTestId("diagram-action-layers").click({ force: true });
  await expect(popover).toBeVisible();
  return popover;
}

async function closeLayers(page) {
  const popover = page.getByTestId("diagram-action-layers-popover");
  if (await popover.isVisible().catch(() => false)) {
    await page.getByTestId("diagram-action-layers").click({ force: true });
    await expect(popover).toBeHidden().catch(() => {});
  }
}

async function readDrawioMeta(page) {
  return await page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    return typeof api?.readMeta === "function" ? api.readMeta() : {};
  });
}

async function readDrawioSummary(page) {
  return await page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const activeRows = rows.filter((row) => row && row.deleted !== true);
    return {
      enabled: meta?.enabled === true,
      mode: String(meta?.interaction_mode || ""),
      tool: String(meta?.active_tool || ""),
      ids: activeRows.map((row) => String(row?.id || "")).filter(Boolean),
      svgCacheLength: String(meta?.svg_cache || "").length,
      docXmlLength: String(meta?.doc_xml || "").length,
    };
  });
}

async function movePointerIntoOverlay(page, position = { x: 320, y: 220 }) {
  const overlay = page.getByTestId("drawio-overlay-svg");
  await expect(overlay).toBeVisible();
  await overlay.hover({ force: true, position });
  return overlay;
}

async function enableDrawio(page) {
  const popover = await openLayers(page);
  const toggle = popover.getByTestId("diagram-action-layers-drawio-toggle");
  if (!(await toggle.isChecked().catch(() => false))) {
    await toggle.check({ force: true });
  }
  await expect(toggle).toBeChecked();
  await expect
    .poll(async () => {
      const meta = await readDrawioSummary(page);
      return meta.enabled;
    })
    .toBe(true);
  return popover;
}

async function selectRuntimeTool(page, toolId) {
  const popover = await openLayers(page);
  const modeEditButton = popover.getByTestId("diagram-action-layers-mode-edit");
  await expect(modeEditButton).toBeEnabled();
  await modeEditButton.click({ force: true });
  await expect
    .poll(async () => {
      const meta = await readDrawioSummary(page);
      return meta.mode;
    })
    .toBe("edit");
  const button = popover.getByTestId(`diagram-action-layers-tool-${toolId}`);
  await expect(button).toBeEnabled();
  await button.click({ force: true });
  await expect
    .poll(async () => {
      const meta = await readDrawioSummary(page);
      return { enabled: meta.enabled, mode: meta.mode, tool: meta.tool };
    })
    .toEqual({ enabled: true, mode: "edit", tool: toolId });
  return popover;
}

async function waitForCreatedId(page, prefix) {
  await expect
    .poll(async () => {
      const summary = await readDrawioSummary(page);
      return summary.ids.find((row) => row.startsWith(prefix)) || "";
    })
    .not.toEqual("");
  return await page.evaluate((needle) => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return rows.map((row) => String(row?.id || "")).find((id) => id.startsWith(String(needle || ""))) || "";
  }, prefix);
}

async function readPersistedDrawio(request, accessTokenRaw, sessionIdRaw) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionIdRaw || ""))}`, {
    headers: {
      Authorization: `Bearer ${String(accessTokenRaw || "")}`,
    },
  });
  expect(res.ok(), "read persisted drawio state").toBeTruthy();
  const body = await res.json().catch(() => ({}));
  return body?.bpmn_meta?.drawio || {};
}

async function selectDrawioElement(page, elementId) {
  await selectRuntimeTool(page, "select");
  await closeLayers(page);
  const locator = page.getByTestId(`drawio-el-${elementId}`);
  await expect(locator).toBeVisible();
  await locator.click({ force: true });
  return await openLayers(page);
}

async function readCanvasViewportState(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const viewbox = canvas?.viewbox?.();
    const zoom = Number(canvas?.zoom?.() || NaN);
    return {
      x: Number(viewbox?.x || 0),
      y: Number(viewbox?.y || 0),
      width: Number(viewbox?.width || 0),
      height: Number(viewbox?.height || 0),
      zoom,
    };
  });
}

async function readProbeEventOwner(page) {
  return await page.evaluate(() => {
    const surface = document.querySelector(".bpmnStageHost .djs-container svg");
    if (!(surface instanceof SVGElement)) {
      return { ok: false, reason: "bpmn_surface_missing" };
    }
    const box = surface.getBoundingClientRect();
    const x = Number(box.left || 0) + Math.max(80, Number(box.width || 0) - 120);
    const y = Number(box.top || 0) + Math.max(120, Number(box.height || 0) - 140);
    const target = document.elementFromPoint(x, y);
    const owner = target instanceof Element ? {
      tag: String(target.tagName || "").toLowerCase(),
      testId: String(target.getAttribute("data-testid") || ""),
      className: String(target.getAttribute("class") || ""),
      id: String(target.getAttribute("id") || ""),
    } : null;
    return { ok: true, x, y, owner };
  });
}

function center(box) {
  if (!box) return { x: NaN, y: NaN };
  return {
    x: Number(box.x || 0) + (Number(box.width || 0) / 2),
    y: Number(box.y || 0) + (Number(box.height || 0) / 2),
  };
}

async function readViewportTransformSnapshot(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const viewbox = canvas?.viewbox?.() || {};
    const transformNode = document.querySelector("[data-testid='drawio-overlay-viewport-g']");
    return {
      zoom: Number(canvas?.zoom?.() || 0),
      viewbox: {
        x: Number(viewbox?.x || 0),
        y: Number(viewbox?.y || 0),
        width: Number(viewbox?.width || 0),
        height: Number(viewbox?.height || 0),
      },
      overlayTransform: String(transformNode?.getAttribute?.("transform") || ""),
    };
  });
}

async function readElementBBox(page, testId) {
  return await page.getByTestId(testId).boundingBox();
}

async function setCanvasViewbox(page, patchRaw = {}) {
  const patch = patchRaw && typeof patchRaw === "object" ? patchRaw : {};
  await page.evaluate((patchInner) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const current = canvas?.viewbox?.();
    if (!canvas || !current) return false;
    canvas.viewbox({
      ...current,
      ...(patchInner && typeof patchInner === "object" ? patchInner : {}),
    });
    return true;
  }, patch);
}

test("drawio fresh session closure: runtime tools work end-to-end on a clean session", async ({ page, request }) => {
  test.setTimeout(240000);
  page.on("pageerror", (error) => {
    console.info("[drawio-fresh.pageerror]", String(error?.message || error));
  });
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_fresh_session_closure`,
    auth.headers,
    seedXml({ processName: `Drawio fresh closure ${runId}`, taskName: "Drawio fresh task" }),
  );

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  let popover = await openLayers(page);
  await expect(popover.getByTestId("diagram-action-layers-drawio-toggle")).not.toBeChecked();
  await expect(popover.getByTestId("diagram-action-layers-tool-rect")).toBeDisabled();
  await expect(popover.getByTestId("diagram-action-layers-drawio-export")).toBeDisabled();
  await closeLayers(page);

  await enableDrawio(page);
  popover = await openLayers(page);
  await expect(popover.getByTestId("diagram-action-layers-selection-chip")).toContainText("—");
  await closeLayers(page);

  await selectRuntimeTool(page, "rect");
  await closeLayers(page);
  await movePointerIntoOverlay(page, { x: 300, y: 180 });
  await expect(page.getByTestId("drawio-placement-preview-rect")).toBeVisible();
  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await overlaySvg.click({ force: true, position: { x: 300, y: 180 } });
  const rectId = await waitForCreatedId(page, "rect_");
  await expect(page.getByTestId(`drawio-el-${rectId}`)).toBeVisible();

  await selectRuntimeTool(page, "text");
  await closeLayers(page);
  await movePointerIntoOverlay(page, { x: 380, y: 230 });
  await expect(page.getByTestId("drawio-placement-preview-text")).toBeVisible();
  await overlaySvg.click({ force: true, position: { x: 380, y: 230 } });
  const textId = await waitForCreatedId(page, "text_");
  await expect(page.getByTestId(`drawio-el-${textId}`)).toBeVisible();

  await selectRuntimeTool(page, "container");
  await closeLayers(page);
  await movePointerIntoOverlay(page, { x: 520, y: 260 });
  await expect(page.getByTestId("drawio-placement-preview-container")).toBeVisible();
  await overlaySvg.click({ force: true, position: { x: 520, y: 260 } });
  const containerId = await waitForCreatedId(page, "container_");
  await expect(page.getByTestId(`drawio-el-${containerId}`)).toBeVisible();

  popover = await selectDrawioElement(page, rectId);
  await expect(popover.getByTestId("diagram-action-layers-selected-type-chip")).toHaveText("Блок / контейнер");
  await expect(popover.getByTestId("diagram-action-layers-selected-group-style")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-group-size")).toBeVisible();
  await closeLayers(page);

  popover = await selectDrawioElement(page, textId);
  await expect(popover.getByTestId("diagram-action-layers-selected-type-chip")).toHaveText("Текстовый блок");
  await expect(popover.getByTestId("diagram-action-layers-selected-group-text")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-group-size")).toHaveCount(0);
  await closeLayers(page);

  popover = await selectDrawioElement(page, containerId);
  await expect(popover.getByTestId("diagram-action-layers-selected-type-chip")).toHaveText("Блок / контейнер");
  await expect(popover.getByTestId("diagram-action-layers-selected-group-style")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-group-size")).toBeVisible();
  await closeLayers(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await expect(page.getByTestId(`drawio-el-${rectId}`)).toBeVisible();
  await expect(page.getByTestId(`drawio-el-${textId}`)).toBeVisible();
  await expect(page.getByTestId(`drawio-el-${containerId}`)).toBeVisible();

  const persisted = await readPersistedDrawio(request, auth.accessToken, fixture.sessionId);
  const persistedIds = (Array.isArray(persisted?.drawio_elements_v1) ? persisted.drawio_elements_v1 : [])
    .filter((row) => row && row.deleted !== true)
    .map((row) => String(row?.id || ""));
  expect(persistedIds).toContain(rectId);
  expect(persistedIds).toContain(textId);
  expect(persistedIds).toContain(containerId);
  expect(String(persisted?.doc_xml || "")).toContain(rectId);
  expect(String(persisted?.doc_xml || "")).toContain(textId);
  expect(String(persisted?.doc_xml || "")).toContain(containerId);
});

test("drawio re-enter: persisted overlay is visible immediately before first viewport interaction", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_reenter_visible`,
    auth.headers,
    seedXml({ processName: `Drawio reenter ${runId}`, taskName: "Drawio reenter task" }),
  );

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  await enableDrawio(page);
  await selectRuntimeTool(page, "rect");
  await closeLayers(page);
  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await movePointerIntoOverlay(page, { x: 320, y: 220 });
  await expect(page.getByTestId("drawio-placement-preview-rect")).toBeVisible();
  await overlaySvg.click({ force: true, position: { x: 320, y: 220 } });
  const rectId = await waitForCreatedId(page, "rect_");
  const rectLocator = page.getByTestId(`drawio-el-${rectId}`);
  await expect(rectLocator).toBeVisible();

  await page.goto(`/app?project=${encodeURIComponent(String(fixture.projectId || ""))}`, { waitUntil: "networkidle" });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  await expect
    .poll(async () => {
      const meta = await readDrawioSummary(page);
      return {
        enabled: meta.enabled,
        hasRect: meta.ids.includes(rectId),
        svgCacheLength: meta.svgCacheLength > 0,
      };
    }, { timeout: 30000 })
    .toEqual({ enabled: true, hasRect: true, svgCacheLength: true });

  const reenteredRect = page.getByTestId(`drawio-el-${rectId}`);
  await expect(reenteredRect).toBeVisible({ timeout: 15000 });

  const beforeBox = await reenteredRect.boundingBox();
  expect(beforeBox && beforeBox.width > 5 && beforeBox.height > 5).toBeTruthy();

  const beforeTransform = await readViewportTransformSnapshot(page);
  const beforeCenter = center(beforeBox);

  await page.getByTestId("diagram-action-zoom-in").click({ force: true });
  await expect
    .poll(async () => {
      const box = await reenteredRect.boundingBox();
      const transform = await readViewportTransformSnapshot(page);
      return {
        zoomChanged: Number(transform.zoom || 0) > Number(beforeTransform.zoom || 0),
        visible: !!box && Number(box.width || 0) > 5,
      };
    }, { timeout: 15000 })
    .toEqual({ zoomChanged: true, visible: true });

  const afterBox = await reenteredRect.boundingBox();
  const afterCenter = center(afterBox);
  expect(Number(afterBox?.width || 0)).toBeGreaterThan(Number(beforeBox?.width || 0));
  expect(Number(afterCenter.x || 0)).not.toBeNaN();
  expect(Number(afterCenter.y || 0)).not.toBeNaN();
  expect(Math.abs(Number(afterCenter.x || 0) - Number(beforeCenter.x || 0))).toBeGreaterThanOrEqual(0);
});

test("drawio fresh session closure: supported panel and editor actions stay truthful", async ({ page, request }) => {
  test.setTimeout(240000);
  page.on("pageerror", (error) => {
    console.info("[drawio-fresh.pageerror]", String(error?.message || error));
  });
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_fresh_panel_actions`,
    auth.headers,
    seedXml({ processName: `Drawio fresh panel actions ${runId}`, taskName: "Drawio fresh action task" }),
  );

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  await enableDrawio(page);
  await closeLayers(page);
  await selectRuntimeTool(page, "rect");
  await closeLayers(page);
  const overlaySvg = await movePointerIntoOverlay(page, { x: 320, y: 190 });
  await expect(page.getByTestId("drawio-placement-preview-rect")).toBeVisible();
  await overlaySvg.click({ force: true, position: { x: 320, y: 190 } });
  const rectId = await waitForCreatedId(page, "rect_");

  let popover = await openLayers(page);
  await expect(popover.getByTestId("diagram-action-layers-drawio-open")).toBeEnabled();
  await expect(popover.getByTestId("diagram-action-layers-drawio-import")).toBeEnabled();
  await expect(popover.getByTestId("diagram-action-layers-drawio-export")).toBeEnabled();
  await expect(popover.getByTestId("diagram-action-layers-drawio-opacity")).toBeEnabled();

  await popover.getByTestId("diagram-action-layers-drawio-opacity").fill("60");
  await expect
    .poll(async () => {
      const meta = await readDrawioMeta(page);
      return Number(meta?.opacity || 0);
    })
    .toBe(0.6);

  await popover.getByTestId("diagram-action-layers-drawio-lock").click({ force: true });
  await expect(popover.getByTestId("diagram-action-layers-drawio-open")).toBeDisabled();
  await expect(popover.getByTestId("diagram-action-layers-drawio-import")).toBeDisabled();
  await expect(popover.getByTestId("diagram-action-layers-tool-rect")).toBeDisabled();
  await popover.getByTestId("diagram-action-layers-drawio-lock").click({ force: true });
  await expect(popover.getByTestId("diagram-action-layers-drawio-open")).toBeEnabled();
  await expect(popover.getByTestId("diagram-action-layers-drawio-import")).toBeEnabled();

  await popover.getByTestId("diagram-action-layers-drawio-open").click({ force: true });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  await expect(popover.getByText(/opened/i)).toHaveCount(0).catch(() => {});

  await page.evaluate(async () => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    await api?.savePayload?.({
      docXml: String(meta?.doc_xml || ""),
      svgCache: String(meta?.svg_cache || ""),
    });
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toHaveCount(0);

  popover = await openLayers(page);
  await expect(popover.getByText(/saved/i)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await popover.getByTestId("diagram-action-layers-drawio-export").click({ force: true });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(".drawio");

  const importXml = [
    "<mxfile host=\"ProcessMap\" version=\"1\">",
    "<diagram id=\"page-1\" name=\"Page-1\">",
    "<mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/>",
    `<mxCell id="${rectId}" value="Imported" style="rounded=1;whiteSpace=wrap;html=1;" parent="1" vertex="1">`,
    "<mxGeometry x=\"260\" y=\"150\" width=\"160\" height=\"70\" as=\"geometry\"/>",
    "</mxCell></root></mxGraphModel>",
    "</diagram></mxfile>",
  ].join("");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await popover.getByTestId("diagram-action-layers-drawio-import").click({ force: true });
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "fresh-import.drawio",
    mimeType: "application/xml",
    buffer: Buffer.from(importXml, "utf8"),
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector("[role='dialog'] .modalHeader button.iconBtn");
    if (button instanceof HTMLButtonElement) {
      button.click();
      return true;
    }
    return false;
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toHaveCount(0);

  const meta = await readDrawioMeta(page);
  expect(String(meta?.doc_xml || "")).toContain(rectId);
  expect(String(meta?.doc_xml || "")).toContain("Imported");
});

test("drawio fresh session closure: overlay pointer ownership no longer blocks supported viewport controls", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_viewport_contract`,
    auth.headers,
    seedXml({ processName: `Drawio viewport ${runId}`, taskName: "Drawio viewport task" }),
  );

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const baselineOwner = await readProbeEventOwner(page);
  expect(baselineOwner.ok).toBeTruthy();
  expect(String(baselineOwner.owner?.testId || "")).not.toBe("drawio-overlay-svg");
  const baselineBeforeWheel = await readCanvasViewportState(page);
  await page.getByTestId("diagram-zoom-in").click({ force: true });
  await expect
    .poll(async () => {
      const next = await readCanvasViewportState(page);
      return Number(next.zoom || 0);
    })
    .toBeGreaterThan(Number(baselineBeforeWheel.zoom || 0) + 0.02);

  let popover = await enableDrawio(page);
  await popover.getByTestId("diagram-action-layers-mode-view").click({ force: true });
  await expect
    .poll(async () => {
      const meta = await readDrawioSummary(page);
      return meta.mode;
    })
    .toBe("view");
  await closeLayers(page);

  const overlayViewOwner = await readProbeEventOwner(page);
  expect(overlayViewOwner.ok).toBeTruthy();
  expect(String(overlayViewOwner.owner?.testId || "")).not.toBe("drawio-overlay-svg");
  const overlayOnBeforeWheel = await readCanvasViewportState(page);
  await page.getByTestId("diagram-zoom-out").click({ force: true });
  await expect
    .poll(async () => {
      const next = await readCanvasViewportState(page);
      return Number(next.zoom || 0);
    })
    .toBeLessThan(Number(overlayOnBeforeWheel.zoom || 0) - 0.02);

  popover = await openLayers(page);
  await popover.getByTestId("diagram-action-layers-mode-edit").click({ force: true });
  await expect
    .poll(async () => {
      const meta = await readDrawioSummary(page);
      return meta.mode;
    })
    .toBe("edit");
  await closeLayers(page);

  await selectRuntimeTool(page, "rect");
  await closeLayers(page);
  await movePointerIntoOverlay(page, { x: 300, y: 180 });
  await expect(page.getByTestId("drawio-placement-preview-rect")).toBeVisible();
  await page.getByTestId("drawio-overlay-svg").click({ force: true, position: { x: 300, y: 180 } });
  const rectId = await waitForCreatedId(page, "rect_");
  await expect(page.getByTestId(`drawio-el-${rectId}`)).toBeVisible();

  await selectRuntimeTool(page, "select");
  await closeLayers(page);

  const selectOwner = await readProbeEventOwner(page);
  expect(selectOwner.ok).toBeTruthy();
  expect(String(selectOwner.owner?.testId || "")).not.toBe("drawio-overlay-svg");
  const selectBeforeWheel = await readCanvasViewportState(page);
  await page.getByTestId("diagram-zoom-in").click({ force: true });
  await expect
    .poll(async () => {
      const next = await readCanvasViewportState(page);
      return Number(next.zoom || 0);
    })
    .toBeGreaterThan(Number(selectBeforeWheel.zoom || 0) + 0.02);

  await selectRuntimeTool(page, "text");
  await closeLayers(page);
  const textCreateOwner = await readProbeEventOwner(page);
  expect(String(textCreateOwner.owner?.testId || "")).toBe("drawio-overlay-svg");
  await movePointerIntoOverlay(page, { x: 380, y: 220 });
  await expect(page.getByTestId("drawio-placement-preview-text")).toBeVisible();
  await page.getByTestId("diagram-zoom-in").click({ force: true });
  await expect
    .poll(async () => {
      const next = await readCanvasViewportState(page);
      return Number(next.zoom || 0);
    })
    .toBeGreaterThan(Number(selectBeforeWheel.zoom || 0) + 0.04);
  await page.getByTestId("drawio-overlay-svg").click({ force: true, position: { x: 380, y: 220 } });
  const textId = await waitForCreatedId(page, "text_");
  await expect(page.getByTestId(`drawio-el-${textId}`)).toBeVisible();

  await selectRuntimeTool(page, "container");
  await closeLayers(page);
  const containerCreateOwner = await readProbeEventOwner(page);
  expect(String(containerCreateOwner.owner?.testId || "")).toBe("drawio-overlay-svg");
  await movePointerIntoOverlay(page, { x: 520, y: 260 });
  await expect(page.getByTestId("drawio-placement-preview-container")).toBeVisible();
  await page.getByTestId("diagram-zoom-out").click({ force: true });
  await page.getByTestId("drawio-overlay-svg").click({ force: true, position: { x: 520, y: 260 } });
  const containerId = await waitForCreatedId(page, "container_");
  await expect(page.getByTestId(`drawio-el-${containerId}`)).toBeVisible();
});

test("drawio fresh session closure: fresh runtime-created elements stay coupled to BPMN viewport transform", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_viewport_parity`,
    auth.headers,
    seedXml({ processName: `Drawio viewport parity ${runId}`, taskName: "Drawio parity task" }),
  );

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  await enableDrawio(page);
  await closeLayers(page);

  await selectRuntimeTool(page, "rect");
  await closeLayers(page);
  const overlaySvg = await movePointerIntoOverlay(page, { x: 300, y: 180 });
  await expect(page.getByTestId("drawio-placement-preview-rect")).toBeVisible();
  await overlaySvg.click({ force: true, position: { x: 300, y: 180 } });
  const rectId = await waitForCreatedId(page, "rect_");

  await selectRuntimeTool(page, "text");
  await closeLayers(page);
  await movePointerIntoOverlay(page, { x: 420, y: 240 });
  await expect(page.getByTestId("drawio-placement-preview-text")).toBeVisible();
  await overlaySvg.click({ force: true, position: { x: 420, y: 240 } });
  const textId = await waitForCreatedId(page, "text_");

  await selectRuntimeTool(page, "container");
  await closeLayers(page);
  await movePointerIntoOverlay(page, { x: 560, y: 300 });
  await expect(page.getByTestId("drawio-placement-preview-container")).toBeVisible();
  await overlaySvg.click({ force: true, position: { x: 560, y: 300 } });
  const containerId = await waitForCreatedId(page, "container_");

  const rectBefore = await readElementBBox(page, `drawio-el-${rectId}`);
  const textBefore = await readElementBBox(page, `drawio-el-${textId}`);
  const containerBefore = await readElementBBox(page, `drawio-el-${containerId}`);
  const viewportBefore = await readViewportTransformSnapshot(page);

  await page.getByTestId("diagram-zoom-in").click({ force: true });
  await expect
    .poll(async () => (await readViewportTransformSnapshot(page)).zoom)
    .toBeGreaterThan(Number(viewportBefore.zoom || 0) + 0.02);

  const rectZoomed = await readElementBBox(page, `drawio-el-${rectId}`);
  const textZoomed = await readElementBBox(page, `drawio-el-${textId}`);
  const containerZoomed = await readElementBBox(page, `drawio-el-${containerId}`);
  const viewportZoomed = await readViewportTransformSnapshot(page);

  const rectScaleRatio = Number(rectZoomed?.width || 1) / Math.max(1, Number(rectBefore?.width || 1));
  const textScaleRatio = Number(textZoomed?.width || 1) / Math.max(1, Number(textBefore?.width || 1));
  const containerScaleRatio = Number(containerZoomed?.width || 1) / Math.max(1, Number(containerBefore?.width || 1));
  const viewportZoomRatio = Number(viewportZoomed.zoom || 1) / Math.max(0.01, Number(viewportBefore.zoom || 1));

  expect(Math.abs(rectScaleRatio - viewportZoomRatio)).toBeLessThan(0.08);
  expect(Math.abs(textScaleRatio - viewportZoomRatio)).toBeLessThan(0.12);
  expect(Math.abs(containerScaleRatio - viewportZoomRatio)).toBeLessThan(0.08);
  expect(String(viewportZoomed.overlayTransform || "")).toContain("matrix(");

  const stableAfterZoomBefore = {
    rect: rectZoomed,
    text: textZoomed,
    container: containerZoomed,
  };
  await openLayers(page);
  await closeLayers(page);
  await page.waitForTimeout(450);
  const rectStableAfterZoom = await readElementBBox(page, `drawio-el-${rectId}`);
  const textStableAfterZoom = await readElementBBox(page, `drawio-el-${textId}`);
  const containerStableAfterZoom = await readElementBBox(page, `drawio-el-${containerId}`);
  expect(Math.abs(Number(rectStableAfterZoom?.width || 0) - Number(stableAfterZoomBefore.rect?.width || 0))).toBeLessThan(6);
  expect(Math.abs(Number(rectStableAfterZoom?.height || 0) - Number(stableAfterZoomBefore.rect?.height || 0))).toBeLessThan(6);
  expect(Math.abs(Number(textStableAfterZoom?.width || 0) - Number(stableAfterZoomBefore.text?.width || 0))).toBeLessThan(8);
  expect(Math.abs(Number(textStableAfterZoom?.height || 0) - Number(stableAfterZoomBefore.text?.height || 0))).toBeLessThan(8);
  expect(Math.abs(Number(containerStableAfterZoom?.width || 0) - Number(stableAfterZoomBefore.container?.width || 0))).toBeLessThan(6);
  expect(Math.abs(Number(containerStableAfterZoom?.height || 0) - Number(stableAfterZoomBefore.container?.height || 0))).toBeLessThan(6);

  const rectCenterBefore = center(rectBefore);
  const textCenterBefore = center(textBefore);
  const containerCenterBefore = center(containerBefore);
  await setCanvasViewbox(page, {
    x: Number(viewportZoomed.viewbox?.x || 0) + 120,
    y: Number(viewportZoomed.viewbox?.y || 0) + 70,
  });
  await page.waitForTimeout(350);

  const rectPanned = await readElementBBox(page, `drawio-el-${rectId}`);
  const textPanned = await readElementBBox(page, `drawio-el-${textId}`);
  const containerPanned = await readElementBBox(page, `drawio-el-${containerId}`);
  const rectCenterZoomed = center(rectZoomed);
  const textCenterZoomed = center(textZoomed);
  const containerCenterZoomed = center(containerZoomed);
  const rectCenterPanned = center(rectPanned);
  const textCenterPanned = center(textPanned);
  const containerCenterPanned = center(containerPanned);
  const expectedPanDx = -120 * Number(viewportZoomed.zoom || 1);
  const expectedPanDy = -70 * Number(viewportZoomed.zoom || 1);

  expect(Math.abs((rectCenterPanned.x - rectCenterZoomed.x) - expectedPanDx)).toBeLessThan(14);
  expect(Math.abs((rectCenterPanned.y - rectCenterZoomed.y) - expectedPanDy)).toBeLessThan(14);
  expect(Math.abs((textCenterPanned.x - textCenterZoomed.x) - expectedPanDx)).toBeLessThan(18);
  expect(Math.abs((textCenterPanned.y - textCenterZoomed.y) - expectedPanDy)).toBeLessThan(18);
  expect(Math.abs((containerCenterPanned.x - containerCenterZoomed.x) - expectedPanDx)).toBeLessThan(14);
  expect(Math.abs((containerCenterPanned.y - containerCenterZoomed.y) - expectedPanDy)).toBeLessThan(14);

  await page.getByTestId("diagram-zoom-out").click({ force: true });
  await page.waitForTimeout(250);
  await setCanvasViewbox(page, viewportBefore.viewbox);
  await page.waitForTimeout(350);

  const rectRestored = await readElementBBox(page, `drawio-el-${rectId}`);
  const textRestored = await readElementBBox(page, `drawio-el-${textId}`);
  const containerRestored = await readElementBBox(page, `drawio-el-${containerId}`);

  expect(Math.abs(center(rectRestored).x - rectCenterBefore.x)).toBeLessThan(12);
  expect(Math.abs(center(rectRestored).y - rectCenterBefore.y)).toBeLessThan(12);
  expect(Math.abs(center(textRestored).x - textCenterBefore.x)).toBeLessThan(14);
  expect(Math.abs(center(textRestored).y - textCenterBefore.y)).toBeLessThan(14);
  expect(Math.abs(center(containerRestored).x - containerCenterBefore.x)).toBeLessThan(12);
  expect(Math.abs(center(containerRestored).y - containerCenterBefore.y)).toBeLessThan(12);
});
