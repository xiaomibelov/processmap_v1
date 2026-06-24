import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  apiExportAnalyticsActionsCsv,
  apiExportAnalyticsActionsXlsx,
  apiGetAnalyticsActions,
  apiGetAnalyticsDashboard,
} from "../../lib/api.js";
import AnalyticsPropertiesPanel from "./AnalyticsPropertiesPanel.jsx";
import DashboardMetricCard from "./DashboardMetricCard.jsx";
import AnalyticsDataTable, { Badge, Pill } from "./AnalyticsDataTable.jsx";
import AnalyticsDashboardsPanel from "./AnalyticsDashboardsPanel.jsx";
import { AnalyticsError, AnalyticsErrorBoundary, AnalyticsLoading } from "./AnalyticsStatus.jsx";
import EmptyState from "./registry/EmptyState.jsx";
import {
  ActivityIcon,
  ChartBarIcon,
  ChartPieIcon,
  ClockIcon,
  CriticalIcon,
  DownloadIcon,
  FilterIcon,
  HandoffIcon,
  ProjectIcon,
  QuestionIcon,
  SessionIcon,
  TableIcon,
} from "./AnalyticsIcons.jsx";
import {
  ANALYTICS_MODULE_ACTIONS,
  ANALYTICS_MODULE_DASHBOARDS,
  ANALYTICS_MODULE_OVERVIEW,
  ANALYTICS_MODULE_PROPERTIES,
  buildAnalyticsPath,
} from "../../app/processMapRouteModel.js";
import AnalyticsScopeSwitcher from "./AnalyticsScopeSwitcher.jsx";

function text(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ru-RU");
}

function formatDate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "—";
  try {
    return new Date(n * 1000).toLocaleString("ru-RU");
  } catch {
    return String(ts);
  }
}

const MODULE_TABS = [
  { id: ANALYTICS_MODULE_OVERVIEW, label: "Обзор", icon: ChartBarIcon },
  { id: ANALYTICS_MODULE_ACTIONS, label: "Действия", icon: TableIcon },
  { id: ANALYTICS_MODULE_PROPERTIES, label: "Свойства", icon: TableIcon },
  { id: ANALYTICS_MODULE_DASHBOARDS, label: "Дашборды", icon: ChartPieIcon },
];

function chartItems(map = {}) {
  return Object.entries(map || {})
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value);
}

