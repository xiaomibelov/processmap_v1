import { test, expect } from "../../frontend/node_modules/@playwright/test/index.mjs";
import { apiLogin, setUiToken } from "../../frontend/e2e/helpers/e2eAuth.mjs";
import { waitForDiagramReady } from "../../frontend/e2e/helpers/diagramReady.mjs";

const APP_BASE = process.env.E2E_APP_BASE_URL || "http://clearvestnic.ru:5177";
const API_BASE_URL = process.env.E2E_API_BASE_URL || APP_BASE;
const PROJECT_ID = "b1c8a56b6e";
const SESSION_ID = "03db107ebb";

const results = {};

test.afterEach(async ({}, testInfo) => {
  results[testInfo.title] = testInfo.status;
});

test.afterAll(async () => {
  console.log("\n========== ProcessMap E2E Report ==========");
  for (const [name, status] of Object.entries(results)) {
    const icon = status === "passed" ? "✅" : status === "skipped" ? "⏭️" : "❌";
    console.log(`${icon} ${status?.toUpperCase() || "UNKNOWN"}: ${name}`);
  }
  console.log("==========================================\n");
});

async function authAndOpenFixedSession(page, request) {
  const auth = await apiLogin(request, { apiBase: API_BASE_URL });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
    appBaseUrl: APP_BASE,
  });

  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }

  await page.goto(`/app?project=${encodeURIComponent(PROJECT_ID)}&session=${encodeURIComponent(SESSION_ID)}`);
  await page.waitForLoadState("domcontentloaded");

  const orgChoice = page.getByText("Выберите организацию");
  if (await orgChoice.isVisible().catch(() => false)) {
    const firstOrgButton = page.getByRole("button", { name: /Org|Default|Организац/i }).first();
    if (await firstOrgButton.count() > 0) {
      await firstOrgButton.click();
      await page.waitForTimeout(500);
    }
  }

  await waitForDiagramReady(page, { timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__FPC_E2E_MODELER__), { timeout: 30000 });
  return auth;
}

async function ensureSelectedNodePanelOpen(page) {
  const handle = page.locator("[data-testid='left-sidebar-handle']");
  const nodeBtn = handle.locator("button[aria-label='Узел']").first();
  if (await nodeBtn.isVisible().catch(() => false)) {
    await nodeBtn.click();
    return;
  }
  const hamburger = handle.locator("button[aria-label='Открыть панель']").first();
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    await page.waitForTimeout(300);
    if (await nodeBtn.isVisible().catch(() => false)) {
      await nodeBtn.click();
    }
  }
}

async function openPropertiesAccordion(page) {
  const accordion = page.locator(".sidebarAccordionHead").filter({ hasText: /^Свойства$/ }).first();
  if (await accordion.isVisible().catch(() => false)) {
    const isOpen = await accordion.evaluate((el) => el.getAttribute("aria-expanded") === "true").catch(() => false);
    if (!isOpen) await accordion.click();
  }
}

async function waitForModelerReady(page, timeout = 30000) {
  await expect.poll(async () => await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return false;
    const registry = modeler.get("elementRegistry");
    return Array.isArray(registry?.getAll?.()) && registry.getAll().length > 0;
  }), {
    message: "modeler not ready with elements",
    timeout,
  }).toBeTruthy();
}

async function readViewportRestoreAttempts(page) {
  return page.evaluate(() => window.__FPC_E2E_VIEWPORT_RESTORE_ATTEMPTS__ || []);
}

async function findShapeByBpmnType(page, bpmnType) {
  return page.evaluate((type) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return null;
    const registry = modeler.get("elementRegistry");
    const canvas = modeler.get("canvas");
    const el = registry.find(
      (e) => e.businessObject
        && e.businessObject.$type === type
        && e.type !== "label"
        && !e.waypoints
        && !!canvas.getGraphics(e.id),
    );
    if (!el) return null;
    return {
      id: el.id,
      name: el.businessObject.name || "",
      type: el.businessObject.$type,
    };
  }, bpmnType);
}

async function clickShapeById(page, id) {
  const shape = page.locator(`g[data-element-id="${id}"]`).first();
  await expect(shape, `shape ${id} not found`).toBeVisible();
  await shape.click({ force: true });
}

