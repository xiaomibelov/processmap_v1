import { expect, test } from '@playwright/test';

import { apiLogin, setUiToken } from './helpers/e2eAuth.mjs';
import { API_BASE, createFixture, switchTab } from './helpers/processFixture.mjs';

function seedCollapsedSubprocessIoXml(runId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_${runId}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Collapsed Save ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:dataStoreReference id="DataStoreReference_1" name="Store" />
    <bpmn:subProcess id="SubProcess_1" name="Collapsed Source">
      <bpmn:documentation>copy-doc-text</bpmn:documentation>
      <bpmn:extensionElements>
        <camunda:Properties>
          <camunda:Property name="ingredient" value="soup" />
        </camunda:Properties>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:property id="Property_1" name="__targetRef_placeholder" />
      <bpmn:dataInputAssociation id="DataInputAssociation_1">
        <bpmn:sourceRef>DataStoreReference_1</bpmn:sourceRef>
        <bpmn:targetRef>Property_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
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
      <bpmndi:BPMNShape id="DataStoreReference_1_di" bpmnElement="DataStoreReference_1">
        <dc:Bounds x="250" y="300" width="50" height="50" />
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
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const registry = modeler?.get?.('elementRegistry');
      const element = registry?.get?.('SubProcess_1');
      return {
        ok: !!element,
        type: String(element?.businessObject?.$type || element?.type || ''),
        collapsed: element?.collapsed === true,
      };
    });
  }).toMatchObject({ ok: true, type: 'bpmn:SubProcess', collapsed: true });
}

async function selectElement(page, elementId) {
  const result = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.('elementRegistry');
    const selection = modeler?.get?.('selection');
    const element = registry?.get?.(String(targetId || ''));
    if (!element) return { ok: false, error: 'element_missing' };
    selection?.select?.([element]);
    return { ok: true };
  }, elementId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
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

async function readSelectionSummary(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const selected = modeler?.get?.('selection')?.get?.()?.[0] || null;
    if (!selected) return { ok: false, error: 'selection_empty' };
    return {
      ok: true,
      id: String(selected.id || ''),
      boId: String(selected.businessObject?.id || ''),
      name: String(selected.businessObject?.name || ''),
      docs: (Array.isArray(selected.businessObject?.documentation) ? selected.businessObject.documentation : []).map((d) => String(d?.text || '')),
      collapsed: selected.collapsed === true,
    };
  });
}

async function readElementSummary(page, elementId) {
  return await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.('elementRegistry');
    const element = registry?.get?.(String(targetId || '')) || null;
    if (!element) return { ok: false, error: 'element_missing' };
    return {
      ok: true,
      id: String(element.id || ''),
      boId: String(element.businessObject?.id || ''),
      name: String(element.businessObject?.name || ''),
      docs: (Array.isArray(element.businessObject?.documentation) ? element.businessObject.documentation : []).map((d) => String(d?.text || '')),
      collapsed: element.collapsed === true,
    };
  }, elementId);
}

async function readLocalXml(page) {
  const result = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    try {
      const out = await modeler.saveXML({ format: true });
      return { ok: true, xml: String(out?.xml || '') };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return String(result.xml || '');
}

function hasPlaneForElement(xmlText, elementId) {
  const xml = String(xmlText || '');
  const id = String(elementId || '').trim();
  if (!id) return false;
  return xml.includes(`bpmnElement="${id}"`) && xml.includes('<bpmndi:BPMNPlane');
}

test('collapsed subprocess self copy survives save and reopen when source carries BPMN IO metadata', async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedCollapsedSubprocessIoXml(runId));
  const testedUrl = `/app?project=${fixture.projectId}&session=${fixture.sessionId}`;
  console.log(`[COLLAPSED_SUBPROCESS_SAVE_FIXTURE] url=${testedUrl}`);

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(testedUrl);
  await switchTab(page, 'Diagram');
  await waitDiagramReady(page);

  const sourceShape = page.locator(".bpmnLayer--editor.on g.djs-element.djs-shape[data-element-id='SubProcess_1']").first();
  await expect(sourceShape).toBeVisible();
  await sourceShape.click({ force: true });
  await selectElement(page, 'SubProcess_1');
  await dispatchShortcut(page, 'c');
  await dispatchShortcut(page, 'v');

  await expect.poll(async () => {
    const probe = await readSelectionSummary(page);
    if (!probe.ok) return probe;
    return probe.id !== 'SubProcess_1' ? probe : { ...probe, ok: false, error: 'selection_not_replaced' };
  }).toMatchObject({
    ok: true,
    collapsed: true,
    name: 'Collapsed Source',
  });

  const pasted = await readSelectionSummary(page);
  expect(pasted.docs).toContain('copy-doc-text');

  const localXml = await readLocalXml(page);
  expect(localXml.includes(`id="${pasted.boId}"`)).toBeTruthy();
  expect(hasPlaneForElement(localXml, pasted.boId)).toBeTruthy();
  expect(localXml.includes('copy-doc-text')).toBeTruthy();
  expect(localXml.includes('undefined_plane')).toBeFalsy();
  expect(localXml.includes('undefined_di')).toBeFalsy();

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`, {
    headers: auth.headers,
    data: { xml: localXml },
  });
  expect(putRes.ok(), `persist xml: ${await putRes.text()}`).toBeTruthy();

  const persistedRes = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn?raw=1`, {
    headers: auth.headers,
  });
  expect(persistedRes.ok(), `fetch raw xml: ${await persistedRes.text()}`).toBeTruthy();
  const persistedXml = await persistedRes.text();
  expect(persistedXml.includes(`id="${pasted.boId}"`)).toBeTruthy();
  expect(hasPlaneForElement(persistedXml, pasted.boId)).toBeTruthy();
  expect(persistedXml.includes('copy-doc-text')).toBeTruthy();

  await page.goto(testedUrl);
  await switchTab(page, 'Diagram');
  await waitDiagramReady(page);
  await expect.poll(async () => {
    const probe = await readElementSummary(page, pasted.id);
    return probe.ok ? probe : null;
  }).not.toBeNull();
  const reopened = await readElementSummary(page, pasted.id);
  expect(reopened.id).toBe(pasted.id);
  expect(reopened.docs).toContain('copy-doc-text');
  expect(pageErrors).toEqual([]);
});