function useAnalyticsDashboard(scope, scopeId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const loadData = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiGetAnalyticsDashboard(scope, scopeId, { signal });
      if (signal?.aborted) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || "Не удалось загрузить аналитику.");
        return;
      }
      setData(result.data);
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || "Ошибка загрузки"));
    }
  }, [scope, scopeId]);

  useEffect(() => {
    const controller = new AbortController();
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    abortRef.current = controller;
    loadData({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [loadData]);

  return { data, loading, error, retry: () => loadData() };
}

function FilterBar({ options = {}, filters = {}, onChange }) {
  const entries = Object.entries(options).filter(([, values]) => toArray(values).length > 0);
  if (!entries.length) return null;
  return (
    <div className="analyticsFilterBar">
      <FilterIcon className="analyticsFilterBarIcon" />
      {entries.map(([key, values]) => (
        <select
          key={key}
          value={filters[key] || ""}
          onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
          className="analyticsFilterSelect"
        >
          <option value="">{key}</option>
          {toArray(values).map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      ))}
      {Object.keys(filters).length > 0 ? (
        <button
          type="button"
          onClick={() => onChange({})}
          className="analyticsFilterClear"
        >
          Сбросить
        </button>
      ) : null}
    </div>
  );
}

function Paginator({ page, limit, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  return (
    <div className="analyticsPaginator">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="analyticsPaginatorBtn"
      >
        ←
      </button>
      <span className="analyticsPaginatorText">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="analyticsPaginatorBtn"
      >
        →
      </button>
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function roleTone(role) {
  const r = text(role).toLowerCase();
  if (!r) return "default";
  if (r.includes("крем") || r.includes("cook")) return "warning";
  if (r.includes("бисквит") || r.includes("prep")) return "success";
  if (r.includes("сборка") || r.includes("assembly")) return "accent";
  if (r.includes("декор") || r.includes("pack")) return "purple";
  if (r.includes("unassigned")) return "muted";
  return "default";
}

function sectionTone(section) {
  const s = text(section).toLowerCase();
  if (!s) return "default";
  if (s.includes("cook")) return "warning";
  if (s.includes("prep")) return "success";
  if (s.includes("move")) return "accent";
  if (s.includes("qc")) return "purple";
  if (s.includes("pack")) return "danger";
  return "default";
}

function AnalyticsActionsPanel({ scope, scopeId }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const loadData = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    const params = { page, limit };
    if (filters.section) params.section_filter = [filters.section];
    if (filters.role) params.role_filter = [filters.role];
    if (filters.type) params.type_filter = [filters.type];
    try {
      const result = await apiGetAnalyticsActions(scope, scopeId, params, { signal });
      if (signal?.aborted) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || "Не удалось загрузить реестр действий.");
        return;
      }
      setRows(result.rows);
      setTotal(result.total);
      setOptions(result.filter_options || {});
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || "Ошибка загрузки"));
    }
  }, [scope, scopeId, page, limit, filters]);

  useEffect(() => {
    const controller = new AbortController();
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    abortRef.current = controller;
    loadData({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [loadData]);

  async function handleExportCsv() {
    if (exporting) return;
    setExporting(true);
    const result = await apiExportAnalyticsActionsCsv(scope, scopeId);
    if (result?.ok && result.blob) {
      downloadBlob(result.blob, result.filename || `actions-${scope}-${scopeId}.csv`);
    }
    setExporting(false);
  }

  async function handleExportXlsx() {
    if (exporting) return;
    setExporting(true);
    const result = await apiExportAnalyticsActionsXlsx(scope, scopeId);
    if (result?.ok && result.blob) {
      downloadBlob(result.blob, result.filename || `actions-${scope}-${scopeId}.xlsx`);
    }
    setExporting(false);
  }

  const columns = [
    { key: "name", label: "Действие", width: "35%", minWidth: "200px" },
    { key: "role", label: "Роль", width: "20%", minWidth: "120px", render: (v) => <Badge tone={roleTone(v)}>{v || "—"}</Badge> },
    { key: "section", label: "Секция", width: "15%", minWidth: "100px", render: (v) => <Badge tone={sectionTone(v)}>{v || "—"}</Badge> },
    { key: "action_type", label: "Тип", width: "15%", minWidth: "100px", render: (v) => <Badge tone="default">{v || "—"}</Badge> },
    { key: "duration_min", label: "Длительность", width: "15%", minWidth: "110px", align: "right", render: (v) => (v == null ? "—" : <Pill>{v} мин</Pill>) },
  ];

  return (
    <div className="analyticsPanel">
      <div className="analyticsPanelToolbar">
        <FilterBar options={options} filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="analyticsExportBtn"
        >
          <DownloadIcon className="w-4 h-4" />
          {exporting ? "Экспорт…" : "CSV"}
        </button>
        <button
          type="button"
          onClick={handleExportXlsx}
          disabled={exporting}
          className="analyticsExportBtn"
        >
          {exporting ? "Экспорт…" : "Excel"}
        </button>
      </div>
      {loading && !rows.length ? <AnalyticsLoading text="Загрузка реестра действий…" /> : null}
      {error ? <AnalyticsError message={error} onRetry={() => loadData()} /> : null}
      {!loading && !error && !rows.length ? (
        <EmptyState
          title="Нет действий"
          description="Для выбранного scope и фильтров не найдено действий."
        />
      ) : null}
      {rows.length > 0 ? (
        <>
          <AnalyticsDataTable columns={columns} rows={rows} />
          <Paginator page={page} limit={limit} total={total} onChange={setPage} />
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, unit = "", tone = "default", icon: Icon, sparklineItems }) {
  return (
    <DashboardMetricCard
      title={label}
      value={value}
      unit={unit}
      tone={tone}
      icon={Icon}
      sparklineItems={sparklineItems}
    />
  );
}

export default function AnalyticsPage({ scope: initialScope, scopeId: initialScopeId, module: initialModule, orgId, embedded = false }) {
  const [pageScope, setPageScope] = useState(initialScope);
  const [pageScopeId, setPageScopeId] = useState(initialScopeId);
  const [pageModule, setPageModule] = useState(initialModule || ANALYTICS_MODULE_OVERVIEW);

  const scope = embedded ? pageScope : initialScope;
  const scopeId = embedded ? pageScopeId : initialScopeId;
  const module = embedded ? pageModule : initialModule;

  useEffect(() => {
    if (embedded) {
      setPageScope(initialScope);
      setPageScopeId(initialScopeId);
      setPageModule(initialModule || ANALYTICS_MODULE_OVERVIEW);
    }
  }, [embedded, initialScope, initialScopeId, initialModule]);

  const { data, loading, error, retry } = useAnalyticsDashboard(scope, scopeId);

  const derivedScopeIds = useMemo(() => {
    if (!data) return { workspaceId: "", projectId: "", sessionId: "" };
    return {
      workspaceId: text(data.workspace_id) || "",
      projectId: text(data.project_id) || "",
      sessionId: scope === "session" ? scopeId : "",
    };
  }, [data, scope, scopeId]);

  function navigateTo(targetScope, targetId) {
    if (!targetId) return;
    if (embedded) {
      setPageScope(targetScope);
      setPageScopeId(targetId);
      return;
    }
    const next = buildAnalyticsPath(targetScope, targetId, module);
    window.history.pushState({}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function setModule(nextModule) {
    if (embedded) {
      setPageModule(nextModule);
      return;
    }
    const next = buildAnalyticsPath(scope, scopeId, nextModule);
    window.history.pushState({}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const title = scope === "session" ? "Сессия" : scope === "project" ? "Проект" : "Workspace";
  const sparklineItems = data ? chartItems(data.actions_by_role) : [];

  return (
    <main className="analyticsHubPage" data-testid="analytics-page">
      <section className="analyticsHubSurface">
        <header className="analyticsHubHeader">
          <div className="analyticsHubHeaderMain">
            <div className="analyticsHubHeaderTitleWrap">
              <h1>Аналитика <span className="text-accent">{title}</span></h1>
              <span className="analyticsHubHeaderScopeId" title={scopeId}>{scopeId}</span>
            </div>
            <div className="analyticsHubHeaderMeta">
              {data?.computed_at ? <span>Обновлено: {formatDate(data.computed_at)}</span> : null}
            </div>
          </div>
          <AnalyticsScopeSwitcher
            scope={scope}
            scopeId={scopeId}
            workspaceId={derivedScopeIds.workspaceId}
            projectId={derivedScopeIds.projectId}
            sessionId={derivedScopeIds.sessionId}
            onChange={navigateTo}
          />
        </header>

        <div className="analyticsModuleTabs">
          {MODULE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = module === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setModule(tab.id)}
                className={`analyticsModuleTab ${active ? "analyticsModuleTab--active" : ""}`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <AnalyticsErrorBoundary>
          {module === ANALYTICS_MODULE_OVERVIEW && (
            <div>
              {loading && !data ? <AnalyticsLoading /> : null}
              {error ? <AnalyticsError message={error} onRetry={retry} /> : null}
              {data ? (
                <div className="analyticsMetricsGrid">
                  <MetricCard label="Действий" value={formatNumber(data.actions_total)} tone="blue" icon={ActivityIcon} sparklineItems={sparklineItems} />
                  <MetricCard label="Длительность" value={formatNumber(data.total_duration_min)} unit="мин" tone="teal" icon={ClockIcon} sparklineItems={sparklineItems} />
                  <MetricCard label="Крит. путь" value={formatNumber(data.critical_path_min)} unit="мин" tone="warning" icon={CriticalIcon} sparklineItems={sparklineItems} />
                  <MetricCard label="Handoffs" value={formatNumber(data.handoffs_count)} tone="amber" icon={HandoffIcon} sparklineItems={sparklineItems} />
                  <MetricCard label="Открыто" value={formatNumber(data.open_questions)} tone="orange" icon={QuestionIcon} sparklineItems={sparklineItems} />
                  <MetricCard label="Критично" value={formatNumber(data.critical_questions)} tone="danger" icon={CriticalIcon} sparklineItems={sparklineItems} />
                  <MetricCard label="Сессий" value={formatNumber(data.sessions_count)} tone="slate" icon={SessionIcon} sparklineItems={sparklineItems} />
                  <MetricCard label="Проектов" value={formatNumber(data.projects_count)} tone="slate" icon={ProjectIcon} sparklineItems={sparklineItems} />
                </div>
              ) : null}
            </div>
          )}
          {module === ANALYTICS_MODULE_ACTIONS && <AnalyticsActionsPanel scope={scope} scopeId={scopeId} />}
          {module === ANALYTICS_MODULE_PROPERTIES && <AnalyticsPropertiesPanel scope={scope} scopeId={scopeId} />}
          {module === ANALYTICS_MODULE_DASHBOARDS && (
            <AnalyticsDashboardsPanel scope={scope} scopeId={scopeId} data={data} loading={loading} error={error} retry={retry} />
          )}
        </AnalyticsErrorBoundary>
      </section>
    </main>
  );
}
