import { useMemo } from "react";
import { ru } from "../../shared/i18n/ru.js";
import {
  RefreshIcon,
  WarningIcon,
} from "./AnalyticsIcons.jsx";
import EmptyState from "./registry/EmptyState.jsx";
import { AnalyticsError, AnalyticsLoading } from "./AnalyticsStatus.jsx";
import {
  ANALYTICS_MODULE_ACTIONS,
  ANALYTICS_MODULE_PROPERTIES,
} from "../../app/processMapRouteModel.js";

const t = ru.analytics;

function text(value) {
  return String(value || "").trim();
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

function fmtPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

function Section({ title, children, action }) {
  return (
    <section className="analyticsOverviewSection">
      <div className="analyticsOverviewSectionHeader">
        <h2 className="analyticsOverviewSectionTitle">{title}</h2>
        {action ? <div className="analyticsOverviewSectionAction">{action}</div> : null}
      </div>
      <div className="analyticsOverviewSectionBody">{children}</div>
    </section>
  );
}

function Metric({ label, value, unit = "" }) {
  return (
    <div className="analyticsOverviewMetric">
      <span className="analyticsOverviewMetricValue">
        {value}
        {unit ? <span className="analyticsOverviewMetricUnit">{unit}</span> : null}
      </span>
      <span className="analyticsOverviewMetricLabel">{label}</span>
    </div>
  );
}

function AttentionRow({ tone, title, count, onClick }) {
  return (
    <button
      type="button"
      className={`analyticsOverviewAttentionRow analyticsOverviewAttentionRow--${tone}`}
      onClick={onClick}
    >
      <span className="analyticsOverviewAttentionBadge" aria-hidden="true" />
      <span className="analyticsOverviewAttentionTitle">{title}</span>
      {count != null ? <span className="analyticsOverviewAttentionCount">{formatNumber(count)}</span> : null}
    </button>
  );
}

function ProcessDurationRow({ title, avgDurationMin, sessionsCount }) {
  return (
    <div className="analyticsOverviewProcessRow">
      <span className="analyticsOverviewProcessTitle" title={title}>{title || "—"}</span>
      <span className="analyticsOverviewProcessMeta">
        {avgDurationMin != null ? `${formatNumber(avgDurationMin)} мин` : "—"}
        {sessionsCount != null ? ` · ${formatNumber(sessionsCount)} сессий` : null}
      </span>
    </div>
  );
}

export default function AnalyticsOverviewPanel({
  data,
  quality,
  recalcRows,
  loading,
  error,
  refreshing,
  onRefresh,
  onRetry,
  onNavigate,
}) {
  const title = useMemo(() => {
    if (!data) return "";
    if (data.scope_type === "session") return t.scopeSession;
    if (data.scope_type === "project") return t.scopeProject;
    return t.scopeWorkspace;
  }, [data]);

  const actionsByRole = data?.actions_by_role || {};
  const topRoles = useMemo(() => {
    return Object.entries(actionsByRole)
      .map(([label, value]) => ({ label, value: Number(value) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [actionsByRole]);

  const noDataRows = useMemo(
    () => (recalcRows || []).filter((r) => r.source === "нет данных"),
    [recalcRows]
  );

  const criticalRows = useMemo(
    () => (recalcRows || []).filter((r) => r.source === "property" && (r.result || 0) > 0).slice(0, 5),
    [recalcRows]
  );

  const processDurations = data?.process_duration || [];
  const recentSessions = data?.recent_sessions || [];

  if (loading && !data) {
    return <AnalyticsLoading text={t.loadingOverview} />;
  }

  if (error) {
    return <AnalyticsError message={error} onRetry={onRetry} />;
  }

  if (!data) {
    return <EmptyState title={t.noData} description={t.selectScope} />;
  }

  return (
    <div className="analyticsOverviewPanel" data-testid="analytics-overview-panel">
      <header className="analyticsOverviewHeader">
        <div className="analyticsOverviewHeaderMain">
          <h1 className="analyticsOverviewTitle">
            {title} <span className="analyticsOverviewScopeId" title={data.scope_id}>{data.scope_id}</span>
          </h1>
          <div className="analyticsOverviewMeta">
            <span className="analyticsOverviewUpdated">
              {t.updated}: {formatDate(data.computed_at)}
            </span>
            {data.computed_at && Date.now() / 1000 - data.computed_at > 90000 ? (
              <span className="analyticsOverviewStale" title={t.staleTooltip}>
                <WarningIcon className="w-3 h-3" /> {t.stale}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="analyticsOverviewRefreshBtn"
          onClick={onRefresh}
          disabled={refreshing}
          title={t.refreshTooltip}
        >
          <RefreshIcon className="w-4 h-4" />
          {refreshing ? t.refreshing : t.refresh}
        </button>
      </header>

      <Section
        title={t.summary}
        action={
          <button
            type="button"
            className="analyticsOverviewLink"
            onClick={() => onNavigate?.(ANALYTICS_MODULE_ACTIONS)}
          >
            {t.openActions} →
          </button>
        }
      >
        <div className="analyticsOverviewSummaryGrid">
          <Metric label={t.actionsCount} value={formatNumber(data.actions_total)} />
          <Metric label={t.durationMin} value={`${formatNumber(data.total_duration_min)}`} unit="мин" />
          <Metric
            label={t.criticalPathMin}
            value={data.critical_path_min != null ? formatNumber(data.critical_path_min) : "—"}
            unit={data.critical_path_min != null ? "мин" : ""}
          />
          <Metric label={t.handoffs} value={formatNumber(data.handoffs_count)} />
          <Metric label={t.sessions} value={formatNumber(data.sessions_count)} />
          <Metric label={t.projects} value={formatNumber(data.projects_count)} />
          <Metric label={t.openQuestions} value={formatNumber(data.open_questions)} />
          <Metric
            label={t.propertiesCount}
            value={formatNumber(data.properties_summary?.total)}
          />
          <Metric
            label={t.recalculated}
            value={formatNumber(data.properties_summary?.recalculated_count)}
          />
        </div>
      </Section>

      <Section
        title={t.dataQuality}
        action={
          <button
            type="button"
            className="analyticsOverviewLink"
            onClick={() =>
              onNavigate?.(ANALYTICS_MODULE_PROPERTIES, { source: "нет данных" })
            }
          >
            {t.problemProperties} →
          </button>
        }
      >
        <div className="analyticsOverviewQualityGrid">
          <Metric
            label={t.eeTimeFilled}
            value={fmtPct(quality?.ee_time_filled_pct)}
          />
          <Metric
            label={t.ingredientNumeric}
            value={fmtPct(quality?.ingredient_numeric_pct)}
          />
          <Metric
            label={t.noDataRows}
            value={formatNumber(quality?.no_data_count)}
          />
        </div>
        {(quality?.no_data_count || 0) > 0 ? (
          <p className="analyticsOverviewQualityHint">
            <WarningIcon className="w-4 h-4" />
            {t.noDataHint}
          </p>
        ) : null}
      </Section>

      <Section title={t.attention}>
        <div className="analyticsOverviewAttentionList">
          {noDataRows.length > 0 ? (
            <AttentionRow
              tone="warning"
              title={t.attentionNoDataIngredient.replace("{{count}}", noDataRows.length)}
              count={noDataRows.length}
              onClick={() => onNavigate?.(ANALYTICS_MODULE_PROPERTIES, { source: "нет данных" })}
            />
          ) : null}
          {criticalRows.length > 0 ? (
            <AttentionRow
              tone="danger"
              title={t.attentionCritical.replace("{{count}}", criticalRows.length)}
              count={criticalRows.length}
              onClick={() => onNavigate?.(ANALYTICS_MODULE_PROPERTIES, { property: "ee_time" })}
            />
          ) : null}
          {(data.open_questions || 0) > 0 ? (
            <AttentionRow
              tone="info"
              title={t.attentionOpenQuestions.replace("{{count}}", data.open_questions)}
              count={data.open_questions}
            />
          ) : null}
          {noDataRows.length === 0 && criticalRows.length === 0 && (data.open_questions || 0) === 0 ? (
            <p className="analyticsOverviewEmpty">{t.emptyAttention}</p>
          ) : null}
        </div>
      </Section>

      <Section
        title={t.structure}
        action={
          <button
            type="button"
            className="analyticsOverviewLink"
            onClick={() => onNavigate?.(ANALYTICS_MODULE_PROPERTIES)}
          >
            {t.openProperties} →
          </button>
        }
      >
        {processDurations.length > 0 ? (
          <div className="analyticsOverviewProcessList">
            {processDurations.map((p, idx) => (
              <ProcessDurationRow
                key={idx}
                title={p.process_title}
                avgDurationMin={p.avg_duration_min}
                sessionsCount={p.sessions_count}
              />
            ))}
          </div>
        ) : recentSessions.length > 0 ? (
          <div className="analyticsOverviewSessionList">
            {recentSessions.slice(0, 5).map((s) => (
              <div key={s.id} className="analyticsOverviewSessionRow">
                <span className="analyticsOverviewSessionTitle" title={s.title}>{s.title || s.id}</span>
                <span className="analyticsOverviewSessionMeta">
                  {s.actions_total != null ? `${formatNumber(s.actions_total)} действий` : null}
                  {s.total_duration_min != null ? ` · ${formatNumber(s.total_duration_min)} мин` : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="analyticsOverviewEmpty">{t.emptyStructure}</p>
        )}
      </Section>
    </div>
  );
}
