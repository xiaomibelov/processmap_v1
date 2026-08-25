import React from "react";
import {
  AnalysisEmptyState,
  AnalysisErrorState,
  AnalysisSkeleton,
} from "./ui/index.js";
import BpmnBranchesPanel from "../../../components/process/interview/transitions/BpmnBranchesPanel.jsx";
import styles from "./ProcessAnalysis.module.css";

function TabState({ loading, error, retry, model, t, children }) {
  if (loading) return <AnalysisSkeleton variant="table" count={6} columns={4} data-testid="branches-tab-skeleton" />;
  if (error) {
    return (
      <AnalysisErrorState
        title={t ? t("processAnalysis.error.title") : undefined}
        message={String(error)}
        onRetry={retry}
        retryLabel={t ? t("processAnalysis.error.retry") : undefined}
        data-testid="branches-tab-error"
      />
    );
  }
  if (!model) {
    return (
      <AnalysisEmptyState
        title={t ? t("processAnalysis.empty.title") : undefined}
        description={t ? t("processAnalysis.empty.description") : undefined}
        data-testid="branches-tab-empty"
      />
    );
  }
  return children;
}

export const ProcessAnalysisBranchesTab = React.memo(function ProcessAnalysisBranchesTab({
  model,
  loading,
  error,
  retry,
  t,
  transitions,
  onPatchTransitionWhen,
  timelineView,
  addTransition,
}) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className={styles.tabScroll} data-testid="process-analysis-branches-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        <div className={styles.tabContent}>
          <BpmnBranchesPanel
            collapsed={collapsed}
            toggleBlock={() => setCollapsed((prev) => !prev)}
            transitionView={transitions}
            patchTransitionWhen={onPatchTransitionWhen}
            timelineView={timelineView}
            addTransition={addTransition}
          />
        </div>
      </TabState>
    </div>
  );
});
