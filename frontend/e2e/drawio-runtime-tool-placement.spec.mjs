import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function patchDrawioRuntimeFixture(request, headers, sessionId) {
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        interaction_mode: "view",
        active_tool: "select",
        doc_xml: "<mxfile host=\"app.diagrams.net\"></mxfile>",
        svg_cache: [
          "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 420 240\">",
          "<rect id=\"shape1\" x=\"40\" y=\"30\" width=\"120\" height=\"64\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/>",
          "</svg>",
        ].join(""),
        drawio_layers_v1: [
          { id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 },
        ],
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
  await apiJson(res, "patch drawio runtime fixture");
}

async function openLayers(page) {
  await page.getByTestId("diagram-action-layers").click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  return popover;
}

async function readDrawioState(page) {
  return page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const activeRows = rows.filter((row) => row && row.deleted !== true);
    return {
      mode: String(meta?.interaction_mode || ""),
      tool: String(meta?.active_tool || ""),
      activeIds: activeRows.map((row) => String(row?.id || "")).filter(Boolean),
      activeCount: activeRows.length,
      editorOpen: !!document.querySelector("[data-testid='drawio-editor-iframe']"),
    };
  });
}

async function readDrawioTextSummary(page, targetId, expectedText) {
  return page.evaluate(({ id, text }) => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const target = rows.find((row) => row && String(row?.id || "") === String(id || "")) || null;
    return {
      targetId: String(id || ""),
      rowText: String(target?.text || ""),
      svgContainsText: String(meta?.svg_cache || "").includes(String(text || "")),
      docContainsText: String(meta?.doc_xml || "").includes(String(text || "")),
      activeIds: rows.filter((row) => row && row.deleted !== true).map((row) => String(row?.id || "")).filter(Boolean),
    };
  }, { id: targetId, text: expectedText });
}

async function readPersistedDrawioTextSummary(request, accessTokenRaw, sessionIdRaw, targetId, expectedText) {
  const sid = String(sessionIdRaw || "").trim();
  const token = String(accessTokenRaw || "").trim();
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(res.ok(), `read persisted drawio state for ${sid}`).toBeTruthy();
  const body = await res.json().catch(() => ({}));
  const meta = body?.bpmn_meta?.drawio || {};
  const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
  const target = rows.find((row) => row && String(row?.id || "") === String(targetId || "")) || null;
  return {
    targetId: String(targetId || ""),
    rowText: String(target?.text || ""),
    svgContainsText: String(meta?.svg_cache || "").includes(String(expectedText || "")),
    docContainsText: String(meta?.doc_xml || "").includes(String(expectedText || "")),
  };
}

async function readDrawioStyleSummary(page, targetId, expected = {}) {
  return page.evaluate(({ id, fill, stroke, docFill, docStroke }) => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return {
      targetId: String(id || ""),
      activeIds: rows.filter((row) => row && row.deleted !== true).map((row) => String(row?.id || "")).filter(Boolean),
      svgContainsFill: String(meta?.svg_cache || "").includes(String(fill || "")),
      svgContainsStroke: String(meta?.svg_cache || "").includes(String(stroke || "")),
      docContainsFill: String(meta?.doc_xml || "").includes(String(docFill || "")),
      docContainsStroke: String(meta?.doc_xml || "").includes(String(docStroke || "")),
    };
  }, expected && typeof expected === "object" ? { id: targetId, ...expected } : { id: targetId });
}

