import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

const MXFILE = "<mxfile host=\"app.diagrams.net\"></mxfile>";

async function patchLineagedDrawioMeta(request, headers, sessionId, shapeId = "shape1") {
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        interaction_mode: "view",
        active_tool: "select",
        doc_xml: MXFILE,
        svg_cache: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect id="${shapeId}" x="60" y="30" width="120" height="60" rx="8" fill="rgba(59,130,246,0.25)" stroke="#2563eb" stroke-width="3"/></svg>`,
        drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
        drawio_elements_v1: [
          { id: shapeId, layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1, offset_x: 0, offset_y: 0, z_index: 1 },
        ],
      },
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  await apiJson(res, "patch unified-editing drawio meta");
}

async function patchEmptyRuntimeDrawioMeta(request, headers, sessionId) {
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        interaction_mode: "view",
        active_tool: "select",
        doc_xml: "",
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 600\"></svg>",
        drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
        drawio_elements_v1: [],
      },
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  await apiJson(res, "patch empty runtime drawio meta");
}

async function ensureDiagramReady(page, fixture, auth) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
}

async function ensureDrawioEditMode(page, elementId) {
  await page.getByTestId("diagram-action-layers").click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  const modeEdit = popover.getByTestId("diagram-action-layers-mode-edit");
  const drawioToggle = popover.getByTestId("diagram-action-layers-drawio-toggle");
  if (await modeEdit.isDisabled()) {
    await drawioToggle.check({ force: true });
    await expect(modeEdit).toBeEnabled();
  }
  await modeEdit.click({ force: true });
  await expect
    .poll(async () => {
      const style = String(await page.getByTestId(`drawio-el-${elementId}`).getAttribute("style") || "");
      return style.includes("cursor:move") && style.includes("pointer-events:auto");
    }, { timeout: 10000 })
    .toBeTruthy();
}

async function readDrawioSummary(page, targetId) {
  return page.evaluate((id) => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const activeRows = rows.filter((row) => row && row.deleted !== true);
    const target = activeRows.find((row) => String(row?.id || "") === String(id || "")) || null;
    return {
      activeIds: activeRows.map((row) => String(row?.id || "")).filter(Boolean),
      activeCount: activeRows.length,
      hasDoc: String(meta?.doc_xml || "").includes("<mxfile"),
      docContainsTargetId: String(meta?.doc_xml || "").includes(String(id || "")),
      hasPreview: String(meta?.svg_cache || "").includes(String(id || "")),
      targetOffsetX: Number(target?.offset_x || 0),
      targetOffsetY: Number(target?.offset_y || 0),
      targetLayerId: String(target?.layer_id || ""),
      targetVisible: target ? target.visible !== false : null,
      editorOpen: !!document.querySelector("[data-testid='drawio-editor-iframe']"),
    };
  }, targetId);
}

async function readPersistedDrawioSummary(request, accessTokenRaw, sessionIdRaw, targetId) {
  const sid = String(sessionIdRaw || "").trim();
  const token = String(accessTokenRaw || "").trim();
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(res.ok(), `read persisted drawio summary for ${sid}`).toBeTruthy();
  const body = await res.json().catch(() => ({}));
  const meta = body?.bpmn_meta?.drawio || {};
  const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
  const activeRows = rows.filter((row) => row && row.deleted !== true);
  const target = activeRows.find((row) => String(row?.id || "") === String(targetId || "")) || null;
  return {
    activeIds: activeRows.map((row) => String(row?.id || "")).filter(Boolean),
    activeCount: activeRows.length,
    hasDoc: String(meta?.doc_xml || "").includes("<mxfile"),
    docContainsTargetId: String(meta?.doc_xml || "").includes(String(targetId || "")),
    hasPreview: String(meta?.svg_cache || "").includes(String(targetId || "")),
    targetOffsetX: Number(target?.offset_x || 0),
    targetOffsetY: Number(target?.offset_y || 0),
  };
}

async function selectRuntimeTool(page, toolId) {
  await page.getByTestId("diagram-action-layers").click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  await popover.getByTestId(`diagram-action-layers-tool-${toolId}`).click({ force: true });
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
        return {
          mode: String(meta?.interaction_mode || ""),
          tool: String(meta?.active_tool || ""),
        };
      });
    })
    .toEqual({ mode: "edit", tool: toolId });
  await page.getByTestId("diagram-action-layers").click({ force: true });
}

async function saveViaEditorBridge(page, { shapeId, fill = "rgba(16,185,129,0.25)", stroke = "#059669" }) {
  return page.evaluate(async ({ targetId, nextFill, nextStroke, fallbackDocXml }) => {
    const api = window.__FPC_E2E_DRAWIO__;
    const currentMeta = api?.readMeta?.() || {};
    return api?.savePayload?.({
      docXml: String(currentMeta?.doc_xml || fallbackDocXml || ""),
      svgCache: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect id="${targetId}" x="60" y="30" width="120" height="60" rx="8" fill="${nextFill}" stroke="${nextStroke}" stroke-width="3"/></svg>`,
    });
  }, {
    targetId: shapeId,
    nextFill: fill,
    nextStroke: stroke,
    fallbackDocXml: MXFILE,
  });
}

