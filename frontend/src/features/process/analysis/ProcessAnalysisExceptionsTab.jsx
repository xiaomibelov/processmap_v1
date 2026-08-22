import React from "react";
import styles from "./ProcessAnalysis.module.css";

export function ProcessAnalysisExceptionsTab({ children }) {
  return (
    <div
      className={styles.tabPanel}
      role="tabpanel"
      id="process-analysis-tab-exceptions"
      aria-labelledby="process-analysis-tab-btn-exceptions"
    >
      {children}
    </div>
  );
}
