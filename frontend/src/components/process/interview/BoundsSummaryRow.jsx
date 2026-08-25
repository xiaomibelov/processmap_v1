import styles from "../../../features/process/analysis/ProcessAnalysis.module.css";

export default function BoundsSummaryRow({
  startLabel,
  intermediateCount,
  finishLabel,
  onFocusStart,
  onFocusIntermediate,
  onFocusFinish,
  onEdit,
}) {
  return (
    <div className={styles.analysisStepperSummary} data-testid="boundaries-summary-row">
      <button type="button" className={styles.analysisStepperSummaryItem} onClick={onFocusStart}>
        <span className={styles.analysisStepperSummaryKey}>START</span>
        <span className={styles.analysisStepperSummaryValue}>{startLabel || "не выбрано"}</span>
      </button>
      <button type="button" className={styles.analysisStepperSummaryItem} onClick={onFocusIntermediate}>
        <span className={styles.analysisStepperSummaryKey}>INTERMEDIATE</span>
        <span className={styles.analysisStepperSummaryValue}>
          {intermediateCount > 0 ? `${intermediateCount} lanes` : "не выбрано"}
        </span>
      </button>
      <button type="button" className={styles.analysisStepperSummaryItem} onClick={onFocusFinish}>
        <span className={styles.analysisStepperSummaryKey}>FINISH</span>
        <span className={styles.analysisStepperSummaryValue}>{finishLabel || "не выбрано"}</span>
      </button>
      <button type="button" className="secondaryBtn smallBtn ml-auto" onClick={onEdit}>
        Изменить
      </button>
    </div>
  );
}
