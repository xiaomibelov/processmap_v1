import { useEffect, useMemo, useState } from "react";
import { normalizeCamundaExtensionsMap } from "../../../features/process/camunda/camundaExtensions.js";
import { apiQueryProcessPropertiesRegistry } from "../../../lib/api.js";

const EMPTY_MESSAGE = "Свойства ещё не собраны в реестр. Нужно подключить подтверждённые источники свойств BPMN/оверлеев.";

function toText(value) {
  return String(value ?? "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uniqueCount(values) {
  return new Set(values.map(toText).filter(Boolean)).size;
}

function completenessOf(row) {
  return toText(row.value) && row.value !== "—" ? "complete" : "incomplete";
}

function statusText(row) {
  return completenessOf(row) === "complete" ? "Полная" : "Неполная";
}

function StatusBadge({ row }) {
  const completeness = completenessOf(row);
  return (
    <span className={`productActionsRegistryCompleteness ${completeness}`}>
      {statusText(row)}
    </span>
  );
}

function PropertyChips({ row }) {
  const chips = [row.group, row.sourceKind].map(toText).filter(Boolean);
  if (!chips.length) return null;
  return (
    <span className="productActionsRegistryRowChips">
      {chips.map((chip) => <span key={chip}>{chip}</span>)}
    </span>
  );
}

function normalizeBackendRow(backendRow) {
  const r = asObject(backendRow);
  const value = toText(r.property_value) || "—";
  return {
    id: toText(r.id),
    object: toText(r.element_id) || toText(r.element_title) || "Объект не указан",
    property: toText(r.property_name) || "Свойство не указано",
    value,
    source: toText(r.source) || "Текущая сессия",
    sourceKind: toText(r.source_kind) || "bpmn_meta.camunda_extensions_by_element_id",
    type: toText(r.property_type) || "Camunda property",
    group: toText(r.property_group) || "extensionProperties",
    status: toText(r.status) || (value !== "—" ? "Полная" : "Неполная"),
  };
}

function buildCamundaRows(bpmnMetaRaw = {}, sessionTitle = "") {
  const bpmnMeta = asObject(bpmnMetaRaw);
  const camundaMap = normalizeCamundaExtensionsMap(asObject(bpmnMeta.camunda_extensions_by_element_id));
  return Object.entries(camundaMap).flatMap(([elementId, state]) => {
    const properties = Array.isArray(state?.properties?.extensionProperties)
      ? state.properties.extensionProperties
      : [];
    const listeners = Array.isArray(state?.properties?.extensionListeners)
      ? state.properties.extensionListeners
      : [];
    const propertyRows = properties.map((item) => ({
      id: `${elementId}:camunda-property:${toText(item.id) || toText(item.name)}`,
      object: elementId,
      property: toText(item.name),
      value: toText(item.value) || "—",
      source: sessionTitle || "Текущая сессия",
      sourceKind: "bpmn_meta.camunda_extensions_by_element_id",
      type: "Camunda property",
      group: "extensionProperties",
      status: toText(item.value) ? "Полная" : "Неполная",
    }));
    const listenerRows = listeners.map((item) => ({
      id: `${elementId}:camunda-listener:${toText(item.id) || `${toText(item.event)}:${toText(item.type)}`}`,
      object: elementId,
      property: `${toText(item.event)} / ${toText(item.type)}`,
      value: toText(item.value) || "—",
      source: sessionTitle || "Текущая сессия",
      sourceKind: "bpmn_meta.camunda_extensions_by_element_id",
      type: "Camunda listener",
      group: "extensionListeners",
      status: toText(item.value) ? "Полная" : "Неполная",
    }));
    return [...propertyRows, ...listenerRows];
  });
}

export default function ProcessPropertiesRegistryPage({
  scope = "workspace",
  workspaceId = "",
  projectId = "",
  sessionId = "",
  sessionTitle = "",
  bpmnMeta = null,
  onScopeChange = null,
  onClose = null,
}) {
  const [openRowId, setOpenRowId] = useState("");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [processFilter, setProcessFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [backendRows, setBackendRows] = useState([]);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState("");
  const hasSessionSource = scope === "session" && !!sessionId;

  const shouldFetchBackend = scope === "workspace" || scope === "project" || (scope === "session" && !!sessionId);

  useEffect(() => {
    if (!shouldFetchBackend) {
      setBackendRows([]);
      return;
    }
    let cancelled = false;
    async function fetchBackend() {
      setBackendLoading(true);
      setBackendError("");
      try {
        const payload = {
          scope,
          workspace_id: workspaceId,
          project_id: projectId,
          session_id: sessionId,
          limit: 10000,
          offset: 0,
        };
        const result = await apiQueryProcessPropertiesRegistry(payload);
        if (cancelled) return;
        if (result.ok && Array.isArray(result.rows)) {
          setBackendRows(result.rows.map(normalizeBackendRow));
        } else {
          setBackendRows([]);
          setBackendError(toText(result.error) || "backend_error");
        }
      } catch (e) {
        if (!cancelled) {
          setBackendRows([]);
          setBackendError(String(e || "backend_error"));
        }
      } finally {
        if (!cancelled) setBackendLoading(false);
      }
    }
    fetchBackend();
    return () => { cancelled = true; };
  }, [scope, workspaceId, projectId, sessionId]);

  const clientRows = useMemo(
    () => (hasSessionSource ? buildCamundaRows(bpmnMeta, sessionTitle) : []),
    [bpmnMeta, hasSessionSource, sessionTitle],
  );

  const rows = useMemo(() => {
    if (scope === "workspace" || scope === "project") {
      return backendRows;
    }
    // session scope: prefer backend if available, fallback to client-side
    return backendRows.length ? backendRows : clientRows;
  }, [scope, backendRows, clientRows]);

  const sourceTruth = useMemo(() => {
    if (scope === "workspace" || scope === "project") {
      if (backendLoading) return "Загрузка свойств из backend source-of-truth…";
      if (backendError) return `Foundation mode: backend недоступен (${backendError}).`;
      if (backendRows.length) {
        return "Строки загружены из backend source-of-truth: bpmn_meta.camunda_extensions_by_element_id.";
      }
      return "Foundation mode: подтверждённый page-safe источник для выбранного scope не подключён.";
    }
    if (scope === "session") {
      if (backendRows.length) {
        return "Строки загружены из backend source-of-truth: bpmn_meta.camunda_extensions_by_element_id.";
      }
      if (clientRows.length) {
        return "Строки загружены только из подтверждённого current source: bpmn_meta.camunda_extensions_by_element_id текущей сессии.";
      }
      return "Foundation mode: подтверждённый page-safe источник для выбранного scope не подключён.";
    }
    return "Foundation mode: подтверждённый page-safe источник для выбранного scope не подключён.";
  }, [scope, backendLoading, backendError, backendRows, clientRows]);

  const filtersEnabled = rows.length > 0;
  const filteredRows = useMemo(() => rows.filter((row) => (
    (!propertyTypeFilter || row.type === propertyTypeFilter)
    && (!groupFilter || row.group === groupFilter)
    && (!sourceFilter || row.sourceKind === sourceFilter)
    && (!processFilter || row.source === processFilter)
    && (!statusFilter || row.status === statusFilter)
  )), [groupFilter, processFilter, propertyTypeFilter, rows, sourceFilter, statusFilter]);
  const options = {
    types: [...new Set(rows.map((row) => row.type))],
    groups: [...new Set(rows.map((row) => row.group))],
    sources: [...new Set(rows.map((row) => row.sourceKind))],
    processes: [...new Set(rows.map((row) => row.source))],
    statuses: [...new Set(rows.map((row) => row.status))],
  };
  const metricValue = (value) => (filtersEnabled ? value : "—");

  function changeScope(nextScope) {
    if (typeof onScopeChange === "function") onScopeChange(nextScope);
  }

  function resetFilters() {
    setPropertyTypeFilter("");
    setGroupFilter("");
    setSourceFilter("");
    setProcessFilter("");
    setStatusFilter("");
  }

  const totalComplete = rows.filter((row) => completenessOf(row) === "complete").length;
  const totalIncomplete = rows.length - totalComplete;
  const filteredComplete = filteredRows.filter((row) => completenessOf(row) === "complete").length;
  const filteredIncomplete = filteredRows.length - filteredComplete;

  return (
    <main className="productActionsRegistryPage processPropertiesRegistryPage" data-testid="process-properties-registry-page">
      <section className="productActionsRegistryPanel productActionsRegistryPanel--page processPropertiesRegistryPanel--page">
        <header className="productActionsRegistryHeader processPropertiesRegistryHeader">
          <div className="productActionsRegistryHeaderMain">
            <div>
              <h1 className="productActionsRegistryTitle">Реестр свойств</h1>
              <p className="productActionsRegistrySubcopy">Сводный список свойств BPMN-элементов и процессных объектов.</p>
              <small className="processPropertiesRegistrySourceTruth">{sourceTruth}</small>
            </div>
          </div>
          {onClose ? (
            <button type="button" className="productActionsRegistryBackBtn" onClick={onClose} data-testid="process-properties-registry-back">
              Вернуться
            </button>
          ) : null}
        </header>

        <div className="productActionsRegistryScope processPropertiesRegistryScope" role="tablist" aria-label="Источник строк реестра свойств">
          <button type="button" className={scope === "workspace" ? "isActive" : ""} onClick={() => changeScope("workspace")} role="tab" aria-selected={scope === "workspace"} data-testid="process-properties-scope-workspace">
            Workspace
          </button>
          <button type="button" className={scope === "project" ? "isActive" : ""} onClick={() => changeScope("project")} role="tab" aria-selected={scope === "project"} disabled={!projectId} data-testid="process-properties-scope-project">
            Проект
          </button>
          <button type="button" className={scope === "session" ? "isActive" : ""} onClick={() => changeScope("session")} role="tab" aria-selected={scope === "session"} disabled={!sessionId} data-testid="process-properties-scope-session">
            Сессия
          </button>
        </div>

        <div className="productActionsRegistryContainer processPropertiesRegistryContainer">
          <section className="productActionsRegistrySection productActionsRegistryMetricsSection">
            <div className="productActionsRegistryMetrics processPropertiesRegistryMetrics" data-testid="process-properties-registry-metrics">
              <span className="productActionsRegistryMetric"><span className="productActionsRegistryMetricValue">{metricValue(uniqueCount(rows.map((row) => row.sourceKind)))}</span><span className="productActionsRegistryMetricLabel">Источников</span></span>
              <span className="productActionsRegistryMetric"><span className="productActionsRegistryMetricValue">{metricValue(uniqueCount(rows.map((row) => row.object)))}</span><span className="productActionsRegistryMetricLabel">Элементов</span></span>
              <span className="productActionsRegistryMetric"><span className="productActionsRegistryMetricValue">{metricValue(rows.length)}</span><span className="productActionsRegistryMetricLabel">Свойств</span></span>
              <span className="productActionsRegistryMetric"><span className="productActionsRegistryMetricValue">{metricValue(uniqueCount(rows.map((row) => row.type)))}</span><span className="productActionsRegistryMetricLabel">Типов свойств</span></span>
              <span className="productActionsRegistryMetric" data-accent={totalIncomplete ? "incomplete" : null}><span className="productActionsRegistryMetricValue">{metricValue(totalIncomplete)}</span><span className="productActionsRegistryMetricLabel">Неполных</span></span>
              <span className="productActionsRegistryMetric productActionsRegistryMetric--filtered" data-muted={rows.length === filteredRows.length ? "true" : null}><span className="productActionsRegistryMetricValue">{metricValue(filteredRows.length)}</span><span className="productActionsRegistryMetricLabel">После фильтров</span></span>
            </div>
          </section>

          {filtersEnabled ? (
            <section className="productActionsRegistrySection productActionsRegistryFiltersSection">
              <div className="productActionsRegistryFilters processPropertiesRegistryFilters" data-testid="process-properties-registry-filters">
                <div className="productActionsRegistryFiltersToolbar">
                  <label className="productActionsRegistryFilterItem"><span>Тип свойства</span><select value={propertyTypeFilter} onChange={(event) => setPropertyTypeFilter(event.target.value)}><option value="">Все</option>{options.types.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                  <label className="productActionsRegistryFilterItem"><span>Группа свойства</span><select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">Все</option>{options.groups.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                  <label className="productActionsRegistryFilterItem"><span>Источник</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">Все</option>{options.sources.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                  <label className="productActionsRegistryFilterItem"><span>Процесс / сессия</span><select value={processFilter} onChange={(event) => setProcessFilter(event.target.value)}><option value="">Все</option>{options.processes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                  <label className="productActionsRegistryFilterItem"><span>Полнота</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Все</option>{options.statuses.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                  <button type="button" className="productActionsRegistryFilterReset" onClick={resetFilters}>Сбросить фильтры</button>
                </div>
                <p className="productActionsRegistryFiltersHint">Фильтры применяются к загруженным строкам.</p>
              </div>
            </section>
          ) : null}

          {totalIncomplete ? (
            <section className="productActionsRegistrySection productActionsRegistryIncompleteBanner" data-testid="process-properties-registry-incomplete-banner">
              <span className="productActionsRegistryIncompleteBannerIcon" aria-hidden="true">⚠</span>
              <span className="productActionsRegistryIncompleteBannerText">
                Есть свойства без значения — проверьте Camunda extensions в исходной сессии.
              </span>
              <button type="button" className="productActionsRegistryAccentLink" onClick={() => setStatusFilter("Неполная")}>
                Показать неполные
              </button>
            </section>
          ) : null}

          <section className="productActionsRegistrySection productActionsRegistryPreview processPropertiesRegistryPreview" data-testid="process-properties-registry-table">
            <div className="productActionsRegistryTable processPropertiesRegistryTable" role="table">
              <div className="productActionsRegistryTableHead processPropertiesRegistryTableHead" role="row">
                <span>Объект</span>
                <span>Свойство</span>
                <span>Значение</span>
                <span className="productActionsRegistryTableHeadStatus">Статус</span>
              </div>
              {filteredRows.length ? filteredRows.map((row) => {
                const isOpen = openRowId === row.id;
                return (
                  <article className={`productActionsRegistryRow processPropertiesRegistryRow ${isOpen ? "productActionsRegistryRow--open" : ""}`} role="row" data-expanded={isOpen ? "true" : "false"} key={row.id}>
                    <button type="button" className="productActionsRegistryRowMain processPropertiesRegistryRowMain" onClick={() => setOpenRowId((current) => (current === row.id ? "" : row.id))} aria-expanded={isOpen}>
                      <div className="productActionsRegistryRowCell productActionsRegistryRowCell--product">
                        <span className={`productActionsRegistryRowChevron ${isOpen ? "isOpen" : ""}`} aria-hidden="true">▸</span>
                        <span className="productActionsRegistryRowProduct">
                          <b>{row.object || "Объект не указан"}</b>
                          <small>{row.source}</small>
                        </span>
                      </div>
                      <div className="productActionsRegistryRowCell">
                        <b>{row.property || "Свойство не указано"}</b>
                        <PropertyChips row={row} />
                      </div>
                      <div className="productActionsRegistryRowCell">
                        <b>{row.value}</b>
                        <small>{row.type}</small>
                      </div>
                      <div className="productActionsRegistryRowCell productActionsRegistryRowCell--status">
                        <StatusBadge row={row} />
                        <small>{row.status}</small>
                      </div>
                    </button>
                    <div className="productActionsRegistryRowExpansion" role="region" aria-hidden={!isOpen}>
                      <dl className="productActionsRegistryRowExpansionGrid processPropertiesRegistryRowExpansionGrid">
                        <div><dt>Источник / процесс</dt><dd>{row.source}</dd></div>
                        <div><dt>Source key</dt><dd>{row.sourceKind}</dd></div>
                        <div><dt>Тип / группа</dt><dd>{row.type} · {row.group}</dd></div>
                        <div><dt>ID</dt><dd>{row.id}</dd></div>
                      </dl>
                    </div>
                  </article>
                );
              }) : (
                <div className="productActionsRegistryEmpty processPropertiesRegistryEmpty" data-testid="process-properties-registry-empty">
                  <p>{EMPTY_MESSAGE}</p>
                  <small>Workspace: {workspaceId || "—"} · Project: {projectId || "—"} · Session: {sessionId || "—"}</small>
                </div>
              )}
            </div>
          </section>

          <footer className="productActionsRegistryFooter processPropertiesRegistryFooter">
            <span className="productActionsRegistryFooterMeta">
              После фильтров: {metricValue(filteredRows.length)} строк · полных: {metricValue(filteredComplete)} · неполных: {metricValue(filteredIncomplete)}
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
