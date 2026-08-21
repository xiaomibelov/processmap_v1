import { useMemo, useState } from "react";
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

function FactLine({ data }) {
  const parts = [];
  if (data.sessions_count != null) parts.push(`${formatNumber(data.sessions_count)} ${t.factSessions}`);
  if (data.projects_count != null) parts.push(`${formatNumber(data.projects_count)} ${t.factProjects}`);
  if (data.properties_summary?.total != null) parts.push(`${formatNumber(data.properties_summary.total)} ${t.factProperties}`);
  if (data.properties_summary?.recalculated_count != null) parts.push(`${formatNumber(data.properties_summary.recalculated_count)} ${t.factRecalculated}`);
  if (data.total_duration_min != null) parts.push(`${formatNumber(data.total_duration_min)} ${t.factDuration}`);
  if (data.critical_path_min != null) parts.push(`${formatNumber(data.critical_path_min)} ${t.factCriticalPath}`);
  if (!parts.length) return <span className="analyticsOverviewFactLine">—</span>;
  return <span className="analyticsOverviewFactLine">{parts.join(" · ")}</span>;
}

function SchemeRow({ scheme }) {
  return (
    <a
      href={`/app?session=${encodeURIComponent(scheme.session_id)}`}
      className="analyticsSchemeRow"
      title={scheme.session_title}
      target="_blank"
      rel="noreferrer"
    >
      <span className="analyticsSchemeName">{scheme.session_title || scheme.session_id}</span>
      <span className="analyticsSchemeMetric">{formatNumber(scheme.actions_total)}</span>
      <span className="analyticsSchemeMetric">{formatNumber(scheme.elements_count)}</span>
      <span className="analyticsSchemeMetric">{formatNumber(scheme.critical_count)}</span>
      <span className="analyticsSchemeMetric">{formatNumber(scheme.handoffs_count)}</span>
      <span className="analyticsSchemeMetric">{formatNumber(scheme.total_duration_min)}&nbsp;мин</span>
    </a>
  );
}

function SchemeProject({ project, expanded, onToggle }) {
  return (
    <div className="analyticsSchemeProject">
      <button
        type="button"
        className={`analyticsSchemeProjectHeader ${expanded ? "analyticsSchemeProjectHeader--expanded" : ""}`}
        onClick={onToggle}
      >
        <span className="analyticsSchemeProjectToggle">{expanded ? "▼" : "▶"}</span>
        <span className="analyticsSchemeProjectTitle">{project.project_title || project.project_id}</span>
        <span className="analyticsSchemeProjectMeta">{formatNumber(project.sessions?.length || 0)} схем</span>
      </button>
      {expanded ? (
        <div className="analyticsSchemeProjectBody">
          <div className="analyticsSchemeHeaderRow">
            <span className="analyticsSchemeName">{t.schemes}</span>
            <span className="analyticsSchemeMetric">{t.schemeTasks}</span>
            <span className="analyticsSchemeMetric">{t.schemeElements}</span>
            <span className="analyticsSchemeMetric">{t.schemeCritical}</span>
            <span className="analyticsSchemeMetric">{t.schemeHandoffs}</span>
            <span className="analyticsSchemeMetric">{t.schemeDuration}</span>
          </div>
          {project.sessions.map((s) => (
            <SchemeRow key={s.session_id} scheme={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SchemesSection({ data }) {
  const schemes = data?.schemes || [];
  const [expanded, setExpanded] = useState(() =>
    schemes.length <= 1 ? new Set(schemes.map((p) => p.project_id)) : new Set()
  );

  const toggle = (projectId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <div className="analyticsSchemesSection">
      <div className="analyticsSchemesHeader">
        <Metric
          label={t.avgTasksPerSession}
          value={formatNumber(data?.avg_tasks_per_session)}
        />
        <Metric
          label={t.avgElementsPerSession}
          value={formatNumber(data?.avg_elements_per_session)}
        />
      </div>
      <div className="analyticsSchemesFacts">
        <FactLine data={data} />
      </div>
      {schemes.length === 0 ? (
        <p className="analyticsOverviewEmpty">{t.schemesEmpty}</p>
      ) : (
        <div className="analyticsSchemesList">
          {schemes.map((project) => (
            <SchemeProject
              key={project.project_id}
              project={project}
              expanded={expanded.has(project.project_id)}
              onToggle={() => toggle(project.project_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GapContext({ ctx }) {
  if (!ctx) return null;
  const prev = (ctx.prev_names || []).join(", ");
  const next = (ctx.next_names || []).join(", ");
  const hasPosition = prev || next;
  const coords = ctx.x != null && ctx.y != null
    ? `${t.gapsPositionCoordinates}: ${Math.round(ctx.x)}, ${Math.round(ctx.y)}`
    : "";
  return (
    <span className="analyticsGapContext">
      {hasPosition
        ? t.gapsContextBetween.replace("{{prev}}", prev || "…").replace("{{next}}", next || "…")
        : coords || "—"}
    </span>
  );
}

function GapsList({ gaps, onNavigate }) {
  if (!gaps?.length) return null;
  const visible = gaps.slice(0, 5);
  const rest = Math.max(gaps.length - visible.length, 0);
  return (
    <div className="analyticsGapsList">
      {visible.map((gap, idx) => (
        <a
          key={idx}
          href={gap.element_url || `/app?session=${encodeURIComponent(gap.session_id || "")}`}
          className="analyticsGapRow"
          target="_blank"
          rel="noreferrer"
          title={gap.bpmn_name}
        >
          <span className="analyticsGapName">{gap.bpmn_name || gap.bpmn_id}</span>
          <span className="analyticsGapPath">
            {gap.project_title || gap.project_id} → {gap.session_title || gap.session_id}
          </span>
          <GapContext ctx={gap.context} />
        </a>
      ))}
      {rest > 0 ? (
        <button
          type="button"
          className="analyticsOverviewLink analyticsGapsShowAll"
          onClick={() => onNavigate?.(ANALYTICS_MODULE_PROPERTIES, { source: "нет данных" })}
        >
          Показать ещё {formatNumber(rest)} →
        </button>
      ) : null}
    </div>
  );
}

export default function AnalyticsOverviewPanel({
  data,
  quality,
  recalcRows,
  gaps,
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

  const noDataRows = useMemo(
    () => (recalcRows || []).filter((r) => r.source === "нет данных"),
    [recalcRows]
  );

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
            {title}: <span className="analyticsOverviewScopeTitle">{data.scope_title || data.scope_id}</span>
            <span className="analyticsOverviewScopeId" title={data.scope_id}>{data.scope_id}</span>
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
        title={t.schemes}
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
        <SchemesSection data={data} />
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
        <GapsList gaps={gaps} onNavigate={onNavigate} />
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
          {(data.open_questions || 0) > 0 ? (
            <AttentionRow
              tone="info"
              title={t.attentionOpenQuestions.replace("{{count}}", data.open_questions)}
              count={data.open_questions}
            />
          ) : null}
          {noDataRows.length === 0 && (data.open_questions || 0) === 0 ? (
            <p className="analyticsOverviewEmpty">{t.emptyAttention}</p>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
