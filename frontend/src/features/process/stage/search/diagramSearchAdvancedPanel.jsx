import { useMemo, useRef, useState } from "react";

import DiagramSearchTypeIcon from "./DiagramSearchTypeIcon.jsx";
import { resolveTypeIconKind } from "./diagramSearchInlineModel.js";

function toText(value) {
  return String(value || "").trim();
}

function normalizeLoose(value) {
  return toText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function isTaskElement(row) {
  const kind = resolveTypeIconKind(row?.type || row?.elementType);
  return kind === "task";
}

function matchesAdvancedQuery(row, query, mode) {
  const normalized = normalizeLoose(query);
  if (!normalized) return true;
  const isPropertiesMode = toText(mode).toLowerCase() === "properties";
  const haystack = isPropertiesMode
    ? [
        row?.propertyName,
        row?.propertyValue,
        row?.elementTitle,
        row?.elementId,
      ]
    : [
        row?.name,
        row?.title,
        row?.label,
        row?.elementId,
        row?.type,
        row?.typeLabel,
        row?.description,
        row?.taskId,
      ];
  const text = haystack.map(toText).join(" ").toLowerCase();
  return text.includes(normalized);
}

function AdvancedPropertyTag({ name, count, active, onClick }) {
  return (
    <button
      type="button"
      className={`diagramSearchAdvancedTag ${active ? "isActive" : ""}`}
      onClick={onClick}
      data-testid="diagram-action-search-advanced-property-tag"
    >
      {name}
      <span className="diagramSearchAdvancedTagCount">{count}</span>
    </button>
  );
}

function AdvancedTaskItem({ row, index, onSelect }) {
  const title = toText(row?.title || row?.name || row?.elementId) || row?.elementId;
  const typeLabel = toText(row?.typeLabel || row?.type);
  return (
    <button
      type="button"
      className="diagramSearchAdvancedTaskItem"
      onClick={() => onSelect?.(index)}
      data-testid="diagram-action-search-advanced-task"
    >
      <DiagramSearchTypeIcon type={row?.type} />
      <span className="diagramSearchAdvancedTaskTitle">{title}</span>
      {typeLabel ? (
        <span className="diagramSearchAdvancedTaskType">{typeLabel}</span>
      ) : null}
    </button>
  );
}

export default function DiagramSearchAdvancedPanel({
  results = [],
  mode = "elements",
  activeIndex = -1,
  query = "",
  onQueryChange = null,
  onSelect = null,
  onClose = null,
}) {
  const panelRef = useRef(null);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [taskPage, setTaskPage] = useState(1);
  const TASK_PAGE_SIZE = 5;

  const isPropertiesMode = toText(mode).toLowerCase() === "properties";

  const filteredResults = useMemo(
    () => results.filter((row) => matchesAdvancedQuery(row, query, mode)),
    [results, query, mode],
  );

  const propertyGroups = useMemo(() => {
    if (isPropertiesMode) return [];
    const groups = new Map();
    results.forEach((row) => {
      if (!row?.propertyName) return;
      const key = toText(row.propertyName);
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    return Array.from(groups.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [results, isPropertiesMode]);

  const visibleTasks = useMemo(() => {
    if (isPropertiesMode) return [];
    const tasks = filteredResults.filter(isTaskElement);
    return tasks.slice(0, taskPage * TASK_PAGE_SIZE);
  }, [filteredResults, isPropertiesMode, taskPage]);

  const hasMoreTasks = useMemo(() => {
    if (isPropertiesMode) return false;
    const tasks = filteredResults.filter(isTaskElement);
    return visibleTasks.length < tasks.length;
  }, [filteredResults, isPropertiesMode, visibleTasks.length]);

  const handlePropertyTagClick = (name) => {
    setPropertyFilter((prev) => (prev === name ? "" : name));
    setTaskPage(1);
  };

  const handleShowMoreTasks = () => {
    setTaskPage((prev) => prev + 1);
  };

  const handleInputChange = (event) => {
    onQueryChange?.(event.target.value);
    setTaskPage(1);
  };

  const displayedPropertyResults = useMemo(() => {
    if (!isPropertiesMode) return [];
    if (!propertyFilter) return filteredResults;
    return filteredResults.filter((row) => toText(row?.propertyName) === propertyFilter);
  }, [filteredResults, isPropertiesMode, propertyFilter]);

  return (
    <div
      ref={panelRef}
      className="diagramSearchAdvancedPanel"
      data-testid="diagram-action-search-advanced-panel"
    >
      <div className="diagramSearchAdvancedPanelHead">
        <span className="diagramSearchAdvancedPanelTitle">Расширенный поиск</span>
        <button
          type="button"
          className="diagramSearchAdvancedPanelClose"
          onClick={onClose}
          data-testid="diagram-action-search-advanced-close"
          aria-label="Закрыть расширенный поиск"
        >
          ×
        </button>
      </div>

      <input
        type="text"
        className="diagramSearchAdvancedInput"
        value={query}
        onChange={handleInputChange}
        placeholder={isPropertiesMode ? "Фильтр по свойствам..." : "Поиск по name, description, properties, task_id..."}
        data-testid="diagram-action-search-advanced-input"
        autoComplete="off"
      />

      {!isPropertiesMode && propertyGroups.length > 0 ? (
        <div className="diagramSearchAdvancedTags" data-testid="diagram-action-search-advanced-tags">
          {propertyGroups.map(({ name, count }) => (
            <AdvancedPropertyTag
              key={name}
              name={name}
              count={count}
              active={propertyFilter === name}
              onClick={() => handlePropertyTagClick(name)}
            />
          ))}
        </div>
      ) : null}

      {isPropertiesMode ? (
        <div className="diagramSearchAdvancedSection" data-testid="diagram-action-search-advanced-properties">
          <div className="diagramSearchAdvancedSectionTitle">
            Свойства ({displayedPropertyResults.length})
          </div>
          {displayedPropertyResults.length === 0 ? (
            <div className="diagramSearchAdvancedEmpty">Ничего не найдено</div>
          ) : (
            <div className="diagramSearchAdvancedList">
              {displayedPropertyResults.map((row, index) => (
                <button
                  key={row?.searchId || `${row?.elementId}_${index}`}
                  type="button"
                  className={`diagramSearchAdvancedPropertyItem ${index === activeIndex ? "isActive" : ""}`}
                  onClick={() => onSelect?.(index)}
                  data-testid="diagram-action-search-advanced-property"
                >
                  <span className="diagramSearchAdvancedPropertyName">{row?.propertyName || "(без имени)"}</span>
                  <span className="diagramSearchAdvancedPropertyValue">{row?.propertyValue || "(пусто)"}</span>
                  <span className="diagramSearchAdvancedPropertyElement">{row?.elementTitle || row?.elementId}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="diagramSearchAdvancedSection" data-testid="diagram-action-search-advanced-tasks">
          <div className="diagramSearchAdvancedSectionTitle">
            Таски ({visibleTasks.length})
          </div>
          {visibleTasks.length === 0 ? (
            <div className="diagramSearchAdvancedEmpty">Нет задач</div>
          ) : (
            <>
              <div className="diagramSearchAdvancedList">
                {visibleTasks.map((row, index) => (
                  <AdvancedTaskItem
                    key={row?.elementId || index}
                    row={row}
                    index={index}
                    onSelect={onSelect}
                  />
                ))}
              </div>
              {hasMoreTasks ? (
                <button
                  type="button"
                  className="diagramSearchAdvancedShowMore"
                  onClick={handleShowMoreTasks}
                  data-testid="diagram-action-search-advanced-show-more"
                >
                  Показать ещё
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
