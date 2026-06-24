import { useCallback, useEffect, useRef, useState } from "react";
import { diagramLoadStateMachineReducer } from "./diagramLoadStateMachine.js";

/**
 * React hook wrapper around diagramLoadStateMachineReducer.
 *
 * Timeout is disabled when timeoutMs <= 0. BpmnStage passes 0 for both
 * warm and cold timeouts because load timing is governed by the runtime
 * lifecycle, not this hook.
 */
export default function useDiagramLoadStateMachine(options = {}) {
  const warmTimeoutMs = Number(options.warmTimeoutMs ?? 10000);
  const coldTimeoutMs = Number(options.coldTimeoutMs ?? 20000);

  const [loadState, setLoadState] = useState("idle");
  const [errorReason, setErrorReason] = useState("");
  const [lastTransitionAt, setLastTransitionAt] = useState("");
  const stateRef = useRef("idle");
  const timeoutRef = useRef(null);
  const transitionCountRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const transition = useCallback(
    (action, payload = {}) => {
      const result = diagramLoadStateMachineReducer(stateRef.current, action, payload);
      if (result === stateRef.current) return;

      const next = typeof result === "string" ? result : result.state;
      const reason = typeof result === "string" ? "" : result.reason;

      stateRef.current = next;
      transitionCountRef.current += 1;
      const now = new Date().toISOString();
      setLoadState(next);
      setLastTransitionAt(now);
      if (reason) setErrorReason(reason);

      if (next === "initializing" || next === "importing") {
        clearTimer();
        const timeoutMs = transitionCountRef.current <= 1 ? coldTimeoutMs : warmTimeoutMs;
        if (timeoutMs > 0) {
          timeoutRef.current = setTimeout(() => {
            if (stateRef.current === "initializing" || stateRef.current === "importing") {
              transition("timeout", { reason: `exceeded_${timeoutMs}ms` });
            }
          }, timeoutMs);
        }
      } else if (next === "ready" || next === "error" || next === "timeout" || next === "idle") {
        clearTimer();
      }
    },
    [warmTimeoutMs, coldTimeoutMs, clearTimer],
  );

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const isReady = loadState === "ready" || loadState === "canvas-ready";
  const isCanvasVisible = isReady || loadState === "error" || loadState === "timeout";
  const isSkeletonVisible = loadState === "initializing" || loadState === "importing";
  const isError = loadState === "error" || loadState === "timeout";

  return {
    loadState,
    loadStateRef: stateRef,
    isReady,
    isCanvasVisible,
    isSkeletonVisible,
    isError,
    errorReason,
    lastTransitionAt,
    transition,
    transitionCount: transitionCountRef.current,
  };
}
