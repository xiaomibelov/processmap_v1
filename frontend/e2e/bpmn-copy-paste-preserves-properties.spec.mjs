import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  switchTab,
} from "./helpers/processFixture.mjs";

function responsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function parseRobotMetaJson(raw) {
  try {
    return raw ? JSON.parse(String(raw)) : null;
  } catch {
    return { raw: String(raw || "") };
  }
}

function seedRichCopyXml(runId) {
  const sourceName = `Copy Source ${runId}`;
  const robotMetaJson = JSON.stringify({
    robot_meta_version: "v1",
    exec: {
      mode: "machine",
      executor: "manual_ui",
      action_key: "approve",
      timeout_sec: 30,
      retry: { max_attempts: 1, backoff_sec: 0 },
    },
    mat: { from_zone: null, to_zone: null, inputs: [], outputs: [] },
    qc: { critical: false, checks: [] },
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:pm="http://processmap.ai/schema/bpmn/1.0"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Copy Paste ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="${sourceName}">
      <bpmn:documentation textFormat="text/plain">copy-doc-text</bpmn:documentation>
      <bpmn:extensionElements>
        <camunda:Properties>
          <camunda:Property name="priority" value="high" />
        </camunda:Properties>
        <pm:RobotMeta version="v1">${robotMetaJson}</pm:RobotMeta>
      </bpmn:extensionElements>
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
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="280" y="138" width="180" height="88" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="560" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="178" />
        <di:waypoint x="280" y="182" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="182" />
        <di:waypoint x="560" y="178" />
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
        if (!modeler) return { ok: false, reason: "modeler_missing" };
        const registry = modeler.get("elementRegistry");
        const task = registry?.get?.("Task_1");
        const svg = document.querySelector(".bpmnStageHost .djs-container svg");
        const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
        return {
          ok: !!task && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0,
          taskType: String(task?.businessObject?.$type || task?.type || ""),
        };
      });
    })
    .toMatchObject({ ok: true, taskType: "bpmn:UserTask" });
}

async function selectSourceTask(page) {
  const result = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const registry = modeler.get("elementRegistry");
    const selection = modeler.get("selection");
    const task = registry?.get?.("Task_1");
    if (!task) return { ok: false, error: "task_missing" };
    selection?.select?.([task]);
    return { ok: true };
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function readTaskSummary(page, elementId) {
  return await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const registry = modeler.get("elementRegistry");
    const element = registry?.get?.(String(targetId || ""));
    if (!element) return { ok: false, error: "element_missing" };
    const bo = element.businessObject || {};
    const extValues = Array.isArray(bo?.extensionElements?.values) ? bo.extensionElements.values : [];
    let camundaPriority = "";
    let robotMetaJson = "";
    extValues.forEach((entry) => {
      const type = String(entry?.$type || entry?.type || "").trim();
      if (/camunda:properties$/i.test(type)) {
        const prop = (Array.isArray(entry?.values) ? entry.values : []).find((item) => String(item?.name || "").trim() === "priority");
        if (prop) camundaPriority = String(prop?.value || "");
      }
      if (/pm:robotmeta$/i.test(type)) {
        robotMetaJson = String(entry?.json || "");
      }
    });
    return {
      ok: true,
      id: String(element.id || ""),
      businessObjectId: String(bo.id || ""),
      type: String(bo.$type || element.type || ""),
      x: Number(element.x || 0),
      y: Number(element.y || 0),
      width: Number(element.width || 0),
      height: Number(element.height || 0),
      diId: String(element.di?.id || ""),
      name: String(bo.name || ""),
      documentation: (Array.isArray(bo.documentation) ? bo.documentation : []).map((doc) => String(doc?.text || "")),
      camundaPriority,
      robotMetaJson,
    };
  }, elementId);
}

