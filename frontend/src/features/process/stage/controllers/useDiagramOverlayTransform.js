import { useCallback, useEffect, useRef, useState } from "react";
import { matrixToDiagram, matrixToScreen } from "../utils/hybridCoords";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function clampNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function isSameNumber(aRaw, bRaw, tolerance = 0.1) {
  return Math.abs(clampNumber(aRaw) - clampNumber(bRaw)) <= tolerance;
}

function isSameMatrix(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  return isSameNumber(a.a, b.a, 0.0001)
    && isSameNumber(a.b, b.b, 0.0001)
    && isSameNumber(a.c, b.c, 0.0001)
    && isSameNumber(a.d, b.d, 0.0001)
    && isSameNumber(a.e, b.e, 0.2)
    && isSameNumber(a.f, b.f, 0.2);
}

function normalizeRect(raw) {
  const rect = asObject(raw);
  return {
    left: clampNumber(rect.left, 0),
    top: clampNumber(rect.top, 0),
    width: Math.max(0, clampNumber(rect.width, 0)),
    height: Math.max(0, clampNumber(rect.height, 0)),
  };
}

function normalizeViewbox(raw) {
  const viewbox = asObject(raw);
  return {
    x: clampNumber(viewbox.x, 0),
    y: clampNumber(viewbox.y, 0),
    width: Math.max(0, clampNumber(viewbox.width, 0)),
    height: Math.max(0, clampNumber(viewbox.height, 0)),
    scale: Math.max(0, clampNumber(viewbox.scale, clampNumber(viewbox.zoom, 0))),
  };
}

export function buildOverlayMatrixFromSnapshot(snapshotRaw, hostRectRaw = {}) {
  const snapshot = asObject(snapshotRaw);
  const viewbox = normalizeViewbox(snapshot.viewbox);
  const hostRect = normalizeRect(hostRectRaw);
  const width = Math.max(0, clampNumber(hostRect.width, clampNumber(snapshot.width, 0)));
  const height = Math.max(0, clampNumber(hostRect.height, clampNumber(snapshot.height, 0)));
  const vbX = clampNumber(viewbox.x, 0);
  const vbY = clampNumber(viewbox.y, 0);
  const vbWidth = clampNumber(viewbox.width, 0);
  const vbHeight = clampNumber(viewbox.height, 0);
  const zoom = clampNumber(snapshot.zoom, 0);
  let scale = zoom > 0 ? zoom : 0;
  if (!(scale > 0) && vbWidth > 0 && width > 0) {
    scale = width / vbWidth;
  }
  if (!(scale > 0) && vbHeight > 0 && height > 0) {
    scale = height / vbHeight;
  }
  if (!(scale > 0)) scale = 1;
  return {
    a: scale,
    b: 0,
    c: 0,
    d: scale,
    e: -vbX * scale,
    f: -vbY * scale,
  };
}

