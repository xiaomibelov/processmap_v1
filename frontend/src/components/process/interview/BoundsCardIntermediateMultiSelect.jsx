import { normalizeLoose, toText } from "./utils";
import styles from "../../../features/process/analysis/ProcessAnalysis.module.css";

const CHIP_VISIBLE_LIMIT = 3;
const OPTIONS_VISIBLE_LIMIT = 8;

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function BoundsCardIntermediateMultiSelect({
  cardRef,
  missing,
  focused,
  laneFilter,
  onLaneFilterChange,
  laneOptions,
  selectedList,
  onToggleLane,
  onSelectAll,
  onClear,
  rawValue,
  onRawValueChange,
  showAllOptions,
  onToggleShowAllOptions,
}) {
  const selected = Array.isArray(selectedList) ? selectedList : [];
  const visibleSelected = selected.slice(0, CHIP_VISIBLE_LIMIT);
  const selectedHiddenCount = Math.max(0, selected.length - visibleSelected.length);
  const options = Array.isArray(laneOptions) ? laneOptions : [];
  const visibleOptions = showAllOptions ? options : options.slice(0, OPTIONS_VISIBLE_LIMIT);

  return (
    <section
      ref={cardRef}
      className={cn(
        styles.analysisStepperNode,
        styles["analysisStepperNode--intermediate"],
        missing ? styles["analysisStepperNode--missing"] : styles["analysisStepperNode--filled"],
        focused ? styles["analysisStepperNode--focused"] : "",
      )}
      data-testid="boundaries-stepper-node-intermediate"
    >
      <div className={styles.analysisStepperIcon} aria-hidden="true">◆</div>
      <div className={styles.analysisStepperTitle}>INTERMEDIATE</div>
      <div className={styles.analysisStepperStatus}>
        {missing ? "не выбрано" : `${selected.length} lanes`}
      </div>

      <div className={styles.analysisStepperContent}>
        <label className="interviewField interviewBoundsFieldCompact">
          <span>Фильтр lanes</span>
          <input
            className="input"
            value={laneFilter}
            onChange={(event) => onLaneFilterChange?.(event.target.value)}
            placeholder="Напр.: L1, Бригадир, Упаковка"
          />
        </label>

        <div className="interviewBoundsGroup interviewBoundsGroup--selection">
          <div className="interviewBoundsSelectionRow">
            <div className="interviewBoundsSelectionLabel">Выбрано lanes: {selected.length}</div>
            <div className="flex items-center gap-1.5">
              <button type="button" className="secondaryBtn smallBtn interviewBoundsActionBtn" onClick={onSelectAll}>
                Все
              </button>
              <button type="button" className="secondaryBtn smallBtn interviewBoundsActionBtn" onClick={onClear}>
                Очистить
              </button>
            </div>
          </div>

          <div className="interviewBoundsSelectedChips">
            {visibleSelected.length ? (
              visibleSelected.map((name, idx) => (
                <span key={`sel_${normalizeLoose(name) || idx}`} className="interviewBoundaryStatusChip on">
                  {toText(name)}
                </span>
              ))
            ) : (
              <span className="interviewBoundaryStatusChip">не выбрано</span>
            )}
            {selectedHiddenCount > 0 ? (
              <button type="button" className="interviewBoundaryStatusChip on" onClick={() => onToggleShowAllOptions?.(true)}>
                +{selectedHiddenCount}
              </button>
            ) : null}
          </div>
        </div>

        <div className="interviewBoundsGroup interviewBoundsGroup--lane-list">
          <div className="interviewBoundaryLaneList interviewBoundaryLaneList--compact">
            {visibleOptions.map((lane) => {
              const isSelected = selected.some((item) => normalizeLoose(item) === normalizeLoose(lane.name));
              return (
                <button
                  key={`mid_${lane.name}`}
                  type="button"
                  className={`interviewBoundaryLaneBtn ${isSelected ? "selected" : ""}`}
                  style={{ "--lane-accent": lane.color }}
                  onClick={() => onToggleLane?.(lane.name)}
                >
                  <span className="interviewLaneDot" />
                  {lane.label}
                </button>
              );
            })}
          </div>

          {options.length > OPTIONS_VISIBLE_LIMIT ? (
            <button
              type="button"
              className="secondaryBtn smallBtn interviewBoundsActionBtn"
              onClick={() => onToggleShowAllOptions?.(!showAllOptions)}
            >
              {showAllOptions ? "Скрыть список" : `Показать все (${options.length})`}
            </button>
          ) : null}
        </div>

        <label className="interviewField interviewBoundsFieldCompact">
          <span>Ручной список (csv)</span>
          <input
            className="input"
            value={rawValue}
            onChange={(event) => onRawValueChange?.(event.target.value)}
            placeholder="Линия 1, Линия 2..."
          />
        </label>
      </div>
    </section>
  );
}
