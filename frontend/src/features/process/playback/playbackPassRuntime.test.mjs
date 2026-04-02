import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  PLAYBACK_DECISION_MODE_AUTO_PASS,
  PLAYBACK_DECISION_MODE_MANUAL,
  buildPlaybackResetInputSemanticKey,
  createPlaybackPassRuntimeInitialState,
  derivePlaybackPassSnapshot,
  evaluatePlaybackResetTransition,
  playbackPassRuntimeReducer,
  resolvePlaybackGatewayDecisionState,
} from "./playbackPassRuntime.js";

test("auto-pass materialized truth is active decision source without manual override", () => {
  const state = resolvePlaybackGatewayDecisionState({
    requestedMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
    materializedChoiceMapRaw: { Gateway_1: "Flow_materialized" },
    manualChoiceMapRaw: { Gateway_1: "Flow_local" },
  });
  assert.equal(state.effectiveMode, PLAYBACK_DECISION_MODE_AUTO_PASS);
  assert.equal(state.choiceSource, "materialized_traversal_truth");
  assert.deepEqual(state.routeDecisionByNodeId, { Gateway_1: "Flow_materialized" });
});

test("manual pending gateway choice change does not produce full reset decision", () => {
  const prevSemanticKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml/>",
    routeDecisionByNodeIdRaw: { Gateway_1: "Flow_old" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const nextSemanticKey = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml/>",
    routeDecisionByNodeIdRaw: { Gateway_1: "Flow_new" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const decision = evaluatePlaybackResetTransition({
    prevSemanticKeyRaw: prevSemanticKey,
    nextSemanticKeyRaw: nextSemanticKey,
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_old" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_new" },
    pendingGatewayIdRaw: "Gateway_1",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  });
  assert.equal(decision.shouldReset, false);
  assert.equal(decision.reason, "interactive_pending_gateway_choice");
});

test("same semantic reset inputs do not restart runtime", () => {
  const key = buildPlaybackResetInputSemanticKey({
    draftBpmnXml: "<xml/>",
    routeDecisionByNodeIdRaw: { Gateway_1: "Flow_A" },
    scenarioKey: "active",
    engineManualAtGateway: true,
    choiceSource: "manual_local_choices",
  });
  const decision = evaluatePlaybackResetTransition({
    prevSemanticKeyRaw: key,
    nextSemanticKeyRaw: key,
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_A" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_A" },
    pendingGatewayIdRaw: "",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  });
  assert.equal(decision.shouldReset, false);
  assert.equal(decision.reason, "semantic_inputs_unchanged");
});

test("true semantic input change remains reset-worthy", () => {
  const decision = evaluatePlaybackResetTransition({
    prevSemanticKeyRaw: "k1",
    nextSemanticKeyRaw: "k2",
    prevRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_A" },
    nextRouteDecisionByNodeIdRaw: { Gateway_1: "Flow_B" },
    pendingGatewayIdRaw: "Gateway_2",
    playbackDecisionMode: PLAYBACK_DECISION_MODE_MANUAL,
    playbackReadOnly: false,
  });
  assert.equal(decision.shouldReset, true);
  assert.equal(decision.reason, "semantic_inputs_changed");
});

test("completion and acceptability are derived by runtime snapshot from progression state", () => {
  const state = {
    ...createPlaybackPassRuntimeInitialState(),
    frames: [{ type: "stop", reason: "ok_complete" }],
    index: 0,
  };
  const snapshot = derivePlaybackPassSnapshot({
    stateRaw: state,
    decisionStateRaw: {
      effectiveMode: PLAYBACK_DECISION_MODE_MANUAL,
      choiceSource: "manual_local_choices",
      routeDecisionByNodeId: {},
      readOnly: false,
      fallbackApplied: false,
      hasMaterialized: false,
    },
    hasEngine: true,
  });
  assert.equal(snapshot.isComplete, true);
  assert.equal(snapshot.isAcceptable, true);
  assert.equal(snapshot.completionReason.startsWith("runtime_terminal_"), true);
});

