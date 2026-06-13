import { useEffect, useState } from "react";
import { apiGetSessionAnalytics } from "../../lib/api.js";
import DashboardMetricCard from "./DashboardMetricCard.jsx";
import DashboardBarChart from "./DashboardBarChart.jsx";
import AnalyticsSkeleton from "./AnalyticsSkeleton.jsx";
import AnalyticsErrorState from "./AnalyticsErrorState.jsx";
import AnalyticsEmptyState from "./AnalyticsEmptyState.jsx";
import {
  sessionAnalyticsToCards,
  sessionAnalyticsToBarChartItems,
  sessionAnalyticsToBarChartItemsBySection,
} from "./dashboardModel.js";

export default function SessionAnalyticsDashboard({
  sessionId,
  sessionTitle,
  workspaceId,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const result = await apiGetSessionAnalytics(sessionId);
      if (!alive) return;
      setLoading(false);
      if (result?.ok) {
        setData(result.analytics || {});
      } else {
        setError(result?.error || "Ошибка загрузки");
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [sessionId, retryNonce]);

  const cards = data ? sessionAnalyticsToCards(data) : [];
  const byRole = data ? sessionAnalyticsToBarChartItems(data) : [];
  const bySection = data ? sessionAnalyticsToBarChartItemsBySection(data) : [];
  const hasContent = cards.length > 0 || byRole.length > 0 || bySection.length > 0 || (data?.summary?.length > 0);

  return (
    <div className="analyticsDashboardsPage" data-testid="session-analytics-dashboard">
      <div className="analyticsDashboardsSurface">
        <header className="analyticsDashboardsHeader">
          <div>
            <h1>Аналитика сессии</h1>
            <p>{sessionTitle || sessionId}</p>
            {workspaceId ? <small>Workspace: {workspaceId}</small> : null}
          </div>
        </header>

        {loading ? (
          <AnalyticsSkeleton />
        ) : error ? (
          <AnalyticsErrorState
            title="Не удалось загрузить аналитику сессии"
            message={error}
            onRetry={() => setRetryNonce((n) => n + 1)}
          />
        ) : !hasContent ? (
          <AnalyticsEmptyState
            title="Нет данных по сессии"
            message="Для этой сессии ещё не собрана аналитика."
          />
        ) : (
          <>
            <section className="analyticsDashboardsMetrics" data-testid="analytics-metrics">
              {cards.map((card, idx) => (
                <DashboardMetricCard key={idx} {...card} />
              ))}
            </section>

            <section className="analyticsDashboardsSection" data-testid="analytics-actions-by-role">
              <h2>Действия по ролям</h2>
              {byRole.length > 0 ? (
                <DashboardBarChart items={byRole} ariaLabel="Действия по ролям" />
              ) : (
                <AnalyticsEmptyState title="Нет данных по ролям" message="" />
              )}
            </section>

            <section className="analyticsDashboardsSection" data-testid="analytics-actions-by-section">
              <h2>Действия по секциям</h2>
              {bySection.length > 0 ? (
                <DashboardBarChart items={bySection} ariaLabel="Действия по секциям" />
              ) : (
                <AnalyticsEmptyState title="Нет данных по секциям" message="" />
              )}
            </section>

            {data?.summary?.length ? (
              <section className="analyticsDashboardsSection" data-testid="analytics-summary">
                <h2>Сводка</h2>
                <ul className="analyticsDashboardsSummaryList">
                  {data.summary.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
