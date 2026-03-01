function toText(value) {
  return String(value || "").trim();
}

export default function StepDetailsPanel({
  active = null,
  onJumpDiagram,
  onJumpMatrix,
  onCopyStepLink,
  details,
  timeEditor = null,
}) {
  if (!active) {
    return (
      <div className="interviewPathsDetailsEmpty">
        <div className="muted small">Выберите шаг в маршруте, чтобы открыть детали.</div>
      </div>
    );
  }

  return (
    <div className="interviewPathsDetailsCard">
      <div className="interviewPathsDetailsTitle">{toText(active?.title) || "—"}</div>
      <div className="interviewPathsDetailsMeta muted small">
        type: {toText(details?.type || "—")} · lane: {toText(details?.lane || "—")}
      </div>
      <div className="interviewPathsDetailsList">
        <div>in: {toText(details?.inTitle || "—")}</div>
        <div>out: {toText(details?.outTitle || "—")}</div>
        <div>selected: {toText(details?.selected || "—")}</div>
        <div>AI: {Number(details?.aiCount || 0)}</div>
        <div>Заметки: {Number(details?.notesCount || 0)}</div>
        <div>DoD missing: {toText(details?.dodMissing || "—")}</div>
        <div>inputs: {toText(details?.inputs || "—")}</div>
        <div>outputs: {toText(details?.outputs || "—")}</div>
      </div>
      {timeEditor ? (
        <div className="interviewPathsDetailsTime">
          <div className="interviewPathsDetailsSubTitle">Время шага</div>
          {timeEditor}
        </div>
      ) : null}
      <div className="interviewPathsDetailsActions">
        <button
          type="button"
          className="secondaryBtn smallBtn"
          data-testid="interview-paths-jump-diagram"
          onClick={() => onJumpDiagram?.()}
        >
          Подсветить на диаграмме
        </button>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          data-testid="interview-paths-jump-matrix"
          onClick={() => onJumpMatrix?.()}
        >
          Notes / AI
        </button>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          onClick={() => onCopyStepLink?.()}
        >
          Копировать ссылку
        </button>
      </div>
      {details?.linkGroup ? (
        <div className="interviewPathsDetailsLinkGroup">
          <div className="muted small">link group: {toText(details?.linkGroup)}</div>
          <div className="interviewDiagramLinkGroups">
            {(Array.isArray(details?.counterparts) ? details.counterparts : []).map((nodeId) => (
              <span key={`counterpart_${nodeId}`} className="interviewDiagramLinkChip">
                {nodeId}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
