import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlaybackPendingGatewayVisitToken,
  canEditPlaybackGatewayChoice,
  PLAYBACK_DECISION_MODE_AUTO_PASS,
  PLAYBACK_DECISION_MODE_MANUAL,
  buildGatewayChoiceSemanticKey,
  buildMaterializedGatewayChoiceMap,
  buildPlaybackResetInputSemanticKey,
  resolvePlaybackGatewayDecisionState,
  shouldAutoConsumeManualPendingGatewayChoice,
  shouldBypassPlaybackResetForInteractivePendingGatewayDecision,
  shouldBypassPlaybackResetForInteractiveGatewayChoice,
  shouldResetPlaybackRuntimeForInputChange,
} from "./usePlaybackController.js";
import { createPlaybackEngine } from "../../playback/playbackEngine.js";

test("auto-pass materialized traversal truth wins over local manual gateway choices", () => {
  const materialized = buildMaterializedGatewayChoiceMap({
    traversalResultRaw: {
      status: "done",
      stale: false,
      gateway_decisions: [
        { gateway_id: "Gateway_1", flow_id: "Flow_yes", choice_count: 5 },
        { gateway_id: "Gateway_1", flow_id: "Flow_no", choice_count: 2 },
        { gateway_id: "Gateway_2", flow_id: "Flow_exit", choice_count: 3 },
      ],
    },
  });
  const state = resolvePlaybackGatewayDecisionState({
    requestedMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    materializedChoiceMapRaw: materialized,
    manualChoiceMapRaw: {
      Gateway_1: "Flow_no",
      Gateway_2: "Flow_retry",
    },
  });
  assert.equal(state.effectiveMode, PLAYBACK_DECISION_MODE_AUTO_PASS);
  assert.equal(state.choiceSource, "materialized_traversal_truth");
  assert.equal(state.fallbackApplied, false);
  assert.deepEqual(state.choiceMap, {
    Gateway_1: "Flow_yes",
    Gateway_2: "Flow_exit",
  });
  assert.deepEqual(state.routeDecisionByNodeId, state.panelChoices);
});

test("manual mode without materialized traversal truth uses local gateway choices", () => {
  const state = resolvePlaybackGatewayDecisionState({
    requestedMode: PLAYBACK_DECISION_MODE_MANUAL,
    materializedChoiceMapRaw: {},
    manualChoiceMapRaw: {
      Gateway_A: "Flow_A",
      Gateway_B: "Flow_B",
    },
  });
  assert.equal(state.effectiveMode, PLAYBACK_DECISION_MODE_MANUAL);
  assert.equal(state.choiceSource, "manual_local_choices");
  assert.equal(state.readOnly, false);
  assert.deepEqual(state.choiceMap, {
    Gateway_A: "Flow_A",
    Gateway_B: "Flow_B",
  });
  assert.deepEqual(state.routeDecisionByNodeId, state.panelChoices);
});

