import { useCallback, useRef, useState } from "react";
import { AnalysisSection, AnalysisSkeleton } from "../../../features/process/analysis/ui/index.js";
import styles from "../../../features/process/analysis/ProcessAnalysis.module.css";
import { apiGetOperationCatalog, apiLlmAnalysis } from "../../../lib/api";
import { writeLastAnalysis } from "../../../features/process/processman/lastAnalysisStore";
import {
  LLM_ANALYSIS_STATUS,
  buildOperationLabels,
  buildStepLabels,
  errorTextForStatus,
  mapLlmAnalysisResponse,
} from "./llmAnalysisView";

function ResultCard({ title, children, testId }) {
  return (
    <div className={styles.analysisCard} data-testid={testId}>
      <div className={styles.analysisCardTitle}>{title}</div>
      <div className={styles.analysisCardBody}>{children}</div>
    </div>
  );
}

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
    if (mapped.analysis) writeLastAnalysis(sessionId, mapped.analysis);
    void loadCatalogOnce(mapped.analysis);
  }, [sessionId, loadCatalogOnce]);

  const hasResult = [LLM_ANALYSIS_STATUS.OK, LLM_ANALYSIS_STATUS.PARTIAL, LLM_ANALYSIS_STATUS.CACHED].includes(state.status);
  const a = state.analysis || {};
  const stepName = (sid) => stepLabels[sid] || sid;

  const actions = (
    <>
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
        className="primaryBtn smallBtn"
        data-testid="llm-analysis-run"
        disabled={state.status === LLM_ANALYSIS_STATUS.LOADING}
        onClick={() => void run(false)}
      >
        {state.status === LLM_ANALYSIS_STATUS.LOADING ? "Анализ…" : (hasResult ? "Повторить" : "Анализ LLM")}
      </button>
    </>
  );

  return (
    <AnalysisSection
      title="Анализ LLM"
      subtitle="Оценка схемы целиком: узкие места, кандидаты на роботизацию, риски. Запуск — только по кнопке."
      actions={actions}
      data-testid="llm-analysis-block"
    >
      {confirmRefresh ? (
        <div className={styles.analysisHint} data-testid="llm-analysis-confirm">
          Повторный анализ с обходом кэша потратит токены. Продолжить?{" "}
          <button type="button" className="secondaryBtn smallBtn" onClick={() => void run(true)}>Да, обновить</button>{" "}
          <button type="button" className="secondaryBtn smallBtn" onClick={() => setConfirmRefresh(false)}>Отмена</button>
        </div>
      ) : null}

      {state.status === LLM_ANALYSIS_STATUS.LOADING ? (
        <AnalysisSkeleton variant="card" count={4} data-testid="llm-analysis-loading" />
      ) : null}

      {[LLM_ANALYSIS_STATUS.NO_PROVIDER, LLM_ANALYSIS_STATUS.RATE_LIMITED, LLM_ANALYSIS_STATUS.DISABLED, LLM_ANALYSIS_STATUS.ERROR].includes(state.status) ? (
        <div className={styles.analysisError} data-testid="llm-analysis-error">
          {state.errorText || errorTextForStatus(state.status)}
        </div>
      ) : null}

      {hasResult ? (
        <>
          <div className={styles.analysisHint} data-testid="llm-analysis-result">
            {state.status === LLM_ANALYSIS_STATUS.CACHED ? "Результат из кэша (схема не менялась, 0 токенов). " : ""}
            {state.status === LLM_ANALYSIS_STATUS.PARTIAL ? "Ответ LLM распознан частично — показано то, что удалось разобрать. " : ""}
            {state.dropped > 0 ? `Отброшено ссылок на несуществующие шаги/коды: ${state.dropped}.` : ""}
          </div>

          <div className={styles.analysisCardGrid}>
            <ResultCard title="Узкие места" testId="llm-analysis-bottlenecks">
              {a.bottlenecks?.length ? (
                <ul className={styles.analysisList}>
                  {a.bottlenecks.map((b, i) => (
                    <li key={`b-${i}`}>
                      <b>{stepName(b.step_id)}</b> <span className={styles.analysisSeverity}>{b.severity}</span>: {b.reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.analysisHint}>Не выявлено</div>
              )}
            </ResultCard>

            <ResultCard title="Кандидаты на роботизацию" testId="llm-analysis-robotization">
              {a.robotization_candidates?.length ? (
                <ul className={styles.analysisList}>
                  {a.robotization_candidates.map((r, i) => (
                    <li key={`r-${i}`}>
                      <b>{stepName(r.step_id)}</b>: <code>{r.operation_code}</code>
                      {opLabels[r.operation_code] ? ` (${opLabels[r.operation_code]})` : ""} — {r.rationale}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.analysisHint}>Не выявлены</div>
              )}
            </ResultCard>

            <ResultCard title="Риски" testId="llm-analysis-risks">
              {a.risks?.length ? (
                <ul className={styles.analysisList}>
                  {a.risks.map((r, i) => (
                    <li key={`k-${i}`}>
                      <span className={styles.analysisSeverity}>{r.severity}</span>: {r.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.analysisHint}>Не выявлены</div>
              )}
            </ResultCard>

            <ResultCard title="Открытые вопросы" testId="llm-analysis-questions">
              {a.open_questions?.length ? (
                <ul className={styles.analysisList}>
                  {a.open_questions.map((q, i) => (
                    <li key={`q-${i}`}>{q.text}</li>
                  ))}
                </ul>
              ) : (
                <div className={styles.analysisHint}>Нет открытых вопросов</div>
              )}
            </ResultCard>
          </div>

          {!a.bottlenecks?.length && !a.robotization_candidates?.length && !a.risks?.length && !a.open_questions?.length ? (
            <div className={styles.analysisHint}>LLM не нашёл замечаний по схеме.</div>
          ) : null}
        </>
      ) : null}
    </AnalysisSection>
  );
}
