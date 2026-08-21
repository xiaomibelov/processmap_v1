import { expect, test } from "@playwright/test";
import { apiLogin } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture } from "./helpers/processFixture.mjs";

// Integration guard for the "property multiplication x3" bug
// (fix/property-x3-zeebe-namespace). Server-side contract:
//   camunda_extensions_by_element_id is RE-DERIVED from the XML on every save,
//   so the visible property count must stay x1 across save / reload / edit /
//   delete, and zeebe properties must NOT be converted into camunda duplicates.
//
// NOTE: this spec exercises the backend contract (L3 dedup + re-extract). The
// frontend half (L1 zeebe moddle registration, L2 namespace-aware apply) is
// covered by unit tests. Running the full UI serving-mode e2e requires the
// fixed frontend+api to be deployed to the test stack (deploy-gated).

const ZEEBE_NS = "http://camunda.org/schema/zeebe/1.0";
const CAMUNDA_NS = "http://camunda.org/schema/1.0/bpmn";

function zeebeSeedXml(props = ZEEBE_PROPS) {
  const propXml = props
    .map((p) => `          <zeebe:property name="${p.name}" value="${p.value}" />`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:zeebe="${ZEEBE_NS}"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn"
  exporter="Camunda Modeler" exporterVersion="5.0"
  executionPlatform="Camunda Cloud" executionPlatformVersion="8.5.0">
  <bpmn:process id="Process_1" name="E2E x3" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Добавить ингредиент">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:extensionElements>
        <zeebe:properties>
${propXml}
        </zeebe:properties>
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="170" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="290" y="148" width="170" height="80" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

const ZEEBE_PROPS = [
  { name: "ingredient", value: "микс бованка+крем" },
  { name: "container_tara", value: "дежа" },
  { name: "ingredient_shape", value: "куб" },
  { name: "ingredient_height", value: "12" },
];

function countProps(xml, prefix) {
  const re = new RegExp(`<${prefix}:property\\b`, "g");
  return (String(xml || "").match(re) || []).length;
}

function extensionPropertiesOf(sessionBody, elementId = "Task_1") {
  const map = sessionBody?.bpmn_meta?.camunda_extensions_by_element_id
    || sessionBody?.camunda_extensions_by_element_id
    || {};
  return map?.[elementId]?.properties?.extensionProperties || [];
}

async function getSession(request, sessionId, headers) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { headers });
  return apiJson(res, "get session");
}

async function putBpmn(request, sessionId, headers, { xml, sourceAction, meta }) {
  const res = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: {
      xml: String(xml || ""),
      base_diagram_state_version: 0,
      source_action: sourceAction || "property_update",
      bpmn_meta: meta || {},
    },
  });
  return apiJson(res, `put bpmn (${sourceAction || "property_update"})`);
}

test.describe("property x3 zeebe integration (server contract)", () => {
  test("save / reload / edit / delete keeps zeebe properties at x1 with zero camunda duplicates", async ({ request }) => {
    const auth = await apiLogin(request);
    const runId = `x3-${Date.now()}`;
    const fixture = await createFixture(request, runId, auth.headers, zeebeSeedXml());
    const { sessionId } = fixture;

    // 1) Seed: exactly 4 zeebe properties, 0 camunda, meta length 4.
    let session = await getSession(request, sessionId, auth.headers);
    expect(countProps(session.bpmn_xml, "zeebe"), "seed zeebe count").toBe(4);
    expect(countProps(session.bpmn_xml, "camunda"), "seed camunda count").toBe(0);
    expect(extensionPropertiesOf(session).length, "seed meta length").toBe(4);

    // 2) No-op save (reload round-trip): must stay x1 (no multiplication).
    await putBpmn(request, sessionId, auth.headers, {
      xml: session.bpmn_xml,
      sourceAction: "property_update",
      meta: session.bpmn_meta,
    });
    session = await getSession(request, sessionId, auth.headers);
    expect(countProps(session.bpmn_xml, "zeebe"), "after-save zeebe count").toBe(4);
    expect(countProps(session.bpmn_xml, "camunda"), "after-save camunda count").toBe(0);
    expect(extensionPropertiesOf(session).length, "after-save meta length").toBe(4);

    // 3) Edit one value (server re-derives meta from XML): count stays 4.
    const editedProps = ZEEBE_PROPS.map((p) => (
      p.name === "ingredient" ? { ...p, value: "микс обновлён" } : p
    ));
    await putBpmn(request, sessionId, auth.headers, {
      xml: zeebeSeedXml(editedProps),
      sourceAction: "property_update",
      meta: session.bpmn_meta,
    });
    session = await getSession(request, sessionId, auth.headers);
    expect(countProps(session.bpmn_xml, "zeebe"), "after-edit zeebe count").toBe(4);
    expect(countProps(session.bpmn_xml, "camunda"), "after-edit camunda count").toBe(0);
    const editedMeta = extensionPropertiesOf(session);
    expect(editedMeta.length, "after-edit meta length").toBe(4);
    expect(editedMeta.find((p) => p.name === "ingredient")?.value).toBe("микс обновлён");

    // 4) Delete one property: count drops to 3 and stays 3 after a reload.
    const remainingProps = editedProps.filter((p) => p.name !== "container_tara");
    await putBpmn(request, sessionId, auth.headers, {
      xml: zeebeSeedXml(remainingProps),
      sourceAction: "property_delete",
      meta: session.bpmn_meta,
    });
    session = await getSession(request, sessionId, auth.headers);
    expect(countProps(session.bpmn_xml, "zeebe"), "after-delete zeebe count").toBe(3);
    expect(countProps(session.bpmn_xml, "camunda"), "after-delete camunda count").toBe(0);
    expect(extensionPropertiesOf(session).length, "after-delete meta length").toBe(3);
    expect(extensionPropertiesOf(session).some((p) => p.name === "container_tara")).toBe(false);

    // 5) Reload once more: the deleted row must NOT be restored (x1, stable).
    await new Promise((r) => setTimeout(r, 1500));
    session = await getSession(request, sessionId, auth.headers);
    expect(extensionPropertiesOf(session).length, "reload meta length").toBe(3);
    expect(countProps(session.bpmn_xml, "camunda"), "reload camunda count").toBe(0);
  });
});
