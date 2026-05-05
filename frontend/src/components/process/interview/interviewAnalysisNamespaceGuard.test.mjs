import test from "node:test";
import assert from "node:assert/strict";

import { normalizeInterview } from "./utils.js";
import {
  asArray,
  asObject,
  buildInterviewPatchPayload,
  enrichInterviewWithNodeBindings,
  interviewHasContent,
  mergeEdgesByKey,
  mergeInterviewData,
  mergeNodesById,
  sanitizeGraphNodes,
} from "../../../features/process/lib/processStageDomain.js";
import { projectParsedBpmnToInterview } from "../../../features/process/hooks/useInterviewProjection.js";

const analysisFixture = {
  product_actions: [
    {
      id: "pa_test",
      bpmn_element_id: "Activity_Test",
      action_type: "нарезка",
      action_stage: "подготовка",
      action_object: "куриная грудка",
      action_method: "нож",
      source: "manual",
      confidence: 1,
      manual_corrected: true,
    },
  ],
  custom_marker: "preserve-me",
};

const projectionHelpers = {
  asArray,
  asObject,
  interviewHasContent,
  mergeInterviewData,
  sanitizeGraphNodes,
  mergeNodesById,
  mergeEdgesByKey,
  enrichInterviewWithNodeBindings,
};

test("normalizeInterview preserves interview.analysis product actions and custom keys", () => {
  const out = normalizeInterview({
    analysis: analysisFixture,
    steps: [{ id: "s1", action: "Нарезать", node_id: "Activity_Test", order_index: 1 }],
  });

  assert.deepEqual(out.analysis, analysisFixture);
  assert.equal(out.analysis.product_actions[0].action_object, "куриная грудка");
  assert.equal(out.analysis.custom_marker, "preserve-me");
});

test("normalizeInterview ignores unsafe analysis object keys", () => {
  const input = JSON.parse(
    '{"analysis":{"__proto__":{"polluted":true},"constructor":"unsafe","custom_marker":"safe"}}',
  );
  const out = normalizeInterview(input);

  assert.equal(out.analysis.custom_marker, "safe");
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn(out.analysis, "__proto__"), false);
  assert.equal(Object.hasOwn(out.analysis, "constructor"), false);
});

test("mergeInterviewData preserves base analysis when projection omits it", () => {
  const out = mergeInterviewData(
    {
      analysis: analysisFixture,
      steps: [{ id: "s1", action: "Нарезать", node_id: "Activity_Test" }],
    },
    {
      steps: [{ id: "s1", action: "Нарезать", node_id: "Activity_Test" }],
    },
    { preferBpmn: true },
  );

  assert.deepEqual(out.analysis, analysisFixture);
});

test("mergeInterviewData merges incoming analysis without losing sibling keys", () => {
  const out = mergeInterviewData(
    {
      analysis: analysisFixture,
      steps: [{ id: "s1", action: "Нарезать", node_id: "Activity_Test" }],
    },
    {
      analysis: { custom_marker: "updated", extra_marker: "incoming" },
      steps: [{ id: "s1", action: "Нарезать", node_id: "Activity_Test" }],
    },
  );

  assert.equal(out.analysis.custom_marker, "updated");
  assert.equal(out.analysis.extra_marker, "incoming");
  assert.deepEqual(out.analysis.product_actions, analysisFixture.product_actions);
});

test("BPMN projection preserves analysis during merge and imported-base hydration", () => {
  const parsed = {
    ok: true,
    interview: {
      steps: [{ id: "bpmn_s1", action: "Нарезать", node_id: "Activity_Test" }],
      transitions: [],
      subprocesses: [],
    },
    nodes: [{ id: "Activity_Test", type: "step", title: "Нарезать", parameters: {} }],
    edges: [],
    roles: [],
  };
  const draft = {
    interview: {
      analysis: analysisFixture,
      steps: [{ id: "s1", action: "Нарезать", node_id: "Activity_Test" }],
    },
    nodes: [],
    edges: [],
  };

  const merged = projectParsedBpmnToInterview({ parsed, draft, helpers: projectionHelpers });
  const importedBase = projectParsedBpmnToInterview({
    parsed,
    draft,
    helpers: projectionHelpers,
    canAutofillInterview: true,
  });

  assert.equal(merged.ok, true);
  assert.deepEqual(merged.nextInterview.analysis, analysisFixture);
  assert.equal(importedBase.ok, true);
  assert.deepEqual(importedBase.nextInterview.analysis, analysisFixture);
});

test("buildInterviewPatchPayload keeps analysis on interview autosave payload", () => {
  const nextInterview = {
    steps: [{ id: "s1", action: "Нарезать", node_id: "Activity_Test" }],
    analysis: analysisFixture,
  };

  const plan = buildInterviewPatchPayload(nextInterview, [], [], [], []);

  assert.deepEqual(plan.patch.interview.analysis, analysisFixture);
});
