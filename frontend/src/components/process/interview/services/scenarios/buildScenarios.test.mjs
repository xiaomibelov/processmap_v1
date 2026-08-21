import test from "node:test";
import assert from "node:assert/strict";

import { buildScenarios } from "./buildScenarios.js";
import { buildScenarioRows } from "./buildScenarioRows.js";

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

test("buildScenarios starts from StartEvent", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      Task_1: makeNode("Task_1", "task", "Task 1"),
      End_1: makeNode("End_1", "endevent", "End"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "Task_1", "P0")],
      Task_1: [makeFlow("F2", "Task_1", "End_1", "P0")],
      End_1: [],
    },
    incomingByNode: {
      Start_1: [],
      Task_1: [makeFlow("F1", "Start_1", "Task_1", "P0")],
      End_1: [makeFlow("F2", "Task_1", "End_1", "P0")],
    },
    startNodeIds: ["Start_1"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, { rankByNodeId: rankOf(["Start_1", "Task_1", "End_1"]) });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  assert.equal(primary.sequence[0].node_id, "Start_1");
});

test("parallel branches are grouped and linear flow remains intact", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      PG_split: makeNode("PG_split", "parallelgateway", "Parallel split"),
      Task_A: makeNode("Task_A", "task", "A"),
      Task_B: makeNode("Task_B", "task", "B"),
      PG_join: makeNode("PG_join", "parallelgateway", "Parallel join"),
      End_1: makeNode("End_1", "endevent", "End"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "PG_split", "P0")],
      PG_split: [
        makeFlow("F2", "PG_split", "Task_A", "P0"),
        makeFlow("F3", "PG_split", "Task_B", "P1"),
      ],
      Task_A: [makeFlow("F4", "Task_A", "PG_join", "P0")],
      Task_B: [makeFlow("F5", "Task_B", "PG_join", "P1")],
      PG_join: [makeFlow("F6", "PG_join", "End_1", "P0")],
      End_1: [],
    },
    incomingByNode: {
      Start_1: [],
      PG_split: [makeFlow("F1", "Start_1", "PG_split", "P0")],
      Task_A: [makeFlow("F2", "PG_split", "Task_A", "P0")],
      Task_B: [makeFlow("F3", "PG_split", "Task_B", "P1")],
      PG_join: [
        makeFlow("F4", "Task_A", "PG_join", "P0"),
        makeFlow("F5", "Task_B", "PG_join", "P1"),
      ],
      End_1: [makeFlow("F6", "PG_join", "End_1", "P0")],
    },
    startNodeIds: ["Start_1"],
    gatewayById: {
      PG_split: {
        id: "PG_split",
        mode: "parallel",
        isSplit: true,
        joinNodeId: "PG_join",
      },
    },
  };
  const scenarios = buildScenarios(graph, { rankByNodeId: rankOf(["Start_1", "PG_split", "Task_A", "Task_B", "PG_join", "End_1"]) });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  const parallelGroup = primary.groups.find((group) => group.kind === "parallel");
  assert.ok(parallelGroup);
  assert.equal(parallelGroup.anchor_node_id, "PG_split");
  assert.equal(parallelGroup.branches.length, 2);

  const rows = buildScenarioRows(primary);
  assert.equal(rows[0]?.node_id, "Start_1");
  const parallelRow = rows.find((row) => row.kind === "row_group" && row.row_type === "parallel");
  assert.ok(parallelRow);
  const splitStepRow = rows.find((row) => row.kind === "row_step" && row.node_id === "PG_split");
  const joinStepRow = rows.find((row) => row.kind === "row_step" && row.node_id === "PG_join");
  assert.ok(splitStepRow && joinStepRow);
  assert.ok(splitStepRow.order_index < parallelRow.order_index);
  assert.ok(parallelRow.order_index < joinStepRow.order_index);
});

