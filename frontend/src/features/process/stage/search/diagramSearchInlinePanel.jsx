import { useEffect, useMemo, useRef, useState } from "react";

import DiagramSearchTypeIcon from "./DiagramSearchTypeIcon.jsx";
import {
  SEARCH_RESULTS_CAP,
  groupSearchRows,
} from "./diagramSearchGroups.js";
import { isSubprocessSearchRow } from "./diagramSearchInlineModel.js";

function toText(value) {
  return String(value || "").trim();
}

function getTypeChip(mode, row) {
  const isPropertiesMode = toText(mode).toLowerCase() === "properties";
  if (isPropertiesMode) return "property";
  const typeLabel = toText(row?.typeLabel || row?.type);
  if (typeLabel) return typeLabel;
  return "Элемент";
}

function ResultItem({
  row,
  index,
  mode,
  active,
  onSelect,
  onMouseDown,
}) {
  const elementId = toText(row?.elementId || row?.id);
  const isPropertiesMode = toText(mode).toLowerCase() === "properties";

  let title;
  let context;
  let propertyLine;

  if (isPropertiesMode) {
    title = toText(row?.elementTitle || row?.title || row?.name || elementId) || elementId;
    const propName = toText(row?.propertyName || row?.name);
    const propValue = toText(row?.propertyValue || row?.value);
    propertyLine = `${propName || "(без имени)"}: ${propValue || "(пусто)"}`;
    context = toText(row?.subprocessPathLabel) || "Основной процесс";
  } else {
    title = toText(row?.title || row?.name || elementId) || elementId;
    context = toText(row?.subprocessPathLabel);
  }

  const typeChip = getTypeChip(mode, row);
  const showDrill = isSubprocessSearchRow(row);

  return (
    <button
      type="button"
      className={`diagramSearchInlineItem ${active ? "isActive" : ""}`}
      onMouseDown={onMouseDown}
      onClick={() => onSelect?.(index)}
      title={title}
      data-testid="diagram-action-search-row"
    >
      <DiagramSearchTypeIcon type={isPropertiesMode ? row?.elementType : row?.type} />
      <span className="diagramSearchInlineItemBody">
        <span className="diagramSearchInlineItemTitle">{title}</span>
        {propertyLine ? (
          <span className="diagramSearchInlineItemProperty">{propertyLine}</span>
        ) : null}
        {context ? (
          <span className="diagramSearchInlineItemContext">{context}</span>
        ) : null}
      </span>
      <span className="diagramSearchInlineItemChips">
        <span className="diagramSearchInlineItemChip">{typeChip}</span>
      </span>
      {showDrill ? (
        <span
          className="diagramSearchInlineItemDrill"
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(index);
          }}
          title="Провалиться в subprocess"
          aria-label="Провалиться в subprocess"
          role="button"
        >
          →
        </span>
      ) : null}
    </button>
  );
}

function ResultGroup({
  group,
  mode,
  activeIndex,
  onSelect,
  onMouseDown,
  defaultExpanded,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = () => setExpanded((prev) => !prev);

  return (
    <div className="diagramSearchInlineGroup" data-testid="diagram-action-search-group">
      <button
        type="button"
        className="diagramSearchInlineGroupHeader"
        onClick={toggle}
        onMouseDown={onMouseDown}
        data-testid="diagram-action-search-group-header"
      >
        <span className="diagramSearchInlineGroupArrow" aria-hidden="true">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="diagramIssueListGroupLabel">{group.label}</span>
        <span className="diagramSearchInlineGroupCount">{group.rows.length}</span>
      </button>
      {expanded ? (
        <div className="diagramSearchInlineGroupBody">
          {group.rows.map(({ row, index }) => (
            <ResultItem
              key={`inline_search_row_${toText(row?.searchId || row?.elementId || index)}_${index}`}
              row={row}
              index={index}
              mode={mode}
              active={index === activeIndex}
              onSelect={onSelect}
              onMouseDown={onMouseDown}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DiagramSearchInlinePanel({
  results = [],
  activeIndex = -1,
  mode = "elements",
  pending = false,
  onSelect = null,
}) {
  const panelRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const rows = useMemo(() => groupSearchRows(results.slice(0, SEARCH_RESULTS_CAP)), [results]);
  const isPropertiesMode = toText(mode).toLowerCase() === "properties";
  const hasResults = rows.length > 0;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleRowMouseDown = (event) => {
    event.preventDefault();
  };

  const handleWheel = (event) => {
    event.stopPropagation();
  };

  return (
    <div
      ref={panelRef}
      className={`diagramSearchInlinePanel ${mounted ? "isVisible" : ""}`}
      onWheel={handleWheel}
      data-testid="diagram-action-search-results"
    >
      <div className="diagramSearchInlinePanelHead">
        <span className="diagramSearchInlinePanelCount" data-testid="diagram-action-search-count">
          {pending ? "поиск…" : `${results.length} найдено`}
        </span>
        <span className={`diagramSearchInlineModeChip ${isPropertiesMode ? "isProperties" : ""}`}>
          {isPropertiesMode ? "Свойства" : "Элементы"}
        </span>
      </div>
      {!hasResults ? (
        <div className="diagramSearchInlineEmpty">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="diagramSearchInlineEmptyIcon"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <span>Ничего не найдено</span>
        </div>
      ) : (
        <div className="diagramSearchInlineList">
          {rows.map((group, groupIndex) => (
            <ResultGroup
              key={`inline_search_group_${group.key}`}
              group={group}
              mode={mode}
              activeIndex={activeIndex}
              onSelect={onSelect}
              onMouseDown={handleRowMouseDown}
              defaultExpanded={rows.length <= 2 ? true : groupIndex === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
