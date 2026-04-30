import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBpmnMeta,
  normalizeFlowMetaMap,
  normalizeNodePathMetaMap,
  normalizeSequenceKey,
} from "./bpmnMetaNormalization.js";

test("bpmn meta normalization stores path classifications as primitive canonical values", () => {
  const meta = normalizeBpmnMeta({
    flow_meta: {
      Flow_1: { tier: { value: "ideal", label: "Идеальный" } },
      Flow_2: { tier: { value: "recovery", label: "Восстановление" } },
      Flow_3: { tier: { value: "escalation", label: "Неуспех / эскалация" } },
    },
    node_path_meta: {
      Task_1: {
        paths: [{ value: "alternative" }, { value: "failure" }],
        sequence_key: { key: "Primary alt 2", label: "Основной 2" },
      },
    },
  });

  assert.deepEqual(meta.flow_meta, {
    Flow_1: { tier: "P0" },
    Flow_2: { tier: "P1" },
    Flow_3: { tier: "P2" },
  });
  assert.deepEqual(meta.node_path_meta.Task_1, {
    paths: ["P1", "P2"],
    source: "manual",
    sequence_key: "primary_alt_2",
  });
  assert.doesNotMatch(JSON.stringify(meta), /object_object|\\[object Object\\]/);
});

test("bpmn meta normalization drops unknown objects instead of stringifying them", () => {
  assert.equal(normalizeSequenceKey({ label: "Основной" }), "");
  assert.deepEqual(normalizeFlowMetaMap({ Flow_1: { tier: { label: "Идеальный" } } }), {});
  assert.deepEqual(normalizeNodePathMetaMap({ Task_1: { paths: ["P0"], sequence_key: { label: "Основной" } } }), {
    Task_1: { paths: ["P0"], source: "manual" },
  });
});
