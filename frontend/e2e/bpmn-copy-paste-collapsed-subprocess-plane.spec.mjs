import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, switchTab } from "./helpers/processFixture.mjs";

function seedCollapsedSubprocessXml(runId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${runId}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Collapsed Paste ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="Collapsed Source">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1">
        <bpmn:outgoing>SubFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="InnerTask_1" name="Inner task">
        <bpmn:incoming>SubFlow_1</bpmn:incoming>
        <bpmn:outgoing>SubFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="SubEnd_1">
        <bpmn:incoming>SubFlow_2</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="SubFlow_1" sourceRef="SubStart_1" targetRef="InnerTask_1" />
      <bpmn:sequenceFlow id="SubFlow_2" sourceRef="InnerTask_1" targetRef="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:task id="Task_1" name="Neighbor task">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubProcess_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="false">
        <dc:Bounds x="260" y="128" width="180" height="110" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="540" y="143" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="260" y="183" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="183" />
        <di:waypoint x="540" y="183" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="SubProcess_1_diagram">
    <bpmndi:BPMNPlane id="SubProcess_1_plane" bpmnElement="SubProcess_1">
      <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1">
        <dc:Bounds x="120" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="220" y="98" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_1_di" bpmnElement="SubEnd_1">
        <dc:Bounds x="440" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="SubFlow_1_di" bpmnElement="SubFlow_1">
        <di:waypoint x="156" y="138" />
        <di:waypoint x="220" y="138" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SubFlow_2_di" bpmnElement="SubFlow_2">
        <di:waypoint x="360" y="138" />
        <di:waypoint x="440" y="138" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function waitDiagramReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return { ok: false, error: "modeler_missing" };
        const registry = modeler.get("elementRegistry");
        const element = registry?.get?.("SubProcess_1");
        return {
          ok: !!element,
          type: String(element?.businessObject?.$type || element?.type || ""),
          collapsed: element?.collapsed === true,
        };
      });
    })
    .toMatchObject({ ok: true, type: "bpmn:SubProcess", collapsed: true });
}

async function readRootsAndErrors(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const canvas = modeler.get("canvas");
    const registry = modeler.get("elementRegistry");
    let roots = [];
    let rootReadError = "";
    try {
      roots = typeof canvas?.getRootElements === "function"
        ? canvas.getRootElements().map((root) => ({
          id: String(root?.id || ""),
          boId: String(root?.businessObject?.id || ""),
          diId: String(root?.di?.id || ""),
        }))
        : [];
    } catch (error) {
      rootReadError = String(error?.message || error || "root_read_failed");
      const planeMap = canvas?._planes && typeof canvas._planes === "object" ? canvas._planes : {};
      roots = Object.keys(planeMap).map((key) => {
        const root = planeMap[key];
        return {
          id: String(root?.id || key || ""),
          boId: String(root?.businessObject?.id || ""),
          diId: String(root?.di?.id || ""),
        };
      });
    }
    return {
      ok: true,
      roots,
      rootReadError,
      undefinedPlaneCount: roots.filter((root) => root.id === "undefined_plane").length,
      duplicatePlaneErrors: Array.isArray(window.__FPC_E2E_COLLAPSED_PLANE_ERRORS__)
        ? window.__FPC_E2E_COLLAPSED_PLANE_ERRORS__.slice()
        : [],
      allIds: (typeof registry?.getAll === "function" ? registry.getAll() : []).map((element) => String(element?.id || "")),
    };
  });
}

async function readSelectionSummary(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const selected = modeler.get("selection")?.get?.()?.[0] || null;
    if (!selected) return { ok: false, error: "selection_empty" };
    return {
      ok: true,
      id: String(selected.id || ""),
      boId: String(selected.businessObject?.id || ""),
      x: Number(selected.x || 0),
      y: Number(selected.y || 0),
      collapsed: selected.collapsed === true,
    };
  });
}

async function dispatchShortcut(page, key) {
  await page.evaluate((shortcutKey) => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: String(shortcutKey || ""),
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  }, key);
}

async function forceSelection(page, elementId) {
  const result = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const selection = modeler.get("selection");
    const element = modeler.get("elementRegistry")?.get?.(String(targetId || ""));
    if (!element) return { ok: false, error: "element_missing" };
    selection?.select?.([element]);
    return {
      ok: true,
      selected: (selection?.get?.() || []).map((item) => String(item?.id || "")),
    };
  }, elementId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result;
}

async function clickByTestId(page, testId) {
  const result = await page.evaluate((targetTestId) => {
    const node = document.querySelector(`[data-testid="${String(targetTestId || "")}"]`);
    if (!(node instanceof HTMLElement)) return { ok: false, error: "node_missing" };
    node.focus?.();
    node.click();
    return { ok: true };
  }, testId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function openCopySubmenu(page) {
  const result = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="bpmn-context-menu-action-copy-submenu-trigger"]');
    if (!(node instanceof HTMLElement)) return { ok: false, error: "trigger_missing" };
    node.focus?.();
    node.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new FocusEvent("focusin", { bubbles: true, cancelable: true }));
    return { ok: true };
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function moveElementById(page, elementId, dx, dy) {
  const result = await page.evaluate(({ targetId, moveX, moveY }) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const element = registry?.get?.(String(targetId || ""));
      if (!element) return { ok: false, error: "element_missing" };
      const before = { x: Number(element.x || 0), y: Number(element.y || 0) };
      modeling.moveElements([element], { x: Number(moveX || 0), y: Number(moveY || 0) }, element.parent);
      return {
        ok: true,
        before,
        after: { x: Number(element.x || 0), y: Number(element.y || 0) },
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { targetId: elementId, moveX: dx, moveY: dy });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result;
}

async function persistXmlAndReload(page, request, sessionId, headers, testedUrl) {
  const result = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler || typeof modeler.saveXML !== "function") {
      return { ok: false, error: "modeler_missing" };
    }
    try {
      const out = await modeler.saveXML({ format: true });
      return { ok: true, xml: String(out?.xml || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml: String(result.xml || "") },
  });
  expect(putRes.ok(), `persist xml: ${await putRes.text()}`).toBeTruthy();
  await page.goto(testedUrl);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);
  return result.xml;
}

