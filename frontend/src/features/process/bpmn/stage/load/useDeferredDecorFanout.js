import { useEffect, useRef } from "react";
import useBpmnSettledDecorFanout from "../orchestration/useBpmnSettledDecorFanout";

function scheduleIdle(callback, timeout = 2000) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout });
  }
  const id = setTimeout(callback, 0);
  return { id, cancel: () => clearTimeout(id) };
}

function cancelIdle(handle) {
  if (handle && typeof handle.cancel === "function") {
    handle.cancel();
    return;
  }
  if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
    return;
  }
  if (typeof handle === "number") {
    clearTimeout(handle);
  }
}

/**
 * Wraps useBpmnSettledDecorFanout so that non-critical fanouts
 * (notes, stepTime, robotMeta, properties) are deferred via
 * requestIdleCallback with a setTimeout fallback.
 *
 * Selection fanout runs immediately (required for interaction).
 */
export default function useDeferredDecorFanout(props) {
  const {
    onCanvasReady,
    onDecorLoading,
    onFullyReady,
    deferNonSelection = true,
    ...fanoutProps
  } = props;

  const stageRef = useRef("loading");
  const idleHandlesRef = useRef([]);

  // Build a wrapper that intercepts the non-selection fanout callbacks
  // and defers them through requestIdleCallback.
  const wrapperRef = useRef({});

  // Immediate fanout props — selection stays immediate, everything else
  // is gated through a deferred queue.
  const immediateProps = {
    ...fanoutProps,
    // These callbacks are invoked by useBpmnSettledDecorFanout effects.
    // We override the non-critical ones to schedule via idle callback.
    applyUserNotesDecor: (...args) => {
      if (!deferNonSelection) {
        fanoutProps.applyUserNotesDecor?.(...args);
        return;
      }
      const handle = scheduleIdle(() => {
        fanoutProps.applyUserNotesDecor?.(...args);
      });
      idleHandlesRef.current.push(handle);
    },
    clearUserNotesDecor: (...args) => {
      if (!deferNonSelection) {
        fanoutProps.clearUserNotesDecor?.(...args);
        return;
      }
      const handle = scheduleIdle(() => {
        fanoutProps.clearUserNotesDecor?.(...args);
      });
      idleHandlesRef.current.push(handle);
    },
    applyStepTimeDecor: (...args) => {
      if (!deferNonSelection) {
        fanoutProps.applyStepTimeDecor?.(...args);
        return;
      }
      const handle = scheduleIdle(() => {
        fanoutProps.applyStepTimeDecor?.(...args);
      });
      idleHandlesRef.current.push(handle);
    },
    applyRobotMetaDecor: (...args) => {
      if (!deferNonSelection) {
        fanoutProps.applyRobotMetaDecor?.(...args);
        return;
      }
      const handle = scheduleIdle(() => {
        fanoutProps.applyRobotMetaDecor?.(...args);
      });
      idleHandlesRef.current.push(handle);
    },
    applyPropertiesOverlayDecor: (...args) => {
      if (!deferNonSelection) {
        fanoutProps.applyPropertiesOverlayDecor?.(...args);
        return;
      }
      const handle = scheduleIdle(() => {
        fanoutProps.applyPropertiesOverlayDecor?.(...args);
      });
      idleHandlesRef.current.push(handle);
    },
    clearPropertiesOverlayDecor: (...args) => {
      if (!deferNonSelection) {
        fanoutProps.clearPropertiesOverlayDecor?.(...args);
        return;
      }
      const handle = scheduleIdle(() => {
        fanoutProps.clearPropertiesOverlayDecor?.(...args);
      });
      idleHandlesRef.current.push(handle);
    },
  };

  useBpmnSettledDecorFanout(immediateProps);

  // Track canvas ready and notify parent when all deferred work is done.
  // Because the deferred callbacks are scheduled via requestIdleCallback,
  // we cannot know exactly when they finish. We use a heuristic:
  // after the ready signal changes and a short timeout, mark fully ready.
  const { viewerInstanceKey, modelerInstanceKey } = fanoutProps;

  useEffect(() => {
    const hasInstance = !!(viewerInstanceKey || modelerInstanceKey);
    if (!hasInstance) {
      stageRef.current = "loading";
      // Cancel any pending idle callbacks
      idleHandlesRef.current.forEach(cancelIdle);
      idleHandlesRef.current = [];
      return;
    }

    if (stageRef.current === "loading") {
      stageRef.current = "canvas_ready";
      onCanvasReady?.();
      onDecorLoading?.();

      // Heuristic: most deferred work completes within ~500ms of idle time.
      // We fire onFullyReady after a timeout that gives the browser a chance
      // to process idle callbacks first.
      const handle = scheduleIdle(() => {
        stageRef.current = "fully_ready";
        onFullyReady?.();
      }, 500);
      idleHandlesRef.current.push(handle);
    }

    return () => {
      idleHandlesRef.current.forEach(cancelIdle);
      idleHandlesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerInstanceKey, modelerInstanceKey]);

  return { stage: stageRef.current };
}
