import { expect, test } from "@playwright/test";
import { apiLogin } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  seedXml,
  switchTab,
} from "./helpers/processFixture.mjs";

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
    window.localStorage.removeItem("hybrid_ui_v1");
  }, { value: token, activeOrgId: orgId });
}

async function openFixtureInTopbar(page, fixture) {
  const projectId = String(fixture.projectId || "").trim();
  const sessionId = String(fixture.sessionId || "").trim();
  await page.goto(`/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await projectSelect.isVisible().catch(() => false)) break;
    const orgChoice = page.getByText("Выберите организацию");
    if (await orgChoice.isVisible().catch(() => false)) {
      const firstOrgButton = page.getByRole("button", { name: /Org|Default/i }).first();
      if (await firstOrgButton.count()) {
        await firstOrgButton.click().catch(() => {});
      }
    }
    await page.waitForTimeout(250);
  }
  await expect(projectSelect).toBeVisible();
  await expect(sessionSelect).toBeVisible();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const currentProjectValue = await projectSelect.inputValue().catch(() => "");
    if (String(currentProjectValue || "") !== projectId) {
      await projectSelect.selectOption(projectId).catch(() => {});
    }
    await expect(page.locator(`[data-testid='topbar-session-select'] option[value='${sessionId}']`)).toHaveCount(1);
    const currentSessionValue = await sessionSelect.inputValue().catch(() => "");
    if (String(currentSessionValue || "") !== sessionId) {
      await sessionSelect.selectOption(sessionId).catch(() => {});
    }
    if ((await sessionSelect.inputValue().catch(() => "")) === sessionId) break;
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(120);
  }
  await expect(projectSelect).toHaveValue(projectId);
  await expect
    .poll(() => sessionSelect.inputValue().catch(() => ""))
    .toBe(sessionId);
  await expect
    .poll(async () => {
      const projectValue = await projectSelect.inputValue().catch(() => "");
      const sessionValue = await sessionSelect.inputValue().catch(() => "");
      return projectValue === projectId && sessionValue === sessionId;
    })
    .toBeTruthy();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(() => {
          if (window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.()) return true;
          return Boolean(
            document.querySelector(".bpmnStageHost .djs-container .djs-viewport")
            || document.querySelector(".djs-container .djs-viewport"),
          );
        });
      } catch {
        return false;
      }
    })
    .toBeTruthy();
}

async function ensureSidebarOpen(page) {
  const openBtn = page.getByRole("button", { name: "Открыть панель" });
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click();
  }
}

async function selectElementForDetails(page, elementId = "Task_1") {
  const selected = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const element = modeler.get("elementRegistry").get(String(targetId || "Task_1"));
      if (!element) return { ok: false, error: "element_missing" };
      modeler.get("selection")?.select?.(element);
      modeler.get("eventBus")?.fire?.("element.click", { element });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, elementId);
  expect(selected.ok, JSON.stringify(selected)).toBeTruthy();
}

async function openLayersPopover(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const toggle = page.getByTestId("diagram-action-layers");
    const popover = page.getByTestId("diagram-action-layers-popover");
    if (await popover.isVisible().catch(() => false)) return popover;
    await expect(toggle).toBeVisible();
    await toggle.click();
    if (await popover.isVisible().catch(() => false)) return popover;
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(120);
  }
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  return popover;
}

async function clickLayersTool(page, toolIdRaw) {
  const toolId = String(toolIdRaw || "").trim();
  expect(toolId).not.toBe("");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const toggle = page.getByTestId("diagram-action-hybrid-tools-toggle");
    const popover = page.getByTestId("diagram-action-hybrid-tools-popover");
    await expect(toggle).toBeVisible();
    if (!(await popover.isVisible().catch(() => false))) {
      await toggle.click({ force: true });
    }
    const button = page.getByTestId(`diagram-action-hybrid-tools-tool-${toolId}`);
    await expect(button).toBeVisible();
    try {
      await button.click({ force: true });
      return;
    } catch (error) {
      const message = String(error?.message || error || "");
      if (
        !message.includes("detached")
        && !message.includes("Execution context was destroyed")
        && !message.includes("navigation")
      ) {
        if (attempt >= 3) throw error;
      }
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitForModelerReady(page);
      await page.waitForTimeout(80);
    }
  }
  const fallback = page.getByTestId(`diagram-action-hybrid-tools-tool-${toolId}`);
  await expect(fallback).toBeVisible();
  await fallback.click({ force: true });
}

async function clickLayersControl(page, testIdRaw) {
  const testId = String(testIdRaw || "").trim();
  expect(testId).not.toBe("");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await openLayersPopover(page);
    const button = page.getByTestId(testId);
    await expect(button).toBeVisible();
    try {
      await button.click();
      return;
    } catch (error) {
      const message = String(error?.message || error || "");
      if (
        !message.includes("detached")
        && !message.includes("Execution context was destroyed")
        && !message.includes("navigation")
      ) {
        if (attempt >= 3) throw error;
      }
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitForModelerReady(page);
      await page.waitForTimeout(80);
    }
  }
  await openLayersPopover(page);
  await page.getByTestId(testId).click();
}

async function setHybridToggleChecked(page, checkedRaw) {
  const checked = !!checkedRaw;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await openLayersPopover(page);
    const toggle = page.getByTestId("diagram-action-layers-hybrid-toggle");
    if (!(await toggle.isVisible().catch(() => false))) {
      await waitForModelerReady(page);
      const diagramTab = page.getByRole("tab", { name: "Diagram" });
      if (await diagramTab.isVisible().catch(() => false)) {
        await diagramTab.click().catch(() => {});
      }
      await page.waitForTimeout(80);
      continue;
    }
    if (checked) await toggle.check({ force: true });
    else await toggle.uncheck({ force: true });
    return;
  }
  await openLayersPopover(page);
  const toggle = page.getByTestId("diagram-action-layers-hybrid-toggle");
  await expect(toggle).toBeVisible();
  if (checked) await toggle.check({ force: true });
  else await toggle.uncheck({ force: true });
}

async function openPlaybackPopover(page) {
  const toggle = page.getByTestId("diagram-action-playback");
  const popover = page.getByTestId("diagram-action-playback-popover");
  if (await popover.isVisible().catch(() => false)) return popover;
  await toggle.click();
  await expect(popover).toBeVisible();
  return popover;
}

async function clickHybridShapeById(page, hybridIdRaw) {
  const hybridId = String(hybridIdRaw || "").trim();
  expect(hybridId).not.toBe("");
  const shape = page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${hybridId}']`).first();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await expect(shape).toBeVisible();
      await shape.click({ force: true });
      return;
    } catch (error) {
      const message = String(error?.message || error || "");
      if (!message.includes("Execution context was destroyed") && !message.includes("Target page, context or browser has been closed")) {
        if (attempt >= 3) throw error;
      }
      await waitForModelerReady(page);
      await openLayersPopover(page);
      await page.waitForTimeout(80);
    }
  }
  await expect(shape).toBeVisible();
  await shape.click({ force: true });
}

