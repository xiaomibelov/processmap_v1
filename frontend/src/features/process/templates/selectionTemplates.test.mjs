import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSelectionTemplatePayload,
  canCreateOrgTemplate,
  canManageOrgTemplate,
  normalizeTemplateElementIds,
  normalizeTemplateElementRefs,
  normalizeTemplateScope,
  readTemplateElementIds,
  readTemplateElementRefs,
  remapTemplateNodeIdsByRefs,
} from "./selectionTemplates.js";

test("normalizeTemplateScope: defaults to personal", () => {
  assert.equal(normalizeTemplateScope(""), "personal");
  assert.equal(normalizeTemplateScope("PERSONAL"), "personal");
  assert.equal(normalizeTemplateScope("org"), "org");
});

test("normalizeTemplateElementIds: trims + dedupes", () => {
  assert.deepEqual(
    normalizeTemplateElementIds([" Task_1 ", "", "Task_1", "Task_2"]),
    ["Task_1", "Task_2"],
  );
});

test("buildSelectionTemplatePayload: serializes ids + fingerprint", () => {
  const payload = buildSelectionTemplatePayload({
    selectedElementIds: ["Task_1", "Task_2", "Task_1"],
    selectedElementRefs: [
      { id: "Task_1", kind: "node", name: "Step A", type: "userTask", lane_name: "Lane 1" },
      { id: "Task_2", kind: "edge", name: "", type: "", lane_name: "" },
    ],
    bpmnFingerprint: " fp_1 ",
  });
  assert.deepEqual(payload, {
    bpmn_element_ids: ["Task_1", "Task_2"],
    bpmn_element_refs: [
      { id: "Task_1", kind: "node", name: "Step A", type: "userTask", lane_name: "Lane 1" },
      { id: "Task_2", kind: "edge", name: "", type: "", lane_name: "" },
    ],
    bpmn_fingerprint: "fp_1",
  });
});

test("readTemplateElementIds: reads payload ids safely", () => {
  assert.deepEqual(readTemplateElementIds({ payload: { bpmn_element_ids: ["Task_1", "Task_2"] } }), ["Task_1", "Task_2"]);
  assert.deepEqual(readTemplateElementIds({}), []);
});

test("normalize/read refs: trims + filters by ids", () => {
  assert.deepEqual(
    normalizeTemplateElementRefs([
      { id: " Task_1 ", kind: "node", name: " A ", type: " userTask ", lane_name: " L1 " },
      { id: "Task_1", kind: "node", name: "dup" },
      { id: "Task_3", kind: "node", name: "skip" },
    ], ["Task_1", "Task_2"]),
    [{ id: "Task_1", kind: "node", name: "A", type: "userTask", lane_name: "L1" }],
  );
  assert.deepEqual(
    readTemplateElementRefs({
      payload: {
        bpmn_element_ids: ["Task_1"],
        bpmn_element_refs: [{ id: "Task_1", kind: "node", name: "A", type: "userTask", lane_name: "L1" }],
      },
    }),
    [{ id: "Task_1", kind: "node", name: "A", type: "userTask", lane_name: "L1" }],
  );
});

test("remapTemplateNodeIdsByRefs: maps by name/type/lane when id missing", () => {
  const result = remapTemplateNodeIdsByRefs({
    ids: ["Task_1", "Task_2"],
    elementRefs: [
      { id: "Task_1", kind: "node", name: "Принять заказ", type: "userTask", lane_name: "Оператор" },
      { id: "Task_2", kind: "node", name: "Готовить суп", type: "serviceTask", lane_name: "Кухня" },
    ],
    currentNodesById: {
      Activity_A: { name: "Принять заказ", type: "userTask", lane_name: "Оператор" },
      Activity_B: { name: "Готовить суп", type: "serviceTask", lane_name: "Кухня" },
    },
    selectedIds: [],
  });
  assert.deepEqual(result.mappedIds, ["Activity_A", "Activity_B"]);
  assert.deepEqual(result.missingIds, []);
  assert.equal(result.remappedCount, 2);
});

test("remapTemplateNodeIdsByRefs: keeps missing on ambiguous matches", () => {
  const result = remapTemplateNodeIdsByRefs({
    ids: ["Task_1"],
    elementRefs: [{ id: "Task_1", kind: "node", name: "Step", type: "userTask", lane_name: "" }],
    currentNodesById: {
      Activity_A: { name: "Step", type: "userTask", lane_name: "L1" },
      Activity_B: { name: "Step", type: "userTask", lane_name: "L2" },
    },
  });
  assert.deepEqual(result.mappedIds, []);
  assert.deepEqual(result.missingIds, ["Task_1"]);
  assert.equal(result.ambiguousCount, 1);
});

test("remapTemplateNodeIdsByRefs: remaps edge by mapped source/target nodes", () => {
  const result = remapTemplateNodeIdsByRefs({
    ids: ["Task_1", "Task_2", "Flow_1"],
    elementRefs: [
      { id: "Task_1", kind: "node", name: "Принять заказ", type: "userTask", lane_name: "Оператор" },
      { id: "Task_2", kind: "node", name: "Готовить суп", type: "serviceTask", lane_name: "Кухня" },
      { id: "Flow_1", kind: "edge", source_id: "Task_1", target_id: "Task_2" },
    ],
    currentNodesById: {
      Activity_A: { name: "Принять заказ", type: "userTask", lane_name: "Оператор" },
      Activity_B: { name: "Готовить суп", type: "serviceTask", lane_name: "Кухня" },
    },
    currentFlowsById: {
      Sequence_X: { sourceId: "Activity_A", targetId: "Activity_B", name: "to soup" },
    },
    selectedIds: [],
  });
  assert.deepEqual(result.mappedIds, ["Activity_A", "Activity_B", "Sequence_X"]);
  assert.deepEqual(result.missingIds, []);
  assert.equal(result.remappedCount, 3);
});

test("remapTemplateNodeIdsByRefs: resolves ambiguous node by incoming/outgoing context", () => {
  const result = remapTemplateNodeIdsByRefs({
    ids: ["Task_1"],
    elementRefs: [
      {
        id: "Task_1",
        kind: "node",
        name: "Сборка",
        type: "userTask",
        incoming_count: 1,
        outgoing_count: 1,
        incoming_names: ["Старт"],
        outgoing_names: ["Проверка"],
      },
    ],
    currentNodesById: {
      Activity_A: { name: "Сборка", type: "userTask" },
      Activity_B: { name: "Сборка", type: "userTask" },
      Activity_Start: { name: "Старт", type: "startEvent" },
      Activity_Check: { name: "Проверка", type: "userTask" },
      Activity_Other: { name: "Иное", type: "userTask" },
    },
    currentFlowsById: {
      F1: { sourceId: "Activity_Start", targetId: "Activity_A" },
      F2: { sourceId: "Activity_A", targetId: "Activity_Check" },
      F3: { sourceId: "Activity_Other", targetId: "Activity_B" },
      F4: { sourceId: "Activity_B", targetId: "Activity_Other" },
    },
  });
  assert.deepEqual(result.mappedIds, ["Activity_A"]);
  assert.deepEqual(result.missingIds, []);
  assert.equal(result.remappedCount, 1);
});

test("rbac: org template create/manage", () => {
  assert.equal(canCreateOrgTemplate("project_manager", false), true);
  assert.equal(canCreateOrgTemplate("viewer", false), false);
  assert.equal(canManageOrgTemplate("org_admin", false), true);
  assert.equal(canManageOrgTemplate("project_manager", false), false);
  assert.equal(canManageOrgTemplate("", true), true);
});