test("gateway is present as decision node and rendered as gateway group", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      GW_1: makeNode("GW_1", "exclusivegateway", "Decision"),
      Task_Yes: makeNode("Task_Yes", "task", "Yes"),
      Task_No: makeNode("Task_No", "task", "No"),
      End_1: makeNode("End_1", "endevent", "End"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "GW_1", "P0")],
      GW_1: [
        makeFlow("F2", "GW_1", "Task_Yes", "P0", "Да"),
        makeFlow("F3", "GW_1", "Task_No", "P1", "Нет"),
      ],
      Task_Yes: [makeFlow("F4", "Task_Yes", "End_1", "P0")],
      Task_No: [makeFlow("F5", "Task_No", "End_1", "P1")],
      End_1: [],
    },
    incomingByNode: {
      Start_1: [],
      GW_1: [makeFlow("F1", "Start_1", "GW_1", "P0")],
      Task_Yes: [makeFlow("F2", "GW_1", "Task_Yes", "P0", "Да")],
      Task_No: [makeFlow("F3", "GW_1", "Task_No", "P1", "Нет")],
      End_1: [
        makeFlow("F4", "Task_Yes", "End_1", "P0"),
        makeFlow("F5", "Task_No", "End_1", "P1"),
      ],
    },
    startNodeIds: ["Start_1"],
    gatewayById: {
      GW_1: {
        id: "GW_1",
        mode: "xor",
        isSplit: true,
      },
    },
  };
  const scenarios = buildScenarios(graph, { rankByNodeId: rankOf(["Start_1", "GW_1", "Task_Yes", "Task_No", "End_1"]) });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  assert.ok(primary.sequence.some((step) => step.node_id === "GW_1"));
  assert.ok(primary.groups.some((group) => group.kind === "gateway" && group.anchor_node_id === "GW_1"));

  const rows = buildScenarioRows(primary);
  const decisionRow = rows.find((row) => row.kind === "row_step" && row.node_id === "GW_1");
  assert.ok(decisionRow);
  assert.equal(decisionRow.row_type, "decision");
  assert.equal(decisionRow?.decision?.selected_tier, "P0");
  const gatewayGroup = rows.find((row) => row.kind === "row_group" && row.row_type === "gateway");
  assert.ok(gatewayGroup);
  assert.ok(Array.isArray(gatewayGroup.children));
  assert.ok(gatewayGroup.children.length >= 2);
  const branchWithRows = gatewayGroup.children.find((row) => row.kind === "row_branch" && Array.isArray(row.children) && row.children.length > 0);
  assert.ok(branchWithRows);
});

test("cycles become LoopGroup and traversal stays finite", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      Task_A: makeNode("Task_A", "task", "A"),
      Task_B: makeNode("Task_B", "task", "B"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "Task_A", "P0")],
      Task_A: [makeFlow("F2", "Task_A", "Task_B", "P0")],
      Task_B: [makeFlow("F3", "Task_B", "Task_A", "P0")],
    },
    incomingByNode: {
      Start_1: [],
      Task_A: [
        makeFlow("F1", "Start_1", "Task_A", "P0"),
        makeFlow("F3", "Task_B", "Task_A", "P0"),
      ],
      Task_B: [makeFlow("F2", "Task_A", "Task_B", "P0")],
    },
    startNodeIds: ["Start_1"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "Task_A", "Task_B"]),
    maxDepth: 20,
  });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  const loopGroup = (Array.isArray(primary?.loop_groups) ? primary.loop_groups : []).find((group) => group?.kind === "loop")
    || (Array.isArray(primary?.groups) ? primary.groups : []).find((group) => group?.kind === "loop");
  assert.ok(loopGroup);
  const entryId = String(loopGroup.entry_node_id || loopGroup.anchor_node_id || "");
  const backToId = String(loopGroup.back_to_node_id || loopGroup.target_node_id || "");
  assert.ok(entryId === "Task_A" || entryId === "Task_B");
  assert.ok(backToId === "Task_A" || backToId === "Task_B");
  assert.notEqual(entryId, backToId);
  assert.ok(String(loopGroup.reason || "").length > 0);
  assert.ok(Number(loopGroup.expected_iterations || 0) >= 1);
  const rows = buildScenarioRows(primary);
  assert.ok(rows.some((row) => row.kind === "row_group" && row.row_type === "loop"));
  assert.ok(rows.length < 20);
});

