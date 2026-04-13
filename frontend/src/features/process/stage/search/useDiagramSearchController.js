import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import useDiagramSearchModel from "./useDiagramSearchModel.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function toSearchIdList(resultsRaw) {
  return asArray(resultsRaw)
    .map((item) => toText(item?.elementId || item?.id))
    .filter(Boolean);
}

export default function useDiagramSearchController({
  bpmnRef,
  requestDiagramFocus,
  sessionId = "",
  reloadKey = 0,
  diagramXml = "",
  mutationVersion = 0,
  isOpen = false,
  setOpen = null,
  isEnabled = true,
} = {}) {
  const [elements, setElements] = useState([]);
  const lastSessionIdRef = useRef(toText(sessionId));

  const refreshElements = useCallback(() => {
    if (!isEnabled) {
      setElements([]);
      return [];
    }
    const rows = asArray(bpmnRef?.current?.listSearchableElements?.());
    setElements(rows);
    return rows;
  }, [bpmnRef, isEnabled]);

  const model = useDiagramSearchModel({
    elements,
    isOpen,
    onOpenChange: setOpen,
  });

  const focusResult = useCallback((result, source = "search") => {
    const elementId = toText(result?.elementId);
    if (!elementId) return;
    requestDiagramFocus?.(elementId, {
      source: `diagram_search_${source}`,
      clearExistingSelection: true,
      centerInViewport: true,
    });
  }, [requestDiagramFocus]);

  const next = useCallback(() => {
    if (!model.results.length) return null;
    const nextIndex = model.activeIndex >= 0
      ? (model.activeIndex + 1) % model.results.length
      : 0;
    const result = model.selectIndex(nextIndex);
    if (result) focusResult(result, "next");
    return result;
  }, [focusResult, model]);

  const prev = useCallback(() => {
    if (!model.results.length) return null;
    const nextIndex = model.activeIndex >= 0
      ? (model.activeIndex - 1 + model.results.length) % model.results.length
      : Math.max(model.results.length - 1, 0);
    const result = model.selectIndex(nextIndex);
    if (result) focusResult(result, "prev");
    return result;
  }, [focusResult, model]);

  const selectIndex = useCallback((indexRaw) => {
    const result = model.selectIndex(indexRaw);
    if (result) focusResult(result, "row");
    return result;
  }, [focusResult, model]);

  useEffect(() => {
    if (!isEnabled || !isOpen) return;
    refreshElements();
  }, [isEnabled, isOpen, refreshElements, mutationVersion, diagramXml, reloadKey]);

  useEffect(() => {
    const normalizedSessionId = toText(sessionId);
    if (lastSessionIdRef.current === normalizedSessionId) return;
    lastSessionIdRef.current = normalizedSessionId;
    setElements([]);
    model.reset();
    if (typeof setOpen === "function") setOpen(false);
    bpmnRef?.current?.clearSearchHighlights?.();
  }, [bpmnRef, model, sessionId, setOpen]);

  const searchIds = useMemo(
    () => toSearchIdList(model.results),
    [model.results],
  );

  useEffect(() => {
    if (!isEnabled || !isOpen || !model.hasQuery || !searchIds.length) {
      bpmnRef?.current?.clearSearchHighlights?.();
      return;
    }
    bpmnRef?.current?.setSearchHighlights?.({
      matchElementIds: searchIds,
      activeElementId: toText(model.activeResult?.elementId),
    });
  }, [
    bpmnRef,
    isEnabled,
    isOpen,
    model.activeResult?.elementId,
    model.hasQuery,
    searchIds,
  ]);

  useEffect(() => () => {
    bpmnRef?.current?.clearSearchHighlights?.();
  }, [bpmnRef]);

  return {
    ...model,
    next,
    prev,
    selectIndex,
    refreshElements,
  };
}
