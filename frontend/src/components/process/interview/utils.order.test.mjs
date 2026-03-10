import test from "node:test";
import assert from "node:assert/strict";

import {
  orderNodeIdsByFlow,
  collectBpmnTraversalOrderMeta,
  buildGatewayBranchPreviews,
  buildTimelineBetweenBranchesItem,
} from "./utils.js";

test("orderNodeIdsByFlow: starts from StartEvent chain and pushes detached nodes to tail", () => {
  const nodeIds = [
    "Event_Start",
    "Activity_A",
    "Activity_B",
    "Activity_Detached",
    "Event_End",
  ];
  const edges = [
    { from_id: "Event_Start", to_id: "Activity_A" },
    { from_id: "Activity_A", to_id: "Activity_B" },
    { from_id: "Activity_B", to_id: "Event_End" },
  ];
  const nodeKindById = {
    Event_Start: "startEvent",
    Event_End: "endEvent",
    Activity_A: "task",
    Activity_B: "task",
    Activity_Detached: "task",
  };

  const out = orderNodeIdsByFlow(nodeIds, edges, { nodeKindById });

  assert.deepEqual(out.slice(0, 4), [
    "Event_Start",
    "Activity_A",
    "Activity_B",
    "Event_End",
  ]);
  assert.equal(out[out.length - 1], "Activity_Detached");
});

test("orderNodeIdsByFlow: falls back to zero-indegree order when no StartEvent", () => {
  const nodeIds = ["A", "B", "C"];
  const edges = [{ from_id: "A", to_id: "B" }];

  const out = orderNodeIdsByFlow(nodeIds, edges, { nodeKindById: {} });

  assert.equal(out[0], "A");
  assert.equal(out[1], "B");
  assert.equal(out[2], "C");
});

test("orderNodeIdsByFlow: prefers top-level StartEvent over subprocess internal starts", () => {
  const nodeIds = [
    "Sub_Start",
    "Sub_A",
    "Main_Start",
    "Main_A",
  ];
  const edges = [
    { from_id: "Sub_Start", to_id: "Sub_A" },
    { from_id: "Main_Start", to_id: "Main_A" },
  ];
  const nodeKindById = {
    Sub_Start: "startEvent",
    Sub_A: "task",
    Main_Start: "startEvent",
    Main_A: "task",
  };
  const nodeParentKindById = {
    Sub_Start: "subProcess",
    Sub_A: "subProcess",
    Main_Start: "process",
    Main_A: "process",
  };

  const out = orderNodeIdsByFlow(nodeIds, edges, { nodeKindById, nodeParentKindById });

  assert.deepEqual(out.slice(0, 2), ["Main_Start", "Main_A"]);
  assert.deepEqual(out.slice(2), ["Sub_Start", "Sub_A"]);
});

test("orderNodeIdsByFlow: follows sequenceFlow traversal order (depth-first per outgoing order)", () => {
  const nodeIds = ["S", "A", "B", "C", "D", "E"];
  const edges = [
    { from_id: "S", to_id: "A" },
    { from_id: "A", to_id: "B" },
    { from_id: "A", to_id: "C" },
    { from_id: "B", to_id: "E" },
    { from_id: "C", to_id: "D" },
  ];
  const nodeKindById = {
    S: "startEvent",
    A: "task",
    B: "task",
    C: "task",
    D: "task",
    E: "task",
  };
  const out = orderNodeIdsByFlow(nodeIds, edges, { nodeKindById });

  assert.deepEqual(out, ["S", "A", "B", "E", "C", "D"]);
});

test("orderNodeIdsByFlow: branches are deterministic by diagram coordinates", () => {
  const nodeIds = ["S", "A", "B", "E"];
  const edges = [
    { id: "F1", from_id: "S", to_id: "A", flow_order: 1 },
    { id: "F2", from_id: "A", to_id: "B", flow_order: 2 },
    { id: "F3", from_id: "A", to_id: "E", flow_order: 3 },
  ];
  const nodeKindById = {
    S: "startEvent",
    A: "exclusiveGateway",
    B: "task",
    E: "task",
  };
  const nodePositionById = {
    S: { x: 0, y: 0 },
    A: { x: 100, y: 20 },
    E: { x: 180, y: 20 },
    B: { x: 260, y: 20 },
  };

  const out = orderNodeIdsByFlow(nodeIds, edges, { nodeKindById, nodePositionById });

  assert.deepEqual(out, ["S", "A", "E", "B"]);
});

test("collectBpmnTraversalOrderMeta: falls back explicitly when DOMParser is unavailable", () => {
  const out = collectBpmnTraversalOrderMeta("<definitions />");
  assert.equal(out.usedFallback, true);
  assert.equal(out.fallbackReason, "dom_parser_unavailable");
  assert.deepEqual(out.nodeIds, []);
});

