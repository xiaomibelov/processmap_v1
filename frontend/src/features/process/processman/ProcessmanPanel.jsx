import { useCallback, useEffect, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import SchemaAssistantBlock from "../../../components/process/SchemaAssistantBlock";
import { apiLlmFeedback } from "../../../lib/api";
import processmanIconRaw from "../../../assets/icons/processman.svg?raw";
import ProcessmanTobe from "./ProcessmanTobe";
import ProcessmanAnalysis from "./ProcessmanAnalysis";
import ProcessmanNeutral from "./ProcessmanNeutral";
import { contextBadgeKey, resolvePanelContext } from "./processmanView";
import "./processman.css";

// LLM4 — панель PROCESSMAN (документ владельца «PROCESSMAN-панель», ревизия 1).
// Push-дровер 380px (<1200px — overlay 360px + подложка, см. processman.css).
// Контент следует за активной вкладкой воркбенча (tab + mode), панель НЕ
// закрывается при переключении вкладок; клик по канвасу НЕ закрывает.
// Экономика токенов: открытие/смена контекста/выбор шага = 0 LLM-вызовов
// (запрос только по клику действия в TO BE/Схема-контексте или ↻).
const t = ru.processman;

function ThumbIcon({ up }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      style={up ? undefined : { transform: "rotate(180deg)" }}>
      <path d="M4.5 7v6H2.8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1.7zm0 0 2.6-4.6c.8-1.4 2.6-.8 2.6.8V5h3.4a1.2 1.2 0 0 1 1.2 1.4l-1 5A1.2 1.2 0 0 1 12.1 12.6H4.5" />
    </svg>
  );
}

export default function ProcessmanPanel({
  sessionId,
  tab = "",
  mode = "",
  selectedBpmnElement = null,
  llmStatus = null,
  cacheRef,
  closing = false,
  onClose,
  onOpenFullAnalysis,
}) {
  const panelRef = useRef(null);
  const [answerInfo, setAnswerInfo] = useState({ hasAnswer: false, fromCache: false, action: "" });
  const [feedbackGiven, setFeedbackGiven] = useState("");

  const context = resolvePanelContext({ tab, mode });

  // Клавиатура (спека §10): фокус в панель при открытии; Esc закрывает;
  // при закрытии фокус возвращается на кнопку тулбара. Focus-trap нет (не нужен).
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  useEffect(() => () => {
    // возврат фокуса на кнопку PROCESSMAN после закрытия (размонтирование)
    const btn = document.querySelector('[data-testid="diagram-action-processman"]');
    if (btn instanceof HTMLElement) btn.focus();
  }, []);

  const sendFeedback = useCallback((rating) => {
    if (feedbackGiven) return;
    setFeedbackGiven(rating); // оптимистично; ошибки — молча (спека v1)
    void apiLlmFeedback({ rating, sessionId, action: answerInfo.action }).catch(() => {});
  }, [feedbackGiven, sessionId, answerInfo.action]);

  return (
    <>
      <div className="pm-processman-backdrop" data-testid="processman-backdrop" aria-hidden="true" />
      <aside
        ref={panelRef}
        className={`pm-processman${closing ? " pm-processman--closing" : ""}`}
        data-testid="processman-panel"
        role="complementary"
        aria-label={t.buttonAriaLabel}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose?.();
          }
        }}
      >
        <div className="pm-processman__header">
          <span
            className="pm-processman__icon"
            data-testid="processman-icon"
            aria-hidden="true"
            // SVG из assets/icons/processman.svg (currentColor), статичный файл проекта
            dangerouslySetInnerHTML={{ __html: processmanIconRaw }}
          />
          <span className="pm-processman__title">{t.buttonLabel}</span>
          <span className="pm-processman__context-badge" data-testid="processman-context-badge">
            {t[contextBadgeKey(context)]}
          </span>
          <button
            type="button"
            className="pm-processman__close"
            data-testid="processman-close"
            aria-label={t.close}
            title={t.close}
            onClick={() => onClose?.()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="pm-processman__body" data-testid="processman-body">
          {context === "schema" ? (
            <div data-testid="processman-schema-pane">
              <SchemaAssistantBlock sessionId={sessionId} selectedElement={selectedBpmnElement} />
            </div>
          ) : null}
          {context === "tobe" ? (
            <ProcessmanTobe
              sessionId={sessionId}
              selectedElement={selectedBpmnElement}
              llmStatus={llmStatus}
              cacheRef={cacheRef}
              onAnswerChange={setAnswerInfo}
            />
          ) : null}
          {context === "analysis" ? (
            <ProcessmanAnalysis
              sessionId={sessionId}
              llmStatus={llmStatus}
              onOpenFullAnalysis={onOpenFullAnalysis}
            />
          ) : null}
          {context === "neutral" ? <ProcessmanNeutral /> : null}
        </div>

        <div className="pm-processman__footer" data-testid="processman-footer">
          <span className="pm-processman__footer-disclaimer" title={t.disclaimer}>{t.disclaimer}</span>
          {answerInfo.hasAnswer ? (
            <span className="pm-processman__cache-badge" data-testid="processman-cache-badge">
              {answerInfo.fromCache ? t.cacheCached : t.cacheFresh}
            </span>
          ) : null}
          {answerInfo.hasAnswer ? (
            <span className="pm-processman__feedback">
              {feedbackGiven ? (
                <span data-testid="processman-feedback-thanks">{t.feedbackThanks}</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="pm-processman__feedback-btn"
                    data-testid="processman-feedback-up"
                    aria-label={t.feedbackUpAria}
                    title={t.feedbackUpAria}
                    onClick={() => sendFeedback("up")}
                  >
                    <ThumbIcon up />
                  </button>
                  <button
                    type="button"
                    className="pm-processman__feedback-btn"
                    data-testid="processman-feedback-down"
                    aria-label={t.feedbackDownAria}
                    title={t.feedbackDownAria}
                    onClick={() => sendFeedback("down")}
                  >
                    <ThumbIcon up={false} />
                  </button>
                </>
              )}
            </span>
          ) : null}
        </div>
      </aside>
    </>
  );
}
