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
        doc_xml: "<mxfile host=\"app.diagrams.net\"></mxfile>",
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 120\"><rect id=\"shape1\" x=\"60\" y=\"30\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>",
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
  await apiJson(res, "patch drawio stage1 meta");
}

test("drawio stage1 boundary smoke: move/delete/opacity/toggle/editor+reload", async ({ page, request }) => {
  test.setTimeout(240000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_stage1`,
    auth.headers,
    seedXml({ processName: `Drawio stage1 ${runId}`, taskName: "Drawio stage1 task" }),
  );
  await patchDrawioMeta(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DELETE_TRACE_ENABLE__ = true;
  });
  await setUiToken(page, auth.accessToken);
  await openSessionInTopbar(page, {
    projectId: fixture.projectId,
    sessionId: fixture.sessionId,
  });
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const drawioRect = page.getByTestId("drawio-el-shape1");
  await expect(drawioRect).toBeVisible();

  const offsetBefore = await page.evaluate(() => {
    const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const shape = rows.find((row) => String(row?.id || "") === "shape1") || {};
    return Number(shape?.offset_x || 0);
  });
  await drawioRect.click({ force: true });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
        const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
        const shape = rows.find((row) => String(row?.id || "") === "shape1") || {};
        return Number(shape?.offset_x || 0);
      });
    }, { timeout: 10000 })
    .toBeGreaterThan(offsetBefore + 8);

  await page.getByTestId("diagram-action-layers").click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  await popover.getByTestId("diagram-action-layers-drawio-opacity").fill("60");
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      return Number(meta?.opacity || 0);
    }), { timeout: 10000 })
    .toBeGreaterThan(0.55);

  const drawioToggle = popover.getByTestId("diagram-action-layers-drawio-toggle");
  await drawioToggle.uncheck({ force: true });
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      return !!meta?.enabled;
    }), { timeout: 10000 })
    .toBeFalsy();
  await drawioToggle.check({ force: true });
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      return !!meta?.enabled;
    }), { timeout: 10000 })
    .toBeTruthy();

  await page.getByTestId("diagram-action-layers").click({ force: true });
  await drawioRect.click({ force: true });
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
      const shape = rows.find((row) => String(row?.id || "") === "shape1");
      return shape?.deleted === true;
    }), { timeout: 10000 })
    .toBeTruthy();

  const saved = await page.evaluate(async () => {
    return window.__FPC_E2E_DRAWIO__?.savePayload?.({
      docXml: "<mxfile host=\"app.diagrams.net\"></mxfile>",
      svgCache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 220 100\"><rect id=\"shape2\" x=\"40\" y=\"20\" width=\"140\" height=\"60\" fill=\"rgba(16,185,129,0.25)\" stroke=\"#059669\" stroke-width=\"3\"/></svg>",
    });
  });
  expect(saved).toBeTruthy();
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
      return {
        hasDoc: String(meta?.doc_xml || "").includes("<mxfile"),
        hasPreview: String(meta?.svg_cache || "").includes("shape2"),
        hasShape2Meta: rows.some((row) => String(row?.id || "") === "shape2" && row?.deleted !== true),
      };
    }), { timeout: 10000 })
    .toEqual({ hasDoc: true, hasPreview: true, hasShape2Meta: true });

  await page.reload();
  await openSessionInTopbar(page, {
    projectId: fixture.projectId,
    sessionId: fixture.sessionId,
  });
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
      return {
        opacity: Number(meta?.opacity || 0),
        hasPreview: String(meta?.svg_cache || "").includes("shape2"),
        hasShape2Meta: rows.some((row) => String(row?.id || "") === "shape2" && row?.deleted !== true),
      };
    }), { timeout: 10000 })
    .toEqual({ opacity: 0.6, hasPreview: true, hasShape2Meta: true });
});