async function readSelectionSummary(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const selected = (modeler.get("selection")?.get?.() || [])[0] || null;
    if (!selected) return { ok: false, error: "selection_empty" };
    const registry = modeler.get("elementRegistry");
    const bo = selected.businessObject || {};
    const extValues = Array.isArray(bo?.extensionElements?.values) ? bo.extensionElements.values : [];
    let camundaPriority = "";
    let robotMetaJson = "";
    extValues.forEach((entry) => {
      const type = String(entry?.$type || entry?.type || "").trim();
      if (/camunda:properties$/i.test(type)) {
        const prop = (Array.isArray(entry?.values) ? entry.values : []).find((item) => String(item?.name || "").trim() === "priority");
        if (prop) camundaPriority = String(prop?.value || "");
      }
      if (/pm:robotmeta$/i.test(type)) {
        robotMetaJson = String(entry?.json || "");
      }
    });
    const taskCount = (registry?.filter?.((el) => /task$/i.test(String(el?.type || el?.businessObject?.$type || ""))) || []).length;
    return {
      ok: true,
      id: String(selected.id || ""),
      businessObjectId: String(bo.id || ""),
      diId: String(selected.di?.id || ""),
      x: Number(selected.x || 0),
      y: Number(selected.y || 0),
      name: String(bo.name || ""),
      documentation: (Array.isArray(bo.documentation) ? bo.documentation : []).map((doc) => String(doc?.text || "")),
      camundaPriority,
      robotMetaJson,
      taskCount,
    };
  });
}

async function readModelerXml(page) {
  const result = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler || typeof modeler.saveXML !== "function") {
      return { ok: false, error: "modeler_missing" };
    }
    const collectTaskDump = () => {
      const registry = modeler.get?.("elementRegistry");
      const all = typeof registry?.getAll === "function" ? registry.getAll() : [];
      return all
        .filter((element) => /task$/i.test(String(element?.type || element?.businessObject?.$type || "")))
        .map((element) => {
          const bo = element?.businessObject || {};
          const values = Array.isArray(bo?.extensionElements?.values) ? bo.extensionElements.values : [];
          return {
            id: String(element?.id || ""),
            businessObjectId: String(bo?.id || ""),
            name: String(bo?.name || ""),
            extensionValues: values.map((entry) => ({
              type: String(entry?.$type || entry?.type || ""),
              hasDescriptor: !!entry?.$descriptor,
              hasModel: !!entry?.$model,
              keys: Object.keys(entry || {}),
              json: String(entry?.json || ""),
              values: Array.isArray(entry?.values)
                ? entry.values.map((item) => ({
                  type: String(item?.$type || item?.type || ""),
                  hasDescriptor: !!item?.$descriptor,
                  keys: Object.keys(item || {}),
                  name: String(item?.name || ""),
                  value: String(item?.value || ""),
                }))
                : null,
            })),
          };
        });
    };
    try {
      const out = await modeler.saveXML({ format: true });
      return { ok: true, xml: String(out?.xml || "") };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || error || "save_xml_failed"),
        debugTasks: collectTaskDump(),
      };
    }
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return String(result.xml || "");
}

async function persistXmlAndFetchRaw(request, sid, headers, xml) {
  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}/bpmn`, {
    headers,
    data: { xml: String(xml || "") },
  });
  expect(putRes.ok(), `persist xml: ${await putRes.text()}`).toBeTruthy();
  const xmlRes = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}/bpmn?raw=1`, {
    headers,
  });
  expect(xmlRes.ok(), `fetch raw xml after save: ${await xmlRes.text()}`).toBeTruthy();
  return await xmlRes.text();
}