test("drawio unified editing: runtime move -> full editor apply -> reload -> runtime continue keeps one lineaged object", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_SMOKE !== "1", "Set E2E_DRAWIO_SMOKE=1 to run drawio unified editing checks.");
  test.setTimeout(240000);

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_unified_runtime_first`,
    auth.headers,
    seedXml({ processName: `Drawio unified runtime ${runId}`, taskName: "Unified runtime task" }),
  );
  await patchLineagedDrawioMeta(request, auth.headers, fixture.sessionId, "shape1");

  await ensureDiagramReady(page, fixture, auth);
  await expect(page.getByTestId("drawio-el-shape1")).toBeVisible();
  await ensureDrawioEditMode(page, "shape1");

  const offsetBefore = (await readDrawioSummary(page, "shape1")).targetOffsetX;
  await page.getByTestId("drawio-el-shape1").click({ force: true });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await readDrawioSummary(page, "shape1")).targetOffsetX, { timeout: 10000 })
    .toBeGreaterThan(offsetBefore + 8);
  const offsetAfterRuntime = (await readDrawioSummary(page, "shape1")).targetOffsetX;

  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const saved = await saveViaEditorBridge(page, { shapeId: "shape1" });
  expect(saved).toBeTruthy();
  const afterApply = await readDrawioSummary(page, "shape1");
  expect(afterApply.activeIds).toEqual(["shape1"]);
  expect(afterApply.activeCount).toBe(1);
  expect(afterApply.hasDoc).toBeTruthy();
  expect(afterApply.hasPreview).toBeTruthy();
  expect(afterApply.targetLayerId).toBe("DL1");
  expect(afterApply.targetOffsetX).toBeGreaterThan(offsetAfterRuntime - 1);
  await expect
    .poll(async () => readPersistedDrawioSummary(request, auth.accessToken, fixture.sessionId, "shape1"), { timeout: 10000 })
    .toMatchObject({
      activeIds: ["shape1"],
      activeCount: 1,
      hasDoc: true,
      hasPreview: true,
    });

  await page.reload();
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  const afterReload = await readDrawioSummary(page, "shape1");
  expect(afterReload.activeIds).toEqual(["shape1"]);
  expect(afterReload.activeCount).toBe(1);
  expect(afterReload.targetOffsetX).toBeGreaterThan(offsetAfterRuntime - 1);

  await ensureDrawioEditMode(page, "shape1");
  await page.getByTestId("drawio-el-shape1").click({ force: true });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await readDrawioSummary(page, "shape1")).targetOffsetX, { timeout: 10000 })
    .toBeGreaterThan(afterReload.targetOffsetX + 8);
  const afterContinue = await readDrawioSummary(page, "shape1");
  expect(afterContinue.activeIds).toEqual(["shape1"]);
  expect(afterContinue.activeCount).toBe(1);
});

test("drawio unified editing: full-editor-first authoring survives runtime continuation and reopen apply without duplicates", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_SMOKE !== "1", "Set E2E_DRAWIO_SMOKE=1 to run drawio unified editing checks.");
  test.setTimeout(240000);

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_unified_editor_first`,
    auth.headers,
    seedXml({ processName: `Drawio unified editor ${runId}`, taskName: "Unified editor task" }),
  );

  await ensureDiagramReady(page, fixture, auth);
  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const authored = await saveViaEditorBridge(page, {
    shapeId: "shape_alpha",
    fill: "rgba(37,99,235,0.24)",
    stroke: "#2563eb",
  });
  expect(authored).toBeTruthy();
  await expect(page.getByTestId("drawio-el-shape_alpha")).toBeVisible();
  const afterAuthor = await readDrawioSummary(page, "shape_alpha");
  expect(afterAuthor.activeIds).toEqual(["shape_alpha"]);
  expect(afterAuthor.activeCount).toBe(1);
  expect(afterAuthor.editorOpen).toBeFalsy();

  await ensureDrawioEditMode(page, "shape_alpha");
  await page.getByTestId("drawio-el-shape_alpha").click({ force: true });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await readDrawioSummary(page, "shape_alpha")).targetOffsetX, { timeout: 10000 })
    .toBeGreaterThan(8);
  const offsetAfterRuntime = (await readDrawioSummary(page, "shape_alpha")).targetOffsetX;
  await expect
    .poll(async () => readPersistedDrawioSummary(request, auth.accessToken, fixture.sessionId, "shape_alpha"), { timeout: 10000 })
    .toMatchObject({
      activeIds: ["shape_alpha"],
      activeCount: 1,
      hasDoc: true,
      hasPreview: true,
      targetOffsetX: offsetAfterRuntime,
    });

  await page.reload();
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  const afterReload = await readDrawioSummary(page, "shape_alpha");
  expect(afterReload.activeIds).toEqual(["shape_alpha"]);
  expect(afterReload.activeCount).toBe(1);
  expect(afterReload.targetOffsetX).toBeGreaterThan(offsetAfterRuntime - 1);

  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const reopened = await saveViaEditorBridge(page, {
    shapeId: "shape_alpha",
    fill: "rgba(16,185,129,0.25)",
    stroke: "#059669",
  });
  expect(reopened).toBeTruthy();
  const afterReopenApply = await readDrawioSummary(page, "shape_alpha");
  expect(afterReopenApply.activeIds).toEqual(["shape_alpha"]);
  expect(afterReopenApply.activeCount).toBe(1);
  expect(afterReopenApply.hasDoc).toBeTruthy();
  expect(afterReopenApply.hasPreview).toBeTruthy();
  expect(afterReopenApply.targetOffsetX).toBeGreaterThan(offsetAfterRuntime - 1);
});

