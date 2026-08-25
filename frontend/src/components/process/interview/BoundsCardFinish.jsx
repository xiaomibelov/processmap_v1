import styles from "../../../features/process/analysis/ProcessAnalysis.module.css";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function BoundsCardFinish({
  cardRef,
  missing,
  focused,
  finishShop,
  finishState,
  laneOptions,
  onFinishShopChange,
  onFinishStateChange,
  statusMissingLabel = "не заполнено",
  statusFilledLabel = "заполнено",
}) {
  return (
    <section
      ref={cardRef}
      className={cn(
        styles.analysisStepperNode,
        styles["analysisStepperNode--finish"],
        missing ? styles["analysisStepperNode--missing"] : styles["analysisStepperNode--filled"],
        focused ? styles["analysisStepperNode--focused"] : "",
      )}
      data-testid="boundaries-stepper-node-finish"
    >
      <div className={styles.analysisStepperIcon} aria-hidden="true">■</div>
      <div className={styles.analysisStepperTitle}>FINISH</div>
      <div className={styles.analysisStepperStatus}>{missing ? statusMissingLabel : statusFilledLabel}</div>

      <div className={styles.analysisStepperContent}>
        <label className="interviewField">
          <span>Финишный lane</span>
          <select
            className="select interviewBoundaryLaneSelect"
            value={finishShop}
            onChange={(event) => onFinishShopChange?.(event.target.value)}
          >
            <option value="">Выберите лайн</option>
            {(Array.isArray(laneOptions) ? laneOptions : []).map((lane) => (
              <option key={`finish_${lane.name}`} value={lane.name}>
                ● {lane.label}
              </option>
            ))}
          </select>
        </label>
        <label className="interviewField">
          <span>Finish state</span>
          <input
            className="input"
            value={finishState}
            onChange={(event) => onFinishStateChange?.(event.target.value)}
            placeholder="Упакованная партия"
          />
        </label>
        <div className="interviewBoundsHint">Критерий завершения процесса.</div>
      </div>
    </section>
  );
}
