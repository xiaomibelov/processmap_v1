function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

export const PLAYBACK_DECISION_MODE_AUTO_PASS = "auto_pass";
export const PLAYBACK_DECISION_MODE_MANUAL = "manual";

function stableSortKeys(sourceRaw) {
  return Object.keys(asObject(sourceRaw))
    .map((keyRaw) => toText(keyRaw))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), "ru"));
}

function stableSerializeValue(valueRaw) {
  if (Array.isArray(valueRaw)) {
    return `[${valueRaw.map((item) => stableSerializeValue(item)).join(",")}]`;
  }
  if (valueRaw && typeof valueRaw === "object") {
    const source = asObject(valueRaw);
    const body = stableSortKeys(source)
      .map((key) => `${JSON.stringify(key)}:${stableSerializeValue(source[key])}`)
      .join(",");
    return `{${body}}`;
  }
  if (typeof valueRaw === "string") return JSON.stringify(valueRaw);
  if (typeof valueRaw === "number") return Number.isFinite(valueRaw) ? String(valueRaw) : "null";
  if (typeof valueRaw === "boolean") return valueRaw ? "true" : "false";
  return "null";
}

export function normalizeGatewayChoiceMap(raw) {
  const src = asObject(raw);
  const out = {};
  Object.entries(src).forEach(([gatewayIdRaw, flowIdRaw]) => {
    const gatewayId = toText(gatewayIdRaw);
    const flowId = toText(flowIdRaw);
    if (!gatewayId || !flowId) return;
    out[gatewayId] = flowId;
  });
  return out;
}

export function buildGatewayChoiceSemanticKey(choiceMapRaw = null) {
  const choiceMap = normalizeGatewayChoiceMap(choiceMapRaw);
  const body = stableSortKeys(choiceMap)
    .map((gatewayId) => `${JSON.stringify(gatewayId)}:${JSON.stringify(toText(choiceMap[gatewayId]))}`)
    .join(",");
  return `{${body}}`;
}

export function buildPlaybackResetInputSemanticKey({
  draftBpmnXml = "",
  flowTierMetaMapRaw = null,
  nodePathMetaMapRaw = null,
  routeDecisionByNodeIdRaw = null,
  scenarioKey = "",
  engineManualAtGateway = false,
  choiceSource = "",
} = {}) {
  return [
    `xml:${JSON.stringify(toText(draftBpmnXml))}`,
    `flow:${stableSerializeValue(asObject(flowTierMetaMapRaw))}`,
    `node:${stableSerializeValue(asObject(nodePathMetaMapRaw))}`,
    `route:${buildGatewayChoiceSemanticKey(routeDecisionByNodeIdRaw)}`,
    `scenario:${JSON.stringify(toText(scenarioKey))}`,
    `engineManualAtGateway:${engineManualAtGateway === true ? 1 : 0}`,
    `choiceSource:${JSON.stringify(toText(choiceSource))}`,
  ].join("|");
}

function collectChangedGatewayIds(prevChoiceMapRaw = null, nextChoiceMapRaw = null) {
  const prevChoiceMap = normalizeGatewayChoiceMap(prevChoiceMapRaw);
  const nextChoiceMap = normalizeGatewayChoiceMap(nextChoiceMapRaw);
  const ids = new Set([
    ...Object.keys(prevChoiceMap),
    ...Object.keys(nextChoiceMap),
  ]);
  const changed = [];
  ids.forEach((gatewayIdRaw) => {
    const gatewayId = toText(gatewayIdRaw);
    if (!gatewayId) return;
    if (toText(prevChoiceMap[gatewayId]) === toText(nextChoiceMap[gatewayId])) return;
    changed.push(gatewayId);
  });
  return changed.sort((a, b) => String(a).localeCompare(String(b), "ru"));
}

