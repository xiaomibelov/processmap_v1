import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  createPlaybackEngine,
  normalizePlaybackScenarioSpec,
} from "../../playback/playbackEngine.js";
import { asArray, asObject } from "../../lib/processStageDomain.js";
import { extractGateways } from "../../playback/utils/extractGateways.js";
import {
  PLAYBACK_DECISION_MODE_AUTO_PASS,
  PLAYBACK_DECISION_MODE_MANUAL,
  buildGatewayChoiceSemanticKey,
  buildMaterializedGatewayChoiceMap,
  buildPlaybackResetInputSemanticKey,
  canEditPlaybackGatewayChoice,
  createPlaybackPassRuntimeInitialState,
  derivePlaybackPassSnapshot,
  evaluatePlaybackResetTransition,
  normalizeGatewayChoiceMap,
  playbackPassRuntimeReducer,
  resolvePlaybackGatewayDecisionState,
  shouldBypassPlaybackResetForInteractiveGatewayChoice,
  shouldResetPlaybackRuntimeForInputChange,
} from "../../playback/playbackPassRuntime.js";

export {
  PLAYBACK_DECISION_MODE_AUTO_PASS,
  PLAYBACK_DECISION_MODE_MANUAL,
  buildGatewayChoiceSemanticKey,
  buildMaterializedGatewayChoiceMap,
  buildPlaybackResetInputSemanticKey,
  canEditPlaybackGatewayChoice,
  normalizeGatewayChoiceMap,
  resolvePlaybackGatewayDecisionState,
  shouldBypassPlaybackResetForInteractiveGatewayChoice,
  shouldResetPlaybackRuntimeForInputChange,
};

function toText(value) {
  return String(value || "").trim();
}

const PLAYBACK_GATEWAY_CHOICES_KEY = "pm:playback_gateway_choices:v1";

function readGatewayChoices(sessionIdRaw) {
  if (typeof window === "undefined") return {};
  const sessionId = toText(sessionIdRaw);
  if (!sessionId) return {};
  try {
    const raw = window.localStorage?.getItem(PLAYBACK_GATEWAY_CHOICES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const bySession = asObject(parsed?.bySession);
    return asObject(bySession[sessionId]);
  } catch {
    return {};
  }
}

function writeGatewayChoices(sessionIdRaw, choicesRaw) {
  if (typeof window === "undefined") return;
  const sessionId = toText(sessionIdRaw);
  if (!sessionId) return;
  try {
    const raw = window.localStorage?.getItem(PLAYBACK_GATEWAY_CHOICES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const bySession = asObject(parsed?.bySession);
    window.localStorage?.setItem(
      PLAYBACK_GATEWAY_CHOICES_KEY,
      JSON.stringify({
        ...asObject(parsed),
        bySession: {
          ...bySession,
          [sessionId]: asObject(choicesRaw),
        },
      }),
    );
  } catch {
    // no-op
  }
}

function normalizePathTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function normalizePathSequenceKey(raw) {
  return toText(raw);
}

function buildPlaybackScenarioKey(tierRaw, sequenceKeyRaw) {
  const tier = normalizePathTier(tierRaw);
  const sequenceKey = normalizePathSequenceKey(sequenceKeyRaw);
  if (!tier) return "active";
  if (!sequenceKey) return tier;
  return `${tier}::${sequenceKey}`;
}

function parsePlaybackScenarioKey(keyRaw, fallbackRaw = {}) {
  const key = toText(keyRaw);
  const fallback = asObject(fallbackRaw);
  if (!key || key === "active") {
    return normalizePlaybackScenarioSpec({
      tier: normalizePathTier(fallback?.tier),
      sequenceKey: normalizePathSequenceKey(fallback?.sequenceKey),
      label: toText(fallback?.label) || "Active scenario",
    });
  }
  const [tierRaw, sequenceRaw] = key.split("::");
  return normalizePlaybackScenarioSpec({
    tier: normalizePathTier(tierRaw),
    sequenceKey: normalizePathSequenceKey(sequenceRaw),
    label: key,
  });
}

function shortPlaybackId(rawId) {
  const id = toText(rawId);
  if (!id) return "";
  if (id.length <= 16) return id;
  return id.slice(-10);
}

function shouldDebugPlayback() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.DEBUG_PLAYBACK ?? window.localStorage?.getItem("DEBUG_PLAYBACK") ?? "";
    return String(raw || "").trim() === "1";
  } catch {
    return String(window.DEBUG_PLAYBACK || "").trim() === "1";
  }
}

function safeTracePayload(payloadRaw) {
  try {
    return JSON.parse(JSON.stringify(payloadRaw || {}));
  } catch {
    return { error: "trace_payload_not_serializable" };
  }
}

function captureTraceStack() {
  try {
    return String(new Error().stack || "")
      .split("\n")
      .slice(2, 6)
      .map((line) => line.trim())
      .join(" | ");
  } catch {
    return "";
  }
}

function pushPlaybackTrace(stage, payloadRaw = {}) {
  if (typeof window === "undefined") return;
  if (!shouldDebugPlayback()) return;
  try {
    const trace = Array.isArray(window.__FPC_PLAYBACK_TRACE__) ? window.__FPC_PLAYBACK_TRACE__ : [];
    trace.push({
      ts: Date.now(),
      stage: toText(stage),
      ...safeTracePayload(payloadRaw),
    });
    if (trace.length > 800) trace.splice(0, trace.length - 800);
    window.__FPC_PLAYBACK_TRACE__ = trace;
  } catch {
    // no-op
  }
}

function logPlaybackDebug(stage, payload = {}) {
  if (!shouldDebugPlayback()) return;
  pushPlaybackTrace(stage, payload);
  // eslint-disable-next-line no-console
  console.debug(`[PLAYBACK_DEBUG] ${String(stage || "-")}`, payload);
}

function stripRouteSegmentFromResetSemanticKey(keyRaw) {
  const key = toText(keyRaw);
  if (!key) return "";
  return key
    .split("|")
    .filter((segmentRaw) => !toText(segmentRaw).startsWith("route:"))
    .join("|");
}

export function shouldBypassPlaybackResetForInteractivePendingGatewayDecision({
  decisionShouldReset = false,
  decisionReason = "",
  prevSemanticKeyRaw = "",
  nextSemanticKeyRaw = "",
  prevRouteDecisionByNodeIdRaw = null,
  nextRouteDecisionByNodeIdRaw = null,
  playbackDecisionMode = PLAYBACK_DECISION_MODE_MANUAL,
  playbackReadOnly = false,
  latchRaw = null,
  nowMs = Date.now(),
  maxAgeMs = 2500,
} = {}) {
  if (decisionShouldReset !== true) return false;
  if (toText(decisionReason) !== "semantic_inputs_changed") return false;
  if (playbackReadOnly === true) return false;
  if (toText(playbackDecisionMode) !== PLAYBACK_DECISION_MODE_MANUAL) return false;
  const latch = asObject(latchRaw);
  const gatewayId = toText(latch.gatewayId);
  const chosenFlowId = toText(latch.chosenFlowId);
  const previousPendingGatewayId = toText(latch.previousPendingGatewayId);
  if (!gatewayId || !chosenFlowId) return false;
  if (previousPendingGatewayId !== gatewayId) return false;
  if (toText(latch.mode) !== PLAYBACK_DECISION_MODE_MANUAL) return false;
  const createdAtMs = Number(latch.createdAtMs || 0);
  const now = Number(nowMs || Date.now());
  const ttlMs = Math.max(250, Number(maxAgeMs || 0));
  if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
    const age = now - createdAtMs;
    if (!Number.isFinite(age) || age < 0 || age > ttlMs) return false;
  }
  const nextRouteDecisionByNodeId = normalizeGatewayChoiceMap(nextRouteDecisionByNodeIdRaw);
  if (toText(nextRouteDecisionByNodeId[gatewayId]) !== chosenFlowId) return false;
  const routeChangeIsInteractivePendingChoice = shouldBypassPlaybackResetForInteractiveGatewayChoice({
    prevRouteDecisionByNodeIdRaw,
    nextRouteDecisionByNodeIdRaw,
    pendingGatewayIdRaw: gatewayId,
    playbackDecisionMode,
    playbackReadOnly,
  });
  if (!routeChangeIsInteractivePendingChoice) return false;
  const prevWithoutRoute = stripRouteSegmentFromResetSemanticKey(prevSemanticKeyRaw);
  const nextWithoutRoute = stripRouteSegmentFromResetSemanticKey(nextSemanticKeyRaw);
  if (prevWithoutRoute !== nextWithoutRoute) return false;
  return true;
}

