import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function patchDrawioEntryState(request, headers, sessionId, options = {}) {
  const enabled = options.enabled === true;
  const includeDoc = options.includeDoc === true;
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled,
        locked: false,
        opacity: 1,
        interaction_mode: "view",
        doc_xml: includeDoc ? "<mxfile host=\"app.diagrams.net\"></mxfile>" : "",
        svg_cache: includeDoc
          ? "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 220 120\"><rect id=\"shape1\" x=\"50\" y=\"28\" width=\"120\" height=\"64\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>"
          : "",
        drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
        drawio_elements_v1: includeDoc
          ? [{ id: "shape1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1, offset_x: 0, offset_y: 0, z_index: 1 }]
          : [],
      },
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  await apiJson(res, "patch drawio entry state");
}

async function openLayers(page) {
  await page.getByTestId("diagram-action-layers").click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  return popover;
}

test("drawio runtime entry: overlay runtime does not auto-open full editor", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_runtime_entry`,
    auth.headers,
    seedXml({ processName: `Drawio runtime entry ${runId}`, taskName: "Drawio runtime entry task" }),
  );
  await patchDrawioEntryState(request, auth.headers, fixture.sessionId, { enabled: false, includeDoc: false });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const popover = await openLayers(page);
  const toggle = popover.getByTestId("diagram-action-layers-drawio-toggle");
  await toggle.check({ force: true });
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      return !!meta.enabled;
    }))
    .toBeTruthy();
  await expect(page.getByTestId("drawio-editor-iframe")).toHaveCount(0);

  await popover.getByTestId("diagram-action-layers-tool-rect").click({ force: true });
  await expect
    .poll(async () => page.evaluate(() => {
      const meta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      return String(meta?.interaction_mode || "");
    }))
    .toBe("edit");
  await expect(page.getByTestId("drawio-editor-iframe")).toHaveCount(0);
});

test("drawio runtime entry: explicit full editor action still opens full editor", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_explicit_editor`,
    auth.headers,
    seedXml({ processName: `Drawio explicit editor ${runId}`, taskName: "Drawio explicit editor task" }),
  );
  await patchDrawioEntryState(request, auth.headers, fixture.sessionId, { enabled: true, includeDoc: true });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const popover = await openLayers(page);
  await popover.getByTestId("diagram-action-layers-drawio-open").click({ force: true });
  await expect(page.getByTestId("drawio-editor-iframe")).toBeVisible();
});

