import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function clampNumber(valueRaw, minRaw = 0, maxRaw = Number.POSITIVE_INFINITY) {
  const value = Number(valueRaw);
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
}

export default function useHybridLayerViewportController({
  resetKey,
  tab,
  hybridVisible,
  hybridModeEffective,
  hybridLayerItems,
  hybridLayerPositions,
  hybridLayerByElementId,
  hybridViewportSize,
  hybridViewportMatrix,
  hybridLayerActiveElementId,
  matrixToDiagram,
  matrixToScreen,
  toText,
}) {
  const hybridLayerCardRefCallbacksRef = useRef({});
  const hybridLayerCardNodeRefsRef = useRef({});
  const hybridLayerCardSizesRef = useRef({});
  const [hybridLayerCardSizes, setHybridLayerCardSizes] = useState({});

  useEffect(() => {
    hybridLayerCardRefCallbacksRef.current = {};
    hybridLayerCardNodeRefsRef.current = {};
    hybridLayerCardSizesRef.current = {};
    setHybridLayerCardSizes({});
  }, [resetKey]);

  const setHybridLayerCardNode = useCallback((elementIdRaw, node) => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return;
    if (node instanceof HTMLElement) {
      hybridLayerCardNodeRefsRef.current[elementId] = node;
      return;
    }
    if (hybridLayerCardNodeRefsRef.current[elementId]) delete hybridLayerCardNodeRefsRef.current[elementId];
  }, [toText]);

  const getHybridLayerCardRefCallback = useCallback((elementIdRaw) => {
    const elementId = toText(elementIdRaw);
    if (!elementId) return () => {};
    const existing = hybridLayerCardRefCallbacksRef.current[elementId];
    if (existing) return existing;
    const next = (node) => {
      setHybridLayerCardNode(elementId, node);
    };
    hybridLayerCardRefCallbacksRef.current[elementId] = next;
    return next;
  }, [setHybridLayerCardNode, toText]);

  const refreshHybridLayerCardSizes = useCallback(() => {
    const refs = asObject(hybridLayerCardNodeRefsRef.current);
    const next = { ...asObject(hybridLayerCardSizesRef.current) };
    let changed = false;
    Object.keys(next).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || refs[elementId] instanceof HTMLElement) return;
      delete next[elementId];
      changed = true;
    });
    Object.keys(refs).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      const node = refs[elementId];
      if (!(node instanceof HTMLElement)) return;
      const rect = node.getBoundingClientRect?.();
      const width = Math.max(0, Math.round(Number(rect?.width || node.offsetWidth || 0)));
      const height = Math.max(0, Math.round(Number(rect?.height || node.offsetHeight || 0)));
      const prev = asObject(next[elementId]);
      if (Math.abs(Number(prev.width || 0) - width) > 0.5 || Math.abs(Number(prev.height || 0) - height) > 0.5) {
        next[elementId] = { width, height };
        changed = true;
      }
    });
    if (!changed) return;
    hybridLayerCardSizesRef.current = next;
    setHybridLayerCardSizes(next);
  }, [toText]);

  const hybridLayerRenderRows = useMemo(() => {
    const width = Number(hybridViewportSize?.width || 0);
    const height = Number(hybridViewportSize?.height || 0);
    const hotspotPadding = 16;
    const minX = hotspotPadding;
    const minY = hotspotPadding;
    const maxX = width > 0 ? Math.max(minX, width - hotspotPadding) : Number.POSITIVE_INFINITY;
    const maxY = height > 0 ? Math.max(minY, height - hotspotPadding) : Number.POSITIVE_INFINITY;
    const cardPadding = 10;
    const cardDefaultOffsetX = 14;
    const cardDefaultOffsetY = 12;
    const matrix = asObject(hybridViewportMatrix);
    return hybridLayerItems.map((itemRaw, index) => {
      const item = asObject(itemRaw);
      const elementId = toText(item?.elementId);
      const centerDiagram = asObject(hybridLayerPositions[elementId]);
      const hasCenter = Number.isFinite(centerDiagram.x) && Number.isFinite(centerDiagram.y);
      const offset = asObject(hybridLayerByElementId[elementId]);
      const rawDx = Number(offset.dx || 0);
      const rawDy = Number(offset.dy || 0);
      const fallbackScreenX = 92 + ((index % 6) * 36);
      const fallbackScreenY = 88 + (Math.floor(index / 6) * 30);
      const fallbackDiagram = matrixToDiagram(matrix, fallbackScreenX, fallbackScreenY);
      const baseDiagramX = Number(hasCenter ? centerDiagram.x : fallbackDiagram.x);
      const baseDiagramY = Number(hasCenter ? centerDiagram.y : fallbackDiagram.y);
      const rawDiagramX = baseDiagramX + Number(hasCenter ? rawDx : 0);
      const rawDiagramY = baseDiagramY + Number(hasCenter ? rawDy : 0);
      const rawScreen = matrixToScreen(matrix, rawDiagramX, rawDiagramY);
      const rawX = Number(rawScreen.x || 0);
      const rawY = Number(rawScreen.y || 0);
      const insideViewport = width > 0 && height > 0
        ? (rawX >= 0 && rawX <= width && rawY >= 0 && rawY <= height)
        : true;
      const posX = Number.isFinite(maxX) ? clampNumber(rawX, minX, maxX) : rawX;
      const posY = Number.isFinite(maxY) ? clampNumber(rawY, minY, maxY) : rawY;
      const showCard = hybridModeEffective === "edit" || toText(hybridLayerActiveElementId) === elementId;
      const cardSize = asObject(hybridLayerCardSizes[elementId]);
      const cardWidth = Math.max(0, Number(cardSize.width || 0));
      const cardHeight = Math.max(0, Number(cardSize.height || 0));
      let cardLeft = cardDefaultOffsetX;
      let cardTop = cardDefaultOffsetY;
      if (showCard && width > 0 && height > 0 && cardWidth > 0 && cardHeight > 0) {
        const clampedLeft = clampNumber(posX + cardDefaultOffsetX, cardPadding, Math.max(cardPadding, width - cardWidth - cardPadding));
        const clampedTop = clampNumber(posY + cardDefaultOffsetY, cardPadding, Math.max(cardPadding, height - cardHeight - cardPadding));
        cardLeft = Math.round((clampedLeft - posX) * 10) / 10;
        cardTop = Math.round((clampedTop - posY) * 10) / 10;
      }
      return {
        ...item,
        elementId,
        hasCenter,
        rawDx,
        rawDy,
        baseDiagramX,
        baseDiagramY,
        rawDiagramX,
        rawDiagramY,
        rawX,
        rawY,
        posX,
        posY,
        cardLeft,
        cardTop,
        insideViewport,
        wasClamped: Math.abs(posX - rawX) > 0.5 || Math.abs(posY - rawY) > 0.5,
      };
    });
  }, [
    hybridLayerActiveElementId,
    hybridLayerByElementId,
    hybridLayerCardSizes,
    hybridLayerItems,
    hybridLayerPositions,
    hybridModeEffective,
    hybridViewportMatrix,
    hybridViewportSize,
    matrixToDiagram,
    matrixToScreen,
    toText,
  ]);

  const hybridLayerMissingBindingIds = useMemo(
    () => hybridLayerRenderRows.filter((row) => !row?.hasCenter).map((row) => toText(row?.elementId)).filter(Boolean),
    [hybridLayerRenderRows, toText],
  );

  const hybridLayerVisibilityStats = useMemo(() => {
    const out = {
      total: Number(hybridLayerRenderRows.length || 0),
      ready: 0,
      incomplete: 0,
      none: 0,
      validBindings: 0,
      missingBindings: 0,
      insideViewport: 0,
      outsideViewport: 0,
    };
    hybridLayerRenderRows.forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const status = toText(row?.status).toLowerCase();
      if (status === "ready") out.ready += 1;
      else if (status === "incomplete") out.incomplete += 1;
      else out.none += 1;
      if (row?.hasCenter) out.validBindings += 1;
      else out.missingBindings += 1;
      if (row?.insideViewport) out.insideViewport += 1;
      else out.outsideViewport += 1;
    });
    return out;
  }, [hybridLayerRenderRows, toText]);

  const hybridLayerCounts = useMemo(() => ({
    total: Number(hybridLayerVisibilityStats.total || 0),
    ready: Number(hybridLayerVisibilityStats.ready || 0),
    incomplete: Number(hybridLayerVisibilityStats.incomplete || 0),
    none: Number(hybridLayerVisibilityStats.none || 0),
  }), [hybridLayerVisibilityStats]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (tab !== "diagram" || !hybridVisible) return undefined;
    const raf = window.requestAnimationFrame(() => {
      refreshHybridLayerCardSizes();
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [
    hybridLayerActiveElementId,
    hybridLayerRenderRows.length,
    hybridModeEffective,
    hybridViewportSize.height,
    hybridViewportSize.width,
    hybridVisible,
    refreshHybridLayerCardSizes,
    tab,
  ]);

  return {
    getHybridLayerCardRefCallback,
    hybridLayerRenderRows,
    hybridLayerMissingBindingIds,
    hybridLayerVisibilityStats,
    hybridLayerCounts,
  };
}
