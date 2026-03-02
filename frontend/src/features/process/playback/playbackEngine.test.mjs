import assert from "node:assert/strict";
import test from "node:test";

import { createPlaybackEngine } from "./playbackEngine.js";

function makeGraph() {
  return {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_start_a"] },
      Task_A: { id: "Task_A", type: "bpmn:Task", name: "A", incomingFlowIds: ["Flow_start_a"], outgoingFlowIds: ["Flow_a_end"] },
      End_1: { id: "End_1", type: "bpmn:EndEvent", name: "End", incomingFlowIds: ["Flow_a_end"], outgoingFlowIds: [] },
    },
    flowsById: {
      Flow_start_a: { id: "Flow_start_a", sourceId: "Start_1", targetId: "Task_A", label: "" },
      Flow_a_end: { id: "Flow_a_end", sourceId: "Task_A", targetId: "End_1", label: "" },
    },
    startNodeIds: ["Start_1"],
  };
}

test("playback engine emits take_flow before enter_node for transitions", () => {
  const engine = createPlaybackEngine({ graph: makeGraph() });
  const events = [];
  for (let i = 0; i < 16; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    events.push(event);
    if (event.type === "stop") break;
  }
  const names = events.map((event) => event.type);
  assert.equal(names[0], "enter_node");
  assert.ok(names.includes("take_flow"));
  const firstTakeIdx = names.indexOf("take_flow");
  assert.equal(names[firstTakeIdx + 1], "enter_node");
  assert.equal(names[names.length - 1], "stop");
});

test("exclusive gateway picks flow by scenario tier metadata", () => {
  const graph = {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_s_x"] },
      XOR_1: { id: "XOR_1", type: "bpmn:ExclusiveGateway", name: "Decide", incomingFlowIds: ["Flow_s_x"], outgoingFlowIds: ["Flow_x_p0", "Flow_x_p1"] },
      Task_P0: { id: "Task_P0", type: "bpmn:Task", name: "P0", incomingFlowIds: ["Flow_x_p0"], outgoingFlowIds: ["Flow_p0_end"] },
      Task_P1: { id: "Task_P1", type: "bpmn:Task", name: "P1", incomingFlowIds: ["Flow_x_p1"], outgoingFlowIds: ["Flow_p1_end"] },
      End_1: { id: "End_1", type: "bpmn:EndEvent", name: "End", incomingFlowIds: ["Flow_p0_end", "Flow_p1_end"], outgoingFlowIds: [] },
    },
    flowsById: {
      Flow_s_x: { id: "Flow_s_x", sourceId: "Start_1", targetId: "XOR_1" },
      Flow_x_p0: { id: "Flow_x_p0", sourceId: "XOR_1", targetId: "Task_P0" },
      Flow_x_p1: { id: "Flow_x_p1", sourceId: "XOR_1", targetId: "Task_P1" },
      Flow_p0_end: { id: "Flow_p0_end", sourceId: "Task_P0", targetId: "End_1" },
      Flow_p1_end: { id: "Flow_p1_end", sourceId: "Task_P1", targetId: "End_1" },
    },
    startNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({
    graph,
    scenario: { tier: "P0" },
    flowMetaById: {
      Flow_x_p0: { tier: "P0" },
      Flow_x_p1: { tier: "P1" },
    },
  });
  const events = [];
  for (let i = 0; i < 20; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    events.push(event);
    if (event.type === "stop") break;
  }
  const xorTakeFlow = events.find((event) => event.type === "take_flow" && event.fromId === "XOR_1");
  assert.equal(xorTakeFlow?.flowId, "Flow_x_p0");
});

test("manual gateway mode pauses and resumes with selected outgoing flow", () => {
  const graph = {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_s_x"] },
      XOR_1: { id: "XOR_1", type: "bpmn:ExclusiveGateway", name: "Decide", incomingFlowIds: ["Flow_s_x"], outgoingFlowIds: ["Flow_x_a", "Flow_x_b"] },
      Task_A: { id: "Task_A", type: "bpmn:Task", name: "A", incomingFlowIds: ["Flow_x_a"], outgoingFlowIds: [] },
      Task_B: { id: "Task_B", type: "bpmn:Task", name: "B", incomingFlowIds: ["Flow_x_b"], outgoingFlowIds: [] },
    },
    flowsById: {
      Flow_s_x: { id: "Flow_s_x", sourceId: "Start_1", targetId: "XOR_1" },
      Flow_x_a: { id: "Flow_x_a", sourceId: "XOR_1", targetId: "Task_A", label: "A" },
      Flow_x_b: { id: "Flow_x_b", sourceId: "XOR_1", targetId: "Task_B", label: "B" },
    },
    startNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({
    graph,
    manualAtGateway: true,
  });
  let waitEvent = null;
  for (let i = 0; i < 10; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    if (event.type === "wait_for_gateway_decision") {
      waitEvent = event;
      break;
    }
  }
  assert.ok(waitEvent);
  assert.equal(waitEvent.gatewayId, "XOR_1");
  const decide = engine.chooseGatewayFlow("XOR_1", "Flow_x_b");
  assert.equal(decide.ok, true);
  const next = engine.nextEvent();
  assert.equal(next?.type, "take_flow");
  assert.equal(next?.flowId, "Flow_x_b");
});

