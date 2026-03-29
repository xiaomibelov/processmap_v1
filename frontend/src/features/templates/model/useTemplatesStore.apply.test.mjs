import test from "node:test";
import assert from "node:assert/strict";

import {
  applyBpmnFragmentTemplateImmediate,
  buildImmediateInsertVisibilityGhost,
  readInsertedTemplateElementIds,
} from "./useTemplatesStore.js";

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

test("applyBpmnFragmentTemplateImmediate: emits immediate visibility marker before and after insert", async () => {
  const visibilityMarkers = [];
  const result = await applyBpmnFragmentTemplateImmediate({
    template: {
      id: "tpl_vis_1",
      title: "Visibility",
      template_type: "bpmn_fragment_v1",
      pack: {
        fragment: {
          nodes: [
            { id: "A", type: "bpmn:Task", di: { x: 100, y: 100, w: 100, h: 80 } },
          ],
          edges: [],
        },
      },
    },
    diagramContainerRect: { left: 10, top: 20, width: 900, height: 600 },
    insertBpmnFragmentTemplateImmediately: async () => ({
      ok: true,
      createdNodes: 2,
      createdEdges: 1,
      remap: {
        old_a: "Activity_1",
        old_b: "Activity_2",
        old_flow: "Flow_1",
      },
      entryNodeId: "Activity_1",
      exitNodeId: "Activity_2",
    }),
    emitVisibilityMarker: (payload) => visibilityMarkers.push(payload),
  });

  assert.equal(result?.ok, true);
  assert.equal(visibilityMarkers.length, 2);
  assert.equal(visibilityMarkers[0]?.phase, "before_insert");
  assert.equal(visibilityMarkers[0]?.ghost?.mode, "immediate");
  assert.equal(visibilityMarkers[1]?.phase, "after_insert");
  assert.deepEqual(
    visibilityMarkers[1]?.insertedIds,
    ["Activity_1", "Activity_2", "Flow_1"],
  );
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

test("buildImmediateInsertVisibilityGhost: builds center marker for immediate apply", () => {
  const ghost = buildImmediateInsertVisibilityGhost(
    {
      id: "tpl_ghost",
      title: "Ghost",
      pack: {
        fragment: {
          nodes: [
            { id: "A", type: "bpmn:Task", di: { x: 100, y: 100, w: 120, h: 80 } },
            { id: "B", type: "bpmn:Task", di: { x: 360, y: 220, w: 120, h: 80 } },
          ],
          edges: [
            { id: "F", sourceId: "A", targetId: "B" },
          ],
        },
      },
    },
    { left: 40, top: 50, width: 1000, height: 700 },
  );

  assert.ok(ghost);
  assert.equal(ghost.mode, "immediate");
  assert.equal(ghost.phase, "before_insert");
  assert.equal(ghost.anchorLeft, 500);
  assert.equal(ghost.anchorTop, 350);
  assert.equal(ghost.nodes, 2);
  assert.equal(ghost.edges, 1);
});

test("readInsertedTemplateElementIds: reads deduped ids from remap and entry/exit", () => {
  const ids = readInsertedTemplateElementIds({
    remap: {
      a_old: "Activity_A",
      b_old: "Activity_B",
      f_old: "Flow_AB",
    },
    entryNodeId: "Activity_A",
    exitNodeId: "Activity_B",
  });
  assert.deepEqual(ids, ["Activity_A", "Activity_B", "Flow_AB"]);
});
