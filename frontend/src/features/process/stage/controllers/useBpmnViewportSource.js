import { useCallback, useEffect, useRef, useState } from "react";
import { matrixToDiagram, matrixToScreen } from "../utils/hybridCoords.js";

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

function normalizeMatrix(raw) {
  const matrix = asObject(raw);
  return {
    a: clampNumber(matrix.a, 1),
    b: clampNumber(matrix.b, 0),
    c: clampNumber(matrix.c, 0),
    d: clampNumber(matrix.d, 1),
    e: clampNumber(matrix.e, 0),
    f: clampNumber(matrix.f, 0),
  };
}

function parseMatrixTransform(transformRaw) {
  const text = String(transformRaw || "").trim();
  if (!text) return null;
  const match = text.match(/matrix\(([^)]+)\)/i);
  if (!match) return null;
  const parts = String(match[1] || "")
    .split(",")
    .map((row) => Number(String(row || "").trim()));
  if (parts.length !== 6 || parts.some((value) => !Number.isFinite(value))) return null;
  return normalizeMatrix({
    a: parts[0],
    b: parts[1],
    c: parts[2],
    d: parts[3],
    e: parts[4],
    f: parts[5],
  });
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

function hasMeaningfulViewbox(raw) {
  const viewbox = normalizeViewbox(raw);
  return viewbox.width > 0 && viewbox.height > 0;
}