async function readHybridPrefs(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("hybrid_ui_v1");
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.by_user && typeof parsed.by_user === "object") {
        const values = Object.values(parsed.by_user).filter((value) => value && typeof value === "object");
        if (values.length) return values[0];
      }
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
}

async function readCenterOf(locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  return {
    x: box.x + (box.width / 2),
    y: box.y + (box.height / 2),
  };
}

function parseProgressIndex(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return { current: 0, total: 0 };
  return { current: Number(match[1]), total: Number(match[2]) };
}

async function readSessionHybridMap(request, accessToken, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers: {
      Authorization: `Bearer ${String(accessToken || "")}`,
    },
  });
  if (!res.ok()) return {};
  const body = await res.json().catch(() => ({}));
  const map = body?.bpmn_meta?.hybrid_layer_by_element_id;
  return map && typeof map === "object" ? map : {};
}

async function readSessionHybridV2Doc(request, accessToken, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers: {
      Authorization: `Bearer ${String(accessToken || "")}`,
    },
  });
  if (!res.ok()) return {};
  const body = await res.json().catch(() => ({}));
  const doc = body?.bpmn_meta?.hybrid_v2;
  return doc && typeof doc === "object" ? doc : {};
}

function readHybridElementRectFromDoc(docRaw, elementIdRaw) {
  const doc = docRaw && typeof docRaw === "object" ? docRaw : {};
  const elementId = String(elementIdRaw || "").trim();
  const items = Array.isArray(doc.elements) ? doc.elements : [];
  const row = items.find((item) => String(item?.id || "").trim() === elementId) || null;
  if (!row) return null;
  return {
    x: Number(row.x || 0),
    y: Number(row.y || 0),
    w: Number(row.w || 0),
    h: Number(row.h || 0),
  };
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
    return { ok: true, zoom: Number(canvas.zoom?.() || 0) };
  }, zoom);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function setHybridToolViaRuntime(page, toolRaw = "rect") {
  const tool = String(toolRaw || "").trim();
  const ok = await page.evaluate((nextTool) => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api) return false;
    api.ensureEditVisible?.();
    api.selectTool?.(nextTool);
    return true;
  }, tool);
  expect(ok).toBeTruthy();
}

