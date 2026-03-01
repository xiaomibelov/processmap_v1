import { useEffect, useRef, useState } from "react";
import { formatHHMMFromSeconds } from "../utils";

function toText(value) {
  return String(value || "").trim();
}

function shortHash(hashRaw) {
  return toText(hashRaw).slice(0, 8) || "—";
}

export default function PathHeader({
  scenario,
  scenarioTitle,
  scenarioStatusClass,
  scenarioStatusLabel,
  tier,
  sequenceKey,
  pathIdUsed,
  reportBuildDebug,
  stepsHash,
  metrics,
  canGenerateReport,
  reportApiAvailable,
  reportLoading,
  onGenerateReport,
  onOpenReports,
  onCopyMarkdown,
  hasMarkdown = false,
}) {
  const [showBuildDebugDetails, setShowBuildDebugDetails] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const menuRef = useRef(null);
  const debug = reportBuildDebug && typeof reportBuildDebug === "object" ? reportBuildDebug : {};
  const stepsCount = Number(debug?.steps_count || metrics?.steps_count || 0);
  const stopReason = toText(debug?.stop_reason || "UNKNOWN").toUpperCase();
  const lastStep = debug?.last_step && typeof debug.last_step === "object" ? debug.last_step : {};
  const showRouteWarning = stepsCount > 0 && (stepsCount < 10 || stopReason !== "OK_COMPLETE");
  const fullHash = toText(stepsHash);

  async function handleCopyHash() {
    if (!fullHash) return;
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(fullHash);
    } catch {
      // no-op
    }
  }

  useEffect(() => {
    if (!actionsOpen) return undefined;
    function handleClick(event) {
      const node = menuRef.current;
      if (!node || node.contains(event.target)) return;
      setActionsOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [actionsOpen]);

  return (
    <div className="interviewPathHeader">
      <div className="interviewPathHeaderMain">
        <strong>{toText(scenarioTitle?.(scenario) || scenario?.label || "Сценарий")}</strong>
        {toText(tier) ? <span className={`tier tier-${toText(tier).toLowerCase()}`}>{toText(tier)}</span> : null}
        <span className={`badge ${toText(scenarioStatusClass?.(scenario))}`}>
          {scenarioStatusLabel?.(scenario)}
        </span>
        {toText(sequenceKey) ? <span className="badge muted">seq {toText(sequenceKey)}</span> : null}
        {toText(pathIdUsed) ? <span className="badge muted">source {toText(pathIdUsed)}</span> : null}
        <span className="badge muted">steps {Math.max(0, stepsCount)}</span>
        {fullHash ? (
          <>
            <span className="badge muted" title={fullHash}>hash {shortHash(fullHash)}</span>
            <button type="button" className="secondaryBtn tinyBtn" onClick={handleCopyHash} title="Скопировать полный hash">
              copy hash
            </button>
          </>
        ) : null}
      </div>

      <div className="interviewPathHeaderActions">
        <button
          type="button"
          className="primaryBtn smallBtn"
          data-testid="interview-paths-generate-report"
          onClick={onGenerateReport}
          disabled={!canGenerateReport}
          title={!reportApiAvailable
            ? "Отчёты недоступны в локальной сессии"
            : !canGenerateReport
              ? "Нужен хотя бы 1 шаг в активном пути"
              : "Сгенерировать отчёт по активному PathSpec"}
        >
          {reportLoading ? "Генерация..." : "AI-отчёт"}
        </button>
        <div ref={menuRef} className={`interviewPathHeaderMenu ${actionsOpen ? "isOpen" : ""}`}>
          <button
            type="button"
            className="secondaryBtn smallBtn interviewPathHeaderMenuTrigger"
            onClick={() => setActionsOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            title="Дополнительные действия"
          >
            ⋯
          </button>
          {actionsOpen ? (
            <div className="interviewPathHeaderMenuPopover" role="menu">
              <button
                type="button"
                className="interviewPathHeaderMenuItem"
                onClick={() => {
                  setActionsOpen(false);
                  onOpenReports?.();
                }}
                disabled={!reportApiAvailable}
              >
                Отчёты
              </button>
              <button
                type="button"
                className="interviewPathHeaderMenuItem"
                onClick={() => {
                  setActionsOpen(false);
                  onCopyMarkdown?.();
                }}
                disabled={!hasMarkdown}
              >
                Скопировать markdown
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="muted small interviewPathHeaderMetrics">
        Шагов: {Number(metrics?.steps_count || 0)}, Работа: {formatHHMMFromSeconds(metrics?.work_time_total_sec || 0)}, Ожидание: {formatHHMMFromSeconds(metrics?.wait_time_total_sec || 0)}, Итого: {formatHHMMFromSeconds(metrics?.total_time_sec || 0)}.
      </div>
      {showRouteWarning ? (
        <div className="interviewAnnotationNotice warn">
          Маршрут оборван: {Math.max(0, stepsCount)} шагов · причина: {stopReason} · последний: #{Number(lastStep?.order_index || 0)} {toText(lastStep?.title || "—")}
          <button
            type="button"
            className="secondaryBtn tinyBtn"
            onClick={() => setShowBuildDebugDetails((prev) => !prev)}
            style={{ marginLeft: 8 }}
          >
            {showBuildDebugDetails ? "скрыть" : "подробнее"}
          </button>
          {showBuildDebugDetails ? (
            <div className="muted small" style={{ marginTop: 6 }}>
              source={toText(pathIdUsed || debug?.path_id_used || "—")}
              {" · "}
              first=#{Number(debug?.first_step?.order_index || 0)} {toText(debug?.first_step?.title || "—")}
              {" · "}
              last_bpmn={toText(lastStep?.bpmn_ref || debug?.stop_at_bpmn_id || "—")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
