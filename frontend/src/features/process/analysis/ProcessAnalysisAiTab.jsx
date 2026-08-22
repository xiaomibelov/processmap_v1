import React from "react";
import styles from "./ProcessAnalysis.module.css";

export function ProcessAnalysisAiTab({ children }) {
  return <div className={styles.tabScroll}>{children}</div>;
}