test("no silent fallback to old local gateway path when materialized truth exists", () => {
  const state = resolvePlaybackGatewayDecisionState({
    requestedMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    materializedChoiceMapRaw: {
      Gateway_1: "Flow_materialized",
    },
    manualChoiceMapRaw: {
      Gateway_1: "Flow_local_override",
      Gateway_legacy_only: "Flow_legacy_only",
    },
  });
  assert.equal(state.effectiveMode, PLAYBACK_DECISION_MODE_AUTO_PASS);
  assert.deepEqual(state.choiceMap, {
    Gateway_1: "Flow_materialized",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(state.choiceMap, "Gateway_legacy_only"), false);
});

test("auto-pass mode stays backward-safe and falls back to manual source when materialized truth is absent", () => {
  const state = resolvePlaybackGatewayDecisionState({
    requestedMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    materializedChoiceMapRaw: {},
    manualChoiceMapRaw: {
      Gateway_1: "Flow_local",
    },
  });
  assert.equal(state.effectiveMode, PLAYBACK_DECISION_MODE_MANUAL);
  assert.equal(state.choiceSource, "manual_local_choices_fallback_no_materialized");
  assert.equal(state.fallbackApplied, true);
  assert.equal(state.readOnly, false);
  assert.deepEqual(state.choiceMap, {
    Gateway_1: "Flow_local",
  });
});

test("gateways panel and playback engine stay aligned in auto-pass mode", () => {
  const state = resolvePlaybackGatewayDecisionState({
    requestedMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    materializedChoiceMapRaw: {
      Gateway_X: "Flow_materialized",
      Gateway_Y: "Flow_done",
    },
    manualChoiceMapRaw: {
      Gateway_X: "Flow_local",
    },
  });
  assert.equal(state.choiceSource, "materialized_traversal_truth");
  assert.equal(state.readOnly, true);
  assert.deepEqual(state.routeDecisionByNodeId, state.panelChoices);
});

test("materialized gateway map can be derived from auto_pass variants when traversal_result is missing", () => {
  const materialized = buildMaterializedGatewayChoiceMap({
    traversalResultRaw: null,
    autoPassResultRaw: {
      status: "done",
      variants: [
        {
          gateway_choices: [
            { gateway_id: "Gateway_1", flow_id: "Flow_yes" },
            { gateway_id: "Gateway_2", flow_id: "Flow_exit" },
          ],
        },
        {
          gateway_choices: [
            { gateway_id: "Gateway_1", flow_id: "Flow_yes" },
          ],
        },
      ],
    },
  });
  assert.deepEqual(materialized, {
    Gateway_1: "Flow_yes",
    Gateway_2: "Flow_exit",
  });
});

test("same semantic gateway choices produce stable semantic key even with new object identity", () => {
  const keyA = buildGatewayChoiceSemanticKey({
    Gateway_2: "Flow_B",
    Gateway_1: "Flow_A",
  });
  const keyB = buildGatewayChoiceSemanticKey({
    Gateway_1: "Flow_A",
    Gateway_2: "Flow_B",
  });
  assert.equal(keyA, keyB);
});

test("playback reset semantic key stays stable across referentially-new equivalent inputs", () => {
  const keyA = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    flowTierMetaMapRaw: {
      Flow_A: { tier: "P0" },
      Flow_B: { tier: "P1" },
    },
    nodePathMetaMapRaw: {
      Task_A: { paths: ["P0"], sequenceKey: "S1" },
    },
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_A",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "materialized_traversal_truth",
  });
  const keyB = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    flowTierMetaMapRaw: {
      Flow_B: { tier: "P1" },
      Flow_A: { tier: "P0" },
    },
    nodePathMetaMapRaw: {
      Task_A: { sequenceKey: "S1", paths: ["P0"] },
    },
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_A",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "materialized_traversal_truth",
  });
  assert.equal(keyA, keyB);
  assert.equal(shouldResetPlaybackRuntimeForInputChange(keyA, keyB), false);
});

test("reset happens only when decision source semantics actually changes", () => {
  const prevKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_A",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "materialized_traversal_truth",
  });
  const nextKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_B",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  assert.equal(shouldResetPlaybackRuntimeForInputChange(prevKey, nextKey), true);
});

test("manual pending gateway interactive choice change bypasses full reset", () => {
  const prevKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_old",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const nextKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_new",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  assert.equal(shouldBypassPlaybackResetForInteractiveGatewayChoice({
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_old" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_new" },
    pendingGatewayIdRaw: "Gateway_1",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), true);
  assert.equal(shouldResetPlaybackRuntimeForInputChange(prevKey, nextKey, {
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_old" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_new" },
    pendingGatewayIdRaw: "Gateway_1",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), false);
});