test("persisted backend-done truth aligns acceptability when runtime is not terminal yet", () => {
  const snapshot = derivePlaybackPassSnapshot({
    stateRaw: {
      ...createPlaybackPassRuntimeInitialState(),
      frames: [{ type: "enter_node", nodeId: "Start_1" }],
      index: 0,
    },
    decisionStateRaw: {
      effectiveMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
      choiceSource: "materialized_traversal_truth",
      routeDecisionByNodeId: { Gateway_1: "Flow_1" },
      readOnly: true,
      fallbackApplied: false,
      hasMaterialized: true,
    },
    hasEngine: true,
    materializedTraversalResultRaw: { status: "done", stale: false, gateway_decisions: [] },
  });
  assert.equal(snapshot.isComplete, true);
  assert.equal(snapshot.isAcceptable, true);
  assert.equal(snapshot.acceptanceReason, "backend_materialized_done");
});

test("runtime snapshot unifies gateway source, progression and acceptance in one contract", () => {
  const snapshot = derivePlaybackPassSnapshot({
    stateRaw: {
      ...createPlaybackPassRuntimeInitialState(),
      frames: [{ type: "wait_for_gateway_decision", gatewayId: "Gateway_1" }],
      pendingGateway: { type: "wait_for_gateway_decision", gatewayId: "Gateway_1" },
      index: 0,
    },
    decisionStateRaw: {
      effectiveMode: PLAYBACK_DECISION_MODE_MANUAL,
      choiceSource: "manual_local_choices",
      routeDecisionByNodeId: { Gateway_1: "Flow_A" },
      readOnly: false,
      fallbackApplied: false,
      hasMaterialized: false,
    },
    hasEngine: true,
  });
  assert.equal(snapshot.pendingGatewayId, "Gateway_1");
  assert.equal(snapshot.gatewayChoiceSource, "manual_local_choices");
  assert.equal(snapshot.sourceOfTruth.mode, PLAYBACK_DECISION_MODE_MANUAL);
  assert.equal(snapshot.isComplete, false);
  assert.equal(snapshot.isAcceptable, false);
});

test("module-owned runtime reset stores explicit reset/restart reason", () => {
  const resetState = playbackPassRuntimeReducer(createPlaybackPassRuntimeInitialState(), {
    type: "runtime_reset",
    reason: "playback_popover_opened_or_inputs_changed:semantic_inputs_changed",
    restartReason: "playback_popover_opened_or_inputs_changed:semantic_inputs_changed",
  });
  assert.equal(
    resetState.lastResetReason,
    "playback_popover_opened_or_inputs_changed:semantic_inputs_changed",
  );
  assert.equal(
    resetState.lastRestartReason,
    "playback_popover_opened_or_inputs_changed:semantic_inputs_changed",
  );
});

test("UI adapter consumes runtime snapshot and does not own direct gateway-decision progression call", () => {
  const source = readFileSync(new URL("../stage/ui/ProcessStageDiagramControls.jsx", import.meta.url), "utf8");
  assert.match(source, /playbackRuntimeSnapshot/);
  assert.match(source, /playbackSourceOfTruth/);
  assert.match(source, /diagram-action-playback-source/);
  assert.match(source, /diagram-action-playback-completion-acceptance/);
  assert.doesNotMatch(source, /handlePlaybackGatewayDecision\(gatewayId,\s*flowId\)/);
});

test("controller routes restart/reset through module-owned transition path", () => {
  const controllerSource = readFileSync(new URL("../stage/controllers/usePlaybackController.js", import.meta.url), "utf8");
  assert.match(controllerSource, /evaluatePlaybackResetTransition/);
  assert.match(controllerSource, /type:\s*"runtime_reset"/);
});

test("controller compatibility surface does not expose imperative engine refs as product API", () => {
  const controllerSource = readFileSync(new URL("../stage/controllers/usePlaybackController.js", import.meta.url), "utf8");
  const returnBlockMatch = controllerSource.match(/return\s*\{[\s\S]*?\n\s*\};/);
  assert.ok(returnBlockMatch, "return block missing");
  const returnBlock = String(returnBlockMatch?.[0] || "");
  assert.doesNotMatch(returnBlock, /\bplaybackEngineRef\b/);
  assert.doesNotMatch(returnBlock, /\bplaybackFramesRef\b/);
  assert.doesNotMatch(returnBlock, /\bplaybackIndexRef\b/);
  assert.doesNotMatch(returnBlock, /\bsetPlaybackIsPlaying\b/);
  assert.doesNotMatch(returnBlock, /\bsetPlaybackIndex\b/);
  assert.doesNotMatch(returnBlock, /\bhandlePlaybackGatewayDecision\b/);
});
