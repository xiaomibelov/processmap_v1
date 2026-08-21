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
    </section>
  );
}
