import test from "node:test";
import assert from "node:assert/strict";

import { buildScenarios } from "./buildScenarios.js";
import { buildScenarioRows } from "./buildScenarioRows.js";
import { buildScenarioMatrixRows, validateScenarioRowOrder } from "./buildScenarioMatrixRows.js";

function rankOf(ids) {
  const out = {};
  ids.forEach((id, idx) => {
    out[id] = idx + 1;
  });
  return out;
}

function makeNode(id, type, name = id) {
  return { id, type, name };
}

function makeFlow(id, sourceId, targetId, tier = "None", condition = "") {
  return { id, sourceId, targetId, tier, condition };
}

function buildBaseGraph() {
  return {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Старт"),
      Task_1: makeNode("Task_1", "task", "Шаг 1"),
      GW_1: makeNode("GW_1", "exclusivegateway", "Решение"),
      Task_2: makeNode("Task_2", "task", "Шаг 2"),
      Task_3: makeNode("Task_3", "task", "Шаг 3"),
      End_OK: makeNode("End_OK", "endevent", "Успех"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "Task_1", "P0")],
      Task_1: [makeFlow("F2", "Task_1", "GW_1", "P0")],
      GW_1: [
        makeFlow("F3", "GW_1", "Task_2", "P0", "Да"),
        makeFlow("F4", "GW_1", "Task_3", "P1", "Нет"),
      ],
      Task_2: [makeFlow("F5", "Task_2", "End_OK", "P0")],
      Task_3: [makeFlow("F6", "Task_3", "End_OK", "P1")],
      End_OK: [],
    },
    incomingByNode: {
      Start_1: [],
      Task_1: [makeFlow("F1", "Start_1", "Task_1", "P0")],
      GW_1: [makeFlow("F2", "Task_1", "GW_1", "P0")],
      Task_2: [makeFlow("F3", "GW_1", "Task_2", "P0", "Да")],
      Task_3: [makeFlow("F4", "GW_1", "Task_3", "P1", "Нет")],
      End_OK: [
        makeFlow("F5", "Task_2", "End_OK", "P0"),
        makeFlow("F6", "Task_3", "End_OK", "P1"),
      ],
    },
    startNodeIds: ["Start_1"],
    gatewayById: {
      GW_1: { id: "GW_1", mode: "xor", isSplit: true },
    },
  };
}

test("scenario matrix rows keep execution order from start", () => {
  const graph = buildBaseGraph();
  const scenarios = buildScenarios(graph, { rankByNodeId: rankOf(["Start_1", "Task_1", "GW_1", "Task_2", "Task_3", "End_OK"]) });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  const scenario = { ...primary, rows: buildScenarioRows(primary) };
  const vmSteps = [
    { node_id: "Start_1", lane_name: "L1", duration_sec: 0 },
    { node_id: "Task_1", lane_name: "L1", duration_sec: 10 },
    { node_id: "GW_1", lane_name: "L1", duration_sec: 0 },
    { node_id: "Task_2", lane_name: "L1", duration_sec: 15 },
    { node_id: "End_OK", lane_name: "L1", duration_sec: 0 },
  ];
  const matrixRows = buildScenarioMatrixRows({ scenario, vmSteps, p0Mode: true });
  const stepRows = matrixRows.filter((row) => row.kind === "step" || row.kind === "decision");
  assert.ok(stepRows.length >= 5);
  assert.equal(stepRows[0].node_type, "startevent");
  assert.deepEqual(stepRows.slice(0, 5).map((row) => row.node_id), ["Start_1", "Task_1", "GW_1", "Task_2", "End_OK"]);
  const check = validateScenarioRowOrder(matrixRows);
  assert.equal(check.ok, true);
});

test("decision row contains selected flow and alternatives", () => {
  const graph = buildBaseGraph();
  const scenarios = buildScenarios(graph, { rankByNodeId: rankOf(["Start_1", "Task_1", "GW_1", "Task_2", "Task_3", "End_OK"]) });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  const scenario = { ...primary, rows: buildScenarioRows(primary) };
  const matrixRows = buildScenarioMatrixRows({ scenario, vmSteps: [] });
  const decision = matrixRows.find((row) => row.kind === "decision" && row.node_id === "GW_1");
  assert.ok(decision);
  assert.equal(decision.decision_key, "GW_1");
  assert.ok(String(decision.selected_outgoing_flow_id || "").length > 0);
  assert.ok(Number(decision.alternatives_count || 0) >= 1);
});

test("loop group is represented as explicit group rows", () => {
  const scenario = {
    id: "loop_case",
    rows: [
      { kind: "row_step", row_type: "step", order_index: 1, node_id: "Start_1", node_type: "startevent", title: "Старт", lane_name: "L1" },
      {
        kind: "row_group",
        row_type: "loop",
        order_index: 2,
        id: "loop_A",
        title: "Loop A",
        entry_node_id: "Task_A",
        back_to_node_id: "Task_A",
        reason: "visited_edge",
        expected_iterations: 1,
        children: [],
      },
    ],
    sequence: [
      { node_id: "Start_1", node_type: "startevent", title: "Старт" },
    ],
  };
  const matrixRows = buildScenarioMatrixRows({ scenario, vmSteps: [] });
  const loopHeader = matrixRows.find((row) => row.kind === "group_header" && row.row_type === "loop");
  assert.ok(loopHeader);
  assert.equal(loopHeader.collapsed, true);
});
