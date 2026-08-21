import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  apiExportAnalyticsActionsCsv,
  apiExportAnalyticsActionsXlsx,
  apiGetAnalyticsActions,
  apiGetAnalyticsDashboard,
  apiGetAnalyticsPropertiesRecalculation,
  apiGetAnalyticsQuality,
  apiRefreshAnalytics,
} from "../../lib/api.js";
import AnalyticsPropertiesPanel from "./AnalyticsPropertiesPanel.jsx";
import AnalyticsDataTable, { Badge, Pill } from "./AnalyticsDataTable.jsx";
import { AnalyticsError, AnalyticsErrorBoundary, AnalyticsLoading } from "./AnalyticsStatus.jsx";
import EmptyState from "./registry/EmptyState.jsx";
import {
  ChartBarIcon,
  DownloadIcon,
  FilterIcon,
  TableIcon,
} from "./AnalyticsIcons.jsx";
import {
  ANALYTICS_MODULE_ACTIONS,
  ANALYTICS_MODULE_OVERVIEW,
  ANALYTICS_MODULE_PROPERTIES,
  buildAnalyticsPath,
} from "../../app/processMapRouteModel.js";
import AnalyticsScopeSwitcher from "./AnalyticsScopeSwitcher.jsx";
import AnalyticsOverviewPanel from "./AnalyticsOverviewPanel.jsx";
import "./AnalyticsOverviewPanel.css";
import { ru } from "../../shared/i18n/ru.js";

const t = ru.analytics;

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

const MODULE_TABS = [
  { id: ANALYTICS_MODULE_OVERVIEW, label: t.overview, icon: ChartBarIcon },
  { id: ANALYTICS_MODULE_ACTIONS, label: t.actions, icon: TableIcon },
  { id: ANALYTICS_MODULE_PROPERTIES, label: t.properties, icon: TableIcon },
];

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
        setError(text(result?.error) || t.errorOverview);
        return;
      }
      setData(result.data);
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || t.errorGeneric));
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

function useAnalyticsRecalculation(scope, scopeId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const loadData = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiGetAnalyticsPropertiesRecalculation(scope, scopeId, { signal });
      if (signal?.aborted) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || t.errorLoadingRecalc);
        return;
      }
      setRows(result.rows || []);
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || t.errorGeneric));
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

  return { rows, loading, error, retry: () => loadData() };
}

function useAnalyticsQuality(scope, scopeId, recalcRows) {
  const [apiQuality, setApiQuality] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const loadData = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiGetAnalyticsQuality(scope, scopeId, { signal });
      if (signal?.aborted) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || t.errorLoadingQuality);
        return;
      }
      setApiQuality({
        ee_time_filled_pct: result.ee_time_filled_pct,
        ingredient_numeric_pct: result.ingredient_numeric_pct,
        no_data_count: result.no_data_count,
        total_elements_with_ee_time: result.total_elements_with_ee_time,
      });
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || t.errorGeneric));
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

  const computedQuality = useMemo(() => {
    if (apiQuality) return apiQuality;
    const total = recalcRows.length;
    if (!total) {
      return {
        ee_time_filled_pct: 0,
        ingredient_numeric_pct: 0,
        no_data_count: 0,
        total_elements_with_ee_time: 0,
      };
    }
    const noData = recalcRows.filter((r) => r.source === "нет данных").length;
    const property = recalcRows.filter((r) => r.source === "property").length;
    const present = recalcRows.filter((r) => r.source !== "расчёт по умолчанию").length;
    return {
      ee_time_filled_pct: 100,
      ingredient_numeric_pct: present ? Math.round((property / present) * 100) : 0,
      no_data_count: noData,
      total_elements_with_ee_time: total,
    };
  }, [apiQuality, recalcRows]);

  return { quality: computedQuality, loading, error };
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
          {t.resetFilters}
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
        setError(text(result?.error) || t.errorLoadingActions);
        return;
      }
      setRows(result.rows);
      setTotal(result.total);
      setOptions(result.filter_options || {});
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") return;
      setLoading(false);
      setError(String(e?.message || e || t.errorGeneric));
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
    { key: "name", label: t.columnAction, width: "35%", minWidth: "200px" },
    { key: "role", label: t.columnRole, width: "20%", minWidth: "120px", render: (v) => <Badge tone={roleTone(v)}>{v || "—"}</Badge> },
    { key: "section", label: t.columnSection, width: "15%", minWidth: "100px", render: (v) => <Badge tone={sectionTone(v)}>{v || "—"}</Badge> },
    { key: "action_type", label: t.columnType, width: "15%", minWidth: "100px", render: (v) => <Badge tone="default">{v || "—"}</Badge> },
    { key: "duration_min", label: t.columnDuration, width: "15%", minWidth: "110px", align: "right", render: (v) => (v == null ? "—" : <Pill>{v} {t.unitMin}</Pill>) },
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
          {exporting ? t.exportLoading : t.exportCsv}
        </button>
        <button
          type="button"
          onClick={handleExportXlsx}
          disabled={exporting}
          className="analyticsExportBtn"
        >
          {exporting ? t.exportLoading : t.exportExcel}
        </button>
      </div>
      {loading && !rows.length ? <AnalyticsLoading text={t.loadingActions} /> : null}
      {error ? <AnalyticsError message={error} onRetry={() => loadData()} /> : null}
      {!loading && !error && !rows.length ? (
        <EmptyState
          title={t.actionsEmptyTitle}
          description={t.actionsEmptyDescription}
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
  const { rows: recalcRows, loading: recalcLoading, error: recalcError, retry: retryRecalc } = useAnalyticsRecalculation(scope, scopeId);
  const { quality } = useAnalyticsQuality(scope, scopeId, recalcRows);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

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

  function setModule(nextModule, filters = {}) {
    if (embedded) {
      setPageModule(nextModule);
      return;
    }
    const next = buildAnalyticsPath(scope, scopeId, nextModule);
    const url = new URL(next, window.location.href);
    if (filters.source) url.searchParams.set("source", filters.source);
    if (filters.property) url.searchParams.set("property", filters.property);
    window.history.pushState({}, "", url.pathname + url.search);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      const result = await apiRefreshAnalytics(scope, scopeId);
      if (!result?.ok) {
        setRefreshError(text(result?.error) || t.errorRefresh);
      }
    } catch (e) {
      setRefreshError(String(e?.message || e || t.errorRefreshGeneric));
    } finally {
      setRefreshing(false);
      retry();
      retryRecalc();
    }
  }

  const title = scope === "session" ? t.scopeSession : scope === "project" ? t.scopeProject : t.scopeWorkspace;

  return (
    <main className="analyticsHubPage" data-testid="analytics-page">
      <section className="analyticsHubSurface">
        <header className="analyticsHubHeader">
          <div className="analyticsHubHeaderMain">
            <div className="analyticsHubHeaderTitleWrap">
              <h1>{t.title} <span className="text-accent">{title}</span></h1>
              <span className="analyticsHubHeaderScopeId" title={scopeId}>{scopeId}</span>
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
            <AnalyticsOverviewPanel
              data={data}
              quality={quality}
              recalcRows={recalcRows}
              loading={loading}
              error={error}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onRetry={retry}
              onNavigate={setModule}
            />
          )}
          {module === ANALYTICS_MODULE_ACTIONS && <AnalyticsActionsPanel scope={scope} scopeId={scopeId} />}
          {module === ANALYTICS_MODULE_PROPERTIES && <AnalyticsPropertiesPanel scope={scope} scopeId={scopeId} />}
        </AnalyticsErrorBoundary>
      </section>
    </main>
  );
}
