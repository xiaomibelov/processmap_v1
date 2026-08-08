import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import { apiLlmExplainStep, apiLlmStepQa, apiLlmSuggestNext } from "../../../lib/api";
import {
  ANSWER_STATUS,
  answerCacheKey,
  buildAnswerMeta,
  extractAnswerText,
  formatClock,
  mapActionResponse,
  readElementId,
  resolveLlmStatusView,
} from "./processmanView";

// LLM4 — TO BE-контекст панели PROCESSMAN (документ владельца, ревизия 1).
// Три действия кнопками 40px (suggest-next / explain-step / step-qa) + последний
// ответ (confidence, время, ↻). Состояния S1–S8. Экономика токенов: запрос
// ТОЛЬКО по клику действия или ↻ (force=1); смена шага/контекста — 0 вызовов.
// Кэш v1 = in-memory (cacheRef живёт в ProcessStage — переживает закрытие
// панели, умирает с перезагрузкой страницы).
const t = ru.processman;

const SKELETON_DELAY_MS = 300; // S4: skeleton только если ответ дольше 300ms

const ACTION_RUNNERS = {
  suggest: (sid, stepId, { force }) => apiLlmSuggestNext(sid, { afterStepId: stepId, force }),
  explain: (sid, stepId, { force }) => apiLlmExplainStep(sid, { stepId, force }),
  qa: (sid, stepId, { force, question }) => apiLlmStepQa(sid, { stepId, question, force }),
};

