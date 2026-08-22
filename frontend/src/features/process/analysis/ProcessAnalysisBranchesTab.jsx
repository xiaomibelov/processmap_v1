import React from "react";
import styles from "./ProcessAnalysis.module.css";

export function ProcessAnalysisBranchesTab({ children }) {
  return (
    <div
      className={styles.tabPanel}
      role="tabpanel"
      id="process-analysis-tab-branches"
      aria-labelledby="process-analysis-tab-btn-branches"
    >
      {children}
    </div>
  );
}
