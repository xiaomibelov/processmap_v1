import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function rightClickCanvas(page, dx = 44, dy = 44) {
  const canvas = page.locator(".bpmnLayer--editor.on .djs-container svg").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas_bounding_box_missing");
  await page.mouse.click(box.x + dx, box.y + dy, { button: "right" });
}

async function rightClickElement(page, elementId) {
  const point = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;
    const registry = modeler.get("elementRegistry");
    const canvas = modeler.get("canvas");
    const element = registry?.get?.(String(targetId || ""));
    if (!element || !canvas) return null;
    let diagramX = Number(element?.x || 0) + Number(element?.width || 0) / 2;
    let diagramY = Number(element?.y || 0) + Number(element?.height || 0) / 2;
    const waypoints = Array.isArray(element?.waypoints) ? element.waypoints : [];
    if (waypoints.length >= 2) {
      const mid = waypoints[Math.floor(waypoints.length / 2)] || waypoints[0];
      diagramX = Number(mid?.x || diagramX);
      diagramY = Number(mid?.y || diagramY);
    }
    const vb = canvas?.viewbox?.() || {};
    const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
    const rect = canvas?._container?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      x: Number(rect.left || 0) + (diagramX - Number(vb?.x || 0)) * scale,
      y: Number(rect.top || 0) + (diagramY - Number(vb?.y || 0)) * scale,
    };
  }, elementId);
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    await page.mouse.click(point.x, point.y, { button: "right" });
    return;
  }
  const host = page.locator(`.bpmnLayer--editor.on g.djs-element[data-element-id='${String(elementId || "")}']`).first();
  await expect(host).toBeVisible();
  const hit = host.locator(".djs-visual > *").first();
  if (await hit.count()) {
    await hit.click({ button: "right", force: true });
    return;
  }
  await host.click({ button: "right", force: true });
}

async function countTasks(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return -1;
    const all = modeler.get("elementRegistry")?.getAll?.() || [];
    return all.filter((el) => {
      if (!el || Array.isArray(el?.waypoints) || String(el?.type || "").toLowerCase() === "label") return false;
      const t = String(el?.businessObject?.$type || el?.type || "").toLowerCase();
      return t.includes("task");
    }).length;
  });
}

async function outgoingCount(page, elementId) {
  return await page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return -1;
    const element = modeler.get("elementRegistry")?.get?.(String(id || ""));
    if (!element) return -1;
    const outgoing = Array.isArray(element.outgoing) ? element.outgoing : [];
    return outgoing.filter((row) => {
      const type = String(row?.businessObject?.$type || row?.type || "").toLowerCase();
      return type.includes("sequenceflow");
    }).length;
  }, elementId);
}

async function createGatewayNearElement(page, anchorId = "Task_1") {
  return await page.evaluate((anchor) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return "";
    const registry = modeler.get("elementRegistry");
    const modeling = modeler.get("modeling");
    const elementFactory = modeler.get("elementFactory");
    const canvas = modeler.get("canvas");
    const anchorEl = registry?.get?.(String(anchor || ""));
    const parent = anchorEl?.parent || canvas?.getRootElement?.();
    if (!modeling || !elementFactory || !parent) return "";
    const x = Number(anchorEl?.x || 200) + 240;
    const y = Number(anchorEl?.y || 120) + Number(anchorEl?.height || 80) / 2 + 220;
    const gateway = modeling.createShape(
      elementFactory.createShape({ type: "bpmn:ExclusiveGateway" }),
      { x: Math.round(x), y: Math.round(y) },
      parent,
    );
    return String(gateway?.id || "");
  }, anchorId);
}

async function flowExists(page, flowId) {
  return await page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return false;
    return !!modeler.get("elementRegistry")?.get?.(String(id || ""));
  }, flowId);
}

async function openFixtureSession(page, fixture) {
  const projectId = String(fixture?.projectId || "").trim();
  const sessionId = String(fixture?.sessionId || "").trim();
  const url = `/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`;
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  const orgChoice = page.getByText("Выберите организацию");
  if (await orgChoice.isVisible().catch(() => false)) {
    const firstOrgButton = page.getByRole("button", { name: /Default|Org|Организац/i }).first();
    if (await firstOrgButton.isVisible().catch(() => false)) {
      await firstOrgButton.click();
      await page.waitForTimeout(300);
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded");
    }
  }
}

async function readAuthUser(request, auth) {
  const res = await request.get(`${API_BASE}/api/auth/me`, {
    headers: auth.headers,
  });
  if (!res.ok()) return { userId: "", activeOrgId: String(auth?.activeOrgId || "").trim() };
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  return {
    userId: String(body?.id || "").trim(),
    activeOrgId: String(body?.active_org_id || body?.default_org_id || auth?.activeOrgId || "").trim(),
  };
}

