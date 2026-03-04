import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlaybackEngine } from "../../playback/playbackEngine";
import { asArray, asObject } from "../../lib/processStageDomain";

function toText(value) {
  return String(value || "").trim();
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

export default function usePlaybackController({
  sid,
  tab,
  draftBpmnXml,
  diagramActionPlaybackOpen,
  bpmnRef,
  playbackScenarioSpec,
  playbackScenarioKey,
  playbackRouteDecisionByNodeId,
  flowTierMetaMap,
  nodePathMetaMap,
  playbackManualAtGateway,
  playbackAutoCamera,
  playbackSpeedValue,
  playbackScenarioLabel,
  executionPlanPathId,
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

  const [playbackIsPlaying, setPlaybackIsPlaying] = useState(false);
  const [playbackFrames, setPlaybackFrames] = useState([]);
  const [playbackGatewayPending, setPlaybackGatewayPending] = useState(null);
  const [playbackGraphError, setPlaybackGraphError] = useState("");
  const [playbackIndex, setPlaybackIndex] = useState(0);

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
      playbackEngineRef.current = null;
      return null;
    }
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
  }, [applyPlaybackFrame, ensurePlaybackFrameAt, markPlaybackOverlayInteraction, playbackAutoCamera]);

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

  useEffect(() => {
    playbackFramesRef.current = asArray(playbackFrames);
  }, [playbackFrames]);

  useEffect(() => {
    playbackIndexRef.current = Number(playbackIndex || 0);
  }, [playbackIndex]);

  useEffect(() => {
    if (!sid) return;
    setPlaybackIsPlaying(false);
    setPlaybackFrames([]);
    setPlaybackGatewayPending(null);
    setPlaybackGraphError("");
    setPlaybackIndex(0);
    playbackFramesRef.current = [];
    playbackEngineRef.current = null;
    playbackIndexRef.current = 0;
    playbackResumeAfterDecisionRef.current = false;
    stopPlaybackTicker("session_changed");
  }, [sid, stopPlaybackTicker]);

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
    playbackIntervalMs,
    playbackIsPlaying,
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
    playbackEngineRef,
    playbackFramesRef,
    playbackIndexRef,
    playbackOverlayClickGuardRef,
    playbackIsPlaying,
    setPlaybackIsPlaying,
    playbackFrames,
    playbackGatewayPending,
    playbackGraphError,
    playbackIndex,
    setPlaybackIndex,
    playbackTotal,
    playbackCanRun,
    playbackIndexClamped,
    playbackCurrentEvent,
    markPlaybackOverlayInteraction,
    handlePlaybackGatewayDecision,
    handlePlaybackPrev,
    handlePlaybackNext,
    handlePlaybackReset,
    handlePlaybackTogglePlay,
  };
}
