import React from "react";
import styles from "./ProcessAnalysis.module.css";

export function ProcessAnalysisAiTab({ children }) {
  return (
    <div
      className={styles.tabPanel}
      role="tabpanel"
      id="process-analysis-tab-ai"
      aria-labelledby="process-analysis-tab-btn-ai"
    >
      {children}
    </div>
  );
}
