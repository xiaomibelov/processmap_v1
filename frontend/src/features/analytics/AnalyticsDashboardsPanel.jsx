import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { apiGetAnalyticsActionsSummary, apiGetAnalyticsPropertiesSummary } from "../../lib/api.js";
import DashboardBarChart from "./DashboardBarChart.jsx";
import AnalyticsDonutChart, { colorForIndex } from "./AnalyticsDonutChart.jsx";
import { AnalyticsError, AnalyticsLoading } from "./AnalyticsStatus.jsx";
import EmptyState from "./registry/EmptyState.jsx";

function text(value) {
  return String(value || "").trim();
}

function chartItems(map = {}) {
  return Object.entries(map || {})
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value);
}

function summaryItems(rows = [], labelKey = "label", valueKey = "count") {
  return (rows || [])
    .map((r, idx) => ({
      label: text(r[labelKey]) || "—",
      value: Number(r[valueKey]) || 0,
      color: colorForIndex(idx),
    }))
    .sort((a, b) => b.value - a.value);
}

function useAnalyticsSummaries(scope, scopeId) {
  const [propertySummary, setPropertySummary] = useState(null);
  const [actionSummary, setActionSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const loadData = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const [pResult, aResult] = await Promise.all([
        apiGetAnalyticsPropertiesSummary(scope, scopeId, {}, { signal }),
        apiGetAnalyticsActionsSummary(scope, scopeId, {}, { signal }),
      ]);
      if (signal?.aborted) return;
      setLoading(false);
      if (!pResult?.ok && !aResult?.ok) {
        setError(text(pResult?.error || aResult?.error) || "Не удалось загрузить сводки аналитики.");
        return;
      }
      setPropertySummary(pResult?.ok ? pResult.data : null);
      setActionSummary(aResult?.ok ? aResult.data : null);
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

  return { propertySummary, actionSummary, loading, error, retry: () => loadData() };
}

function ChartCard({ title, children }) {
  return (
    <div className="analyticsDashboardCard">
      <h3 className="analyticsDashboardCardTitle">{title}</h3>
      {children}
    </div>
  );
}

export default function AnalyticsDashboardsPanel({ scope, scopeId, data = null, loading: dashboardLoading = false, error: dashboardError = "" }) {
  const { propertySummary, actionSummary, loading: summaryLoading, error: summaryError, retry: retrySummaries } = useAnalyticsSummaries(scope, scopeId);

  const roleItems = useMemo(() => {
    if (scope === "session" && data?.actions_by_role) return chartItems(data.actions_by_role);
    return summaryItems(actionSummary?.by_role);
  }, [scope, data, actionSummary]);

  const sectionItems = useMemo(() => {
    if (scope === "session" && data?.actions_by_section) return chartItems(data.actions_by_section);
    return summaryItems(actionSummary?.by_section);
  }, [scope, data, actionSummary]);

  const typeItems = useMemo(() => {
    if (scope === "session" && data?.actions_by_type) return chartItems(data.actions_by_type);
    return summaryItems(actionSummary?.by_type);
  }, [scope, data, actionSummary]);

  const familyItems = useMemo(() => summaryItems(propertySummary?.by_family), [propertySummary]);
  const categoryItems = useMemo(() => summaryItems(propertySummary?.by_category), [propertySummary]);
  const valueTypeItems = useMemo(() => summaryItems(propertySummary?.by_value_type), [propertySummary]);
  const topUsedItems = useMemo(
    () =>
      (propertySummary?.top_used || [])
        .map((r, idx) => ({
          label: text(r.name) || "—",
          value: Number(r.usage_count) || 0,
          color: colorForIndex(idx),
        }))
        .sort((a, b) => b.value - a.value),
    [propertySummary]
  );

  const hasActionCharts = roleItems.length > 0 || sectionItems.length > 0 || typeItems.length > 0;
  const hasPropertyCharts = familyItems.length > 0 || categoryItems.length > 0 || valueTypeItems.length > 0 || topUsedItems.length > 0;
  const hasAnyCharts = hasActionCharts || hasPropertyCharts;

  if ((dashboardLoading || summaryLoading) && !propertySummary && !actionSummary && !data) {
    return <AnalyticsLoading text="Загрузка дашбордов…" />;
  }
  if (dashboardError || summaryError) {
    return <AnalyticsError message={dashboardError || summaryError} onRetry={() => { if (dashboardError) retry?.(); retrySummaries?.(); }} />;
  }
  if (!hasAnyCharts) {
    return (
      <EmptyState
        title="Нет визуализаций"
        description="Для текущего scope недостаточно данных для построения графиков."
      />
    );
  }

  return (
    <div className="analyticsDashboardsGrid">
      {familyItems.length > 0 ? (
        <ChartCard title="Распределение по семействам свойств">
          <AnalyticsDonutChart items={familyItems} ariaLabel="Распределение по семействам свойств" />
        </ChartCard>
      ) : null}
      {valueTypeItems.length > 0 ? (
        <ChartCard title="Распределение по типам значений">
          <AnalyticsDonutChart items={valueTypeItems} ariaLabel="Распределение по типам значений" />
        </ChartCard>
      ) : null}
      {categoryItems.length > 0 ? (
        <ChartCard title="Распределение по категориям">
          <DashboardBarChart items={categoryItems} ariaLabel="Распределение по категориям" />
        </ChartCard>
      ) : null}
      {topUsedItems.length > 0 ? (
        <ChartCard title="Топ-20 используемых свойств">
          <DashboardBarChart items={topUsedItems} ariaLabel="Топ-20 используемых свойств" />
        </ChartCard>
      ) : null}
      {roleItems.length > 0 ? (
        <ChartCard title="Действия по ролям">
          <DashboardBarChart items={roleItems} ariaLabel="Действия по ролям" />
        </ChartCard>
      ) : null}
      {sectionItems.length > 0 ? (
        <ChartCard title="Действия по секциям">
          <DashboardBarChart items={sectionItems} ariaLabel="Действия по секциям" />
        </ChartCard>
      ) : null}
      {typeItems.length > 0 ? (
        <ChartCard title="Распределение по типам действий">
          <AnalyticsDonutChart items={typeItems} ariaLabel="Распределение по типам действий" />
        </ChartCard>
      ) : null}
    </div>
  );
}
