import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, switchTab } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

function seedPoolLaneXml({ processName = "E2E PoolLane Process", taskName = "Task baseline" } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Производство" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" name="${processName}" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Линия 1">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="${taskName}">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="120" y="100" width="940" height="340" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1_di" bpmnElement="Lane_1" isHorizontal="true">
        <dc:Bounds x="170" y="130" width="890" height="280" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="280" y="245" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="400" y="223" width="170" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="690" y="245" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="316" y="263" />
        <di:waypoint x="400" y="263" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="570" y="263" />
        <di:waypoint x="690" y="263" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  </bpmn:definitions>`;
}

async function rightClickPoint(page, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("context_click_point_missing");
  }
  await page.mouse.click(point.x, point.y, { button: "right" });
}

async function findEmptyCanvasPoint(page, zone = "pool") {
  const out = await page.evaluate((zoneRaw) => {
    const zoneValue = String(zoneRaw || "pool").trim().toLowerCase();
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;

    const canvas = modeler.get("canvas");
    const registry = modeler.get("elementRegistry");
    const rect = canvas?._container?.getBoundingClientRect?.();
    const vb = canvas?.viewbox?.() || {};
    const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
    if (!rect) return null;

    const all = Array.isArray(registry?.getAll?.()) ? registry.getAll() : [];
    const shapes = all.filter((el) => {
      if (!el || Array.isArray(el?.waypoints)) return false;
      const type = String(el?.type || el?.businessObject?.$type || "").toLowerCase();
      if (type === "label" || type.includes(":label")) return false;
      const w = Number(el?.width || 0);
      const h = Number(el?.height || 0);
      return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
    });

    const participants = shapes.filter((el) => String(el?.type || el?.businessObject?.$type || "").toLowerCase().includes("participant"));
    const lanes = shapes.filter((el) => String(el?.type || el?.businessObject?.$type || "").toLowerCase().includes("lane"));
    const poolContainers = participants.length ? participants : lanes;
    const occupiedShapes = shapes.filter((el) => {
      const t = String(el?.type || el?.businessObject?.$type || "").toLowerCase();
      return !t.includes("participant") && !t.includes("lane");
    });
    const connections = all.filter((el) => Array.isArray(el?.waypoints));

    const inside = (x, y, el, pad = 0) => {
      const ex = Number(el?.x || 0) + pad;
      const ey = Number(el?.y || 0) + pad;
      const ew = Number(el?.width || 0) - pad * 2;
      const eh = Number(el?.height || 0) - pad * 2;
      return ew > 0 && eh > 0 && x >= ex && x <= ex + ew && y >= ey && y <= ey + eh;
    };

    const nearSegment = (px, py, a, b) => {
      const ax = Number(a?.x || 0);
      const ay = Number(a?.y || 0);
      const bx = Number(b?.x || 0);
      const by = Number(b?.y || 0);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (!Number.isFinite(len2) || len2 <= 0.0001) {
        return Math.hypot(px - ax, py - ay) < 16;
      }
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const nx = ax + t * dx;
      const ny = ay + t * dy;
      return Math.hypot(px - nx, py - ny) < 16;
    };

    const isOccupied = (x, y) => {
      for (let i = 0; i < occupiedShapes.length; i += 1) {
        const shape = occupiedShapes[i];
        if (inside(x, y, shape, -16)) return true;
      }
      for (let i = 0; i < connections.length; i += 1) {
        const waypoints = Array.isArray(connections[i]?.waypoints) ? connections[i].waypoints : [];
        for (let j = 0; j < waypoints.length - 1; j += 1) {
          if (nearSegment(x, y, waypoints[j], waypoints[j + 1])) return true;
        }
      }
      return false;
    };

    const toScreen = (diagramX, diagramY) => ({
      x: Number(rect.left || 0) + (diagramX - Number(vb?.x || 0)) * scale,
      y: Number(rect.top || 0) + (diagramY - Number(vb?.y || 0)) * scale,
      diagramX,
      diagramY,
    });

    const minScreenX = Number(rect.left || 0) + 24;
    const maxScreenX = Number(rect.right || 0) - 24;
    const minScreenY = Number(rect.top || 0) + 24;
    const maxScreenY = Number(rect.bottom || 0) - 24;

    for (let screenY = minScreenY; screenY <= maxScreenY; screenY += 24) {
      for (let screenX = minScreenX; screenX <= maxScreenX; screenX += 24) {
        const diagramX = Number(vb?.x || 0) + (screenX - Number(rect.left || 0)) / scale;
        const diagramY = Number(vb?.y || 0) + (screenY - Number(rect.top || 0)) / scale;

        if (isOccupied(diagramX, diagramY)) continue;

        const inPool = poolContainers.some((el) => inside(diagramX, diagramY, el, 8));
        const inLane = lanes.length ? lanes.some((el) => inside(diagramX, diagramY, el, 8)) : inPool;

        if (zoneValue === "pool" && inPool) return toScreen(diagramX, diagramY);
        if (zoneValue === "lane" && inLane) return toScreen(diagramX, diagramY);
        if (zoneValue === "outside_pool" && !inPool) return toScreen(diagramX, diagramY);
      }
    }

    return null;
  }, zone);

  if (!out) {
    throw new Error(`empty_point_not_found:${zone}`);
  }

  return {
    x: Number(out.x || 0),
    y: Number(out.y || 0),
    diagramX: Number(out.diagramX || 0),
    diagramY: Number(out.diagramY || 0),
  };
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

async function readElementIdsByType(page, typeNeedle) {
  return await page.evaluate((needleRaw) => {
    const needle = String(needleRaw || "").trim().toLowerCase();
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return [];
    const registry = modeler.get("elementRegistry");
    const all = Array.isArray(registry?.getAll?.()) ? registry.getAll() : [];
    return all
      .filter((el) => !Array.isArray(el?.waypoints))
      .filter((el) => {
        const type = String(el?.type || el?.businessObject?.$type || "").toLowerCase();
        if (!type || type === "label" || type.includes(":label")) return false;
        return type.includes(needle);
      })
      .map((el) => String(el?.id || "").trim())
      .filter(Boolean);
  }, typeNeedle);
}

async function readElementBounds(page, elementId) {
  return await page.evaluate((idRaw) => {
    const id = String(idRaw || "").trim();
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler || !id) return null;
    const registry = modeler.get("elementRegistry");
    const element = registry?.get?.(id);
    if (!element) return null;
    if (Array.isArray(element?.waypoints)) return null;
    return {
      x: Number(element?.x || 0),
      y: Number(element?.y || 0),
      width: Number(element?.width || 0),
      height: Number(element?.height || 0),
    };
  }, elementId);
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

test("diagram context menu v1: narrowed pool/lane ownership + undo/redo", async ({ page, request }) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) => {
    runtimeErrors.push(String(error?.message || error || "unknown_page_error"));
  });

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const authUser = await readAuthUser(request, auth);
  const fixture = await createFixture(
    request,
    runId,
    auth.headers,
    seedPoolLaneXml({ processName: `ctx-v1-${runId}`, taskName: `Task ${runId.slice(-4)}` }),
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
  const undoBtn = page.getByTestId("diagram-toolbar-undo");
  const redoBtn = page.getByTestId("diagram-toolbar-redo");

  // Scenario A: empty area inside pool interior
  const poolPoint = await findEmptyCanvasPoint(page, "pool");
  await rightClickPoint(page, poolPoint);
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-undo")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-redo")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-create_task")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-undo")).toBeDisabled();
  await expect(page.getByTestId("bpmn-context-menu-action-redo")).toBeDisabled();
  const insidePoolProbe = await dispatchContextMenuAndReadDefaultPrevented(page, poolPoint);
  expect(insidePoolProbe?.defaultPrevented).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Scenario B: empty area inside lane interior
  const lanePoint = await findEmptyCanvasPoint(page, "lane");
  await rightClickPoint(page, lanePoint);
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-undo")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-redo")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Scenario C: empty area outside pools
  const outsidePoolPoint = await findEmptyCanvasPoint(page, "outside_pool");
  await rightClickPoint(page, outsidePoolPoint);
  await expect(menu).toHaveCount(0);
  const outsidePoolProbe = await dispatchContextMenuAndReadDefaultPrevented(page, outsidePoolPoint);
  expect(outsidePoolProbe?.defaultPrevented).toBe(false);

  // Scenario D: task element menu + duplicate safety
  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-add_next_step")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-undo")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-redo")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-duplicate")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Scenario E: visible Undo/Redo UI buttons, parity with Ctrl+Z / Ctrl+Y
  await expect(undoBtn).toBeVisible();
  await expect(redoBtn).toBeVisible();
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeDisabled();

  const initialTaskIds = await readElementIdsByType(page, "task");
  await rightClickPoint(page, lanePoint);
  await expect(menu).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-create_task").click();
  await expect(menu).toHaveCount(0);

  await expect.poll(async () => (await readElementIdsByType(page, "task")).length, { timeout: 10_000 }).toBe(initialTaskIds.length + 1);
  await expect(undoBtn).toBeEnabled();

  await rightClickPoint(page, lanePoint);
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-undo")).toBeEnabled();
  await expect(page.getByTestId("bpmn-context-menu-action-redo")).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.mouse.click(lanePoint.x, lanePoint.y);
  await page.keyboard.press("Control+KeyZ");
  await expect.poll(async () => (await readElementIdsByType(page, "task")).length, { timeout: 10_000 }).toBe(initialTaskIds.length);
  await expect(redoBtn).toBeEnabled();

  await page.keyboard.press("Control+KeyY");
  await expect.poll(async () => (await readElementIdsByType(page, "task")).length, { timeout: 10_000 }).toBe(initialTaskIds.length + 1);

  await undoBtn.click();
  await expect.poll(async () => (await readElementIdsByType(page, "task")).length, { timeout: 10_000 }).toBe(initialTaskIds.length);

  await redoBtn.click();
  await expect.poll(async () => (await readElementIdsByType(page, "task")).length, { timeout: 10_000 }).toBe(initialTaskIds.length + 1);

  // Scenario F: Undo/Redo from context menu follows same command stack behavior
  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-undo").click();
  await expect.poll(async () => (await readElementIdsByType(page, "task")).length, { timeout: 10_000 }).toBe(initialTaskIds.length);

  await rightClickElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-redo").click();
  await expect.poll(async () => (await readElementIdsByType(page, "task")).length, { timeout: 10_000 }).toBe(initialTaskIds.length + 1);

  // Scenario G: canvas create actions (task/gateway/start/end/subprocess/annotation)
  const createScenarios = [
    { actionId: "create_task", typeNeedle: "task" },
    { actionId: "create_gateway", typeNeedle: "gateway" },
    { actionId: "create_start_event", typeNeedle: "startevent" },
    { actionId: "create_end_event", typeNeedle: "endevent" },
    { actionId: "create_subprocess", typeNeedle: "subprocess" },
    { actionId: "add_annotation", typeNeedle: "textannotation" },
  ];

  for (const row of createScenarios) {
    const before = await readElementIdsByType(page, row.typeNeedle);
    let actionPoint = null;
    let actionButton = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = await findEmptyCanvasPoint(page, "lane");
      await rightClickPoint(page, candidate);
      const menuVisible = await menu.isVisible().catch(() => false);
      if (!menuVisible) continue;
      const button = page.getByTestId(`bpmn-context-menu-action-${row.actionId}`);
      const hasAction = (await button.count()) > 0;
      if (hasAction) {
        actionPoint = candidate;
        actionButton = button;
        break;
      }
      await page.keyboard.press("Escape");
    }
    if (!actionButton || !actionPoint) {
      throw new Error(`canvas_action_not_available:${row.actionId}`);
    }

    await actionButton.click();
    await expect(menu).toHaveCount(0);

    const after = await readElementIdsByType(page, row.typeNeedle);
    expect(after.length).toBeGreaterThan(before.length);

    const beforeSet = new Set(before);
    const createdIds = after.filter((id) => !beforeSet.has(id));
    const createdId = createdIds[createdIds.length - 1];
    expect(createdId).toBeTruthy();

    const bounds = await readElementBounds(page, createdId);
    expect(bounds).toBeTruthy();
    const cx = Number(bounds.x || 0) + Number(bounds.width || 0) / 2;
    const cy = Number(bounds.y || 0) + Number(bounds.height || 0) / 2;
    const distance = Math.hypot(cx - Number(actionPoint.diagramX || 0), cy - Number(actionPoint.diagramY || 0));
    expect(distance).toBeLessThan(320);

    for (let rollbackStep = 0; rollbackStep < 4; rollbackStep += 1) {
      const current = await readElementIdsByType(page, row.typeNeedle);
      if (current.length <= before.length) break;
      await undoBtn.click();
    }
    await expect.poll(async () => (await readElementIdsByType(page, row.typeNeedle)).length, { timeout: 10_000 }).toBe(before.length);
  }

  // Scenario H: label normalization stays valid
  await rightClickLabelOfElement(page, "Task_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-add_next_step")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-edit_label")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await expect.poll(async () => await setFlowLabel(page, "Flow_1", "route-a"), { timeout: 10_000 }).toBe(true);
  await rightClickLabelOfElement(page, "Flow_1");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-edit_label")).toBeVisible();
  await expect(page.getByTestId("bpmn-context-menu-action-add_next_step")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Scenario I: outside diagram scope keeps native browser menu
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
  const outsideNativeProbe = await dispatchContextMenuAndReadDefaultPrevented(page, outsidePoint);
  expect(outsideNativeProbe?.defaultPrevented).toBe(false);

  expect(runtimeErrors).toEqual([]);
});
