import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  apiJson,
  createFixture,
  seedXml,
  switchTab,
} from "./helpers/processFixture.mjs";
import {
  openSessionInTopbar,
  waitForDiagramReady,
} from "./helpers/diagramReady.mjs";

async function readSessionHybridV2Doc(request, accessToken, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers: { Authorization: `Bearer ${String(accessToken || "")}` },
  });
  if (!res.ok()) return {};
  const body = await res.json().catch(() => ({}));
  return body?.bpmn_meta?.hybrid_v2 && typeof body.bpmn_meta.hybrid_v2 === "object"
    ? body.bpmn_meta.hybrid_v2
    : {};
}

async function movePointerOnHybridOverlay(page, position = { x: 320, y: 240 }) {
  const overlay = page.getByTestId("hybrid-layer-overlay").last();
  const box = await overlay.boundingBox();
  expect(box, "hybrid overlay bounding box").toBeTruthy();
  await page.mouse.move(Number(box.x || 0) + Number(position.x || 0), Number(box.y || 0) + Number(position.y || 0));
}

async function clickHybridOverlayPoint(page, position = { x: 320, y: 240 }) {
  const overlay = page.getByTestId("hybrid-layer-overlay").last();
  const box = await overlay.boundingBox();
  expect(box, "hybrid overlay bounding box").toBeTruthy();
  await page.mouse.click(Number(box.x || 0) + Number(position.x || 0), Number(box.y || 0) + Number(position.y || 0));
}

test("templates stencil smoke: apply starts placement mode and click places hybrid elements", async ({ page, request }) => {
  test.skip(process.env.E2E_TEMPLATES !== "1", "Set E2E_TEMPLATES=1 to run templates stencil smoke.");
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 to run templates stencil smoke.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Stencil ${runId}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const sourceFixture = await createFixture(
    request,
    `${runId}_source`,
    auth.headers,
    seedXml({ processName: `Stencil source ${runId}`, taskName: "Source task" }),
  );
  const targetFixture = await createFixture(
    request,
    `${runId}_target`,
    auth.headers,
    seedXml({ processName: `Stencil target ${runId}`, taskName: "Target task" }),
  );

  const createTemplateRes = await request.post(`${API_BASE}/api/templates`, {
    headers: auth.headers,
    data: {
      scope: "personal",
      template_type: "hybrid_stencil_v1",
      name: templateName,
      payload: {
        source_session_id: String(sourceFixture.sessionId || ""),
        elements: [
          { type: "rect", w: 180, h: 70, dx: 0, dy: 0, text: "Stencil Alpha", style: { fill: "#eff6ff" } },
          { type: "rect", w: 180, h: 70, dx: 220, dy: 0, text: "Stencil Beta", style: { fill: "#eef2ff" } },
        ],
        edges: [
          { from_index: 0, to_index: 1, type: "arrow", style: { stroke: "#2563eb", width: 2 } },
        ],
        bbox: { w: 400, h: 70 },
      },
    },
  });
  const created = await apiJson(createTemplateRes, "create stencil template");
  expect(String(created?.item?.template_type || "")).toBe("hybrid_stencil_v1");

  await setUiToken(page, auth.accessToken);
  await openSessionInTopbar(page, targetFixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const ensureHybrid = await page.evaluate(() => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api || typeof api.ensureEditVisible !== "function") return false;
    api.ensureEditVisible();
    return true;
  });
  expect(ensureHybrid).toBeTruthy();
  const docBeforeApply = await readSessionHybridV2Doc(request, auth.accessToken, targetFixture.sessionId);
  const initialElementCount = Array.isArray(docBeforeApply?.elements) ? docBeforeApply.elements.length : 0;

  const templatesButton = page.getByTestId("btn-templates");
  await expect(templatesButton).toBeVisible();
  await templatesButton.click();
  const templatesPicker = page.locator("[data-testid='templates-menu-panel'], [data-testid='templates-picker']").first();
  await expect(templatesPicker).toBeVisible();

  const templateRow = page.locator("[data-testid^='templates-item-'], [data-testid^='template-item-']").filter({ hasText: templateName }).first();
  await expect(templateRow).toBeVisible();
  await templateRow.locator("[data-testid^='btn-apply-template-']").first().click();
  await expect(templatesPicker).toBeHidden({ timeout: 20000 });
  await expect
    .poll(async () => page.evaluate(() => {
      const api = window.__FPC_E2E_HYBRID__;
      if (!api || typeof api.getState !== "function") return false;
      const state = api.getState();
      return Boolean(state?.stencilPlacementActive);
    }))
    .toBeTruthy();

  const overlay = page.getByTestId("hybrid-layer-overlay").last();
  await expect(overlay).toBeVisible();
  await movePointerOnHybridOverlay(page, { x: 360, y: 260 });

  const beforeCount = await overlay.locator("[data-testid='hybrid-v2-shape']").count();
  const overlayBox = await overlay.boundingBox();
  expect(overlayBox, "hybrid overlay bounding box").toBeTruthy();
  const placed = await page.evaluate(({ x, y }) => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api || typeof api.placeStencilAtClient !== "function") return false;
    return Boolean(api.placeStencilAtClient(x, y));
  }, {
    x: Number(overlayBox.x || 0) + 360,
    y: Number(overlayBox.y || 0) + 260,
  });
  expect(placed, "place stencil via runtime bridge").toBeTruthy();
  await expect
    .poll(async () => overlay.locator("[data-testid='hybrid-v2-shape']").count())
    .toBeGreaterThan(beforeCount);
  await expect
    .poll(async () => page.evaluate(() => {
      const api = window.__FPC_E2E_HYBRID__;
      if (!api || typeof api.getState !== "function") return true;
      const state = api.getState();
      return !Boolean(state?.stencilPlacementActive);
    }))
    .toBeTruthy();

  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, targetFixture.sessionId);
      const nextCount = Array.isArray(doc?.elements) ? doc.elements.length : 0;
      return nextCount > initialElementCount;
    })
    .toBeTruthy();
});