export default function ProcessmanTobe({
  sessionId,
  selectedElement = null,
  llmStatus = null,
  cacheRef,
  onAnswerChange,
}) {
  const [answer, setAnswer] = useState({ status: ANSWER_STATUS.IDLE });
  const [slow, setSlow] = useState(false);
  const [question, setQuestion] = useState("");
  const skeletonTimerRef = useRef(null);
  const requestSeqRef = useRef(0);

  const elementId = readElementId(selectedElement);
  const llmView = useMemo(() => resolveLlmStatusView(llmStatus), [llmStatus]);
  const notConfigured = llmView.kind === "not_configured"; // S1
  const quotaExhausted = llmView.kind === "configured" && llmView.exhausted; // S7
  const loading = answer.status === ANSWER_STATUS.LOADING;
  const actionsDisabled = loading || !elementId || notConfigured || quotaExhausted;

  // уведомляем футер: есть ли ответ и откуда он (бейдж кэша, 👍/👎)
  useEffect(() => {
    onAnswerChange?.({
      hasAnswer: answer.status === ANSWER_STATUS.OK,
      fromCache: answer?.meta?.fromCache === true,
      action: answer?.action || "",
    });
  }, [answer, onAnswerChange]);

  // очистка таймера skeleton при размонтировании
  useEffect(() => () => {
    if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
  }, []);

  const run = useCallback(async (action, { force = 0 } = {}) => {
    if (!sessionId || !elementId) return;
    if (action === "qa" && !String(question || "").trim()) return;
    const cache = cacheRef?.current;
    const key = answerCacheKey(action, elementId);
    // S3: in-memory попадание — 0 запросов, бейдж «из кэша · 0 токенов»
    if (!force && cache?.has(key)) {
      const hit = cache.get(key);
      setSlow(false);
      setAnswer({
        status: ANSWER_STATUS.OK,
        action,
        stepId: elementId,
        text: hit.text,
        meta: { ...hit.meta, fromCache: true },
        at: hit.at,
      });
      return;
    }
    const seq = ++requestSeqRef.current;
    setSlow(false);
    setAnswer({ status: ANSWER_STATUS.LOADING, action, stepId: elementId });
    if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    skeletonTimerRef.current = setTimeout(() => setSlow(true), SKELETON_DELAY_MS);
    try {
      const resp = await ACTION_RUNNERS[action]?.(sessionId, elementId, { force, question });
      if (seq !== requestSeqRef.current) return; // устаревший ответ
      const mapped = mapActionResponse(resp);
      if (mapped.status === ANSWER_STATUS.OK) {
        const text = extractAnswerText(action, mapped.data);
        const meta = buildAnswerMeta(mapped.data, { fromCache: false });
        const at = Date.now();
        cache?.set(key, { text, meta, at });
        setAnswer({ status: ANSWER_STATUS.OK, action, stepId: elementId, text, meta, at });
      } else {
        setAnswer({
          status: ANSWER_STATUS.ERROR,
          action,
          stepId: elementId,
          errorText: mapped.errorText,
          errorStatus: mapped.errorStatus,
        });
      }
    } finally {
      if (skeletonTimerRef.current) {
        clearTimeout(skeletonTimerRef.current);
        skeletonTimerRef.current = null;
      }
      if (seq === requestSeqRef.current) setSlow(false);
    }
  }, [sessionId, elementId, question, cacheRef]);

  // S1 — нет ключа: состояние + действия disabled (не скрываем — видно, что недоступно)
  return (
    <div data-testid="processman-tobe">
      {notConfigured ? (
        <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-tobe-no-key">
          <div className="pm-processman__state-title">{t.noKeyTitle}</div>
          <div className="pm-processman__state-text">{t.noKeyText}</div>
        </div>
      ) : null}
      {/* S7 — лимит по quota */}
      {quotaExhausted ? (
        <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-tobe-quota">
          <div className="pm-processman__state-title">{t.quotaExhaustedTitle}</div>
          <div className="pm-processman__state-text">{t.quotaExhaustedText}</div>
        </div>
      ) : null}

      {/* S2 — шаг не выбран */}
      {!elementId ? (
        <div className="pm-processman__state" data-testid="processman-tobe-empty">
          <div className="pm-processman__state-title">{t.emptyTitle}</div>
          <div className="pm-processman__state-text">{t.emptyText}</div>
        </div>
      ) : null}

      <div className="pm-processman__actions" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="pm-processman__action"
          data-testid="processman-action-suggest"
          disabled={actionsDisabled}
          title={!elementId ? t.emptyTitle : undefined}
          onClick={() => run("suggest")}
        >
          {t.suggestLabel}
        </button>
        <button
          type="button"
          className="pm-processman__action"
          data-testid="processman-action-explain"
          disabled={actionsDisabled}
          title={!elementId ? t.emptyTitle : undefined}
          onClick={() => run("explain")}
        >
          {t.explainLabel}
        </button>
        <div className="pm-processman__qa-row">
          <input
            className="pm-processman__qa-input"
            data-testid="processman-qa-input"
            placeholder={t.qaPlaceholder}
            value={question}
            disabled={!elementId || notConfigured || quotaExhausted}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !actionsDisabled && question.trim()) run("qa");
            }}
          />
          <button
            type="button"
            className="pm-processman__action"
            data-testid="processman-action-qa"
            disabled={actionsDisabled || !question.trim()}
            onClick={() => run("qa")}
          >
            {t.qaSend}
          </button>
        </div>
      </div>

      {/* зона ответа: aria-live (S4 skeleton / S5 ответ / S6 ошибка) */}
      <div className="pm-processman__answer" aria-live="polite" data-testid="processman-answer" style={{ marginTop: 10 }}>
        {loading && slow ? (
          <div data-testid="processman-answer-loading">
            <div className="pm-processman__skeleton-line" style={{ width: "72%" }} />
            <div className="pm-processman__skeleton-line" style={{ width: "94%" }} />
            <div className="pm-processman__skeleton-line" style={{ width: "58%" }} />
            <div className="pm-processman__hint">{t.loadingText}</div>
          </div>
        ) : null}

        {loading && !slow ? <div className="pm-processman__hint">{t.loadingText}</div> : null}

        {answer.status === ANSWER_STATUS.ERROR ? (
          <div className="pm-processman__state pm-processman__state--error" data-testid="processman-answer-error">
            <div className="pm-processman__state-title">{t.errorTitle}</div>
            <div className="pm-processman__state-text" style={{ marginBottom: 8 }}>{answer.errorText}</div>
            <button
              type="button"
              className="pm-processman__action"
              data-testid="processman-answer-retry"
              onClick={() => run(answer.action, { force: 1 })}
            >
              {t.retryLabel}
            </button>
          </div>
        ) : null}

        {answer.status === ANSWER_STATUS.OK ? (
          <div data-testid="processman-answer-ok">
            <div className="pm-processman__section-title">{t.lastAnswerTitle}</div>
            <div className="pm-processman__answer-text" data-testid="processman-answer-text">{answer.text}</div>
            <div className="pm-processman__answer-meta">
              {answer.meta?.confidence != null ? (
                <span data-testid="processman-answer-confidence">
                  {t.confidenceLabel}: {Math.round(answer.meta.confidence * 100)}%
                </span>
              ) : null}
              <span data-testid="processman-answer-time">{formatClock(answer.at)}</span>
              {answer.meta?.fallback ? (
                <span className="pm-processman__fallback-badge" data-testid="processman-answer-fallback">
                  {t.fallbackBadge}
                </span>
              ) : null}
              <button
                type="button"
                className="pm-processman__action"
                style={{ height: 28, fontSize: 12, marginLeft: "auto" }}
                data-testid="processman-answer-refresh"
                aria-label={t.refreshAria}
                disabled={loading}
                onClick={() => run(answer.action, { force: 1 })}
              >
                ↻ {t.refreshLabel}
              </button>
            </div>
            {answer.meta?.confidence != null && answer.meta.confidence < 0.6 && answer.meta.openQuestions.length ? (
              <div data-testid="processman-answer-open-questions" style={{ marginTop: 8 }}>
                <div className="pm-processman__section-title">{t.openQuestionsTitle}</div>
                <ul className="pm-processman__summary-list">
                  {answer.meta.openQuestions.map((q, i) => (
                    <li key={i}>{String(q?.question || q?.text || q)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {answer.status === ANSWER_STATUS.IDLE && !loading ? (
          <div className="pm-processman__hint">{t.emptyText}</div>
        ) : null}
      </div>
    </div>
  );
}