async function readPersistedDrawioStyleSummary(request, accessTokenRaw, sessionIdRaw, targetId, expected = {}) {
  const sid = String(sessionIdRaw || "").trim();
  const token = String(accessTokenRaw || "").trim();
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(res.ok(), `read persisted drawio style for ${sid}`).toBeTruthy();
  const body = await res.json().catch(() => ({}));
  const meta = body?.bpmn_meta?.drawio || {};
  const arg = expected && typeof expected === "object" ? expected : {};
  return {
    targetId: String(targetId || ""),
    svgContainsFill: String(meta?.svg_cache || "").includes(String(arg.fill || "")),
    svgContainsStroke: String(meta?.svg_cache || "").includes(String(arg.stroke || "")),
    docContainsFill: String(meta?.doc_xml || "").includes(String(arg.docFill || "")),
    docContainsStroke: String(meta?.doc_xml || "").includes(String(arg.docStroke || "")),
  };
}

async function readDrawioGeometrySummary(page, targetId, expected = {}) {
  return page.evaluate(({ id, width, height }) => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const svg = String(meta?.svg_cache || "");
    const doc = String(meta?.doc_xml || "");
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return {
      targetId: String(id || ""),
      activeIds: rows.filter((row) => row && row.deleted !== true).map((row) => String(row?.id || "")).filter(Boolean),
      svgContainsWidth: svg.includes(`width="${String(width || "")}"`),
      svgContainsHeight: svg.includes(`height="${String(height || "")}"`),
      docContainsWidth: doc.includes(`width="${String(width || "")}"`),
      docContainsHeight: doc.includes(`height="${String(height || "")}"`),
    };
  }, expected && typeof expected === "object" ? { id: targetId, ...expected } : { id: targetId });
}

async function readPersistedDrawioGeometrySummary(request, accessTokenRaw, sessionIdRaw, targetId, expected = {}) {
  const sid = String(sessionIdRaw || "").trim();
  const token = String(accessTokenRaw || "").trim();
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(res.ok(), `read persisted drawio geometry for ${sid}`).toBeTruthy();
  const body = await res.json().catch(() => ({}));
  const meta = body?.bpmn_meta?.drawio || {};
  const svg = String(meta?.svg_cache || "");
  const doc = String(meta?.doc_xml || "");
  const arg = expected && typeof expected === "object" ? expected : {};
  return {
    targetId: String(targetId || ""),
    svgContainsWidth: svg.includes(`width="${String(arg.width || "")}"`),
    svgContainsHeight: svg.includes(`height="${String(arg.height || "")}"`),
    docContainsWidth: doc.includes(`width="${String(arg.width || "")}"`),
    docContainsHeight: doc.includes(`height="${String(arg.height || "")}"`),
  };
}

async function readDrawioTextWidthSummary(page, targetId, expected = {}) {
  return page.evaluate(({ id, width }) => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const svg = String(meta?.svg_cache || "");
    const doc = String(meta?.doc_xml || "");
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return {
      targetId: String(id || ""),
      activeIds: rows.filter((row) => row && row.deleted !== true).map((row) => String(row?.id || "")).filter(Boolean),
      svgContainsWidth: svg.includes(`data-drawio-text-width="${String(width || "")}"`),
      svgContainsWrappedText: svg.includes("<tspan"),
      docContainsWidth: doc.includes(`width="${String(width || "")}"`),
      docContainsValue: doc.includes(String(id || "")),
    };
  }, expected && typeof expected === "object" ? { id: targetId, ...expected } : { id: targetId });
}

async function readPersistedDrawioTextWidthSummary(request, accessTokenRaw, sessionIdRaw, targetId, expected = {}) {
  const sid = String(sessionIdRaw || "").trim();
  const token = String(accessTokenRaw || "").trim();
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(res.ok(), `read persisted drawio text width for ${sid}`).toBeTruthy();
  const body = await res.json().catch(() => ({}));
  const meta = body?.bpmn_meta?.drawio || {};
  const svg = String(meta?.svg_cache || "");
  const doc = String(meta?.doc_xml || "");
  const arg = expected && typeof expected === "object" ? expected : {};
  return {
    targetId: String(targetId || ""),
    svgContainsWidth: svg.includes(`data-drawio-text-width="${String(arg.width || "")}"`),
    svgContainsWrappedText: svg.includes("<tspan"),
    docContainsWidth: doc.includes(`width="${String(arg.width || "")}"`),
    docContainsValue: doc.includes(String(targetId || "")),
  };
}

