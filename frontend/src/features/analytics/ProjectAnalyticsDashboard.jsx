import { useEffect, useState } from "react";
import { apiGetProjectAnalytics } from "../../lib/api.js";
import DashboardMetricCard from "./DashboardMetricCard.jsx";
import AnalyticsSkeleton from "./AnalyticsSkeleton.jsx";
import AnalyticsErrorState from "./AnalyticsErrorState.jsx";
import AnalyticsEmptyState from "./AnalyticsEmptyState.jsx";
import { normalizeProjectAnalyticsCards } from "./dashboardModel.js";

export default function ProjectAnalyticsDashboard({
  projectId,
  projectTitle,
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
      const result = await apiGetProjectAnalytics(projectId);
      if (!alive) return;
      setLoading(false);
      if (result?.ok) {
        setData(result);
      } else {
        setError(result?.error || "Ошибка загрузки");
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [projectId, retryNonce]);

  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const cards = data ? normalizeProjectAnalyticsCards(data) : [];

  return (
    <div className="analyticsDashboardsPage" data-testid="project-analytics-dashboard">
      <div className="analyticsDashboardsSurface">
        <header className="analyticsDashboardsHeader">
          <div>
            <h1>Аналитика проекта</h1>
            <p>{projectTitle || projectId}</p>
            {workspaceId ? <small>Workspace: {workspaceId}</small> : null}
          </div>
        </header>

        {loading ? (
          <AnalyticsSkeleton />
        ) : error ? (
          <AnalyticsErrorState
            title="Не удалось загрузить аналитику проекта"
            message={error}
            onRetry={() => setRetryNonce((n) => n + 1)}
          />
        ) : (
          <>
            <section className="analyticsDashboardsMetrics" data-testid="analytics-metrics">
              {cards.map((card, idx) => (
                <DashboardMetricCard key={idx} {...card} />
              ))}
            </section>

            <section className="analyticsDashboardsSection" data-testid="analytics-recent-sessions">
              <h2>Последние сессии</h2>
              {sessions.length === 0 ? (
                <AnalyticsEmptyState
                  title="Нет сессий"
                  message="В проекте пока нет завершённых сессий для аналитики."
                />
              ) : (
                <div className="analyticsDashboardsTableWrap">
                  <table className="analyticsDashboardsTable">
                    <thead>
                      <tr>
                        <th>Сессия</th>
                        <th>Длительность</th>
                        <th>Действий</th>
                        <th>Крит. вопросы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.session_id} data-testid={`session-row-${s.session_id}`}>
                          <td>{s.title || s.session_id}</td>
                          <td>{s.duration_min ?? 0} мин</td>
                          <td>{s.actions_count ?? 0}</td>
                          <td>{s.critical_questions ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
