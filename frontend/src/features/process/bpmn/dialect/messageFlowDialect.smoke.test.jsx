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
const BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI";
const DI_NS = "http://www.omg.org/spec/DD/20100524/DI";

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

// Dialect XML whose BPMNPlane carries all three edges: two sequenceFlow edges
// plus the DI-edge of the dialect messageFlow with concrete geometry.
const DIALECT_XML_FULL_DI = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_Full" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_Full" isExecutable="false">
    <bpmn:dataStoreReference id="DataStoreReference_Full" name="Shared closure source" />
    <bpmn:subProcess id="SubProcess_Full" name="Check closure">
      <bpmn:startEvent id="FullStart">
        <bpmn:outgoing>FullSeq_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="FullTask" name="Inspect lid">
        <bpmn:incoming>FullSeq_1</bpmn:incoming>
        <bpmn:outgoing>FullSeq_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="FullEnd">
        <bpmn:incoming>FullSeq_2</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="FullSeq_1" sourceRef="FullStart" targetRef="FullTask" />
      <bpmn:sequenceFlow id="FullSeq_2" sourceRef="FullTask" targetRef="FullEnd" />
      <bpmn:messageFlow id="DialectMsgFlow_Full" sourceRef="FullTask" targetRef="DataStoreReference_Full" name="status update" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Full">
    <bpmndi:BPMNPlane id="BPMNPlane_Full" bpmnElement="Process_Full">
      <bpmndi:BPMNShape id="FullTask_di" bpmnElement="FullTask">
        <dc:Bounds x="320" y="213" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="FullSeq_1_di" bpmnElement="FullSeq_1">
        <di:waypoint x="100" y="100" />
        <di:waypoint x="200" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FullSeq_2_di" bpmnElement="FullSeq_2">
        <di:waypoint x="200" y="100" />
        <di:waypoint x="300" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="DialectMsgFlow_Full_di" bpmnElement="DialectMsgFlow_Full">
        <di:waypoint x="320" y="260" />
        <di:waypoint x="130" y="305" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function dom(xml) {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function diEdges(xml) {
  return Array.from(dom(xml).getElementsByTagNameNS(BPMNDI_NS, "BPMNEdge"));
}

function waypointPairs(edgeEl) {
  return Array.from(edgeEl.getElementsByTagNameNS(DI_NS, "waypoint")).map((w) => [
    w.getAttribute("x"),
    w.getAttribute("y"),
  ]);
}

// Simulates bpmn-js saveXML for an out-of-scope DI-edge: the hoisted flow's
// edge is dropped from the exported XML (defect-2 characterization).
function dropDiEdge(xml, flowId) {
  const doc = dom(xml);
  const target = Array.from(doc.getElementsByTagNameNS(BPMNDI_NS, "BPMNEdge")).find(
    (e) => e.getAttribute("bpmnElement") === flowId
  );
  if (target) target.parentNode.removeChild(target);
  return new XMLSerializer().serializeToString(doc);
}

function rewriteWaypoints(xml, flowId, pairs) {
  const doc = dom(xml);
  const target = Array.from(doc.getElementsByTagNameNS(BPMNDI_NS, "BPMNEdge")).find(
    (e) => e.getAttribute("bpmnElement") === flowId
  );
  if (!target) return xml;
  for (const wp of Array.from(target.getElementsByTagNameNS(DI_NS, "waypoint"))) {
    target.removeChild(wp);
  }
  for (const [x, y] of pairs) {
    const wp = doc.createElementNS(DI_NS, "di:waypoint");
    wp.setAttribute("x", x);
    wp.setAttribute("y", y);
    target.appendChild(wp);
  }
  return new XMLSerializer().serializeToString(doc);
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
    expect(result.moved.length).toBe(1);
    expect(result.moved[0]).toMatchObject({
      id: "DialectMsgFlow_1",
      containerId: "SubProcess_Dialect_1",
      diPlaneId: "BPMNPlane_Dialect",
    });
    expect(result.moved[0].diEdgeXml).toContain("DialectMsgFlow_1_di");
    expect(localEls(result.xml, "messageFlow").length).toBe(1);
    expect(localEls(result.xml, "collaboration").length).toBe(1);
    const sp = localEls(result.xml, "subProcess")[0];
    expect(sp.getElementsByTagNameNS(BPMN_NS, "messageFlow").length).toBe(0);
    // edge stays in the plane on hoist (bpmn-js ignores it on import)
    expect(diEdges(result.xml).length).toBe(1);
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

  it("re-inject is symmetric and idempotent (egress safety)", () => {
    const hoisted = hoistMessageFlowsFromContainers(DIALECT_XML);
    const restored = reinjectMessageFlowsIntoContainers(hoisted.xml, hoisted);
    // re-inject of already-dialect XML is a no-op
    expect(reinjectMessageFlowsIntoContainers(restored, hoisted)).toBe(restored);
    // double re-inject of hoisted XML is stable
    const once = reinjectMessageFlowsIntoContainers(hoisted.xml, hoisted);
    expect(reinjectMessageFlowsIntoContainers(once, hoisted)).toBe(once);
    // links survive to the original container
    const flow = localEls(restored, "messageFlow")[0];
    expect(flow.parentNode.getAttribute("id")).toBe("SubProcess_Dialect_1");
    expect(flow.getAttribute("targetRef")).toBe("DataStoreReference_External");
  });

  it("export dialect without prior import is a no-op", () => {
    expect(applyMessageFlowExportDialect(DIALECT_XML)).toBe(DIALECT_XML);
  });
});

