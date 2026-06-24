const PALETTE = [
  "hsl(var(--accent))",
  "hsl(var(--accent2))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--danger))",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
];

export function colorForIndex(idx) {
  return PALETTE[idx % PALETTE.length];
}

export default function AnalyticsDonutChart({ items = [], unit = "", ariaLabel = "" }) {
  if (!items.length) {
    return (
      <div className="analyticsDonutChart analyticsDonutChart--empty" data-testid="analytics-donut-chart">
        <p className="analyticsDonutChartEmpty">Нет данных</p>
      </div>
    );
  }

  const total = Math.max(items.reduce((sum, i) => sum + (Number(i.value) || 0), 0), 1);
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = items.map((item, idx) => {
    const value = Number(item.value) || 0;
    const pct = value / total;
    const dash = pct * circumference;
    const segment = {
      label: item.label,
      value,
      pct,
      color: item.color || colorForIndex(idx),
      dash,
      offset,
    };
    offset += dash;
    return segment;
  });

  return (
    <div className="analyticsDonutChart" data-testid="analytics-donut-chart">
      <div className="analyticsDonutChartWrap">
        <svg viewBox="0 0 40 40" className="analyticsDonutChartSvg" role="img" aria-label={ariaLabel || "Donut chart"}>
          <circle cx="20" cy="20" r={radius} className="analyticsDonutChartTrack" />
          {segments.map((s, idx) => (
            <circle
              key={idx}
              cx="20"
              cy="20"
              r={radius}
              className="analyticsDonutChartSegment"
              stroke={s.color}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </svg>
        <div className="analyticsDonutChartCenter">
          <div className="analyticsDonutChartCenterValue">{total}</div>
          <div className="analyticsDonutChartCenterLabel">{unit || "всего"}</div>
        </div>
      </div>
      <div className="analyticsDonutChartLegend">
        {segments.map((s, idx) => (
          <div key={idx} className="analyticsDonutChartLegendItem">
            <span className="analyticsDonutChartLegendDot" style={{ background: s.color }} />
            <span className="analyticsDonutChartLegendLabel" title={s.label}>{s.label}</span>
            <span className="analyticsDonutChartLegendValue">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
