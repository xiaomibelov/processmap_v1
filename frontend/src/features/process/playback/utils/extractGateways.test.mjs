import test from "node:test";
import assert from "node:assert/strict";
import { extractGateways } from "./extractGateways.js";

test("extractGateways returns gateway rows with outgoing choices", () => {
  const graph = {
    nodesById: {
      Gateway_1: {
        id: "Gateway_1",
        type: "bpmn:ExclusiveGateway",
        name: "Route A",
        outgoingFlowIds: ["Flow_yes", "Flow_no"],
      },
      Task_yes: { id: "Task_yes", type: "bpmn:Task", name: "Approve" },
      Task_no: { id: "Task_no", type: "bpmn:Task", name: "Reject" },
    },
    flowsById: {
      Flow_yes: { id: "Flow_yes", targetId: "Task_yes", label: "YES" },
      Flow_no: { id: "Flow_no", targetId: "Task_no" },
    },
  };
  const out = extractGateways(graph);
  assert.equal(out.length, 1);
  assert.equal(out[0].gateway_id, "Gateway_1");
  assert.equal(out[0].outgoing.length, 2);
  assert.deepEqual(
    out[0].outgoing.map((item) => item.flow_id),
    ["Flow_no", "Flow_yes"],
  );
});

test("extractGateways applies label fallbacks", () => {
  const graph = {
    nodesById: {
      Gateway_X: {
        id: "Gateway_X",
        type: "bpmn:ParallelGateway",
        name: "",
        outgoingFlowIds: ["Flow_1"],
      },
      Task_1: { id: "Task_1", type: "bpmn:Task", name: "" },
    },
    flowsById: {
      Flow_1: { id: "Flow_1", targetId: "Task_1", label: "" },
    },
  };
  const out = extractGateways(graph);
  assert.equal(out[0].name, "Gateway_Gateway_X");
  assert.equal(out[0].outgoing[0].label, "Flow_Flow_1");
});

test("extractGateways output is deterministic by name/id", () => {
  const graph = {
    nodesById: {
      Gateway_B: { id: "Gateway_B", type: "bpmn:ExclusiveGateway", name: "B", outgoingFlowIds: [] },
      Gateway_A: { id: "Gateway_A", type: "bpmn:ExclusiveGateway", name: "A", outgoingFlowIds: [] },
    },
    flowsById: {},
  };
  const out = extractGateways(graph);
  assert.deepEqual(out.map((row) => row.gateway_id), ["Gateway_A", "Gateway_B"]);
});