test("parallel split/join waits all incoming flows before leaving join gateway", () => {
  const graph = {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_s_pg"] },
      PG_split: { id: "PG_split", type: "bpmn:ParallelGateway", name: "Split", incomingFlowIds: ["Flow_s_pg"], outgoingFlowIds: ["Flow_pg_a", "Flow_pg_b"] },
      Task_A: { id: "Task_A", type: "bpmn:Task", name: "A", incomingFlowIds: ["Flow_pg_a"], outgoingFlowIds: ["Flow_a_join"] },
      Task_B: { id: "Task_B", type: "bpmn:Task", name: "B", incomingFlowIds: ["Flow_pg_b"], outgoingFlowIds: ["Flow_b_join"] },
      PG_join: { id: "PG_join", type: "bpmn:ParallelGateway", name: "Join", incomingFlowIds: ["Flow_a_join", "Flow_b_join"], outgoingFlowIds: ["Flow_join_end"] },
      End_1: { id: "End_1", type: "bpmn:EndEvent", name: "End", incomingFlowIds: ["Flow_join_end"], outgoingFlowIds: [] },
    },
    flowsById: {
      Flow_s_pg: { id: "Flow_s_pg", sourceId: "Start_1", targetId: "PG_split" },
      Flow_pg_a: { id: "Flow_pg_a", sourceId: "PG_split", targetId: "Task_A" },
      Flow_pg_b: { id: "Flow_pg_b", sourceId: "PG_split", targetId: "Task_B" },
      Flow_a_join: { id: "Flow_a_join", sourceId: "Task_A", targetId: "PG_join" },
      Flow_b_join: { id: "Flow_b_join", sourceId: "Task_B", targetId: "PG_join" },
      Flow_join_end: { id: "Flow_join_end", sourceId: "PG_join", targetId: "End_1" },
    },
    startNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({ graph });
  const events = [];
  for (let i = 0; i < 60; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    events.push(event);
    if (event.type === "stop") break;
  }
  const splitBeginIdx = events.findIndex((event) => event.type === "parallel_batch_begin");
  assert.ok(splitBeginIdx >= 0);
  const joinOutgoingIdx = events.findIndex((event) => event.type === "take_flow" && event.fromId === "PG_join");
  const arriveAIdx = events.findIndex((event) => event.type === "take_flow" && event.flowId === "Flow_a_join");
  const arriveBIdx = events.findIndex((event) => event.type === "take_flow" && event.flowId === "Flow_b_join");
  assert.ok(joinOutgoingIdx > arriveAIdx);
  assert.ok(joinOutgoingIdx > arriveBIdx);
});

test("loop guard stops playback when node visit count exceeds limit", () => {
  const graph = {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_s_a"] },
      Task_A: { id: "Task_A", type: "bpmn:Task", name: "A", incomingFlowIds: ["Flow_s_a", "Flow_b_a"], outgoingFlowIds: ["Flow_a_b"] },
      Task_B: { id: "Task_B", type: "bpmn:Task", name: "B", incomingFlowIds: ["Flow_a_b"], outgoingFlowIds: ["Flow_b_a"] },
    },
    flowsById: {
      Flow_s_a: { id: "Flow_s_a", sourceId: "Start_1", targetId: "Task_A" },
      Flow_a_b: { id: "Flow_a_b", sourceId: "Task_A", targetId: "Task_B" },
      Flow_b_a: { id: "Flow_b_a", sourceId: "Task_B", targetId: "Task_A" },
    },
    startNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({ graph, loopLimit: 2 });
  let stopEvent = null;
  for (let i = 0; i < 80; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    if (event.type === "stop") {
      stopEvent = event;
      break;
    }
  }
  assert.ok(stopEvent);
  assert.equal(stopEvent.reason, "loop_limit_reached");
});

test("engine starts from a single top-level start by default", () => {
  const graph = {
    nodesById: {
      Start_A: { id: "Start_A", type: "bpmn:StartEvent", name: "Start A", incomingFlowIds: [], outgoingFlowIds: ["Flow_a_t1"] },
      Start_B: { id: "Start_B", type: "bpmn:StartEvent", name: "Start B", incomingFlowIds: [], outgoingFlowIds: ["Flow_b_t2"] },
      Task_1: { id: "Task_1", type: "bpmn:Task", name: "Task 1", incomingFlowIds: ["Flow_a_t1"], outgoingFlowIds: [] },
      Task_2: { id: "Task_2", type: "bpmn:Task", name: "Task 2", incomingFlowIds: ["Flow_b_t2"], outgoingFlowIds: [] },
    },
    flowsById: {
      Flow_a_t1: { id: "Flow_a_t1", sourceId: "Start_A", targetId: "Task_1" },
      Flow_b_t2: { id: "Flow_b_t2", sourceId: "Start_B", targetId: "Task_2" },
    },
    startNodeIds: ["Start_A", "Start_B"],
    topLevelStartNodeIds: ["Start_A", "Start_B"],
  };

  const engine = createPlaybackEngine({ graph });
  const first = engine.nextEvent();
  assert.equal(first?.type, "enter_node");
  assert.equal(first?.nodeId, "Start_A");
});
