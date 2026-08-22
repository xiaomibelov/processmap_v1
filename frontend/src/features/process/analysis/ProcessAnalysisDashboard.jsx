import React from "react";
import { ProcessAnalysisPage } from "./ProcessAnalysisPage.jsx";
import { useProcessAnalysisViewModel } from "./useProcessAnalysisViewModel.js";
import { useProcessAnalysisI18n } from "./useProcessAnalysisI18n.js";
import styles from "./ProcessAnalysis.module.css";

function LoadingState({ t }) {
  return (
    <div className={styles.loadingState} data-testid="process-analysis-loading">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={styles.spinner}>
        <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round" />
      </svg>
      <div>{t("processAnalysis.loading")}</div>
    </div>
  );
}

function ErrorState({ error, t, onRetry }) {
  return (
    <div className={styles.errorState} data-testid="process-analysis-error">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <div style={{ fontWeight: 500 }}>{t("processAnalysis.error.title")}</div>
      {error ? <div style={{ fontSize: 12, marginTop: 4 }}>{String(error)}</div> : null}
      {onRetry ? (
        <button type="button" className={styles.backButton} onClick={onRetry} style={{ marginTop: 8, padding: "6px 12px", width: "auto", height: "auto" }}>
          {t("processAnalysis.error.retry")}
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ t }) {
  return (
    <div className={styles.emptyState} data-testid="process-analysis-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{t("processAnalysis.empty.title")}</div>
      <div style={{ fontSize: 12 }}>{t("processAnalysis.empty.description")}</div>
    </div>
  );
}

export function ProcessAnalysisDashboard({
  sessionId,
  externalViewModel,
  processTitle,
  onBack,
  locale = "ru",
  tabs,
  defaultTabKey,
}) {
  const t = useProcessAnalysisI18n(locale);
  const { loading, error, model, retry } = useProcessAnalysisViewModel({ sessionId, externalViewModel, t });

  const activeTabs = React.useMemo(() => {
    if (loading) {
      return [{ key: "loading", label: "…", content: <LoadingState t={t} /> }];
    }
    if (error && !model) {
      return [{
        key: "error",
        label: t("processAnalysis.error.title"),
        content: <ErrorState error={error} t={t} onRetry={retry} />,
      }];
    }
    if (!model) {
      return [{ key: "empty", label: t("processAnalysis.empty.title"), content: <EmptyState t={t} /> }];
    }
    return tabs;
  }, [loading, error, model, tabs, t, retry]);

  const activeDefaultKey = React.useMemo(() => {
    if (loading) return "loading";
    if (error) return "error";
    if (!model) return "empty";
    return defaultTabKey;
  }, [loading, error, model, defaultTabKey]);

  return (
    <ProcessAnalysisPage
      title={t("processAnalysis.title")}
      processTitle={processTitle || model?.session_title}
      onBack={onBack}
      tabs={activeTabs}
      defaultTabKey={activeDefaultKey}
      t={t}
    />
  );
}
