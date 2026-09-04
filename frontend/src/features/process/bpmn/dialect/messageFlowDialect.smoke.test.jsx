// Roundtrip of the messageFlow-inside-process/subProcess dialect (feature #43)
// through the bpmn-moddle layer that previously dropped it ("unparsable content").

import { describe, expect, it } from "vitest";
import { BpmnModdle } from "bpmn-moddle";
import {
  applyMessageFlowExportDialect,
  applyMessageFlowImportDialect,
  hoistMessageFlowsFromContainers,
  reinjectMessageFlowsIntoContainers,
} from "./messageFlowDialect";

const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";

const DIALECT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_Dialect" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Dialect" isExecutable="false">
    <bpmn:dataStoreReference id="DataStoreReference_External" name="Shared closure source" />
    <bpmn:subProcess id="SubProcess_Dialect_1" name="Check closure">
      <bpmn:startEvent id="DialectStart_1">
        <bpmn:outgoing>DialectSeq_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="DialectTask_1" name="Inspect lid">
        <bpmn:incoming>DialectSeq_1</bpmn:incoming>
      </bpmn:task>
      <bpmn:sequenceFlow id="DialectSeq_1" sourceRef="DialectStart_1" targetRef="DialectTask_1" />
      <bpmn:messageFlow id="DialectMsgFlow_1" sourceRef="DialectTask_1" targetRef="DataStoreReference_External" name="status update" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Dialect">
    <bpmndi:BPMNPlane id="BPMNPlane_Dialect" bpmnElement="Process_Dialect">
      <bpmndi:BPMNShape id="DialectTask_1_di" bpmnElement="DialectTask_1">
        <dc:Bounds x="320" y="213" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="DialectMsgFlow_1_di" bpmnElement="DialectMsgFlow_1">
        <di:waypoint x="320" y="260" />
        <di:waypoint x="130" y="305" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const CLEAN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Clean" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Clean" isExecutable="false">
    <bpmn:task id="CleanTask_1" />
  </bpmn:process>
</bpmn:definitions>`;

function dom(xml) {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function localEls(xml, localName) {
  return Array.from(dom(xml).getElementsByTagNameNS(BPMN_NS, localName));
}

async function moddleRoundtrip(xml) {
  const moddle = new BpmnModdle();
  const { rootElement, warnings } = await moddle.fromXML(xml);
  const { xml: out } = await moddle.toXML(rootElement, { format: true });
  return { out, warnings };
}

describe("messageFlow dialect moddle characterization", () => {
  it("moddle drops messageFlow inside subProcess on plain import", async () => {
    const { out, warnings } = await moddleRoundtrip(DIALECT_XML);
    expect(warnings.length).toBeGreaterThan(0);
    const flows = localEls(out, "messageFlow").filter(
      (el) => el.getAttribute("id") === "DialectMsgFlow_1"
    );
    expect(flows.length).toBe(0);
  });
});

describe("hoist / re-inject roundtrip", () => {
  it("hoists dialect messageFlow into collaboration", () => {
    const result = hoistMessageFlowsFromContainers(DIALECT_XML);
    expect(result.changed).toBe(true);
    expect(result.moved).toEqual([{ id: "DialectMsgFlow_1", containerId: "SubProcess_Dialect_1" }]);
    expect(localEls(result.xml, "messageFlow").length).toBe(1);
    expect(localEls(result.xml, "collaboration").length).toBe(1);
    const sp = localEls(result.xml, "subProcess")[0];
    expect(sp.getElementsByTagNameNS(BPMN_NS, "messageFlow").length).toBe(0);
  });

  it("hoisted XML survives moddle roundtrip without losing the flow", async () => {
    const hoisted = hoistMessageFlowsFromContainers(DIALECT_XML);
    const { out, warnings } = await moddleRoundtrip(hoisted.xml);
    expect(warnings).toEqual([]);
    const flow = localEls(out, "messageFlow").find(
      (el) => el.getAttribute("id") === "DialectMsgFlow_1"
    );
    expect(flow).toBeTruthy();
    expect(flow.getAttribute("sourceRef")).toBe("DialectTask_1");
    expect(flow.getAttribute("targetRef")).toBe("DataStoreReference_External");
  });

  it("full roundtrip: hoist -> moddle -> re-inject restores original links", async () => {
    const hoisted = hoistMessageFlowsFromContainers(DIALECT_XML);
    const { out } = await moddleRoundtrip(hoisted.xml);
    const restored = reinjectMessageFlowsIntoContainers(out, hoisted);
    const flow = localEls(restored, "messageFlow").find(
      (el) => el.getAttribute("id") === "DialectMsgFlow_1"
    );
    expect(flow).toBeTruthy();
    expect(flow.getAttribute("sourceRef")).toBe("DialectTask_1");
    expect(flow.getAttribute("targetRef")).toBe("DataStoreReference_External");
    expect(flow.parentNode.getAttribute("id")).toBe("SubProcess_Dialect_1");
    // server dialect: no collaboration left behind
    expect(localEls(restored, "collaboration").length).toBe(0);
    // dataStoreReference untouched
    expect(localEls(restored, "dataStoreReference").length).toBe(1);
  });

  it("clean XML passes through unchanged", () => {
    const result = hoistMessageFlowsFromContainers(CLEAN_XML);
    expect(result.changed).toBe(false);
    expect(result.xml).toBe(CLEAN_XML);
  });

  it("import/export dialect helpers roundtrip via shared state", () => {
    const hoisted = applyMessageFlowImportDialect(DIALECT_XML);
    expect(hoisted).not.toBe(DIALECT_XML);
    const restored = applyMessageFlowExportDialect(hoisted);
    const flow = localEls(restored, "messageFlow").find(
      (el) => el.getAttribute("id") === "DialectMsgFlow_1"
    );
    expect(flow).toBeTruthy();
    expect(flow.parentNode.getAttribute("id")).toBe("SubProcess_Dialect_1");
  });
});
