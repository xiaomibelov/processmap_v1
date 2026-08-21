import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function patchDrawioGhostFixture(request, headers, sessionId) {
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        interaction_mode: "edit",
        doc_xml: "<mxfile host=\"app.diagrams.net\"></mxfile>",
        svg_cache: [
          "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 420 220\">",
          "<rect id=\"shape1\" x=\"40\" y=\"36\" width=\"120\" height=\"64\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/>",
          "<rect id=\"Activity_ghost\" x=\"240\" y=\"80\" width=\"120\" height=\"64\" rx=\"8\" fill=\"rgba(245,158,11,0.16)\" stroke=\"#d97706\" stroke-width=\"2\"/>",
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
  await apiJson(res, "patch drawio ghost fixture");
}

test("drawio ghost boundary: unmanaged svg id does not materialize via click path", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_ghost_boundary`,
    auth.headers,
    seedXml({ processName: `Drawio ghost boundary ${runId}`, taskName: "Ghost boundary task" }),
  );
  await patchDrawioGhostFixture(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  await expect(page.getByTestId("drawio-el-shape1")).toBeVisible();

  const before = await page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const managedIds = Array.from(document.querySelectorAll("[data-drawio-el-id]"))
      .map((node) => String(node?.getAttribute?.("data-drawio-el-id") || "").trim())
      .filter(Boolean);
    return {
      rowIds: rows.map((row) => String(row?.id || "")).filter(Boolean),
      managedIds,
    };
  });
  expect(before.rowIds).toContain("shape1");
  expect(before.rowIds).not.toContain("Activity_ghost");
  expect(before.managedIds).toContain("shape1");
  expect(before.managedIds).not.toContain("Activity_ghost");
  // eslint-disable-next-line no-console
  console.info("[drawio-ghost-boundary.before]", JSON.stringify(before));

  const overlayBox = await page.getByTestId("drawio-overlay-svg").boundingBox();
  expect(overlayBox).toBeTruthy();
  const targetX = Number(overlayBox.x || 0) + 300;
  const targetY = Number(overlayBox.y || 0) + 110;
  await page.mouse.click(targetX, targetY);

  await page.getByTestId("diagram-action-layers").click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  await expect(popover.getByTestId("diagram-action-layers-selection-chip")).not.toContainText("Activity_ghost");

  const afterClick = await page.evaluate(() => {
    const api = window.__FPC_E2E_DRAWIO__;
    const meta = typeof api?.readMeta === "function" ? api.readMeta() : {};
    const rows = Array.isArray(meta?.drawio_elements_v1) ? meta.drawio_elements_v1 : [];
    const managedIds = Array.from(document.querySelectorAll("[data-drawio-el-id]"))
      .map((node) => String(node?.getAttribute?.("data-drawio-el-id") || "").trim())
      .filter(Boolean);
    return {
      rowIds: rows.map((row) => String(row?.id || "")).filter(Boolean),
      managedIds,
    };
  });
  expect(afterClick.rowIds).toContain("shape1");
  expect(afterClick.rowIds).not.toContain("Activity_ghost");
  expect(afterClick.managedIds).toContain("shape1");
  expect(afterClick.managedIds).not.toContain("Activity_ghost");
  // eslint-disable-next-line no-console
  console.info("[drawio-ghost-boundary.afterClick]", JSON.stringify(afterClick));

  const toggle = popover.getByTestId("diagram-action-layers-drawio-toggle");
  await toggle.uncheck({ force: true });
  await expect(page.getByTestId("drawio-overlay-root")).toHaveCount(0);
  await toggle.check({ force: true });
  await expect(page.getByTestId("drawio-overlay-root")).toBeVisible();

  const afterToggle = await page.evaluate(() => {
    const managedIds = Array.from(document.querySelectorAll("[data-drawio-el-id]"))
      .map((node) => String(node?.getAttribute?.("data-drawio-el-id") || "").trim())
      .filter(Boolean);
    return { managedIds };
  });
  expect(afterToggle.managedIds).toContain("shape1");
  expect(afterToggle.managedIds).not.toContain("Activity_ghost");
  // eslint-disable-next-line no-console
  console.info("[drawio-ghost-boundary.afterToggle]", JSON.stringify(afterToggle));
});
