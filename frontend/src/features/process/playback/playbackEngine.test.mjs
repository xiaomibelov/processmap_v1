import assert from "node:assert/strict";
import test from "node:test";

import { classifyGateway, createPlaybackEngine } from "./playbackEngine.js";

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

test("classifyGateway returns merge/split/mixed/pass_through as expected", () => {
  assert.equal(classifyGateway({ incomingFlowIds: ["a", "b"], outgoingFlowIds: ["c"] }), "merge");
  assert.equal(classifyGateway({ incomingFlowIds: ["a", "b"], outgoingFlowIds: ["c", "d"] }), "mixed");
  assert.equal(classifyGateway({ incomingFlowIds: ["a"], outgoingFlowIds: ["b", "c"] }), "split");
  assert.equal(classifyGateway({ incomingFlowIds: ["a"], outgoingFlowIds: ["b"] }), "pass_through");
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
  const decideAgain = engine.chooseGatewayFlow("XOR_1", "Flow_x_a");
  assert.equal(decideAgain.ok, false);
  assert.equal(decideAgain.reason, "no_waiting_gateway");
  const next = engine.nextEvent();
  assert.equal(next?.type, "take_flow");
  assert.equal(next?.flowId, "Flow_x_b");
});

test("manual gateway options expose human labels and avoid raw gateway ids in labels", () => {
  const graph = {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_s_x"] },
      XOR_1: {
        id: "XOR_1",
        type: "bpmn:ExclusiveGateway",
        name: "Появилась кнопка?",
        incomingFlowIds: ["Flow_s_x"],
        outgoingFlowIds: ["Flow_x_yes", "Flow_x_no"],
      },
      Gateway_yes: { id: "Gateway_yes", type: "bpmn:ExclusiveGateway", name: "", incomingFlowIds: ["Flow_x_yes"], outgoingFlowIds: [] },
      Gateway_no: { id: "Gateway_no", type: "bpmn:ExclusiveGateway", name: "", incomingFlowIds: ["Flow_x_no"], outgoingFlowIds: [] },
    },
    flowsById: {
      Flow_s_x: { id: "Flow_s_x", sourceId: "Start_1", targetId: "XOR_1" },
      Flow_x_yes: { id: "Flow_x_yes", sourceId: "XOR_1", targetId: "Gateway_yes", conditionText: "approved == true" },
      Flow_x_no: { id: "Flow_x_no", sourceId: "XOR_1", targetId: "Gateway_no", conditionText: "approved == false" },
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
  const options = Array.isArray(waitEvent.outgoingOptions) ? waitEvent.outgoingOptions : [];
  assert.equal(options.length, 2);
  assert.deepEqual(
    options.map((item) => item.label),
    ["Да", "Нет"],
  );
  assert.ok(options.every((item) => !String(item.label || "").toLowerCase().includes("gateway_")));
});

test("after split decision engine auto-passes mixed gateway with single scenario candidate", () => {
  const graph = {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_s_split"] },
      XOR_split: {
        id: "XOR_split",
        type: "bpmn:ExclusiveGateway",
        name: "Split",
        incomingFlowIds: ["Flow_s_split"],
        outgoingFlowIds: ["Flow_split_yes", "Flow_split_no"],
      },
      Task_yes: {
        id: "Task_yes",
        type: "bpmn:Task",
        name: "Yes",
        incomingFlowIds: ["Flow_split_yes"],
        outgoingFlowIds: ["Flow_yes_merge"],
      },
      Task_no: {
        id: "Task_no",
        type: "bpmn:Task",
        name: "No",
        incomingFlowIds: ["Flow_split_no"],
        outgoingFlowIds: ["Flow_no_merge"],
      },
      XOR_merge_like: {
        id: "XOR_merge_like",
        type: "bpmn:ExclusiveGateway",
        name: "Merge/continue",
        incomingFlowIds: ["Flow_yes_merge", "Flow_no_merge"],
        outgoingFlowIds: ["Flow_merge_next", "Flow_merge_alt"],
      },
      Task_next: {
        id: "Task_next",
        type: "bpmn:Task",
        name: "Next",
        incomingFlowIds: ["Flow_merge_next"],
        outgoingFlowIds: ["Flow_next_end"],
      },
      Task_alt: {
        id: "Task_alt",
        type: "bpmn:Task",
        name: "Alt",
        incomingFlowIds: ["Flow_merge_alt"],
        outgoingFlowIds: [],
      },
      End_1: {
        id: "End_1",
        type: "bpmn:EndEvent",
        name: "End",
        incomingFlowIds: ["Flow_next_end"],
        outgoingFlowIds: [],
      },
    },
    flowsById: {
      Flow_s_split: { id: "Flow_s_split", sourceId: "Start_1", targetId: "XOR_split" },
      Flow_split_yes: { id: "Flow_split_yes", sourceId: "XOR_split", targetId: "Task_yes", conditionText: "yes" },
      Flow_split_no: { id: "Flow_split_no", sourceId: "XOR_split", targetId: "Task_no", conditionText: "no" },
      Flow_yes_merge: { id: "Flow_yes_merge", sourceId: "Task_yes", targetId: "XOR_merge_like" },
      Flow_no_merge: { id: "Flow_no_merge", sourceId: "Task_no", targetId: "XOR_merge_like" },
      Flow_merge_next: { id: "Flow_merge_next", sourceId: "XOR_merge_like", targetId: "Task_next" },
      Flow_merge_alt: { id: "Flow_merge_alt", sourceId: "XOR_merge_like", targetId: "Task_alt" },
      Flow_next_end: { id: "Flow_next_end", sourceId: "Task_next", targetId: "End_1" },
    },
    startNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({
    graph,
    manualAtGateway: true,
    scenario: { tier: "P0" },
    flowMetaById: {
      Flow_merge_next: { tier: "P0" },
      Flow_merge_alt: { tier: "P2" },
    },
  });

  let firstWait = null;
  for (let i = 0; i < 16; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    if (event.type === "wait_for_gateway_decision") {
      firstWait = event;
      break;
    }
  }
  assert.ok(firstWait);
  assert.equal(firstWait.gatewayId, "XOR_split");

  const choose = engine.chooseGatewayFlow("XOR_split", "Flow_split_no");
  assert.equal(choose.ok, true);

  const tail = [];
  for (let i = 0; i < 32; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    tail.push(event);
    if (event.type === "stop") break;
  }

  const waitsAtMergeLike = tail.filter(
    (event) => event.type === "wait_for_gateway_decision" && event.gatewayId === "XOR_merge_like",
  );
  assert.equal(waitsAtMergeLike.length, 0);
  const mergeTake = tail.find(
    (event) => event.type === "take_flow" && event.fromId === "XOR_merge_like",
  );
  assert.equal(mergeTake?.flowId, "Flow_merge_next");
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

test("parallel join does not trip loop guard from multiple incoming arrivals in one join cycle", () => {
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
  const engine = createPlaybackEngine({ graph, loopLimit: 1 });
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
  assert.equal(stopEvent.reason, "ok_complete");
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

test("link throw event jumps to matching catch event and continues flow", () => {
  const graph = {
    nodesById: {
      Start_1: {
        id: "Start_1",
        type: "bpmn:StartEvent",
        name: "Start",
        incomingFlowIds: [],
        outgoingFlowIds: ["Flow_s_a"],
      },
      Task_A: {
        id: "Task_A",
        type: "bpmn:Task",
        name: "Before link",
        incomingFlowIds: ["Flow_s_a"],
        outgoingFlowIds: ["Flow_a_throw"],
      },
      Link_Throw: {
        id: "Link_Throw",
        type: "bpmn:IntermediateThrowEvent",
        name: "RESTART_SOUP",
        incomingFlowIds: ["Flow_a_throw"],
        outgoingFlowIds: [],
        linkEventKind: "throw",
        linkEventName: "RESTART_SOUP",
      },
      Link_Catch: {
        id: "Link_Catch",
        type: "bpmn:IntermediateCatchEvent",
        name: "RESTART_SOUP",
        incomingFlowIds: [],
        outgoingFlowIds: ["Flow_c_b"],
        linkEventKind: "catch",
        linkEventName: "RESTART_SOUP",
      },
      Task_B: {
        id: "Task_B",
        type: "bpmn:Task",
        name: "After link",
        incomingFlowIds: ["Flow_c_b"],
        outgoingFlowIds: ["Flow_b_end"],
      },
      End_1: {
        id: "End_1",
        type: "bpmn:EndEvent",
        name: "End",
        incomingFlowIds: ["Flow_b_end"],
        outgoingFlowIds: [],
      },
    },
    flowsById: {
      Flow_s_a: { id: "Flow_s_a", sourceId: "Start_1", targetId: "Task_A" },
      Flow_a_throw: { id: "Flow_a_throw", sourceId: "Task_A", targetId: "Link_Throw" },
      Flow_c_b: { id: "Flow_c_b", sourceId: "Link_Catch", targetId: "Task_B" },
      Flow_b_end: { id: "Flow_b_end", sourceId: "Task_B", targetId: "End_1" },
    },
    startNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({ graph });
  const events = [];
  for (let i = 0; i < 40; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    events.push(event);
    if (event.type === "stop") break;
  }

  const linkTakeIdx = events.findIndex(
    (event) => event.type === "take_flow" && event.linkJump === true && event.fromId === "Link_Throw",
  );
  assert.ok(linkTakeIdx >= 0);
  assert.equal(events[linkTakeIdx + 1]?.type, "enter_node");
  assert.equal(events[linkTakeIdx + 1]?.nodeId, "Link_Catch");
  const stopEvent = events.find((event) => event.type === "stop");
  assert.equal(stopEvent?.reason, "ok_complete");
});

test("stop event contains playback metrics: steps, variations and decisions", () => {
  const graph = {
    nodesById: {
      Start_1: { id: "Start_1", type: "bpmn:StartEvent", name: "Start", incomingFlowIds: [], outgoingFlowIds: ["Flow_s_x"] },
      XOR_1: {
        id: "XOR_1",
        type: "bpmn:ExclusiveGateway",
        name: "Choice",
        incomingFlowIds: ["Flow_s_x"],
        outgoingFlowIds: ["Flow_x_yes", "Flow_x_no"],
      },
      Task_yes: { id: "Task_yes", type: "bpmn:Task", name: "Yes", incomingFlowIds: ["Flow_x_yes"], outgoingFlowIds: ["Flow_yes_end"] },
      Task_no: { id: "Task_no", type: "bpmn:Task", name: "No", incomingFlowIds: ["Flow_x_no"], outgoingFlowIds: ["Flow_no_end"] },
      End_1: { id: "End_1", type: "bpmn:EndEvent", name: "End", incomingFlowIds: ["Flow_yes_end", "Flow_no_end"], outgoingFlowIds: [] },
    },
    flowsById: {
      Flow_s_x: { id: "Flow_s_x", sourceId: "Start_1", targetId: "XOR_1" },
      Flow_x_yes: { id: "Flow_x_yes", sourceId: "XOR_1", targetId: "Task_yes", conditionText: "yes" },
      Flow_x_no: { id: "Flow_x_no", sourceId: "XOR_1", targetId: "Task_no", conditionText: "no" },
      Flow_yes_end: { id: "Flow_yes_end", sourceId: "Task_yes", targetId: "End_1" },
      Flow_no_end: { id: "Flow_no_end", sourceId: "Task_no", targetId: "End_1" },
    },
    startNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({ graph, manualAtGateway: false });
  let stopEvent = null;
  for (let i = 0; i < 40; i += 1) {
    const event = engine.nextEvent();
    if (!event) break;
    if (event.type === "stop") {
      stopEvent = event;
      break;
    }
  }
  assert.ok(stopEvent);
  const metrics = stopEvent.metrics || {};
  assert.equal(typeof metrics.stepsTotal, "number");
  assert.equal(typeof metrics.variationPoints, "number");
  assert.equal(typeof metrics.manualDecisionsApplied, "number");
  assert.equal(typeof metrics.autoDecisionsApplied, "number");
  assert.ok(metrics.stepsTotal >= 1);
  assert.ok(metrics.variationPoints >= 1);
  assert.ok(metrics.autoDecisionsApplied >= 1);
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
