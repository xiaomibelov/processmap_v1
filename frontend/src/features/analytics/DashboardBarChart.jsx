import { colorForIndex } from "./AnalyticsDonutChart.jsx";

export default function DashboardBarChart({ items = [], unit = "", ariaLabel = "" }) {
  if (!items.length) {
    return (
      <div className="dashboardBarChart dashboardBarChart--empty" data-testid="dashboard-bar-chart">
        <p className="dashboardBarChartEmpty">Нет данных</p>
      </div>
    );
  }

  const max = Math.max(...items.map((i) => Number(i.max || i.value || 0)), 1);

  return (
    <div className="dashboardBarChart" data-testid="dashboard-bar-chart" role="img" aria-label={ariaLabel || "Bar chart"}>
      {items.map((item, idx) => {
        const value = Number(item.value || 0);
        const pct = max > 0 ? (value / max) * 100 : 0;
        const color = item.color || colorForIndex(idx);
        return (
          <div className="dashboardBarChartRow" key={idx} data-testid={`bar-chart-row-${idx}`}>
            <span className="dashboardBarChartLabel" title={item.label}>{item.label}</span>
            <div className="dashboardBarTrack">
              <div
                className="dashboardBarFill"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="dashboardBarChartValue">
              {value}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
