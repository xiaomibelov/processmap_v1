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
  await page.addInitScript((value) => {
    window.localStorage.setItem("fpc_auth_access_token", String(value || ""));
    window.localStorage.removeItem("fpc_active_org_id");
    window.localStorage.removeItem("hybrid_ui_v1");
  }, token);
}

async function openFixtureInTopbar(page, fixture) {
  const projectId = String(fixture.projectId || "").trim();
  const sessionId = String(fixture.sessionId || "").trim();
  await page.goto(`/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`);
  const orgChoice = page.getByText("Выберите организацию");
  if (await orgChoice.count()) {
    const firstOrgButton = page.getByRole("button", { name: /Org/i }).first();
    if (await firstOrgButton.count()) await firstOrgButton.click();
  }
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");
  await expect(projectSelect).toBeVisible();
  await expect(sessionSelect).toBeVisible();
  await projectSelect.selectOption(projectId);
  await expect(page.locator(`[data-testid='topbar-session-select'] option[value='${sessionId}']`)).toHaveCount(1);
  await sessionSelect.selectOption(sessionId);
  await expect
    .poll(async () => sessionSelect.inputValue().catch(() => ""))
    .toBe(sessionId);
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(() => {
          return Boolean(window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.());
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
  const toggle = page.getByTestId("diagram-action-layers");
  const popover = page.getByTestId("diagram-action-layers-popover");
  if (await popover.isVisible().catch(() => false)) return popover;
  await toggle.click();
  await expect(popover).toBeVisible();
  return popover;
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
  const ok = await page.evaluate((targetId) => {
    const escaped = String(targetId || "").replace(/"/g, "\\\"");
    const overlays = Array.from(document.querySelectorAll("[data-testid='hybrid-layer-overlay']"));
    const overlay = overlays
      .filter((node) => {
        const rect = node.getBoundingClientRect?.();
        if (!rect) return false;
        return rect.width > 8 && rect.height > 8;
      })
      .at(-1);
    if (!overlay) return false;
    const nodes = Array.from(overlay.querySelectorAll(`[data-testid="hybrid-v2-shape"][data-hybrid-element-id="${escaped}"]`));
    if (!nodes.length) return false;
    const candidate = nodes.find((node) => {
      const rect = node.getBoundingClientRect?.();
      return rect && rect.width > 2 && rect.height > 2;
    }) || nodes[0];
    if (!candidate) return false;
    const rect = candidate.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const x = rect.left + Math.min(Math.max(rect.width / 2, 4), Math.max(rect.width - 4, 4));
    const y = rect.top + Math.min(Math.max(rect.height / 2, 4), Math.max(rect.height - 4, 4));
    const target = document.elementFromPoint(x, y) || candidate;
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
  }, hybridId);
  expect(ok).toBeTruthy();
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

  await openLayersPopover(page);
  const hybridToggle = page.getByTestId("diagram-action-layers-hybrid-toggle");
  await expect(hybridToggle).toBeVisible();
  await hybridToggle.check({ force: true });
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

  const taskShape = page.locator("g.djs-element.djs-shape[data-element-id='Task_1']").first();
  await expect(taskShape).toBeVisible();

  await openLayersPopover(page);
  const hybridToggle2 = page.getByTestId("diagram-action-layers-hybrid-toggle");
  await hybridToggle2.check({ force: true });
  const editButton = page.getByTestId("diagram-action-layers-mode-edit");
  await expect(editButton).toBeEnabled();
  await editButton.click();
  await expect(page.getByTestId("hybrid-layer-overlay")).toHaveClass(/isEdit/);
  const prefsAfterEdit = await readHybridPrefs(page);
  expect(JSON.stringify(prefsAfterEdit)).toContain("\"mode\":\"edit\"");

  const toolRect = page.getByTestId("diagram-action-layers-tool-rect");
  const toolText = page.getByTestId("diagram-action-layers-tool-text");
  const toolArrow = page.getByTestId("diagram-action-layers-tool-arrow");
  const toolSelect = page.getByTestId("diagram-action-layers-tool-select");
  const v2Svg = activeOverlay.getByTestId("hybrid-v2-svg");
  await expect(v2Svg).toBeVisible();
  await toolRect.click();
  await v2Svg.click({ position: { x: 260, y: 220 } });
  await toolText.click();
  await v2Svg.click({ position: { x: 480, y: 220 } });
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
  await toolArrow.click();
  await openLayersPopover(page);
  await clickHybridShapeById(page, createdShapeIds[0]);
  await clickHybridShapeById(page, createdShapeIds[1]);
  await toolSelect.click();
  await openLayersPopover(page);
  await clickHybridShapeById(page, createdShapeIds[0]);
  await page.getByTestId("diagram-action-layers-bind-pick").click();
  await taskShape.click();

  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      return Number(Array.isArray(doc?.bindings) ? doc.bindings.length : 0);
    })
    .toBeGreaterThan(0);

  await taskShape.click();
  await expect
    .poll(async () => {
      const map = await readSessionHybridMap(request, auth.accessToken, sid);
      return Object.keys(map).length;
    })
    .toBeGreaterThan(0);
  const card = page.getByTestId("hybrid-layer-card").first();
  if (await card.isVisible().catch(() => false)) {
    const box = await card.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 16, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + 56, box.y + 26);
      await page.mouse.up();
    }
  }

  await page.keyboard.press("Escape");
  const prefsAfterEsc = await readHybridPrefs(page);
  expect(JSON.stringify(prefsAfterEsc)).toContain("\"mode\":\"view\"");

  await openPlaybackPopover(page);
  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-mode-view").click();
  const layersPopover = page.getByTestId("diagram-action-layers-popover");
  if (await layersPopover.isVisible().catch(() => false)) {
    await layersPopover.getByRole("button", { name: "Закрыть" }).click();
  }
  await openPlaybackPopover(page);
  await page.getByTestId("diagram-action-playback-next").click();
  for (let i = 0; i < 6; i += 1) {
    const highlighted = await activeOverlay.locator(".hybridV2Shape.isPlayback").count().catch(() => 0);
    if (highlighted > 0) break;
    await page.getByTestId("diagram-action-playback-next").click();
  }
  await expect(activeOverlay.locator(".hybridV2Shape.isPlayback").first()).toBeVisible();
  const progressText = String(await page.getByTestId("diagram-action-playback-progress").textContent() || "");
  const progress = parseProgressIndex(progressText);
  expect(progressText).toContain("/");
  expect(progress.total).toBeGreaterThan(0);
  expect(progress.current).toBeGreaterThan(0);

  const importXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="ProcessMap"><diagram name="Hybrid"><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="L1" parent="1" vertex="1"/>