async function selectRuntimeTool(page, toolId) {
  const popover = await openLayers(page);
  await popover.getByTestId(`diagram-action-layers-tool-${toolId}`).click({ force: true });
  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return { mode: state.mode, tool: state.tool };
    })
    .toEqual({ mode: "edit", tool: toolId });
  await page.getByTestId("diagram-action-layers").click({ force: true });
}

test("drawio runtime tools: rectangle/text/container placement works without recursion/reset", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_tools`,
    auth.headers,
    seedXml({ processName: `Drawio runtime tools ${runId}`, taskName: "Drawio runtime tool task" }),
  );
  await patchDrawioRuntimeFixture(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const before = await readDrawioState(page);
  expect(before.activeCount).toBeGreaterThanOrEqual(1);
  expect(before.editorOpen).toBeFalsy();

  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await expect(overlaySvg).toBeVisible();

  await selectRuntimeTool(page, "rect");
  await overlaySvg.click({ force: true, position: { x: 300, y: 180 } });
  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return {
        mode: state.mode,
        tool: state.tool,
        rectCount: state.activeIds.filter((id) => id.startsWith("rect_")).length,
        editorOpen: state.editorOpen,
      };
    })
    .toMatchObject({ mode: "edit", tool: "rect", editorOpen: false, rectCount: 1 });

  await selectRuntimeTool(page, "text");
  await overlaySvg.click({ force: true, position: { x: 360, y: 210 } });
  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return {
        mode: state.mode,
        tool: state.tool,
        textCount: state.activeIds.filter((id) => id.startsWith("text_")).length,
        editorOpen: state.editorOpen,
      };
    })
    .toMatchObject({ mode: "edit", tool: "text", editorOpen: false, textCount: 1 });

  await selectRuntimeTool(page, "container");
  await overlaySvg.click({ force: true, position: { x: 420, y: 240 } });
  await overlaySvg.click({ force: true, position: { x: 680, y: 340 } });
  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return {
        mode: state.mode,
        tool: state.tool,
        containerCount: state.activeIds.filter((id) => id.startsWith("container_")).length,
        activeCount: state.activeCount,
        editorOpen: state.editorOpen,
      };
    })
    .toMatchObject({
      mode: "edit",
      tool: "container",
      editorOpen: false,
      containerCount: 2,
    });
});

test("drawio runtime tools: session-first text edit works without opening full editor", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_text_edit`,
    auth.headers,
    seedXml({ processName: `Drawio runtime text edit ${runId}`, taskName: "Drawio runtime text task" }),
  );
  await patchDrawioRuntimeFixture(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await expect(overlaySvg).toBeVisible();

  await selectRuntimeTool(page, "text");
  await overlaySvg.click({ force: true, position: { x: 380, y: 220 } });

  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return state.activeIds.find((id) => id.startsWith("text_")) || "";
    })
    .not.toEqual("");

  const textId = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return rows.map((row) => String(row?.id || "")).find((id) => id.startsWith("text_")) || "";
  });
  expect(textId).toBeTruthy();

  await selectRuntimeTool(page, "select");
  await page.getByTestId(`drawio-el-${textId}`).click({ force: true });
  const popover = await openLayers(page);
  await expect(popover.getByTestId("diagram-action-layers-selected-type-chip")).toHaveText("Текстовый блок");
  await expect(popover.getByTestId("diagram-action-layers-selected-capability-text")).toHaveText("Текст");
  await expect(popover.getByTestId("diagram-action-layers-selected-capability-text_width")).toHaveText("Ширина текста");
  await expect(popover.getByTestId("diagram-action-layers-selected-group-text")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-group-size")).toHaveCount(0);
  await expect(popover.getByTestId("diagram-action-layers-selected-advanced-note")).toBeVisible();
  const textInput = popover.getByTestId("diagram-action-layers-selected-text-input");
  await expect(textInput).toBeVisible();
  await textInput.fill("Session note");
  await popover.getByTestId("diagram-action-layers-selected-text-apply").click({ force: true });

  await expect
    .poll(async () => readDrawioTextSummary(page, textId, "Session note"))
    .toMatchObject({
      targetId: textId,
      svgContainsText: true,
      docContainsText: true,
    });
  await expect
    .poll(
      async () => readPersistedDrawioTextSummary(request, auth.accessToken, fixture.sessionId, textId, "Session note"),
      { timeout: 10000 },
    )
    .toMatchObject({
      targetId: textId,
      svgContainsText: true,
      docContainsText: true,
    });

  await page.reload({ waitUntil: "domcontentloaded" });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await selectRuntimeTool(page, "select");
  await page.getByTestId(`drawio-el-${textId}`).click({ force: true });
  const reloadedPopover = await openLayers(page);
  await expect(reloadedPopover.getByTestId("diagram-action-layers-selected-text-input")).toHaveValue("Session note");
  await expect
    .poll(async () => readDrawioTextSummary(page, textId, "Session note"))
    .toMatchObject({
      targetId: textId,
      svgContainsText: true,
      docContainsText: true,
    });
});

