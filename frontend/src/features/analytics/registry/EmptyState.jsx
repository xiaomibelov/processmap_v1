export default function EmptyState({ title = "Нет действий с продуктами", description = "", action = null, onAction = null }) {
  return (
    <div className="registryEmptyState" data-testid="registry-empty-state">
      <div className="registryEmptyStateIcon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14h.01" />
          <path d="M13 14h.01" />
          <path d="M9 17h.01" />
          <path d="M13 17h.01" />
        </svg>
      </div>
      <div className="registryEmptyStateTitle">{title}</div>
      {description ? <div className="registryEmptyStateDesc">{description}</div> : null}
      {action ? (
        <button type="button" className="registryEmptyStateAction" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}