<mxCell id="E100" value="Imported" parent="L1" vertex="1"><mxGeometry x="180" y="180" width="180" height="60" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;
  await page.getByTestId("hybrid-v2-import-input").setInputFiles({
    name: "hybrid-import.drawio",
    mimeType: "application/xml",
    buffer: Buffer.from(importXml, "utf-8"),
  });
  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      return Number(Array.isArray(doc?.elements) ? doc.elements.length : 0);
    })
    .toBeGreaterThan(0);

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  const overlayAfterReload = page.getByTestId("hybrid-layer-overlay").last();
  if (!(await overlayAfterReload.isVisible().catch(() => false))) {
    await openLayersPopover(page);
    await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  }
  await expect(overlayAfterReload).toBeVisible();
  await expect
    .poll(async () => {
      const map = await readSessionHybridMap(request, auth.accessToken, sid);
      return Object.keys(map).length;
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      return Number(Array.isArray(doc?.elements) ? doc.elements.length : 0);
    })
    .toBeGreaterThan(0);
  const mapBeforeOffscreen = await readSessionHybridMap(request, auth.accessToken, sid);
  const firstHybridId = Object.keys(mapBeforeOffscreen)[0] || "";
  if (firstHybridId) {
    const mutated = {
      ...mapBeforeOffscreen,
      [firstHybridId]: {
        dx: -2200,
        dy: Number(mapBeforeOffscreen[firstHybridId]?.dy || 0),
      },
    };
    const patched = await patchSessionHybridMap(request, auth.accessToken, sid, mutated);
    expect(patched).toBeTruthy();
    await page.reload();
    await openFixtureInTopbar(page, fixture);
    await switchTab(page, "Diagram");
    await waitForModelerReady(page);
    await openLayersPopover(page);
    await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
    await openLayersPopover(page);
    const focusBtn = page.getByTestId("diagram-action-layers-focus-visible");
    await expect(focusBtn).toBeVisible();
    await focusBtn.click();
    await expect(page.getByTestId("hybrid-layer-hotspot").first()).toBeVisible();
    const goToBtn = page.getByTestId("diagram-action-layers-go-to").first();
    if (await goToBtn.isVisible().catch(() => false)) {
      await goToBtn.click();
      await expect(page.getByTestId("hybrid-layer-overlay")).toBeVisible();
    }
  }
  await page.keyboard.down("H");
  await expect(page.getByTestId("hybrid-layer-overlay").last()).toBeVisible();
  await page.keyboard.up("H");
  await taskShape.click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("hybrid-layer-overlay").last()).toBeVisible();
});
