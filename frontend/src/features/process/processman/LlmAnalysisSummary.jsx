import { ru } from "../../../shared/i18n/ru";
import { resolveLlmStatusView } from "./processmanView";

// LLM4 — вкладка «Анализ процессов» панели PROCESSMAN (S6/S8).
// Сводка статуса LLM-гейтвея + CTA на полный анализ. НЕ монтирует
// LlmAnalysisBlock (он остаётся на вкладке «Анализ» воркбенча) и НЕ делает
// LLM-вызовов — только честный статус из apiLlmStatus (кэш на сессию).
const t = ru.processman;

export default function LlmAnalysisSummary({ llmStatus = null, onOpenFullAnalysis }) {
  const view = resolveLlmStatusView(llmStatus);

  const quotaLine = () => {
    if (view.limit > 0) {
      return t.analysisQuotaLine.replace("{used}", String(view.used)).replace("{limit}", String(view.limit));
    }
    return t.analysisQuotaNoLimit.replace("{used}", String(view.used));
  };

  return (
    <div data-testid="processman-analysis" style={{ padding: 12 }}>
      <div className="muted small" style={{ marginBottom: 10 }}>{t.analysisTabHint}</div>

      {view.kind === "idle" ? (
        <div className="muted small" data-testid="processman-analysis-idle" style={{ marginBottom: 10 }}>
          {t.analysisStatusUnknownText}
        </div>
      ) : null}

      {view.kind === "unknown" ? (
        <div
          data-testid="processman-analysis-unknown"
          style={{ border: "1px solid #e0a800", background: "#fffdf0", borderRadius: 8, padding: 8, marginBottom: 10 }}
        >
          <div className="small" style={{ fontWeight: 600, color: "#8a5a00", marginBottom: 4 }}>
            {t.analysisStatusUnknown}
          </div>
          <div className="muted small">{t.analysisStatusUnknownText}</div>
        </div>
      ) : null}

      {view.kind === "not_configured" ? (
        <div
          data-testid="processman-analysis-not-configured"
          style={{ border: "1px solid #f2b8b5", background: "#fef2f2", borderRadius: 8, padding: 8, marginBottom: 10 }}
        >
          <div className="small" style={{ fontWeight: 600, color: "#b91c1c", marginBottom: 4 }}>
            {t.analysisNotConfigured}
          </div>
          <div className="muted small" style={{ color: "#7f1d1d" }}>{t.analysisNotConfiguredText}</div>
        </div>
      ) : null}

      {view.kind === "configured" ? (
        <div data-testid="processman-analysis-configured" style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              color: "#0f5d28",
              background: "#e7f6ec",
              marginBottom: 6,
            }}
          >
            {t.analysisConfigured}
          </div>
          <div className="small" data-testid="processman-analysis-quota" style={{ color: "#111827", marginBottom: 6 }}>
            {quotaLine()}
          </div>
          {view.exhausted ? (
            <div className="muted small" data-testid="processman-analysis-exhausted" style={{ color: "#b91c1c", marginBottom: 6 }}>
              {t.analysisQuotaExhausted}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="primaryBtn smallBtn"
          data-testid="processman-analysis-open-full"
          onClick={() => onOpenFullAnalysis?.()}
        >
          {t.analysisOpenFull}
        </button>
        {view.kind === "not_configured" ? (
          <button
            type="button"
            className="secondaryBtn smallBtn"
            data-testid="processman-analysis-go-to"
            onClick={() => onOpenFullAnalysis?.()}
          >
            {t.analysisGoTo}
          </button>
        ) : null}
      </div>
    </div>
  );
}