async function createHybridElementViaRuntime(page, pointRaw = { x: 320, y: 220 }, typeRaw = "rect") {
  const createdId = await page.evaluate(({ point, type }) => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api || typeof api.createElementAt !== "function") return "";
    return String(api.createElementAt(point, type) || "");
  }, { point: pointRaw, type: typeRaw });
  expect(String(createdId || "")).not.toBe("");
  return String(createdId || "");
}

async function readHybridV2DocViaRuntime(page) {
  return page.evaluate(() => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api || typeof api.readDoc !== "function") return {};
    return api.readDoc() || {};
  });
}

async function dragHybridShapeBy(page, hybridIdRaw, deltaRaw) {
  const hybridId = String(hybridIdRaw || "").trim();
  const delta = deltaRaw && typeof deltaRaw === "object" ? deltaRaw : {};
  const shape = page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${hybridId}']`).first();
  await expect(shape).toBeVisible();
  const box = await shape.boundingBox();
  expect(box).toBeTruthy();
  const startX = Number(box?.x || 0) + (Number(box?.width || 0) / 2);
  const startY = Number(box?.y || 0) + (Number(box?.height || 0) / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + Number(delta?.dx || 0), startY + Number(delta?.dy || 0), { steps: 8 });
  await page.mouse.up();
}

async function resizeHybridShapeByHandle(page, hybridIdRaw, handleRaw = "se", deltaRaw = { dx: 80, dy: 40 }) {
  const hybridId = String(hybridIdRaw || "").trim();
  const handle = String(handleRaw || "").trim();
  const delta = deltaRaw && typeof deltaRaw === "object" ? deltaRaw : {};
  const shape = page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${hybridId}']`).first();
  await expect(shape).toBeVisible();
  await shape.click({ force: true });
  const handleLocator = page.locator(`[data-testid='hybrid-v2-resize-handle'][data-hybrid-element-id='${hybridId}'][data-handle='${handle}']`).first();
  await expect(handleLocator).toBeVisible();
  const box = await handleLocator.boundingBox();
  expect(box).toBeTruthy();
  const startX = Number(box?.x || 0) + (Number(box?.width || 0) / 2);
  const startY = Number(box?.y || 0) + (Number(box?.height || 0) / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + Number(delta?.dx || 0), startY + Number(delta?.dy || 0), { steps: 8 });
  await page.mouse.up();
}

async function patchSessionHybridMap(request, accessToken, sessionId, map) {
  const sid = String(sessionId || "").trim();
  const payload = {
    bpmn_meta: {
      hybrid_layer_by_element_id: map && typeof map === "object" ? map : {},
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${String(accessToken || "")}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });
  return res.ok();
}

