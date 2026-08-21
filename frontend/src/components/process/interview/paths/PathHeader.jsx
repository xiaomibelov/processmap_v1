import { useEffect, useRef, useState } from "react";
import { formatHHMMFromSeconds } from "../utils";

function toText(value) {
  return String(value || "").trim();
}

function shortHash(hashRaw) {
  return toText(hashRaw).slice(0, 8) || "—";
}

function pathSourceTone(pathSourceRaw) {
  const source = toText(pathSourceRaw).toLowerCase();
  if (source === "flow_tier") return "isLegacy";
  if (source === "node_path_meta") return "isStable";
  return "isUnknown";
}

export default function PathHeader({
  scenario,
  scenarioTitle,
  scenarioStatusClass,
  scenarioStatusLabel,
  tier,
  sequenceKey,
  pathIdUsed,
  pathSource,
  pathSourceLabel,
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
  const sourceTone = pathSourceTone(pathSource);
  const sourceText = toText(pathSourceLabel) || "источник · unknown";

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
      <div className="interviewPathHeaderTop">
        <div className="interviewPathHeaderMain">
          <strong className="interviewPathHeaderTitle">{toText(scenarioTitle?.(scenario) || scenario?.label || "Сценарий")}</strong>
          {toText(tier) ? <span className={`tier tier-${toText(tier).toLowerCase()}`}>{toText(tier)}</span> : null}
          <span className={`badge ${toText(scenarioStatusClass?.(scenario))}`}>
            {scenarioStatusLabel?.(scenario)}
          </span>
          <span className={`interviewPathSourcePill ${sourceTone}`}>{sourceText}</span>
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
                  Скопировать Markdown
                </button>
                <button
                  type="button"
                  className="interviewPathHeaderMenuItem"
                  onClick={async () => {
                    setActionsOpen(false);
                    await handleCopyHash();
                  }}
                  disabled={!fullHash}
                >
                  Скопировать хеш
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="interviewPathHeaderSummary">
        <span className="interviewPathMetric">шаги {Math.max(0, stepsCount)}</span>
        <span className="interviewPathMetric">работа {formatHHMMFromSeconds(metrics?.work_time_total_sec || 0)}</span>
        <span className="interviewPathMetric">ожидание {formatHHMMFromSeconds(metrics?.wait_time_total_sec || 0)}</span>
        <span className="interviewPathMetric isTotal">итого {formatHHMMFromSeconds(metrics?.total_time_sec || 0)}</span>
        {fullHash ? (
          <button
            type="button"
            className="interviewPathHashBtn"
            onClick={handleCopyHash}
            title={fullHash}
          >
            хеш {shortHash(fullHash)}
          </button>
        ) : null}
      </div>
      {(toText(sequenceKey) || toText(pathIdUsed)) ? (
        <div className="muted small interviewPathHeaderMeta">
          {toText(sequenceKey) ? <span>seq {toText(sequenceKey)}</span> : null}
          {toText(pathIdUsed) ? <span>path {toText(pathIdUsed)}</span> : null}
        </div>
      ) : null}
      {showRouteWarning ? (
        <div className="interviewAnnotationNotice warn">
          Маршрут оборван: {Math.max(0, stepsCount)} шагов · причина: {stopReason} · последний: #{Number(lastStep?.order_index || 0)} {toText(lastStep?.title || "—")}
          <button
            type="button"
            className="secondaryBtn tinyBtn"
            onClick={() => setShowBuildDebugDetails((prev) => !prev)}
            style={{ marginLeft: 8 }}
          >
            {showBuildDebugDetails ? "скрыть" : "подробно"}
          </button>
          {showBuildDebugDetails ? (
            <div className="muted small" style={{ marginTop: 6 }}>
              источник={toText(pathIdUsed || debug?.path_id_used || "—")}
              {" · "}
              первый=#{Number(debug?.first_step?.order_index || 0)} {toText(debug?.first_step?.title || "—")}
              {" · "}
              last_bpmn={toText(lastStep?.bpmn_ref || debug?.stop_at_bpmn_id || "—")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