test("drawio unified editing: runtime-created object enters doc_xml lineage and survives editor/reload continuation", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_SMOKE !== "1", "Set E2E_DRAWIO_SMOKE=1 to run drawio unified editing checks.");
  test.setTimeout(240000);

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_unified_runtime_create`,
    auth.headers,
    seedXml({ processName: `Drawio runtime create ${runId}`, taskName: "Unified runtime create task" }),
  );
  await patchEmptyRuntimeDrawioMeta(request, auth.headers, fixture.sessionId);

  await ensureDiagramReady(page, fixture, auth);
  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await expect(overlaySvg).toBeVisible();
  await selectRuntimeTool(page, "rect");
  await overlaySvg.click({ force: true, position: { x: 320, y: 220 } });

  await expect
    .poll(async () => {
      const summary = await readDrawioSummary(page, "");
      return summary.activeIds.some((id) => String(id || "").startsWith("rect_"));
    }, { timeout: 10000 })
    .toBeTruthy();

  const createdSummary = await readDrawioSummary(page, "");
  const createdId = String(createdSummary.activeIds.find((id) => String(id || "").startsWith("rect_")) || "");
  expect(createdId).not.toBe("");
  const exactAfterCreate = await readDrawioSummary(page, createdId);
  expect(exactAfterCreate.docContainsTargetId).toBeTruthy();
  expect(exactAfterCreate.hasPreview).toBeTruthy();
  expect(exactAfterCreate.activeIds.filter((id) => id === createdId)).toHaveLength(1);
  await expect
    .poll(async () => readPersistedDrawioSummary(request, auth.accessToken, fixture.sessionId, createdId), { timeout: 10000 })
    .toMatchObject({
      activeIds: [createdId],
      activeCount: 1,
      hasDoc: true,
      docContainsTargetId: true,
      hasPreview: true,
    });

  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const saved = await saveViaEditorBridge(page, {
    shapeId: createdId,
    fill: "rgba(16,185,129,0.25)",
    stroke: "#059669",
  });
  expect(saved).toBeTruthy();
  const afterApply = await readDrawioSummary(page, createdId);
  expect(afterApply.activeIds.filter((id) => id === createdId)).toHaveLength(1);
  expect(afterApply.activeCount).toBe(1);
  expect(afterApply.docContainsTargetId).toBeTruthy();

  await page.reload();
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  const afterReload = await readDrawioSummary(page, createdId);
  expect(afterReload.activeIds.filter((id) => id === createdId)).toHaveLength(1);
  expect(afterReload.activeCount).toBe(1);
  expect(afterReload.docContainsTargetId).toBeTruthy();

  await ensureDrawioEditMode(page, createdId);
  await page.getByTestId(`drawio-el-${createdId}`).click({ force: true });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await readDrawioSummary(page, createdId)).targetOffsetX, { timeout: 10000 })
    .toBeGreaterThan(8);
});
