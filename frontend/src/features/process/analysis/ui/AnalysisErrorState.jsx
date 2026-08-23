import React from "react";
import styles from "./AnalysisErrorState.module.css";

export const AnalysisErrorState = React.memo(function AnalysisErrorState({
  title,
  message,
  onRetry,
  retryLabel,
  "data-testid": dataTestId,
}) {
  return (
    <div className={styles.container} data-testid={dataTestId || "analysis-error-state"}>
      <div className={styles.icon} aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      {title ? <div className={styles.title}>{title}</div> : null}
      {message ? <div className={styles.message}>{String(message)}</div> : null}
      {onRetry ? (
        <button
          type="button"
          className={styles.retry}
          onClick={onRetry}
          data-testid="analysis-error-retry"
        >
          {retryLabel || "Retry"}
        </button>
      ) : null}
    </div>
  );
});
