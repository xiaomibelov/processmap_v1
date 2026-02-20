import test from "node:test";
import assert from "node:assert/strict";

import { buildTimelineView } from "./timelineViewModel.js";

test("timelineViewModel: falls back to backend nodes when interview steps are empty", () => {
  const out = buildTimelineView({
    steps: [],
    backendNodes: [
      { id: "Activity_B", title: "B step", actorRole: "Повар 2", nodeType: "step", bpmnKind: "task", parameters: {} },
      { id: "Activity_A", title: "A step", actorRole: "Повар 1", nodeType: "step", bpmnKind: "task", parameters: {} },
    ],
    graphNodeRank: { Activity_A: 0, Activity_B: 1 },
  });

  assert.equal(out.length, 2);
  assert.equal(out[0].action, "A step");
  assert.equal(out[1].action, "B step");
  assert.equal(out[0].seq, 1);
  assert.equal(out[1].seq, 2);
});

test("timelineViewModel: keeps interview steps when they exist", () => {
  const out = buildTimelineView({
    steps: [
      {
        id: "step_1",
        node_id: "",
        area: "Бригадир",
        type: "operation",
        action: "Ручной шаг",
        subprocess: "",
        comment: "",
        role: "Бригадир",
        duration_min: "7",
        wait_min: "0",
        output: "",
      },
    ],
    backendNodes: [
      { id: "Activity_1", title: "Из BPMN", actorRole: "Повар", nodeType: "step", bpmnKind: "task", parameters: {} },
    ],
    graphNodeRank: { Activity_1: 0 },
  });

  assert.equal(out.length, 1);
  assert.equal(out[0].action, "Ручной шаг");
  assert.equal(out[0].duration, 7);
});

test("timelineViewModel: binds step by node title and lane metadata", () => {
  const out = buildTimelineView({
    steps: [
      {
        id: "step_title_bind",
        node_id: "",
        area: "",
        type: "operation",
        action: "Проверить качество",
        subprocess: "",
        comment: "",
        role: "",
        duration_min: "10",
        wait_min: "0",
        output: "",
      },
    ],
    backendNodes: [
      {
        id: "Activity_qc",
        title: "Проверить качество",
        actorRole: "Контролёр",
        nodeType: "step",
        bpmnKind: "task",
        parameters: {},
      },
    ],
    graphNodeRank: { Activity_qc: 0 },
  });

  assert.equal(out.length, 1);
  assert.equal(out[0].node_bound, true);
  assert.equal(out[0].node_bind_id, "Activity_qc");
  assert.equal(out[0].lane_name, "Контролёр");
});

test("timelineViewModel: keeps lanes separate for equal lane names from different pools", () => {
  const out = buildTimelineView({
    steps: [],
    backendNodes: [
      { id: "Activity_A", title: "Шаг A", actorRole: "Повар", nodeType: "step", bpmnKind: "task", parameters: {} },
      { id: "Activity_B", title: "Шаг B", actorRole: "Повар", nodeType: "step", bpmnKind: "task", parameters: {} },
    ],
    graphNodeRank: { Activity_A: 0, Activity_B: 1 },
    laneMetaByNode: {
      Activity_A: { key: "Pool_1::Lane_1", name: "Повар", label: "Пул 1: Повар" },
      Activity_B: { key: "Pool_2::Lane_2", name: "Повар", label: "Пул 2: Повар" },
    },
  });

  assert.equal(out.length, 2);
  assert.equal(out[0].lane_name, "Пул 1: Повар");
  assert.equal(out[1].lane_name, "Пул 2: Повар");
  assert.notEqual(out[0].lane_key, out[1].lane_key);
  assert.notEqual(out[0].lane_idx, out[1].lane_idx);
});