function buildOverlayMatrixFromSnapshot(snapshotRaw, hostRectRaw = {}) {
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

export default function useBpmnViewportSource({
  enabled = true,
  canvasApi,
}) {
  const matrixRef = useRef({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const frameRef = useRef(0);
  const pendingViewboxRef = useRef(null);
  const matrixSubscribersRef = useRef(new Set());
  // viewboxChanging: true while pan/zoom is actively in flight.
  // Updated imperatively (no React state) to avoid extra re-renders.
  const viewboxChangingRef = useRef(false);
  const viewboxChangingSubscribersRef = useRef(new Set());
  const settledTimerRef = useRef(0);

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [viewportMatrix, setViewportMatrix] = useState({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const [viewbox, setViewbox] = useState({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
  const [containerRect, setContainerRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const readContainerRect = useCallback(() => {
    const host = canvasApi?.getCanvasContainerEl?.();
    const rect = host?.getBoundingClientRect?.() || {};
    return normalizeRect(rect);
  }, [canvasApi]);

  const readViewportMatrixFromDom = useCallback((hostRaw = null) => {
    const host = hostRaw instanceof Element ? hostRaw : canvasApi?.getCanvasContainerEl?.();
    if (!(host instanceof Element)) return null;
    const candidates = host.querySelectorAll?.(
      ".bpmnLayer--editor.on .djs-container g.viewport, .bpmnLayer--editor.on .djs-container g.djs-viewport, .djs-container g.viewport, .djs-container g.djs-viewport",
    );
    if (!candidates || !candidates.length) return null;
    for (const node of candidates) {
      if (!(node instanceof Element)) continue;
      const parsed = parseMatrixTransform(node.getAttribute?.("transform"));
      if (parsed) return parsed;
    }
    return null;
  }, [canvasApi]);

  const readRuntimeMatrix = useCallback(() => {
    const host = canvasApi?.getCanvasContainerEl?.();
    const nextRect = readContainerRect();
    const domMatrix = readViewportMatrixFromDom(host);
    if (domMatrix) return domMatrix;
    const nextViewbox = normalizeViewbox(canvasApi?.getViewbox?.() || {});
    return buildOverlayMatrixFromSnapshot(
      {
        viewbox: nextViewbox,
        zoom: nextViewbox.scale,
        width: nextRect.width,
        height: nextRect.height,
      },
      nextRect,
    );
  }, [canvasApi, readContainerRect, readViewportMatrixFromDom]);

  const notifyViewportMatrix = useCallback((matrixRaw) => {
    const next = normalizeMatrix(matrixRaw);
    matrixSubscribersRef.current.forEach((listener) => {
      try {
        listener(next);
      } catch {
      }
    });
  }, []);

  const notifyViewboxChanging = useCallback((changing) => {
    viewboxChangingSubscribersRef.current.forEach((listener) => {
      try {
        listener(changing);
      } catch {
      }
    });
  }, []);

  const setViewboxChanging = useCallback((changing) => {
    if (viewboxChangingRef.current === changing) return;
    viewboxChangingRef.current = changing;
    notifyViewboxChanging(changing);
  }, [notifyViewboxChanging]);

  // subscribeViewboxChanging: imperative subscription for DOM-level hide/show.
  // Avoids React re-renders — consumers toggle CSS directly on the overlay container.
  const subscribeViewboxChanging = useCallback((listener) => {
    if (typeof listener !== "function") return () => {};
    viewboxChangingSubscribersRef.current.add(listener);
    try {
      listener(viewboxChangingRef.current);
    } catch {
    }
    return () => {
      viewboxChangingSubscribersRef.current.delete(listener);
    };
  }, []);

  const subscribeViewportMatrix = useCallback((listener) => {
    if (typeof listener !== "function") return () => {};
    matrixSubscribersRef.current.add(listener);
    try {
      listener(normalizeMatrix(matrixRef.current));
    } catch {
    }
    return () => {
      matrixSubscribersRef.current.delete(listener);
    };
  }, []);

  const getViewportMatrix = useCallback(() => normalizeMatrix(matrixRef.current), []);

  const applyViewbox = useCallback((viewboxRaw) => {
    const nextViewbox = normalizeViewbox(viewboxRaw);
    const host = canvasApi?.getCanvasContainerEl?.();
    const nextRect = readContainerRect();
    const nextMatrixFromViewbox = buildOverlayMatrixFromSnapshot(
      {
        viewbox: nextViewbox,
        zoom: nextViewbox.scale,
        width: nextRect.width,
        height: nextRect.height,
      },
      nextRect,
    );
    const nextMatrix = hasMeaningfulViewbox(nextViewbox)
      ? nextMatrixFromViewbox
      : (readViewportMatrixFromDom(host) || nextMatrixFromViewbox);

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
    setViewportSize((prevRaw) => {
      const prev = asObject(prevRaw);
      if (isSameNumber(prev.width, nextRect.width, 0.5) && isSameNumber(prev.height, nextRect.height, 0.5)) return prev;
      return { width: nextRect.width, height: nextRect.height };
    });
    if (!isSameMatrix(matrixRef.current, nextMatrix)) {
      matrixRef.current = nextMatrix;
      setViewportMatrix(nextMatrix);
      notifyViewportMatrix(nextMatrix);
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
  }, [canvasApi, notifyViewportMatrix, readContainerRect, readViewportMatrixFromDom]);

  // Settled debounce: 150ms after the last viewbox event, mark changing=false.
  const SETTLED_DELAY_MS = 150;

  const scheduleApply = useCallback((viewboxRaw = null) => {
    // Mark overlays as changing — subscribers hide overlay layer imperatively.
    setViewboxChanging(true);
    // Clear any pending settled timer.
    if (settledTimerRef.current) {
      clearTimeout(settledTimerRef.current);
      settledTimerRef.current = 0;
    }
    // Always batch through rAF — even meaningful viewboxes — so rapid pan/zoom
    // events collapse into a single recompute per animation frame.
    pendingViewboxRef.current = viewboxRaw;
    if (!frameRef.current) {
      const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (fn) => setTimeout(fn, 16);
      frameRef.current = scheduleFrame(() => {
        frameRef.current = 0;
        const next = pendingViewboxRef.current;
        pendingViewboxRef.current = null;
        const fallback = canvasApi?.getViewbox?.() || {};
        applyViewbox(hasMeaningfulViewbox(next) ? next : fallback);
        // Schedule settled signal after rAF completes.
        settledTimerRef.current = setTimeout(() => {
          settledTimerRef.current = 0;
          setViewboxChanging(false);
        }, SETTLED_DELAY_MS);
      });
    }
  }, [applyViewbox, canvasApi, setViewboxChanging]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!enabled) {
      matrixRef.current = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      setViewportSize({ width: 0, height: 0 });
      setViewportMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      setViewbox({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
      setContainerRect({ left: 0, top: 0, width: 0, height: 0 });
      notifyViewportMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return undefined;
    }
    const unbindViewbox = canvasApi?.onViewboxChanged?.((nextViewbox) => {
      scheduleApply(nextViewbox);
    }) || (() => {});

    const containerEl = canvasApi?.getCanvasContainerEl?.();
    let stopResize = () => {};
    let stopFallbackRefresh = () => {};
    if (containerEl && typeof window.ResizeObserver === "function") {
      const observer = new window.ResizeObserver(() => scheduleApply(null));
      observer.observe(containerEl);
      stopResize = () => observer.disconnect();
    } else {
      const onResize = () => scheduleApply(null);
      window.addEventListener("resize", onResize);
      stopResize = () => window.removeEventListener("resize", onResize);
    }
    const fallbackTimer = window.setInterval(() => scheduleApply(null), 360);
    stopFallbackRefresh = () => window.clearInterval(fallbackTimer);

    scheduleApply(canvasApi?.getViewbox?.() || null);

    return () => {
      unbindViewbox();
      stopResize();
      stopFallbackRefresh();
      if (frameRef.current) {
        const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
          ? window.cancelAnimationFrame.bind(window)
          : clearTimeout;
        cancelFrame(frameRef.current);
        frameRef.current = 0;
      }
      if (settledTimerRef.current) {
        clearTimeout(settledTimerRef.current);
        settledTimerRef.current = 0;
      }
      setViewboxChanging(false);
    };
  }, [canvasApi, enabled, notifyViewportMatrix, scheduleApply, setViewboxChanging]);

  const localToDiagram = useCallback((localXRaw, localYRaw) => {
    const localX = clampNumber(localXRaw, 0);
    const localY = clampNumber(localYRaw, 0);
    const matrix = enabled ? matrixRef.current : readRuntimeMatrix();
    return matrixToDiagram(matrix, localX, localY);
  }, [enabled, readRuntimeMatrix]);

  const screenToDiagram = useCallback((pointRaw) => {
    const point = asObject(pointRaw);
    const rect = readContainerRect();
    return localToDiagram(clampNumber(point.x, 0) - rect.left, clampNumber(point.y, 0) - rect.top);
  }, [localToDiagram, readContainerRect]);

  const diagramToScreen = useCallback((pointRaw) => {
    const point = asObject(pointRaw);
    const matrix = enabled ? matrixRef.current : readRuntimeMatrix();
    const local = matrixToScreen(matrix, clampNumber(point.x, 0), clampNumber(point.y, 0));
    const rect = readContainerRect();
    return {
      x: clampNumber(local.x, 0) + rect.left,
      y: clampNumber(local.y, 0) + rect.top,
    };
  }, [enabled, readContainerRect, readRuntimeMatrix]);

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
    matrixRef,
    viewbox,
    containerRect,
    viewportSize,
    viewportMatrix,
    subscribeViewportMatrix,
    getViewportMatrix,
    subscribeViewboxChanging,
    viewboxChangingRef,
    localToDiagram,
    clientToDiagram,
    screenToDiagram,
    diagramToScreen,
    getElementBBox,
  };
}

export {
  asObject,
  clampNumber,
  buildOverlayMatrixFromSnapshot,
};
