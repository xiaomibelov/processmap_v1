function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function groupSearchRows(rowsRaw) {
  const groups = [];
  const byKey = new Map();
  asArray(rowsRaw).forEach((row, index) => {
    const key = toText(row?.searchGroupKey) || "main";
    const label = toText(row?.searchGroupLabel) || "Основной процесс";
    if (!byKey.has(key)) {
      const group = { key, label, rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).rows.push({ row, index });
  });
  return groups;
}

export default function DiagramSearchPopover({
  open = false,
  popoverRef = null,
  mode = "elements",
  onModeChange = null,
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
  const modeKey = toText(mode).toLowerCase() === "properties" ? "properties" : "elements";
  const isPropertiesMode = modeKey === "properties";
  const queryPlaceholder = isPropertiesMode
    ? "название или значение свойства"
    : "id, название, метка или тип";
  const emptyPrompt = isPropertiesMode
    ? "Введите название или значение свойства."
    : "Введите запрос: название, id, тип элемента или значение свойства.";
  const groupedRows = groupSearchRows(rows.slice(0, 240));

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

      <div className="diagramActionPopoverActions">
        <button
          type="button"
          className={`secondaryBtn h-7 px-2 text-[11px] ${modeKey === "elements" ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => onModeChange?.("elements")}
          data-testid="diagram-action-search-mode-elements"
        >
          Элементы
        </button>
        <button
          type="button"
          className={`secondaryBtn h-7 px-2 text-[11px] ${modeKey === "properties" ? "ring-1 ring-accent/60" : ""}`}
          onClick={() => onModeChange?.("properties")}
          data-testid="diagram-action-search-mode-properties"
        >
          Свойства
        </button>
      </div>

      <div className="diagramActionField">
        <span>Запрос</span>
        <input
          type="text"
          className="input h-8 min-h-0 text-xs"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={queryPlaceholder}
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
          <div className="diagramActionPopoverEmpty">{emptyPrompt}</div>
        ) : rows.length === 0 ? (
          <div className="diagramActionPopoverEmpty">Совпадений не найдено.</div>
        ) : (
          <div className="diagramIssueList" data-testid="diagram-action-search-results">
            {groupedRows.map((group) => (
              <div key={`diagram_search_group_${group.key}`} className="diagramIssueListGroup" data-testid="diagram-action-search-group">
                <div className="diagramIssueListGroupHeader" data-testid="diagram-action-search-group-header">
                  <span className="diagramIssueListGroupLabel">{group.label}</span>
                  <span className="diagramIssueChip">{group.rows.length}</span>
                </div>
                {group.rows.map(({ row, index }) => {
                  const elementId = toText(row?.elementId || row?.id);
                  const active = index === activeIndex;
                  const subprocessPathLabel = toText(row?.subprocessPathLabel);
                  if (isPropertiesMode) {
                    const propertyName = toText(row?.propertyName || row?.name);
                    const propertyValue = toText(row?.propertyValue || row?.value);
                    const elementTitle = toText(row?.elementTitle || row?.title || elementId) || elementId;
                    const typeLabel = toText(row?.elementTypeLabel || row?.typeLabel || row?.elementType || row?.type);
                    const key = toText(row?.searchId || `${elementId}::${index}`);
                    return (
                      <button
                        key={`diagram_property_search_row_${key}`}
                        type="button"
                        className={`diagramIssueListItem ${active ? "ring-1 ring-accent/60" : ""}`}
                        onClick={() => onSelect?.(index)}
                        title={`${propertyName || "(без имени)"} = ${propertyValue || "(пусто)"} · ${elementTitle} · ${elementId}`}
                        data-testid="diagram-action-search-row"
                      >
                        <span className="diagramIssueListItemTitle">{propertyName || "(без имени)"}</span>
                        <span className="diagramIssueListItemMeta">{propertyValue || "(пусто)"}</span>
                        <span className="diagramIssueListItemMeta">{elementTitle} · {elementId}</span>
                        {subprocessPathLabel ? <span className="diagramIssueListItemMeta">{subprocessPathLabel}</span> : null}
                        <span className="diagramIssueListItemChips">
                          {typeLabel ? <span className="diagramIssueChip">{typeLabel}</span> : null}
                          <span className="diagramIssueChip">property</span>
                        </span>
                      </button>
                    );
                  }
                  const title = toText(row?.title || row?.name || elementId) || elementId;
                  const typeLabel = toText(row?.typeLabel || row?.type);
                  const label = toText(row?.label);
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
                      {subprocessPathLabel ? <span className="diagramIssueListItemMeta">{subprocessPathLabel}</span> : null}
                      <span className="diagramIssueListItemChips">
                        {typeLabel ? <span className="diagramIssueChip">{typeLabel}</span> : null}
                        {label ? <span className="diagramIssueChip">label</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