test("hybrid layers: view/edit modes, H peek, and playback safety", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 to run hybrid layers e2e.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_hybrid`,
    auth.headers,
    seedXml({ processName: `Hybrid layers ${runId}`, taskName: "Hybrid Task" }),
  );
  const sid = String(fixture.sessionId || "").trim();
  expect(sid).not.toBe("");

  await primeAuth(page, auth.accessToken);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await expect(page.getByTestId("diagram-action-layers")).toBeVisible();

  await setHybridToggleChecked(page, true);
  await openLayersPopover(page);
  await expect
    .poll(async () => {
      const emptyVisible = await page.getByTestId("diagram-action-layers-empty-state").isVisible().catch(() => false);
      const hotspotCount = await page.getByTestId("hybrid-layer-hotspot").count().catch(() => 0);
      return emptyVisible || hotspotCount > 0;
    })
    .toBeTruthy();
  const prefsAfterToggle = await readHybridPrefs(page);
  expect(JSON.stringify(prefsAfterToggle)).toContain("\"visible\":true");
  const activeOverlay = page.getByTestId("hybrid-layer-overlay").last();
  await expect(activeOverlay).toBeVisible();

  const taskShape = page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='Task_1']").first();
  await expect(taskShape).toBeVisible();

  await openLayersPopover(page);
  await setHybridToggleChecked(page, true);
  await page.evaluate(() => {
    window.__FPC_E2E_HYBRID__?.ensureEditVisible?.();
  });
  await waitForModelerReady(page);
  const overlayAfterModeClick = page.getByTestId("hybrid-layer-overlay").last();
  if (!(await overlayAfterModeClick.isVisible().catch(() => false))) {
    await openLayersPopover(page);
    await setHybridToggleChecked(page, true);
    await page.evaluate(() => {
      window.__FPC_E2E_HYBRID__?.ensureEditVisible?.();
    });
  }
  await expect(page.getByTestId("hybrid-layer-overlay").last()).toHaveClass(/isEdit/);
  const prefsAfterEdit = await readHybridPrefs(page);
  expect(JSON.stringify(prefsAfterEdit)).toContain("\"mode\":\"edit\"");

  const v2Svg = activeOverlay.getByTestId("hybrid-v2-svg");
  await expect(v2Svg).toBeVisible();
  await setHybridToolViaRuntime(page, "rect");
  await createHybridElementViaRuntime(page, { x: 260, y: 220 }, "rect");
  await setHybridToolViaRuntime(page, "text");
  await createHybridElementViaRuntime(page, { x: 480, y: 220 }, "text");
  await expect
    .poll(async () => {
      return Number(await activeOverlay.getByTestId("hybrid-v2-shape").count().catch(() => 0));
    })
    .toBeGreaterThan(1);
  const createdShapeIds = await activeOverlay
    .locator("[data-testid='hybrid-v2-shape']")
    .evaluateAll((nodes) => Array.from(new Set(
      nodes
        .map((node) => node.getAttribute("data-hybrid-element-id"))
        .filter((value) => typeof value === "string" && value.trim().length > 0),
  )));
  expect(createdShapeIds.length).toBeGreaterThan(1);
  await page.keyboard.press("Escape");

  const playbackPopover = await openPlaybackPopover(page);
  await expect(playbackPopover).toBeVisible();
  await expect(page.getByTestId("diagram-action-playback-next")).toBeVisible();
  await expect(page.getByTestId("diagram-action-playback-reset")).toBeVisible();

  await setHybridToggleChecked(page, false);
  await expect(page.getByTestId("hybrid-layer-overlay")).toHaveCount(0);
  await setHybridToggleChecked(page, true);
  await expect(page.getByTestId("hybrid-layer-overlay").last()).toBeVisible();
});

test("hybrid layers: dimming checkbox reflects actual visible effect only", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 to run hybrid layers e2e.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_hybrid_focus_truth`,
    auth.headers,
    seedXml({ processName: `Hybrid focus truth ${runId}`, taskName: "Hybrid Focus Truth Task" }),
  );

  await primeAuth(page, auth.accessToken);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);

  await setHybridToggleChecked(page, true);
  await openLayersPopover(page);
  const focusToggle = page.getByTestId("diagram-action-layers-focus");
  await expect(focusToggle).toBeEnabled();
  await expect(focusToggle).not.toBeChecked();
  await focusToggle.check({ force: true });
  await expect(focusToggle).toBeChecked();
  await expect(page.locator(".bpmnStageHost.isHybridFocus")).toHaveCount(1);

  await setHybridToggleChecked(page, false);
  await openLayersPopover(page);
  await expect(focusToggle).toBeDisabled();
  await expect(focusToggle).not.toBeChecked();
  await expect(page.getByTestId("diagram-action-layers-focus-status")).toHaveText("недоступно, пока Hybrid / Legacy hidden");
  await expect(page.locator(".bpmnStageHost.isHybridFocus")).toHaveCount(0);
});

