import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampNumber,
  clientXToTrackFraction,
  projectRangeToThumb,
  resolveMinThumbFraction,
  resolveViewportRangeX,
  thumbLeftFractionToViewboxX,
  trackFractionToViewboxX,
} from "./viewportScrubberMath.js";

const DEFAULT_MIN_THUMB_WIDTH_PX = 28;
const EMPTY_RANGE = Object.freeze({
  contentMinX: 0,
  contentWidth: 0,
  viewboxWidth: 0,
  viewboxX: 0,
  travelWidth: 0,
  maxViewboxX: 0,
  canScroll: false,
});
const EMPTY_VIEW_STATE = Object.freeze({
  range: EMPTY_RANGE,
  canScroll: false,
  thumbLeftFraction: 0,
  thumbWidthFraction: 1,
  thumbLeftPercent: 0,
  thumbWidthPercent: 100,
});

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toFiniteNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeSnapshot(snapshotRaw = {}) {
  const snapshot = asObject(snapshotRaw);
  const viewbox = asObject(snapshot.viewbox);
  const inner = asObject(viewbox.inner);
  return {
    viewbox: {
      x: toFiniteNumber(viewbox.x, 0),
      y: toFiniteNumber(viewbox.y, 0),
      width: Math.max(0, toFiniteNumber(viewbox.width, 0)),
      height: Math.max(0, toFiniteNumber(viewbox.height, 0)),
      inner: {
        x: toFiniteNumber(inner.x, toFiniteNumber(viewbox.x, 0)),
        y: toFiniteNumber(inner.y, toFiniteNumber(viewbox.y, 0)),
        width: Math.max(0, toFiniteNumber(inner.width, toFiniteNumber(viewbox.width, 0))),
        height: Math.max(0, toFiniteNumber(inner.height, toFiniteNumber(viewbox.height, 0))),
      },
    },
  };
}

export function buildViewportScrubberViewState(snapshotRaw = {}, options = {}) {
  const snapshot = normalizeSnapshot(snapshotRaw);
  const range = resolveViewportRangeX(snapshot);
  const minThumbFraction = resolveMinThumbFraction(
    options.trackWidth,
    options.minThumbWidthPx,
  );
  const thumbProjection = projectRangeToThumb(range, { minThumbFraction });

  return {
    range,
    canScroll: thumbProjection.canScroll,
    thumbLeftFraction: thumbProjection.thumbLeftFraction,
    thumbWidthFraction: thumbProjection.thumbWidthFraction,
    thumbLeftPercent: thumbProjection.thumbLeftFraction * 100,
    thumbWidthPercent: thumbProjection.thumbWidthFraction * 100,
  };
}

function readTrackRect(trackEl) {
  if (!(trackEl instanceof Element)) return { left: 0, width: 0 };
  const rect = trackEl.getBoundingClientRect?.();
  return {
    left: toFiniteNumber(rect?.left, 0),
    width: Math.max(0, toFiniteNumber(rect?.width, 0)),
  };
}

