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

test("timelineViewModel: nests subprocess children under subprocess container in bpmn order", () => {
  const out = buildTimelineView({
    steps: [
      {
        id: "step_main_start",
        node_id: "Event_main",
        area: "Лайн 1",
        type: "operation",
        action: "Старт",
        duration_min: "0",
        wait_min: "0",
      },
      {
        id: "step_sub_task",
        node_id: "Activity_sub_child",
        area: "Лайн 1",
        type: "operation",
        action: "Дочерний подпроцессный шаг",
        duration_min: "5",
        wait_min: "0",
      },
      {
        id: "step_main_next",
        node_id: "Activity_main",
        area: "Лайн 1",
        type: "operation",
        action: "Основной шаг",
        duration_min: "5",
        wait_min: "0",
      },
      {
        id: "step_sub_container",
        node_id: "Sub_1",
        area: "Лайн 1",
        type: "operation",
        action: "Подпроцесс",
        duration_min: "0",
        wait_min: "0",
      },
    ],
    backendNodes: [
      { id: "Event_main", title: "Старт", actorRole: "Лайн 1", nodeType: "event", bpmnKind: "startEvent", parameters: {} },
      { id: "Activity_main", title: "Основной шаг", actorRole: "Лайн 1", nodeType: "step", bpmnKind: "task", parameters: {} },
      { id: "Sub_1", title: "Подпроцесс", actorRole: "Лайн 1", nodeType: "step", bpmnKind: "subProcess", parameters: {} },
      { id: "Activity_sub_child", title: "Дочерний подпроцессный шаг", actorRole: "Лайн 1", nodeType: "step", bpmnKind: "task", parameters: {} },
    ],
    graphNodeRank: {
      Event_main: 0,
      Activity_main: 1,
      Sub_1: 2,
      Activity_sub_child: 3,
    },
    subprocessMetaByNode: {
      Sub_1: { nodeId: "Sub_1", isSubprocessContainer: true, parentSubprocessId: "", parentSubprocessName: "", depth: 0 },
      Activity_sub_child: { nodeId: "Activity_sub_child", isSubprocessContainer: false, parentSubprocessId: "Sub_1", parentSubprocessName: "Подпроцесс", depth: 1 },
    },
    preferGraphOrder: true,
  });

  assert.equal(out.length, 4);
  assert.equal(out[0].id, "step_main_start");
  assert.equal(out[1].id, "step_main_next");
  assert.equal(out[2].id, "step_sub_container");
  assert.equal(out[3].id, "step_sub_task");
  assert.equal(out[2].seq_label, "3");
  assert.equal(out[3].seq_label, "3.1");
  assert.equal(out[3].is_subprocess_child, true);
  assert.equal(out[3].subprocess_parent_step_id, "step_sub_container");
});

test("timelineViewModel: parallel gateway keeps own sequence label (no forced parent suffix)", () => {
  const out = buildTimelineView({
    steps: [
      {
        id: "step_6",
        node_id: "Gateway_6",
        area: "Lane A",
        type: "operation",
        action: "Решение",
        duration_min: "0",
        wait_min: "0",
      },
      {
        id: "step_23",
        node_id: "Gateway_23",
        area: "Lane B",
        type: "operation",
        action: "Параллельный процесс",
        duration_min: "0",
        wait_min: "0",
      },
    ],
    backendNodes: [
      { id: "Gateway_6", title: "Решение", actorRole: "Lane A", nodeType: "gateway", bpmnKind: "exclusiveGateway", parameters: {} },
      { id: "Gateway_23", title: "Параллельный процесс", actorRole: "Lane B", nodeType: "gateway", bpmnKind: "parallelGateway", parameters: {} },
    ],
    graphNodeRank: {
      Gateway_6: 5,
      Gateway_23: 22,
    },
    preferGraphOrder: true,
  });

  assert.equal(out[0].seq_label, "1");
  assert.equal(out[1].seq_label, "2");
});

test("timelineViewModel: creation order keeps order_index even when graph rank differs", () => {
  const out = buildTimelineView({
    steps: [
      {
        id: "step_B",
        node_id: "B",
        order_index: 1,
        action: "B",
        area: "Lane",
        role: "Lane",
      },
      {
        id: "step_A",
        node_id: "A",
        order_index: 2,
        action: "A",
        area: "Lane",
        role: "Lane",
      },
    ],
    backendNodes: [
      { id: "A", title: "A", actorRole: "Lane", nodeType: "task", bpmnKind: "task", parameters: {} },
      { id: "B", title: "B", actorRole: "Lane", nodeType: "task", bpmnKind: "task", parameters: {} },
    ],
    graphNodeRank: { A: 0, B: 1 },
    preferGraphOrder: false,
  });

  assert.deepEqual(out.map((row) => row.id), ["step_B", "step_A"]);
  assert.equal(out[0]._order_index, 1);
  assert.equal(out[1]._order_index, 2);
});
