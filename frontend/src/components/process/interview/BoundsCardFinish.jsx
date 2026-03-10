export default function BoundsCardFinish({
  cardRef,
  missing,
  focused,
  finishShop,
  finishState,
  laneOptions,
  onFinishShopChange,
  onFinishStateChange,
}) {
  return (
    <section
      ref={cardRef}
      className={`interviewBoundsCard interviewBoundsCard--finish ${missing ? "isMissing" : "isFilled"} ${focused ? "isFocus" : ""}`}
    >
      <div className="interviewBoundsCardHead">
        <span className="interviewBoundsMiniPill finish">FINISH</span>
        <span className={`interviewBoundsState ${missing ? "warn" : "ok"}`}>{missing ? "не заполнено" : "ok"}</span>
      </div>
      <div className="interviewBoundsCardTitle">Финиш</div>
      <label className="interviewField">
        <span>Финишный цех / lane</span>
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
        <span>Финишное состояние (готово)</span>
        <input
          className="input"
          value={finishState}
          onChange={(event) => onFinishStateChange?.(event.target.value)}
          placeholder="Напр.: упакованная партия"
        />
      </label>
      <div className="interviewBoundsHint">Как понять, что процесс завершён?</div>
    </section>
  );
}