test("buildGatewayBranchPreviews: marks primary branch as continues-to-mainline and alt branch as loop", () => {
  const out = buildGatewayBranchPreviews({
    gatewayNodeId: "Gateway_6",
    outgoing: [
      { toId: "Activity_7", when: "Да", edgeKey: "Gateway_6__Activity_7" },
      { toId: "Retry_1", when: "Нет", edgeKey: "Gateway_6__Retry_1" },
    ],
    outgoingByNode: {
      Retry_1: [{ toId: "Escalate_1", when: "" }],
      Escalate_1: [{ toId: "Activity_5", when: "" }],
    },
    nodeMetaById: {
      Activity_7: { title: "Open freezer" },
      Retry_1: { title: "Retry start button" },
      Escalate_1: { title: "Call supervisor" },
      Activity_5: { title: "Press start button" },
    },
    mainlineNodeIds: ["Event_1", "Activity_5", "Gateway_6", "Activity_7", "Event_9"],
    graphNoByNodeId: {
      Event_1: "1",
      Activity_5: "5",
      Gateway_6: "6",
      Activity_7: "7",
      Event_9: "9",
    },
  });

  assert.equal(out.length, 2);

  const yesBranch = out[0];
  assert.equal(yesBranch.label, "Да");
  assert.equal(yesBranch.isPrimary, true);
  assert.equal(yesBranch.stopReason, "nextMainline");
  assert.equal(yesBranch.continuesToMainline, true);
  assert.equal(yesBranch.continuesToNodeId, "Activity_7");
  assert.equal(yesBranch.previewSteps.length, 0);
  assert.equal(yesBranch.loop, false);

  const noBranch = out[1];
  assert.equal(noBranch.label, "Нет");
  assert.equal(noBranch.isPrimary, false);
  assert.equal(noBranch.stopReason, "loop");
  assert.equal(noBranch.continuesToMainline, false);
  assert.equal(noBranch.loop, true);
  assert.equal(noBranch.loopTargetNodeId, "Activity_5");
  assert.deepEqual(
    noBranch.previewSteps.map((x) => x.nodeId),
    ["Retry_1", "Escalate_1"],
  );
});

test("buildGatewayBranchPreviews: keeps nested decision inside branch and marks loop without mainline duplicates", () => {
  const out = buildGatewayBranchPreviews({
    gatewayNodeId: "Gateway_6",
    outgoing: [
      { toId: "Activity_7", when: "Yes", edgeKey: "Gateway_6__Activity_7" },
      { toId: "Retry_1", when: "No", edgeKey: "Gateway_6__Retry_1" },
    ],
    outgoingByNode: {
      Retry_1: [{ toId: "Gateway_retry", when: "" }],
      Gateway_retry: [
        { toId: "Activity_7", when: "Yes" },
        { toId: "Escalate_1", when: "No" },
      ],
      Escalate_1: [{ toId: "Activity_5", when: "" }],
    },
    nodeMetaById: {
      Activity_5: { title: "Press start button", kind: "task" },
      Gateway_6: { title: "Delivery button appeared?", kind: "exclusivegateway" },
      Activity_7: { title: "Open freezer", kind: "task" },
      Retry_1: { title: "Press start again", kind: "task" },
      Gateway_retry: { title: "Delivery button appeared?", kind: "exclusivegateway" },
      Escalate_1: { title: "Call supervisor", kind: "task" },
    },
    mainlineNodeIds: ["Event_1", "Activity_5", "Gateway_6", "Activity_7", "Event_9"],
    graphNoByNodeId: {
      Activity_5: "5",
      Gateway_6: "6",
      Activity_7: "7",
      Retry_1: "",
      Gateway_retry: "",
      Escalate_1: "",
    },
  });

  const noBranch = out.find((x) => x.label.toLowerCase() === "no");
  assert.ok(noBranch);
  assert.ok(typeof noBranch.stopReason === "string" && noBranch.stopReason.length > 0);
  assert.equal(noBranch.continuesToMainline, true);
  assert.equal(noBranch.continuesToNodeId, "Activity_7");
  assert.equal(noBranch.loop, true);
  assert.equal(noBranch.loopTargetNodeId, "Activity_5");
  assert.ok(
    Array.isArray(noBranch.nodes) && noBranch.nodes.some((node) => String(node?.kind || "").toLowerCase() === "decision"),
  );
});

