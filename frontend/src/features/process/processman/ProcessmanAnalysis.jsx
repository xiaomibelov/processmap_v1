import { useMemo } from "react";
import { ru } from "../../../shared/i18n/ru";
import { readLastAnalysis } from "./lastAnalysisStore";
import { formatClock, resolveLlmStatusView } from "./processmanView";

// LLM4 — контекст «Анализ» панели PROCESSMAN (документ владельца, ревизия 1):
// сводка последнего анализа LLM1 (in-memory стор, 0 запросов) + статус
// LLM-гейтвея/квота + «Открыть полный анализ» (БЕЗ дубля кнопки запуска —
// запуск только на вкладке «Анализ процессов» воркбенча).
const t = ru.processman;

function SummaryList({ title, items, testid }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  return (
    <div data-testid={testid} style={{ marginBottom: 8 }}>
      <div className="pm-processman__section-title">{title}</div>
      <ul className="pm-processman__summary-list">
        {list.slice(0, 5).map((item, i) => (
          <li key={i}>{typeof item === "string" ? item : String(item?.text || item?.title || item?.step_id || JSON.stringify(item))}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ProcessmanAnalysis({ sessionId, llmStatus = null, onOpenFullAnalysis }) {
  const view = resolveLlmStatusView(llmStatus);
  const last = useMemo(() => readLastAnalysis(sessionId), [sessionId]);
  const analysis = last?.analysis && typeof last.analysis === "object" ? last.analysis : null;

  const quotaLine = () => {
    if (view.limit > 0) {
      return t.analysisQuotaLine.replace("{used}", String(view.used)).replace("{limit}", String(view.limit));
    }
    return t.analysisQuotaNoLimit.replace("{used}", String(view.used));
  };

  return (
    <div data-testid="processman-analysis">
      <div className="pm-processman__hint" style={{ marginBottom: 10 }}>{t.analysisHint}</div>

      {view.kind === "configured" ? (
        <div style={{ marginBottom: 10 }}>
          <span className="pm-processman__ok-badge" data-testid="processman-analysis-configured">{t.analysisConfigured}</span>
          <div className="pm-processman__hint" data-testid="processman-analysis-quota" style={{ marginTop: 6 }}>{quotaLine()}</div>
          {view.exhausted ? (
            <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-analysis-exhausted" style={{ marginTop: 8 }}>
              <div className="pm-processman__state-title">{t.quotaExhaustedTitle}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {view.kind === "not_configured" ? (
        <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-analysis-not-configured" style={{ marginBottom: 10 }}>
          <div className="pm-processman__state-title">{t.analysisNotConfigured}</div>
          <div className="pm-processman__state-text">{t.noKeyText}</div>
        </div>
      ) : null}

      {view.kind === "unknown" ? (
        <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-analysis-unknown" style={{ marginBottom: 10 }}>
          <div className="pm-processman__state-title">{t.analysisStatusUnknown}</div>
          <div className="pm-processman__state-text">{t.analysisStatusUnknownText}</div>
        </div>
      ) : null}

      {analysis ? (
        <div data-testid="processman-analysis-summary">
          <div className="pm-processman__section-title">
            {t.lastAnswerTitle}{last?.at ? ` · ${formatClock(last.at)}` : ""}
          </div>
          <SummaryList title={t.analysisBottlenecks} items={analysis.bottlenecks} testid="processman-analysis-bottlenecks" />
          <SummaryList title={t.analysisCandidates} items={analysis.robotization_candidates} testid="processman-analysis-candidates" />
          <SummaryList title={t.analysisRisks} items={analysis.risks} testid="processman-analysis-risks" />
        </div>
      ) : (
        <div className="pm-processman__hint" data-testid="processman-analysis-empty" style={{ marginBottom: 10 }}>
          {t.analysisEmpty}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="pm-processman__action pm-processman__action--primary"
          data-testid="processman-analysis-open-full"
          onClick={() => onOpenFullAnalysis?.()}
        >
          {t.analysisOpenFull}
        </button>
      </div>
    </div>
  );
}
