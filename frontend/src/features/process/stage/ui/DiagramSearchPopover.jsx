function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export default function DiagramSearchPopover({
  open = false,
  popoverRef = null,
  query = "",
  onQueryChange = null,
  results = [],
  activeIndex = -1,
  onPrev = null,
  onNext = null,
  onSelect = null,
  onClose = null,
} = {}) {
  if (!open) return null;
  const rows = asArray(results);
  const hasQuery = toText(query).length > 0;

  return (
    <div className="diagramActionPopover diagramActionPopover--search" ref={popoverRef} data-testid="diagram-action-search-popover">
      <div className="diagramActionPopoverHead">
        <span>Поиск на диаграмме</span>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={() => onClose?.()}
        >
          Закрыть
        </button>
      </div>

      <div className="diagramActionField">
        <span>Запрос</span>
        <input
          type="text"
          className="input h-8 min-h-0 text-xs"
          value={query}
          onChange={(event) => onQueryChange?.(toText(event.target.value))}
          placeholder="id / name / label / type"
          data-testid="diagram-action-search-input"
        />
      </div>

      <div className="diagramIssueRow">
        <span data-testid="diagram-action-search-count">Найдено: {rows.length}</span>
        <span className="diagramIssueChip" data-testid="diagram-action-search-active-index">
          {rows.length > 0 ? `${Math.max(activeIndex + 1, 1)} / ${rows.length}` : "0 / 0"}
        </span>
      </div>

      <div className="diagramActionPopoverActions">
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={() => onPrev?.()}
          disabled={rows.length <= 0}
          data-testid="diagram-action-search-prev"
        >
          Prev
        </button>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={() => onNext?.()}
          disabled={rows.length <= 0}
          data-testid="diagram-action-search-next"
        >
          Next
        </button>
      </div>

      <div className="diagramIssueListWrap mt-1">
        {!hasQuery ? (
          <div className="diagramActionPopoverEmpty">Введите текст для поиска по id/name/label/type.</div>
        ) : rows.length === 0 ? (
          <div className="diagramActionPopoverEmpty">Совпадений нет.</div>
        ) : (
          <div className="diagramIssueList" data-testid="diagram-action-search-results">
            {rows.slice(0, 240).map((row, index) => {
              const elementId = toText(row?.elementId || row?.id);
              const title = toText(row?.title || row?.name || elementId) || elementId;
              const typeLabel = toText(row?.typeLabel || row?.type);
              const label = toText(row?.label);
              const active = index === activeIndex;
              return (
                <button
                  key={`diagram_search_row_${elementId}`}
                  type="button"
                  className={`diagramIssueListItem ${active ? "ring-1 ring-accent/60" : ""}`}
                  onClick={() => onSelect?.(index)}
                  title={`${title} · ${elementId}`}
                  data-testid="diagram-action-search-row"
                >
                  <span className="diagramIssueListItemTitle">{title}</span>
                  <span className="diagramIssueListItemMeta">{elementId}</span>
                  <span className="diagramIssueListItemChips">
                    {typeLabel ? <span className="diagramIssueChip">{typeLabel}</span> : null}
                    {label ? <span className="diagramIssueChip">label</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
