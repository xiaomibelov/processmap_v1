import React from "react";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisSkeleton } from "./ui/index.js";
import { ProductActionSuggestionsPanel } from "./ProductActionSuggestionsPanel.jsx";
import styles from "./ProcessAnalysis.module.css";

function TabState({ loading, error, retry, model, t, children }) {
  if (loading) return <AnalysisSkeleton variant="card" count={3} data-testid="ai-tab-skeleton" />;
  if (error) {
    return (
      <AnalysisErrorState
        title={t ? t("processAnalysis.error.title") : undefined}
        message={String(error)}
        onRetry={retry}
        retryLabel={t ? t("processAnalysis.error.retry") : undefined}
        data-testid="ai-tab-error"
      />
    );
  }
  if (!model) {
    return (
      <AnalysisEmptyState
        title={t ? t("processAnalysis.empty.title") : undefined}
        description={t ? t("processAnalysis.empty.description") : undefined}
        data-testid="ai-tab-empty"
      />
    );
  }
  return children;
}

export const ProcessAnalysisAiTab = React.memo(function ProcessAnalysisAiTab({
  model,
  loading,
  error,
  retry,
  t,
  sessionId,
  baseDiagramStateVersion,
  steps,
  children,
}) {
  return (
    <div className={styles.tabScroll} data-testid="process-analysis-ai-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        <div className={styles.tabContent}>
          {children}
          <ProductActionSuggestionsPanel
            sessionId={sessionId}
            baseDiagramStateVersion={baseDiagramStateVersion}
            steps={steps}
            t={t}
          />
        </div>
      </TabState>
    </div>
  );
});
