import { useEffect, useState } from "react";

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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setAdvancedOpen(false);
  }, [toText(active?.title), toText(details?.type), toText(details?.lane)]);

  if (!active) {
    return (
      <div className="interviewPathsDetailsEmpty">
        <div className="muted small">Выберите шаг в маршруте и откройте инспектор для деталей.</div>
      </div>
    );
  }

  return (
    <div className="interviewPathsDetailsCard">
      <div className="interviewPathsDetailsTitle">{toText(active?.title) || "—"}</div>
      <div className="interviewPathsDetailsMeta muted small">
        тип: {toText(details?.type || "—")} · lane: {toText(details?.lane || "—")}
      </div>

      <div className="interviewPathsDetailsList compact">
        <div>вход: {toText(details?.inTitle || "—")}</div>
        <div>выход: {toText(details?.outTitle || "—")}</div>
        <div>выбранная ветка: {toText(details?.selected || "—")}</div>
        <div>AI: {Number(details?.aiCount || 0)}</div>
        <div>Заметки: {Number(details?.notesCount || 0)}</div>
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
          Заметки / AI
        </button>
        <button
          type="button"
          className="secondaryBtn tinyBtn"
          onClick={() => onCopyStepLink?.()}
        >
          Копировать ссылку
        </button>
      </div>

      <button
        type="button"
        className="secondaryBtn tinyBtn interviewPathsDetailsAdvancedToggle"
        onClick={() => setAdvancedOpen((prev) => !prev)}
        data-testid="interview-paths-details-advanced-toggle"
      >
        {advancedOpen ? "Скрыть тех.детали" : "Показать тех.детали"}
      </button>

      {advancedOpen ? (
        <div className="interviewPathsDetailsAdvanced">
          <div>Пробелы DoD: {toText(details?.dodMissing || "—")}</div>
          <div>входящие потоки: {toText(details?.inputs || "—")}</div>
          <div>исходящие потоки: {toText(details?.outputs || "—")}</div>
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
      ) : null}
    </div>
  );
}
