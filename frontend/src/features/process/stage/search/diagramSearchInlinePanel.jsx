import DiagramSearchTypeIcon from "./DiagramSearchTypeIcon.jsx";
import {
  SEARCH_RESULTS_CAP,
  groupSearchRows,
} from "./diagramSearchGroups.js";
import { isSubprocessSearchRow } from "./diagramSearchInlineModel.js";

function toText(value) {
  return String(value || "").trim();
}

function SearchResultRow({
  row,
  index,
  isPropertiesMode,
  active,
  onSelect,
  onMouseDown,
}) {
  const elementId = toText(row?.elementId || row?.id);
  const title = isPropertiesMode
    ? toText(row?.propertyName || row?.name)
    : toText(row?.title || row?.name || elementId) || elementId;
  const meta = isPropertiesMode
    ? `${toText(row?.propertyValue) || "(пусто)"} · ${toText(row?.elementTitle || row?.title || elementId) || elementId}`
    : elementId;
  const typeLabel = isPropertiesMode
    ? toText(row?.elementTypeLabel || row?.elementType || row?.type)
    : toText(row?.typeLabel || row?.type);
  const subprocessPathLabel = toText(row?.subprocessPathLabel);
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
      <DiagramSearchTypeIcon
        type={isPropertiesMode ? row?.elementType : row?.type}
      />
      <span className="diagramSearchInlineItemBody">
        <span className="diagramSearchInlineItemTitle">{title}</span>
        <span className="diagramSearchInlineItemMeta">
          {subprocessPathLabel ? `${subprocessPathLabel} · ` : ""}
          {meta}
        </span>
      </span>
      <span className="diagramSearchInlineItemChips">
        {typeLabel ? <span className="diagramIssueChip">{typeLabel}</span> : null}
        {isPropertiesMode ? <span className="diagramIssueChip">property</span> : <span className="diagramIssueChip">Элемент</span>}
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

export default function DiagramSearchInlinePanel({
  results = [],
  activeIndex = -1,
  mode = "elements",
  pending = false,
  onSelect = null,
}) {
  const rows = groupSearchRows(results.slice(0, SEARCH_RESULTS_CAP));
  const isPropertiesMode = toText(mode).toLowerCase() === "properties";
  const hasResults = rows.length > 0;
  const status = pending
    ? "поиск…"
    : `${results.length} найдено`;

  const statusChip = pending ? (
    <span className="diagramIssueChip" data-testid="diagram-action-search-pending">поиск…</span>
  ) : null;

  const handleRowMouseDown = (event) => {
    // Keep focus in the input while clicking a result; click still fires after mouseup.
    event.preventDefault();
  };

  return (
    <div className="diagramSearchInlinePanel" data-testid="diagram-action-search-results">
      <div className="diagramSearchInlinePanelHead">
        <span className="inline-flex items-center gap-1.5" data-testid="diagram-action-search-count">
          {status}
          {statusChip}
        </span>
        <span className="diagramIssueChip" data-testid="diagram-action-search-active-index">
          {results.length > 0 ? `${Math.max(activeIndex + 1, 1)} / ${results.length}` : "0 / 0"}
        </span>
      </div>
      {!hasResults ? (
        <div className="diagramSearchInlineEmpty">Ничего не найдено.</div>
      ) : (
        <div className="diagramSearchInlineList">
          {rows.map((group) => (
            <div key={`inline_search_group_${group.key}`} className="diagramIssueListGroup" data-testid="diagram-action-search-group">
              <div className="diagramIssueListGroupHeader" data-testid="diagram-action-search-group-header">
                <span className="diagramIssueListGroupLabel">{group.label}</span>
                <span className="diagramIssueChip">{group.rows.length}</span>
              </div>
              {group.rows.map(({ row, index }) => (
                <SearchResultRow
                  key={`inline_search_row_${toText(row?.searchId || row?.elementId || index)}_${index}`}
                  row={row}
                  index={index}
                  isPropertiesMode={isPropertiesMode}
                  active={index === activeIndex}
                  onSelect={onSelect}
                  onMouseDown={handleRowMouseDown}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