export function shouldBypassPlaybackResetForInteractiveGatewayChoice({
  prevRouteDecisionByNodeIdRaw = null,
  nextRouteDecisionByNodeIdRaw = null,
  pendingGatewayIdRaw = "",
  playbackDecisionMode = PLAYBACK_DECISION_MODE_MANUAL,
  playbackReadOnly = false,
} = {}) {
  const pendingGatewayId = toText(pendingGatewayIdRaw);
  if (!pendingGatewayId) return false;
  if (playbackReadOnly === true) return false;
  if (toText(playbackDecisionMode) !== PLAYBACK_DECISION_MODE_MANUAL) return false;
  const changedGatewayIds = collectChangedGatewayIds(
    prevRouteDecisionByNodeIdRaw,
    nextRouteDecisionByNodeIdRaw,
  );
  if (changedGatewayIds.length !== 1) return false;
  return changedGatewayIds[0] === pendingGatewayId;
}

export function canEditPlaybackGatewayChoice({
  gatewayIdRaw = "",
  pendingGatewayIdRaw = "",
  playbackDecisionMode = PLAYBACK_DECISION_MODE_MANUAL,
  playbackReadOnly = false,
} = {}) {
  if (playbackReadOnly === true) return false;
  if (toText(playbackDecisionMode) !== PLAYBACK_DECISION_MODE_MANUAL) return false;
  const gatewayId = toText(gatewayIdRaw);
  if (!gatewayId) return false;
  const pendingGatewayId = toText(pendingGatewayIdRaw);
  if (!pendingGatewayId) return true;
  return gatewayId === pendingGatewayId;
}

export function shouldResetPlaybackRuntimeForInputChange(prevSemanticKeyRaw = "", nextSemanticKeyRaw = "", options = {}) {
  const prevSemanticKey = toText(prevSemanticKeyRaw);
  const nextSemanticKey = toText(nextSemanticKeyRaw);
  if (prevSemanticKey === nextSemanticKey) return false;
  if (shouldBypassPlaybackResetForInteractiveGatewayChoice(options)) return false;
  return true;
}

export function evaluatePlaybackResetTransition({
  prevSemanticKeyRaw = "",
  nextSemanticKeyRaw = "",
  prevRouteDecisionByNodeIdRaw = null,
  nextRouteDecisionByNodeIdRaw = null,
  pendingGatewayIdRaw = "",
  playbackDecisionMode = PLAYBACK_DECISION_MODE_MANUAL,
  playbackReadOnly = false,
} = {}) {
  const shouldReset = shouldResetPlaybackRuntimeForInputChange(
    prevSemanticKeyRaw,
    nextSemanticKeyRaw,
    {
      prevRouteDecisionByNodeIdRaw,
      nextRouteDecisionByNodeIdRaw,
      pendingGatewayIdRaw,
      playbackDecisionMode,
      playbackReadOnly,
    },
  );
  const prevSemanticKey = toText(prevSemanticKeyRaw);
  const nextSemanticKey = toText(nextSemanticKeyRaw);
  let reason = "semantic_inputs_changed";
  if (prevSemanticKey === nextSemanticKey) {
    reason = "semantic_inputs_unchanged";
  } else if (!shouldReset) {
    reason = "interactive_pending_gateway_choice";
  }
  return {
    shouldReset,
    reason,
    nextResetTracker: {
      semanticKey: nextSemanticKey,
      routeDecisionByNodeId: normalizeGatewayChoiceMap(nextRouteDecisionByNodeIdRaw),
    },
  };
}

function summarizeGatewayChoiceCounts(rowsRaw) {
  const rows = asArray(rowsRaw);
  const bestByGateway = new Map();
  rows.forEach((rowRaw, index) => {
    const row = asObject(rowRaw);
    const gatewayId = toText(row.gateway_id || row.gatewayId);
    const flowId = toText(row.flow_id || row.flowId);
    if (!gatewayId || !flowId) return;
    const scoreRaw = Number(row.choice_count);
    const score = Number.isFinite(scoreRaw) ? scoreRaw : 1;
    const current = bestByGateway.get(gatewayId);
    if (!current) {
      bestByGateway.set(gatewayId, {
        flowId,
        score,
        index,
      });
      return;
    }
    const shouldReplace = (
      score > current.score
      || (score === current.score && index < current.index)
      || (score === current.score && index === current.index && flowId.localeCompare(current.flowId, "ru") < 0)
    );
    if (shouldReplace) {
      bestByGateway.set(gatewayId, {
        flowId,
        score,
        index,
      });
    }
  });
  const out = {};
  bestByGateway.forEach((value, gatewayId) => {
    out[gatewayId] = toText(value?.flowId);
  });
  return out;
}