test("diagram context menu v1: scoped open/close + action matrix core", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const authUser = await readAuthUser(request, auth);
  const fixture = await createFixture(
    request,
    runId,
    auth.headers,
    seedXml({ processName: `ctx-v1-${runId}`, taskName: `Task ${runId.slice(-4)}` }),
  );

  await page.addInitScript(({ userId, orgId }) => {
    const uid = String(userId || "").trim();
    const oid = String(orgId || "").trim();
    if (oid) window.localStorage.setItem("fpc_active_org_id", oid);
    if (uid && oid) window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
  }, {
    userId: authUser.userId,
    orgId: fixture.orgId || authUser.activeOrgId || auth.activeOrgId,
  });
  await setUiToken(page, auth.accessToken, {
    activeOrgId: fixture.orgId || authUser.activeOrgId || auth.activeOrgId,
  });
  await openFixtureSession(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page, { timeout: 45_000 });

  await expect.poll(async () => await countTasks(page), { timeout: 15_000 }).toBeGreaterThan(0);

  const menu = page.getByTestId("bpmn-context-menu");

  // Scenario A: canvas menu + create task
  const tasksBeforeCanvasCreate = await countTasks(page);
  await rightClickCanvas(page, 46, 46);
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-create_task")).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-create_task").click();
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => await countTasks(page), { timeout: 10_000 }).toBe(tasksBeforeCanvasCreate + 1);

  // Scenario B: task menu actions + Add Next Step + Duplicate
  const outgoingBefore = await outgoingCount(page, "Task_1");
  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-rename")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-open_properties")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-add_next_step")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-duplicate")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-copy_name")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-copy_id")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-delete")).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-add_next_step").click();
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => await outgoingCount(page, "Task_1"), { timeout: 10_000 }).toBeGreaterThan(outgoingBefore);

  const tasksBeforeDuplicate = await countTasks(page);
  await rightClickElement(page, "Task_1");
  await page.getByTestId("bpmn-context-menu-action-duplicate").click();
  await expect.poll(async () => await countTasks(page), { timeout: 10_000 }).toBe(tasksBeforeDuplicate + 1);

  // Scenario C: gateway branch action
  const resolvedGatewayId = await createGatewayNearElement(page, "Task_1");
  expect(resolvedGatewayId).not.toBe("");
  await rightClickElement(page, resolvedGatewayId);
  await expect(page.getByTestId("bpmn-context-menu-action-add_outgoing_branch")).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-add_outgoing_branch").click();
  await expect.poll(async () => await outgoingCount(page, resolvedGatewayId), { timeout: 10_000 }).toBeGreaterThan(0);

  // Scenario D: sequence flow menu + edit label + delete
  await rightClickElement(page, "Flow_1");
  await expect(page.getByTestId("bpmn-context-menu-action-edit_label")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-delete")).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-edit_label").click();
  const directEditing = page.locator(".djs-direct-editing-parent").first();
  await expect(directEditing).toBeVisible();

  // Scenario E (partial): inline label editor keeps native behavior (BPMN menu must not open)
  const editingField = page.locator(".djs-direct-editing-parent textarea, .djs-direct-editing-parent input, .djs-direct-editing-parent [contenteditable='true']").first();
  await editingField.click({ button: "right", force: true });
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("Escape");

  await rightClickElement(page, "Flow_1");
  await page.getByTestId("bpmn-context-menu-action-delete").click();
  await expect.poll(async () => await flowExists(page, "Flow_1"), { timeout: 10_000 }).toBe(false);

  // Scenario E (outside diagram): no BPMN menu outside diagram scope
  await page.locator(".topbar").first().click({ button: "right", force: true });
  await expect(menu).toHaveCount(0);

  // Scenario F: close contract (Esc / outside click / wheel / route change)
  await rightClickCanvas(page, 56, 56);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await rightClickCanvas(page, 60, 60);
  await expect(menu).toBeVisible();
  await page.locator(".topbar").first().click({ force: true });
  await expect(menu).toHaveCount(0);

  await rightClickCanvas(page, 64, 64);
  await expect(menu).toBeVisible();
  await page.locator(".bpmnLayer--editor.on .djs-container svg").first().hover();
  await page.mouse.wheel(0, 220);
  await expect(menu).toHaveCount(0);

  await rightClickCanvas(page, 68, 68);
  await expect(menu).toBeVisible();
  await switchTab(page, "Interview");
  await expect(menu).toHaveCount(0);
});
