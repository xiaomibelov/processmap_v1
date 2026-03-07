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