test("manual choice change outside pending gateway still triggers reset", () => {
  const prevKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_A",
      Gateway_2: "Flow_X",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const nextKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {
      Gateway_1: "Flow_A",
      Gateway_2: "Flow_Y",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  assert.equal(shouldBypassPlaybackResetForInteractiveGatewayChoice({
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_A", Gateway_2: "Flow_X" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_A", Gateway_2: "Flow_Y" },
    pendingGatewayIdRaw: "Gateway_1",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), false);
  assert.equal(shouldResetPlaybackRuntimeForInputChange(prevKey, nextKey, {
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_A", Gateway_2: "Flow_X" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_A", Gateway_2: "Flow_Y" },
    pendingGatewayIdRaw: "Gateway_1",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), true);
});

test("pending gateway visit token changes between revisits of the same gateway", () => {
  const tokenFirst = buildPlaybackPendingGatewayVisitToken({
    id: "evt_10",
    gatewayId: "Gateway_1",
    outgoingOptions: [{ flowId: "Flow_yes" }, { flowId: "Flow_no" }],
  });
  const tokenSecond = buildPlaybackPendingGatewayVisitToken({
    id: "evt_22",
    gatewayId: "Gateway_1",
    outgoingOptions: [{ flowId: "Flow_yes" }, { flowId: "Flow_no" }],
  });
  assert.notEqual(tokenFirst, "");
  assert.notEqual(tokenSecond, "");
  assert.notEqual(tokenFirst, tokenSecond);
});

test("manual auto-consume requires staged choice for current pending gateway visit", () => {
  const pendingGateway = {
    id: "evt_101",
    gatewayId: "Gateway_1",
    outgoingOptions: [{ flowId: "Flow_yes" }, { flowId: "Flow_no" }],
  };
  const visitToken = buildPlaybackPendingGatewayVisitToken(pendingGateway);
  assert.equal(shouldAutoConsumeManualPendingGatewayChoice({
    pendingGatewayRaw: pendingGateway,
    stagedChoiceRaw: null,
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), false);
  assert.equal(shouldAutoConsumeManualPendingGatewayChoice({
    pendingGatewayRaw: pendingGateway,
    stagedChoiceRaw: {
      gatewayId: "Gateway_1",
      flowId: "Flow_yes",
      pendingVisitToken: visitToken,
    },
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), true);
});

test("manual auto-consume does not reuse staged choice on gateway revisit with new visit token", () => {
  const firstPending = {
    id: "evt_201",
    gatewayId: "Gateway_1",
    outgoingOptions: [{ flowId: "Flow_yes" }, { flowId: "Flow_no" }],
  };
  const secondPending = {
    id: "evt_245",
    gatewayId: "Gateway_1",
    outgoingOptions: [{ flowId: "Flow_yes" }, { flowId: "Flow_no" }],
  };
  assert.equal(shouldAutoConsumeManualPendingGatewayChoice({
    pendingGatewayRaw: secondPending,
    stagedChoiceRaw: {
      gatewayId: "Gateway_1",
      flowId: "Flow_yes",
      pendingVisitToken: buildPlaybackPendingGatewayVisitToken(firstPending),
    },
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), false);
});

test("manual auto-consume remains disabled in auto/materialized mode", () => {
  const pendingGateway = {
    id: "evt_301",
    gatewayId: "Gateway_1",
    outgoingOptions: [{ flowId: "Flow_yes" }, { flowId: "Flow_no" }],
  };
  assert.equal(shouldAutoConsumeManualPendingGatewayChoice({
    pendingGatewayRaw: pendingGateway,
    stagedChoiceRaw: {
      gatewayId: "Gateway_1",
      flowId: "Flow_yes",
      pendingVisitToken: buildPlaybackPendingGatewayVisitToken(pendingGateway),
    },
    playbackDecisionMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    playbackReadOnly: true,
  }), false);
});

test("interactive pending gateway latch bypasses reset even after pending is already cleared", () => {
  const prevKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {},
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const nextKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: { Gateway_1: "Flow_yes" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  assert.equal(shouldBypassPlaybackResetForInteractivePendingGatewayDecision({
    decisionShouldReset: true,
    decisionReason: "semantic_inputs_changed",
    prevSemanticKeyRaw: prevKey,
    nextSemanticKeyRaw: nextKey,
    prevRouteDecisionByNodeIdRaw: {},
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_yes" },
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
    latchRaw: {
      gatewayId: "Gateway_1",
      chosenFlowId: "Flow_yes",
      mode: PLAYBACK_DECISION_MODE_MANUAL,
      previousPendingGatewayId: "Gateway_1",
      createdAtMs: 1_000,
    },
    nowMs: 1_500,
  }), true);
});

test("interactive latch does not bypass reset when non-route semantic inputs changed", () => {
  const prevKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {},
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const nextKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>B</xml>",
    routeDecisionByNodeIdRaw: { Gateway_1: "Flow_yes" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  assert.equal(shouldBypassPlaybackResetForInteractivePendingGatewayDecision({
    decisionShouldReset: true,
    decisionReason: "semantic_inputs_changed",
    prevSemanticKeyRaw: prevKey,
    nextSemanticKeyRaw: nextKey,
    prevRouteDecisionByNodeIdRaw: {},
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_yes" },
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
    latchRaw: {
      gatewayId: "Gateway_1",
      chosenFlowId: "Flow_yes",
      mode: PLAYBACK_DECISION_MODE_MANUAL,
      previousPendingGatewayId: "Gateway_1",
      createdAtMs: 1_000,
    },
    nowMs: 1_500,
  }), false);
});

test("interactive latch does not bypass reset for non-pending gateway diff", () => {
  const prevKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: { Gateway_pending: "Flow_keep" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const nextKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: {
      Gateway_pending: "Flow_keep",
      Gateway_other: "Flow_changed",
    },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  assert.equal(shouldBypassPlaybackResetForInteractivePendingGatewayDecision({
    decisionShouldReset: true,
    decisionReason: "semantic_inputs_changed",
    prevSemanticKeyRaw: prevKey,
    nextSemanticKeyRaw: nextKey,
    prevRouteDecisionByNodeIdRaw: { Gateway_pending: "Flow_keep" },
    nextRouteDecisionByNodeIdRaw: {
      Gateway_pending: "Flow_keep",
      Gateway_other: "Flow_changed",
    },
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
    latchRaw: {
      gatewayId: "Gateway_pending",
      chosenFlowId: "Flow_keep",
      mode: PLAYBACK_DECISION_MODE_MANUAL,
      previousPendingGatewayId: "Gateway_pending",
      createdAtMs: 1_000,
    },
    nowMs: 1_500,
  }), false);
});

test("auto/materialized mode remains unchanged and does not use interactive latch bypass", () => {
  const prevKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: { Gateway_1: "Flow_old" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "materialized_traversal_truth",
  });
  const nextKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml>A</xml>",
    routeDecisionByNodeIdRaw: { Gateway_1: "Flow_new" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "materialized_traversal_truth",
  });
  assert.equal(shouldBypassPlaybackResetForInteractivePendingGatewayDecision({
    decisionShouldReset: true,
    decisionReason: "semantic_inputs_changed",
    prevSemanticKeyRaw: prevKey,
    nextSemanticKeyRaw: nextKey,
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_old" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_new" },
    playbackDecisionMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    playbackReadOnly: true,
    latchRaw: {
      gatewayId: "Gateway_1",
      chosenFlowId: "Flow_new",
      mode: PLAYBACK_DECISION_MODE_MANUAL,
      previousPendingGatewayId: "Gateway_1",
      createdAtMs: 1_000,
    },
    nowMs: 1_500,
  }), false);
});

test("only pending gateway is editable during active manual playback", () => {
  assert.equal(canEditPlaybackGatewayChoice({
    gatewayIdRaw: "Gateway_pending",
    pendingGatewayIdRaw: "Gateway_pending",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), true);
  assert.equal(canEditPlaybackGatewayChoice({
    gatewayIdRaw: "Gateway_other",
    pendingGatewayIdRaw: "Gateway_pending",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), false);
  assert.equal(canEditPlaybackGatewayChoice({
    gatewayIdRaw: "Gateway_any",
    pendingGatewayIdRaw: "",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  }), true);
  assert.equal(canEditPlaybackGatewayChoice({
    gatewayIdRaw: "Gateway_pending",
    pendingGatewayIdRaw: "Gateway_pending",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    playbackReadOnly: true,
  }), false);
});

test("playback can progress past Start event with stable inputs", () => {
  const graph = {
    nodesById: {
      Start_1: {
        id: "Start_1",
        type: "bpmn:StartEvent",
        name: "Start",
        incomingFlowIds: [],
        outgoingFlowIds: ["Flow_1"],
      },
      Task_1: {
        id: "Task_1",
        type: "bpmn:Task",
        name: "Task",
        incomingFlowIds: ["Flow_1"],
        outgoingFlowIds: ["Flow_2"],
      },
      End_1: {
        id: "End_1",
        type: "bpmn:EndEvent",
        name: "End",
        incomingFlowIds: ["Flow_2"],
        outgoingFlowIds: [],
      },
    },
    flowsById: {
      Flow_1: { id: "Flow_1", sourceId: "Start_1", targetId: "Task_1", label: "", conditionText: "" },
      Flow_2: { id: "Flow_2", sourceId: "Task_1", targetId: "End_1", label: "", conditionText: "" },
    },
    startNodeIds: ["Start_1"],
    topLevelStartNodeIds: ["Start_1"],
  };
  const engine = createPlaybackEngine({
    graph,
    routeDecisionByNodeId: {
      Gateway_1: "Flow_unused",
    },
    manualAtGateway: true,
  });
  const first = engine.nextEvent();
  const second = engine.nextEvent();
  const third = engine.nextEvent();
  assert.equal(first?.type, "enter_node");
  assert.equal(first?.nodeId, "Start_1");
  assert.equal(second?.type, "take_flow");
  assert.equal(second?.flowId, "Flow_1");
  assert.equal(third?.type, "enter_node");
  assert.equal(third?.nodeId, "Task_1");
});
