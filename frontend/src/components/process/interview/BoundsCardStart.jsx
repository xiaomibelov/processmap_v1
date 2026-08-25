import styles from "../../../features/process/analysis/ProcessAnalysis.module.css";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function BoundsCardStart({
  cardRef,
  missing,
  focused,
  startShop,
  trigger,
  laneOptions,
  onStartShopChange,
  onTriggerChange,
  statusMissingLabel = "не заполнено",
  statusFilledLabel = "заполнено",
  triggerFilledLabel = "Триггер заполнен",
}) {
  return (
    <section
      ref={cardRef}
      className={cn(
        styles.analysisStepperNode,
        styles["analysisStepperNode--start"],
        missing ? styles["analysisStepperNode--missing"] : styles["analysisStepperNode--filled"],
        focused ? styles["analysisStepperNode--focused"] : "",
      )}
      data-testid="boundaries-stepper-node-start"
    >
      <div className={styles.analysisStepperIcon} aria-hidden="true">●</div>
      <div className={styles.analysisStepperTitle}>START</div>
      <div className={styles.analysisStepperStatus}>
        {missing ? statusMissingLabel : trigger && !startShop ? triggerFilledLabel : statusFilledLabel}
      </div>

      <div className={styles.analysisStepperContent}>
        <label className="interviewField">
          <span>Стартовый lane</span>
          <select
            className="select interviewBoundaryLaneSelect"
            value={startShop}
            onChange={(event) => onStartShopChange?.(event.target.value)}
          >
            <option value="">Выберите лайн</option>
            {(Array.isArray(laneOptions) ? laneOptions : []).map((lane) => (
              <option key={`start_${lane.name}`} value={lane.name}>
                ● {lane.label}
              </option>
            ))}
          </select>
        </label>
        <label className="interviewField">
          <span>Trigger</span>
          <input
            className="input"
            value={trigger}
            onChange={(event) => onTriggerChange?.(event.target.value)}
            placeholder="Поступила партия сырья"
          />
        </label>
        <div className="interviewBoundsHint">Точка входа процесса.</div>
      </div>
    </section>
  );
}
