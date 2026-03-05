import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function normalizeIds(idsRaw) {
  return Array.from(new Set(asArray(idsRaw).map((row) => toText(row)).filter(Boolean)));
}

function pointInRect(point, rect) {
  const x = Number(point?.x || 0);
  const y = Number(point?.y || 0);
  const left = Number(rect?.left || 0);
  const top = Number(rect?.top || 0);
  const width = Number(rect?.width || 0);
  const height = Number(rect?.height || 0);
  return x >= left && x <= left + width && y >= top && y <= top + height;
}

function distancePointToSegment(point, start, end) {
  const px = Number(point?.x || 0);
  const py = Number(point?.y || 0);
  const x1 = Number(start?.x || 0);
  const y1 = Number(start?.y || 0);
  const x2 = Number(end?.x || 0);
  const y2 = Number(end?.y || 0);
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, (((px - x1) * dx) + ((py - y1) * dy)) / ((dx * dx) + (dy * dy))));
  const projX = x1 + (dx * t);
  const projY = y1 + (dy * t);
  return Math.hypot(px - projX, py - projY);
}

function toLocalPoint(clientXRaw, clientYRaw, overlayRectRaw) {
  const rect = asObject(overlayRectRaw);
  const clientX = Number(clientXRaw);
  const clientY = Number(clientYRaw);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return {
    x: clientX - Number(rect.left || 0),
    y: clientY - Number(rect.top || 0),
  };
}

function hitTestRenderable(renderableRaw, pointRaw) {
  const renderable = asObject(renderableRaw);
  const point = asObject(pointRaw);
  const elements = [...asArray(renderable.elements)].reverse();
  for (const elementRaw of elements) {
    const element = asObject(elementRaw);
    if (pointInRect(point, element)) {
      return { id: toText(element.id), kind: "element" };
    }
  }
  const edges = [...asArray(renderable.edges)].reverse();
  for (const edgeRaw of edges) {
    const edge = asObject(edgeRaw);
    const points = asArray(edge.points);
    for (let idx = 0; idx < points.length - 1; idx += 1) {
      const distance = distancePointToSegment(point, points[idx], points[idx + 1]);
      if (distance <= 8) {
        return { id: toText(edge.id), kind: "edge" };
      }
    }
  }
  return null;
}

export default function useHybridSelectionController({
  enabled = true,
  modeEffective,
  uiLocked,
  overlayRect,
  renderable,
  docLive,
  isEditableTarget,
  onDeleteIds,
  onRequestEditSelected,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedIdsRef = useRef([]);
  const onDeleteIdsRef = useRef(onDeleteIds);
  const onRequestEditSelectedRef = useRef(onRequestEditSelected);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    onDeleteIdsRef.current = onDeleteIds;
  }, [onDeleteIds]);

  useEffect(() => {
    onRequestEditSelectedRef.current = onRequestEditSelected;
  }, [onRequestEditSelected]);

  useEffect(() => {
    const validIds = new Set([
      ...asArray(docLive?.elements).map((rowRaw) => toText(asObject(rowRaw).id)),
      ...asArray(docLive?.edges).map((rowRaw) => toText(asObject(rowRaw).id)),
    ]);
    setSelectedIds((prevRaw) => normalizeIds(prevRaw).filter((id) => validIds.has(id)));
  }, [docLive]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primarySelectedId = toText(selectedIds[0]);

  const replaceSelection = useCallback((idsRaw) => {
    setSelectedIds(normalizeIds(idsRaw));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const selectOnly = useCallback((idRaw) => {
    const id = toText(idRaw);
    setSelectedIds(id ? [id] : []);
  }, []);

  const toggleSelection = useCallback((idRaw) => {
    const id = toText(idRaw);
    if (!id) return;
    setSelectedIds((prevRaw) => {
      const prev = normalizeIds(prevRaw);
      if (prev.includes(id)) return prev.filter((row) => row !== id);
      return [...prev, id];
    });
  }, []);

  const removeIdsFromSelection = useCallback((idsRaw) => {
    const ids = new Set(normalizeIds(idsRaw));
    if (!ids.size) return;
    setSelectedIds((prevRaw) => normalizeIds(prevRaw).filter((id) => !ids.has(id)));
  }, []);

  const selectFromPointerEvent = useCallback((idRaw, event) => {
    const id = toText(idRaw);
    if (!id) return;
    // P0 contract: keep selection deterministic (single-select).
    // Multi-select can be reintroduced later with explicit UX.
    selectOnly(id);
  }, [selectOnly]);

  const hitTestAtClientPoint = useCallback((clientXRaw, clientYRaw) => {
    const point = toLocalPoint(clientXRaw, clientYRaw, overlayRect);
    if (!point) return null;
    return hitTestRenderable(renderable, point);
  }, [overlayRect, renderable]);

  const deleteSelected = useCallback((idsOverrideRaw = null) => {
    const ids = normalizeIds(idsOverrideRaw ?? selectedIdsRef.current);
    if (!ids.length || typeof onDeleteIdsRef.current !== "function") return false;
    const changed = onDeleteIdsRef.current(ids);
    if (!changed) return false;
    removeIdsFromSelection(ids);
    return true;
  }, [removeIdsFromSelection]);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return undefined;
    const onKeyDown = (event) => {
      const targetTag = toText(event?.target?.tagName).toLowerCase();
      if (typeof isEditableTarget === "function" && isEditableTarget(event?.target) && targetTag !== "select") return;
      if (modeEffective !== "edit" || uiLocked) return;
      const key = String(event?.key || "");
      if (key === "Enter") {
        const edited = typeof onRequestEditSelectedRef.current === "function"
          ? onRequestEditSelectedRef.current(primarySelectedId)
          : false;
        if (!edited) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (key !== "Delete" && key !== "Backspace") return;
      if (!deleteSelected()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [deleteSelected, enabled, isEditableTarget, modeEffective, primarySelectedId, uiLocked]);

  return {
    selectedIds,
    selectedIdSet,
    selectionCount: selectedIds.length,
    primarySelectedId,
    replaceSelection,
    clearSelection,
    selectOnly,
    toggleSelection,
    removeIdsFromSelection,
    selectFromPointerEvent,
    hitTestAtClientPoint,
    deleteSelected,
  };
}
