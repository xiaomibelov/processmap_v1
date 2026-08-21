import { expect, test } from "@playwright/test";
import { apiLogin } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  seedXml,
  switchTab,
} from "./helpers/processFixture.mjs";
import {
  openSessionInTopbar,
  waitForDiagramReady,
} from "./helpers/diagramReady.mjs";

async function primeAuth(page, tokenRaw) {
  const token = String(tokenRaw || "").trim();
  const orgId = String(process.env.E2E_ORG_ID || "").trim();
  await page.addInitScript(({ value, activeOrgId }) => {
    window.localStorage.setItem("fpc_auth_access_token", String(value || ""));
    if (String(activeOrgId || "").trim()) {
      window.localStorage.setItem("fpc_active_org_id", String(activeOrgId || ""));
    } else {
      window.localStorage.removeItem("fpc_active_org_id");
    }
    if (!window.sessionStorage.getItem("fpc_e2e_hybrid_ui_reset")) {
      window.localStorage.removeItem("hybrid_ui_v1");
      window.sessionStorage.setItem("fpc_e2e_hybrid_ui_reset", "1");
    }
  }, { value: token, activeOrgId: orgId });
}

async function openFixtureInTopbar(page, fixture) {
  await openSessionInTopbar(page, fixture);
}

async function waitForModelerReady(page) {
  await waitForDiagramReady(page);
}

async function openLayersPopover(page) {
  const toggle = page.getByTestId("diagram-action-layers");
  const popover = page.getByTestId("diagram-action-layers-popover");
  const hybridToggle = page.getByTestId("diagram-action-layers-hybrid-toggle");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (
      await popover.isVisible().catch(() => false)
      && await hybridToggle.isVisible().catch(() => false)
    ) {
      return popover;
    }
    await expect(toggle).toBeVisible();
    await toggle.click({ force: true });
    if (
      await popover.isVisible().catch(() => false)
      && await hybridToggle.isVisible().catch(() => false)
    ) {
      return popover;
    }
    await page.waitForTimeout(200);
  }
  await expect(popover).toBeVisible();
  await expect(hybridToggle).toBeVisible();
  return popover;
}

async function openHybridToolsPopover(page) {
  const toggle = page.getByTestId("diagram-action-hybrid-tools-toggle");
  const popover = page.getByTestId("diagram-action-hybrid-tools-popover");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await popover.isVisible().catch(() => false)) return popover;
    const layersPopover = page.getByTestId("diagram-action-layers-popover");
    if (await layersPopover.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(80);
      if (await popover.isVisible().catch(() => false)) return popover;
    }
    await expect(toggle).toBeVisible();
    await toggle.click({ force: true });
    if (await popover.isVisible().catch(() => false)) return popover;
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await waitForModelerReady(page);
    await page.waitForTimeout(120);
  }
  await expect(popover).toBeVisible();
  return popover;
}

async function clickHybridTool(page, toolIdRaw) {
  const toolId = String(toolIdRaw || "").trim();
  expect(toolId).not.toBe("");
  await openHybridToolsPopover(page);
  const button = page.getByTestId(`diagram-action-hybrid-tools-tool-${toolId}`);
  await expect(button).toBeVisible();
  await button.click({ force: true });
}

async function setHybridToggleChecked(page, checkedRaw) {
  const checked = !!checkedRaw;
  await openLayersPopover(page);
  const toggle = page.getByTestId("diagram-action-layers-hybrid-toggle");
  await expect(toggle).toBeVisible();
  if (checked) await toggle.check({ force: true });
  else await toggle.uncheck({ force: true });
}

async function clickHybridShapeById(page, hybridIdRaw) {
  const hybridId = String(hybridIdRaw || "").trim();
  expect(hybridId).not.toBe("");
  const shape = page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${hybridId}']`).first();
  await expect(shape).toBeVisible();
  await shape.click({ force: true });
  await expect(shape).toHaveAttribute("data-selected", "true");
}

