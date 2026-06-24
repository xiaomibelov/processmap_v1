import { ActivityIcon } from "./AnalyticsIcons.jsx";

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
              fill="currentColor"
            />
          );
        })}
      </svg>
    </div>
  );
}

const TONE_CLASSES = {
  default: "",
  success: " dashboardMetricCard--success",
  warning: " dashboardMetricCard--warning",
  danger: " dashboardMetricCard--danger",
  accent: " dashboardMetricCard--accent",
  blue: " dashboardMetricCard--blue",
  teal: " dashboardMetricCard--teal",
  amber: " dashboardMetricCard--amber",
  orange: " dashboardMetricCard--orange",
  slate: " dashboardMetricCard--slate",
};

export default function DashboardMetricCard({
  title,
  value,
  unit = "",
  subtitle = "",
  tone = "default",
  icon: Icon = ActivityIcon,
  testId,
  sparklineItems,
  change,
}) {
  const toneClass = TONE_CLASSES[tone] || "";

  return (
    <div className={`dashboardMetricCard${toneClass}`} data-testid={testId}>
      <div className="dashboardMetricCardTop">
        <div>
          <div className="dashboardMetricCardTitle">{title}</div>
          <div className="dashboardMetricCardValueWrap">
            <span className="dashboardMetricCardValue">{value}</span>
            {unit ? <span className="dashboardMetricCardUnit">{unit}</span> : null}
          </div>
          {subtitle ? <div className="dashboardMetricCardSubtitle">{subtitle}</div> : null}
        </div>
        {Icon ? (
          <div className="dashboardMetricCardIcon" aria-hidden="true">
            <Icon className="w-5 h-5" />
          </div>
        ) : null}
      </div>
      <div className="dashboardMetricCardFooter">
        {change != null ? (
          <span className={`dashboardMetricCardChange ${Number(change) >= 0 ? "dashboardMetricCardChange--up" : "dashboardMetricCardChange--down"}`}>
            {Number(change) >= 0 ? "↑" : "↓"} {Math.abs(Number(change))}%
          </span>
        ) : null}
        {sparklineItems && sparklineItems.length > 0 ? <MetricSparkline items={sparklineItems} /> : null}
      </div>
    </div>
  );
}
