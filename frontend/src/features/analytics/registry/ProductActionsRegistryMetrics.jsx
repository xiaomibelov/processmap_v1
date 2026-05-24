function fmt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : "—";
}

function Metric({ value, label, accent = false }) {
  return (
    <span className="productActionsRegistryMetric" data-accent={accent ? "incomplete" : null}>
      <span className="productActionsRegistryMetricValue">{value}</span>
      <span className="productActionsRegistryMetricLabel">{label}</span>
    </span>
  );
}

export default function ProductActionsRegistryMetrics({
  visibleSessionTotal = 0,
  summary = {},
  filteredSummary = {},
}) {
  const total = fmt(summary.rows);
  const filtered = fmt(filteredSummary.rows);
  const sameAsTotal = total === filtered;
  return (
    <section className="productActionsRegistryMetrics" aria-label="Сводка реестра">
      <Metric value={fmt(visibleSessionTotal)} label="Сессий" />
      <Metric value={total} label="Строк" />
      <Metric value={fmt(summary.complete)} label="Полных" />
      <Metric value={fmt(summary.incomplete)} label="Неполных" accent />
      <span
        className="productActionsRegistryMetric productActionsRegistryMetric--filtered"
        data-muted={sameAsTotal ? "true" : null}
      >
        <span className="productActionsRegistryMetricValue">{filtered}</span>
        <span className="productActionsRegistryMetricLabel">После фильтров</span>
      </span>
    </section>
  );
}