test("drawio runtime tools: session-first text width adjust stays on same text lineage", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_text_width`,
    auth.headers,
    seedXml({ processName: `Drawio runtime text width ${runId}`, taskName: "Drawio runtime text width task" }),
  );
  await patchDrawioRuntimeFixture(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await expect(overlaySvg).toBeVisible();

  await selectRuntimeTool(page, "text");
  await overlaySvg.click({ force: true, position: { x: 380, y: 220 } });

  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return state.activeIds.find((id) => id.startsWith("text_")) || "";
    })
    .not.toEqual("");

  const textId = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return rows.map((row) => String(row?.id || "")).find((id) => id.startsWith("text_")) || "";
  });
  expect(textId).toBeTruthy();

  await selectRuntimeTool(page, "select");
  await page.getByTestId(`drawio-el-${textId}`).click({ force: true });
  let popover = await openLayers(page);
  await expect(popover.getByTestId("diagram-action-layers-selected-type-chip")).toHaveText("Текстовый блок");
  await expect(popover.getByTestId("diagram-action-layers-selected-group-text")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-group-size")).toHaveCount(0);
  await popover.getByTestId("diagram-action-layers-selected-text-input").fill("Long session first text label for wrapping");
  await popover.getByTestId("diagram-action-layers-selected-text-apply").click({ force: true });

  await expect(popover.getByTestId("diagram-action-layers-selected-text-width-input")).toBeVisible();
  await popover.getByTestId("diagram-action-layers-selected-text-width-input").fill("88");
  await popover.getByTestId("diagram-action-layers-selected-text-width-apply").click({ force: true });

  await expect
    .poll(async () => readDrawioTextWidthSummary(page, textId, { width: "88" }))
    .toMatchObject({
      targetId: textId,
      svgContainsWidth: true,
      svgContainsWrappedText: true,
      docContainsWidth: true,
      docContainsValue: true,
    });

  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const docXml = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    return String(meta?.doc_xml || "");
  });
  expect(docXml.includes(textId)).toBeTruthy();
  expect(docXml.includes('width="88"')).toBeTruthy();

  await expect
    .poll(
      async () => readPersistedDrawioTextWidthSummary(request, auth.accessToken, fixture.sessionId, textId, { width: "88" }),
      { timeout: 10000 },
    )
    .toMatchObject({
      targetId: textId,
      svgContainsWidth: true,
      svgContainsWrappedText: true,
      docContainsWidth: true,
      docContainsValue: true,
    });

  await page.reload({ waitUntil: "domcontentloaded" });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await selectRuntimeTool(page, "select");
  await page.locator(`#${textId} tspan`).first().click({ force: true });
  const reloadedPopover = await openLayers(page);
  await expect(reloadedPopover.getByTestId("diagram-action-layers-selected-text-width-input")).toHaveValue("88");
  await expect
    .poll(async () => readDrawioTextWidthSummary(page, textId, { width: "88" }))
    .toMatchObject({
      targetId: textId,
      svgContainsWidth: true,
      svgContainsWrappedText: true,
      docContainsWidth: true,
      docContainsValue: true,
    });
});

