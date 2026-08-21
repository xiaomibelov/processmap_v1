import { useEffect, useRef, useState } from "react";

import { createDebouncer, SEARCH_DEBOUNCE_MS } from "./debounceModel.js";
import {
  reduceInlineSearchState,
} from "./diagramSearchInlineModel.js";
import DiagramSearchModeToggle from "./diagramSearchModeToggle.jsx";
import DiagramSearchInlinePanel from "./diagramSearchInlinePanel.jsx";

function toText(value) {
  return String(value || "").trim();
}

function focusSearchTriggerButton() {
  if (typeof document === "undefined") return;
  try {
    document.querySelector('[data-testid="diagram-action-search"]')?.focus?.();
  } catch {
    // embedded contexts without DOM
  }
}

export default function DiagramSearchInlineInput({
  open = false,
  onOpenChange = null,
  containerRef = null,
  mode = "elements",
  onModeChange = null,
  query = "",
  onQueryChange = null,
  results = [],
  activeIndex = -1,
  onSelect = null,
  onMoveActive = null,
  onMoveActiveBoundary = null,
  onActivate = null,
} = {}) {
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const [draft, setDraft] = useState(query);
  const lastPushedRef = useRef(query);
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;
  const debouncerRef = useRef(null);
  if (!debouncerRef.current) {
    debouncerRef.current = createDebouncer((value) => {
      lastPushedRef.current = value;
      onQueryChangeRef.current?.(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  const hasQuery = toText(draft).length > 0;
  const pending = toText(draft) !== toText(query);

  useEffect(() => () => debouncerRef.current?.cancel(), []);

  // Sync externally-driven query changes (session switch, close/reset).
  useEffect(() => {
    if (query === lastPushedRef.current) return;
    lastPushedRef.current = query;
    setDraft(query);
  }, [query]);

  // Debounce local draft into the controller query.
  useEffect(() => {
    if (!open) return;
    if (draft === lastPushedRef.current) return;
    debouncerRef.current?.push(draft);
  }, [draft, open]);

  // Focus input when transitioning closed→open; focus trigger when open→closed.
  // Avoid stealing focus on initial mount or re-rendering while already open.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const node = inputRef.current;
      if (node && typeof node.focus === "function") node.focus();
    } else if (!open && wasOpenRef.current) {
      const node = triggerRef.current;
      if (node && typeof node.focus === "function") node.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  const handleExpand = () => {
    if (typeof onOpenChange === "function") onOpenChange(true);
  };

  const applyTransition = (event) => {
    const state = reduceInlineSearchState({ expanded: open, hasQuery }, event);
    if (state.clearQuery) {
      debouncerRef.current?.cancel();
      lastPushedRef.current = "";
      setDraft("");
      onQueryChangeRef.current?.("");
    }
    if (state.expanded !== open) {
      onOpenChange?.(state.expanded);
    }
  };

  const handleBlur = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    applyTransition("blur");
  };

  const handleInputKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onMoveActive?.(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onMoveActive?.(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onMoveActiveBoundary?.("start");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onMoveActiveBoundary?.("end");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onActivate?.("enter");
      return;
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      applyTransition("escape");
    }
  };

  const handleSelect = (index) => {
    onSelect?.(index);
    applyTransition("select");
  };

  const handleClear = () => {
    applyTransition("clear");
    const input = inputRef.current;
    if (input && typeof input.focus === "function") input.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`diagramSearchInlineBox ${open ? "isExpanded" : ""}`}
      onBlur={handleBlur}
      data-testid={open ? "diagram-action-search-popover" : undefined}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="diagramSearchInlineLeadIcon"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          className="diagramSearchInlineTrigger"
          onClick={handleExpand}
          title="Поиск элементов диаграммы (Ctrl+K)"
          data-testid="diagram-action-search"
        >
          <span className="diagramActionBtnLabel">Поиск</span>
        </button>
      ) : (
        <>
          <input
            ref={inputRef}
            id="diagram-search-query"
            name="diagram_search_query"
            type="text"
            className="diagramSearchInlineInput"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Поиск по элементам, свойствам..."
            data-testid="diagram-action-search-input"
            autoComplete="off"
          />
          {hasQuery ? (
            <button
              type="button"
              className="diagramSearchInlineClear"
              onClick={handleClear}
              title="Очистить поиск"
              data-testid="diagram-action-search-clear"
            >
              ×
            </button>
          ) : null}
          <div className="diagramSearchInlineDrop">
            <DiagramSearchModeToggle mode={mode} onModeChange={onModeChange} />
            {hasQuery ? (
              <DiagramSearchInlinePanel
                results={results}
                activeIndex={activeIndex}
                mode={mode}
                pending={pending}
                onSelect={handleSelect}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