test("scenario rows are hierarchical and always contain positive order_index", () => {
  const scenario = {
    id: "manual",
    sequence: [
      { kind: "step", node_id: "S1", node_type: "task", title: "Step 1" },
    ],
    groups: [
      {
        kind: "gateway",
        anchor_node_id: "S1",
        branches: [
          {
            key: "A",
            label: "Да",
            tier: "P0",
            children: [
              { kind: "step", node_id: "S2", node_type: "task", title: "Step 2" },
              { kind: "loop", target_node_id: "S1", target_title: "Step 1" },
            ],
          },
        ],
      },
    ],
  };

  const rows = buildScenarioRows(scenario);
  const gatewayGroup = rows.find((row) => row.kind === "row_group" && row.row_type === "gateway");
  assert.ok(gatewayGroup);
  const branch = gatewayGroup.children?.[0];
  assert.equal(branch?.kind, "row_branch");
  assert.ok((Array.isArray(branch?.children) ? branch.children : []).some((row) => row.kind === "row_group" && row.row_type === "loop"));
  assert.ok(rows.every((row) => Number.isFinite(Number(row?.order_index)) && Number(row?.order_index) > 0));
});

test("buildScenarios supports P0 ideal and positive alternatives in success end-state", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      GW_1: makeNode("GW_1", "exclusivegateway", "Choose"),
      Task_Ideal: makeNode("Task_Ideal", "task", "Ideal path"),
      Task_Alt: makeNode("Task_Alt", "task", "Alternative happy"),
      Task_Mitigated: makeNode("Task_Mitigated", "task", "Повторить и исправить"),
      Task_Fail: makeNode("Task_Fail", "task", "Failure"),
      End_OK: makeNode("End_OK", "endevent", "Success"),
      End_Fail: makeNode("End_Fail", "endevent", "Fail"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "GW_1", "P0")],
      GW_1: [
        makeFlow("F2", "GW_1", "Task_Ideal", "P0", "Да"),
        makeFlow("F3", "GW_1", "Task_Alt", "P0", "Альтернативно"),
        makeFlow("F4", "GW_1", "Task_Mitigated", "P1", "Повтор"),
        makeFlow("F5", "GW_1", "Task_Fail", "P2", "Нет"),
      ],
      Task_Ideal: [makeFlow("F6", "Task_Ideal", "End_OK", "P0")],
      Task_Alt: [makeFlow("F7", "Task_Alt", "End_OK", "P0")],
      Task_Mitigated: [makeFlow("F8", "Task_Mitigated", "End_OK", "P1")],
      Task_Fail: [makeFlow("F9", "Task_Fail", "End_Fail", "P2")],
      End_OK: [],
      End_Fail: [],
    },
    incomingByNode: {
      Start_1: [],
      GW_1: [makeFlow("F1", "Start_1", "GW_1", "P0")],
      Task_Ideal: [makeFlow("F2", "GW_1", "Task_Ideal", "P0", "Да")],
      Task_Alt: [makeFlow("F3", "GW_1", "Task_Alt", "P0", "Альтернативно")],
      Task_Mitigated: [makeFlow("F4", "GW_1", "Task_Mitigated", "P1", "Повтор")],
      Task_Fail: [makeFlow("F5", "GW_1", "Task_Fail", "P2", "Нет")],
      End_OK: [
        makeFlow("F6", "Task_Ideal", "End_OK", "P0"),
        makeFlow("F7", "Task_Alt", "End_OK", "P0"),
        makeFlow("F8", "Task_Mitigated", "End_OK", "P1"),
      ],
      End_Fail: [makeFlow("F9", "Task_Fail", "End_Fail", "P2")],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_OK", "End_Fail"],
    gatewayById: {
      GW_1: {
        id: "GW_1",
        mode: "xor",
        isSplit: true,
      },
    },
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "GW_1", "Task_Ideal", "Task_Alt", "Task_Mitigated", "Task_Fail", "End_OK", "End_Fail"]),
  });
  const ideal = scenarios.find((scenario) => scenario.id === "primary");
  const p0Alt = scenarios.find((scenario) => scenario?.rank_class === "alt_happy");
  const mitigated = scenarios.find((scenario) => String(scenario?.rank_class || "") === "mitigated");
  assert.ok(ideal);
  assert.equal(ideal.rank_class, "ideal");
  assert.equal(ideal.outcome, "success");
  assert.ok(p0Alt);
  assert.equal(p0Alt.rank_class, "alt_happy");
  assert.equal(p0Alt.outcome, "success");
  assert.ok(mitigated);
  assert.equal(mitigated.outcome, "success");
  assert.ok(p0Alt.diff_from_ideal);
  assert.ok(Array.isArray(p0Alt.diff_from_ideal.differing_gateway_decisions));
  assert.ok(Array.isArray(p0Alt.diff_from_ideal.additional_steps));
  assert.ok(Number(p0Alt.diff_from_ideal.additional_time_sec || 0) >= 0);
  assert.notEqual(
    ideal.sequence.map((step) => step.node_id).join(">"),
    p0Alt.sequence.map((step) => step.node_id).join(">"),
  );
});