async function movePointerOnHybridOverlay(page, position = { x: 320, y: 240 }) {
  const ok = await page.evaluate((pointRaw) => {
    const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
    const overlays = Array.from(document.querySelectorAll("[data-testid='hybrid-layer-overlay']"));
    const overlay = overlays.at(-1);
    if (!overlay) return false;
    const rect = overlay.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const x = Number(rect.left || 0) + Number(point.x || 0);
    const y = Number(rect.top || 0) + Number(point.y || 0);
    const target = document.elementFromPoint(x, y) || overlay;
    target.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    }));
    return true;
  }, position);
  expect(ok, "move pointer on hybrid overlay").toBeTruthy();
}

async function clickHybridOverlayPoint(page, position = { x: 320, y: 240 }) {
  const ok = await page.evaluate((pointRaw) => {
    const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
    const overlays = Array.from(document.querySelectorAll("[data-testid='hybrid-layer-overlay']"));
    const overlay = overlays.at(-1);
    if (!overlay) return false;
    const rect = overlay.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const x = Number(rect.left || 0) + Number(point.x || 0);
    const y = Number(rect.top || 0) + Number(point.y || 0);
    const target = document.elementFromPoint(x, y) || overlay;
    ["mousedown", "mouseup", "click"].forEach((type) => {
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
      }));
    });
    return true;
  }, position);
  expect(ok, "click hybrid overlay point").toBeTruthy();
}

async function createHybridElementViaRuntime(page, point = { x: 320, y: 240 }, type = "rect") {
  const createdId = await page.evaluate(({ pointRaw, typeRaw }) => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api || typeof api.createElementAt !== "function") return "";
    return String(api.createElementAt(pointRaw, typeRaw) || "");
  }, { pointRaw: point, typeRaw: type });
  expect(String(createdId || "")).not.toBe("");
  return String(createdId || "");
}

async function setHybridToolViaRuntime(page, tool = "rect") {
  const ok = await page.evaluate((toolRaw) => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api) return false;
    if (typeof api.ensureEditVisible === "function") {
      api.ensureEditVisible();
    }
    if (typeof api.selectTool === "function") {
      api.selectTool(toolRaw);
    }
    return true;
  }, tool);
  expect(ok, "set hybrid tool via runtime").toBeTruthy();
}

async function readSessionHybridV2Doc(request, accessToken, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers: {
      Authorization: `Bearer ${String(accessToken || "")}`,
    },
  });
  if (!res.ok()) return {};
  const body = await res.json().catch(() => ({}));
  return body?.bpmn_meta?.hybrid_v2 && typeof body.bpmn_meta.hybrid_v2 === "object"
    ? body.bpmn_meta.hybrid_v2
    : {};
}

async function setCanvasZoom(page, zoomRaw) {
  const zoom = Number(zoomRaw || 1);
  const result = await page.evaluate((nextZoom) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    if (!canvas || typeof canvas.zoom !== "function") {
      return { ok: false, error: "canvas_zoom_unavailable" };
    }
    canvas.zoom(nextZoom);
    return {
      ok: true,
      zoom: Number(canvas.zoom?.() || 0),
    };
  }, zoom);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result;
}

