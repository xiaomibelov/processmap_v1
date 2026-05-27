import { useEffect, useMemo, useState } from "react";
import { apiQueryProcessPropertiesRegistry } from "../../lib/api.js";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeScope(sessionId, projectId, workspaceId) {
  if (toText(sessionId)) return "session";
  if (toText(projectId)) return "project";
  if (toText(workspaceId)) return "workspace";
  return "";
}

function statusConfig(completeness) {
  const c = toText(completeness).toLowerCase();
  if (c === "complete") {
    return { dotColor: "#10B981", label: "Подтверждено" };
  }
  if (c === "incomplete") {
    return { dotColor: "#F59E0B", label: "Предположение" };
  }
  return { dotColor: "#9CA3AF", label: "Не определено" };
}

function emptyStateMessages(kind) {
  const k = toText(kind).toLowerCase();
  if (k === "no_sessions") {
    return {
      title: "Нет доступных сессий",
      description: "В выбранном проекте пока нет сессий с сохранёнными BPMN-диаграммами.",
    };
  }
  if (k === "no_actions") {
    return {
      title: "Свойства не найдены",
      description: "BPMN-диаграммы сохранены, но расширения Camunda и пользовательские свойства не обнаружены.",
    };
  }
  if (k === "no_filtered_rows") {
    return {
      title: "Нет результатов",
      description: "Попробуйте изменить фильтры или поисковый запрос.",
    };
  }
  return {
    title: "Реестр свойств пуст",
    description: "Свойства BPMN-элементов будут собраны при следующем сохранении диаграммы.",
  };
}

