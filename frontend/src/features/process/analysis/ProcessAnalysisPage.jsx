import React, { useState, useCallback } from "react";
import styles from "./ProcessAnalysis.module.css";

const TABS = [
  { key: "overview", labelKey: "processAnalysis.tabs.overview" },
  { key: "steps", labelKey: "processAnalysis.tabs.steps" },
  { key: "branches", labelKey: "processAnalysis.tabs.branches" },
  { key: "exceptions", labelKey: "processAnalysis.tabs.exceptions" },
  { key: "ai", labelKey: "processAnalysis.tabs.ai" },
];

export function ProcessAnalysisPage({
  title,
  processTitle,
  onBack,
  t,
  renderOverview,
  renderSteps,
  renderBranches,
  renderExceptions,
  renderAi,
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const handleKeyDown = useCallback(
    (event, tabKey) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const idx = TABS.findIndex((t) => t.key === tabKey);
      const nextIdx = event.key === "ArrowLeft" ? Math.max(0, idx - 1) : Math.min(TABS.length - 1, idx + 1);
      setActiveTab(TABS[nextIdx].key);
    },
    []
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return renderOverview ? renderOverview() : null;
      case "steps":
        return renderSteps ? renderSteps() : null;
      case "branches":
        return renderBranches ? renderBranches() : null;
      case "exceptions":
        return renderExceptions ? renderExceptions() : null;
      case "ai":
        return renderAi ? renderAi() : null;
      default:
        return null;
    }
  };

  return (
    <div className={styles.page} data-testid="process-analysis-page">
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {onBack ? (
            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
              aria-label={t("processAnalysis.back")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          ) : null}
          <div>
            <div className={styles.headerTitle}>{title || t("processAnalysis.title")}</div>
            {processTitle ? <div className={styles.processTitle}>{processTitle}</div> : null}
          </div>
        </div>
        <nav role="tablist" aria-label={t("processAnalysis.title")} className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`process-analysis-tab-btn-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`process-analysis-tab-${tab.key}`}
              className={styles.tab}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={(e) => handleKeyDown(e, tab.key)}
              tabIndex={activeTab === tab.key ? 0 : -1}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>
      </header>
      <main className={styles.body}>{renderTabContent()}</main>
    </div>
  );
}
