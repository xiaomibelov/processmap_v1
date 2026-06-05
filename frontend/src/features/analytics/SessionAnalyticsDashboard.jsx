import { useEffect, useState } from "react";
import { apiGetSessionAnalytics } from "../../lib/api.js";
import DashboardMetricCard from "./DashboardMetricCard.jsx";
import DashboardBarChart from "./DashboardBarChart.jsx";
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
  }, [sessionId]);


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
          <p className="analyticsDashboardsLoading" data-testid="analytics-loading">Загрузка…</p>
        ) : error ? (
          <p className="analyticsDashboardsError" data-testid="analytics-error">{error}</p>
        ) : (
          <>
            <section className="analyticsDashboardsMetrics" data-testid="analytics-metrics">
              {sessionAnalyticsToCards(data).map((card, idx) => (
                <DashboardMetricCard key={idx} {...card} />
              ))}
            </section>

            <section className="analyticsDashboardsSection" data-testid="analytics-actions-by-role">
              <h2>Действия по ролям</h2>
              <DashboardBarChart items={sessionAnalyticsToBarChartItems(data)} ariaLabel="Действия по ролям" />
            </section>

            <section className="analyticsDashboardsSection" data-testid="analytics-actions-by-section">
              <h2>Действия по секциям</h2>
              <DashboardBarChart items={sessionAnalyticsToBarChartItemsBySection(data)} ariaLabel="Действия по секциям" />
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
