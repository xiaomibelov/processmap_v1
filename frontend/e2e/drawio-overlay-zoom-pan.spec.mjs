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
        transform: { x: 250, y: 130 },
      },
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  await apiJson(res, "patch drawio meta");
}

async function readBox(locator) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  return box;
}

test("drawio overlay stays attached to diagram on zoom and pan", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_OVERLAY !== "1", "Set E2E_DRAWIO_OVERLAY=1 to run drawio overlay zoom/pan smoke.");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_overlay`,
    auth.headers,
    seedXml({ processName: `Drawio overlay ${runId}`, taskName: "Overlay Task" }),
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

  const overlayRoot = page.getByTestId("drawio-overlay-root");
  const drawioEl = page.getByTestId("drawio-el-shape1");
  const canvasHost = page.locator(".bpmnStageHost").first();
  await expect(overlayRoot).toBeVisible();
  await expect(drawioEl).toBeVisible();
  await expect(canvasHost).toBeVisible();

  const hostBox = await readBox(canvasHost);
  const before = await readBox(drawioEl);

  await page.getByTestId("diagram-zoom-in").click();
  await page.getByTestId("diagram-zoom-in").click();

  await expect
    .poll(async () => {
      const box = await drawioEl.boundingBox();
      return Number(box?.width || 0);
    }, { timeout: 12000 })
    .toBeGreaterThan(Number(before.width || 0) + 3);

  const afterZoom = await readBox(drawioEl);
  expect(afterZoom.x).toBeGreaterThanOrEqual(hostBox.x - 8);
  expect(afterZoom.y).toBeGreaterThanOrEqual(hostBox.y - 8);
  expect(afterZoom.x + afterZoom.width).toBeLessThanOrEqual(hostBox.x + hostBox.width + 16);
  expect(afterZoom.y + afterZoom.height).toBeLessThanOrEqual(hostBox.y + hostBox.height + 16);

  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const vb = canvas?.viewbox?.();
    if (!canvas || !vb) return false;
    canvas.viewbox({
      ...vb,
      x: Number(vb.x || 0) + 120,
      y: Number(vb.y || 0) + 60,
    });
    return true;
  });

  await expect
    .poll(async () => {
      const box = await drawioEl.boundingBox();
      return Number(box?.x || 0);
    }, { timeout: 12000 })
    .toBeLessThan(Number(afterZoom.x || 0) - 5);
});
