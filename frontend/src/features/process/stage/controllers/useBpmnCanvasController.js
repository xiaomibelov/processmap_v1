import { useCallback, useMemo } from "react";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeViewbox(raw) {
  const source = asObject(raw);
  const nestedViewbox = asObject(source.viewbox);
  const hasNested = Number.isFinite(Number(nestedViewbox.width)) || Number.isFinite(Number(nestedViewbox.height));
  const merged = hasNested
    ? {
      ...nestedViewbox,
      scale: source.scale ?? source.zoom ?? nestedViewbox.scale ?? nestedViewbox.zoom,
    }
    : source;
  const viewbox = asObject(merged);
  return {
    x: toNumber(viewbox.x, 0),
    y: toNumber(viewbox.y, 0),
    width: Math.max(0, toNumber(viewbox.width, 0)),
    height: Math.max(0, toNumber(viewbox.height, 0)),
    scale: Math.max(0, toNumber(viewbox.scale, toNumber(viewbox.zoom, 0))),
  };
}

function viewboxSig(viewboxRaw) {
  const viewbox = normalizeViewbox(viewboxRaw);
  return [
    Math.round(viewbox.x * 1000) / 1000,
    Math.round(viewbox.y * 1000) / 1000,
    Math.round(viewbox.width * 1000) / 1000,
    Math.round(viewbox.height * 1000) / 1000,
    Math.round(viewbox.scale * 100000) / 100000,
  ].join("|");
}

function normalizeBBox(raw) {
  const box = asObject(raw);
  const x = toNumber(box.x, Number.NaN);
  const y = toNumber(box.y, Number.NaN);
  const width = toNumber(box.width, Number.NaN);
  const height = toNumber(box.height, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (!(width > 0) || !(height > 0)) return null;
  return { x, y, width, height };
}

function anchorFromBox(boxRaw, kindRaw = "center") {
  const box = normalizeBBox(boxRaw);
  if (!box) return null;
  const kind = toText(kindRaw).toLowerCase() || "center";
  if (kind === "north") return { x: box.x + (box.width / 2), y: box.y };
  if (kind === "south") return { x: box.x + (box.width / 2), y: box.y + box.height };
  if (kind === "east") return { x: box.x + box.width, y: box.y + (box.height / 2) };
  if (kind === "west") return { x: box.x, y: box.y + (box.height / 2) };
  return { x: box.x + (box.width / 2), y: box.y + (box.height / 2) };
}

export default function useBpmnCanvasController({
  bpmnRef,
  bpmnStageHostRef,
}) {
  const getCanvasContainerEl = useCallback(() => {
    const host = bpmnStageHostRef?.current;
    if (host instanceof Element) return host;
    const fallback = bpmnRef?.current?.getCanvasContainer?.();
    return fallback instanceof Element ? fallback : null;
  }, [bpmnRef, bpmnStageHostRef]);

  const getViewbox = useCallback(() => {
    const snapshot = asObject(bpmnRef?.current?.getCanvasSnapshot?.({ mode: "editor" }));
    const fromSnapshot = {
      ...asObject(snapshot.viewbox),
      scale: snapshot.zoom ?? asObject(snapshot.viewbox).scale,
    };
    return normalizeViewbox(fromSnapshot);
  }, [bpmnRef]);

  const getElementBBox = useCallback((bpmnIdRaw) => {
    const bpmnId = toText(bpmnIdRaw);
    if (!bpmnId) return null;
    const bounds = bpmnRef?.current?.getElementBounds?.(bpmnId, { mode: "editor" });
    return normalizeBBox(bounds);
  }, [bpmnRef]);

  const getElementAnchor = useCallback((bpmnIdRaw, kind = "center") => {
    const box = getElementBBox(bpmnIdRaw);
    return anchorFromBox(box, kind);
  }, [getElementBBox]);

  const onViewboxChanged = useCallback((cb) => {
    if (typeof cb !== "function") return () => {};
    let frameId = 0;
    let unsubscribed = false;
    let lastSig = "";
    let pendingViewbox = null;
    const scheduleFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (fn) => setTimeout(fn, 16);
    const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window)
      : clearTimeout;

    const flush = () => {
      frameId = 0;
      if (unsubscribed) return;
      const candidate = normalizeViewbox(pendingViewbox || getViewbox());
      pendingViewbox = null;
      const sig = viewboxSig(candidate);
      if (sig === lastSig) return;
      lastSig = sig;
      cb(candidate);
    };

    const schedule = (nextViewboxRaw = null) => {
      pendingViewbox = nextViewboxRaw;
      if (frameId) return;
      frameId = scheduleFrame(flush);
    };

    const subscribe = bpmnRef?.current?.onCanvasViewboxChanged;
    const unsubscribe = typeof subscribe === "function"
      ? (subscribe((payloadRaw) => {
        const payload = asObject(payloadRaw);
        schedule(payload.snapshot || payload.viewbox || payload);
      }) || (() => {}))
      : (() => {});

    schedule(getViewbox());

    return () => {
      unsubscribed = true;
      if (frameId) {
        cancelFrame(frameId);
        frameId = 0;
      }
      unsubscribe();
    };
  }, [bpmnRef, getViewbox]);

  return useMemo(() => ({
    getViewbox,
    onViewboxChanged,
    getElementBBox,
    getElementAnchor,
    getCanvasContainerEl,
  }), [getCanvasContainerEl, getElementAnchor, getElementBBox, getViewbox, onViewboxChanged]);
}
