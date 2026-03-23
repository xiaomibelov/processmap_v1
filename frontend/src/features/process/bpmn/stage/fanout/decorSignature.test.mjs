import test from "node:test";
import assert from "node:assert/strict";

import { buildTaskTypeSignature, buildLinkEventSignature } from "./decorSignature.js";

function makeRegistry(elements) {
  return {
    filter(fn) { return elements.filter(fn); },
  };
}

function isShape(el) {
  return el && typeof el === "object" && el.id;
}

test("buildTaskTypeSignature produces stable sorted signature", () => {
  const elements = [
    { id: "Task_2", businessObject: { $type: "bpmn:Task" } },
    { id: "Start_1", businessObject: { $type: "bpmn:StartEvent" } },
    { id: "Task_1", businessObject: { $type: "bpmn:UserTask" } },
  ];
  const sig = buildTaskTypeSignature(makeRegistry(elements), isShape);
  assert.equal(sig, "Start_1:bpmn:StartEvent|Task_1:bpmn:UserTask|Task_2:bpmn:Task");
});

test("buildTaskTypeSignature is stable across repeated calls with same input", () => {
  const elements = [
    { id: "A", businessObject: { $type: "bpmn:Task" } },
    { id: "B", businessObject: { $type: "bpmn:EndEvent" } },
  ];
  const reg = makeRegistry(elements);
  const sig1 = buildTaskTypeSignature(reg, isShape);
  const sig2 = buildTaskTypeSignature(reg, isShape);
  assert.equal(sig1, sig2);
});

test("buildTaskTypeSignature changes when element is added", () => {
  const elements = [
    { id: "A", businessObject: { $type: "bpmn:Task" } },
  ];
  const sig1 = buildTaskTypeSignature(makeRegistry(elements), isShape);
  elements.push({ id: "B", businessObject: { $type: "bpmn:EndEvent" } });
  const sig2 = buildTaskTypeSignature(makeRegistry(elements), isShape);
  assert.notEqual(sig1, sig2);
});

test("buildTaskTypeSignature does not change when element position changes", () => {
  const elements = [
    { id: "A", businessObject: { $type: "bpmn:Task" }, x: 100, y: 200 },
    { id: "B", businessObject: { $type: "bpmn:EndEvent" }, x: 300, y: 400 },
  ];
  const sig1 = buildTaskTypeSignature(makeRegistry(elements), isShape);
  elements[0].x = 500;
  elements[0].y = 600;
  const sig2 = buildTaskTypeSignature(makeRegistry(elements), isShape);
  assert.equal(sig1, sig2);
});

test("buildTaskTypeSignature returns empty string for empty registry", () => {
  assert.equal(buildTaskTypeSignature(makeRegistry([]), isShape), "");
});

test("buildLinkEventSignature produces stable sorted signature", () => {
  const helpers = {
    hasLinkEventDefinition: (bo) => bo?._isLink === true,
    readLinkEventRole: (el) => el._role,
    readLinkEventPairName: (el) => el._pairName,
    normalizeLinkPairKey: (name) => String(name || "").toLowerCase().trim(),
  };
  const elements = [
    { id: "Link_2", businessObject: { _isLink: true }, _role: "throw", _pairName: "Alpha" },
    { id: "Link_1", businessObject: { _isLink: true }, _role: "catch", _pairName: "Alpha" },
    { id: "Task_1", businessObject: { $type: "bpmn:Task" } },
  ];
  const sig = buildLinkEventSignature(makeRegistry(elements), isShape, helpers);
  assert.equal(sig, "Link_1:catch:alpha|Link_2:throw:alpha");
});

test("buildLinkEventSignature is stable for unchanged link events", () => {
  const helpers = {
    hasLinkEventDefinition: (bo) => bo?._isLink === true,
    readLinkEventRole: (el) => el._role,
    readLinkEventPairName: (el) => el._pairName,
    normalizeLinkPairKey: (name) => String(name || "").toLowerCase().trim(),
  };
  const elements = [
    { id: "L1", businessObject: { _isLink: true }, _role: "catch", _pairName: "X" },
  ];
  const reg = makeRegistry(elements);
  const sig1 = buildLinkEventSignature(reg, isShape, helpers);
  const sig2 = buildLinkEventSignature(reg, isShape, helpers);
  assert.equal(sig1, sig2);
});

test("buildLinkEventSignature returns empty for no link events", () => {
  const helpers = {
    hasLinkEventDefinition: () => false,
    readLinkEventRole: () => "",
    readLinkEventPairName: () => "",
    normalizeLinkPairKey: (n) => n,
  };
  const elements = [
    { id: "Task_1", businessObject: { $type: "bpmn:Task" } },
  ];
  assert.equal(buildLinkEventSignature(makeRegistry(elements), isShape, helpers), "");
});