export function buildPlaybackPendingGatewayVisitToken(pendingGatewayRaw = null) {
  const pendingGateway = asObject(pendingGatewayRaw);
  const gatewayId = toText(pendingGateway.gatewayId || pendingGateway.nodeId);
  if (!gatewayId) return "";
  const eventId = toText(pendingGateway.id || pendingGateway.eventId || pendingGateway.waitId);
  if (eventId) return `${gatewayId}::${eventId}`;
  const outgoingFlowIds = asArray(pendingGateway.outgoingOptions)
    .map((optionRaw) => toText(asObject(optionRaw).flowId))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), "ru"));
  return `${gatewayId}::${outgoingFlowIds.join(",")}`;
}

export function shouldAutoConsumeManualPendingGatewayChoice({
  pendingGatewayRaw = null,
  stagedChoiceRaw = null,
  playbackDecisionMode = PLAYBACK_DECISION_MODE_MANUAL,
  playbackReadOnly = false,
} = {}) {
  if (playbackReadOnly === true) return false;
  if (toText(playbackDecisionMode) !== PLAYBACK_DECISION_MODE_MANUAL) return false;
  const pendingGateway = asObject(pendingGatewayRaw);
  const pendingGatewayId = toText(pendingGateway.gatewayId || pendingGateway.nodeId);
  if (!pendingGatewayId) return false;
  const pendingVisitToken = buildPlaybackPendingGatewayVisitToken(pendingGateway);
  if (!pendingVisitToken) return false;
  const stagedChoice = asObject(stagedChoiceRaw);
  const stagedGatewayId = toText(stagedChoice.gatewayId);
  const stagedFlowId = toText(stagedChoice.flowId);
  const stagedVisitToken = toText(stagedChoice.pendingVisitToken);
  if (!stagedGatewayId || !stagedFlowId || !stagedVisitToken) return false;
  if (stagedGatewayId !== pendingGatewayId) return false;
  if (stagedVisitToken !== pendingVisitToken) return false;
  const options = asArray(pendingGateway.outgoingOptions);
  return options.some((optionRaw) => toText(asObject(optionRaw).flowId) === stagedFlowId);
}

function playbackEventTitle(eventRaw) {
  const event = asObject(eventRaw);
  const type = toText(event?.type);
  if (type === "take_flow") return `Flow: ${toText(event?.flowId) || "—"}`;
  if (type === "enter_node") return `${toText(event?.nodeName || event?.nodeId) || "Node"}`;
  if (type === "wait_for_gateway_decision") return `Gateway: ${formatPlaybackGatewayTitle(event)}`;
  if (type === "parallel_batch_begin") return `Parallel x${Number(event?.count || asArray(event?.flowIds).length || 0)}`;
  if (type === "enter_subprocess") return `Enter ${toText(event?.nodeName || event?.subprocessId) || "subprocess"}`;
  if (type === "exit_subprocess") return `Exit ${toText(event?.nodeName || event?.subprocessId) || "subprocess"}`;
  if (type === "stop") return `Stop: ${toText(event?.reason) || "done"}`;
  return toText(event?.nodeName || event?.nodeId || type || "—");
}

function formatPlaybackGatewayTitle(eventRaw) {
  const event = asObject(eventRaw);
  const gatewayName = toText(event?.gatewayName);
  const gatewayId = shortPlaybackId(event?.gatewayId || event?.nodeId);
  if (gatewayName && gatewayId) return `${gatewayName} (${gatewayId})`;
  if (gatewayName) return gatewayName;
  if (gatewayId) return `Gateway (${gatewayId})`;
  return "Gateway";
}

function playbackGatewayOptionLabel(optionRaw, index = 0) {
  const option = asObject(optionRaw);
  const label = toText(option?.label || option?.condition);
  if (label) return label;
  return `Выбор ${Number(index || 0) + 1}`;
}

function buildHighlightedBpmnIds(eventRaw) {
  const event = asObject(eventRaw);
  const ids = new Set();
  [
    event?.flowId,
    event?.nodeId,
    event?.gatewayId,
    event?.subprocessId,
    event?.fromId,
    event?.toId,
    event?.linkTargetId,
  ].forEach((idRaw) => {
    const id = toText(idRaw);
    if (id) ids.add(id);
  });
  return ids;
}

function buildPlaybackHighlightTargets(eventRaw) {
  const event = asObject(eventRaw);
  const nodeIds = new Set();
  const edgeIds = new Set();
  [
    event?.nodeId,
    event?.gatewayId,
    event?.subprocessId,
    event?.fromId,
    event?.toId,
    event?.linkTargetId,
  ].forEach((idRaw) => {
    const id = toText(idRaw);
    if (id) nodeIds.add(id);
  });
  [event?.flowId, event?.edgeId].forEach((idRaw) => {
    const id = toText(idRaw);
    if (id) edgeIds.add(id);
  });
  return {
    nodeIds: Array.from(nodeIds),
    edgeIds: Array.from(edgeIds),
  };
}

