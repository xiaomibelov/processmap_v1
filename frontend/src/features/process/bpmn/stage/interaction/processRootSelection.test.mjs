import assert from "node:assert/strict";
import test from "node:test";

import {
  isProcessLikeType,
  isProcessLikeElement,
  resolveProcessLikeRootElement,
} from "./processRootSelection.js";

test("isProcessLikeType matches process and collaboration", () => {
  assert.equal(isProcessLikeType("bpmn:Process"), true);
  assert.equal(isProcessLikeType("bpmn:Collaboration"), true);
  assert.equal(isProcessLikeType("Process"), true);
  assert.equal(isProcessLikeType("bpmn:SubProcess"), false);
  assert.equal(isProcessLikeType("bpmn:Task"), false);
  assert.equal(isProcessLikeType("bpmn:Lane"), false);
  assert.equal(isProcessLikeType("bpmn:Participant"), false);
  assert.equal(isProcessLikeType(""), false);
  assert.equal(isProcessLikeType(null), false);
});

test("isProcessLikeElement reads businessObject $type first", () => {
  assert.equal(isProcessLikeElement({ type: "bpmn:Process" }), true);
  assert.equal(isProcessLikeElement({ type: "bpmn:Task", businessObject: { $type: "bpmn:Process" } }), true);
  assert.equal(isProcessLikeElement({ businessObject: { $type: "bpmn:Collaboration" } }), true);
  assert.equal(isProcessLikeElement(null), false);
  assert.equal(isProcessLikeElement({}), false);
});

function fakeInst({ rootElement, registryElements = [] } = {}) {
  const byId = new Map(registryElements.map((el) => [el.id, el]));
  return {
    get: (name) => {
      if (name === "canvas") return { getRootElement: () => rootElement };
      if (name === "elementRegistry") return { get: (id) => byId.get(id) };
      return null;
    },
  };
}

test("resolveProcessLikeRootElement returns plane root for a process", () => {
  const root = { id: "Process_1", type: "bpmn:Process", businessObject: { $type: "bpmn:Process" } };
  assert.equal(resolveProcessLikeRootElement(fakeInst({ rootElement: root })), root);
});

test("resolveProcessLikeRootElement returns plane root for a collaboration", () => {
  const root = { id: "Collaboration_1", type: "bpmn:Collaboration", businessObject: { $type: "bpmn:Collaboration" } };
  assert.equal(resolveProcessLikeRootElement(fakeInst({ rootElement: root })), root);
});

test("resolveProcessLikeRootElement returns null for subprocess drill-down root", () => {
  const root = { id: "Sub_1", type: "bpmn:SubProcess", businessObject: { $type: "bpmn:SubProcess", $parent: { rootElements: [] } } };
  assert.equal(resolveProcessLikeRootElement(fakeInst({ rootElement: root })), null);
});

test("resolveProcessLikeRootElement falls back to definitions.rootElements[0]", () => {
  const processBo = { id: "Process_9", $type: "bpmn:Process" };
  const defs = { rootElements: [processBo] };
  const root = { id: "Plane", type: "bpmn:SubProcess", businessObject: { $type: "bpmn:SubProcess", $parent: defs } };
  const registryEl = { id: "Process_9", type: "bpmn:Process", businessObject: processBo };
  const inst = fakeInst({ rootElement: root, registryElements: [registryEl] });
  assert.equal(resolveProcessLikeRootElement(inst), registryEl);
});

test("resolveProcessLikeRootElement returns null without definitions", () => {
  assert.equal(resolveProcessLikeRootElement(fakeInst({ rootElement: null })), null);
  assert.equal(resolveProcessLikeRootElement(null), null);
});
