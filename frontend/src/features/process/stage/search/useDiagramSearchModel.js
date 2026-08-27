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
  const description = toText(item.description);
  const taskId = toText(item.taskId || item.elementId || item.id || item.bpmnId);
  const effectiveLabel = normalizeLoose(label) === normalizeLoose(name) ? "" : label;
  const searchText = [
    elementId,
    taskId,
    name,
    effectiveLabel,
    type,
    typeLabel,
    title,
    description,
  ]
    .map((part) => normalizeLoose(part))
    .filter(Boolean)
    .join(" ");
  const processContext = normalizeDiagramSearchProcessContext(item);
  return {
    elementId,
    taskId,
    name,
    label: effectiveLabel,
    type,
    typeLabel,
    title,
    description,
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

export const INSTANT_RESULTS_CAP = 10;

export default function useDiagramSearchModel({
  elements = [],
  isOpen = false,
  onOpenChange = null,
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeElementIdRef = useRef("");
  const hasQuery = normalizeLoose(query).length > 0;
  const results = useMemo(() => {
    if (!hasQuery) {
      // Instant list: show all available elements sorted by title/name when
      // the search input is focused but empty.
      return asArray(elements)
        .map(normalizeDiagramSearchElement)
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title));
    }
    return collectDiagramSearchResults(elements, query);
  }, [elements, query, hasQuery]);
  const activeResult = activeIndex >= 0 && activeIndex < results.length ? results[activeIndex] : null;

  // NOTE: closing the panel (Escape / blur / toggle) intentionally keeps the
  // query and the active index — reopening restores the previous search
  // context. Session switch resets the model explicitly via reset().

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
