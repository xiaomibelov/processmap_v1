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
  await expect(page.getByTestId("topbar-project-select")).toBeVisible();
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
  await toggle.click({ noWaitAfter: true });
  await expect(popover).toBeVisible();
  return popover;
}

async function openPlaybackPopover(page) {
  const toggle = page.getByTestId("diagram-action-playback");
  const popover = page.getByTestId("diagram-action-playback-popover");
  if (await popover.isVisible().catch(() => false)) return popover;
  await toggle.click({ noWaitAfter: true });
  await expect(popover).toBeVisible();
  return popover;
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
  await hybridToggle.check({ force: true, noWaitAfter: true });
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
  await expect(page.getByTestId("hybrid-layer-overlay")).toBeVisible();

  const taskShape = page.locator("g.djs-element.djs-shape[data-element-id='Task_1']").first();
  await taskShape.click({ noWaitAfter: true });
  await expect(taskShape).toHaveClass(/selected/);

  await openLayersPopover(page);
  const hybridToggle2 = page.getByTestId("diagram-action-layers-hybrid-toggle");
  await hybridToggle2.check({ force: true, noWaitAfter: true });
  const editButton = page.getByTestId("diagram-action-layers-mode-edit");
  await expect(editButton).toBeEnabled();
  await editButton.click({ noWaitAfter: true });
  await expect(page.getByTestId("hybrid-layer-overlay")).toHaveClass(/isEdit/);
  const prefsAfterEdit = await readHybridPrefs(page);
  expect(JSON.stringify(prefsAfterEdit)).toContain("\"mode\":\"edit\"");

  await taskShape.click({ noWaitAfter: true });
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
  await expect(page.getByTestId("hybrid-layer-overlay")).toHaveClass(/isView/);
  const prefsAfterEsc = await readHybridPrefs(page);
  expect(JSON.stringify(prefsAfterEsc)).toContain("\"mode\":\"view\"");

  await openPlaybackPopover(page);
  await page.getByTestId("diagram-action-playback-next").click();
  const progressText = String(await page.getByTestId("diagram-action-playback-progress").textContent() || "");
  const progress = parseProgressIndex(progressText);
  expect(progressText).toContain("/");
  expect(progress.total).toBeGreaterThan(0);
  expect(progress.current).toBeGreaterThan(0);

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  const overlayAfterReload = page.getByTestId("hybrid-layer-overlay");
  if (!(await overlayAfterReload.isVisible().catch(() => false))) {
    await openLayersPopover(page);
    await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true, noWaitAfter: true });
  }
  await expect(overlayAfterReload).toBeVisible();
  await expect
    .poll(async () => {
      const map = await readSessionHybridMap(request, auth.accessToken, sid);
      return Object.keys(map).length;
    })
    .toBeGreaterThan(0);
  await page.keyboard.down("H");
  await expect(page.getByTestId("hybrid-layer-overlay")).toBeVisible();
  await page.keyboard.up("H");
  await taskShape.click({ position: { x: 8, y: 8 }, noWaitAfter: true });
  await expect(taskShape).toHaveClass(/selected/);
});
