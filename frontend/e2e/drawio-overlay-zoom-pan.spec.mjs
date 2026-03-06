import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function readHybridElementCount(request, accessTokenRaw, sessionIdRaw) {
  const sid = String(sessionIdRaw || "").trim();
  if (!sid) return 0;
  const token = String(accessTokenRaw || "").trim();
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok()) return 0;
  const body = await res.json().catch(() => ({}));
  const doc = body?.bpmn_meta?.hybrid_v2;
  return Array.isArray(doc?.elements) ? doc.elements.length : 0;
}

test("drawio overlay smoke: place rect, zoom/pan, reload keeps element", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 for overlay smoke.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_overlay`,
    auth.headers,
    seedXml({ processName: `Drawio overlay ${runId}`, taskName: "Drawio Overlay Task" }),
  );

  await setUiToken(page, auth.accessToken);
  await openSessionInTopbar(page, { projectId: fixture.projectId, sessionId: fixture.sessionId }, { timeout: 60000 });
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const layersBtn = page.getByTestId("diagram-action-layers");
  await layersBtn.click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await popover.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await popover.getByTestId("diagram-action-layers-mode-edit").click({ force: true });

  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__FPC_E2E_HYBRID__?.createElementAt)))
    .toBeTruthy();

  const created = await page.evaluate(() => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api || typeof api.createElementAt !== "function") return "";
    if (typeof api.ensureEditVisible === "function") api.ensureEditVisible();
    return api.createElementAt({ x: 320, y: 220 }, "rect");
  });
  expect(typeof created === "string" && created.trim().length > 0).toBeTruthy();

  const shape = page.getByTestId("hybrid-v2-shape").first();
  await expect(shape).toBeVisible();
  await expect
    .poll(async () => readHybridElementCount(request, auth.accessToken, fixture.sessionId))
    .toBeGreaterThanOrEqual(1);
  const bboxBefore = await shape.boundingBox();
  expect(Number(bboxBefore?.width || 0)).toBeGreaterThan(10);

  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const vb = canvas?.viewbox?.();
    if (!canvas || !vb) return;
    canvas.viewbox({
      ...vb,
      x: Number(vb.x || 0) + 120,
      y: Number(vb.y || 0) + 80,
      width: Number(vb.width || 0) * 1.2,
      height: Number(vb.height || 0) * 1.2,
    });
  });
  await page.waitForTimeout(250);

  const bboxAfter = await shape.boundingBox();
  expect(Number(bboxAfter?.width || 0)).toBeGreaterThan(5);
  expect(Number.isFinite(Number(bboxAfter?.x))).toBeTruthy();
  expect(Number.isFinite(Number(bboxAfter?.y))).toBeTruthy();

  await page.reload();
  await openSessionInTopbar(page, { projectId: fixture.projectId, sessionId: fixture.sessionId }, { timeout: 60000 });
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await layersBtn.click({ force: true });
  await popover.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await expect
    .poll(async () => page.getByTestId("hybrid-v2-shape").count())
    .toBeGreaterThanOrEqual(1);
});