function materializedChoicesFromAutoPass(autoPassRaw) {
  const autoPass = asObject(autoPassRaw);
  const status = toText(autoPass.status).toLowerCase();
  if (status && status !== "done" && status !== "completed") return {};
  const flattened = [];
  asArray(autoPass.variants).forEach((variantRaw) => {
    const variant = asObject(variantRaw);
    asArray(variant.gateway_choices || variant.choices).forEach((choiceRaw) => {
      const choice = asObject(choiceRaw);
      flattened.push({
        gateway_id: toText(choice.gateway_id || choice.gatewayId),
        flow_id: toText(choice.flow_id || choice.flowId),
        choice_count: 1,
      });
    });
  });
  return summarizeGatewayChoiceCounts(flattened);
}

function materializedChoicesFromTraversalResult(traversalRaw) {
  const traversal = asObject(traversalRaw);
  const status = toText(traversal.status).toLowerCase();
  if (status && status !== "done" && status !== "completed") return {};
  if (traversal.stale === true) return {};
  return summarizeGatewayChoiceCounts(traversal.gateway_decisions);
}

export function buildMaterializedGatewayChoiceMap({
  traversalResultRaw = null,
  autoPassResultRaw = null,
} = {}) {
  const fromTraversal = materializedChoicesFromTraversalResult(traversalResultRaw);
  if (Object.keys(fromTraversal).length > 0) return fromTraversal;
  return materializedChoicesFromAutoPass(autoPassResultRaw);
}

export function resolvePlaybackGatewayDecisionState({
  requestedMode = PLAYBACK_DECISION_MODE_MANUAL,
  manualChoiceMapRaw = null,
  materializedChoiceMapRaw = null,
} = {}) {
  const manualChoiceMap = normalizeGatewayChoiceMap(manualChoiceMapRaw);
  const materializedChoiceMap = normalizeGatewayChoiceMap(materializedChoiceMapRaw);
  const requested = toText(requestedMode) === PLAYBACK_DECISION_MODE_AUTO_PASS
    ? PLAYBACK_DECISION_MODE_AUTO_PASS
    : PLAYBACK_DECISION_MODE_MANUAL;
  const hasMaterialized = Object.keys(materializedChoiceMap).length > 0;
  if (requested === PLAYBACK_DECISION_MODE_AUTO_PASS && hasMaterialized) {
    return {
      effectiveMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
      choiceSource: "materialized_traversal_truth",
      choiceMap: materializedChoiceMap,
      routeDecisionByNodeId: materializedChoiceMap,
      panelChoices: materializedChoiceMap,
      readOnly: true,
      hasMaterialized: true,
      fallbackApplied: false,
    };
  }
  return {
    effectiveMode: PLAYBACK_DECISION_MODE_MANUAL,
    choiceSource: requested === PLAYBACK_DECISION_MODE_AUTO_PASS
      ? "manual_local_choices_fallback_no_materialized"
      : "manual_local_choices",
    choiceMap: manualChoiceMap,
    routeDecisionByNodeId: manualChoiceMap,
    panelChoices: manualChoiceMap,
    readOnly: false,
    hasMaterialized,
    fallbackApplied: requested === PLAYBACK_DECISION_MODE_AUTO_PASS && !hasMaterialized,
  };
}

function resolveUpdater(prevValue, updaterRaw) {
  if (typeof updaterRaw === "function") {
    return updaterRaw(prevValue);
  }
  return updaterRaw;
}