test("BPMN copy/paste preserves semantic properties for keyboard and context menu flows", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedRichCopyXml(runId));
  const testedUrl = `/app?project=${fixture.projectId}&session=${fixture.sessionId}`;
  console.log(`[COPY_PASTE_FIXTURE] url=${testedUrl}`);

  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error));
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(testedUrl);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);

  const sourceBefore = await readTaskSummary(page, "Task_1");
  expect(sourceBefore.ok, JSON.stringify(sourceBefore)).toBeTruthy();
  expect(sourceBefore.documentation).toContain("copy-doc-text");
  expect(sourceBefore.robotMetaJson).toContain("\"robot_meta_version\":\"v1\"");
  const expectedRobotMeta = parseRobotMetaJson(sourceBefore.robotMetaJson);

  await selectSourceTask(page);
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");

  const keyboardPaste = await expect.poll(async () => {
    const probe = await readSelectionSummary(page);
    if (!probe.ok) return probe;
    return probe.id !== "Task_1" ? probe : { ...probe, ok: false, error: "selection_not_replaced" };
  }).toMatchObject({
    ok: true,
    name: sourceBefore.name,
    camundaPriority: "high",
  });

  const keyboardSummary = await readSelectionSummary(page);
  expect(keyboardSummary.id).not.toBe("Task_1");
  expect(keyboardSummary.businessObjectId).toBeTruthy();
  expect(keyboardSummary.businessObjectId).not.toBe("Task_1");
  expect(keyboardSummary.documentation).toContain("copy-doc-text");
  expect(parseRobotMetaJson(keyboardSummary.robotMetaJson)).toEqual(expectedRobotMeta);
  expect(keyboardSummary.x).toBeGreaterThan(sourceBefore.x);

  const sourceShape = page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='Task_1']").first();
  await expect(sourceShape).toBeVisible();

  await sourceShape.click({ button: "right", force: true });
  await expect(page.getByTestId("bpmn-context-menu-action-copy-submenu-trigger")).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-copy-submenu-trigger").hover();
  await expect(page.getByTestId("bpmn-context-menu-copy-submenu")).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-copy_element").click();

  await sourceShape.click({ button: "right", force: true });
  await expect(page.getByTestId("bpmn-context-menu-action-paste")).toBeVisible();
  await page.getByTestId("bpmn-context-menu-action-paste").click();

  const menuSummary = await expect.poll(async () => {
    const probe = await readSelectionSummary(page);
    if (!probe.ok) return probe;
    if (!probe.id || probe.id === "Task_1" || probe.id === keyboardSummary.id) {
      return { ...probe, ok: false, error: "menu_paste_selection_not_ready" };
    }
    return probe;
  }).toMatchObject({
    ok: true,
    name: sourceBefore.name,
    camundaPriority: "high",
  });

  const menuPaste = await readSelectionSummary(page);
  expect(menuPaste.id).not.toBe("Task_1");
  expect(menuPaste.id).not.toBe(keyboardSummary.id);
  expect(menuPaste.businessObjectId).toBeTruthy();
  expect(menuPaste.businessObjectId).not.toBe("Task_1");
  expect(menuPaste.businessObjectId).not.toBe(keyboardSummary.businessObjectId);
  expect(menuPaste.documentation).toContain("copy-doc-text");
  expect(parseRobotMetaJson(menuPaste.robotMetaJson)).toEqual(expectedRobotMeta);
  expect(menuPaste.x).toBeGreaterThan(sourceBefore.x);

  const localXml = await readModelerXml(page);
  expect(localXml.includes(keyboardSummary.businessObjectId), "modeler xml should include keyboard pasted BPMN id").toBeTruthy();
  expect(localXml.includes(menuPaste.businessObjectId), "modeler xml should include context-menu pasted BPMN id").toBeTruthy();
  const savedXml = await persistXmlAndFetchRaw(request, fixture.sessionId, auth.headers, localXml);
  expect(savedXml.includes(keyboardSummary.businessObjectId), "saved xml should include keyboard pasted BPMN id").toBeTruthy();
  expect(savedXml.includes(menuPaste.businessObjectId), "saved xml should include context-menu pasted BPMN id").toBeTruthy();
  expect((savedXml.match(/copy-doc-text/g) || []).length).toBeGreaterThanOrEqual(3);
  expect((savedXml.match(/name="priority" value="high"/g) || []).length).toBeGreaterThanOrEqual(3);
  expect((savedXml.match(/<pm:RobotMeta version="v1">/g) || []).length).toBeGreaterThanOrEqual(3);

  await page.goto(testedUrl);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);

  const keyboardReloaded = await readTaskSummary(page, keyboardSummary.businessObjectId);
  const menuReloaded = await readTaskSummary(page, menuPaste.businessObjectId);
  expect(keyboardReloaded.ok, JSON.stringify(keyboardReloaded)).toBeTruthy();
  expect(menuReloaded.ok, JSON.stringify(menuReloaded)).toBeTruthy();
  expect(keyboardReloaded.documentation).toContain("copy-doc-text");
  expect(menuReloaded.documentation).toContain("copy-doc-text");
  expect(keyboardReloaded.camundaPriority).toBe("high");
  expect(menuReloaded.camundaPriority).toBe("high");
  expect(parseRobotMetaJson(keyboardReloaded.robotMetaJson)).toEqual(expectedRobotMeta);
  expect(parseRobotMetaJson(menuReloaded.robotMetaJson)).toEqual(expectedRobotMeta);

  expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});
