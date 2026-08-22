import React from "react";
import { ProcessAnalysisPage } from "./ProcessAnalysisPage.jsx";
import { ProcessAnalysisOverview } from "./ProcessAnalysisOverview.jsx";
import { ProcessAnalysisSkeleton } from "./ProcessAnalysisSkeleton.jsx";
import { ProcessAnalysisStepsTab } from "./ProcessAnalysisStepsTab.jsx";
import { ProcessAnalysisBranchesTab } from "./ProcessAnalysisBranchesTab.jsx";
import { ProcessAnalysisExceptionsTab } from "./ProcessAnalysisExceptionsTab.jsx";
import { ProcessAnalysisAiTab } from "./ProcessAnalysisAiTab.jsx";
import { useProcessAnalysisViewModel } from "./useProcessAnalysisViewModel.js";
import { useProcessAnalysisI18n } from "./useProcessAnalysisI18n.js";
import styles from "./ProcessAnalysis.module.css";

function EmptyState({ t }) {
  return (
    <div className={styles.emptyState}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{t("processAnalysis.empty.title")}</div>
      <div style={{ fontSize: 12 }}>{t("processAnalysis.empty.description")}</div>
    </div>
  );
}

function ErrorState({ error, t, onRetry }) {
  return (
    <div className={styles.errorState}>
      <div style={{ fontWeight: 500 }}>{t("processAnalysis.error.title")}</div>
      {error ? <div style={{ fontSize: 12, marginTop: 4 }}>{String(error)}</div> : null}
      {onRetry ? (
        <button type="button" className={styles.backButton} onClick={onRetry} style={{ marginTop: 8 }}>
          {t("processAnalysis.error.retry")}
        </button>
      ) : null}
    </div>
  );
}

function PlaceholderTab({ title, description }) {
  return (
    <div className={styles.tabPanel} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className={styles.emptyState}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12 }}>{description}</div>
      </div>
    </div>
  );
}

export function ProcessAnalysisDashboard({ sessionId, externalViewModel, processTitle, onBack, locale = "ru" }) {
  const t = useProcessAnalysisI18n(locale);
  const { loading, error, model } = useProcessAnalysisViewModel({ sessionId, externalViewModel, t });

  if (loading) {
    return <ProcessAnalysisSkeleton />;
  }

  if (error && !model) {
    return (
      <ProcessAnalysisPage
        title={t("processAnalysis.title")}
        processTitle={processTitle}
        onBack={onBack}
        t={t}
        renderOverview={() => <ErrorState error={error} t={t} />}
      />
    );
  }

  if (!model) {
    return (
      <ProcessAnalysisPage
        title={t("processAnalysis.title")}
        processTitle={processTitle}
        onBack={onBack}
        t={t}
        renderOverview={() => <EmptyState t={t} />}
      />
    );
  }

  return (
    <ProcessAnalysisPage
      title={t("processAnalysis.title")}
      processTitle={processTitle || model.session_title}
      onBack={onBack}
      t={t}
      renderOverview={() => <ProcessAnalysisOverview model={model} t={t} />}
      renderSteps={() => (
        <ProcessAnalysisStepsTab>
          <PlaceholderTab title={t("processAnalysis.tabs.steps")} description="Интеграция таблицы шагов — следующий шаг" />
        </ProcessAnalysisStepsTab>
      )}
      renderBranches={() => (
        <ProcessAnalysisBranchesTab>
          <PlaceholderTab title={t("processAnalysis.tabs.branches")} description="Интеграция веток BPMN — следующий шаг" />
        </ProcessAnalysisBranchesTab>
      )}
      renderExceptions={() => (
        <ProcessAnalysisExceptionsTab>
          <PlaceholderTab title={t("processAnalysis.tabs.exceptions")} description="Интеграция исключений — следующий шаг" />
        </ProcessAnalysisExceptionsTab>
      )}
      renderAi={() => (
        <ProcessAnalysisAiTab>
          <PlaceholderTab title={t("processAnalysis.tabs.ai")} description="Интеграция AI-вопросов — следующий шаг" />
        </ProcessAnalysisAiTab>
      )}
    />
  );
}
