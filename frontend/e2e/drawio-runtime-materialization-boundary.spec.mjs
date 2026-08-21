import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function readLegacyMarkerMap(request, accessTokenRaw, sessionIdRaw) {
  const sid = String(sessionIdRaw || "").trim();
  const token = String(accessTokenRaw || "").trim();
  if (!sid || !token) return {};
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await apiJson(res, "read session");
  const map = body?.bpmn_meta?.hybrid_layer_by_element_id;
  return map && typeof map === "object" ? map : {};
}

async function patchDrawioRuntimeFixture(request, headers, sessionId, options = {}) {
  const legacyId = String(options.legacyId || "Process_1").trim() || "Process_1";
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        interaction_mode: "view",
        doc_xml: "<mxfile host=\"app.diagrams.net\"></mxfile>",
        svg_cache: [
          "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 420 220\">",
          "<rect id=\"shape1\" x=\"40\" y=\"36\" width=\"120\" height=\"64\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/>",
          "</svg>",
        ].join(""),
        drawio_layers_v1: [
          { id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 },
        ],
        drawio_elements_v1: [
          { id: "shape1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1, offset_x: 0, offset_y: 0, z_index: 1 },
        ],
      },
      hybrid_layer_by_element_id: {
        [legacyId]: { dx: 0, dy: 0 },
      },
      hybrid_v2: {
        schema_version: 2,
        layers: [{ id: "L1", name: "Layer 1", visible: true, locked: false, opacity: 1 }],
        elements: [],
        edges: [],
        bindings: [],
        view: { mode: "edit", active_layer_id: "L1", tool: "select", peek: false },
      },
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  await apiJson(res, "patch drawio runtime fixture");
}

test("drawio runtime materialization boundary: process info/meta card must not materialize on canvas", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 for hybrid/drawio boundary test.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_materialization`,
    auth.headers,
    seedXml({ processName: `Draw.io runtime materialization ${runId}`, taskName: "Runtime materialization task" }),
  );
  await patchDrawioRuntimeFixture(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const layersBtn = page.getByTestId("diagram-action-layers");
  await layersBtn.click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  await popover.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await popover.getByTestId("diagram-action-layers-mode-edit").click({ force: true });
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__FPC_E2E_HYBRID__?.ensureEditVisible)))
    .toBeTruthy();
  await page.evaluate(() => {
    window.__FPC_E2E_HYBRID__?.ensureEditVisible?.();
    window.__FPC_E2E_HYBRID__?.selectTool?.("select");
  });
  await expect
    .poll(async () => page.evaluate(() => {
      const state = window.__FPC_E2E_HYBRID__?.getState?.() || {};
      return String(state.mode || "") === "edit" && String(state.tool || "") === "select";
    }))
    .toBeTruthy();

  const beforeMap = await readLegacyMarkerMap(request, auth.accessToken, fixture.sessionId);
  const beforeCount = Object.keys(beforeMap).length;
  const beforeCardCount = await page.getByTestId("hybrid-layer-card").count();
  const beforeHotspotCount = await page.getByTestId("hybrid-layer-hotspot").count();

  // BPMN canvas click, not draw.io element drag.
  await page.locator("[data-element-id='Task_1']").first().click({ force: true });
  await page.waitForTimeout(250);

  const afterMap = await readLegacyMarkerMap(request, auth.accessToken, fixture.sessionId);
  const afterCount = Object.keys(afterMap).length;
  const afterCardCount = await page.getByTestId("hybrid-layer-card").count();
  const afterHotspotCount = await page.getByTestId("hybrid-layer-hotspot").count();

  await popover.getByTestId("diagram-action-layers-hybrid-toggle").uncheck({ force: true });
  await expect(page.getByTestId("hybrid-layer-overlay")).toHaveCount(0);
  await popover.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await expect(page.getByTestId("hybrid-layer-overlay")).toBeVisible();
  const afterToggleCardCount = await page.getByTestId("hybrid-layer-card").count();
  const afterToggleHotspotCount = await page.getByTestId("hybrid-layer-hotspot").count();

  // eslint-disable-next-line no-console
  console.info("[drawio-runtime-materialization-boundary]", JSON.stringify({
    beforeCount,
    afterCount,
    beforeCardCount,
    afterCardCount,
    beforeHotspotCount,
    afterHotspotCount,
    afterToggleCardCount,
    afterToggleHotspotCount,
    beforeMap,
    afterMap,
  }));

  expect(beforeCount).toBeGreaterThanOrEqual(1);
  expect(afterCount).toBe(beforeCount);
  expect(beforeCardCount).toBe(0);
  expect(afterCardCount).toBe(0);
  expect(beforeHotspotCount).toBe(0);
  expect(afterHotspotCount).toBe(0);
  expect(afterToggleCardCount).toBe(0);
  expect(afterToggleHotspotCount).toBe(0);
});

test("drawio runtime materialization boundary: non-process legacy card remains available (working path)", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 for hybrid/drawio boundary test.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_materialization_working`,
    auth.headers,
    seedXml({ processName: `Draw.io runtime materialization working ${runId}`, taskName: "Runtime working task" }),
  );
  await patchDrawioRuntimeFixture(request, auth.headers, fixture.sessionId, { legacyId: "Task_1" });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const layersBtn = page.getByTestId("diagram-action-layers");
  await layersBtn.click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  await popover.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await popover.getByTestId("diagram-action-layers-mode-edit").click({ force: true });

  const beforeMap = await readLegacyMarkerMap(request, auth.accessToken, fixture.sessionId);
  const beforeCardCount = await page.getByTestId("hybrid-layer-card").count();
  const beforeHotspotCount = await page.getByTestId("hybrid-layer-hotspot").count();
  // eslint-disable-next-line no-console
  console.info("[drawio-runtime-materialization-boundary.working.before]", JSON.stringify({
    beforeMap,
    beforeCardCount,
    beforeHotspotCount,
  }));

  await page.locator("[data-element-id='Task_1']").first().click({ force: true });
  await page.waitForTimeout(250);

  const afterMap = await readLegacyMarkerMap(request, auth.accessToken, fixture.sessionId);
  const afterCardCount = await page.getByTestId("hybrid-layer-card").count();
  const afterHotspotCount = await page.getByTestId("hybrid-layer-hotspot").count();
  // eslint-disable-next-line no-console
  console.info("[drawio-runtime-materialization-boundary.working.after]", JSON.stringify({
    afterMap,
    afterCardCount,
    afterHotspotCount,
  }));

  // eslint-disable-next-line no-console
  console.info("[drawio-runtime-materialization-boundary.working]", JSON.stringify({
    beforeMap,
    afterMap,
    beforeCardCount,
    afterCardCount,
    beforeHotspotCount,
    afterHotspotCount,
  }));

  expect(Object.keys(afterMap).sort()).toEqual(Object.keys(beforeMap).sort());
  expect(Object.keys(beforeMap)).toContain("Task_1");
  expect(afterCardCount).toBeGreaterThanOrEqual(beforeCardCount);
  expect(afterHotspotCount).toBeGreaterThanOrEqual(beforeHotspotCount);
});
