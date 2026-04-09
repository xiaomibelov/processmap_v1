import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, switchTab } from "./helpers/processFixture.mjs";

function seedExpandedSubprocessXml(runId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_${runId}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Expanded Save ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="Expanded Source">
      <bpmn:documentation>subprocess-doc-text</bpmn:documentation>
      <bpmn:extensionElements>
        <camunda:Properties>
          <camunda:Property name="subprocPriority" value="high" />
        </camunda:Properties>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1">
        <bpmn:outgoing>SubFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="InnerTask_1" name="Inner task">
        <bpmn:documentation>inner-doc-text</bpmn:documentation>
        <bpmn:extensionElements>
          <camunda:Properties>
            <camunda:Property name="innerPriority" value="critical" />
          </camunda:Properties>
        </bpmn:extensionElements>
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
        <dc:Bounds x="160" y="200" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true">
        <dc:Bounds x="260" y="88" width="420" height="260" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1">
        <dc:Bounds x="320" y="190" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="410" y="168" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_1_di" bpmnElement="SubEnd_1">
        <dc:Bounds x="610" y="190" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="780" y="178" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="218" />
        <di:waypoint x="260" y="218" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="680" y="218" />
        <di:waypoint x="780" y="218" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SubFlow_1_di" bpmnElement="SubFlow_1">
        <di:waypoint x="356" y="208" />
        <di:waypoint x="410" y="208" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SubFlow_2_di" bpmnElement="SubFlow_2">
        <di:waypoint x="550" y="208" />
        <di:waypoint x="610" y="208" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function waitDiagramReady(page) {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const registry = modeler?.get?.("elementRegistry");
      const element = registry?.get?.("SubProcess_1");
      return {
        ok: !!element,
        type: String(element?.businessObject?.$type || element?.type || ""),
        expanded: element?.collapsed !== true,
      };
    });
  }).toMatchObject({ ok: true, type: "bpmn:SubProcess", expanded: true });
}

async function selectElement(page, elementId) {
  const result = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.("elementRegistry");
    const selection = modeler?.get?.("selection");
    const element = registry?.get?.(String(targetId || ""));
    if (!element) return { ok: false, error: "element_missing" };
    selection?.select?.([element]);
    return { ok: true };
  }, elementId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function readSubprocessSummary(page, elementId = "") {
  return await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const registry = modeler.get("elementRegistry");
    const selection = modeler.get("selection");
    const selected = targetId
      ? registry?.get?.(String(targetId || ""))
      : (selection?.get?.() || [])[0] || null;
    if (!selected) return { ok: false, error: "selection_missing" };
    const bo = selected.businessObject || {};
    const flowElements = Array.isArray(bo.flowElements) ? bo.flowElements : [];
    const innerNodes = flowElements.filter((item) => !/sequenceflow$/i.test(String(item?.$type || item?.type || "")));
    const innerFlows = flowElements.filter((item) => /sequenceflow$/i.test(String(item?.$type || item?.type || "")));
    const renderedChildren = (registry?.getAll?.() || []).filter((item) => String(item?.parent?.id || "") === String(selected?.id || ""));
    const renderedChildTasks = renderedChildren.filter((item) => /task$/i.test(String(item?.businessObject?.$type || item?.type || "")));
    const innerTask = innerNodes.find((item) => /task$/i.test(String(item?.$type || item?.type || ""))) || null;
    const innerTaskExt = Array.isArray(innerTask?.extensionElements?.values) ? innerTask.extensionElements.values : [];
    let innerPriority = "";
    innerTaskExt.forEach((entry) => {
      const type = String(entry?.$type || entry?.type || "");
      if (!/camunda:properties$/i.test(type)) return;
      const prop = (Array.isArray(entry?.values) ? entry.values : []).find((item) => String(item?.name || "") === "innerPriority");
      if (prop) innerPriority = String(prop?.value || "");
    });
    return {
      ok: true,
      id: String(selected.id || ""),
      businessObjectId: String(bo.id || ""),
      name: String(bo.name || ""),
      docs: (Array.isArray(bo.documentation) ? bo.documentation : []).map((item) => String(item?.text || "")),
      isExpanded: selected.collapsed !== true,
      innerNodeCount: innerNodes.length,
      innerFlowCount: innerFlows.length,
      innerTaskNames: innerNodes
        .filter((item) => /task$/i.test(String(item?.$type || item?.type || "")))
        .map((item) => String(item?.name || item?.id || "")),
      renderedChildCount: renderedChildren.length,
      renderedChildTaskCount: renderedChildTasks.length,
      innerPriority,
      innerDocs: (Array.isArray(innerTask?.documentation) ? innerTask.documentation : []).map((item) => String(item?.text || "")),
    };
  }, elementId);
}

