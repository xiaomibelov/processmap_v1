import React from "react";
import styles from "./AnalysisKpiCard.module.css";

export const AnalysisKpiCard = React.memo(function AnalysisKpiCard({
  value,
  label,
  unit,
  tooltip,
  "data-testid": dataTestId,
}) {
  return (
    <div
      className={styles.card}
      data-testid={dataTestId || "analysis-kpi-card"}
      title={tooltip || ""}
    >
      <div className={styles.valueWrap}>
        <span className={styles.value}>{value}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
      <div className={styles.label}>{label}</div>
    </div>
  );
});