test("outcome priority: explicit marker overrides name semantics", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      End_1: {
        ...makeNode("End_1", "endevent", "Ошибка"),
        outcomeHint: "success",
      },
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "End_1", "None")],
      End_1: [],
    },
    incomingByNode: {
      Start_1: [],
      End_1: [makeFlow("F1", "Start_1", "End_1", "None")],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_1"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "End_1"]),
  });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  assert.equal(primary.outcome, "success");
});

test("outcome by name: ambiguous end name becomes unknown", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      End_1: makeNode("End_1", "endevent", "Процесс завершён"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "End_1", "None")],
      End_1: [],
    },
    incomingByNode: {
      Start_1: [],
      End_1: [makeFlow("F1", "Start_1", "End_1", "None")],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_1"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "End_1"]),
  });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  assert.equal(primary.outcome, "unknown");
});

test("outcome by context: end reachable only through P2 is fail", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      Task_1: makeNode("Task_1", "task", "Try"),
      End_1: makeNode("End_1", "endevent", "Финиш"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "Task_1", "P2")],
      Task_1: [makeFlow("F2", "Task_1", "End_1", "P2")],
      End_1: [],
    },
    incomingByNode: {
      Start_1: [],
      Task_1: [makeFlow("F1", "Start_1", "Task_1", "P2")],
      End_1: [makeFlow("F2", "Task_1", "End_1", "P2")],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_1"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "Task_1", "End_1"]),
  });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  assert.equal(primary.outcome, "fail");
});

test("outcome is not guessed from scenario tier/rank_class", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      GW_1: makeNode("GW_1", "exclusivegateway", "Choose"),
      End_Generic: makeNode("End_Generic", "endevent", "End"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "GW_1", "None")],
      GW_1: [makeFlow("F2", "GW_1", "End_Generic", "None")],
      End_Generic: [],
    },
    incomingByNode: {
      Start_1: [],
      GW_1: [makeFlow("F1", "Start_1", "GW_1", "None")],
      End_Generic: [makeFlow("F2", "GW_1", "End_Generic", "None")],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_Generic"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "GW_1", "End_Generic"]),
  });
  const p2 = scenarios.find((scenario) => scenario.id === "p2_fail");
  assert.ok(p2);
  assert.equal(p2.rank_class, "fail");
  assert.equal(p2.outcome, "unknown");
});