test("collapsed subprocess copy/paste keeps valid plane identity and move behavior", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedCollapsedSubprocessXml(runId));
  const testedUrl = `/app?project=${fixture.projectId}&session=${fixture.sessionId}`;
  console.log(`[COLLAPSED_SUBPROCESS_FIXTURE] url=${testedUrl}`);

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_E2E_COLLAPSED_PLANE_ERRORS__ = [];
    window.addEventListener("error", (event) => {
      const message = String(event?.error?.message || event?.message || "");
      if (message) {
        window.__FPC_E2E_COLLAPSED_PLANE_ERRORS__.push(message);
      }
    });
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(testedUrl);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);

  const beforeRoots = await readRootsAndErrors(page);
  expect(beforeRoots.ok, JSON.stringify(beforeRoots)).toBeTruthy();
  expect(beforeRoots.undefinedPlaneCount).toBe(0);

  const sourceShape = page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='SubProcess_1']").first();
  await expect(sourceShape).toBeVisible();
  await sourceShape.click({ force: true });
  await forceSelection(page, "SubProcess_1");
  await dispatchShortcut(page, "c");
  await dispatchShortcut(page, "v");

  await expect.poll(async () => {
    const probe = await readSelectionSummary(page);
    if (!probe.ok) return probe;
    return probe.id !== "SubProcess_1" ? probe : { ...probe, ok: false, error: "selection_not_replaced" };
  }).toMatchObject({
    ok: true,
    collapsed: true,
  });

  const afterKeyboardRoots = await readRootsAndErrors(page);
  expect(afterKeyboardRoots.undefinedPlaneCount).toBe(0);
  expect(afterKeyboardRoots.duplicatePlaneErrors).toEqual([]);
  const keyboardSelection = await readSelectionSummary(page);
  expect(keyboardSelection.id).not.toBe("SubProcess_1");
  expect(afterKeyboardRoots.roots.some((root) => root.id === `${keyboardSelection.boId}_plane`)).toBeTruthy();

  await sourceShape.click({ button: "right", force: true });
  await expect(page.getByTestId("bpmn-context-menu-action-copy-submenu-trigger")).toBeVisible();
  await openCopySubmenu(page);
  await expect(page.getByTestId("bpmn-context-menu-copy-submenu")).toBeVisible();
  await clickByTestId(page, "bpmn-context-menu-action-copy_element");

  await sourceShape.click({ button: "right", force: true });
  await expect(page.getByTestId("bpmn-context-menu-action-paste")).toBeVisible();
  await clickByTestId(page, "bpmn-context-menu-action-paste");

  await expect.poll(async () => {
    const probe = await readSelectionSummary(page);
    if (!probe.ok) return probe;
    if (!probe.id || probe.id === "SubProcess_1" || probe.id === keyboardSelection.id) {
      return { ...probe, ok: false, error: "menu_paste_selection_not_ready" };
    }
    return probe;
  }).toMatchObject({
    ok: true,
    collapsed: true,
  });

  const afterMenuRoots = await readRootsAndErrors(page);
  expect(afterMenuRoots.undefinedPlaneCount).toBe(0);
  expect(afterMenuRoots.duplicatePlaneErrors).toEqual([]);
  const menuSelection = await readSelectionSummary(page);
  expect(afterMenuRoots.roots.some((root) => root.id === `${menuSelection.boId}_plane`)).toBeTruthy();

  const moveKeyboard = await moveElementById(page, keyboardSelection.id, 40, 20);
  expect(moveKeyboard.after.x).toBeGreaterThan(moveKeyboard.before.x);
  const moveSource = await moveElementById(page, "SubProcess_1", 30, 10);
  expect(moveSource.after.x).toBeGreaterThan(moveSource.before.x);
  const moveOther = await moveElementById(page, "Task_1", 20, 10);
  expect(moveOther.after.x).toBeGreaterThan(moveOther.before.x);

  const localXml = await persistXmlAndReload(page, request, fixture.sessionId, auth.headers, testedUrl);
  expect(localXml.includes("undefined_plane")).toBeFalsy();
  expect(localXml.includes("undefined_di")).toBeFalsy();
  expect(localXml.includes(`bpmnElement="${keyboardSelection.boId}"`)).toBeTruthy();
  expect(localXml.includes(`bpmnElement="${menuSelection.boId}"`)).toBeTruthy();

  const afterReloadRoots = await readRootsAndErrors(page);
  expect(afterReloadRoots.undefinedPlaneCount).toBe(0);
  expect(afterReloadRoots.duplicatePlaneErrors).toEqual([]);
  expect(afterReloadRoots.rootReadError).toBe("");

  expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  expect(consoleErrors.filter((text) => /undefined_plane|already exists/i.test(String(text || ""))), JSON.stringify(consoleErrors)).toEqual([]);
});