function normalizeManualChoiceMapForGateways(manualChoiceMapRaw, gatewaysRaw) {
  const manualChoiceMap = normalizeGatewayChoiceMap(manualChoiceMapRaw);
  const gateways = asArray(gatewaysRaw);
  if (!gateways.length) return manualChoiceMap;
  const next = {};
  gateways.forEach((gatewayRaw) => {
    const gateway = asObject(gatewayRaw);
    const gatewayId = toText(gateway?.gateway_id);
    const selectedFlowId = toText(manualChoiceMap[gatewayId]);
    if (!gatewayId || !selectedFlowId) return;
    const hasMatch = asArray(gateway?.outgoing).some((optionRaw) => {
      const option = asObject(optionRaw);
      return toText(option?.flow_id) === selectedFlowId;
    });
    if (hasMatch) next[gatewayId] = selectedFlowId;
  });
  return next;
}

function annotateTransition(stateRaw, transitionTypeRaw, transitionReasonRaw, patchRaw = {}) {
  const state = asObject(stateRaw);
  const patch = asObject(patchRaw);
  const transitionType = toText(transitionTypeRaw) || "runtime_transition";
  const transitionReason = toText(transitionReasonRaw) || transitionType;
  return {
    ...state,
    ...patch,
    lastTransitionType: transitionType,
    lastTransitionReason: transitionReason,
  };
}

export function createPlaybackPassRuntimeInitialState() {
  return {
    isPlaying: false,
    frames: [],
    pendingGateway: null,
    gateways: [],
    manualGatewayChoices: {},
    graphError: "",
    index: 0,
    lastResetReason: "",
    lastRestartReason: "",
    lastTransitionType: "init",
    lastTransitionReason: "init",
    resetTracker: {
      semanticKey: "",
      routeDecisionByNodeId: {},
    },
  };
}

export function playbackPassRuntimeReducer(stateRaw, actionRaw = {}) {
  const state = asObject(stateRaw);
  const action = asObject(actionRaw);
  const actionType = toText(action.type).toLowerCase();
  if (!actionType) return state;

  if (actionType === "hydrate_manual_gateway_choices") {
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "hydrate_manual_gateway_choices",
      { manualGatewayChoices: normalizeGatewayChoiceMap(action.choices) },
    );
  }

  if (actionType === "set_manual_gateway_choices") {
    const nextValue = resolveUpdater(state.manualGatewayChoices, action.updater);
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "set_manual_gateway_choices",
      { manualGatewayChoices: normalizeGatewayChoiceMap(nextValue) },
    );
  }

  if (actionType === "set_gateways") {
    const gateways = asArray(resolveUpdater(state.gateways, action.updater));
    const normalizedManualChoiceMap = action.pruneManualChoices === true
      ? normalizeManualChoiceMapForGateways(state.manualGatewayChoices, gateways)
      : state.manualGatewayChoices;
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "set_gateways",
      {
        gateways,
        manualGatewayChoices: normalizedManualChoiceMap,
      },
    );
  }

  if (actionType === "set_graph_error") {
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "set_graph_error",
      { graphError: toText(resolveUpdater(state.graphError, action.updater)) },
    );
  }

  if (actionType === "set_pending_gateway") {
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "set_pending_gateway",
      { pendingGateway: action.gateway || null },
    );
  }

  if (actionType === "set_is_playing") {
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "set_is_playing",
      { isPlaying: !!resolveUpdater(state.isPlaying, action.updater) },
    );
  }

  if (actionType === "set_index") {
    const nextIndexRaw = Number(resolveUpdater(state.index, action.updater));
    const nextIndex = Number.isFinite(nextIndexRaw) ? Math.max(0, Math.floor(nextIndexRaw)) : 0;
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "set_index",
      { index: nextIndex },
    );
  }

  if (actionType === "replace_frames") {
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "replace_frames",
      { frames: asArray(action.frames) },
    );
  }

  if (actionType === "append_events") {
    const events = asArray(action.events).filter(Boolean);
    if (!events.length) return state;
    const nextFrames = [...asArray(state.frames), ...events];
    const lastEvent = asObject(events[events.length - 1]);
    const lastType = toText(lastEvent?.type);
    let nextPending = state.pendingGateway;
    if (lastType === "wait_for_gateway_decision") {
      nextPending = lastEvent;
    } else if (lastType === "stop") {
      nextPending = null;
    }
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "append_events",
      {
        frames: nextFrames,
        pendingGateway: nextPending,
      },
    );
  }

  if (actionType === "runtime_reset") {
    const reason = toText(action.reason) || "runtime_reset";
    const restartReason = toText(action.restartReason || reason);
    return annotateTransition(
      state,
      actionType,
      reason,
      {
        isPlaying: false,
        pendingGateway: null,
        index: 0,
        frames: [],
        lastResetReason: reason,
        lastRestartReason: restartReason,
      },
    );
  }

  if (actionType === "seed_first_event") {
    const event = asObject(action.event);
    if (!Object.keys(event).length) return state;
    const nextFrames = [...asArray(state.frames), event];
    const nextIndex = Math.max(0, nextFrames.length - 1);
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "seed_first_event",
      {
        frames: nextFrames,
        index: nextIndex,
      },
    );
  }

  if (actionType === "session_scope_reset") {
    const base = createPlaybackPassRuntimeInitialState();
    return annotateTransition(
      base,
      actionType,
      toText(action.reason) || "session_scope_reset",
      {},
    );
  }

  if (actionType === "set_reset_tracker") {
    const semanticKey = toText(asObject(action.tracker).semanticKey);
    const routeDecisionByNodeId = normalizeGatewayChoiceMap(asObject(action.tracker).routeDecisionByNodeId);
    return annotateTransition(
      state,
      actionType,
      toText(action.reason) || "set_reset_tracker",
      {
        resetTracker: {
          semanticKey,
          routeDecisionByNodeId,
        },
      },
    );
  }

  return state;
}

