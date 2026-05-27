function toText(value) {
  return String(value || "").trim();
}

export default function MetricsRow({ metrics = [] }) {
  return (
    <div className="registryMetricsRow" data-testid="registry-metrics-row">
      {metrics.map((m, i) => {
        const value = m.value == null ? "—" : `${m.value}${toText(m.unit)}`;
        const isFillRate = toText(m.label).toLowerCase().includes("заполненность");
        const isIncomplete = toText(m.label).toLowerCase().includes("без продукта") || toText(m.label).toLowerCase().includes("неполн");
        const numeric = Number(m.value);
        let colorVar = "#111827";
        if (isFillRate && Number.isFinite(numeric)) {
          colorVar = numeric >= 80 ? "var(--registry-green-complete)" : "var(--registry-orange-partial)";
        } else if (isIncomplete && Number.isFinite(numeric)) {
          colorVar = "var(--registry-orange-partial)";
        }
        return (
          <div key={`${m.label}-${i}`} className="registryMetricBlock" data-testid="registry-metric-block">
            <span className="registryMetricValue" style={{ color: colorVar }} data-testid="registry-metric-value">
              {value}
            </span>
            <span className="registryMetricLabel">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}
