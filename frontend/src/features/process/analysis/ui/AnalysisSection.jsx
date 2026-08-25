import React from "react";
import styles from "./AnalysisSection.module.css";

export const AnalysisSection = React.memo(function AnalysisSection({
  title,
  subtitle,
  actions,
  badge,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  children,
  "data-testid": dataTestId,
}) {
  return (
    <section
      className={styles.analysisSection}
      data-testid={dataTestId || "analysis-section"}
    >
      <div className={styles.analysisSectionHead}>
        <div className={styles.analysisSectionTitleWrap}>
          <div className={styles.analysisSectionTitle} data-testid="analysis-section-title">
            {title}
            {badge ? (
              <span className={styles.analysisSectionBadge} data-testid="analysis-section-badge">
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? <div className={styles.analysisSectionSubtitle}>{subtitle}</div> : null}
        </div>
        <div className={styles.analysisSectionActions}>
          {actions}
          {collapsible ? (
            <button
              type="button"
              className={styles.analysisSectionCollapseBtn}
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              data-testid="analysis-section-toggle"
            >
              {collapsed ? "Показать" : "Скрыть"}
            </button>
          ) : null}
        </div>
      </div>
      {collapsed ? null : (
        <div className={styles.analysisSectionBody}>{children}</div>
      )}
    </section>
  );
});