test("hybrid delete: keyboard delete survives reload", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 to run hybrid delete e2e.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_hybrid_delete`,
    auth.headers,
    seedXml({ processName: `Hybrid delete ${runId}`, taskName: "Delete Task" }),
  );
  const sid = String(fixture.sessionId || "").trim();
  expect(sid).not.toBe("");

  await primeAuth(page, auth.accessToken);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await setHybridToggleChecked(page, true);
  await setHybridToolViaRuntime(page, "rect");
  const overlay = page.getByTestId("hybrid-layer-overlay").last();
  const svg = overlay.getByTestId("hybrid-v2-svg");
  await expect(svg).toBeVisible();
  const ghost = page.getByTestId("hybrid-v2-ghost");
  const ghostChecksEnabled = process.env.E2E_HYBRID_GHOST_CHECK !== "0";
  if (ghostChecksEnabled) {
    await setCanvasZoom(page, 1);
    await expect(svg).toBeVisible();
    await movePointerOnHybridOverlay(page, { x: 320, y: 240 });
    await expect.poll(async () => {
      const box = await ghost.boundingBox();
      return Math.round(Number(box?.width || 0));
    }).toBeGreaterThan(100);
    const fullGhostBox = await ghost.boundingBox();
    expect(fullGhostBox?.width || 0).toBeGreaterThan(100);

    await setCanvasZoom(page, 0.3);
    await expect(svg).toBeVisible();
    await movePointerOnHybridOverlay(page, { x: 320, y: 240 });
    await expect.poll(async () => {
      const box = await ghost.boundingBox();
      return Math.round(Number(box?.width || 0));
    }).toBeGreaterThan(10);
    const zoomedGhostBox = await ghost.boundingBox();
    expect((zoomedGhostBox?.width || 0) < (fullGhostBox?.width || 0)).toBeTruthy();

    await setCanvasZoom(page, 1);
    await expect(svg).toBeVisible();
    await movePointerOnHybridOverlay(page, { x: 320, y: 240 });
  }

  const beforeIds = await overlay
    .locator("[data-testid='hybrid-v2-shape']")
    .evaluateAll((nodes) => Array.from(new Set(
      nodes
        .map((node) => node.getAttribute("data-hybrid-element-id"))
        .filter((value) => typeof value === "string" && value.trim().length > 0),
    )));
  const createdId = await createHybridElementViaRuntime(page, { x: 320, y: 240 }, "rect");
  await expect(overlay.locator("[data-testid='hybrid-v2-shape']")).toHaveCount(beforeIds.length + 1);
  const afterCreateIds = await overlay
    .locator("[data-testid='hybrid-v2-shape']")
    .evaluateAll((nodes) => Array.from(new Set(
      nodes
        .map((node) => node.getAttribute("data-hybrid-element-id"))
        .filter((value) => typeof value === "string" && value.trim().length > 0),
    )));
  expect(afterCreateIds).toContain(createdId);
  const createdShape = page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${createdId}']`).first();
  await expect(createdShape).toBeVisible();

  await createdShape.dblclick({ force: true });
  const textEditor = page.getByTestId("hybrid-v2-text-editor");
  await expect(textEditor).toBeVisible();
  await textEditor.fill("Проверка текста");
  await textEditor.press("Enter");
  await expect(textEditor).toHaveCount(0);

  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      const item = Array.isArray(doc?.elements)
        ? doc.elements.find((row) => String(row?.id || "") === createdId)
        : null;
      return String(item?.text || "");
    })
    .toBe("Проверка текста");

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await setHybridToggleChecked(page, true);
  await expect(page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${createdId}']`)).toBeVisible();
  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      const item = Array.isArray(doc?.elements)
        ? doc.elements.find((row) => String(row?.id || "") === createdId)
        : null;
      return String(item?.text || "");
    })
    .toBe("Проверка текста");

  await setHybridToolViaRuntime(page, "select");
  await clickHybridShapeById(page, createdId);
  const layersPopover = await openLayersPopover(page);
  await expect(layersPopover.getByTestId("diagram-action-layers-selection-chip")).toContainText(createdId);
  const shapeAfterDelete = page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${createdId}']`);
  await page.locator("body").click({ position: { x: 8, y: 8 } }).catch(() => {});
  await page.keyboard.press("Delete");
  const removedByDelete = await page
    .waitForFunction(
      (hybridId) => !document.querySelector(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${String(hybridId || "")}']`),
      createdId,
      { timeout: 2200 },
    )
    .then(() => true)
    .catch(() => false);
  if (!removedByDelete) {
    await page.keyboard.press("Backspace");
  }
  await expect(shapeAfterDelete).toHaveCount(0);

  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      return !!(Array.isArray(doc?.elements) && doc.elements.some((row) => String(row?.id || "") === createdId));
    })
    .toBeFalsy();

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);

  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      return !!(Array.isArray(doc?.elements) && doc.elements.some((row) => String(row?.id || "") === createdId));
    })
    .toBeFalsy();
});
