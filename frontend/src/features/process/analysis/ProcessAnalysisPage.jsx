import React, { useState, useCallback, useRef } from "react";
import styles from "./ProcessAnalysis.module.css";

const TabButton = React.forwardRef(function TabButton(
  { tab, index, activeTabKey, onSelect, onKeyDown, title },
  ref
) {
  const isActive = activeTabKey === tab.key;

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`process-analysis-tab-btn-${tab.key}`}
      aria-selected={isActive}
      aria-controls={`process-analysis-tab-${tab.key}`}
      title={title}
      className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
      onClick={() => onSelect(tab.key)}
      onKeyDown={(e) => onKeyDown(e, index)}
      tabIndex={isActive ? 0 : -1}
    >
      <span className={styles.tabLabel}>{tab.label}</span>
    </button>
  );
});

export function ProcessAnalysisPage({
  title,
  processTitle,
  onBack,
  tabs,
  defaultTabKey,
  t,
}) {
  const [activeTabKey, setActiveTabKey] = useState(defaultTabKey || tabs[0]?.key);
  const tabRefs = useRef({});

  const activeTab = tabs.find((tab) => tab.key === activeTabKey) || tabs[0];

  const handleSelect = useCallback((key) => {
    setActiveTabKey(key);
  }, []);

  const handleKeyDown = useCallback(
    (event, tabIndex) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextIndex = event.key === "ArrowLeft"
        ? Math.max(0, tabIndex - 1)
        : Math.min(tabs.length - 1, tabIndex + 1);
      const nextKey = tabs[nextIndex].key;
      setActiveTabKey(nextKey);
      requestAnimationFrame(() => {
        tabRefs.current[nextKey]?.focus();
      });
    },
    [tabs]
  );

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
          {tabs.map((tab, index) => (
            <TabButton
              key={tab.key}
              tab={tab}
              index={index}
              activeTabKey={activeTabKey}
              onSelect={handleSelect}
              onKeyDown={handleKeyDown}
              title={tab.tooltip || tab.label}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
            />
          ))}
        </nav>
      </header>
      <main className={styles.body}>
        <div
          className={styles.tabPanel}
          role="tabpanel"
          id={`process-analysis-tab-${activeTab?.key}`}
          aria-labelledby={`process-analysis-tab-btn-${activeTab?.key}`}
        >
          {activeTab?.content}
        </div>
      </main>
    </div>
  );
}
