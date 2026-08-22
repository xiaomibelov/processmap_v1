import React from "react";
import styles from "./ProcessAnalysis.module.css";

export function ProcessAnalysisStepsTab({ children }) {
  return <div className={styles.tabFill}>{children}</div>;
}