test("mitigation tokens force success scenario rank to mitigated", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      Task_1: makeNode("Task_1", "task", "Повторить и исправить печать"),
      End_OK: makeNode("End_OK", "endevent", "Success"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "Task_1", "P0")],
      Task_1: [makeFlow("F2", "Task_1", "End_OK", "P0")],
      End_OK: [],
    },
    incomingByNode: {
      Start_1: [],
      Task_1: [makeFlow("F1", "Start_1", "Task_1", "P0")],
      End_OK: [makeFlow("F2", "Task_1", "End_OK", "P0")],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_OK"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, { rankByNodeId: rankOf(["Start_1", "Task_1", "End_OK"]) });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  assert.equal(primary.outcome, "success");
  assert.equal(primary.rank_class, "mitigated");
});

test("buildScenarios enumerates scenarios for each StartEvent", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start A"),
      Start_2: makeNode("Start_2", "startevent", "Start B"),
      Task_A: makeNode("Task_A", "task", "A"),
      Task_B: makeNode("Task_B", "task", "B"),
      End_OK: makeNode("End_OK", "endevent", "Success"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "Task_A", "P0")],
      Start_2: [makeFlow("F2", "Start_2", "Task_B", "P0")],
      Task_A: [makeFlow("F3", "Task_A", "End_OK", "P0")],
      Task_B: [makeFlow("F4", "Task_B", "End_OK", "P0")],
      End_OK: [],
    },
    incomingByNode: {
      Start_1: [],
      Start_2: [],
      Task_A: [makeFlow("F1", "Start_1", "Task_A", "P0")],
      Task_B: [makeFlow("F2", "Start_2", "Task_B", "P0")],
      End_OK: [
        makeFlow("F3", "Task_A", "End_OK", "P0"),
        makeFlow("F4", "Task_B", "End_OK", "P0"),
      ],
    },
    startNodeIds: ["Start_1", "Start_2"],
    endNodeIds: ["End_OK"],
    gatewayById: {},
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "Start_2", "Task_A", "Task_B", "End_OK"]),
    scenarioDefs: [
      {
        id: "primary",
        label: "P0",
        tier: "P0",
        rank_class: "ideal",
        priority: ["P0", "P1", "None", "P2"],
      },
    ],
    maxTotalScenarios: 10,
  });
  const startIds = new Set(scenarios.map((scenario) => String(scenario?.start_node_id || "")));
  assert.ok(startIds.has("Start_1"));
  assert.ok(startIds.has("Start_2"));
});

test("exclusive gateway branching respects alternatives and total scenarios limits", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      GW_1: makeNode("GW_1", "exclusivegateway", "Choose"),
      Task_A: makeNode("Task_A", "task", "A"),
      Task_B: makeNode("Task_B", "task", "B"),
      Task_C: makeNode("Task_C", "task", "C"),
      Task_D: makeNode("Task_D", "task", "D"),
      End_OK: makeNode("End_OK", "endevent", "Success"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "GW_1", "P0")],
      GW_1: [
        makeFlow("F2", "GW_1", "Task_A", "P0", "A"),
        makeFlow("F3", "GW_1", "Task_B", "P0", "B"),
        makeFlow("F4", "GW_1", "Task_C", "P0", "C"),
        makeFlow("F5", "GW_1", "Task_D", "P0", "D"),
      ],
      Task_A: [makeFlow("F6", "Task_A", "End_OK", "P0")],
      Task_B: [makeFlow("F7", "Task_B", "End_OK", "P0")],
      Task_C: [makeFlow("F8", "Task_C", "End_OK", "P0")],
      Task_D: [makeFlow("F9", "Task_D", "End_OK", "P0")],
      End_OK: [],
    },
    incomingByNode: {
      Start_1: [],
      GW_1: [makeFlow("F1", "Start_1", "GW_1", "P0")],
      Task_A: [makeFlow("F2", "GW_1", "Task_A", "P0", "A")],
      Task_B: [makeFlow("F3", "GW_1", "Task_B", "P0", "B")],
      Task_C: [makeFlow("F4", "GW_1", "Task_C", "P0", "C")],
      Task_D: [makeFlow("F5", "GW_1", "Task_D", "P0", "D")],
      End_OK: [
        makeFlow("F6", "Task_A", "End_OK", "P0"),
        makeFlow("F7", "Task_B", "End_OK", "P0"),
        makeFlow("F8", "Task_C", "End_OK", "P0"),
        makeFlow("F9", "Task_D", "End_OK", "P0"),
      ],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_OK"],
    gatewayById: {
      GW_1: {
        id: "GW_1",
        mode: "xor",
        isSplit: true,
      },
    },
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "GW_1", "Task_A", "Task_B", "Task_C", "Task_D", "End_OK"]),
    scenarioDefs: [
      {
        id: "primary",
        label: "P0",
        tier: "P0",
        rank_class: "ideal",
        priority: ["P0", "P1", "None", "P2"],
      },
    ],
    maxAlternativesPerGateway: 3,
    maxTotalScenarios: 3,
  });
  assert.ok(scenarios.length <= 3);
  assert.ok(scenarios.length >= 2);
  const decisionFlowIds = new Set(
    scenarios
      .map((scenario) => scenario?.sequence?.find((step) => step?.node_id === "GW_1")?.decision?.selected_flow_id)
      .map((id) => String(id || ""))
      .filter(Boolean),
  );
  assert.ok(decisionFlowIds.size >= 2);
});

