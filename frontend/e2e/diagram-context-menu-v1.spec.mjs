import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function rightClickPoint(page, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("context_click_point_missing");
  }
  await page.mouse.click(point.x, point.y, { button: "right" });
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
  await rightClickPoint(page, point);
}

async function rightClickLabelOfElement(page, elementId) {
  const point = await page.evaluate((targetId) => {
    const esc = (value) => {
      const raw = String(value || "");
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(raw);
      return raw.replace(/["\\]/g, "\\$&");
    };
    const id = String(targetId || "");

    const domCenter = (selector) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect?.();
      if (!rect) return null;
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
      if (rect.width <= 0 || rect.height <= 0) return null;
      return {
        x: Number(rect.left || 0) + Number(rect.width || 0) / 2,
        y: Number(rect.top || 0) + Number(rect.height || 0) / 2,
      };
    };

    const escapedId = esc(id);
    const domPoint = (
      domCenter(`[data-element-id="${escapedId}"] text`)
      || domCenter(`[data-element-id="${escapedId}"] tspan`)
      || domCenter(`[data-element-id="${escapedId}_label"] text`)
      || domCenter(`[data-element-id="${escapedId}_label"] tspan`)
    );
    if (domPoint) return domPoint;

    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;
    const registry = modeler.get("elementRegistry");
    const canvas = modeler.get("canvas");
    const element = registry?.get?.(id);
    if (!canvas || !element) return null;
    const label = element?.label;
    const lx = Number(label?.x || element?.x || 0) + Number(label?.width || element?.width || 0) / 2;
    const ly = Number(label?.y || element?.y || 0) + Number(label?.height || element?.height || 0) / 2;
    const vb = canvas?.viewbox?.() || {};
    const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
    const rect = canvas?._container?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      x: Number(rect.left || 0) + (lx - Number(vb?.x || 0)) * scale,
      y: Number(rect.top || 0) + (ly - Number(vb?.y || 0)) * scale,
    };
  }, elementId);
  await rightClickPoint(page, point);
}

async function rightClickCanvasEmpty(page) {
  const point = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;
    const registry = modeler.get("elementRegistry");
    const canvas = modeler.get("canvas");
    const svg = document.querySelector(".bpmnLayer--editor.on .djs-container svg, .djs-container svg");
    const svgRect = svg?.getBoundingClientRect?.();
    const vb = canvas?.viewbox?.() || {};
    const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
    if (!svgRect) return null;
    const all = registry?.getAll?.() || [];
    const shapes = all.filter((el) => {
      if (!el || Array.isArray(el?.waypoints)) return false;
      const t = String(el?.type || "").toLowerCase();
      return t !== "label";
    });
    const connections = all.filter((el) => Array.isArray(el?.waypoints) && String(el?.type || "").toLowerCase() !== "label");

    const nearSegment = (px, py, a, b) => {
      const ax = Number(a?.x || 0);
      const ay = Number(a?.y || 0);
      const bx = Number(b?.x || 0);
      const by = Number(b?.y || 0);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (!Number.isFinite(len2) || len2 <= 0.0001) {
        const d0 = Math.hypot(px - ax, py - ay);
        return d0 < 16;
      }
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const nx = ax + t * dx;
      const ny = ay + t * dy;
      return Math.hypot(px - nx, py - ny) < 16;
    };

    const occupied = (x, y) => {
      for (let i = 0; i < shapes.length; i += 1) {
        const s = shapes[i];
        const sx = Number(s?.x || 0) - 18;
        const sy = Number(s?.y || 0) - 18;
        const sw = Number(s?.width || 0) + 36;
        const sh = Number(s?.height || 0) + 36;
        if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) return true;
      }
      for (let i = 0; i < connections.length; i += 1) {
        const waypoints = Array.isArray(connections[i]?.waypoints) ? connections[i].waypoints : [];
        for (let j = 0; j < waypoints.length - 1; j += 1) {
          if (nearSegment(x, y, waypoints[j], waypoints[j + 1])) return true;
        }
      }
      return false;
    };

    const minScreenX = Number(svgRect.left || 0) + 24;
    const minScreenY = Number(svgRect.top || 0) + 24;
    const maxScreenX = Number(svgRect.right || 0) - 24;
    const maxScreenY = Number(svgRect.bottom || 0) - 24;
    for (let screenY = minScreenY; screenY <= maxScreenY; screenY += 64) {
      for (let screenX = minScreenX; screenX <= maxScreenX; screenX += 64) {
        const x = Number(vb?.x || 0) + (screenX - Number(svgRect.left || 0)) / scale;
        const y = Number(vb?.y || 0) + (screenY - Number(svgRect.top || 0)) / scale;
        if (occupied(x, y)) continue;
        return {
          x: screenX,
          y: screenY,
        };
      }
    }
    return {
      x: Number(svgRect.left || 0) + 40,
      y: Number(svgRect.top || 0) + 40,
    };
  });
  await rightClickPoint(page, point);
  return point;
}

