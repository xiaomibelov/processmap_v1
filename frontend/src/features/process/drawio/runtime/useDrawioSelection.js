import { useCallback, useEffect, useRef, useState } from "react";
import { traceDrawioRuntime } from "./drawioRuntimeProbes.js";

function normalizeSelectionId(valueRaw) {
  return String(valueRaw || "").trim();
}

function shouldClearSelectionMissing(selectedIdRaw, elementMap) {
  const selectedId = normalizeSelectionId(selectedIdRaw);
  if (!selectedId) return false;
  return !elementMap.has(selectedId);
}

function shouldClearSelectionInvisible({
  selectedId,
  resolveElementFlags,
  meta,
  layerMap,
  elementMap,
}) {
  const activeId = normalizeSelectionId(selectedId);
  if (!activeId) return false;
  const flags = resolveElementFlags(activeId, meta, layerMap, elementMap);
  return flags.visible !== true;
}

export default function useDrawioSelection({
  elementMap,
  layerMap,
  meta,
  resolveElementFlags,
  onSelectionChange,
}) {
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");

  useEffect(() => {
    selectedIdRef.current = normalizeSelectionId(selectedId);
  }, [selectedId]);

  const clearSelection = useCallback((reason = "manual_clear") => {
    const activeId = normalizeSelectionId(selectedIdRef.current);
    if (!activeId) return;
    traceDrawioRuntime("drawio_selection_cleared", {
      selectedId: activeId,
      reason,
    });
    selectedIdRef.current = "";
    setSelectedId("");
    onSelectionChange?.("");
  }, [onSelectionChange]);

  const selectElement = useCallback((elementIdRaw) => {
    const elementId = normalizeSelectionId(elementIdRaw);
    if (!elementId) {
      clearSelection("select_empty");
      return;
    }
    if (selectedIdRef.current === elementId) return;
    selectedIdRef.current = elementId;
    setSelectedId(elementId);
    onSelectionChange?.(elementId);
  }, [clearSelection, onSelectionChange]);

  useEffect(() => {
    const activeId = normalizeSelectionId(selectedIdRef.current);
    if (!activeId) return;
    if (shouldClearSelectionMissing(activeId, elementMap)) {
      traceDrawioRuntime("drawio_selection_cleared_missing_element", {
        selectedId: activeId,
      });
      clearSelection("missing_element");
    }
  }, [clearSelection, elementMap]);

  useEffect(() => {
    const activeId = normalizeSelectionId(selectedIdRef.current);
    if (!activeId) return;
    if (!shouldClearSelectionInvisible({
      selectedId: activeId,
      resolveElementFlags,
      meta,
      layerMap,
      elementMap,
    })) return;
    traceDrawioRuntime("drawio_selection_cleared_not_visible", {
      selectedId: activeId,
    });
    clearSelection("not_visible");
  }, [clearSelection, elementMap, layerMap, meta, resolveElementFlags]);

  return {
    selectedId,
    selectedIdRef,
    selectElement,
    clearSelection,
  };
}

export {
  normalizeSelectionId,
  shouldClearSelectionMissing,
  shouldClearSelectionInvisible,
};
