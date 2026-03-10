export default function BoundsCardStart({
  cardRef,
  missing,
  focused,
  startShop,
  trigger,
  laneOptions,
  onStartShopChange,
  onTriggerChange,
}) {
  return (
    <section
      ref={cardRef}
      className={`interviewBoundsCard interviewBoundsCard--start ${missing ? "isMissing" : "isFilled"} ${focused ? "isFocus" : ""}`}
    >
      <div className="interviewBoundsCardHead">
        <span className="interviewBoundsMiniPill start">START</span>
        <span className={`interviewBoundsState ${missing ? "warn" : "ok"}`}>{missing ? "не заполнено" : "ok"}</span>
      </div>
      <div className="interviewBoundsCardTitle">Старт</div>
      <label className="interviewField">
        <span>Стартовый цех / lane</span>
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
        <span>Стартовое событие (trigger)</span>
        <input
          className="input"
          value={trigger}
          onChange={(event) => onTriggerChange?.(event.target.value)}
          placeholder="Напр.: поступила партия сырья"
        />
      </label>
      <div className="interviewBoundsHint">С чего процесс начинается в реальности?</div>
    </section>
  );
}
