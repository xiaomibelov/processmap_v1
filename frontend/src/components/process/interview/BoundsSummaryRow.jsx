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
    <div className="interviewBoundsSummaryRow">
      <button type="button" className="interviewBoundsSummaryItem" onClick={onFocusStart}>
        <span className="interviewBoundsSummaryKey">Start:</span>
        <span className="interviewBoundsSummaryValue">{startLabel || "не выбрано"}</span>
      </button>
      <button type="button" className="interviewBoundsSummaryItem" onClick={onFocusIntermediate}>
        <span className="interviewBoundsSummaryKey">Intermediate:</span>
        <span className="interviewBoundsSummaryValue">{intermediateCount > 0 ? `${intermediateCount} lanes` : "не выбрано"}</span>
      </button>
      <button type="button" className="interviewBoundsSummaryItem" onClick={onFocusFinish}>
        <span className="interviewBoundsSummaryKey">Finish:</span>
        <span className="interviewBoundsSummaryValue">{finishLabel || "не выбрано"}</span>
      </button>
      <button type="button" className="secondaryBtn smallBtn ml-auto" onClick={onEdit}>
        Изменить
      </button>
    </div>
  );
}
