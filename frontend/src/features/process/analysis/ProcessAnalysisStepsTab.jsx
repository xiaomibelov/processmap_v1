import React from "react";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisSkeleton, VirtualStepsTable } from "./ui/index.js";
import TimelineTable from "../../../components/process/interview/TimelineTable.jsx";
import styles from "./ProcessAnalysis.module.css";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return toText(value).toLowerCase();
}

function TabState({ loading, error, retry, model, t, children }) {
  if (loading) return <AnalysisSkeleton variant="table" count={8} columns={6} data-testid="steps-tab-skeleton" />;
  if (error) {
    return (
      <AnalysisErrorState
        title={t ? t("processAnalysis.error.title") : undefined}
        message={String(error)}
        onRetry={retry}
        retryLabel={t ? t("processAnalysis.error.retry") : undefined}
        data-testid="steps-tab-error"
      />
    );
  }
  if (!model) {
    return (
      <AnalysisEmptyState
        title={t ? t("processAnalysis.empty.title") : undefined}
        description={t ? t("processAnalysis.empty.description") : undefined}
        data-testid="steps-tab-empty"
      />
    );
  }
  return children;
}

export const ProcessAnalysisStepsTab = React.memo(function ProcessAnalysisStepsTab({
  model,
  loading,
  error,
  retry,
  t,
  steps = [],
  totalSteps = 0,
  selectedStepIds,
  activeStepId,
  onToggleStepSelection,
  onToggleAllStepSelection,
  onActivateStep,
  patchStep,
  productActionCountByStepId,
  toolbar,
  timelineTableProps,
  children,
}) {
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredSteps = React.useMemo(() => {
    const rows = toArray(steps);
    const query = normalize(searchQuery);
    if (!query) return rows;
    return rows.filter((step) => {
      const hay = [
        step?.action,
        step?.lane_name,
        step?.lane,
        step?.role,
        step?.area,
        step?.node_bind_id,
        step?.node_bind_title,
        step?.subprocess,
      ]
        .map(normalize)
        .join(" ");
      return hay.includes(query);
    });
  }, [steps, searchQuery]);

  const renderTable = () => {
    if (timelineTableProps) {
      return (
        <TimelineTable
          {...timelineTableProps}
          selectedStepIds={selectedStepIds}
          activeAnalysisStepId={activeStepId}
          onActivateStep={onActivateStep}
          onToggleStepSelection={onToggleStepSelection}
          onToggleAllStepSelection={onToggleAllStepSelection}
          patchStep={patchStep}
          productActionCountByStepId={productActionCountByStepId}
          data-testid="steps-timeline-table"
        />
      );
    }

    return (
      <VirtualStepsTable
        steps={filteredSteps}
        selectedStepIds={selectedStepIds}
        activeStepId={activeStepId}
        onToggleStepSelection={onToggleStepSelection}
        onToggleAllStepSelection={onToggleAllStepSelection}
        onActivateStep={onActivateStep}
        patchStep={patchStep}
        productActionCountByStepId={productActionCountByStepId}
        tableHeight={420}
        emptyState={
          <AnalysisEmptyState
            title={t ? t("processAnalysis.empty.title") : undefined}
            description={t ? t("processAnalysis.empty.description") : undefined}
            data-testid="steps-table-empty"
          />
        }
        data-testid="steps-virtual-table"
      />
    );
  };

  return (
    <div className={styles.tabFill} data-testid="process-analysis-steps-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        <div className={styles.tabContent}>
          {toolbar ? (
            <div data-testid="steps-tab-toolbar">{toolbar}</div>
          ) : (
            <div className={styles.filterBar}>
              <input
                className={styles.filterInput}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t ? t("analysis.searchPlaceholder") : "Поиск…"}
                aria-label={t ? t("analysis.searchPlaceholder") : "Поиск"}
                data-testid="steps-search-input"
              />
              <span className={styles.filterCount}>
                {filteredSteps.length}/{totalSteps || steps.length}
              </span>
            </div>
          )}

          {renderTable()}

          {children}
        </div>
      </TabState>
    </div>
  );
});
