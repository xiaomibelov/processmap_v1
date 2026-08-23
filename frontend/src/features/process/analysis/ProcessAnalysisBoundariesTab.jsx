import React from "react";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisSkeleton } from "./ui/index.js";
import styles from "./ProcessAnalysis.module.css";

function TabState({ loading, error, retry, model, t, children }) {
  if (loading) return <AnalysisSkeleton variant="card" count={4} data-testid="boundaries-tab-skeleton" />;
  if (error) {
    return (
      <AnalysisErrorState
        title={t ? t("processAnalysis.error.title") : undefined}
        message={String(error)}
        onRetry={retry}
        retryLabel={t ? t("processAnalysis.error.retry") : undefined}
        data-testid="boundaries-tab-error"
      />
    );
  }
  if (!model) {
    return (
      <AnalysisEmptyState
        title={t ? t("processAnalysis.empty.title") : undefined}
        description={t ? t("processAnalysis.empty.description") : undefined}
        data-testid="boundaries-tab-empty"
      />
    );
  }
  return children;
}

export const ProcessAnalysisBoundariesTab = React.memo(function ProcessAnalysisBoundariesTab({
  model,
  loading,
  error,
  retry,
  t,
  children,
}) {
  return (
    <div className={styles.tabScroll} data-testid="process-analysis-boundaries-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        <div className={styles.tabContent}>{children}</div>
      </TabState>
    </div>
  );
});
