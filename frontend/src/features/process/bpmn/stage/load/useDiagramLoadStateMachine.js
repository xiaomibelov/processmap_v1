import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Explicit state machine for Diagram loading lifecycle.
 *
 * States:
 *   idle               — no load in progress
 *   initializing       — viewer/modeler creation started
 *   importing          — importXML in flight
 *   canvas-ready       — canvas rendered, decor may still hydrate
 *   ready              — fully ready for interaction
 *   error              — import or init failed
 *   timeout            — exceeded warm/cold timeout
 *
 * Outputs:
 *   loadState          — current state string
 *   isReady            — true for canvas-ready | ready
 *   isCanvasVisible    — true for canvas-ready | ready | error | timeout
 *   isSkeletonVisible  — true for initializing | importing (within timeout)
 *   isError            — true for error | timeout
 *   errorReason        — last error reason
 *   lastTransitionAt   — ISO timestamp of last transition
 *   transition(action, payload)
 *
 * Timeout:
 *   10s warm (tab switch), 20s cold (fresh open)
 *   Configurable via options.timeoutMs
 */
export default function useDiagramLoadStateMachine(options = {}) {
  const warmTimeoutMs = Number(options.warmTimeoutMs || 10000);
  const coldTimeoutMs = Number(options.coldTimeoutMs || 20000);

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
      const prev = stateRef.current;
      let next = prev;
      let reason = payload?.reason || "";

      switch (action) {
        case "reset":
          next = "initializing";
          break;
        case "init_done":
          if (prev === "initializing" || prev === "idle") {
            next = "importing";
          }
          break;
        case "import_start":
          if (prev === "initializing" || prev === "idle" || prev === "canvas-ready") {
            next = "importing";
          }
          break;
        case "import_success":
          if (prev === "importing" || prev === "initializing" || prev === "idle") {
            next = "ready";
          }
          break;
        case "import_error":
          next = "error";
          reason = payload?.reason || "import_failed";
          break;
        case "timeout":
          if (prev === "initializing" || prev === "importing") {
            next = "timeout";
            reason = payload?.reason || "load_timeout";
          }
          break;
        case "canvas_ready":
          if (prev === "importing" || prev === "initializing") {
            next = "canvas-ready";
          }
          break;
        case "fully_ready":
          if (prev === "canvas-ready" || prev === "importing" || prev === "initializing") {
            next = "ready";
          }
          break;
        case "destroy":
          next = "idle";
          break;
        default:
          break;
      }

      if (next === prev) return;

      stateRef.current = next;
      transitionCountRef.current += 1;
      const now = new Date().toISOString();
      setLoadState(next);
      setLastTransitionAt(now);
      if (reason) setErrorReason(reason);

      // Manage timeout timer
      if (next === "initializing" || next === "importing") {
        clearTimer();
        const timeoutMs = transitionCountRef.current <= 1 ? coldTimeoutMs : warmTimeoutMs;
        timeoutRef.current = setTimeout(() => {
          if (stateRef.current === "initializing" || stateRef.current === "importing") {
            transition("timeout", { reason: `exceeded_${timeoutMs}ms` });
          }
        }, timeoutMs);
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
