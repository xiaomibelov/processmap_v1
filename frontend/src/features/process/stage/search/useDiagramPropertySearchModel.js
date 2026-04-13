import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function normalizeLoose(value) {
  return toText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function toTypeLabel(typeRaw) {
  const type = toText(typeRaw);
  if (!type) return "";
  const short = toText(type.split(":").pop());
  return short || type;
}

export function normalizeDiagramPropertySearchEntry(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  const elementId = toText(item.elementId || item.id || item.bpmnId);
  if (!elementId) return null;
  const propertyName = toText(item.propertyName || item.name);
  const propertyValue = toText(item.propertyValue || item.value);
  if (!propertyName && !propertyValue) return null;

  const elementType = toText(item.elementType || item.type || item.bpmnType);
  const elementTypeLabel = toTypeLabel(item.elementTypeLabel || item.typeLabel || elementType);
  const elementTitle = toText(item.elementTitle || item.title || item.elementName || elementId) || elementId;
  const propertyIndex = Number(item.propertyIndex);
  const entryKey = toText(item.searchId || item.entryKey) || [
    elementId,
    Number.isFinite(propertyIndex) ? `idx_${Math.max(0, Math.trunc(propertyIndex))}` : "",
    normalizeLoose(propertyName),
    normalizeLoose(propertyValue),
  ].filter(Boolean).join("::");
  const searchText = [
    propertyName,
    propertyValue,
  ]
    .map((part) => normalizeLoose(part))
    .filter(Boolean)
    .join(" ");

  return {
    entryKey,
    elementId,
    elementTitle,
    elementType,
    elementTypeLabel,
    propertyName,
    propertyValue,
    searchText,
  };
}

export function collectDiagramPropertySearchResults(entriesRaw, queryRaw) {
  const query = normalizeLoose(queryRaw);
  if (!query) return [];
  const out = [];
  asArray(entriesRaw).forEach((raw, index) => {
    const item = normalizeDiagramPropertySearchEntry(raw);
    if (!item || !item.searchText.includes(query)) return;
    out.push({
      ...item,
      searchId: `${item.entryKey || item.elementId}::row_${index}`,
    });
  });
  return out;
}

export default function useDiagramPropertySearchModel({
  entries = [],
  isOpen = false,
  onOpenChange = null,
} = {}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeSearchIdRef = useRef("");
  const hasQuery = normalizeLoose(query).length > 0;
  const results = useMemo(
    () => collectDiagramPropertySearchResults(entries, query),
    [entries, query],
  );
  const activeResult = activeIndex >= 0 && activeIndex < results.length ? results[activeIndex] : null;

  useEffect(() => {
    if (isOpen) return;
    setQuery("");
    setActiveIndex(-1);
    activeSearchIdRef.current = "";
  }, [isOpen]);

  useEffect(() => {
    const activeSearchId = toText(activeSearchIdRef.current);
    if (!results.length) {
      setActiveIndex(-1);
      activeSearchIdRef.current = "";
      return;
    }
    if (activeSearchId) {
      const nextIndex = results.findIndex((item) => item.searchId === activeSearchId);
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex);
        return;
      }
    }
    setActiveIndex((prev) => (prev >= 0 && prev < results.length ? prev : 0));
  }, [results]);

  useEffect(() => {
    activeSearchIdRef.current = toText(activeResult?.searchId);
  }, [activeResult?.searchId]);

  const setOpen = useCallback((next) => {
    if (typeof onOpenChange === "function") {
      onOpenChange(next === true);
    }
  }, [onOpenChange]);

  const open = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const toggle = useCallback(() => {
    setOpen(!isOpen);
  }, [isOpen, setOpen]);

  const selectIndex = useCallback((indexRaw) => {
    if (!results.length) return null;
    const index = Number(indexRaw);
    if (!Number.isFinite(index)) return null;
    const nextIndex = Math.max(0, Math.min(results.length - 1, Math.trunc(index)));
    setActiveIndex(nextIndex);
    return results[nextIndex] || null;
  }, [results]);

  const next = useCallback(() => {
    if (!results.length) return null;
    let nextIndex = 0;
    setActiveIndex((prev) => {
      nextIndex = prev >= 0 ? (prev + 1) % results.length : 0;
      return nextIndex;
    });
    return results[nextIndex] || null;
  }, [results]);

  const prev = useCallback(() => {
    if (!results.length) return null;
    let nextIndex = 0;
    setActiveIndex((prevIndex) => {
      nextIndex = prevIndex >= 0
        ? (prevIndex - 1 + results.length) % results.length
        : Math.max(results.length - 1, 0);
      return nextIndex;
    });
    return results[nextIndex] || null;
  }, [results]);

  const reset = useCallback(() => {
    setQuery("");
    setActiveIndex(-1);
    activeSearchIdRef.current = "";
  }, []);

  return {
    isOpen: isOpen === true,
    setOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    hasQuery,
    results,
    activeIndex,
    activeResult,
    selectIndex,
    next,
    prev,
    reset,
  };
}
