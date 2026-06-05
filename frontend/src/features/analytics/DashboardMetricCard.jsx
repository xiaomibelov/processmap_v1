export default function DashboardMetricCard({
  title,
  value,
  subtitle = "",
  tone = "default",
  testId,
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
      <div className="dashboardMetricCardTitle">{title}</div>
      <div className="dashboardMetricCardValue">{value}</div>
      {subtitle ? (
        <div className="dashboardMetricCardSubtitle">{subtitle}</div>
      ) : null}
    </div>
  );
}
