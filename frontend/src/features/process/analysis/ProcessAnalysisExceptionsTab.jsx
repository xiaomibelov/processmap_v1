import React from "react";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisSkeleton } from "./ui/index.js";
import styles from "./ProcessAnalysis.module.css";

function TabState({ loading, error, retry, model, t, children }) {
  if (loading) return <AnalysisSkeleton variant="table" count={5} columns={7} data-testid="exceptions-tab-skeleton" />;
  if (error) {
    return (
      <AnalysisErrorState
        title={t ? t("processAnalysis.error.title") : undefined}
        message={String(error)}
        onRetry={retry}
        retryLabel={t ? t("processAnalysis.error.retry") : undefined}
        data-testid="exceptions-tab-error"
      />
    );
  }
  if (!model) {
    return (
      <AnalysisEmptyState
        title={t ? t("processAnalysis.empty.title") : undefined}
        description={t ? t("processAnalysis.empty.description") : undefined}
        data-testid="exceptions-tab-empty"
      />
    );
  }
  return children;
}

export const ProcessAnalysisExceptionsTab = React.memo(function ProcessAnalysisExceptionsTab({
  model,
  loading,
  error,
  retry,
  t,
  children,
}) {
  return (
    <div className={styles.tabScroll} data-testid="process-analysis-exceptions-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        <div className={styles.tabContent}>{children}</div>
      </TabState>
    </div>
  );
});