export default function useViewportScrubberModel({
  active = true,
  canvasApi,
  minThumbWidthPx = DEFAULT_MIN_THUMB_WIDTH_PX,
} = {}) {
  const [viewState, setViewState] = useState(EMPTY_VIEW_STATE);

  const viewStateRef = useRef(viewState);
  const rangeRef = useRef(EMPTY_RANGE);
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const dragRef = useRef(null);
  const pendingViewboxXRef = useRef(null);
  const frameIdRef = useRef(0);

  const commitViewState = useCallback((next) => {
    viewStateRef.current = next;
    rangeRef.current = next.range || EMPTY_RANGE;
    setViewState(next);
  }, []);

  const flushScheduledViewboxX = useCallback(() => {
    frameIdRef.current = 0;
    const nextX = pendingViewboxXRef.current;
    pendingViewboxXRef.current = null;
    if (!Number.isFinite(Number(nextX))) return;
    canvasApi?.setViewboxX?.(Number(nextX), { source: "viewport_scrubber" });
  }, [canvasApi]);

  const scheduleSetViewboxX = useCallback((nextXRaw) => {
    const nextX = Number(nextXRaw);
    if (!Number.isFinite(nextX)) return;
    pendingViewboxXRef.current = nextX;
    if (frameIdRef.current) return;
    const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (fn) => setTimeout(fn, 16);
    frameIdRef.current = scheduleFrame(flushScheduledViewboxX);
  }, [flushScheduledViewboxX]);

  const refreshFromCanvas = useCallback(() => {
    if (!active) return;

    const rawSnapshot = canvasApi?.getViewportSnapshot?.() || {
      viewbox: canvasApi?.getViewbox?.() || {},
    };

    const trackRect = readTrackRect(trackRef.current);
    const nextViewState = buildViewportScrubberViewState(rawSnapshot, {
      trackWidth: trackRect.width,
      minThumbWidthPx,
    });

    if (dragRef.current?.active) {
      rangeRef.current = nextViewState.range;
      return;
    }

    commitViewState(nextViewState);
  }, [active, canvasApi, commitViewState, minThumbWidthPx]);

  const stopDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleWindowPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag?.active) return;

    const nextClientX = toFiniteNumber(event?.clientX, drag.startClientX);
    const deltaPx = nextClientX - drag.startClientX;
    const trackWidth = Math.max(0, toFiniteNumber(drag.trackWidth, 0));
    if (!(trackWidth > 0)) return;

    const current = viewStateRef.current;
    const maxLeft = Math.max(0, 1 - current.thumbWidthFraction);
    const deltaFraction = deltaPx / trackWidth;
    const nextLeft = clampNumber(drag.startThumbLeft + deltaFraction, 0, maxLeft);

    const nextViewboxX = thumbLeftFractionToViewboxX(
      rangeRef.current,
      nextLeft,
      current.thumbWidthFraction,
    );

    viewStateRef.current = {
      ...current,
      thumbLeftFraction: nextLeft,
      thumbLeftPercent: nextLeft * 100,
    };
    setViewState(viewStateRef.current);
    scheduleSetViewboxX(nextViewboxX);
  }, [scheduleSetViewboxX]);

  const handleWindowPointerUp = useCallback(() => {
    if (!dragRef.current?.active) return;
    stopDrag();
    refreshFromCanvas();
  }, [refreshFromCanvas, stopDrag]);

  const onThumbPointerDown = useCallback((event) => {
    if (!active) return;
    if (Number(event?.button) !== 0) return;
    if (viewStateRef.current.canScroll !== true) return;

    const trackRect = readTrackRect(trackRef.current);
    if (!(trackRect.width > 0)) return;

    event.preventDefault();
    dragRef.current = {
      active: true,
      startClientX: toFiniteNumber(event?.clientX, 0),
      startThumbLeft: viewStateRef.current.thumbLeftFraction,
      trackWidth: trackRect.width,
    };

    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", handleWindowPointerMove);
      window.addEventListener("pointerup", handleWindowPointerUp);
      window.addEventListener("pointercancel", handleWindowPointerUp);
    }
  }, [active, handleWindowPointerMove, handleWindowPointerUp]);

  const onTrackPointerDown = useCallback((event) => {
    if (!active) return;
    if (Number(event?.button) !== 0) return;
    if (viewStateRef.current.canScroll !== true) return;

    const target = event?.target;
    if (target instanceof Element && target.closest?.("[data-scrubber-thumb='true']")) return;

    const trackRect = readTrackRect(trackRef.current);
    if (!(trackRect.width > 0)) return;

    const trackFraction = clientXToTrackFraction(event?.clientX, trackRect);
    const thumbWidthFraction = viewStateRef.current.thumbWidthFraction;
    const nextViewboxX = trackFractionToViewboxX(
      rangeRef.current,
      trackFraction,
      thumbWidthFraction,
    );

    const nextThumbLeft = clampNumber(
      trackFraction - (thumbWidthFraction / 2),
      0,
      Math.max(0, 1 - thumbWidthFraction),
    );

    const current = viewStateRef.current;
    viewStateRef.current = {
      ...current,
      thumbLeftFraction: nextThumbLeft,
      thumbLeftPercent: nextThumbLeft * 100,
    };
    setViewState(viewStateRef.current);
    scheduleSetViewboxX(nextViewboxX);
  }, [active, scheduleSetViewboxX]);

  const setTrackRef = useCallback((node) => {
    trackRef.current = node instanceof Element ? node : null;
  }, []);

  const setThumbRef = useCallback((node) => {
    thumbRef.current = node instanceof Element ? node : null;
  }, []);

  useEffect(() => {
    if (!active) {
      stopDrag();
      if (frameIdRef.current) {
        const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame.bind(window)
          : clearTimeout;
        cancelFrame(frameIdRef.current);
        frameIdRef.current = 0;
      }
      pendingViewboxXRef.current = null;
      return undefined;
    }

    const unsubscribe = canvasApi?.onViewboxChanged?.(() => {
      refreshFromCanvas();
    }) || (() => {});

    const trackEl = trackRef.current;
    const thumbEl = thumbRef.current;
    const handleNativeTrackDown = (event) => onTrackPointerDown(event);
    const handleNativeThumbDown = (event) => onThumbPointerDown(event);

    trackEl?.addEventListener?.("pointerdown", handleNativeTrackDown);
    thumbEl?.addEventListener?.("pointerdown", handleNativeThumbDown);

    let stopResizeObserver = () => {};
    if (typeof window !== "undefined" && typeof window.ResizeObserver === "function" && trackRef.current instanceof Element) {
      const observer = new window.ResizeObserver(() => refreshFromCanvas());
      observer.observe(trackRef.current);
      stopResizeObserver = () => observer.disconnect();
    }

    refreshFromCanvas();

    return () => {
      unsubscribe();
      trackEl?.removeEventListener?.("pointerdown", handleNativeTrackDown);
      thumbEl?.removeEventListener?.("pointerdown", handleNativeThumbDown);
      stopResizeObserver();
      if (typeof window !== "undefined") {
        window.removeEventListener("pointermove", handleWindowPointerMove);
        window.removeEventListener("pointerup", handleWindowPointerUp);
        window.removeEventListener("pointercancel", handleWindowPointerUp);
      }
      stopDrag();
      if (frameIdRef.current) {
        const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame.bind(window)
          : clearTimeout;
        cancelFrame(frameIdRef.current);
        frameIdRef.current = 0;
      }
      pendingViewboxXRef.current = null;
    };
  }, [
    active,
    canvasApi,
    handleWindowPointerMove,
    handleWindowPointerUp,
    onThumbPointerDown,
    onTrackPointerDown,
    refreshFromCanvas,
    stopDrag,
  ]);

  return {
    canScroll: viewState.canScroll,
    thumbStyle: {
      width: `${viewState.thumbWidthPercent}%`,
      left: `${viewState.thumbLeftPercent}%`,
    },
    setTrackRef,
    setThumbRef,
    refreshFromCanvas,
  };
}