async function readModelerXml(page) {
  const result = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler || typeof modeler.saveXML !== "function") {
      return { ok: false, error: "modeler_missing" };
    }
    try {
      const out = await modeler.saveXML({ format: true });
      return { ok: true, xml: String(out?.xml || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error || "save_xml_failed") };
    }
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return String(result.xml || "");
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

test("expanded subprocess copy preserves subtree and properties after save and reload", async ({ page, request }) => {
  test.setTimeout(45_000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedExpandedSubprocessXml(runId));
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

  const sourceShape = page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='SubProcess_1']").first();
  await expect(sourceShape).toBeVisible();
  await sourceShape.click({ force: true });
  await selectElement(page, "SubProcess_1");

  const before = await readSubprocessSummary(page);
  expect(before.ok, JSON.stringify(before)).toBeTruthy();
  expect(before.docs).toContain("subprocess-doc-text");
  expect(before.innerNodeCount).toBe(3);
  expect(before.innerFlowCount).toBe(2);
  expect(before.innerTaskNames).toContain("Inner task");
  expect(before.innerPriority).toBe("critical");
  expect(before.innerDocs).toContain("inner-doc-text");

  await dispatchShortcut(page, "c");
  await dispatchShortcut(page, "v");

  await expect.poll(async () => {
    const probe = await readSubprocessSummary(page);
    if (!probe.ok) return probe;
    if (!probe.id || probe.id === "SubProcess_1") {
      return { ...probe, ok: false, error: "copy_not_selected" };
    }
    return probe;
  }, { timeout: 8_000 }).toMatchObject({
    ok: true,
    name: "Expanded Source",
    isExpanded: true,
    innerTaskNames: ["Inner task"],
  });

  const copied = await readSubprocessSummary(page);
  expect(copied.id).not.toBe("SubProcess_1");
  expect(copied.docs).toContain("subprocess-doc-text");
  expect(copied.innerNodeCount).toBe(3);
  expect(copied.innerFlowCount).toBe(2);
  expect(copied.innerPriority).toBe("critical");
  expect(copied.innerDocs).toContain("inner-doc-text");
  expect(copied.renderedChildTaskCount).toBeGreaterThanOrEqual(1);

  const preSaveXml = await readModelerXml(page);
  expect((preSaveXml.match(/name="Inner task"/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((preSaveXml.match(/inner-doc-text/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((preSaveXml.match(/name="innerPriority" value="critical"/g) || []).length).toBeGreaterThanOrEqual(2);

  const saveTrace = await saveAndWaitPersist(page);
  expect(saveTrace.outboundSourceAction).toBe("publish_manual_save");
  expect((saveTrace.outboundXml.match(/name="Inner task"/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((saveTrace.outboundXml.match(/inner-doc-text/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((saveTrace.outboundXml.match(/name="innerPriority" value="critical"/g) || []).length).toBeGreaterThanOrEqual(2);

  const persistedRes = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn?raw=1`, {
    headers: auth.headers,
  });
  expect(persistedRes.ok(), `fetch raw xml: ${await persistedRes.text()}`).toBeTruthy();
  const persistedXml = await persistedRes.text();
  expect((persistedXml.match(/name="Inner task"/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((persistedXml.match(/inner-doc-text/g) || []).length).toBeGreaterThanOrEqual(2);
  expect((persistedXml.match(/name="innerPriority" value="critical"/g) || []).length).toBeGreaterThanOrEqual(2);

  await page.goto(testedUrl);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);

  await expect.poll(async () => {
    const probe = await readSubprocessSummary(page, copied.businessObjectId);
    return probe.ok ? probe : null;
  }, { timeout: 8_000 }).not.toBeNull();

  const reopenedSummary = await readSubprocessSummary(page, copied.businessObjectId);
  expect(reopenedSummary.ok, JSON.stringify(reopenedSummary)).toBeTruthy();
  expect(reopenedSummary.innerNodeCount).toBe(3);
  expect(reopenedSummary.innerFlowCount).toBe(2);
  expect(reopenedSummary.innerTaskNames).toContain("Inner task");
  expect(reopenedSummary.innerPriority).toBe("critical");
  expect(reopenedSummary.innerDocs).toContain("inner-doc-text");
  expect(pageErrors).toEqual([]);
});