test("loop back-edge creates LoopGroup and continues after first successful iteration", () => {
  const graph = {
    nodesById: {
      Start_1: makeNode("Start_1", "startevent", "Start"),
      GW_1: makeNode("GW_1", "exclusivegateway", "Retry?"),
      Task_Retry: makeNode("Task_Retry", "task", "Повторить"),
      Task_Success: makeNode("Task_Success", "task", "Продолжить"),
      End_OK: makeNode("End_OK", "endevent", "Success"),
    },
    outgoingByNode: {
      Start_1: [makeFlow("F1", "Start_1", "GW_1", "P0")],
      GW_1: [
        makeFlow("F2", "GW_1", "Task_Retry", "P0", "Повтор"),
        makeFlow("F3", "GW_1", "Task_Success", "P1", "Ок"),
      ],
      Task_Retry: [makeFlow("F4", "Task_Retry", "GW_1", "P0")],
      Task_Success: [makeFlow("F5", "Task_Success", "End_OK", "P1")],
      End_OK: [],
    },
    incomingByNode: {
      Start_1: [],
      GW_1: [
        makeFlow("F1", "Start_1", "GW_1", "P0"),
        makeFlow("F4", "Task_Retry", "GW_1", "P0"),
      ],
      Task_Retry: [makeFlow("F2", "GW_1", "Task_Retry", "P0", "Повтор")],
      Task_Success: [makeFlow("F3", "GW_1", "Task_Success", "P1", "Ок")],
      End_OK: [makeFlow("F5", "Task_Success", "End_OK", "P1")],
    },
    startNodeIds: ["Start_1"],
    endNodeIds: ["End_OK"],
    gatewayById: {
      GW_1: {
        id: "GW_1",
        mode: "xor",
        isSplit: true,
      },
    },
  };
  const scenarios = buildScenarios(graph, {
    rankByNodeId: rankOf(["Start_1", "GW_1", "Task_Retry", "Task_Success", "End_OK"]),
    scenarioDefs: [
      {
        id: "primary",
        label: "P0",
        tier: "P0",
        rank_class: "ideal",
        priority: ["P0", "P1", "None", "P2"],
      },
    ],
    loopPolicy: "single_iteration",
    maxDepth: 100,
    maxTotalScenarios: 5,
  });
  const primary = scenarios.find((scenario) => scenario.id === "primary");
  assert.ok(primary);
  assert.equal(primary.end_node_id, "End_OK");
  assert.ok((primary.loop_groups || []).length > 0);
  assert.ok(primary.sequence.some((step) => step.node_id === "Task_Success"));
});