test("buildGatewayBranchPreviews: non-primary branch does not become continue when target is outside mainline", () => {
  const out = buildGatewayBranchPreviews({
    gatewayNodeId: "G1",
    outgoing: [
      { toId: "M2", when: "Yes", edgeKey: "G1__M2" },
      { toId: "Alt_1", when: "No", edgeKey: "G1__Alt_1" },
    ],
    outgoingByNode: {
      Alt_1: [{ toId: "Alt_2", when: "" }],
    },
    nodeMetaById: {
      M2: { title: "Mainline next", kind: "task" },
      Alt_1: { title: "Open lid", kind: "task" },
      Alt_2: { title: "Remove film", kind: "task" },
    },
    mainlineNodeIds: ["S1", "M1", "G1", "M2", "E1"],
    graphNoByNodeId: {
      S1: "1",
      M1: "2",
      G1: "3",
      M2: "4",
      E1: "5",
    },
  });

  const noBranch = out.find((x) => String(x?.label || "").toLowerCase() === "no");
  assert.ok(noBranch);
  assert.equal(noBranch.stopReason, "unknown");
  assert.equal(noBranch.continuesToMainline, false);
  assert.equal(noBranch.continuesToNodeId, "");
  assert.equal(noBranch.loop, false);
  assert.deepEqual(
    noBranch.previewSteps.map((x) => x.nodeId),
    ["Alt_1", "Alt_2"],
  );
});

test("buildTimelineBetweenBranchesItem: inserts between-block and strips non-primary continue to foreign target", () => {
  const between = buildTimelineBetweenBranchesItem({
    anchorStep: { seq_label: "6", seq: 6, node_bind_id: "Gateway_6" },
    nextMainlineStep: { seq_label: "7", seq: 7, node_bind_id: "Activity_7", action: "Open freezer" },
    branchPreviews: [
      {
        label: "Да",
        isPrimary: true,
        continuesToMainline: true,
        continuesToNodeId: "Activity_7",
        continuesToGraphNo: "7",
        continuesToTitle: "Open freezer",
        nodes: [{ kind: "continue", targetNodeId: "Activity_7", targetGraphNo: "7", targetTitle: "Open freezer" }],
      },
      {
        label: "Нет",
        isPrimary: false,
        continuesToMainline: true,
        continuesToNodeId: "Activity_74",
        continuesToGraphNo: "74",
        continuesToTitle: "Wrong jump",
        nodes: [
          { kind: "step", nodeId: "Retry_1", title: "Retry" },
          { kind: "continue", targetNodeId: "Activity_74", targetGraphNo: "74", targetTitle: "Wrong jump" },
          { kind: "loop", targetNodeId: "Gateway_6", targetGraphNo: "6", targetTitle: "Back to check" },
        ],
      },
    ],
  });

  assert.ok(between);
  assert.equal(between.kind, "between_branches");
  assert.equal(between.fromGraphNo, "6");
  assert.equal(between.toGraphNo, "7");
  assert.equal(between.branches.length, 2);

  const yes = between.branches[0];
  assert.equal(yes.isPrimary, true);
  assert.equal(typeof yes.stopReason, "string");
  assert.equal(yes.children.length, 1);
  assert.equal(yes.children[0].kind, "continue");
  assert.equal(yes.children[0].targetNodeId, "Activity_7");

  const no = between.branches[1];
  assert.equal(no.isPrimary, false);
  assert.equal(typeof no.stopReason, "string");
  assert.ok(no.children.some((x) => x.kind === "step"));
  assert.ok(no.children.some((x) => x.kind === "loop"));
  assert.equal(no.children.some((x) => x.kind === "continue"), false);
});

test("buildTimelineBetweenBranchesItem: keeps non-primary continue when target is allowed downstream mainline", () => {
  const between = buildTimelineBetweenBranchesItem({
    anchorStep: { seq_label: "6", seq: 6, node_bind_id: "Gateway_6" },
    nextMainlineStep: { seq_label: "7", seq: 7, node_bind_id: "Activity_7", action: "Open freezer" },
    allowedContinueNodeIds: ["Activity_7", "Activity_9"],
    branchPreviews: [
      {
        label: "Да",
        isPrimary: true,
        continuesToMainline: true,
        continuesToNodeId: "Activity_7",
        continuesToGraphNo: "7",
        continuesToTitle: "Open freezer",
        nodes: [{ kind: "continue", targetNodeId: "Activity_7", targetGraphNo: "7", targetTitle: "Open freezer" }],
      },
      {
        label: "Нет",
        isPrimary: false,
        continuesToMainline: true,
        continuesToNodeId: "Activity_9",
        continuesToGraphNo: "9",
        continuesToTitle: "Late join",
        nodes: [
          { kind: "step", nodeId: "Retry_1", title: "Retry" },
          { kind: "continue", targetNodeId: "Activity_9", targetGraphNo: "9", targetTitle: "Late join" },
        ],
      },
    ],
  });

  assert.ok(between);
  const no = between.branches[1];
  assert.ok(no.children.some((x) => x.kind === "continue" && x.targetNodeId === "Activity_9"));
});