async function dispatchContextMenuAndReadDefaultPrevented(page, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("contextmenu_probe_point_missing");
  }
  return await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(Number(x), Number(y));
    if (!(target instanceof Element)) return null;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: Number(x),
      clientY: Number(y),
      button: 2,
    });
    const dispatchResult = target.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented === true || dispatchResult === false,
    };
  }, point);
}

async function setFlowLabel(page, flowId, text) {
  return await page.evaluate(({ id, value }) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return false;
    const registry = modeler.get("elementRegistry");
    const modeling = modeler.get("modeling");
    const flow = registry?.get?.(String(id || ""));
    if (!flow || !modeling) return false;
    modeling.updateLabel(flow, String(value || ""));
    return !!flow?.label;
  }, { id: flowId, value: text });
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

test("diagram context menu v1: review-fix A-G", async ({ page, request }) => {
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

  const menu = page.getByTestId("bpmn-context-menu");

  // Scenario A: true empty BPMN area opens canvas menu + native menu suppressed inside diagram area
  const emptyCanvasPoint = await rightClickCanvasEmpty(page);
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-create_task")).toBeVisible();
  const insideNativeSuppressionProbe = await dispatchContextMenuAndReadDefaultPrevented(page, emptyCanvasPoint);
  expect(insideNativeSuppressionProbe?.defaultPrevented).toBe(true);
  await page.locator(".topbar").first().click({ force: true });
  await expect(menu).toHaveCount(0);

  // Scenario B: focused external input must not suppress BPMN context menu
  await page.evaluate(() => {
    const topbar = document.querySelector(".topbar") || document.body;
    let input = document.getElementById("__fpc_ctx_focus_input");
    if (!(input instanceof HTMLInputElement)) {
      input = document.createElement("input");
      input.id = "__fpc_ctx_focus_input";
      input.value = "focus-guard";
      input.style.position = "fixed";
      input.style.left = "-9999px";
      input.style.top = "-9999px";
      topbar.appendChild(input);
    }
    input.focus();
  });
  await rightClickPoint(page, emptyCanvasPoint);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-add_next_step")).toBeVisible();
  await page.keyboard.press("Escape");

  // Scenario C: right-click task label text -> task menu
  await rightClickLabelOfElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-add_next_step")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-edit_label")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Scenario D: right-click sequence-flow label text -> flow menu
  await expect.poll(async () => await setFlowLabel(page, "Flow_1", "route-a"), { timeout: 10_000 }).toBe(true);
  await rightClickLabelOfElement(page, "Flow_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-edit_label")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-add_next_step")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Scenario E: duplicate removed (unsafe semantics not exposed)
  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-duplicate")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Scenario F: outside diagram area native menu preserved
  await page.locator(".topbar").first().click({ button: "right", force: true });
  await expect(menu).toHaveCount(0);
  const outsidePoint = await page.evaluate(() => {
    const rect = document.querySelector(".topbar")?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      x: Number(rect.left || 0) + 10,
      y: Number(rect.top || 0) + 10,
    };
  });
  const outsideNativeMenuProbe = await dispatchContextMenuAndReadDefaultPrevented(page, outsidePoint);
  expect(outsideNativeMenuProbe?.defaultPrevented).toBe(false);

  // Scenario G: close contract (Esc, outside click, zoom/pan wheel, route change)
  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await page.locator(".topbar").first().click({ force: true });
  await expect(menu).toHaveCount(0);

  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await page.mouse.wheel(0, -360);
  await expect(menu).toHaveCount(0);

  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await page.mouse.move(emptyCanvasPoint.x, emptyCanvasPoint.y);
  await page.mouse.down();
  await page.mouse.move(emptyCanvasPoint.x + 32, emptyCanvasPoint.y + 14);
  await page.mouse.up();
  await expect(menu).toHaveCount(0);

  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await page.evaluate(() => {
    const suffix = `ctx_${Date.now()}`;
    window.location.hash = suffix;
  });
  await expect(menu).toHaveCount(0);
});