export default function usePlaybackController({
  sid,
  tab,
  draftBpmnXml,
  diagramActionPlaybackOpen,
  bpmnRef,
  draftInterview,
  executionPlanSteps,
  executionPlanPathId,
  executionPlanScenarioLabel,
  pathHighlightCatalog,
  pathHighlightTier,
  pathHighlightSequenceKey,
  flowTierMetaMap,
  nodePathMetaMap,
  playbackDecisionMode = PLAYBACK_DECISION_MODE_MANUAL,
  autoPassUiStatus = "",
  materializedTraversalResult = null,
  materializedAutoPassResult = null,
  initialPlaybackAutoCamera = true,
  initialPlaybackSpeed = "1",
  initialPlaybackManualAtGateway = false,
  initialPlaybackScenarioKey = "active",
}) {
  const playbackRafRef = useRef(0);
  const playbackLastTickRef = useRef(0);
  const playbackEngineRef = useRef(null);
  const playbackFramesRef = useRef([]);
  const playbackIndexRef = useRef(0);
  const playbackResumeAfterDecisionRef = useRef(false);
  const playbackOverlayClickGuardRef = useRef(false);
  const playbackOverlayClickGuardRafRef = useRef(0);
  const playbackGatewayDecisionRef = useRef(null);
  const resetPlaybackRuntimeRef = useRef(() => false);
  const interactivePendingGatewayDecisionRef = useRef(null);
  const manualPendingGatewayChoiceRef = useRef(null);
  const playbackTraceSnapshotKeyRef = useRef("");
  const playbackTracePendingGatewayRef = useRef("");
  const playbackTraceRouteDecisionRef = useRef("");

  const [playbackAutoCamera, setPlaybackAutoCamera] = useState(!!initialPlaybackAutoCamera);
  const [playbackSpeed, setPlaybackSpeed] = useState(toText(initialPlaybackSpeed) || "1");
  const [playbackManualAtGateway, setPlaybackManualAtGateway] = useState(!!initialPlaybackManualAtGateway);
  const [playbackScenarioKey, setPlaybackScenarioKey] = useState(toText(initialPlaybackScenarioKey) || "active");
  const [playbackPassState, dispatchPlaybackPass] = useReducer(
    playbackPassRuntimeReducer,
    null,
    () => {
      const base = createPlaybackPassRuntimeInitialState();
      return {
        ...base,
        manualGatewayChoices: normalizeGatewayChoiceMap(readGatewayChoices(sid)),
      };
    },
  );
  const playbackIsPlaying = playbackPassState.isPlaying === true;
  const playbackFrames = asArray(playbackPassState.frames);
  const playbackGatewayPending = playbackPassState.pendingGateway || null;
  const playbackGateways = asArray(playbackPassState.gateways);
  const playbackGatewayChoices = normalizeGatewayChoiceMap(playbackPassState.manualGatewayChoices);
  const playbackGraphError = toText(playbackPassState.graphError);
  const playbackIndex = Number(playbackPassState.index || 0);

  const setPlaybackIsPlaying = useCallback((updaterRaw, reason = "set_is_playing") => {
    dispatchPlaybackPass({ type: "set_is_playing", updater: updaterRaw, reason });
  }, []);
  const setPlaybackFrames = useCallback((nextFramesRaw, reason = "replace_frames") => {
    dispatchPlaybackPass({ type: "replace_frames", frames: asArray(nextFramesRaw), reason });
  }, []);
  const setPlaybackGatewayPending = useCallback((gatewayRaw, reason = "set_pending_gateway") => {
    dispatchPlaybackPass({ type: "set_pending_gateway", gateway: gatewayRaw || null, reason });
  }, []);
  const setPlaybackGateways = useCallback((gatewaysRaw, { pruneManualChoices = false, reason = "set_gateways" } = {}) => {
    dispatchPlaybackPass({
      type: "set_gateways",
      updater: asArray(gatewaysRaw),
      pruneManualChoices: pruneManualChoices === true,
      reason,
    });
  }, []);
  const setPlaybackGatewayChoices = useCallback((updaterRaw, reason = "set_manual_gateway_choices") => {
    dispatchPlaybackPass({ type: "set_manual_gateway_choices", updater: updaterRaw, reason });
  }, []);
  const setPlaybackGraphError = useCallback((errorRaw, reason = "set_graph_error") => {
    dispatchPlaybackPass({ type: "set_graph_error", updater: toText(errorRaw), reason });
  }, []);
  const setPlaybackIndex = useCallback((updaterRaw, reason = "set_index") => {
    dispatchPlaybackPass({ type: "set_index", updater: updaterRaw, reason });
  }, []);

  const playbackSpeedValue = Number(playbackSpeed || 1);
  const playbackMaterializedGatewayChoices = useMemo(
    () => buildMaterializedGatewayChoiceMap({
      traversalResultRaw: materializedTraversalResult,
      autoPassResultRaw: materializedAutoPassResult,
    }),
    [materializedAutoPassResult, materializedTraversalResult],
  );
  const playbackGatewayDecisionState = useMemo(
    () => resolvePlaybackGatewayDecisionState({
      requestedMode: playbackDecisionMode,
      manualChoiceMapRaw: playbackGatewayChoices,
      materializedChoiceMapRaw: playbackMaterializedGatewayChoices,
    }),
    [playbackDecisionMode, playbackGatewayChoices, playbackMaterializedGatewayChoices],
  );
  const playbackEffectiveDecisionMode = toText(playbackGatewayDecisionState.effectiveMode) || PLAYBACK_DECISION_MODE_MANUAL;
  const playbackGatewayChoiceSource = toText(playbackGatewayDecisionState.choiceSource);
  const playbackGatewayChoicesResolvedRaw = useMemo(
    () => normalizeGatewayChoiceMap(playbackGatewayDecisionState.panelChoices),
    [playbackGatewayDecisionState.panelChoices],
  );
  const playbackGatewayChoicesResolvedKey = useMemo(
    () => buildGatewayChoiceSemanticKey(playbackGatewayChoicesResolvedRaw),
    [playbackGatewayChoicesResolvedRaw],
  );
  const playbackGatewayChoicesResolved = useMemo(
    () => playbackGatewayChoicesResolvedRaw,
    [playbackGatewayChoicesResolvedKey],
  );
  const playbackRouteDecisionByNodeIdRaw = useMemo(
    () => (
      playbackEffectiveDecisionMode === PLAYBACK_DECISION_MODE_MANUAL && playbackManualAtGateway
        ? {}
        : normalizeGatewayChoiceMap(playbackGatewayDecisionState.routeDecisionByNodeId)
    ),
    [
      playbackEffectiveDecisionMode,
      playbackGatewayDecisionState.routeDecisionByNodeId,
      playbackManualAtGateway,
    ],
  );
  const playbackRouteDecisionByNodeIdKey = useMemo(
    () => buildGatewayChoiceSemanticKey(playbackRouteDecisionByNodeIdRaw),
    [playbackRouteDecisionByNodeIdRaw],
  );
  const playbackRouteDecisionByNodeId = useMemo(
    () => playbackRouteDecisionByNodeIdRaw,
    [playbackRouteDecisionByNodeIdKey],
  );
  const playbackGatewayReadOnly = playbackGatewayDecisionState.readOnly === true;
  const playbackEngineManualAtGateway = (
    playbackEffectiveDecisionMode === PLAYBACK_DECISION_MODE_AUTO_PASS
      ? true
      : playbackManualAtGateway
  );
  const playbackActiveScenarioFallback = useMemo(() => {
    const debug = asObject(asObject(draftInterview).report_build_debug);
    return {
      tier: normalizePathTier(debug?.scenario_tier || pathHighlightTier || "P0") || "P0",
      sequenceKey: normalizePathSequenceKey(debug?.sequence_key || pathHighlightSequenceKey),
      label: toText(debug?.selectedScenarioLabel || executionPlanScenarioLabel || "Active scenario"),
    };
  }, [draftInterview, executionPlanScenarioLabel, pathHighlightSequenceKey, pathHighlightTier]);
  const playbackScenarioOptions = useMemo(() => {
    const catalog = asObject(pathHighlightCatalog);
    const out = [
      {
        key: "active",
        label: `Active: ${toText(playbackActiveScenarioFallback?.label) || "Scenario"}`,
        tier: normalizePathTier(playbackActiveScenarioFallback?.tier),
        sequenceKey: normalizePathSequenceKey(playbackActiveScenarioFallback?.sequenceKey),
      },
    ];
    ["P0", "P1", "P2"].forEach((tier) => {
      const row = asObject(catalog[tier]);
      const sequences = asArray(row?.sequenceKeys);
      if (!sequences.length && (Number(row?.nodes || 0) > 0 || Number(row?.flows || 0) > 0)) {
        out.push({
          key: buildPlaybackScenarioKey(tier, ""),
          label: `${tier} (all)`,
          tier,
          sequenceKey: "",
        });
        return;
      }
      sequences.forEach((sequenceKey) => {
        out.push({
          key: buildPlaybackScenarioKey(tier, sequenceKey),
          label: `${tier} · ${sequenceKey}`,
          tier,
          sequenceKey,
        });
      });
    });
    const dedupe = {};
    out.forEach((itemRaw) => {
      const item = asObject(itemRaw);
      const key = toText(item?.key);
      if (!key || dedupe[key]) return;
      dedupe[key] = {
        key,
        label: toText(item?.label || key),
        tier: normalizePathTier(item?.tier),
        sequenceKey: normalizePathSequenceKey(item?.sequenceKey),
      };
    });
    return Object.values(dedupe);
  }, [pathHighlightCatalog, playbackActiveScenarioFallback]);
  const playbackScenarioSpec = useMemo(() => parsePlaybackScenarioKey(
    playbackScenarioKey,
    playbackActiveScenarioFallback,
  ), [playbackScenarioKey, playbackActiveScenarioFallback]);
  const playbackScenarioLabel = useMemo(() => {
    const row = playbackScenarioOptions.find((item) => toText(item?.key) === toText(playbackScenarioKey));
    return toText(row?.label || playbackActiveScenarioFallback?.label || "Scenario");
  }, [playbackScenarioOptions, playbackScenarioKey, playbackActiveScenarioFallback]);
  const playbackResetInputSemanticKey = useMemo(
    () => buildPlaybackResetInputSemanticKey({
      draftBpmnXml,
      flowTierMetaMapRaw: flowTierMetaMap,
      nodePathMetaMapRaw: nodePathMetaMap,
      routeDecisionByNodeIdRaw: playbackRouteDecisionByNodeId,
      scenarioKey: playbackScenarioKey,
      engineManualAtGateway: playbackEngineManualAtGateway,
      choiceSource: playbackGatewayChoiceSource,
    }),
    [
      draftBpmnXml,
      flowTierMetaMap,
      nodePathMetaMap,
      playbackEngineManualAtGateway,
      playbackGatewayChoiceSource,
      playbackRouteDecisionByNodeIdKey,
      playbackScenarioKey,
    ],
  );

  const playbackRuntimeSnapshot = useMemo(() => derivePlaybackPassSnapshot({
    stateRaw: playbackPassState,
    decisionStateRaw: playbackGatewayDecisionState,
    hasEngine: !!playbackEngineRef.current,
    autoPassUiStatusRaw: autoPassUiStatus,
    materializedTraversalResultRaw: materializedTraversalResult,
    materializedAutoPassResultRaw: materializedAutoPassResult,
  }), [
    autoPassUiStatus,
    materializedAutoPassResult,
    materializedTraversalResult,
    playbackGatewayDecisionState,
    playbackPassState,
  ]);
  const playbackTotal = Number(asObject(playbackRuntimeSnapshot.progress).total || 0);
  const playbackCanRun = playbackRuntimeSnapshot.playbackCanRun === true;
  const playbackIndexClamped = Number(asObject(playbackRuntimeSnapshot.progress).index || 0);
  const playbackCurrentEvent = playbackRuntimeSnapshot.currentFrame || null;
  const playbackIntervalMs = useMemo(
    () => Math.max(140, Math.round(900 / (Number.isFinite(playbackSpeedValue) && playbackSpeedValue > 0 ? playbackSpeedValue : 1))),
    [playbackSpeedValue],
  );
  const playbackHighlightedBpmnIds = useMemo(
    () => buildHighlightedBpmnIds(playbackCurrentEvent),
    [playbackCurrentEvent],
  );
  const highlightTargets = useMemo(
    () => buildPlaybackHighlightTargets(playbackCurrentEvent),
    [playbackCurrentEvent],
  );
  const playbackAwaitingGatewayId = toText(
    playbackGatewayPending?.gatewayId
      || playbackGatewayPending?.nodeId,
  );
  const playbackPendingGatewayVisitToken = useMemo(
    () => buildPlaybackPendingGatewayVisitToken(playbackGatewayPending),
    [playbackGatewayPending],
  );

  const setPlaybackGatewayChoice = useCallback((gatewayIdRaw, flowIdRaw, optionsRaw = {}) => {
    const options = asObject(optionsRaw);
    const source = toText(options.source);
    const gatewayId = toText(gatewayIdRaw);
    if (!canEditPlaybackGatewayChoice({
      gatewayIdRaw: gatewayId,
      pendingGatewayIdRaw: playbackAwaitingGatewayId,
      playbackDecisionMode: playbackEffectiveDecisionMode,
      playbackReadOnly: playbackGatewayReadOnly,
    })) {
      pushPlaybackTrace("gateway_choice_rejected_by_guard", {
        gatewayId,
        flowId: toText(flowIdRaw),
        pendingGatewayId: playbackAwaitingGatewayId,
        mode: playbackEffectiveDecisionMode,
        readOnly: playbackGatewayReadOnly === true,
      });
      return;
    }
    const flowId = toText(flowIdRaw);
    pushPlaybackTrace("gateway_choice_set_manual", {
      gatewayId,
      flowId,
      source,
      pendingGatewayId: playbackAwaitingGatewayId,
      pendingVisitToken: playbackPendingGatewayVisitToken,
      mode: playbackEffectiveDecisionMode,
      readOnly: playbackGatewayReadOnly === true,
    });
    if (
      source !== "runtime_apply"
      && playbackEffectiveDecisionMode === PLAYBACK_DECISION_MODE_MANUAL
      && playbackManualAtGateway
      && gatewayId
      && flowId
      && gatewayId === playbackAwaitingGatewayId
      && playbackPendingGatewayVisitToken
    ) {
      manualPendingGatewayChoiceRef.current = {
        gatewayId,
        flowId,
        pendingVisitToken: playbackPendingGatewayVisitToken,
        mode: playbackEffectiveDecisionMode,
        createdAtMs: Date.now(),
      };
      pushPlaybackTrace("manual_pending_gateway_choice_staged", {
        gatewayId,
        flowId,
        pendingVisitToken: playbackPendingGatewayVisitToken,
      });
    } else if (source === "runtime_apply") {
      manualPendingGatewayChoiceRef.current = null;
      pushPlaybackTrace("manual_pending_gateway_choice_consumed", {
        gatewayId,
        flowId,
      });
    }
    setPlaybackGatewayChoices((prevRaw) => {
      const prev = asObject(prevRaw);
      if (!flowId) {
        if (!(gatewayId in prev)) return prev;
        const next = { ...prev };
        delete next[gatewayId];
        return next;
      }
      if (toText(prev[gatewayId]) === flowId) return prev;
      return {
        ...prev,
        [gatewayId]: flowId,
      };
    });
  }, [
    playbackAwaitingGatewayId,
    playbackEffectiveDecisionMode,
    playbackGatewayReadOnly,
    playbackManualAtGateway,
    playbackPendingGatewayVisitToken,
  ]);

  const markPlaybackOverlayInteraction = useCallback((meta = {}) => {
    playbackOverlayClickGuardRef.current = true;
    logPlaybackDebug("overlay_interaction_guard", {
      ...asObject(meta),
      enabled: 1,
    });
    if (playbackOverlayClickGuardRafRef.current) {
      window.cancelAnimationFrame(playbackOverlayClickGuardRafRef.current);
    }
    playbackOverlayClickGuardRafRef.current = window.requestAnimationFrame(() => {
      playbackOverlayClickGuardRef.current = false;
      playbackOverlayClickGuardRafRef.current = 0;
    });
  }, []);

  const overlayInteractionGuard = useMemo(() => ({
    markOverlayInteraction(meta = {}) {
      markPlaybackOverlayInteraction(meta);
    },
    shouldIgnorePlaybackReset() {
      return playbackOverlayClickGuardRef.current === true;
    },
  }), [markPlaybackOverlayInteraction]);

  const stopPlaybackTicker = useCallback((reason = "") => {
    if (playbackRafRef.current) {
      window.cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = 0;
    }
    playbackLastTickRef.current = 0;
    if (reason) {
      logPlaybackDebug("ticker_stop", { reason });
    }
  }, []);

  const clearPlaybackDecor = useCallback((reason = "") => {
    if (reason) {
      const stack = String(new Error().stack || "")
        .split("\n")
        .slice(1, 4)
        .map((line) => line.trim())
        .join(" | ");
      logPlaybackDebug("clear_playback_decor", {
        reason,
        stack,
      });
    }
    bpmnRef.current?.clearPlayback?.();
  }, [bpmnRef]);

  const syncPlaybackFrames = useCallback((nextFramesRaw) => {
    const nextFrames = asArray(nextFramesRaw);
    playbackFramesRef.current = nextFrames;
    setPlaybackFrames(nextFrames, "sync_playback_frames");
  }, [setPlaybackFrames]);

  const appendPlaybackEvents = useCallback((eventsRaw, options = {}) => {
    const events = asArray(eventsRaw).filter(Boolean);
    if (!events.length) return playbackFramesRef.current;
    const next = [...asArray(playbackFramesRef.current), ...events];
    dispatchPlaybackPass({
      type: "append_events",
      events,
      reason: toText(options?.reason || "append_playback_events"),
    });
    playbackFramesRef.current = next;
    bpmnRef.current?.preparePlayback?.(next);
    const lastEvent = asObject(events[events.length - 1]);
    if (toText(lastEvent?.type) === "wait_for_gateway_decision") {
      logPlaybackDebug("wait_for_gateway_decision", {
        gatewayId: toText(lastEvent?.gatewayId),
        outgoingFlowIds: asArray(lastEvent?.outgoingOptions)
          .map((optionRaw) => toText(asObject(optionRaw)?.flowId))
          .filter(Boolean),
      });
    } else if (toText(lastEvent?.type) === "stop") {
      const metrics = asObject(lastEvent?.metrics);
      logPlaybackDebug("run_summary_ui", {
        reason: toText(lastEvent?.reason),
        stepsTotal: Number(metrics?.stepsTotal || 0),
        businessSteps: Number(metrics?.businessSteps || 0),
        variationPoints: Number(metrics?.variationPoints || 0),
        manualDecisionPrompts: Number(metrics?.manualDecisionPrompts || 0),
        manualDecisionsApplied: Number(metrics?.manualDecisionsApplied || 0),
        autoDecisionsApplied: Number(metrics?.autoDecisionsApplied || 0),
        flowTransitions: Number(metrics?.flowTransitions || 0),
        visitedNodes: Number(metrics?.visitedNodes || 0),
        linkJumps: Number(metrics?.linkJumps || 0),
      });
    }
    return next;
  }, [bpmnRef, dispatchPlaybackPass]);

  const buildPlaybackEngineNow = useCallback(() => {
    const graphRes = asObject(bpmnRef.current?.getPlaybackGraph?.());
    if (!graphRes?.ok) {
      const msg = toText(graphRes?.reason || "playback_graph_unavailable");
      setPlaybackGraphError(msg || "Не удалось построить playback graph.", "playback_graph_unavailable");
      setPlaybackGateways([], { pruneManualChoices: false, reason: "playback_graph_unavailable" });
      playbackEngineRef.current = null;
      return null;
    }
    const gateways = extractGateways(graphRes);
    setPlaybackGateways(gateways, {
      pruneManualChoices: !playbackGatewayReadOnly,
      reason: "playback_graph_built",
    });
    const normalizedRouteDecisions = playbackRouteDecisionByNodeId;
    const scenario = playbackScenarioSpec;
    if (playbackGatewayDecisionState.fallbackApplied === true) {
      logPlaybackDebug("decision_source_fallback_manual", {
        requestedMode: PLAYBACK_DECISION_MODE_AUTO_PASS,
        reason: "materialized_missing",
      });
    }
    const engine = createPlaybackEngine({
      graph: graphRes,
      scenario,
      flowMetaById: flowTierMetaMap,
      nodePathMetaById: nodePathMetaMap,
      routeDecisionByNodeId: normalizedRouteDecisions,
      manualAtGateway: playbackEngineManualAtGateway,
      loopLimit: 3,
      maxEvents: 2000,
    });
    setPlaybackGraphError("", "playback_graph_built");
    playbackEngineRef.current = engine;
    return engine;
  }, [
    bpmnRef,
    flowTierMetaMap,
    nodePathMetaMap,
    playbackEngineManualAtGateway,
    playbackGatewayDecisionState.fallbackApplied,
    playbackGatewayReadOnly,
    playbackRouteDecisionByNodeId,
    playbackScenarioSpec,
    setPlaybackGateways,
    setPlaybackGraphError,
  ]);

  const applyPlaybackFrame = useCallback((indexRaw, options = {}) => {
    const frames = asArray(playbackFramesRef.current);
    const total = Number(frames.length || 0);
    if (total <= 0) {
      clearPlaybackDecor("apply_frame_empty");
      return 0;
    }
    const index = Math.max(0, Math.min(total - 1, Number(indexRaw || 0)));
    const event = asObject(frames[index]);
    const autoCamera = options?.autoCamera === true || (!!playbackAutoCamera && options?.autoCamera !== false);
    if (toText(event?.type) === "wait_for_gateway_decision") {
      setPlaybackGatewayPending(event);
    } else if (toText(event?.type) === "stop") {
      setPlaybackGatewayPending(null);
    }
    bpmnRef.current?.setPlaybackFrame?.({
      event,
      index,
      total,
      autoCamera,
      speed: playbackSpeedValue,
      scenarioLabel: playbackScenarioLabel,
      pathId: toText(executionPlanPathId),
      onGatewayOverlayInteraction: (meta = {}) => {
        markPlaybackOverlayInteraction(meta);
      },
      onGatewayDecision: ({ gatewayId, flowId }) => {
        playbackGatewayDecisionRef.current?.(gatewayId, flowId);
      },
    });
    return index;
  }, [
    bpmnRef,
    clearPlaybackDecor,
    executionPlanPathId,
    markPlaybackOverlayInteraction,
    playbackAutoCamera,
    playbackScenarioLabel,
    playbackSpeedValue,
  ]);

  const ensurePlaybackFrameAt = useCallback((targetIndexRaw) => {
    const targetIndex = Math.max(0, Number(targetIndexRaw || 0));
    const currentFrames = asArray(playbackFramesRef.current);
    if (currentFrames.length > targetIndex) return true;
    const engine = playbackEngineRef.current;
    if (!engine) return false;
    const appended = [];
    let guard = 0;
    while ((currentFrames.length + appended.length) <= targetIndex && guard < 500) {
      guard += 1;
      const event = engine.nextEvent();
      if (!event) break;
      appended.push(event);
      if (toText(event?.type) === "wait_for_gateway_decision") break;
      if (toText(event?.type) === "stop") break;
    }
    if (!appended.length) return false;
    const nextFrames = appendPlaybackEvents(appended, { reason: "runtime_progress_append_events" });
    return nextFrames.length > targetIndex;
  }, [appendPlaybackEvents]);

  const resetPlaybackRuntime = useCallback((options = {}) => {
    const reason = toText(options?.reason || "reset_runtime");
    pushPlaybackTrace("runtime_reset_called", {
      reason,
      keepDecor: options?.keepDecor === true,
      stack: captureTraceStack(),
    });
    stopPlaybackTicker(reason);
    setPlaybackIsPlaying(false, `${reason}_pause`);
    const keepDecor = options?.keepDecor === true;
    if (!keepDecor) clearPlaybackDecor(reason);
    dispatchPlaybackPass({
      type: "runtime_reset",
      reason,
      restartReason: reason,
    });
    interactivePendingGatewayDecisionRef.current = null;
    manualPendingGatewayChoiceRef.current = null;
    playbackIndexRef.current = 0;
    syncPlaybackFrames([]);
    const engine = buildPlaybackEngineNow();
    if (!engine) return false;
    const firstEvent = engine.nextEvent();
    if (!firstEvent) {
      clearPlaybackDecor("reset_runtime_no_first_event");
      pushPlaybackTrace("runtime_reset_seed_empty", { reason });
      return true;
    }
    pushPlaybackTrace("runtime_reset_seed_first_event", {
      reason,
      firstEventType: toText(asObject(firstEvent).type),
      firstEventNodeId: toText(asObject(firstEvent).nodeId || asObject(firstEvent).gatewayId),
      firstEventFlowId: toText(asObject(firstEvent).flowId),
    });
    const nextFrames = appendPlaybackEvents([firstEvent], { reason: `${reason}_seed_start_event` });
    const firstIndex = Math.max(0, nextFrames.length - 1);
    setPlaybackIndex(firstIndex, `${reason}_set_first_index`);
    playbackIndexRef.current = firstIndex;
    applyPlaybackFrame(firstIndex, { autoCamera: false });
    return true;
  }, [
    appendPlaybackEvents,
    applyPlaybackFrame,
    buildPlaybackEngineNow,
    clearPlaybackDecor,
    dispatchPlaybackPass,
    stopPlaybackTicker,
    syncPlaybackFrames,
    setPlaybackIndex,
    setPlaybackIsPlaying,
  ]);
  useEffect(() => {
    resetPlaybackRuntimeRef.current = resetPlaybackRuntime;
  }, [resetPlaybackRuntime]);

  const handlePlaybackGatewayDecision = useCallback((gatewayIdRaw, flowIdRaw) => {
    const gatewayId = toText(gatewayIdRaw);
    const flowId = toText(flowIdRaw);
    const engine = playbackEngineRef.current;
    if (!engine || !gatewayId || !flowId) return;
    logPlaybackDebug("gateway_decision_click", { gatewayId, flowId });
    markPlaybackOverlayInteraction({
      stage: "decision_click",
      gatewayId,
      flowId,
    });
    const decision = asObject(engine.chooseGatewayFlow(gatewayId, flowId));
    if (!decision?.ok) {
      logPlaybackDebug("gateway_decision_rejected", {
        gatewayId,
        flowId,
        reason: toText(decision?.reason),
      });
      return;
    }
    pushPlaybackTrace("gateway_decision_applied_engine", {
      gatewayId,
      flowId,
      stack: captureTraceStack(),
    });
    manualPendingGatewayChoiceRef.current = null;
    const before = asArray(playbackFramesRef.current).length;
    interactivePendingGatewayDecisionRef.current = {
      token: `${Date.now()}:${gatewayId}:${flowId}:${before}`,
      gatewayId,
      chosenFlowId: flowId,
      mode: playbackEffectiveDecisionMode,
      previousPendingGatewayId: playbackAwaitingGatewayId,
      createdAtMs: Date.now(),
      frameCountBeforeDecision: before,
      frameIndexBeforeDecision: Number(playbackIndexRef.current || 0),
    };
    pushPlaybackTrace("interactive_pending_gateway_latch_set", {
      gatewayId,
      flowId,
      previousPendingGatewayId: playbackAwaitingGatewayId,
      mode: playbackEffectiveDecisionMode,
      frameCountBeforeDecision: before,
      frameIndexBeforeDecision: Number(playbackIndexRef.current || 0),
    });
    setPlaybackGatewayChoice(gatewayId, flowId, { source: "runtime_apply" });
    setPlaybackGatewayPending(null);
    const shouldResume = playbackResumeAfterDecisionRef.current === true;
    playbackResumeAfterDecisionRef.current = false;
    const hasNext = ensurePlaybackFrameAt(before + 1);
    if (!hasNext) {
      pushPlaybackTrace("gateway_decision_no_next_frame", {
        gatewayId,
        flowId,
        beforeFrames: before,
      });
      const snapshot = asObject(engine.getSnapshot?.());
      if (snapshot?.finished) setPlaybackIsPlaying(false);
      return;
    }
    const nextFrames = asArray(playbackFramesRef.current);
    const nextIndex = Math.max(0, Math.min(before, nextFrames.length - 1));
    setPlaybackIndex(nextIndex);
    playbackIndexRef.current = nextIndex;
    applyPlaybackFrame(nextIndex, { autoCamera: playbackAutoCamera });
    pushPlaybackTrace("gateway_decision_advanced_frame", {
      gatewayId,
      flowId,
      beforeFrames: before,
      nextIndex,
      nextFramesTotal: asArray(playbackFramesRef.current).length,
      shouldResume,
    });
    if (shouldResume) {
      setPlaybackIsPlaying(true);
    }
  }, [
    applyPlaybackFrame,
    ensurePlaybackFrameAt,
    markPlaybackOverlayInteraction,
    playbackAutoCamera,
    setPlaybackGatewayChoice,
  ]);

  useEffect(() => {
    playbackGatewayDecisionRef.current = handlePlaybackGatewayDecision;
  }, [handlePlaybackGatewayDecision]);

  const stepPlaybackForward = useCallback(() => {
    const currentIndex = Math.max(0, Number(playbackIndexRef.current || 0));
    const frames = asArray(playbackFramesRef.current);
    if (currentIndex < frames.length - 1) {
      const next = currentIndex + 1;
      setPlaybackIndex(next);
      playbackIndexRef.current = next;
      return true;
    }
    const hasNewFrame = ensurePlaybackFrameAt(frames.length);
    if (!hasNewFrame) return false;
    const next = Math.max(0, asArray(playbackFramesRef.current).length - 1);
    setPlaybackIndex(next);
    playbackIndexRef.current = next;
    return true;
  }, [ensurePlaybackFrameAt]);

  const handlePlaybackPrev = useCallback(() => {
    setPlaybackIsPlaying(false);
    setPlaybackIndex((prev) => {
      const next = Math.max(0, Number(prev || 0) - 1);
      playbackIndexRef.current = next;
      return next;
    });
  }, []);

  const handlePlaybackNext = useCallback(() => {
    setPlaybackIsPlaying(false);
    const advanced = stepPlaybackForward();
    if (!advanced) {
      const snapshot = asObject(playbackEngineRef.current?.getSnapshot?.());
      if (snapshot?.finished) setPlaybackIsPlaying(false);
    }
  }, [stepPlaybackForward]);

  const handlePlaybackReset = useCallback(() => {
    resetPlaybackRuntime({ keepDecor: false });
  }, [resetPlaybackRuntime]);

  const handlePlaybackTogglePlay = useCallback(() => {
    if (!playbackCanRun) return;
    const engineSnapshot = asObject(playbackEngineRef.current?.getSnapshot?.());
    if (engineSnapshot?.waitingDecision) {
      setPlaybackIsPlaying(false);
      return;
    }
    if (engineSnapshot?.finished && playbackIndexClamped >= Math.max(playbackTotal - 1, 0)) {
      resetPlaybackRuntime({ keepDecor: false });
      return;
    }
    setPlaybackIsPlaying((prev) => !prev);
  }, [playbackCanRun, playbackIndexClamped, playbackTotal, resetPlaybackRuntime]);

  const goToPlayback = useCallback((targetRaw) => {
    const frames = asArray(playbackFramesRef.current);
    let targetIndex = -1;
    if (typeof targetRaw === "number" && Number.isFinite(targetRaw)) {
      targetIndex = Math.max(0, Math.floor(targetRaw));
    } else {
      const target = toText(targetRaw);
      if (target) {
        targetIndex = frames.findIndex((eventRaw) => {
          const event = asObject(eventRaw);
          return toText(event?.id || event?.stepId || event?.nodeId || event?.flowId) === target;
        });
      }
    }
    if (targetIndex < 0) return false;
    setPlaybackIsPlaying(false);
    const ready = ensurePlaybackFrameAt(targetIndex);
    if (!ready) return false;
    const clamped = Math.max(0, Math.min(Number(asArray(playbackFramesRef.current).length || 1) - 1, targetIndex));
    playbackIndexRef.current = clamped;
    setPlaybackIndex(clamped);
    return true;
  }, [ensurePlaybackFrameAt]);

  const startPlayback = useCallback(() => {
    if (!playbackCanRun) return false;
    const engineSnapshot = asObject(playbackEngineRef.current?.getSnapshot?.());
    if (engineSnapshot?.waitingDecision) return false;
    if (engineSnapshot?.finished && playbackIndexClamped >= Math.max(playbackTotal - 1, 0)) {
      return resetPlaybackRuntime({ keepDecor: false });
    }
    setPlaybackIsPlaying(true);
    return true;
  }, [playbackCanRun, playbackIndexClamped, playbackTotal, resetPlaybackRuntime]);

  const stopPlayback = useCallback(() => {
    setPlaybackIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!sid) {
      dispatchPlaybackPass({
        type: "hydrate_manual_gateway_choices",
        choices: {},
        reason: "session_empty_clear_manual_choices",
      });
      return;
    }
    dispatchPlaybackPass({
      type: "hydrate_manual_gateway_choices",
      choices: readGatewayChoices(sid),
      reason: "session_hydrate_manual_choices",
    });
  }, [sid]);

  useEffect(() => {
    if (!sid) return;
    if (playbackEffectiveDecisionMode !== PLAYBACK_DECISION_MODE_MANUAL) return;
    writeGatewayChoices(sid, playbackGatewayChoices);
  }, [sid, playbackEffectiveDecisionMode, playbackGatewayChoices]);

  useEffect(() => {
    if (!playbackAwaitingGatewayId) return;
    const stagedChoice = asObject(manualPendingGatewayChoiceRef.current);
    if (!shouldAutoConsumeManualPendingGatewayChoice({
      pendingGatewayRaw: playbackGatewayPending,
      stagedChoiceRaw: stagedChoice,
      playbackDecisionMode: playbackEffectiveDecisionMode,
      playbackReadOnly: playbackGatewayReadOnly,
    })) {
      return;
    }
    const selectedFlowId = toText(stagedChoice.flowId);
    pushPlaybackTrace("pending_gateway_autoconsume_selected_flow", {
      pendingGatewayId: playbackAwaitingGatewayId,
      selectedFlowId,
      pendingVisitToken: playbackPendingGatewayVisitToken,
      mode: playbackEffectiveDecisionMode,
      readOnly: playbackGatewayReadOnly === true,
    });
    manualPendingGatewayChoiceRef.current = null;
    handlePlaybackGatewayDecision(playbackAwaitingGatewayId, selectedFlowId);
  }, [
    handlePlaybackGatewayDecision,
    playbackAwaitingGatewayId,
    playbackEffectiveDecisionMode,
    playbackGatewayReadOnly,
    playbackGatewayPending,
    playbackPendingGatewayVisitToken,
  ]);

  useEffect(() => {
    if (!shouldDebugPlayback()) return;
    const runtime = asObject(playbackRuntimeSnapshot);
    const source = asObject(runtime.sourceOfTruth);
    const progress = asObject(runtime.progress);
    const diagnostics = asObject(runtime.diagnostics);
    const routeDecisionByNodeId = normalizeGatewayChoiceMap(runtime.routeDecisionByNodeId);
    const snapshotProbe = {
      sid: toText(sid),
      runStatus: toText(runtime.runStatus),
      mode: toText(source.mode),
      choiceSource: toText(source.choiceSource),
      pendingGatewayId: toText(runtime.pendingGatewayId),
      progress: {
        index: Number(progress.index || 0),
        total: Number(progress.total || 0),
        label: toText(progress.label),
      },
      currentFrame: {
        type: toText(asObject(runtime.currentFrame).type),
        nodeId: toText(asObject(runtime.currentFrame).nodeId || asObject(runtime.currentFrame).gatewayId),
        flowId: toText(asObject(runtime.currentFrame).flowId),
      },
      routeDecisionByNodeId,
      completionReason: toText(runtime.completionReason),
      acceptanceReason: toText(runtime.acceptanceReason),
      resetReason: toText(runtime.resetReason),
      restartReason: toText(runtime.restartReason),
      transitionReason: toText(diagnostics.lastTransitionReason),
    };
    window.__FPC_PLAYBACK_RUNTIME_SNAPSHOT__ = snapshotProbe;
    const nextKey = JSON.stringify(snapshotProbe);
    if (nextKey !== playbackTraceSnapshotKeyRef.current) {
      pushPlaybackTrace("runtime_snapshot_diff", {
        previousKey: playbackTraceSnapshotKeyRef.current,
        snapshot: snapshotProbe,
      });
      playbackTraceSnapshotKeyRef.current = nextKey;
    }
    const nextPendingGateway = toText(snapshotProbe.pendingGatewayId);
    if (nextPendingGateway !== playbackTracePendingGatewayRef.current) {
      pushPlaybackTrace("pending_gateway_changed", {
        previous: playbackTracePendingGatewayRef.current,
        next: nextPendingGateway,
      });
      playbackTracePendingGatewayRef.current = nextPendingGateway;
    }
    const nextRouteDecisionKey = buildGatewayChoiceSemanticKey(routeDecisionByNodeId);
    if (nextRouteDecisionKey !== playbackTraceRouteDecisionRef.current) {
      pushPlaybackTrace("route_decisions_changed", {
        previousKey: playbackTraceRouteDecisionRef.current,
        nextKey: nextRouteDecisionKey,
        routeDecisionByNodeId,
      });
      playbackTraceRouteDecisionRef.current = nextRouteDecisionKey;
    }
  }, [playbackRuntimeSnapshot, sid]);

  useEffect(() => {
    playbackFramesRef.current = asArray(playbackFrames);
  }, [playbackFrames]);

  useEffect(() => {
    playbackIndexRef.current = Number(playbackIndex || 0);
  }, [playbackIndex]);

  useEffect(() => {
    const options = playbackScenarioOptions.map((item) => toText(item?.key)).filter(Boolean);
    if (!options.length) {
      if (playbackScenarioKey !== "active") setPlaybackScenarioKey("active");
      return;
    }
    if (options.includes(toText(playbackScenarioKey))) return;
    setPlaybackScenarioKey(options[0]);
  }, [playbackScenarioOptions, playbackScenarioKey]);

  useEffect(() => {
    if (!sid) return;
    setPlaybackAutoCamera(!!initialPlaybackAutoCamera);
    setPlaybackSpeed(toText(initialPlaybackSpeed) || "1");
    setPlaybackManualAtGateway(!!initialPlaybackManualAtGateway);
    setPlaybackScenarioKey(toText(initialPlaybackScenarioKey) || "active");
    dispatchPlaybackPass({
      type: "session_scope_reset",
      reason: "session_scope_changed",
    });
    dispatchPlaybackPass({
      type: "hydrate_manual_gateway_choices",
      choices: readGatewayChoices(sid),
      reason: "session_scope_changed_hydrate_manual",
    });
    dispatchPlaybackPass({
      type: "set_reset_tracker",
      reason: "session_scope_changed_reset_tracker",
      tracker: {
        semanticKey: "",
        routeDecisionByNodeId: {},
      },
    });
    playbackFramesRef.current = [];
    playbackEngineRef.current = null;
    interactivePendingGatewayDecisionRef.current = null;
    manualPendingGatewayChoiceRef.current = null;
    playbackIndexRef.current = 0;
    playbackResumeAfterDecisionRef.current = false;
    stopPlaybackTicker("session_changed");
  }, [
    initialPlaybackAutoCamera,
    initialPlaybackManualAtGateway,
    initialPlaybackScenarioKey,
    initialPlaybackSpeed,
    sid,
    stopPlaybackTicker,
  ]);

  useEffect(() => {
    if (playbackEffectiveDecisionMode === PLAYBACK_DECISION_MODE_MANUAL) return;
    interactivePendingGatewayDecisionRef.current = null;
    manualPendingGatewayChoiceRef.current = null;
  }, [playbackEffectiveDecisionMode]);

  useEffect(() => {
    const stagedChoice = asObject(manualPendingGatewayChoiceRef.current);
    if (!Object.keys(stagedChoice).length) return;
    if (toText(stagedChoice.pendingVisitToken) === playbackPendingGatewayVisitToken) return;
    pushPlaybackTrace("manual_pending_gateway_choice_stage_cleared", {
      reason: "pending_visit_changed",
      previousVisitToken: toText(stagedChoice.pendingVisitToken),
      nextVisitToken: playbackPendingGatewayVisitToken,
    });
    manualPendingGatewayChoiceRef.current = null;
  }, [playbackPendingGatewayVisitToken]);

  useEffect(() => {
    if (tab === "diagram") return;
    setPlaybackIsPlaying(false, "tab_changed_pause_playback");
    stopPlaybackTicker("tab_changed");
    clearPlaybackDecor("tab_changed");
    manualPendingGatewayChoiceRef.current = null;
    setPlaybackGatewayPending(null, "tab_changed_clear_pending_gateway");
  }, [clearPlaybackDecor, stopPlaybackTicker, tab]);

  useEffect(() => {
    if (!diagramActionPlaybackOpen) {
      setPlaybackIsPlaying(false, "playback_popover_closed_pause");
      stopPlaybackTicker("playback_popover_closed");
      clearPlaybackDecor("playback_popover_closed");
      manualPendingGatewayChoiceRef.current = null;
      setPlaybackGatewayPending(null, "playback_popover_closed_clear_pending_gateway");
      const resetTracker = asObject(playbackPassState.resetTracker);
      const resetTrackerIsEmpty = (
        !toText(resetTracker.semanticKey)
        && Object.keys(normalizeGatewayChoiceMap(resetTracker.routeDecisionByNodeId)).length <= 0
      );
      if (!resetTrackerIsEmpty) {
        dispatchPlaybackPass({
          type: "set_reset_tracker",
          reason: "playback_popover_closed_reset_tracker",
          tracker: {
            semanticKey: "",
            routeDecisionByNodeId: {},
          },
        });
      }
      return;
    }
    const resetTracker = asObject(playbackPassState.resetTracker);
    const decision = evaluatePlaybackResetTransition({
      prevSemanticKeyRaw: resetTracker.semanticKey,
      nextSemanticKeyRaw: playbackResetInputSemanticKey,
      prevRouteDecisionByNodeIdRaw: resetTracker.routeDecisionByNodeId,
      nextRouteDecisionByNodeIdRaw: playbackRouteDecisionByNodeId,
      pendingGatewayIdRaw: playbackAwaitingGatewayId,
      playbackDecisionMode: playbackEffectiveDecisionMode,
      playbackReadOnly: playbackGatewayReadOnly,
    });
    const prevRouteDecisionKey = buildGatewayChoiceSemanticKey(resetTracker.routeDecisionByNodeId);
    const nextRouteDecisionKey = buildGatewayChoiceSemanticKey(decision.nextResetTracker.routeDecisionByNodeId);
    if (
      toText(resetTracker.semanticKey) !== toText(decision.nextResetTracker.semanticKey)
      || prevRouteDecisionKey !== nextRouteDecisionKey
    ) {
      dispatchPlaybackPass({
        type: "set_reset_tracker",
        reason: `playback_reset_input_sync_${decision.reason}`,
        tracker: decision.nextResetTracker,
      });
    }
    const interactiveDecisionLatch = asObject(interactivePendingGatewayDecisionRef.current);
    const bypassInteractiveDecisionReset = shouldBypassPlaybackResetForInteractivePendingGatewayDecision({
      decisionShouldReset: decision.shouldReset === true,
      decisionReason: decision.reason,
      prevSemanticKeyRaw: resetTracker.semanticKey,
      nextSemanticKeyRaw: playbackResetInputSemanticKey,
      prevRouteDecisionByNodeIdRaw: resetTracker.routeDecisionByNodeId,
      nextRouteDecisionByNodeIdRaw: playbackRouteDecisionByNodeId,
      playbackDecisionMode: playbackEffectiveDecisionMode,
      playbackReadOnly: playbackGatewayReadOnly,
      latchRaw: interactiveDecisionLatch,
    });
    if (bypassInteractiveDecisionReset) {
      pushPlaybackTrace("runtime_reset_transition_bypassed_interactive_latch", {
        reason: decision.reason,
        pendingGatewayId: playbackAwaitingGatewayId,
        latch: interactiveDecisionLatch,
      });
      interactivePendingGatewayDecisionRef.current = null;
      return;
    }
    if (!decision.shouldReset) {
      if (decision.reason === "interactive_pending_gateway_choice") {
        interactivePendingGatewayDecisionRef.current = null;
      }
      pushPlaybackTrace("runtime_reset_transition_no_reset", {
        reason: decision.reason,
        mode: playbackEffectiveDecisionMode,
        pendingGatewayId: playbackAwaitingGatewayId,
      });
      return;
    }
    interactivePendingGatewayDecisionRef.current = null;
    pushPlaybackTrace("runtime_reset_transition_triggered", {
      reason: decision.reason,
      mode: playbackEffectiveDecisionMode,
      pendingGatewayId: playbackAwaitingGatewayId,
      stack: captureTraceStack(),
    });
    resetPlaybackRuntimeRef.current?.({
      keepDecor: false,
      reason: `playback_popover_opened_or_inputs_changed:${decision.reason}`,
    });
  }, [
    clearPlaybackDecor,
    diagramActionPlaybackOpen,
    dispatchPlaybackPass,
    playbackAwaitingGatewayId,
    playbackEffectiveDecisionMode,
    playbackGatewayReadOnly,
    playbackPassState.resetTracker,
    playbackRouteDecisionByNodeId,
    playbackResetInputSemanticKey,
    sid,
    stopPlaybackTicker,
  ]);

  useEffect(() => {
    if (!diagramActionPlaybackOpen || tab !== "diagram" || !playbackCanRun) return;
    applyPlaybackFrame(playbackIndexClamped, { autoCamera: playbackAutoCamera });
  }, [
    applyPlaybackFrame,
    diagramActionPlaybackOpen,
    playbackAutoCamera,
    playbackCanRun,
    playbackFrames,
    playbackIndexClamped,
    playbackScenarioLabel,
    tab,
  ]);

  useEffect(() => {
    if (!diagramActionPlaybackOpen || tab !== "diagram" || !playbackIsPlaying || !playbackCanRun) {
      stopPlaybackTicker("playback_not_running");
      return undefined;
    }
    stopPlaybackTicker("restart_ticker");
    const tick = (ts) => {
      if (!diagramActionPlaybackOpen || tab !== "diagram" || !playbackIsPlaying) {
        stopPlaybackTicker("tick_guard_stop");
        return;
      }
      const prevTs = Number(playbackLastTickRef.current || 0);
      if (!prevTs) {
        playbackLastTickRef.current = ts;
      } else if ((ts - prevTs) >= playbackIntervalMs) {
        playbackLastTickRef.current = ts;
        const advanced = stepPlaybackForward();
        if (!advanced) {
          const snapshot = asObject(playbackEngineRef.current?.getSnapshot?.());
          if (snapshot?.waitingDecision) {
            const waiting = asObject(playbackGatewayPending || asArray(playbackFramesRef.current).slice(-1)[0]);
            const gatewayId = toText(waiting?.gatewayId || waiting?.nodeId);
            const optionRows = asArray(waiting?.outgoingOptions);
            const selectedFlowId = toText(playbackGatewayChoicesResolved[gatewayId]);
            const selectedExists = optionRows.some((optionRaw) => toText(asObject(optionRaw)?.flowId) === selectedFlowId);
            const flowId = selectedExists
              ? selectedFlowId
              : toText(asObject(optionRows[0]).flowId);
            const canAutoPick = (
              playbackEffectiveDecisionMode === PLAYBACK_DECISION_MODE_MANUAL
              && !playbackManualAtGateway
            );
            if (canAutoPick && gatewayId && flowId) {
              playbackResumeAfterDecisionRef.current = true;
              handlePlaybackGatewayDecision(gatewayId, flowId);
              playbackRafRef.current = window.requestAnimationFrame(tick);
              return;
            }
            playbackResumeAfterDecisionRef.current = true;
          }
          setPlaybackIsPlaying(false);
        }
      }
      playbackRafRef.current = window.requestAnimationFrame(tick);
    };
    playbackRafRef.current = window.requestAnimationFrame(tick);
    return () => stopPlaybackTicker("ticker_effect_cleanup");
  }, [
    diagramActionPlaybackOpen,
    playbackCanRun,
    playbackFrames,
    playbackGatewayPending,
    playbackGatewayChoicesResolved,
    playbackEffectiveDecisionMode,
    playbackIntervalMs,
    playbackIsPlaying,
    playbackManualAtGateway,
    handlePlaybackGatewayDecision,
    stepPlaybackForward,
    stopPlaybackTicker,
    tab,
  ]);

  useEffect(() => () => {
    stopPlaybackTicker("component_unmount");
    if (playbackOverlayClickGuardRafRef.current) {
      window.cancelAnimationFrame(playbackOverlayClickGuardRafRef.current);
      playbackOverlayClickGuardRafRef.current = 0;
    }
  }, [stopPlaybackTicker]);

  return {
    isPlaying: playbackIsPlaying,
    playbackRuntimeSnapshot,
    currentStep: {
      index: playbackIndexClamped,
      id: toText(playbackCurrentEvent?.id || playbackCurrentEvent?.stepId || playbackCurrentEvent?.nodeId || playbackCurrentEvent?.flowId),
      event: playbackCurrentEvent,
    },
    controls: {
      start: startPlayback,
      stop: stopPlayback,
      next: handlePlaybackNext,
      prev: handlePlaybackPrev,
      goTo: goToPlayback,
    },
    setFollowMode: setPlaybackAutoCamera,
    highlightTargets,
    overlayInteractionGuard,
    playbackOverlayClickGuardRef,
    // Compatibility exports: product runtime truth must be read from playbackRuntimeSnapshot.
    // Keep these while ProcessStage wiring converges; do not use as independent truth owners.
    playbackIsPlaying,
    playbackFrames,
    playbackGateways,
    playbackGatewayChoices: playbackGatewayChoicesResolved,
    playbackGatewayChoiceSource,
    playbackGatewayReadOnly,
    playbackDecisionMode: playbackEffectiveDecisionMode,
    playbackGatewayPending,
    playbackAwaitingGatewayId,
    playbackGraphError,
    playbackIndex,
    playbackTotal,
    playbackCanRun,
    playbackIndexClamped,
    playbackCurrentEvent,
    playbackHighlightedBpmnIds,
    markPlaybackOverlayInteraction,
    setPlaybackGatewayChoice,
    handlePlaybackPrev,
    handlePlaybackNext,
    handlePlaybackReset,
    handlePlaybackTogglePlay,
    playbackAutoCamera,
    setPlaybackAutoCamera,
    playbackSpeed,
    setPlaybackSpeed,
    playbackSpeedValue,
    playbackManualAtGateway,
    setPlaybackManualAtGateway,
    playbackScenarioKey,
    setPlaybackScenarioKey,
    playbackScenarioOptions,
    playbackScenarioSpec,
    playbackScenarioLabel,
    playbackEventTitle,
    formatPlaybackGatewayTitle,
    playbackGatewayOptionLabel,
  };
}