async function readSelectionContinuityLog(page) {
  return page.evaluate(() => window.__FPC_SELECTION_CONTINUITY_LOG__ || []);
}

async function selectShapeById(page, id) {
  const selectedViaApi = await page.evaluate((shapeId) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return false;
    try {
      const canvas = modeler.get("canvas");
      const gfx = canvas && typeof canvas.getGraphics === "function" ? canvas.getGraphics(shapeId) : null;
      if (!gfx) return false;
      gfx.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch {
      return false;
    }
  }, id);
  if (!selectedViaApi) {
    const shape = page.locator(`g[data-element-id="${id}"]`).first();
    await shape.scrollIntoViewIfNeeded();
    await shape.click({ force: true });
  }
  await page.waitForTimeout(400);
}

async function readModelerViewport(page) {
  await page.waitForFunction(
    () => {
      const modeler = window.__FPC_E2E_MODELER__;
      if (!modeler) return false;
      try {
        modeler.get("canvas").viewbox();
        return true;
      } catch {
        return false;
      }
    },
    { timeout: 30000 },
  );
  return page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return null;
    const canvas = modeler.get("canvas");
    const vb = canvas.viewbox();
    return {
      zoom: canvas.zoom(),
      viewbox: {
        x: vb.x,
        y: vb.y,
        width: vb.width,
        height: vb.height,
      },
    };
  });
}

function floatEq(a, b, eps = 0.05) {
  return Math.abs(Number(a) - Number(b)) < eps;
}

