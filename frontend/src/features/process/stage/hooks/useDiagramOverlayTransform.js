import { useCallback, useEffect, useRef, useState } from "react";

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

export function buildOverlayMatrixFromSnapshot(snapshotRaw, hostRectRaw = {}) {
  const snapshot = asObject(snapshotRaw);
  const viewbox = asObject(snapshot.viewbox);
  const hostRect = asObject(hostRectRaw);
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
  tab,
  hybridVisible,
  bpmnRef,
  bpmnStageHostRef,
  matrixToScreen,
  matrixToDiagram,
}) {
  const matrixRef = useRef({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const pendingSnapshotRef = useRef(null);
  const frameRef = useRef(0);

  const [hybridViewportSize, setHybridViewportSize] = useState({ width: 0, height: 0 });
  const [hybridViewportMatrix, setHybridViewportMatrix] = useState({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const [viewbox, setViewbox] = useState({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
  const [containerRect, setContainerRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const readHostRect = useCallback(() => {
    const host = bpmnStageHostRef.current;
    const rect = host?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: clampNumber(rect.left, 0),
      top: clampNumber(rect.top, 0),
      width: Math.max(0, clampNumber(rect.width, 0)),
      height: Math.max(0, clampNumber(rect.height, 0)),
    };
  }, [bpmnStageHostRef]);

  const applySnapshot = useCallback((snapshotRaw) => {
    const snapshot = asObject(snapshotRaw);
    const hostRect = readHostRect();
    const nextMatrix = buildOverlayMatrixFromSnapshot(snapshot, hostRect);
    const nextViewbox = {
      x: clampNumber(asObject(snapshot.viewbox).x, 0),
      y: clampNumber(asObject(snapshot.viewbox).y, 0),
      width: clampNumber(asObject(snapshot.viewbox).width, 0),
      height: clampNumber(asObject(snapshot.viewbox).height, 0),
      scale: clampNumber(nextMatrix.a, 1),
    };
    const nextSize = {
      width: Math.max(0, clampNumber(hostRect.width, clampNumber(snapshot.width, 0))),
      height: Math.max(0, clampNumber(hostRect.height, clampNumber(snapshot.height, 0))),
    };
    setContainerRect((prevRaw) => {
      const prev = asObject(prevRaw);
      if (
        isSameNumber(prev.left, hostRect.left, 0.5)
        && isSameNumber(prev.top, hostRect.top, 0.5)
        && isSameNumber(prev.width, hostRect.width, 0.5)
        && isSameNumber(prev.height, hostRect.height, 0.5)
      ) return prev;
      return hostRect;
    });
    setHybridViewportSize((prevRaw) => {
      const prev = asObject(prevRaw);
      if (isSameNumber(prev.width, nextSize.width, 0.5) && isSameNumber(prev.height, nextSize.height, 0.5)) return prev;
      return nextSize;
    });
    if (!isSameMatrix(matrixRef.current, nextMatrix)) {
      matrixRef.current = nextMatrix;
      setHybridViewportMatrix(nextMatrix);
    }
    setViewbox((prevRaw) => {
      const prev = asObject(prevRaw);
      if (
        isSameNumber(prev.x, nextViewbox.x, 0.05)
        && isSameNumber(prev.y, nextViewbox.y, 0.05)
        && isSameNumber(prev.width, nextViewbox.width, 0.05)
        && isSameNumber(prev.height, nextViewbox.height, 0.05)
        && isSameNumber(prev.scale, nextViewbox.scale, 0.0001)
      ) {
        return prev;
      }
      return nextViewbox;
    });
  }, [readHostRect]);

  const scheduleSnapshot = useCallback((snapshotRaw = null) => {
    pendingSnapshotRef.current = snapshotRaw;
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      const preferred = pendingSnapshotRef.current;
      pendingSnapshotRef.current = null;
      const fallback = bpmnRef.current?.getCanvasSnapshot?.({ mode: "editor" }) || {};
      applySnapshot(asObject(preferred).viewbox ? preferred : fallback);
    });
  }, [applySnapshot, bpmnRef]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (tab !== "diagram" || !hybridVisible) {
      matrixRef.current = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      setHybridViewportSize({ width: 0, height: 0 });
      setHybridViewportMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      setViewbox({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
      setContainerRect({ left: 0, top: 0, width: 0, height: 0 });
      return undefined;
    }
    let bound = false;
    let unsubscribeViewbox = () => {};
    const tryBindViewboxListener = () => {
      if (bound) return;
      const subscribe = bpmnRef.current?.onCanvasViewboxChanged;
      if (typeof subscribe !== "function") return;
      unsubscribeViewbox = subscribe((payloadRaw) => {
        const payload = asObject(payloadRaw);
        scheduleSnapshot(asObject(payload.snapshot));
      }) || (() => {});
      bound = true;
    };
    let stopResize = () => {};
    const host = bpmnStageHostRef.current;
    if (typeof window.ResizeObserver === "function" && host) {
      const observer = new window.ResizeObserver(() => scheduleSnapshot(null));
      observer.observe(host);
      stopResize = () => observer.disconnect();
    } else {
      const onResize = () => scheduleSnapshot(null);
      window.addEventListener("resize", onResize);
      stopResize = () => window.removeEventListener("resize", onResize);
    }
    tryBindViewboxListener();
    const pollId = window.setInterval(() => {
      tryBindViewboxListener();
      scheduleSnapshot(bpmnRef.current?.getCanvasSnapshot?.({ mode: "editor" }) || null);
    }, 220);
    scheduleSnapshot(bpmnRef.current?.getCanvasSnapshot?.({ mode: "editor" }) || null);
    return () => {
      unsubscribeViewbox();
      stopResize();
      window.clearInterval(pollId);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [tab, hybridVisible, bpmnRef, bpmnStageHostRef, scheduleSnapshot]);

  const localToDiagram = useCallback((localXRaw, localYRaw) => {
    const localX = clampNumber(localXRaw, 0);
    const localY = clampNumber(localYRaw, 0);
    return matrixToDiagram(matrixRef.current, localX, localY);
  }, [matrixToDiagram]);

  const clientToDiagram = useCallback((clientXRaw, clientYRaw) => {
    const rect = readHostRect();
    const localX = clampNumber(clientXRaw, 0) - clampNumber(rect.left, 0);
    const localY = clampNumber(clientYRaw, 0) - clampNumber(rect.top, 0);
    return localToDiagram(localX, localY);
  }, [localToDiagram, readHostRect]);

  const diagramToScreenPoint = useCallback((xRaw, yRaw) => {
    return matrixToScreen(matrixRef.current, xRaw, yRaw);
  }, [matrixToScreen]);

  const getElementBBox = useCallback((elementIdRaw) => {
    return bpmnRef.current?.getElementBounds?.(elementIdRaw, { mode: "editor" }) || null;
  }, [bpmnRef]);

  return {
    hybridViewportSize,
    hybridViewportMatrix,
    hybridViewportMatrixRef: matrixRef,
    overlayViewbox: viewbox,
    overlayContainerRect: containerRect,
    scheduleOverlayRefresh: scheduleSnapshot,
    localToDiagram,
    clientToDiagram,
    diagramToScreenPoint,
    getElementBBox,
  };
}