export default function useDiagramOverlayTransform({
  enabled = true,
  canvasApi,
}) {
  const matrixRef = useRef({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const frameRef = useRef(0);
  const pendingViewboxRef = useRef(null);

  const [hybridViewportSize, setHybridViewportSize] = useState({ width: 0, height: 0 });
  const [hybridViewportMatrix, setHybridViewportMatrix] = useState({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const [viewbox, setViewbox] = useState({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
  const [containerRect, setContainerRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const readContainerRect = useCallback(() => {
    const host = canvasApi?.getCanvasContainerEl?.();
    const rect = host?.getBoundingClientRect?.() || {};
    return normalizeRect(rect);
  }, [canvasApi]);

  const applyViewbox = useCallback((viewboxRaw) => {
    const nextViewbox = normalizeViewbox(viewboxRaw);
    const nextRect = readContainerRect();
    const nextMatrix = buildOverlayMatrixFromSnapshot(
      {
        viewbox: nextViewbox,
        zoom: nextViewbox.scale,
        width: nextRect.width,
        height: nextRect.height,
      },
      nextRect,
    );

    setContainerRect((prevRaw) => {
      const prev = normalizeRect(prevRaw);
      if (
        isSameNumber(prev.left, nextRect.left, 0.5)
        && isSameNumber(prev.top, nextRect.top, 0.5)
        && isSameNumber(prev.width, nextRect.width, 0.5)
        && isSameNumber(prev.height, nextRect.height, 0.5)
      ) return prev;
      return nextRect;
    });
    setHybridViewportSize((prevRaw) => {
      const prev = asObject(prevRaw);
      if (isSameNumber(prev.width, nextRect.width, 0.5) && isSameNumber(prev.height, nextRect.height, 0.5)) return prev;
      return { width: nextRect.width, height: nextRect.height };
    });
    if (!isSameMatrix(matrixRef.current, nextMatrix)) {
      matrixRef.current = nextMatrix;
      setHybridViewportMatrix(nextMatrix);
    }
    setViewbox((prevRaw) => {
      const prev = normalizeViewbox(prevRaw);
      if (
        isSameNumber(prev.x, nextViewbox.x, 0.05)
        && isSameNumber(prev.y, nextViewbox.y, 0.05)
        && isSameNumber(prev.width, nextViewbox.width, 0.05)
        && isSameNumber(prev.height, nextViewbox.height, 0.05)
        && isSameNumber(prev.scale, nextViewbox.scale, 0.0001)
      ) return prev;
      return nextViewbox;
    });
  }, [readContainerRect]);

  const scheduleApply = useCallback((viewboxRaw = null) => {
    pendingViewboxRef.current = viewboxRaw;
    if (frameRef.current) return;
    const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (fn) => setTimeout(fn, 16);
    frameRef.current = scheduleFrame(() => {
      frameRef.current = 0;
      const next = pendingViewboxRef.current;
      pendingViewboxRef.current = null;
      const fallback = canvasApi?.getViewbox?.() || {};
      applyViewbox(asObject(next).width || asObject(next).height ? next : fallback);
    });
  }, [applyViewbox, canvasApi]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!enabled) {
      matrixRef.current = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      setHybridViewportSize({ width: 0, height: 0 });
      setHybridViewportMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      setViewbox({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
      setContainerRect({ left: 0, top: 0, width: 0, height: 0 });
      return undefined;
    }
    const unbindViewbox = canvasApi?.onViewboxChanged?.((nextViewbox) => {
      scheduleApply(nextViewbox);
    }) || (() => {});

    const containerEl = canvasApi?.getCanvasContainerEl?.();
    let stopResize = () => {};
    if (containerEl && typeof window.ResizeObserver === "function") {
      const observer = new window.ResizeObserver(() => scheduleApply(null));
      observer.observe(containerEl);
      stopResize = () => observer.disconnect();
    } else {
      const onResize = () => scheduleApply(null);
      window.addEventListener("resize", onResize);
      stopResize = () => window.removeEventListener("resize", onResize);
    }

    scheduleApply(canvasApi?.getViewbox?.() || null);
    const pollId = window.setInterval(() => {
      scheduleApply(canvasApi?.getViewbox?.() || null);
    }, 220);

    return () => {
      unbindViewbox();
      stopResize();
      window.clearInterval(pollId);
      if (frameRef.current) {
        const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame.bind(window)
          : clearTimeout;
        cancelFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [canvasApi, enabled, scheduleApply]);

  const localToDiagram = useCallback((localXRaw, localYRaw) => {
    const localX = clampNumber(localXRaw, 0);
    const localY = clampNumber(localYRaw, 0);
    return matrixToDiagram(matrixRef.current, localX, localY);
  }, []);

  const screenToDiagram = useCallback((pointRaw) => {
    const point = asObject(pointRaw);
    const rect = readContainerRect();
    return localToDiagram(clampNumber(point.x, 0) - rect.left, clampNumber(point.y, 0) - rect.top);
  }, [localToDiagram, readContainerRect]);

  const diagramToScreen = useCallback((pointRaw) => {
    const point = asObject(pointRaw);
    const local = matrixToScreen(matrixRef.current, clampNumber(point.x, 0), clampNumber(point.y, 0));
    const rect = readContainerRect();
    return {
      x: clampNumber(local.x, 0) + rect.left,
      y: clampNumber(local.y, 0) + rect.top,
    };
  }, [readContainerRect]);

  const clientToDiagram = useCallback((clientXRaw, clientYRaw) => {
    return screenToDiagram({
      x: clampNumber(clientXRaw, 0),
      y: clampNumber(clientYRaw, 0),
    });
  }, [screenToDiagram]);

  const getElementBBox = useCallback((bpmnIdRaw) => {
    return canvasApi?.getElementBBox?.(bpmnIdRaw) || null;
  }, [canvasApi]);

  return {
    viewbox,
    overlayViewbox: viewbox,
    containerRect,
    overlayContainerRect: containerRect,
    hybridViewportSize,
    hybridViewportMatrix,
    hybridViewportMatrixRef: matrixRef,
    localToDiagram,
    clientToDiagram,
    screenToDiagram,
    diagramToScreen,
    getElementBBox,
  };
}
