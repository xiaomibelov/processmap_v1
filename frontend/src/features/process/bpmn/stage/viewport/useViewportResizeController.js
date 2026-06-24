import { useEffect, useRef } from "react";
import * as viewportRecovery from "./viewportRecovery";

function readContentRect(entry) {
  const rect = entry?.contentRect;
  return {
    width: Number(rect?.width || 0),
    height: Number(rect?.height || 0),
  };
}

function readBoundingRect(element) {
  const box = element?.getBoundingClientRect?.() || {};
  return {
    left: Number(box.left || 0),
    top: Number(box.top || 0),
    width: Number(box.width || 0),
    height: Number(box.height || 0),
  };
}

/**
 * Single ResizeObserver for the BPMN stage viewport.
 *
 * - Observes the canvas containers (viewer / editor) and debounces
 *   `canvas.resized()` calls for the active instance.
 * - Optionally observes a host element and reports its bounding rect
 *   (used by ProcessStage for overlay/template positioning).
 */
export function useViewportResizeController({
  viewerContainerRef,
  editorContainerRef,
  getActiveInstance,
  view,
  hostRef,
  onHostRect,
  resizeDebounceMs = 100,
}) {
  const rectsRef = useRef({ viewer: null, editor: null });
  const timerRef = useRef(null);
  const getActiveInstanceRef = useRef(getActiveInstance);
  const onHostRectRef = useRef(onHostRect);

  useEffect(() => {
    getActiveInstanceRef.current = getActiveInstance;
    onHostRectRef.current = onHostRect;
  });

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;

    function scheduleCanvasResize() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const activeInst = typeof getActiveInstanceRef.current === "function"
          ? getActiveInstanceRef.current()
          : null;
        const canvas = activeInst?.get?.("canvas");
        if (!canvas) return;
        const rect = view === "viewer" ? rectsRef.current.viewer : rectsRef.current.editor;
        if (rect && rect.width > 0 && rect.height > 0) {
          viewportRecovery.safeCanvasResized(canvas, { width: rect.width, height: rect.height, thresholdPx: 2 });
        }
      }, resizeDebounceMs);
    }

    const observer = new ResizeObserver((entries) => {
      let canvasChanged = false;
      for (const entry of entries) {
        const target = entry.target;
        if (viewerContainerRef?.current && target === viewerContainerRef.current) {
          rectsRef.current.viewer = readContentRect(entry);
          canvasChanged = true;
        } else if (editorContainerRef?.current && target === editorContainerRef.current) {
          rectsRef.current.editor = readContentRect(entry);
          canvasChanged = true;
        } else if (typeof onHostRectRef.current === "function" && hostRef?.current && target === hostRef.current) {
          onHostRectRef.current(readBoundingRect(hostRef.current));
        }
      }
      if (canvasChanged && typeof getActiveInstanceRef.current === "function") {
        scheduleCanvasResize();
      }
    });

    if (viewerContainerRef?.current) observer.observe(viewerContainerRef.current);
    if (editorContainerRef?.current) observer.observe(editorContainerRef.current);
    if (typeof onHostRectRef.current === "function" && hostRef?.current) {
      onHostRectRef.current(readBoundingRect(hostRef.current));
      observer.observe(hostRef.current);
    }

    return () => {
      observer.disconnect();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [viewerContainerRef, editorContainerRef, hostRef, view, resizeDebounceMs]);
}
