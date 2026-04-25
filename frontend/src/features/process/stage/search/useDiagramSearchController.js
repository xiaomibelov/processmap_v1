import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import useDiagramSearchModel from "./useDiagramSearchModel.js";
import useDiagramPropertySearchModel from "./useDiagramPropertySearchModel.js";

const PROPERTY_REFRESH_RETRY_LIMIT = 5;
const PROPERTY_REFRESH_RETRY_DELAY_MS = 80;

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

function normalizeSearchMode(modeRaw) {
  return toText(modeRaw).toLowerCase() === "properties" ? "properties" : "elements";
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
  const [properties, setProperties] = useState([]);
  const [mode, setModeState] = useState("elements");
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

  const refreshProperties = useCallback(() => {
    if (!isEnabled) {
      setProperties([]);
      return [];
    }
    const rows = asArray(bpmnRef?.current?.listSearchableProperties?.());
    setProperties(rows);
    return rows;
  }, [bpmnRef, isEnabled]);

  const elementModel = useDiagramSearchModel({
    elements,
    isOpen,
    onOpenChange: setOpen,
  });
  const propertyModel = useDiagramPropertySearchModel({
    entries: properties,
    isOpen,
    onOpenChange: setOpen,
  });
  const activeModel = mode === "properties" ? propertyModel : elementModel;

  const setMode = useCallback((nextMode) => {
    setModeState(normalizeSearchMode(nextMode));
  }, []);

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
    if (!activeModel.results.length) return null;
    const nextIndex = activeModel.activeIndex >= 0
      ? (activeModel.activeIndex + 1) % activeModel.results.length
      : 0;
    const result = activeModel.selectIndex(nextIndex);
    if (result) focusResult(result, "next");
    return result;
  }, [activeModel, focusResult]);

  const prev = useCallback(() => {
    if (!activeModel.results.length) return null;
    const nextIndex = activeModel.activeIndex >= 0
      ? (activeModel.activeIndex - 1 + activeModel.results.length) % activeModel.results.length
      : Math.max(activeModel.results.length - 1, 0);
    const result = activeModel.selectIndex(nextIndex);
    if (result) focusResult(result, "prev");
    return result;
  }, [activeModel, focusResult]);

  const selectIndex = useCallback((indexRaw) => {
    const result = activeModel.selectIndex(indexRaw);
    if (result) focusResult(result, "row");
    return result;
  }, [activeModel, focusResult]);

  useEffect(() => {
    if (!isEnabled || !isOpen) return;
    if (mode === "properties") {
      refreshProperties();
      return;
    }
    refreshElements();
  }, [
    isEnabled,
    isOpen,
    mode,
    refreshElements,
    refreshProperties,
    mutationVersion,
    diagramXml,
    reloadKey,
  ]);

  useEffect(() => {
    if (!isEnabled || !isOpen || mode !== "properties" || !propertyModel.hasQuery) return;
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    const retryRefresh = () => {
      if (cancelled) return;
      const rows = refreshProperties();
      attempts += 1;
      if (rows.length || attempts >= PROPERTY_REFRESH_RETRY_LIMIT) return;
      timer = globalThis.setTimeout(retryRefresh, PROPERTY_REFRESH_RETRY_DELAY_MS);
    };
    retryRefresh();
    return () => {
      cancelled = true;
      if (timer) globalThis.clearTimeout(timer);
    };
  }, [
    isEnabled,
    isOpen,
    mode,
    propertyModel.hasQuery,
    propertyModel.query,
    refreshProperties,
  ]);

  useEffect(() => {
    const normalizedSessionId = toText(sessionId);
    if (lastSessionIdRef.current === normalizedSessionId) return;
    lastSessionIdRef.current = normalizedSessionId;
    setElements([]);
    setProperties([]);
    setModeState("elements");
    elementModel.reset();
    propertyModel.reset();
    if (typeof setOpen === "function") setOpen(false);
    bpmnRef?.current?.clearSearchHighlights?.();
  }, [bpmnRef, elementModel, propertyModel, sessionId, setOpen]);

  const searchIds = useMemo(
    () => toSearchIdList(elementModel.results),
    [elementModel.results],
  );

  useEffect(() => {
    const activeElementId = toText(activeModel.activeResult?.elementId);
    if (!isEnabled || !isOpen || !activeModel.hasQuery || !activeModel.results.length || !activeElementId) {
      bpmnRef?.current?.clearSearchHighlights?.();
      return;
    }
    if (mode === "properties") {
      bpmnRef?.current?.setSearchHighlights?.({
        matchElementIds: [],
        activeElementId,
      });
      return;
    }
    if (!searchIds.length) {
      bpmnRef?.current?.clearSearchHighlights?.();
      return;
    }
    bpmnRef?.current?.setSearchHighlights?.({
      matchElementIds: searchIds,
      activeElementId,
    });
  }, [
    activeModel.activeResult?.elementId,
    activeModel.hasQuery,
    activeModel.results.length,
    bpmnRef,
    isEnabled,
    isOpen,
    mode,
    searchIds,
  ]);

  useEffect(() => {
    if (isOpen) return;
    setModeState("elements");
  }, [isOpen]);

  useEffect(() => () => {
    bpmnRef?.current?.clearSearchHighlights?.();
  }, [bpmnRef]);

  return {
    isOpen: activeModel.isOpen,
    setOpen: activeModel.setOpen,
    open: activeModel.open,
    close: activeModel.close,
    toggle: activeModel.toggle,
    query: activeModel.query,
    setQuery: activeModel.setQuery,
    hasQuery: activeModel.hasQuery,
    results: activeModel.results,
    activeIndex: activeModel.activeIndex,
    activeResult: activeModel.activeResult,
    mode,
    setMode,
    next,
    prev,
    selectIndex,
    refreshElements,
    refreshProperties,
  };
}
