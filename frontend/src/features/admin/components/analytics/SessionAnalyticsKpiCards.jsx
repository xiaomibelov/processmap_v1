import KpiCard from "../common/KpiCard";

function formatPct(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num}%` : "—";
}

// KPI row for the summary payload. Every number/percentage comes from the
// server; tones only mirror the server-side semantics (real_work → emerald,
// abandoned → amber, neutral → slate).
export default function SessionAnalyticsKpiCards({ summary = {} }) {
  const cards = [
    {
      title: "Всего сессий",
      value: summary.total_sessions ?? "—",
      hint: `Пользователей: ${summary.total_users ?? "—"}`,
      tone: "default",
    },
    {
      title: "Версий всего",
      value: summary.total_versions ?? "—",
      hint: `Среднее на сессию с историей: ${summary.avg_versions_per_session ?? "—"}`,
      tone: "default",
    },
    {
      title: "Активные (>7д)",
      value: summary.active_sessions ?? "—",
      hint: `${formatPct(summary.active_sessions_pct)} сессий`,
      tone: "accent",
    },
    {
      title: "Заброшенные (0мин)",
      value: summary.abandoned_sessions ?? "—",
      hint: `${formatPct(summary.abandoned_sessions_pct)} сессий`,
      tone: "warn",
    },
    {
      title: "С историей версий",
      value: summary.sessions_with_history ?? "—",
      hint: `${formatPct(summary.sessions_with_history_pct)} сессий`,
      tone: "default",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-testid="analytics-kpi-cards">
      {cards.map((card) => (
        <KpiCard key={card.title} title={card.title} value={card.value} hint={card.hint} tone={card.tone} />
      ))}
    </div>
  );
}
