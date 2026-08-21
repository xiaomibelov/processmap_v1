import assert from "node:assert/strict";
import test from "node:test";

import { mergeEdgesByKey, mergeNodesById } from "../lib/processStageDomain.js";
import { projectParsedBpmnToInterview } from "./useInterviewProjection.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildHelpers() {
  const state = { mergeCalls: 0 };
  return {
    state,
    helpers: {
      asArray,
      asObject,
      interviewHasContent: (interview) => asArray(interview?.steps).length > 0,
      mergeInterviewData: (currentInterview, importedInterview) => {
        state.mergeCalls += 1;
        return {
          ...asObject(currentInterview),
          ...asObject(importedInterview),
          merged: true,
          steps: [
            ...asArray(currentInterview?.steps).map((step) => ({ ...step })),
            ...asArray(importedInterview?.steps).map((step) => ({ ...step })),
          ],
        };
      },
      sanitizeGraphNodes: (nodes) => asArray(nodes),
      mergeNodesById,
      mergeEdgesByKey,
      enrichInterviewWithNodeBindings: (interview, nodes) => ({
        interview: asObject(interview),
        nodes: asArray(nodes),
      }),
      parseBpmnToSessionGraph: () => ({ ok: false, error: "not_used_in_this_suite" }),
    },
  };
}

test("explicit import replaceGraph=true replaces old semantic graph instead of merging", () => {
  const { state, helpers } = buildHelpers();
  const result = projectParsedBpmnToInterview({
    parsed: {
      ok: true,
      interview: {
        steps: [{ id: "new_step", node_id: "NEW_TASK_B", action: "new_action" }],
      },
      nodes: [{ id: "NEW_TASK_B", title: "New Task B", parameters: { temperature: "new_180" } }],
      edges: [{ from_id: "NEW_TASK_B", to_id: "NEW_TASK_B", when: null }],
    },
    draft: {
      interview: {
        steps: [{ id: "old_step", node_id: "OLD_TASK_A", action: "old_action" }],
      },
      nodes: [{ id: "OLD_TASK_A", title: "Old Task A", parameters: { temperature: "old_120" } }],
      edges: [{ from_id: "OLD_TASK_A", to_id: "OLD_TASK_A", when: null }],
    },
    helpers,
    replaceGraph: true,
  });

  assert.equal(result.ok, true);
  assert.equal(state.mergeCalls, 0);
  assert.deepEqual(result.nextNodes.map((node) => node.id), ["NEW_TASK_B"]);
  assert.deepEqual(
    result.nextEdges.map((edge) => `${edge.from_id}->${edge.to_id}`),
    ["NEW_TASK_B->NEW_TASK_B"],
  );
  assert.equal(
    asArray(result.nextInterview?.steps).some((step) => String(step?.node_id) === "OLD_TASK_A"),
    false,
  );
});

test("explicit import replaceGraph=true keeps imported properties as authoritative and removes legacy node residue", () => {
  const { helpers } = buildHelpers();
  const result = projectParsedBpmnToInterview({
    parsed: {
      ok: true,
      interview: {
        steps: [{ id: "main_step", node_id: "STAGE_NEW_TASK_MAIN", action: "mix" }],
      },
      nodes: [{
        id: "STAGE_NEW_TASK_MAIN",
        title: "Mixing Main v3",
        parameters: {
          temperature: "stage_new_330",
          robot: "stage_arm_v4",
          pressure: "stage_55",
        },
      }],
      edges: [],
    },
    draft: {
      interview: {
        steps: [{ id: "legacy_step", node_id: "LEGACY_TASK", action: "legacy" }],
      },
      nodes: [
        {
          id: "STAGE_NEW_TASK_MAIN",
          title: "Old Main",
          parameters: { temperature: "old_120", robot: "old_arm" },
        },
        {
          id: "LEGACY_TASK",
          title: "Legacy Task",
          parameters: { pressure: "legacy_1" },
        },
      ],
      edges: [{ from_id: "LEGACY_TASK", to_id: "STAGE_NEW_TASK_MAIN", when: null }],
    },
    helpers,
    replaceGraph: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.nextNodes.length, 1);
  assert.equal(result.nextNodes[0].id, "STAGE_NEW_TASK_MAIN");
  assert.deepEqual(result.nextNodes[0].parameters, {
    temperature: "stage_new_330",
    robot: "stage_arm_v4",
    pressure: "stage_55",
  });
  assert.equal(result.nextNodes.some((node) => node.id === "LEGACY_TASK"), false);
});

test("non-import path (replaceGraph=false) keeps previous merge behavior", () => {
  const { state, helpers } = buildHelpers();
  const result = projectParsedBpmnToInterview({
    parsed: {
      ok: true,
      interview: {
        steps: [{ id: "new_step", node_id: "NEW_TASK_B", action: "new_action" }],
      },
      nodes: [{ id: "NEW_TASK_B", title: "New Task B", parameters: { p: "new" } }],
      edges: [{ from_id: "NEW_TASK_B", to_id: "NEW_TASK_B", when: null }],
    },
    draft: {
      interview: {
        steps: [{ id: "old_step", node_id: "OLD_TASK_A", action: "old_action" }],
      },
      nodes: [{ id: "OLD_TASK_A", title: "Old Task A", parameters: { p: "old" } }],
      edges: [{ from_id: "OLD_TASK_A", to_id: "OLD_TASK_A", when: null }],
    },
    helpers,
  });

  assert.equal(result.ok, true);
  assert.equal(state.mergeCalls, 1);
  assert.deepEqual(
    result.nextNodes.map((node) => node.id).sort(),
    ["NEW_TASK_B", "OLD_TASK_A"],
  );
  assert.deepEqual(
    result.nextEdges.map((edge) => `${edge.from_id}->${edge.to_id}`).sort(),
    ["NEW_TASK_B->NEW_TASK_B", "OLD_TASK_A->OLD_TASK_A"],
  );
  assert.equal(result.nextInterview?.merged, true);
});
