import { useEffect, useMemo, useState } from "react";
import {
  apiGetAnalyticsActions,
  apiGetAnalyticsDashboard,
  apiGetAnalyticsProperties,
} from "../../lib/api.js";
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
  if (!Number.isFinite(n)) return "—";
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
  { id: ANALYTICS_MODULE_OVERVIEW, label: "Обзор" },
  { id: ANALYTICS_MODULE_ACTIONS, label: "Действия" },
  { id: ANALYTICS_MODULE_PROPERTIES, label: "Свойства" },
  { id: ANALYTICS_MODULE_DASHBOARDS, label: "Дашборды" },
];

function useAnalyticsDashboard(scope, scopeId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const result = await apiGetAnalyticsDashboard(scope, scopeId);
      if (!alive) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || "Не удалось загрузить аналитику.");
        return;
      }
      setData(result.data);
    }
    load();
    return () => {
      alive = false;
    };
  }, [scope, scopeId]);

  return { data, loading, error };
}

function MetricCard({ label, value, subtext = "" }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-fg">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-muted">{subtext}</div> : null}
    </div>
  );
}

function FilterBar({ options = {}, filters = {}, onChange }) {
  const entries = Object.entries(options).filter(([, values]) => toArray(values).length > 0);
  if (!entries.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {entries.map(([key, values]) => (
        <select
          key={key}
          value={filters[key] || ""}
          onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
          className="rounded-md border border-border bg-panel px-2 py-1 text-sm text-fg"
        >
          <option value="">{key}</option>
          {toArray(values).map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      ))}
      <button
        type="button"
        onClick={() => onChange({})}
        className="text-xs text-muted hover:text-fg"
      >
        Сбросить
      </button>
    </div>
  );
}

function Paginator({ page, limit, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-md border border-border px-2 py-1 text-sm disabled:opacity-40"
      >
        ←
      </button>
      <span className="text-sm text-muted">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-md border border-border px-2 py-1 text-sm disabled:opacity-40"
      >
        →
      </button>
    </div>
  );
}

function AnalyticsActionsPanel({ scope, scopeId }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const params = { page, limit };
      if (filters.section) params.section_filter = [filters.section];
      if (filters.role) params.role_filter = [filters.role];
      if (filters.type) params.type_filter = [filters.type];
      const result = await apiGetAnalyticsActions(scope, scopeId, params);
      if (!alive) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || "Не удалось загрузить реестр действий.");
        return;
      }
      setRows(result.rows);
      setTotal(result.total);
      setOptions(result.filter_options || {});
    }
    load();
    return () => {
      alive = false;
    };
  }, [scope, scopeId, page, limit, filters]);

  return (
    <div>
      <FilterBar options={options} filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
      {loading ? <div className="text-sm text-muted">Загрузка…</div> : null}
      {error ? <div className="text-sm text-red-500">{error}</div> : null}
      {!loading && !rows.length ? <div className="text-sm text-muted">Нет данных.</div> : null}
      {rows.length ? (
        <div className="overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel2 text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Действие</th>
                <th className="px-3 py-2">Секция</th>
                <th className="px-3 py-2">Роль</th>
                <th className="px-3 py-2">Тип</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.registry_id || row.id || idx}`} className="border-t border-border">
                  <td className="px-3 py-2">{text(row.name || row.action_name)}</td>
                  <td className="px-3 py-2">{text(row.section)}</td>
                  <td className="px-3 py-2">{text(row.role)}</td>
                  <td className="px-3 py-2">{text(row.action_type || row.type)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Paginator page={page} limit={limit} total={total} onChange={setPage} />
    </div>
  );
}

function AnalyticsPropertiesPanel({ scope, scopeId }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const params = { page, limit };
      if (filters.type) params.type_filter = [filters.type];
      if (filters.category) params.category_filter = [filters.category];
      if (filters.source) params.source_filter = [filters.source];
      const result = await apiGetAnalyticsProperties(scope, scopeId, params);
      if (!alive) return;
      setLoading(false);
      if (!result?.ok) {
        setError(text(result?.error) || "Не удалось загрузить реестр свойств.");
        return;
      }
      setRows(result.rows);
      setTotal(result.total);
      setOptions(result.filter_options || {});
    }
    load();
    return () => {
      alive = false;
    };
  }, [scope, scopeId, page, limit, filters]);

  return (
    <div>
      <FilterBar options={options} filters={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
      {loading ? <div className="text-sm text-muted">Загрузка…</div> : null}
      {error ? <div className="text-sm text-red-500">{error}</div> : null}
      {!loading && !rows.length ? <div className="text-sm text-muted">Нет данных.</div> : null}
      {rows.length ? (
        <div className="overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel2 text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Свойство</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2">Категория</th>
                <th className="px-3 py-2">Источник</th>
                <th className="px-3 py-2">Значение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.id || row.bpmn_id || idx}`} className="border-t border-border">
                  <td className="px-3 py-2">{text(row.name || row.property_name || row.label)}</td>
                  <td className="px-3 py-2">{text(row.type)}</td>
                  <td className="px-3 py-2">{text(row.category)}</td>
                  <td className="px-3 py-2">{text(row.source)}</td>
                  <td className="px-3 py-2">{text(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Paginator page={page} limit={limit} total={total} onChange={setPage} />
    </div>
  );
}

function AnalyticsDashboardsPanel() {
  return (
    <div className="rounded-xl border border-border bg-panel p-6 text-center text-sm text-muted">
      Дашборды будут подключены отдельным контуром.
    </div>
  );
}

export default function AnalyticsPage({ scope, scopeId, module, orgId }) {
  const { data, loading, error } = useAnalyticsDashboard(scope, scopeId);

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
    const next = buildAnalyticsPath(targetScope, targetId, module);
    window.history.pushState({}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function setModule(nextModule) {
    const next = buildAnalyticsPath(scope, scopeId, nextModule);
    window.history.pushState({}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const title = scope === "session" ? "Аналитика сессии" : scope === "project" ? "Аналитика проекта" : "Аналитика workspace";

  return (
    <main className="analyticsHubPage" data-testid="analytics-page">
      <section className="analyticsHubSurface">
        <header className="analyticsHubHeader">
          <div>
            <h1>{title}</h1>
            <p>Backend-driven аналитика по выбранному scope.</p>
            <AnalyticsScopeSwitcher
              scope={scope}
              scopeId={scopeId}
              workspaceId={derivedScopeIds.workspaceId}
              projectId={derivedScopeIds.projectId}
              sessionId={derivedScopeIds.sessionId}
              onChange={navigateTo}
            />
          </div>
          <div className="text-right text-xs text-muted">
            {orgId ? <div>Org: {orgId}</div> : null}
            {data?.computed_at ? <div>Обновлено: {formatDate(data.computed_at)}</div> : null}
          </div>
        </header>

        <div className="mb-4 flex items-center gap-1 border-b border-border">
          {MODULE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setModule(tab.id)}
              className={`px-3 py-2 text-sm font-medium transition ${
                module === tab.id
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {module === ANALYTICS_MODULE_OVERVIEW && (
          <div>
            {loading ? <div className="text-sm text-muted">Загрузка…</div> : null}
            {error ? <div className="text-sm text-red-500">{error}</div> : null}
            {data ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard label="Всего действий" value={formatNumber(data.actions_total)} />
                <MetricCard label="Продолжительность, мин" value={formatNumber(data.total_duration_min)} />
                <MetricCard label="Критический путь, мин" value={formatNumber(data.critical_path_min)} />
                <MetricCard label="Рукопожатий" value={formatNumber(data.handoffs_count)} />
                <MetricCard label="Открытых вопросов" value={formatNumber(data.open_questions)} />
                <MetricCard label="Критических вопросов" value={formatNumber(data.critical_questions)} />
                <MetricCard label="Сессий" value={formatNumber(data.sessions_count)} />
                <MetricCard label="Проектов" value={formatNumber(data.projects_count)} />
              </div>
            ) : null}
          </div>
        )}
        {module === ANALYTICS_MODULE_ACTIONS && <AnalyticsActionsPanel scope={scope} scopeId={scopeId} />}
        {module === ANALYTICS_MODULE_PROPERTIES && <AnalyticsPropertiesPanel scope={scope} scopeId={scopeId} />}
        {module === ANALYTICS_MODULE_DASHBOARDS && <AnalyticsDashboardsPanel />}
      </section>
    </main>
  );
}
