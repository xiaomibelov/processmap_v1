import { useEffect, useState } from "react";
import { apiGetWorkspaceAnalytics } from "../../lib/api.js";
import DashboardMetricCard from "./DashboardMetricCard.jsx";
import { normalizeWorkspaceAnalyticsCards } from "./dashboardModel.js";

export default function WorkspaceAnalyticsDashboard({ workspaceId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const result = await apiGetWorkspaceAnalytics(workspaceId);
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
  }, [workspaceId]);

  const cards = normalizeWorkspaceAnalyticsCards(data);
  const recentSessions = Array.isArray(data?.recent_sessions)
    ? data.recent_sessions
    : [];

  return (
    <div className="analyticsDashboardsPage" data-testid="workspace-analytics-dashboard">
      <div className="analyticsDashboardsSurface">
        <header className="analyticsDashboardsHeader">
          <div>
            <h1>Аналитика workspace</h1>
            <p>{workspaceId}</p>
          </div>
        </header>

        {loading ? (
          <p className="analyticsDashboardsLoading" data-testid="analytics-loading">Загрузка…</p>
        ) : error ? (
          <p className="analyticsDashboardsError" data-testid="analytics-error">{error}</p>
        ) : (
          <>
            <section className="analyticsDashboardsMetrics" data-testid="analytics-metrics">
              {cards.map((card, idx) => (
                <DashboardMetricCard key={idx} {...card} />
              ))}
            </section>

            <section className="analyticsDashboardsSection" data-testid="analytics-recent-sessions">
              <h2>Последние сессии</h2>
              {recentSessions.length === 0 ? (
                <p className="analyticsDashboardsEmpty">Нет сессий</p>
              ) : (
                <div className="analyticsDashboardsTableWrap">
                  <table className="analyticsDashboardsTable">
                    <thead>
                      <tr>
                        <th>Сессия</th>
                        <th>Проект</th>
                        <th>Длительность</th>
                        <th>Действий</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSessions.map((s, idx) => (
                        <tr key={s.session_id || idx} data-testid={`session-row-${s.session_id || idx}`}>
                          <td>{s.title || s.session_id}</td>
                          <td>{s.project_title || s.project_id || "—"}</td>
                          <td>{s.duration_min ?? 0} мин</td>
                          <td>{s.actions_count ?? 0}</td>
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
