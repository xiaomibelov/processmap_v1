import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;

import {
  buildTemplateBpmnTransfer,
  buildFragmentXmlFromFullXml,
  collectDescriptorIds,
} from "./templateBpmnXmlTransfer.js";

const FULL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Definitions_1" targetNamespace="http://processmap.ai">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" name="Do thing" />
    <bpmn:textAnnotation id="Annotation_1"><bpmn:text>Note</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Association_1" sourceRef="Task_1" targetRef="Annotation_1" />
    <bpmn:dataStoreReference id="DataStore_1" name="Main DB" />
    <bpmn:dataInputAssociation id="DataInput_1">
      <bpmn:sourceRef>DataStore_1</bpmn:sourceRef>
      <bpmn:targetRef>Task_1</bpmn:targetRef>
    </bpmn:dataInputAssociation>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1" />
      <bpmndi:BPMNShape id="Annotation_1_di" bpmnElement="Annotation_1" />
      <bpmndi:BPMNEdge id="Association_1_di" bpmnElement="Association_1" />
      <bpmndi:BPMNShape id="DataStore_1_di" bpmnElement="DataStore_1" />
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function createTransferModeler({ copyPaste } = {}) {
  return {
    get(name) {
      if (name === "copyPaste") return copyPaste;
      return null;
    },
    saveXML: async () => ({ xml: FULL_XML }),
  };
}

test("buildTemplateBpmnTransfer returns ok transfer with schema, captureMode and native tree", async () => {
  const elements = [{ id: "Task_1" }, { id: "Annotation_1" }, { id: "Association_1" }, { id: "DataStore_1" }];
  const copyPaste = {
    createTree(selected) {
      return {
        id: "tree_root",
        elements: selected.map((el) => ({ id: el.id })),
      };
    },
  };
  const result = await buildTemplateBpmnTransfer({ modeler: createTransferModeler({ copyPaste }), elements });

  assert.equal(result.ok, true);
  assert.equal(result.transfer.schema, "fpc.bpmn.template.xml.v1");
  assert.equal(result.transfer.captureMode, "bpmn_xml_native_tree");
  assert.deepEqual(result.transfer.warnings, []);
  assert.ok(result.transfer.nativeTree);
  for (const id of ["Task_1", "Annotation_1", "Association_1", "DataStore_1"]) {
    assert.ok(result.transfer.sourceDescriptorIds.includes(id), `missing descriptor id ${id}`);
  }
});

test("buildTemplateBpmnTransfer bpmnXml includes selected semantic elements, DI and attached data associations", async () => {
  const elements = [{ id: "Task_1" }, { id: "Annotation_1" }, { id: "Association_1" }, { id: "DataStore_1" }];
  const copyPaste = { createTree: (selected) => ({ elements: selected.map((el) => ({ id: el.id })) }) };
  const result = await buildTemplateBpmnTransfer({ modeler: createTransferModeler({ copyPaste }), elements });

  const xml = result.transfer.bpmnXml;
  assert.ok(xml.includes("dataStoreReference"), "expected dataStoreReference in fragment xml");
  assert.ok(xml.includes("textAnnotation"), "expected textAnnotation in fragment xml");
  assert.ok(xml.includes("Association_1"), "expected association in fragment xml");
  assert.ok(xml.includes("dataInputAssociation"), "expected attached dataInputAssociation in fragment xml");
  assert.ok(xml.includes("BPMNShape"), "expected DI shapes in fragment xml");
  assert.ok(xml.includes('bpmnElement="Task_1"'), "expected DI for Task_1");
  assert.ok(!xml.includes('id="Task_2"'), "unexpected unselected element in fragment xml");
});

test("buildTemplateBpmnTransfer falls back when copyPaste createTree is unavailable", async () => {
  const result = await buildTemplateBpmnTransfer({ modeler: createTransferModeler({ copyPaste: null }), elements: [{ id: "Task_1" }] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "copy_paste_unavailable");

  const noCreateTree = await buildTemplateBpmnTransfer({
    modeler: createTransferModeler({ copyPaste: {} }),
    elements: [{ id: "Task_1" }],
  });
  assert.equal(noCreateTree.ok, false);
  assert.equal(noCreateTree.error, "copy_paste_unavailable");
});

test("buildTemplateBpmnTransfer falls back when selection is empty", async () => {
  const copyPaste = { createTree: () => ({}) };
  const result = await buildTemplateBpmnTransfer({ modeler: createTransferModeler({ copyPaste }), elements: [] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "copy_paste_unavailable");
});

test("collectDescriptorIds collects nested ids and dedupes", () => {
  const ids = collectDescriptorIds({
    id: "root",
    children: [{ id: "Task_1" }, { id: "Task_1" }, { elements: [{ id: "DataStore_1" }] }],
  });
  assert.deepEqual(ids.sort(), ["DataStore_1", "Task_1", "root"]);
});

test("buildFragmentXmlFromFullXml keeps only selected ids and their DI", async () => {
  const xml = await buildFragmentXmlFromFullXml(FULL_XML, ["Task_1"]);
  assert.ok(xml.includes('id="Task_1"'));
  assert.ok(xml.includes('bpmnElement="Task_1"'));
  assert.ok(xml.includes("dataInputAssociation"), "expected attached dataInputAssociation for selected Task_1");
  assert.ok(!xml.includes('id="DataStore_1"'));
  assert.ok(!xml.includes('bpmnElement="DataStore_1"'));
});
