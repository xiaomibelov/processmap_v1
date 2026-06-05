import { useEffect, useState } from "react";
import { apiGetProjectAnalytics } from "../../lib/api.js";
import DashboardMetricCard from "./DashboardMetricCard.jsx";
import { normalizeProjectAnalyticsCards } from "./dashboardModel.js";

export default function ProjectAnalyticsDashboard({
  projectId,
  projectTitle,
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
  }, [projectId]);

  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];

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
          <p className="analyticsDashboardsLoading" data-testid="analytics-loading">Загрузка…</p>
        ) : error ? (
          <p className="analyticsDashboardsError" data-testid="analytics-error">{error}</p>
        ) : (
          <>
            <section className="analyticsDashboardsMetrics" data-testid="analytics-metrics">
              {normalizeProjectAnalyticsCards(data).map((card, idx) => (
                <DashboardMetricCard key={idx} {...card} />
              ))}
            </section>

            <section className="analyticsDashboardsSection" data-testid="analytics-recent-sessions">
              <h2>Последние сессии</h2>
              {sessions.length === 0 ? (
                <p className="analyticsDashboardsEmpty">Нет сессий</p>
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
