import React from "react";
import styles from "./AnalysisKpiCard.module.css";

export const AnalysisKpiCard = React.memo(function AnalysisKpiCard({
  value,
  label,
  unit,
  "data-testid": dataTestId,
}) {
  return (
    <div className={styles.card} data-testid={dataTestId || "analysis-kpi-card"}>
      <div className={styles.valueWrap}>
        <span className={styles.value}>{value}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
      <div className={styles.label}>{label}</div>
    </div>
  );
});