function EmptyStateBlock({ emptyState, sourceState, noProject }) {
  let title = "Реестр свойств пуст";
  let description = "Свойства BPMN-элементов будут собраны при следующем сохранении диаграммы.";

  if (noProject) {
    title = "Проект не выбран";
    description = "Выберите проект, чтобы просмотреть реестр свойств.";
  } else if (emptyState && typeof emptyState === "object") {
    const mapped = emptyStateMessages(emptyState.kind);
    title = mapped.title;
    description = mapped.description;
  }

  const sessionsScanned = Number(sourceState?.sessions_scanned || 0);
  const actionsScanned = Number(sourceState?.actions_scanned || 0);

  return (
    <div className="propertiesRegistryEmpty" data-testid="properties-registry-empty">
      <div className="propertiesRegistryEmptyIcon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14h.01" />
          <path d="M13 14h.01" />
          <path d="M9 17h.01" />
          <path d="M13 17h.01" />
        </svg>
      </div>
      <div className="propertiesRegistryEmptyTitle">{title}</div>
      <div className="propertiesRegistryEmptyDesc">{description}</div>
      {sourceState && typeof sourceState === "object" && !noProject ? (
        <div className="propertiesRegistryEmptyBreakdown">
          <div className="propertiesRegistryEmptyBreakdownLabel">Источники:</div>
          <div className="propertiesRegistryEmptyBreakdownItem">
            • Сессий просканировано: {sessionsScanned}
          </div>
          <div className="propertiesRegistryEmptyBreakdownItem">
            • Свойств найдено: {actionsScanned}
          </div>
          {sessionsScanned === 0 ? (
            <div className="propertiesRegistryEmptyBreakdownHint">
              Сохраните BPMN-диаграмму в сессии, чтобы свойства появились в реестре.
            </div>
          ) : sessionsScanned > 0 && actionsScanned === 0 ? (
            <div className="propertiesRegistryEmptyBreakdownHint">
              Диаграммы найдены, но в них отсутствуют Camunda extensions и custom properties.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function PropertiesRegistry({
  workspaceId = "",
  projectId = "",
  sessionId = "",
  onClose = null,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendRows, setBackendRows] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [emptyState, setEmptyState] = useState(null);
  const [sourceState, setSourceState] = useState(null);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState({ type: "", source: "" });
  const [expandedRowId, setExpandedRowId] = useState(null);

  const scope = normalizeScope(sessionId, projectId, workspaceId);
  const hasProject = !!toText(projectId);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!scope) {
        setBackendRows([]);
        setFilterOptions(null);
        setEmptyState(null);
        setSourceState(null);
        setError("");
        return;
      }
      setLoading(true);
      setError("");
      const payload = {
        scope,
        workspace_id: scope === "workspace" ? toText(workspaceId) : "",
        project_id: scope === "project" ? toText(projectId) : "",
        session_id: scope === "session" ? toText(sessionId) : "",
        filters: {
          property_types: toArray(activeFilters.type ? [activeFilters.type] : []),
          groups: [],
          sources: toArray(activeFilters.source ? [activeFilters.source] : []),
          processes: [],
          element_types: [],
          completeness: "all",
        },
        limit: 1000,
        offset: 0,
      };
      const result = await apiQueryProcessPropertiesRegistry(payload);
      if (!alive) return;
      setLoading(false);
      if (!result?.ok) {
        setBackendRows([]);
        setFilterOptions(null);
        setEmptyState(null);
        setSourceState(null);
        setError(toText(result?.error) || "Не удалось загрузить реестр свойств.");
        return;
      }
      setBackendRows(Array.isArray(result.rows) ? result.rows : []);
      setFilterOptions(result.filter_options && typeof result.filter_options === "object" ? result.filter_options : null);
      setEmptyState(result.empty_state && typeof result.empty_state === "object" ? result.empty_state : null);
      setSourceState(result.source_state && typeof result.source_state === "object" ? result.source_state : null);
    }
    load();
    return () => {
      alive = false;
    };
  }, [workspaceId, projectId, sessionId, scope]);

  const filteredRows = useMemo(() => {
    let rows = backendRows.slice();
    const q = toText(query).toLowerCase();
    if (q) {
      rows = rows.filter((r) => toText(r.property_name).toLowerCase().includes(q));
    }
    if (toText(activeFilters.type)) {
      rows = rows.filter((r) => toText(r.property_type) === activeFilters.type);
    }
    if (toText(activeFilters.source)) {
      rows = rows.filter((r) => toText(r.source) === activeFilters.source || toText(r.session_title) === activeFilters.source);
    }
    return rows;
  }, [backendRows, query, activeFilters]);

  const typeOptions = useMemo(() => {
    const opts = new Set();
    if (filterOptions && Array.isArray(filterOptions.property_types)) {
      filterOptions.property_types.forEach((t) => opts.add(toText(t)));
    }
    backendRows.forEach((r) => {
      const t = toText(r.property_type);
      if (t) opts.add(t);
    });
    return Array.from(opts).filter(Boolean).sort();
  }, [filterOptions, backendRows]);

  const sourceOptions = useMemo(() => {
    const opts = new Set();
    if (filterOptions && Array.isArray(filterOptions.sources)) {
      filterOptions.sources.forEach((s) => opts.add(toText(s)));
    }
    if (filterOptions && Array.isArray(filterOptions.processes)) {
      filterOptions.processes.forEach((s) => opts.add(toText(s)));
    }
    backendRows.forEach((r) => {
      const s = toText(r.source) || toText(r.session_title);
      if (s) opts.add(s);
    });
    return Array.from(opts).filter(Boolean).sort();
  }, [filterOptions, backendRows]);

  const showEmpty = !loading && filteredRows.length === 0;
  const showTable = !loading && filteredRows.length > 0;

  return (
    <main className="propertiesRegistryPage" data-testid="properties-registry-page">
      <section className="propertiesRegistrySurface">
        <header className="propertiesRegistryHeader">
          <div>
            <h1>Реестр свойств</h1>
            <p>BPMN-объекты и их атрибуты из подтвержденных источников</p>
          </div>
          {onClose ? (
            <button type="button" className="secondaryBtn smallBtn" onClick={onClose} data-testid="properties-registry-close">
              Вернуться
            </button>
          ) : null}
        </header>

        {hasProject && scope ? (
          <div className="propertiesRegistryToolbar">
            <input
              type="text"
              className="input"
              placeholder="Поиск по названию свойства…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="properties-registry-search"
            />
            {typeOptions.length > 0 ? (
              <select
                className="input"
                style={{ width: "auto", minWidth: 140 }}
                value={activeFilters.type}
                onChange={(e) => setActiveFilters((prev) => ({ ...prev, type: e.target.value }))}
                data-testid="properties-registry-filter-type"
              >
                <option value="">Все типы</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : null}
            {sourceOptions.length > 0 ? (
              <select
                className="input"
                style={{ width: "auto", minWidth: 140 }}
                value={activeFilters.source}
                onChange={(e) => setActiveFilters((prev) => ({ ...prev, source: e.target.value }))}
                data-testid="properties-registry-filter-source"
              >
                <option value="">Все источники</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="propertiesRegistryEmpty" data-testid="properties-registry-loading">
            <div className="propertiesRegistryEmptyTitle">Загрузка…</div>
            <div className="propertiesRegistryEmptyDesc">Загружаем реестр свойств из backend.</div>
          </div>
        ) : error ? (
          <div className="propertiesRegistryEmpty" data-testid="properties-registry-error">
            <div className="propertiesRegistryEmptyTitle">Ошибка загрузки</div>
            <div className="propertiesRegistryEmptyDesc">{error}</div>
          </div>
        ) : showEmpty ? (
          <EmptyStateBlock emptyState={emptyState} sourceState={sourceState} noProject={!hasProject || !scope} />
        ) : null}

        {showTable ? (
          <div className="propertiesRegistryTableWrap">
            <div className="propertiesRegistryTable" role="table" data-testid="properties-registry-table">
              <div className="propertiesRegistryTableHead" role="row">
                <span role="columnheader" className="propertiesRegistryTableHeadCell" style={{ flex: 2 }}>Свойство</span>
                <span role="columnheader" className="propertiesRegistryTableHeadCell" style={{ flex: "0 0 140px" }}>Тип</span>
                <span role="columnheader" className="propertiesRegistryTableHeadCell" style={{ flex: "0 0 160px" }}>BPMN элемент</span>
                <span role="columnheader" className="propertiesRegistryTableHeadCell" style={{ flex: "0 0 160px" }}>Источник</span>
                <span role="columnheader" className="propertiesRegistryTableHeadCell" style={{ flex: "0 0 120px" }}>Статус</span>
              </div>
              {filteredRows.map((row) => {
                const id = toText(row.id) || toText(row.registry_id) || `${toText(row.session_id)}::${toText(row.element_id)}::${toText(row.property_name)}`;
                const isExpanded = expandedRowId === id;
                const hasDetail = !!(
                  toText(row.property_value)
                  || toText(row.element_title)
                  || toText(row.source_kind)
                );
                const status = statusConfig(row.completeness);
                const bpmnLabel = `${toText(row.element_type)}${row.element_title ? ` — ${toText(row.element_title)}` : ""}`;
                const sourceLabel = toText(row.source) || toText(row.session_title) || "—";
                return (
                  <div key={id}>
                    <div
                      className={`propertiesRegistryTableRow ${hasDetail ? "propertiesRegistryTableRow--expandable" : ""}`}
                      role="row"
                      onClick={() => {
                        if (!hasDetail) return;
                        setExpandedRowId((prev) => (prev === id ? null : id));
                      }}
                      data-testid="properties-registry-row"
                    >
                      <span role="cell" className="propertiesRegistryTableCell" style={{ flex: 2 }}>
                        {toText(row.property_name) || "—"}
                      </span>
                      <span role="cell" className="propertiesRegistryTableCell" style={{ flex: "0 0 140px" }}>
                        {row.property_type ? (
                          <span className="propertiesRegistryTypePill">{toText(row.property_type)}</span>
                        ) : (
                          "—"
                        )}
                      </span>
                      <span role="cell" className="propertiesRegistryTableCell" style={{ flex: "0 0 160px" }}>
                        {bpmnLabel || "—"}
                      </span>
                      <span role="cell" className="propertiesRegistryTableCell" style={{ flex: "0 0 160px" }}>
                        {sourceLabel}
                      </span>
                      <span role="cell" className="propertiesRegistryTableCell" style={{ flex: "0 0 120px" }}>
                        <span className="propertiesRegistryStatusBadge">
                          <span className="propertiesRegistryStatusDot" style={{ background: status.dotColor }} aria-hidden="true" />
                          {status.label}
                        </span>
                      </span>
                    </div>
                    {isExpanded && hasDetail ? (
                      <div className="propertiesRegistryDetail" data-testid="properties-registry-detail">
                        <div className="propertiesRegistryDetailGrid">
                          {toText(row.property_value) ? (
                            <div className="propertiesRegistryDetailItem">
                              <span className="propertiesRegistryDetailLabel">Значение</span>
                              <span className="propertiesRegistryDetailValue">{toText(row.property_value)}</span>
                            </div>
                          ) : null}
                          {toText(row.property_type) || toText(row.property_group) ? (
                            <div className="propertiesRegistryDetailItem">
                              <span className="propertiesRegistryDetailLabel">Тип / Группа</span>
                              <span className="propertiesRegistryDetailValue">
                                {toText(row.property_type)}{row.property_group ? ` / ${toText(row.property_group)}` : ""}
                              </span>
                            </div>
                          ) : null}
                          {toText(row.element_type) || toText(row.element_title) ? (
                            <div className="propertiesRegistryDetailItem">
                              <span className="propertiesRegistryDetailLabel">BPMN элемент</span>
                              <span className="propertiesRegistryDetailValue">
                                {toText(row.element_type)}{row.element_title ? ` — ${toText(row.element_title)}` : ""}
                                {row.element_id ? ` (${toText(row.element_id)})` : ""}
                              </span>
                            </div>
                          ) : null}
                          {toText(row.source) || toText(row.source_kind) || toText(row.session_title) ? (
                            <div className="propertiesRegistryDetailItem">
                              <span className="propertiesRegistryDetailLabel">Источник</span>
                              <span className="propertiesRegistryDetailValue">
                                {toText(row.session_title) || toText(row.source)}
                                {row.source_kind ? ` — ${toText(row.source_kind)}` : ""}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