describe("DI-edge roundtrip (defect-2: hoisted-scope edge dropped by editor saveXML)", () => {
  it("snapshots edge XML and plane id on hoist", () => {
    const hoisted = hoistMessageFlowsFromContainers(DIALECT_XML_FULL_DI);
    expect(hoisted.changed).toBe(true);
    const entry = hoisted.moved.find((m) => m.id === "DialectMsgFlow_Full");
    expect(entry).toBeTruthy();
    expect(entry.diPlaneId).toBe("BPMNPlane_Full");
    expect(entry.diEdgeXml).toContain('bpmnElement="DialectMsgFlow_Full"');
    expect(entry.diEdgeXml).toContain("320");
    expect(diEdges(hoisted.xml).length).toBe(3);
  });

  it("re-injects the lost edge with exact original geometry into the original plane", () => {
    const hoisted = hoistMessageFlowsFromContainers(DIALECT_XML_FULL_DI);
    // bpmn-js cannot bind the edge of a collaboration-scoped flow to a
    // process-scoped plane, so its saveXML loses it: 3 -> 2 edges.
    const savedXml = dropDiEdge(hoisted.xml, "DialectMsgFlow_Full");
    expect(diEdges(savedXml).length).toBe(2);
    const restored = reinjectMessageFlowsIntoContainers(savedXml, hoisted);
    // (a) edge count is back to 3, not 2
    const edges = diEdges(restored);
    expect(edges.length).toBe(3);
    const mfEdge = edges.find((e) => e.getAttribute("bpmnElement") === "DialectMsgFlow_Full");
    expect(mfEdge).toBeTruthy();
    // (b) geometry roundtrips exactly and the edge lands in its original plane
    expect(mfEdge.parentNode.getAttribute("id")).toBe("BPMNPlane_Full");
    expect(waypointPairs(mfEdge)).toEqual([
      ["320", "260"],
      ["130", "305"],
    ]);
    // untouched sequenceFlow edges are preserved as-is
    const seq1 = edges.find((e) => e.getAttribute("bpmnElement") === "FullSeq_1");
    expect(seq1).toBeTruthy();
    expect(waypointPairs(seq1)).toEqual([
      ["100", "100"],
      ["200", "100"],
    ]);
  });

  it("keeps editor-modified waypoints when the edge survived saveXML", () => {
    const hoisted = hoistMessageFlowsFromContainers(DIALECT_XML_FULL_DI);
    const tweaked = rewriteWaypoints(hoisted.xml, "DialectMsgFlow_Full", [
      ["410", "400"],
      ["505", "480"],
    ]);
    const restored = reinjectMessageFlowsIntoContainers(tweaked, hoisted);
    const edges = diEdges(restored);
    expect(edges.length).toBe(3);
    const mfEdge = edges.find((e) => e.getAttribute("bpmnElement") === "DialectMsgFlow_Full");
    expect(mfEdge).toBeTruthy();
    // (c) live (re-geometry'd) edge wins over the hoist-time snapshot
    expect(waypointPairs(mfEdge)).toEqual([
      ["410", "400"],
      ["505", "480"],
    ]);
  });

  it("does not re-inject the edge when the container was deleted in the editor", () => {
    const hoisted = hoistMessageFlowsFromContainers(DIALECT_XML_FULL_DI);
    const savedXml = dropDiEdge(hoisted.xml, "DialectMsgFlow_Full");
    const withoutContainer = savedXml.replace(
      /<bpmn:subProcess id="SubProcess_Full"[\s\S]*?<\/bpmn:subProcess>/,
      ""
    );
    const restored = reinjectMessageFlowsIntoContainers(withoutContainer, hoisted);
    expect(localEls(restored, "subProcess").length).toBe(0);
    // flow stays in collaboration; edge is NOT restored
    expect(diEdges(restored).length).toBe(2);
    const collab = localEls(restored, "collaboration")[0];
    expect(
      collab.getElementsByTagNameNS(BPMN_NS, "messageFlow").length
    ).toBe(1);
  });

  it("roundtrip via shared import/export helpers restores the edge", () => {
    const hoisted = applyMessageFlowImportDialect(DIALECT_XML_FULL_DI);
    const savedXml = dropDiEdge(hoisted, "DialectMsgFlow_Full");
    const restored = applyMessageFlowExportDialect(savedXml);
    expect(diEdges(restored).length).toBe(3);
    const mfEdge = diEdges(restored).find(
      (e) => e.getAttribute("bpmnElement") === "DialectMsgFlow_Full"
    );
    expect(waypointPairs(mfEdge)).toEqual([
      ["320", "260"],
      ["130", "305"],
    ]);
    expect(localEls(restored, "collaboration").length).toBe(0);
  });
});
