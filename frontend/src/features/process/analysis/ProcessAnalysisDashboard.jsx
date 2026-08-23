import React from "react";
import { ProcessAnalysisPage } from "./ProcessAnalysisPage.jsx";
import { useProcessAnalysisViewModel } from "./useProcessAnalysisViewModel.js";
import { useProcessAnalysisI18n } from "./useProcessAnalysisI18n.js";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisSkeleton } from "./ui/index.js";

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
      return [
        {
          key: "loading",
          label: t("common.loading") || "…",
          content: <AnalysisSkeleton variant="card" count={6} data-testid="process-analysis-loading" />,
        },
      ];
    }
    if (error && !model) {
      return [
        {
          key: "error",
          label: t("processAnalysis.error.title"),
          content: (
            <AnalysisErrorState
              title={t("processAnalysis.error.title")}
              message={String(error)}
              onRetry={retry}
              retryLabel={t("processAnalysis.error.retry")}
              data-testid="process-analysis-error"
            />
          ),
        },
      ];
    }
    if (!model) {
      return [
        {
          key: "empty",
          label: t("processAnalysis.empty.title"),
          content: (
            <AnalysisEmptyState
              title={t("processAnalysis.empty.title")}
              description={t("processAnalysis.empty.description")}
              data-testid="process-analysis-empty"
            />
          ),
        },
      ];
    }
    return tabs.map((tab) => {
      if (!React.isValidElement(tab.content)) return tab;
      return {
        ...tab,
        content: React.cloneElement(tab.content, { model, loading, error, retry }),
      };
    });
  }, [loading, error, model, tabs, t, retry]);

  const activeDefaultKey = React.useMemo(() => {
    if (loading) return "loading";
    if (error && !model) return "error";
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
