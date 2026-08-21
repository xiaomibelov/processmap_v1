import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { createFixture, switchTab } from "./helpers/processFixture.mjs";

function seedXmlWithUnknownPmExtension(runId) {
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
  <bpmn:process id="Process_1" name="Unknown PM Extension ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Source Task ${runId}">
      <bpmn:documentation textFormat="text/plain">unknown-pm-doc</bpmn:documentation>
      <bpmn:extensionElements>
        <camunda:Properties>
          <camunda:Property name="priority" value="high" />
        </camunda:Properties>
        <pm:UnknownMeta foo="bar" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1">
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
        return {
          ok: !!registry?.get?.("Task_1"),
        };
      });
    })
    .toMatchObject({ ok: true });
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
      businessObjectId: String(selected.businessObject?.id || ""),
      type: String(selected.businessObject?.$type || selected.type || ""),
    };
  });
}

test("copy/paste with unknown safe extension does not crash on save-before-tab-switch", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers, seedXmlWithUnknownPmExtension(runId));
  const testedUrl = `/app?project=${fixture.projectId}&session=${fixture.sessionId}`;
  console.log(`[UNKNOWN_EXTENSION_SWITCH_FIXTURE] url=${testedUrl}`);

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
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(testedUrl);
  await switchTab(page, "Diagram");
  await waitDiagramReady(page);

  const selected = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler.get("elementRegistry");
    const selection = modeler.get("selection");
    const task = registry?.get?.("Task_1");
    if (!task) return { ok: false, error: "task_missing" };
    selection?.select?.([task]);
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "v",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    return { ok: true };
  });
  expect(selected.ok, JSON.stringify(selected)).toBeTruthy();

  await expect
    .poll(async () => {
      const probe = await readSelectionSummary(page);
      if (!probe.ok) return probe;
      return probe.id !== "Task_1"
        ? probe
        : { ...probe, ok: false, error: "selection_not_replaced" };
    })
    .toMatchObject({
      ok: true,
      type: "bpmn:UserTask",
    });

  await switchTab(page, "XML");

  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const diagnostics = window.__FPC_LAST_TAB_SWITCH_SAVE_DIAGNOSTICS__ || null;
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        let saveProbe = null;
        try {
          const out = await modeler.saveXML({ format: true });
          saveProbe = {
            ok: true,
            hasPriority: String(out?.xml || "").includes('name="priority" value="high"'),
            xmlLength: String(out?.xml || "").length,
          };
        } catch (error) {
          saveProbe = { ok: false, error: String(error?.message || error) };
        }
        return {
          diagnostics,
          bodyText: document.body.innerText,
          activeTab: Array.from(document.querySelectorAll(".segBtn"))
            .find((node) => node.getAttribute("aria-current") === "page")
            ?.textContent?.trim() || "",
          saveProbe,
        };
      });
    })
    .toMatchObject({
      diagnostics: null,
      activeTab: "XML",
      saveProbe: {
        ok: true,
        hasPriority: true,
      },
    });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((entry) => /isgeneric/i.test(String(entry || "")))).toEqual([]);
  expect(consoleErrors.filter((entry) => /не удалось сохранить bpmn перед переключением вкладки/i.test(String(entry || "")))).toEqual([]);
  const finalState = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const out = await modeler.saveXML({ format: true });
    return {
      bodyText: document.body.innerText,
      diagnostics: window.__FPC_LAST_TAB_SWITCH_SAVE_DIAGNOSTICS__ || null,
      xmlLength: String(out?.xml || "").length,
    };
  });
  expect(finalState.bodyText.includes("Не удалось сохранить BPMN перед переключением вкладки")).toBeFalsy();
  expect(finalState.diagnostics).toBe(null);
  expect(finalState.xmlLength).toBeGreaterThan(0);
});
