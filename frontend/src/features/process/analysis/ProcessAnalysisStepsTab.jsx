import React from "react";
import styles from "./ProcessAnalysis.module.css";

export function ProcessAnalysisStepsTab({ children }) {
  return (
    <div
      className={styles.tabPanel}
      role="tabpanel"
      id="process-analysis-tab-steps"
      aria-labelledby="process-analysis-tab-btn-steps"
    >
      {children}
    </div>
  );
}
