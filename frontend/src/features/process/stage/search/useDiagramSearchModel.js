import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeDiagramSearchProcessContext } from "./diagramSearchHierarchy.js";

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

export function normalizeDiagramSearchElement(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  const elementId = toText(item.elementId || item.id || item.bpmnId);
  if (!elementId) return null;
  const name = toText(item.name);
  const label = toText(item.label);
  const type = toText(item.type || item.bpmnType);
  const typeLabel = toTypeLabel(item.typeLabel || type);
  const title = toText(item.title || label || name || elementId) || elementId;
  const effectiveLabel = normalizeLoose(label) === normalizeLoose(name) ? "" : label;
  const searchText = [
    elementId,
    name,
    effectiveLabel,
    type,
    typeLabel,
    title,
  ]
    .map((part) => normalizeLoose(part))
    .filter(Boolean)
    .join(" ");
  const processContext = normalizeDiagramSearchProcessContext(item);
  return {
    elementId,
    name,
    label: effectiveLabel,
    type,
    typeLabel,
    title,
    searchText,
    ...processContext,
  };
}

export function collectDiagramSearchResults(elementsRaw, queryRaw) {
  const query = normalizeLoose(queryRaw);
  if (!query) return [];
  const out = [];
  const seen = new Set();
  asArray(elementsRaw).forEach((raw) => {
    const item = normalizeDiagramSearchElement(raw);
    if (!item || seen.has(item.elementId)) return;
    seen.add(item.elementId);
    if (!item.searchText.includes(query)) return;
    out.push(item);
  });
  return out;
}

export default function useDiagramSearchModel({
  elements = [],
  isOpen = false,
  onOpenChange = null,
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeElementIdRef = useRef("");
  const hasQuery = normalizeLoose(query).length > 0;
  const results = useMemo(
    () => collectDiagramSearchResults(elements, query),
    [elements, query],
  );
  const activeResult = activeIndex >= 0 && activeIndex < results.length ? results[activeIndex] : null;

  useEffect(() => {
    if (isOpen) return;
    setQuery("");
    setActiveIndex(-1);
    activeElementIdRef.current = "";
  }, [isOpen]);

  useEffect(() => {
    const activeElementId = toText(activeElementIdRef.current);
    if (!results.length) {
      setActiveIndex(-1);
      activeElementIdRef.current = "";
      return;
    }
    if (activeElementId) {
      const nextIndex = results.findIndex((item) => item.elementId === activeElementId);
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex);
        return;
      }
    }
    setActiveIndex((prev) => (prev >= 0 && prev < results.length ? prev : 0));
  }, [results]);

  useEffect(() => {
    activeElementIdRef.current = toText(activeResult?.elementId);
  }, [activeResult?.elementId]);

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
    activeElementIdRef.current = "";
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