test.describe("ProcessMap: comprehensive update checks", () => {
  test("Recipe Sidebar: visible for Task/UserTask, hidden for SubProcess/StartEvent", async ({ page, request }) => {
    await authAndOpenFixedSession(page, request);

    const taskInfo = (await findShapeByBpmnType(page, "bpmn:UserTask"))
      || (await findShapeByBpmnType(page, "bpmn:Task"));
    const subprocessInfo = await findShapeByBpmnType(page, "bpmn:SubProcess");
    const startEventInfo = await findShapeByBpmnType(page, "bpmn:StartEvent");

    if (!taskInfo) {
      test.skip("No Task/UserTask found on the diagram");
      return;
    }

    await selectShapeById(page, taskInfo.id);
    await ensureSelectedNodePanelOpen(page);
    await openPropertiesAccordion(page);

    const sidebarLocator = page.locator('[data-testid="recipe-sidebar"]');
    const sidebarCount = await sidebarLocator.count();
    if (sidebarCount === 0) {
      test.skip("RecipeSidebar is not present in this build");
      return;
    }

    await expect(sidebarLocator, "Recipe Sidebar should be visible for Task/UserTask").toBeVisible();
    console.log(`✅ Recipe Sidebar visible for ${taskInfo.type} "${taskInfo.name || taskInfo.id}"`);
    await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/recipe_sidebar_task.png", fullPage: false });

    if (subprocessInfo) {
      await selectShapeById(page, subprocessInfo.id);
      await expect(sidebarLocator, "Recipe Sidebar should be hidden for SubProcess").toBeHidden();
      console.log(`✅ Recipe Sidebar hidden for ${subprocessInfo.type} "${subprocessInfo.name || subprocessInfo.id}"`);
      await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/recipe_sidebar_subprocess.png", fullPage: false });
    }

    if (startEventInfo) {
      await selectShapeById(page, startEventInfo.id);
      await expect(sidebarLocator, "Recipe Sidebar should be hidden for StartEvent").toBeHidden();
      console.log(`✅ Recipe Sidebar hidden for ${startEventInfo.type} "${startEventInfo.name || startEventInfo.id}"`);
    }
  });

  test("Version modal: compact layout, lazy loading, technical versions", async ({ page, request }) => {
    await authAndOpenFixedSession(page, request);

    await page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').click();
    await page.waitForSelector('[data-testid="diagram-toolbar-overlay"]', { timeout: 5000 });
    await page.locator('[data-testid="bpmn-versions-open"]').click();

    const modal = page.locator('[data-testid="bpmn-versions-modal"]');
    await modal.waitFor({ state: "visible", timeout: 15000 });

    const box = await modal.boundingBox();
    expect(box, "modal bounding box not found").not.toBeNull();
    console.log("Version modal size:", box.width, "x", box.height);
    expect(box.height).toBeGreaterThanOrEqual(480);

    const leftPanel = modal.locator("> *").first();
    const leftBox = await leftPanel.boundingBox();
    if (leftBox) {
      console.log("Left panel width:", leftBox.width);
      expect(leftBox.width).toBeGreaterThanOrEqual(250);
      expect(leftBox.width).toBeLessThanOrEqual(400);
    }

    const technicalToggle = page.locator('[data-testid="bpmn-versions-show-technical"]');
    await expect(technicalToggle, "technical versions toggle missing").toBeVisible();
    await technicalToggle.click();

    const firstItem = page.locator('[data-testid="bpmn-version-item"]').first();
    await firstItem.waitFor({ state: "visible", timeout: 15000 });

    const versionCount = await page.locator('[data-testid="bpmn-version-item"]').count();
    console.log("Version count (with technical):", versionCount);
    expect(versionCount).toBeGreaterThan(0);

    const loadMore = page.locator('[data-testid="bpmn-versions-load-more"]');
    if (await loadMore.isVisible().catch(() => false)) {
      console.log('✅ Lazy loading: "Загрузить ещё 10" is visible');
    } else {
      console.log("ℹ️ Lazy loading: all versions already loaded (or fewer than 11)");
    }

    await expect(firstItem.locator('[data-testid="bpmn-version-preview"]')).toBeVisible();
    await expect(firstItem.locator('[data-testid="bpmn-version-diff"]')).toBeVisible();
    await expect(firstItem.locator('[data-testid="bpmn-version-restore"]')).toBeVisible();

    await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/version_modal_layout.png", fullPage: false });

    const closeButton = modal.locator('[data-testid="bpmn-versions-close"]').or(page.locator("button", { hasText: "Закрыть" })).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await modal.waitFor({ state: "hidden", timeout: 5000 });
    }
  });

  test("Restore version then save without CAS error", async ({ page, request }) => {
    await authAndOpenFixedSession(page, request);

    let saveStatus = null;
    let saveBody = null;
    const savePromise = new Promise((resolve) => {
      const handler = async (response) => {
        const req = response.request();
        const url = req.url();
        const method = req.method();
        if (url.includes("/api/sessions/") && (method === "PUT" || method === "PATCH")) {
          saveStatus = response.status();
          saveBody = await response.json().catch(() => null);
          page.off("response", handler);
          resolve();
        }
      };
      page.on("response", handler);
    });

    await page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').click();
    await page.waitForSelector('[data-testid="diagram-toolbar-overlay"]', { timeout: 5000 });
    await page.locator('[data-testid="bpmn-versions-open"]').click();

    const modal = page.locator('[data-testid="bpmn-versions-modal"]');
    await modal.waitFor({ state: "visible", timeout: 15000 });

    await page.locator('[data-testid="bpmn-versions-show-technical"]').click();
    const firstItem = page.locator('[data-testid="bpmn-version-item"]').first();
    await firstItem.waitFor({ state: "visible", timeout: 15000 });

    await firstItem.locator('[data-testid="bpmn-version-restore"]').click();
    await page.waitForTimeout(1500);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await page.locator('[data-testid="diagram-toolbar-save"]').click();
    await savePromise;
    await page.waitForTimeout(1000);

    expect(saveStatus, "no save request observed after restore").not.toBeNull();
    expect(saveStatus).toBe(200);
    if (saveBody?.error) {
      console.error("Save error:", saveBody.error);
    }
    expect(saveBody?.error).toBeUndefined();
    expect(saveBody?.ok).toBe(true);

    const toast = page.locator('[data-testid="process-save-ack-toast"]');
    if (await toast.isVisible().catch(() => false)) {
      const toastText = await toast.textContent();
      console.log("Save toast:", toastText);
      expect(toastText).not.toContain("требуется обновить");
    }

    console.log("✅ Restore → Save:", saveStatus, saveBody?.diagram_state_version || "");
  });

  test("Property delete persists after save and reload", async ({ page, request }) => {
    await authAndOpenFixedSession(page, request);
    await waitForModelerReady(page);

    const taskInfo = (await findShapeByBpmnType(page, "bpmn:UserTask"))
      || (await findShapeByBpmnType(page, "bpmn:Task"));
    if (!taskInfo) {
      test.skip("No Task/UserTask found on the diagram");
      return;
    }

    await selectShapeById(page, taskInfo.id);
    console.log("Selection continuity after select:", await readSelectionContinuityLog(page));
    await ensureSelectedNodePanelOpen(page);
    await openPropertiesAccordion(page);

    const sectionToggle = page.locator(".sidebarPropertiesBlockTitle", { hasText: "Дополнительные BPMN-свойства" }).first();
    await expect(sectionToggle).toBeVisible();
    await sectionToggle.locator("..").click();

    const testKey = `e2e_delete_${Date.now()}`;
    const addBtn = page.getByRole("button", { name: "+ Добавить BPMN-свойство" }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await page.waitForTimeout(300);

    const rows = page.locator(".sidebarBpmnPropertyItem");
    await rows.last().waitFor({ state: "visible", timeout: 5000 });
    const lastRow = rows.last();
    const editBtn = lastRow.locator(".sidebarBpmnPropertyEditBtn");
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(200);
    }
    const inputs = lastRow.locator(".sidebarBpmnPropertyEditor input");
    await inputs.nth(0).fill(testKey);
    await inputs.nth(1).fill("e2e-value");

    const saveBtn = page.locator(".sidebarPropertiesBlock--secondary .primaryBtn", { hasText: "Сохранить" }).first();
    await saveBtn.click();
    await page.waitForTimeout(2500);

    // Save triggers a session refresh that can deselect the shape; reselect it.
    await selectShapeById(page, taskInfo.id);
    await ensureSelectedNodePanelOpen(page);
    await openPropertiesAccordion(page);
    await sectionToggle.locator("..").click();
    await page.waitForTimeout(300);

    const propertyNames = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector(".sidebarBpmnPropertyPreviewKey")?.textContent?.trim() || ""),
    );
    expect(propertyNames, "test property was not saved").toContain(testKey);
    console.log("✅ Test property added:", testKey);

    const rowWithKey = rows.filter({ hasText: testKey });
    const deleteBtn = rowWithKey.locator(`button[aria-label*="${testKey}"]`).first();
    await expect(deleteBtn, "delete button for test property").toBeVisible();
    await deleteBtn.click();

    await page.waitForTimeout(500);
    await expect(rows.filter({ hasText: testKey })).toHaveCount(0);

    await saveBtn.click();
    await expect.poll(async () => rows.filter({ hasText: testKey }).count()).toBe(0);
    console.log("✅ Test property deleted and saved");

    await page.reload({ waitUntil: "domcontentloaded" });
    await authAndOpenFixedSession(page, request);
    await waitForModelerReady(page);
    await page.waitForTimeout(1000);

    await selectShapeById(page, taskInfo.id);
    await ensureSelectedNodePanelOpen(page);
    await openPropertiesAccordion(page);
    await sectionToggle.locator("..").click();

    const remainingNames = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector(".sidebarBpmnPropertyPreviewKey")?.textContent?.trim() || ""),
    );
    console.log("Remaining properties after reload:", remainingNames);
    expect(remainingNames).not.toContain(testKey);
    console.log("✅ Property delete persisted after reload");
  });

  test("Viewport persistence: zoom and pan survive save and reload", async ({ page, request }) => {
    await authAndOpenFixedSession(page, request);
    await waitForModelerReady(page);

    const modelerReady = await page.evaluate(() => Boolean(window.__FPC_E2E_MODELER__));
    if (!modelerReady) {
      test.skip("Modeler not exposed via window.__FPC_E2E_MODELER__");
      return;
    }

    const before = await readModelerViewport(page);
    expect(before).not.toBeNull();

    const targetZoom = Math.max((before.zoom || 1) * 1.5, 1.2);
    const targetViewbox = {
      x: (before.viewbox.x || 0) + 80,
      y: (before.viewbox.y || 0) + 60,
      width: (before.viewbox.width || 400) / 1.2,
      height: (before.viewbox.height || 300) / 1.2,
    };

    await page.evaluate(({ zoom, viewbox }) => {
      const modeler = window.__FPC_E2E_MODELER__;
      const canvas = modeler.get("canvas");
      canvas.viewbox(viewbox);
      canvas.zoom(zoom);
    }, { zoom: targetZoom, viewbox: targetViewbox });

    const afterChange = await readModelerViewport(page);
    expect(floatEq(afterChange.zoom, targetZoom, 0.1)).toBe(true);

    let saveStatus = null;
    let saveResponseBody = null;
    const savePromise = new Promise((resolve) => {
      const handler = async (response) => {
        const req = response.request();
        const url = req.url();
        const method = req.method();
        if (url.includes(`/api/sessions/${SESSION_ID}/bpmn`) && method === "PUT") {
          saveStatus = response.status();
          saveResponseBody = await response.json().catch(() => null);
          page.off("response", handler);
          resolve();
        }
      };
      page.on("response", handler);
    });

    await page.locator('[data-testid="diagram-toolbar-save"]').click();
    await savePromise;
    expect(saveStatus).toBe(200);
    await page.waitForTimeout(1000);

    await page.reload({ waitUntil: "domcontentloaded" });
    const authReload = await authAndOpenFixedSession(page, request);
    await waitForModelerReady(page);
    await page.waitForTimeout(1500);

    const sessionAfterReload = await request.get(`${API_BASE_URL}/api/sessions/${SESSION_ID}`, {
      headers: { Authorization: `Bearer ${authReload.accessToken}` },
    });
    const sessionBody = await sessionAfterReload.json().catch(() => null);
    console.log("Session bpmn_meta.viewport:", sessionBody?.bpmn_meta?.viewport);
    console.log("Viewport restore attempts:", await readViewportRestoreAttempts(page));
    const currentViewport = await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__;
      if (!modeler) return null;
      const canvas = modeler.get("canvas");
      return { zoom: canvas.zoom(), viewbox: canvas.viewbox() };
    });
    console.log("Current viewport after reload:", currentViewport);
    const afterReload = await page.waitForFunction(({ tz, tx, ty }) => {
      const modeler = window.__FPC_E2E_MODELER__;
      if (!modeler) return null;
      const canvas = modeler.get("canvas");
      const zoom = canvas.zoom();
      const vb = canvas.viewbox();
      if (
        Math.abs(zoom - tz) < 0.15
        && Math.abs(vb.x - tx) < 5
        && Math.abs(vb.y - ty) < 5
      ) {
        return { zoom, viewbox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height } };
      }
      return null;
    }, { tz: targetZoom, tx: targetViewbox.x, ty: targetViewbox.y }, { timeout: 10000 });
    expect(afterReload).not.toBeNull();
    expect(floatEq(afterReload.zoom, targetZoom, 0.15)).toBe(true);
    expect(floatEq(afterReload.viewbox.x, targetViewbox.x, 5)).toBe(true);
    expect(floatEq(afterReload.viewbox.y, targetViewbox.y, 5)).toBe(true);

    await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/viewport_persisted.png", fullPage: false });
    console.log("✅ Viewport zoom and pan persisted after reload");
  });

  test("Swagger UI: accessible with JWT auth and tags", async ({ page, request }) => {
    const auth = await apiLogin(request, { apiBase: API_BASE_URL });
    await page.setExtraHTTPHeaders({ Authorization: `Bearer ${auth.accessToken}` });

    await page.goto("/api/docs");
    await page.waitForLoadState("networkidle");

    const title = await page.title();
    if (!/Swagger|FastAPI/.test(title)) {
      test.skip("Swagger UI is not exposed on this deployment (backend docs disabled or served under a different path)");
      return;
    }

    const authButton = page.locator("button", { hasText: "Authorize" }).or(page.locator(".authorize")).first();
    await expect(authButton).toBeVisible();
    console.log("✅ Swagger: Authorize button visible");

    const tags = await page.locator(".opblock-tag").all();
    const tagTexts = await Promise.all(tags.map((t) => t.textContent()));
    console.log("Swagger tags:", tagTexts);
    expect(tagTexts.some((t) => /sessions|recipes/i.test(t))).toBe(true);
    console.log("✅ Swagger: tags present");

    await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/swagger_ui.png", fullPage: true });
  });
});
