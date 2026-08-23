import React from "react";
import {
  AnalysisEmptyState,
  AnalysisErrorState,
  AnalysisSkeleton,
  VirtualBranchesTable,
} from "./ui/index.js";
import { useDebouncedValue } from "./ui/useDebouncedValue.js";
import styles from "./ProcessAnalysis.module.css";

function toText(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return toText(value).toLowerCase();
}

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
  children,
}) {
  const [filterQuery, setFilterQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(filterQuery, 200);

  const filteredTransitions = React.useMemo(() => {
    const rows = Array.isArray(transitions) ? transitions : [];
    const query = normalize(debouncedQuery);
    if (!query) return rows;
    return rows.filter((row) => {
      const hay = [
        row?.from_title,
        row?.to_title,
        row?.from_node_id,
        row?.to_node_id,
        row?.from_lane,
        row?.to_lane,
        row?.when,
      ]
        .map(normalize)
        .join(" ");
      return hay.includes(query);
    });
  }, [transitions, debouncedQuery]);

  const handleSaveEdit = React.useCallback(
    (row, nextWhen) => {
      onPatchTransitionWhen?.(row?.from_node_id, row?.to_node_id, nextWhen);
    },
    [onPatchTransitionWhen]
  );

  return (
    <div className={styles.tabScroll} data-testid="process-analysis-branches-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        {Array.isArray(transitions) ? (
          <div className={styles.tabContent}>
            <div className={styles.filterBar}>
              <input
                className={styles.filterInput}
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder={t ? t("analysis.filterPlaceholder") : "Фильтр"}
                aria-label={t ? t("analysis.filterPlaceholder") : "Фильтр"}
                data-testid="branches-filter-input"
              />
              <span className={styles.filterCount}>
                {filteredTransitions.length}/{transitions.length}
              </span>
            </div>
            <VirtualBranchesTable
              transitions={filteredTransitions}
              tableHeight={360}
              onSaveEdit={handleSaveEdit}
              emptyState={
                <AnalysisEmptyState
                  title={t ? t("processAnalysis.empty.title") : undefined}
                  description={t ? t("analysis.branchesEmpty") : undefined}
                  data-testid="branches-table-empty"
                />
              }
              data-testid="branches-virtual-table"
            />
          </div>
        ) : (
          <div className={styles.tabContent}>{children}</div>
        )}
      </TabState>
    </div>
  );
});