function isBackendTraversalDone(materializedTraversalResultRaw, materializedAutoPassResultRaw) {
  const traversalStatus = toText(asObject(materializedTraversalResultRaw).status).toLowerCase();
  const autoPassStatus = toText(asObject(materializedAutoPassResultRaw).status).toLowerCase();
  const doneStatuses = new Set(["done", "completed", "success", "ok"]);
  if (doneStatuses.has(traversalStatus)) return true;
  if (doneStatuses.has(autoPassStatus)) return true;
  return false;
}

function isFailedTerminalReason(reasonRaw) {
  const reason = toText(reasonRaw).toLowerCase();
  if (!reason) return false;
  return (
    reason.includes("dead_end")
    || reason.includes("fail")
    || reason.includes("error")
    || reason.includes("loop_limit")
    || reason.includes("max_events")
    || reason.includes("empty_graph")
  );
}

export function derivePlaybackPassSnapshot({
  stateRaw = null,
  decisionStateRaw = null,
  hasEngine = false,
  autoPassUiStatusRaw = "",
  materializedTraversalResultRaw = null,
  materializedAutoPassResultRaw = null,
} = {}) {
  const state = asObject(stateRaw);
  const decisionState = asObject(decisionStateRaw);
  const frames = asArray(state.frames);
  const total = Number(frames.length || 0);
  const indexClamped = total <= 0
    ? 0
    : Math.max(0, Math.min(total - 1, Number(state.index || 0)));
  const currentFrame = frames[indexClamped] || null;
  const currentType = toText(asObject(currentFrame).type).toLowerCase();
  const stopReason = toText(asObject(currentFrame).reason).toLowerCase();
  const pendingGatewayState = asObject(state.pendingGateway);
  const pendingGatewayId = toText(pendingGatewayState.gatewayId || pendingGatewayState.nodeId);
  const pendingType = toText(pendingGatewayState.type).toLowerCase();
  const isWaitingGatewayDecision = pendingType === "wait_for_gateway_decision";
  const isTerminalPlaybackState = currentType === "stop";
  const isFailedTerminalState = isTerminalPlaybackState && isFailedTerminalReason(stopReason);
  const hasMeaningfulExecutionProgress = Number(indexClamped || 0) > 0
    || state.isPlaying === true
    || isWaitingGatewayDecision
    || isTerminalPlaybackState;
  const autoPassStatus = toText(autoPassUiStatusRaw).toLowerCase();
  const autoPassBusy = autoPassStatus === "queued" || autoPassStatus === "running" || autoPassStatus === "starting";
  const playbackCanRun = total > 0 || hasEngine === true;
  let runStatus = "idle";
  if (!playbackCanRun) {
    runStatus = "idle";
  } else if (toText(state.graphError)) {
    runStatus = "failed";
  } else if (state.isPlaying === true && autoPassBusy) {
    runStatus = "auto";
  } else if (state.isPlaying === true) {
    runStatus = "playing";
  } else if (isWaitingGatewayDecision) {
    runStatus = "waiting";
  } else if (isTerminalPlaybackState) {
    runStatus = isFailedTerminalState ? "failed" : "completed";
  } else if (hasMeaningfulExecutionProgress) {
    runStatus = "paused";
  }
  const backendDone = isBackendTraversalDone(materializedTraversalResultRaw, materializedAutoPassResultRaw);
  const isComplete = isTerminalPlaybackState || backendDone;
  const isAcceptable = backendDone || (isTerminalPlaybackState && !isFailedTerminalState);
  let completionReason = "runtime_in_progress";
  if (backendDone) completionReason = "backend_materialized_done";
  else if (isTerminalPlaybackState) completionReason = `runtime_terminal_${toText(stopReason) || "stop"}`;
  let acceptanceReason = "runtime_not_acceptable";
  if (backendDone) acceptanceReason = "backend_materialized_done";
  else if (isTerminalPlaybackState && !isFailedTerminalState) acceptanceReason = "runtime_terminal_success";
  else if (isTerminalPlaybackState && isFailedTerminalState) acceptanceReason = "runtime_terminal_failed";
  const runStatusLabel = ({
    idle: "Idle",
    waiting: "Ожидает решение",
    playing: "Воспроизведение",
    paused: "Пауза",
    auto: "Автопроход",
    completed: "Завершён",
    failed: "Ошибка",
  }[runStatus] || "Idle");
  const runStatusTone = ({
    idle: "",
    waiting: "isWarning",
    playing: "isAccent",
    paused: "",
    auto: "isAccent",
    completed: "isSuccess",
    failed: "isDanger",
  }[runStatus] || "");
  return {
    status: "ready",
    runStatus,
    runStatusLabel,
    runStatusTone,
    playbackCanRun,
    currentFrame,
    frames,
    progress: {
      index: indexClamped,
      total,
      label: `${Math.min(indexClamped + 1, Math.max(total, 1))} / ${total}`,
    },
    currentNodeId: toText(asObject(currentFrame).nodeId || asObject(currentFrame).gatewayId),
    pendingGatewayId,
    pendingGatewayState: Object.keys(pendingGatewayState).length ? pendingGatewayState : null,
    routeDecisionByNodeId: normalizeGatewayChoiceMap(decisionState.routeDecisionByNodeId),
    gatewayChoiceSource: toText(decisionState.choiceSource) || "manual_local_choices",
    sourceOfTruth: {
      mode: toText(decisionState.effectiveMode) || PLAYBACK_DECISION_MODE_MANUAL,
      choiceSource: toText(decisionState.choiceSource) || "manual_local_choices",
      readOnly: decisionState.readOnly === true,
      fallbackApplied: decisionState.fallbackApplied === true,
      hasMaterialized: decisionState.hasMaterialized === true,
    },
    isComplete,
    isAcceptable,
    shouldShowDocCta: isAcceptable,
    isWaitingGatewayDecision,
    isTerminalPlaybackState,
    isFailedTerminalState,
    hasMeaningfulExecutionProgress,
    completionReason,
    acceptanceReason,
    resetReason: toText(state.lastResetReason),
    restartReason: toText(state.lastRestartReason),
    diagnostics: {
      lastTransitionType: toText(state.lastTransitionType),
      lastTransitionReason: toText(state.lastTransitionReason),
      backendDone,
      isWaitingGatewayDecision,
      isTerminalPlaybackState,
      isFailedTerminalState,
    },
  };
}
