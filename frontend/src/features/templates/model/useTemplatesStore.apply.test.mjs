import test from "node:test";
import assert from "node:assert/strict";

import { applyBpmnFragmentTemplateImmediate } from "./useTemplatesStore.js";

test("applyBpmnFragmentTemplateImmediate: immediate insert returns completed success", async () => {
  const insertCalls = [];
  const pickerCalls = [];
  const infoCalls = [];
  const errorCalls = [];
  const template = { id: "tpl_1", template_type: "bpmn_fragment_v1" };
  const diagramContainerRect = { left: 12, top: 24, width: 980, height: 640 };

  const result = await applyBpmnFragmentTemplateImmediate({
    template,
    diagramContainerRect,
    insertBpmnFragmentTemplateImmediately: async (templateArg, optionsArg) => {
      insertCalls.push({ templateArg, optionsArg });
      return { ok: true, createdNodes: 3, createdEdges: 2 };
    },
    setPickerOpen: (value) => pickerCalls.push(value),
    setInfo: (value) => infoCalls.push(String(value || "")),
    setError: (value) => errorCalls.push(String(value || "")),
  });

  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].templateArg, template);
  assert.equal(insertCalls[0].optionsArg.mode, "after");
  assert.equal(insertCalls[0].optionsArg.preferPointAnchor, true);
  assert.equal(insertCalls[0].optionsArg.persistImmediately, true);
  assert.equal(insertCalls[0].optionsArg.source, "template_apply");
  assert.equal(insertCalls[0].optionsArg.diagramContainerRect, diagramContainerRect);
  assert.deepEqual(pickerCalls, [false]);
  assert.deepEqual(infoCalls, ["Inserted: 3 nodes, 2 flows."]);
  assert.equal(errorCalls.length, 0);
  assert.equal(result?.ok, true);
  assert.equal(result?.immediate, true);
});

test("applyBpmnFragmentTemplateImmediate: insert failure returns error and never reports success", async () => {
  const pickerCalls = [];
  const infoCalls = [];
  const errorCalls = [];

  const result = await applyBpmnFragmentTemplateImmediate({
    template: { id: "tpl_2", template_type: "bpmn_fragment_v1" },
    insertBpmnFragmentTemplateImmediately: async () => ({ ok: false, error: "insert_failed" }),
    setPickerOpen: (value) => pickerCalls.push(value),
    setInfo: (value) => infoCalls.push(String(value || "")),
    setError: (value) => errorCalls.push(String(value || "")),
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.error, "insert_failed");
  assert.deepEqual(pickerCalls, []);
  assert.deepEqual(infoCalls, []);
  assert.deepEqual(errorCalls, ["insert_failed"]);
});

test("applyBpmnFragmentTemplateImmediate: missing insert API fails contract", async () => {
  const errorCalls = [];
  const result = await applyBpmnFragmentTemplateImmediate({
    template: { id: "tpl_3", template_type: "bpmn_fragment_v1" },
    setError: (value) => errorCalls.push(String(value || "")),
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.error, "BPMN insert API недоступен.");
  assert.deepEqual(errorCalls, ["BPMN insert API недоступен."]);
});
