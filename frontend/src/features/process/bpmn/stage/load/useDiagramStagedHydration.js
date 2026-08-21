import { useCallback, useRef, useState } from "react";

/**
 * Staged hydration state machine for Diagram load.
 *
 * Stages:
 *   'loading'      — initial state, skeleton visible
 *   'canvas_ready' — bpmn-js canvas is attached and usable
 *   'decor_loading'— deferred decor fanout is in progress
 *   'fully_ready'  — all decor and overlays applied
 */
export default function useDiagramStagedHydration() {
  const [hydrationStage, setHydrationStage] = useState("loading");
  const stageRef = useRef("loading");

  const setStage = useCallback((next) => {
    setHydrationStage((prev) => {
      if (prev === next) return prev;
      stageRef.current = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    stageRef.current = "loading";
    setHydrationStage("loading");
  }, []);

  const markCanvasReady = useCallback(() => {
    setStage("canvas_ready");
  }, [setStage]);

  const markDecorLoading = useCallback(() => {
    setStage("decor_loading");
  }, [setStage]);

  const markFullyReady = useCallback(() => {
    setStage("fully_ready");
  }, [setStage]);

  return {
    hydrationStage,
    hydrationStageRef: stageRef,
    reset,
    markCanvasReady,
    markDecorLoading,
    markFullyReady,
  };
}
