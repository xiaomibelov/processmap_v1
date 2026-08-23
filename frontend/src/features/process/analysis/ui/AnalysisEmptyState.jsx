import React from "react";
import styles from "./AnalysisEmptyState.module.css";

export const AnalysisEmptyState = React.memo(function AnalysisEmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  "data-testid": dataTestId,
}) {
  return (
    <div className={styles.container} data-testid={dataTestId || "analysis-empty-state"}>
      <div className={styles.icon} aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      </div>
      {title ? <div className={styles.title}>{title}</div> : null}
      {description ? <div className={styles.description}>{description}</div> : null}
      {primaryAction || secondaryAction ? (
        <div className={styles.actions}>
          {primaryAction ? (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={primaryAction.onClick}
              data-testid="analysis-empty-primary"
            >
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={secondaryAction.onClick}
              data-testid="analysis-empty-secondary"
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
