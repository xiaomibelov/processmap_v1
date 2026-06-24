function MetricSparkline({ items = [] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => Number(i.value || 0)), 1);
  const rows = items.slice(0, 4);
  const barHeight = 4;
  const gap = 3;
  const width = 60;
  const height = rows.length * (barHeight + gap) - gap;

  return (
    <div className="dashboardMetricCardSparkline" aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {rows.map((item, idx) => {
          const value = Number(item.value || 0);
          const w = max > 0 ? (value / max) * width : 0;
          return (
            <rect
              key={idx}
              className="dashboardMetricCardSparklineBar"
              x="0"
              y={idx * (barHeight + gap)}
              width={Math.max(w, 1)}
              height={barHeight}
              fill="hsl(var(--accent))"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function DashboardMetricCard({
  title,
  value,
  subtitle = "",
  tone = "default",
  testId,
  sparklineItems,
}) {
  const toneClass =
    tone === "success"
      ? " dashboardMetricCard--success"
      : tone === "warning"
        ? " dashboardMetricCard--warning"
        : tone === "danger"
          ? " dashboardMetricCard--danger"
          : "";

  return (
    <div className={`dashboardMetricCard${toneClass}`} data-testid={testId}>
      <div>
        <div className="dashboardMetricCardTitle">{title}</div>
        <div className="dashboardMetricCardValue">{value}</div>
        {subtitle ? <div className="dashboardMetricCardSubtitle">{subtitle}</div> : null}
      </div>
      {sparklineItems && sparklineItems.length > 0 ? <MetricSparkline items={sparklineItems} /> : null}
    </div>
  );
}