test("hybrid layers: drag + resize persists rect in diagram space", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 to run hybrid layers e2e.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_hybrid_drag`,
    auth.headers,
    seedXml({ processName: `Hybrid drag ${runId}`, taskName: "Hybrid Drag Task" }),
  );
  const sid = String(fixture.sessionId || "").trim();
  expect(sid).not.toBe("");

  await primeAuth(page, auth.accessToken);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await setCanvasZoom(page, 1);
  await setHybridToggleChecked(page, true);
  await expect(page.getByTestId("hybrid-layer-overlay").last()).toBeVisible();
  await setHybridToolViaRuntime(page, "rect");

  const createdId = await createHybridElementViaRuntime(page, { x: 340, y: 220 }, "rect");
  const createdShape = page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${createdId}']`).first();
  await expect(createdShape).toBeVisible();
  const initialRect = readHybridElementRectFromDoc(await readHybridV2DocViaRuntime(page), createdId);
  expect(initialRect).toBeTruthy();

  await setHybridToolViaRuntime(page, "select");
  await dragHybridShapeBy(page, createdId, { dx: 40, dy: 24 });
  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      const rect = readHybridElementRectFromDoc(doc, createdId);
      return rect ? Number(rect.x || 0) : -1;
  })
    .toBeGreaterThan(Number(initialRect?.x || 0) + 10);
  const afterDragDoc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
  const afterDragRect = readHybridElementRectFromDoc(afterDragDoc, createdId);
  expect(Number(afterDragRect?.x || 0)).toBeGreaterThan(Number(initialRect?.x || 0) + 10);
  expect(Number(afterDragRect?.y || 0)).toBeGreaterThan(Number(initialRect?.y || 0) + 6);

  await resizeHybridShapeByHandle(page, createdId, "se", { dx: 36, dy: 24 });
  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      const rect = readHybridElementRectFromDoc(doc, createdId);
      return Number(rect?.w || 0);
    })
    .toBeGreaterThan(Number(afterDragRect?.w || 0) + 10);
  const latestRect = readHybridElementRectFromDoc(await readSessionHybridV2Doc(request, auth.accessToken, sid), createdId);
  expect(Number(latestRect?.w || 0)).toBeGreaterThan(Number(afterDragRect?.w || 0) + 10);
  expect(Number(latestRect?.h || 0)).toBeGreaterThan(Number(afterDragRect?.h || 0) + 5);

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await setHybridToggleChecked(page, true);
  await expect(page.locator(`[data-testid='hybrid-v2-shape'][data-hybrid-element-id='${createdId}']`)).toBeVisible();
  const persistedRect = readHybridElementRectFromDoc(await readSessionHybridV2Doc(request, auth.accessToken, sid), createdId);
  expect(Number(persistedRect?.x || 0)).toBe(Math.round(Number(latestRect?.x || 0) * 10) / 10);
  expect(Number(persistedRect?.y || 0)).toBe(Math.round(Number(latestRect?.y || 0) * 10) / 10);
  expect(Number(persistedRect?.w || 0)).toBe(Math.round(Number(latestRect?.w || 0) * 10) / 10);
  expect(Number(persistedRect?.h || 0)).toBe(Math.round(Number(latestRect?.h || 0) * 10) / 10);
});
