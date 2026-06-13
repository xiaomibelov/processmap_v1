export default function AnalyticsEmptyState({
  title = "Нет данных",
  message = "Для выбранного контекста пока не собрано аналитики.",
}) {
  return (
    <div className="analyticsState analyticsEmptyState" data-testid="analytics-empty">
      <div className="analyticsEmptyIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-5" />
        </svg>
      </div>
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
