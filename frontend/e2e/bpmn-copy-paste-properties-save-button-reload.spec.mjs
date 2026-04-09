import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  switchTab,
} from "./helpers/processFixture.mjs";

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

function parseRobotMetaJson(raw) {
  try {
    return raw ? JSON.parse(String(raw)) : null;
  } catch {
    return { raw: String(raw || "") };
  }
}

function expectRobotMetaEssentials(metaRaw) {
  expect(parseRobotMetaJson(metaRaw)).toMatchObject({
    robot_meta_version: "v1",
    exec: {
      mode: "machine",
      executor: "manual_ui",
      action_key: "approve",
      timeout_sec: 30,
    },
  });
}

async function waitDiagramReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        const registry = modeler?.get?.("elementRegistry");
        const task = registry?.get?.("Task_1");
        return {
          ok: !!task,
          taskType: String(task?.businessObject?.$type || task?.type || ""),
        };
      });
    })
    .toMatchObject({ ok: true, taskType: "bpmn:UserTask" });
}

async function selectSourceTask(page) {
  const result = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.("elementRegistry");
    const selection = modeler?.get?.("selection");
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
    const registry = modeler?.get?.("elementRegistry");
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
    const selected = modeler?.get?.("selection")?.get?.()?.[0] || null;
    if (!selected) return { ok: false, error: "selection_empty" };
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
    return {
      ok: true,
      id: String(selected.id || ""),
      businessObjectId: String(bo.id || ""),
      name: String(bo.name || ""),
      documentation: (Array.isArray(bo.documentation) ? bo.documentation : []).map((doc) => String(doc?.text || "")),
      camundaPriority,
      robotMetaJson,
    };
  });
}

async function readModelerXml(page) {
  const result = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const out = await modeler.saveXML({ format: true });
    return { ok: true, xml: String(out?.xml || "") };
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return String(result.xml || "");
}

async function readLastSaveProbe(page) {
  return await page.evaluate(() => {
    const probe = window.__FPC_E2E_LAST_SAVE_PROBE__;
    return probe && typeof probe === "object" ? probe : null;
  });
}

async function saveAndWaitPersist(page) {
  const putBodies = [];
  const onRequest = (request) => {
    if (request.method() !== "PUT") return;
    if (!/\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(request.url())) return;
    try {
      const payload = request.postDataJSON();
      putBodies.push({
        xml: String(payload?.xml || ""),
        sourceAction: String(payload?.source_action || ""),
        rev: Number(payload?.rev || 0),
      });
    } catch {
      putBodies.push({
        xml: "",
        sourceAction: "",
        rev: 0,
      });
    }
  };
  page.on("request", onRequest);
  const responsePromise = page.waitForResponse((resp) => (
    resp.request().method() === "PUT"
    && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
    && resp.status() === 200
    && (() => {
      try {
        return String(resp.request().postDataJSON()?.source_action || "") === "publish_manual_save";
      } catch {
        return false;
      }
    })()
  ));
  const saveBtn = page.locator("button.processSaveBtn").first()
    .or(page.getByRole("button", { name: /Сохранить/ }).first());
  await expect(saveBtn.first()).toBeVisible();
  await saveBtn.first().click();
  await responsePromise;
  await page.waitForTimeout(1200);
  page.off("request", onRequest);
  const publishPayload = [...putBodies].reverse().find((entry) => entry?.sourceAction === "publish_manual_save") || null;
  return {
    putBodies,
    outboundXml: String((publishPayload || putBodies[putBodies.length - 1] || {}).xml || ""),
    outboundSourceAction: String((publishPayload || putBodies[putBodies.length - 1] || {}).sourceAction || ""),
  };
}

test("simple copied task keeps properties after save button and reload", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedRichCopyXml(runId));
  const testedUrl = `/app?project=${fixture.projectId}&session=${fixture.sessionId}`;

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));

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
  expect(sourceBefore.camundaPriority).toBe("high");
  expectRobotMetaEssentials(sourceBefore.robotMetaJson);

  await selectSourceTask(page);
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

  await expect.poll(async () => {
    const probe = await readSelectionSummary(page);
    if (!probe.ok) return probe;
    if (!probe.id || probe.id === "Task_1") {
      return { ...probe, ok: false, error: "copy_not_selected" };
    }
    return probe;
  }).toMatchObject({
    ok: true,
    name: sourceBefore.name,
    camundaPriority: "high",
  });

  const copied = await readSelectionSummary(page);
  expect(copied.documentation).toContain("copy-doc-text");
  expectRobotMetaEssentials(copied.robotMetaJson);

  const preSaveXml = await readModelerXml(page);
  expect((preSaveXml.match(/copy-doc-text/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((preSaveXml.match(/name="priority" value="high"/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((preSaveXml.match(/<pm:RobotMeta version="v1">/g) || []).length).toBeGreaterThanOrEqual(2);

  const saveTrace = await saveAndWaitPersist(page);
  const saveProbe = await readLastSaveProbe(page);
  expect(saveTrace.outboundSourceAction).toBe("publish_manual_save");
  expect((String(saveProbe?.beforeFlushXml || "").match(/<pm:RobotMeta version="v1">/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((String(saveProbe?.rawOut || "").match(/<pm:RobotMeta version="v1">/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((String(saveProbe?.transformedOut || "").match(/<pm:RobotMeta version="v1">/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((saveTrace.outboundXml.match(/copy-doc-text/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((saveTrace.outboundXml.match(/name="priority" value="high"/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((saveTrace.outboundXml.match(/<pm:RobotMeta version="v1">/g) || []).length).toBeGreaterThanOrEqual(2);

  const persistedRes = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn?raw=1`, {
    headers: auth.headers,
  });
  expect(persistedRes.ok(), `fetch raw xml: ${await persistedRes.text()}`).toBeTruthy();
  const persistedXml = await persistedRes.text();
  expect((persistedXml.match(/copy-doc-text/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((persistedXml.match(/name="priority" value="high"/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((persistedXml.match(/<pm:RobotMeta version="v1">/g) || []).length).toBeGreaterThanOrEqual(2);

  await page.goto(testedUrl);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);

  const reopened = await readTaskSummary(page, copied.businessObjectId);
  expect(reopened.ok, JSON.stringify(reopened)).toBeTruthy();
  expect(reopened.documentation).toContain("copy-doc-text");
  expect(reopened.camundaPriority).toBe("high");
  expectRobotMetaEssentials(reopened.robotMetaJson);
  expect(pageErrors).toEqual([]);
});
