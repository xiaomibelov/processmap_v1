import React, { useMemo } from "react";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisKpiCard, AnalysisSkeleton } from "./ui/index.js";
import styles from "./ProcessAnalysis.module.css";

function formatValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function TabState({ loading, error, retry, model, t, children }) {
  if (loading) return <AnalysisSkeleton variant="card" count={4} data-testid="summary-tab-skeleton" />;
  if (error) {
    return (
      <AnalysisErrorState
        title={t ? t("processAnalysis.error.title") : undefined}
        message={String(error)}
        onRetry={retry}
        retryLabel={t ? t("processAnalysis.error.retry") : undefined}
        data-testid="summary-tab-error"
      />
    );
  }
  if (!model) {
    return (
      <AnalysisEmptyState
        title={t ? t("processAnalysis.empty.title") : undefined}
        description={t ? t("processAnalysis.empty.description") : undefined}
        data-testid="summary-tab-empty"
      />
    );
  }
  return children;
}

export const ProcessAnalysisSummaryTab = React.memo(function ProcessAnalysisSummaryTab({
  model,
  loading,
  error,
  retry,
  t,
}) {
  const kpiCards = useMemo(() => {
    if (!model) return [];
    return model.kpi_cards || [];
  }, [model]);

  return (
    <div className={styles.tabScroll} data-testid="process-analysis-summary-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        <div className={styles.summaryGrid}>
          {kpiCards.map((card) => (
            <AnalysisKpiCard
              key={card.key}
              value={formatValue(card.value)}
              label={card.label}
              unit={card.unit}
              data-testid={`summary-kpi-${card.key}`}
            />
          ))}
        </div>
      </TabState>
    </div>
  );
});
