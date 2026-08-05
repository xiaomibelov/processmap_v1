import { useCallback, useRef, useState } from "react";
import { apiGetOperationCatalog, apiLlmAnalysis } from "../../../lib/api";
import {
  LLM_ANALYSIS_STATUS,
  buildOperationLabels,
  buildStepLabels,
  errorTextForStatus,
  mapLlmAnalysisResponse,
} from "./llmAnalysisView";

// LLM1 — блок «Анализ LLM»: кнопка только по клику (никаких авто-вызовов),
// «Обновить» (force=1) — с inline-confirm о повторном расходе токенов.
// Статусы: loading / ok / partial / cached / no_provider / rate_limited / disabled / error.
export default function LlmAnalysisBlock({ sessionId, steps = [] }) {
  const [state, setState] = useState({ status: LLM_ANALYSIS_STATUS.IDLE });
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [opLabels, setOpLabels] = useState({});
  const catalogLoadedRef = useRef(false);
  const stepLabels = buildStepLabels(steps);

  const loadCatalogOnce = useCallback(async (analysis) => {
    if (catalogLoadedRef.current) return;
    if (!(analysis?.robotization_candidates || []).length) return;
    catalogLoadedRef.current = true;
    try {
      const r = await apiGetOperationCatalog();
      setOpLabels(buildOperationLabels(r.ok ? r.result : []));
    } catch {
      // каталог недоступен — показываем сырые коды, это не блокирует анализ
    }
  }, []);

  const run = useCallback(async (force) => {
    setConfirmRefresh(false);
    setState({ status: LLM_ANALYSIS_STATUS.LOADING });
    const resp = await apiLlmAnalysis(sessionId, { force });
    const mapped = mapLlmAnalysisResponse(resp);
    setState(mapped);
    void loadCatalogOnce(mapped.analysis);
  }, [sessionId, loadCatalogOnce]);

  const hasResult = [LLM_ANALYSIS_STATUS.OK, LLM_ANALYSIS_STATUS.PARTIAL, LLM_ANALYSIS_STATUS.CACHED].includes(state.status);
  const a = state.analysis || {};
  const stepName = (sid) => stepLabels[sid] || sid;

  return (
    <div className="interviewBlock" data-testid="llm-analysis-block">
      <div className="interviewBlockHead">
        <div>
          <div className="interviewBlockTitle">Анализ LLM</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Оценка схемы целиком: узкие места, кандидаты на роботизацию, риски. Запуск — только по кнопке.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasResult ? (
            <button
              type="button"
              className="secondaryBtn smallBtn"
              data-testid="llm-analysis-refresh"
              disabled={state.status === LLM_ANALYSIS_STATUS.LOADING}
              onClick={() => setConfirmRefresh(true)}
            >
              Обновить
            </button>
          ) : null}
          <button
            type="button"
            className="secondaryBtn smallBtn"
            data-testid="llm-analysis-run"
            disabled={state.status === LLM_ANALYSIS_STATUS.LOADING}
            onClick={() => void run(false)}
          >
            {state.status === LLM_ANALYSIS_STATUS.LOADING ? "Анализ…" : (hasResult ? "Повторить" : "Анализ LLM")}
          </button>
        </div>
      </div>

      {confirmRefresh ? (
        <div className="muted small" data-testid="llm-analysis-confirm" style={{ margin: "8px 0" }}>
          Повторный анализ с обходом кэша потратит токены. Продолжить?{" "}
          <button type="button" className="secondaryBtn smallBtn" onClick={() => void run(true)}>Да, обновить</button>{" "}
          <button type="button" className="secondaryBtn smallBtn" onClick={() => setConfirmRefresh(false)}>Отмена</button>
        </div>
      ) : null}

      {state.status === LLM_ANALYSIS_STATUS.LOADING ? (
        <div className="muted small" data-testid="llm-analysis-loading" style={{ margin: "8px 0" }}>Запрашиваю анализ у LLM…</div>
      ) : null}

      {[LLM_ANALYSIS_STATUS.NO_PROVIDER, LLM_ANALYSIS_STATUS.RATE_LIMITED, LLM_ANALYSIS_STATUS.DISABLED, LLM_ANALYSIS_STATUS.ERROR].includes(state.status) ? (
        <div className="muted small" data-testid="llm-analysis-error" style={{ margin: "8px 0", color: "#b91c1c" }}>
          {state.errorText || errorTextForStatus(state.status)}
        </div>
      ) : null}

      {hasResult ? (
        <div data-testid="llm-analysis-result" style={{ marginTop: 8 }}>
          <div className="muted small" style={{ marginBottom: 8 }}>
            {state.status === LLM_ANALYSIS_STATUS.CACHED ? "Результат из кэша (схема не менялась, 0 токенов). " : ""}
            {state.status === LLM_ANALYSIS_STATUS.PARTIAL ? "Ответ LLM распознан частично — показано то, что удалось разобрать. " : ""}
            {state.dropped > 0 ? `Отброшено ссылок на несуществующие шаги/коды: ${state.dropped}.` : ""}
          </div>

          {a.bottlenecks?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div className="interviewBlockTitle small">Узкие места</div>
              <ul className="muted small" style={{ margin: "4px 0", paddingLeft: 18 }}>
                {a.bottlenecks.map((b, i) => (
                  <li key={`b-${i}`}><b>{stepName(b.step_id)}</b> [{b.severity}]: {b.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {a.robotization_candidates?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div className="interviewBlockTitle small">Кандидаты на роботизацию</div>
              <ul className="muted small" style={{ margin: "4px 0", paddingLeft: 18 }}>
                {a.robotization_candidates.map((r, i) => (
                  <li key={`r-${i}`}>
                    <b>{stepName(r.step_id)}</b>: <code>{r.operation_code}</code>
                    {opLabels[r.operation_code] ? ` (${opLabels[r.operation_code]})` : ""} — {r.rationale}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {a.risks?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div className="interviewBlockTitle small">Риски</div>
              <ul className="muted small" style={{ margin: "4px 0", paddingLeft: 18 }}>
                {a.risks.map((r, i) => (
                  <li key={`k-${i}`}>[{r.severity}] {r.text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {a.open_questions?.length ? (
            <div style={{ marginBottom: 8 }}>
              <div className="interviewBlockTitle small">Открытые вопросы</div>
              <ul className="muted small" style={{ margin: "4px 0", paddingLeft: 18 }}>
                {a.open_questions.map((q, i) => (
                  <li key={`q-${i}`}>{q.text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {!a.bottlenecks?.length && !a.robotization_candidates?.length && !a.risks?.length && !a.open_questions?.length ? (
            <div className="muted small">LLM не нашёл замечаний по схеме.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
