import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildRouteDecisionByNodeId,
  createPlaybackEngine,
  normalizePlaybackScenarioSpec,
} from "../../playback/playbackEngine";
import { asArray, asObject } from "../../lib/processStageDomain";
import { extractGateways } from "../../playback/utils/extractGateways";

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

function logPlaybackDebug(stage, payload = {}) {
  if (!shouldDebugPlayback()) return;
  // eslint-disable-next-line no-console
  console.debug(`[PLAYBACK_DEBUG] ${String(stage || "-")}`, payload);
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

  const [playbackAutoCamera, setPlaybackAutoCamera] = useState(!!initialPlaybackAutoCamera);
  const [playbackSpeed, setPlaybackSpeed] = useState(toText(initialPlaybackSpeed) || "1");
  const [playbackManualAtGateway, setPlaybackManualAtGateway] = useState(!!initialPlaybackManualAtGateway);
  const [playbackScenarioKey, setPlaybackScenarioKey] = useState(toText(initialPlaybackScenarioKey) || "active");
  const [playbackIsPlaying, setPlaybackIsPlaying] = useState(false);
  const [playbackFrames, setPlaybackFrames] = useState([]);
  const [playbackGatewayPending, setPlaybackGatewayPending] = useState(null);
  const [playbackGateways, setPlaybackGateways] = useState([]);
  const [playbackGatewayChoices, setPlaybackGatewayChoices] = useState(() => readGatewayChoices(sid));
  const [playbackGraphError, setPlaybackGraphError] = useState("");
  const [playbackIndex, setPlaybackIndex] = useState(0);

  const playbackSpeedValue = Number(playbackSpeed || 1);
  const playbackRouteDecisionByNodeId = useMemo(
    () => buildRouteDecisionByNodeId(asArray(executionPlanSteps)),
    [executionPlanSteps],
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

  const playbackTotal = Number(asArray(playbackFrames).length || 0);
  const playbackCanRun = playbackTotal > 0 || !!playbackEngineRef.current;
  const playbackIndexClamped = playbackTotal <= 0
    ? 0
    : Math.max(0, Math.min(playbackTotal - 1, Number(playbackIndex || 0)));
  const playbackCurrentEvent = asArray(playbackFrames)[playbackIndexClamped] || null;
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

  const setPlaybackGatewayChoice = useCallback((gatewayIdRaw, flowIdRaw) => {
    const gatewayId = toText(gatewayIdRaw);
    const flowId = toText(flowIdRaw);
    if (!gatewayId) return;
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
  }, []);

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
    setPlaybackFrames(nextFrames);
  }, []);

  const appendPlaybackEvents = useCallback((eventsRaw) => {
    const events = asArray(eventsRaw).filter(Boolean);
    if (!events.length) return playbackFramesRef.current;
    const next = [...asArray(playbackFramesRef.current), ...events];
    syncPlaybackFrames(next);
    bpmnRef.current?.preparePlayback?.(next);
    const lastEvent = asObject(events[events.length - 1]);
    if (toText(lastEvent?.type) === "wait_for_gateway_decision") {
      logPlaybackDebug("wait_for_gateway_decision", {
        gatewayId: toText(lastEvent?.gatewayId),
        outgoingFlowIds: asArray(lastEvent?.outgoingOptions)
          .map((optionRaw) => toText(asObject(optionRaw)?.flowId))
          .filter(Boolean),
      });
      setPlaybackGatewayPending(lastEvent);
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
  }, [bpmnRef, syncPlaybackFrames]);

  const buildPlaybackEngineNow = useCallback(() => {
    const graphRes = asObject(bpmnRef.current?.getPlaybackGraph?.());
    if (!graphRes?.ok) {
      const msg = toText(graphRes?.reason || "playback_graph_unavailable");
      setPlaybackGraphError(msg || "Не удалось построить playback graph.");
      setPlaybackGateways([]);
      playbackEngineRef.current = null;
      return null;
    }
    const gateways = extractGateways(graphRes);
    setPlaybackGateways(gateways);
    setPlaybackGatewayChoices((prevRaw) => {
      const prev = asObject(prevRaw);
      const next = {};
      gateways.forEach((gatewayRaw) => {
        const gateway = asObject(gatewayRaw);
        const gatewayId = toText(gateway?.gateway_id);
        const selectedFlowId = toText(prev[gatewayId]);
        if (!gatewayId || !selectedFlowId) return;
        const hasMatch = asArray(gateway?.outgoing).some((optionRaw) => {
          const option = asObject(optionRaw);
          return toText(option?.flow_id) === selectedFlowId;
        });
        if (hasMatch) next[gatewayId] = selectedFlowId;
      });
      return next;
    });
    const scenario = playbackScenarioSpec;
    const routeDecisionByNodeId = toText(playbackScenarioKey) === "active"
      ? playbackRouteDecisionByNodeId
      : {};
    const engine = createPlaybackEngine({
      graph: graphRes,
      scenario,
      flowMetaById: flowTierMetaMap,
      nodePathMetaById: nodePathMetaMap,
      routeDecisionByNodeId,
      manualAtGateway: playbackManualAtGateway,
      loopLimit: 3,
      maxEvents: 2000,
    });
    setPlaybackGraphError("");
    playbackEngineRef.current = engine;
    return engine;
  }, [
    bpmnRef,
    flowTierMetaMap,
    nodePathMetaMap,
    playbackManualAtGateway,
    playbackRouteDecisionByNodeId,
    playbackScenarioKey,
    playbackScenarioSpec,
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
    const nextFrames = appendPlaybackEvents(appended);
    return nextFrames.length > targetIndex;
  }, [appendPlaybackEvents]);

  const resetPlaybackRuntime = useCallback((options = {}) => {
    stopPlaybackTicker(toText(options?.reason || "reset_runtime"));
    setPlaybackIsPlaying(false);
    const keepDecor = options?.keepDecor === true;
    if (!keepDecor) clearPlaybackDecor(toText(options?.reason || "reset_runtime"));
    setPlaybackGatewayPending(null);
    setPlaybackIndex(0);
    playbackIndexRef.current = 0;
    syncPlaybackFrames([]);
    const engine = buildPlaybackEngineNow();
    if (!engine) return false;
    const firstEvent = engine.nextEvent();
    if (!firstEvent) {
      clearPlaybackDecor("reset_runtime_no_first_event");
      return true;
    }
    const nextFrames = appendPlaybackEvents([firstEvent]);
    const firstIndex = Math.max(0, nextFrames.length - 1);
    setPlaybackIndex(firstIndex);
    playbackIndexRef.current = firstIndex;
    applyPlaybackFrame(firstIndex, { autoCamera: false });
    return true;
  }, [
    appendPlaybackEvents,
    applyPlaybackFrame,
    buildPlaybackEngineNow,
    clearPlaybackDecor,
    stopPlaybackTicker,
    syncPlaybackFrames,
  ]);

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
    setPlaybackGatewayChoice(gatewayId, flowId);
    setPlaybackGatewayPending(null);
    const shouldResume = playbackResumeAfterDecisionRef.current === true;
    playbackResumeAfterDecisionRef.current = false;
    const before = asArray(playbackFramesRef.current).length;
    const hasNext = ensurePlaybackFrameAt(before + 1);
    if (!hasNext) {
      const snapshot = asObject(engine.getSnapshot?.());
      if (snapshot?.finished) setPlaybackIsPlaying(false);
      return;
    }
    const nextFrames = asArray(playbackFramesRef.current);
    const nextIndex = Math.max(0, Math.min(before, nextFrames.length - 1));
    setPlaybackIndex(nextIndex);
    playbackIndexRef.current = nextIndex;
    applyPlaybackFrame(nextIndex, { autoCamera: playbackAutoCamera });
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
      setPlaybackGatewayChoices({});
      return;
    }
    setPlaybackGatewayChoices(readGatewayChoices(sid));
  }, [sid]);

  useEffect(() => {
    if (!sid) return;
    writeGatewayChoices(sid, playbackGatewayChoices);
  }, [sid, playbackGatewayChoices]);

  useEffect(() => {
    if (!playbackAwaitingGatewayId) return;
    const selectedFlowId = toText(playbackGatewayChoices[playbackAwaitingGatewayId]);
    if (!selectedFlowId) return;
    const options = asArray(playbackGatewayPending?.outgoingOptions);
    const canApply = options.some((optionRaw) => toText(asObject(optionRaw)?.flowId) === selectedFlowId);
    if (!canApply) return;
    handlePlaybackGatewayDecision(playbackAwaitingGatewayId, selectedFlowId);
  }, [
    handlePlaybackGatewayDecision,
    playbackAwaitingGatewayId,
    playbackGatewayChoices,
    playbackGatewayPending,
  ]);

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
    setPlaybackIsPlaying(false);
    setPlaybackFrames([]);
    setPlaybackGatewayPending(null);
    setPlaybackGateways([]);
    setPlaybackGraphError("");
    setPlaybackIndex(0);
    playbackFramesRef.current = [];
    playbackEngineRef.current = null;
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
    if (tab === "diagram") return;
    setPlaybackIsPlaying(false);
    stopPlaybackTicker("tab_changed");
    clearPlaybackDecor("tab_changed");
    setPlaybackGatewayPending(null);
  }, [clearPlaybackDecor, stopPlaybackTicker, tab]);

  useEffect(() => {
    if (!diagramActionPlaybackOpen) {
      setPlaybackIsPlaying(false);
      stopPlaybackTicker("playback_popover_closed");
      clearPlaybackDecor("playback_popover_closed");
      setPlaybackGatewayPending(null);
      return;
    }
    resetPlaybackRuntime({ keepDecor: false, reason: "playback_popover_opened_or_inputs_changed" });
  }, [
    clearPlaybackDecor,
    diagramActionPlaybackOpen,
    draftBpmnXml,
    flowTierMetaMap,
    nodePathMetaMap,
    playbackManualAtGateway,
    playbackRouteDecisionByNodeId,
    playbackScenarioKey,
    resetPlaybackRuntime,
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
            const selectedFlowId = toText(playbackGatewayChoices[gatewayId]);
            const selectedExists = optionRows.some((optionRaw) => toText(asObject(optionRaw)?.flowId) === selectedFlowId);
            const flowId = selectedExists
              ? selectedFlowId
              : toText(asObject(optionRows[0]).flowId);
            if (!playbackManualAtGateway && gatewayId && flowId) {
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
    playbackGatewayChoices,
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
    playbackEngineRef,
    playbackFramesRef,
    playbackIndexRef,
    playbackOverlayClickGuardRef,
    playbackIsPlaying,
    setPlaybackIsPlaying,
    playbackFrames,
    playbackGateways,
    playbackGatewayChoices,
    playbackGatewayPending,
    playbackAwaitingGatewayId,
    playbackGraphError,
    playbackIndex,
    setPlaybackIndex,
    playbackTotal,
    playbackCanRun,
    playbackIndexClamped,
    playbackCurrentEvent,
    playbackHighlightedBpmnIds,
    markPlaybackOverlayInteraction,
    setPlaybackGatewayChoice,
    handlePlaybackGatewayDecision,
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