test("drawio runtime tools: session-first style preset updates selected shape without opening full editor", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_style_edit`,
    auth.headers,
    seedXml({ processName: `Drawio runtime style edit ${runId}`, taskName: "Drawio runtime style task" }),
  );
  await patchDrawioRuntimeFixture(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await expect(overlaySvg).toBeVisible();
  await selectRuntimeTool(page, "rect");
  await overlaySvg.click({ force: true, position: { x: 300, y: 180 } });
  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return state.activeIds.find((id) => id.startsWith("rect_")) || "";
    })
    .not.toEqual("");
  const targetId = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return rows.map((row) => String(row?.id || "")).find((id) => id.startsWith("rect_")) || "";
  });
  expect(targetId).toBeTruthy();

  await selectRuntimeTool(page, "select");
  await page.getByTestId(`drawio-el-${targetId}`).click({ force: true });
  const popover = await openLayers(page);
  await expect(popover.getByTestId("diagram-action-layers-selected-type-chip")).toHaveText("Блок / контейнер");
  await expect(popover.getByTestId("diagram-action-layers-selected-capability-style")).toHaveText("Быстрый стиль");
  await expect(popover.getByTestId("diagram-action-layers-selected-capability-size")).toHaveText("Размер блока");
  await expect(popover.getByTestId("diagram-action-layers-selected-group-style")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-group-size")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-style-success")).toBeVisible();
  await popover.getByTestId("diagram-action-layers-selected-style-success").click({ force: true });

  await expect
    .poll(async () => readDrawioStyleSummary(page, targetId, {
      fill: "rgba(16,185,129,0.20)",
      stroke: "#059669",
      docFill: "fillColor=#d1fae5",
      docStroke: "strokeColor=#059669",
    }))
    .toMatchObject({
      targetId,
      svgContainsFill: true,
      svgContainsStroke: true,
      docContainsFill: true,
      docContainsStroke: true,
    });

  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const styleInDoc = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    return String(meta?.doc_xml || "");
  });
  expect(styleInDoc.includes("fillColor=#d1fae5")).toBeTruthy();
  expect(styleInDoc.includes("strokeColor=#059669")).toBeTruthy();
  expect(styleInDoc.includes(targetId)).toBeTruthy();
  await expect
    .poll(
      async () => readPersistedDrawioStyleSummary(request, auth.accessToken, fixture.sessionId, targetId, {
        fill: "rgba(16,185,129,0.20)",
        stroke: "#059669",
        docFill: "fillColor=#d1fae5",
        docStroke: "strokeColor=#059669",
      }),
      { timeout: 10000 },
    )
    .toMatchObject({
      targetId,
      svgContainsFill: true,
      svgContainsStroke: true,
      docContainsFill: true,
      docContainsStroke: true,
    });

  await page.reload({ waitUntil: "domcontentloaded" });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await selectRuntimeTool(page, "select");
  await page.getByTestId(`drawio-el-${targetId}`).click({ force: true });
  const reloadedPopover = await openLayers(page);
  await expect(reloadedPopover.getByTestId("diagram-action-layers-selected-style-success")).toBeVisible();
  await expect
    .poll(async () => readDrawioStyleSummary(page, targetId, {
      fill: "rgba(16,185,129,0.20)",
      stroke: "#059669",
      docFill: "fillColor=#d1fae5",
      docStroke: "strokeColor=#059669",
    }))
    .toMatchObject({
      targetId,
      svgContainsFill: true,
      svgContainsStroke: true,
      docContainsFill: true,
      docContainsStroke: true,
    });
});

test("drawio runtime tools: session-first resize updates selected shape without opening full editor", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_resize`,
    auth.headers,
    seedXml({ processName: `Drawio runtime resize ${runId}`, taskName: "Drawio runtime resize task" }),
  );
  await patchDrawioRuntimeFixture(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const overlaySvg = page.getByTestId("drawio-overlay-svg");
  await expect(overlaySvg).toBeVisible();

  await selectRuntimeTool(page, "rect");
  await overlaySvg.click({ force: true, position: { x: 320, y: 220 } });

  await expect
    .poll(async () => {
      const state = await readDrawioState(page);
      return state.activeIds.find((id) => id.startsWith("rect_")) || "";
    })
    .not.toEqual("");

  const targetId = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    return rows.map((row) => String(row?.id || "")).find((id) => id.startsWith("rect_")) || "";
  });
  expect(targetId).toBeTruthy();

  await selectRuntimeTool(page, "select");
  await page.getByTestId(`drawio-el-${targetId}`).click({ force: true });
  const popover = await openLayers(page);
  await expect(popover.getByTestId("diagram-action-layers-selected-type-chip")).toHaveText("Блок / контейнер");
  await expect(popover.getByTestId("diagram-action-layers-selected-group-size")).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selected-group-text")).toHaveCount(0);
  const widthInput = popover.getByTestId("diagram-action-layers-selected-width-input");
  const heightInput = popover.getByTestId("diagram-action-layers-selected-height-input");
  await expect(widthInput).toBeVisible();
  await expect(heightInput).toBeVisible();
  await widthInput.fill("240");
  await heightInput.fill("96");
  await popover.getByTestId("diagram-action-layers-selected-size-apply").click({ force: true });

  await expect
    .poll(async () => readDrawioGeometrySummary(page, targetId, {
      width: "240",
      height: "96",
    }))
    .toMatchObject({
      targetId,
      svgContainsWidth: true,
      svgContainsHeight: true,
      docContainsWidth: true,
      docContainsHeight: true,
    });

  await page.evaluate(() => {
    window.__FPC_E2E_DRAWIO__?.openEditor?.();
  });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
  const docXml = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    return String(meta?.doc_xml || "");
  });
  expect(docXml.includes(targetId)).toBeTruthy();
  expect(docXml.includes('width="240"')).toBeTruthy();
  expect(docXml.includes('height="96"')).toBeTruthy();

  await expect
    .poll(
      async () => readPersistedDrawioGeometrySummary(request, auth.accessToken, fixture.sessionId, targetId, {
        width: "240",
        height: "96",
      }),
      { timeout: 10000 },
    )
    .toMatchObject({
      targetId,
      svgContainsWidth: true,
      svgContainsHeight: true,
      docContainsWidth: true,
      docContainsHeight: true,
    });

  await page.reload({ waitUntil: "domcontentloaded" });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await selectRuntimeTool(page, "select");
  await page.getByTestId(`drawio-el-${targetId}`).click({ force: true });
  const reloadedPopover = await openLayers(page);
  await expect(reloadedPopover.getByTestId("diagram-action-layers-selected-width-input")).toHaveValue("240");
  await expect(reloadedPopover.getByTestId("diagram-action-layers-selected-height-input")).toHaveValue("96");
  await expect
    .poll(async () => readDrawioGeometrySummary(page, targetId, {
      width: "240",
      height: "96",
    }))
    .toMatchObject({
      targetId,
      svgContainsWidth: true,
      svgContainsHeight: true,
      docContainsWidth: true,
      docContainsHeight: true,
    });
});
