export default function AnalyticsErrorState({
  title = "Не удалось загрузить аналитику",
  message = "",
  onRetry = null,
}) {
  return (
    <div className="analyticsState analyticsErrorState" role="alert" data-testid="analytics-error">
      <div className="analyticsErrorIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {onRetry ? (
        <button type="button" className="secondaryBtn smallBtn" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}
