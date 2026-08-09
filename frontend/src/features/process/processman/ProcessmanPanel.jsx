import { useCallback, useEffect, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import { apiLlmFeedback } from "../../../lib/api";
import processmanIconRaw from "../../../assets/icons/processman.svg?raw";
import ProcessmanAnalysis from "./ProcessmanAnalysis";
import ProcessmanNeutral from "./ProcessmanNeutral";
import ProcessmanTobe from "./ProcessmanTobe";
import ProcessmanContextChip from "./ProcessmanContextChip";
import ProcessmanOnboarding from "./ProcessmanOnboarding";
import { isOnboardingSeen, markOnboardingSeen } from "./chat/processmanOnboarding";
import { resolvePanelContext, tabBadgeKey } from "./processmanView";

// PROCESSMAN-REDESIGN (PR-1) — каркас панели: новая шапка (✦ + статус +
// «?» onboarding + свернуть/закрыть), collapse-to-icon rail (48px),
// чат-лента в tobe-контексте, футер с дисклеймером + cache badge + 👍/👎.
// Экономика токенов: панель сама НЕ дёргает LLM API; useEffect без apiLlm/fetch.
const t = ru.processman;

export default function ProcessmanPanel({
  sessionId,
  tab,
  selectedBpmnElement = null,
  llmStatus = null,
  cacheRef,
  closing = false,
  onClose,
  onOpenFullAnalysis,
  diagramNodes = [],
  onFocusElement,
  onClearSelection,
}) {
  const panelRef = useRef(null);
  const [answerInfo, setAnswerInfo] = useState({ hasAnswer: false, fromCache: false, action: "" });
  const [feedback, setFeedback] = useState("");
  const [assistantStatus, setAssistantStatus] = useState("ready");
  const [collapsed, setCollapsed] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(() => isOnboardingSeen(globalThis.localStorage));
  const [helpOpen, setHelpOpen] = useState(false);
  const context = resolvePanelContext({ tab });

  useEffect(() => {
    if (closing) return undefined;
    const node = panelRef.current;
    node?.focus?.();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closing, onClose]);

  const handleAnswerChange = useCallback((next) => {
    setAnswerInfo(next);
    setFeedback("");
  }, []);

  const handleStatusChange = useCallback((next) => {
    setAssistantStatus(next);
  }, []);

  const handleHideOnboarding = useCallback(() => {
    markOnboardingSeen(globalThis.localStorage);
    setOnboardingSeen(true);
    setHelpOpen(false);
  }, []);

  const sendFeedback = (rating) => {
    if (!answerInfo.action) return;
    setFeedback(rating === "up" ? "up" : "down");
    apiLlmFeedback({
      rating,
      sessionId,
      action: answerInfo.action,
    }).catch(() => {
      // Фидбек — оптимистичный: ошибку не показываем в UI.
    });
  };

  const statusLabel = assistantStatus === "writing"
    ? t.statusWriting
    : assistantStatus === "analyzing"
      ? t.statusAnalyzing
      : t.statusReady;

  const showOnboarding = context === "tobe" && (!onboardingSeen || helpOpen);

  return (
    <>
      <div
        className={`pm-processman-backdrop${closing ? " pm-processman-backdrop--closing" : ""}`}
        data-testid="processman-backdrop"
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className={`pm-processman${closing ? " pm-processman--closing" : ""}${collapsed ? " pm-processman--collapsed" : ""}`}
        role="complementary"
        aria-label={t.buttonLabel}
        tabIndex={-1}
        data-testid="processman-panel"
      >
        <header className="pm-processman__header" data-testid="processman-header">
          <div className="pm-processman__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: processmanIconRaw }} />
          {!collapsed ? (
            <>
              <div className="pm-processman__header-text">
                <span className="pm-processman__title">{t.buttonLabel}</span>
                <span className={`pm-processman__status${assistantStatus !== "ready" ? " pm-processman__status--active" : ""}`} data-testid="processman-status">
                  {statusLabel}
                </span>
              </div>
              <span className="pm-processman__context-badge" data-testid="processman-tab-badge">{t[tabBadgeKey(tab)]}</span>
              {context === "tobe" && onboardingSeen ? (
                <button
                  type="button"
                  className="pm-processman__header-btn"
                  data-testid="processman-help"
                  aria-label={t.helpAria}
                  title={t.helpAria}
                  onClick={() => setHelpOpen((v) => !v)}
                >
                  ?
                </button>
              ) : null}
              <button
                type="button"
                className="pm-processman__header-btn"
                data-testid="processman-collapse"
                aria-label={t.collapseAria}
                title={t.collapseAria}
                onClick={() => setCollapsed(true)}
              >
                «
              </button>
              <button
                type="button"
                className="pm-processman__close"
                data-testid="processman-close"
                onClick={onClose}
                aria-label={t.close}
                title={t.close}
              >
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              className="pm-processman__expand"
              data-testid="processman-expand"
              aria-label={t.expandAria}
              title={t.expandAria}
              onClick={() => setCollapsed(false)}
            >
              »
            </button>
          )}
        </header>

        {!collapsed ? (
          <div className="pm-processman__body" data-testid="processman-body">
            {context === "tobe" ? (
              <div className="pm-processman__chat-wrap">
                <ProcessmanContextChip
                  selectedElement={selectedBpmnElement}
                  onFocus={onFocusElement}
                  onReset={onClearSelection}
                />
                {showOnboarding ? <ProcessmanOnboarding onHide={handleHideOnboarding} /> : null}
                <ProcessmanTobe
                  sessionId={sessionId}
                  selectedElement={selectedBpmnElement}
                  llmStatus={llmStatus}
                  cacheRef={cacheRef}
                  onAnswerChange={handleAnswerChange}
                  onStatusChange={handleStatusChange}
                  diagramNodes={diagramNodes}
                  onFocusElement={onFocusElement}
                />
              </div>
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
        ) : null}

        {!collapsed ? (
          <footer className="pm-processman__footer" data-testid="processman-footer">
            <span className="pm-processman__footer-disclaimer">{t.disclaimer}</span>
            {answerInfo.hasAnswer ? (
              <span className="pm-processman__cache-badge" data-testid="processman-cache-badge">
                {answerInfo.fromCache ? t.cacheCached : t.cacheFresh}
              </span>
            ) : null}
            {answerInfo.hasAnswer && context === "tobe" ? (
              <div className="pm-processman__feedback" data-testid="processman-feedback">
                <button
                  type="button"
                  className={`pm-processman__feedback-btn${feedback === "up" ? " pm-processman__feedback-btn--active" : ""}`}
                  data-testid="processman-feedback-up"
                  onClick={() => sendFeedback("up")}
                  aria-label={t.feedbackUpAria}
                  title={t.feedbackUpAria}
                >
                  👍
                </button>
                <button
                  type="button"
                  className={`pm-processman__feedback-btn${feedback === "down" ? " pm-processman__feedback-btn--active" : ""}`}
                  data-testid="processman-feedback-down"
                  onClick={() => sendFeedback("down")}
                  aria-label={t.feedbackDownAria}
                  title={t.feedbackDownAria}
                >
                  👎
                </button>
                {feedback ? (
                  <span className="pm-processman__feedback-thanks" data-testid="processman-feedback-thanks">{t.feedbackThanks}</span>
                ) : null}
              </div>
            ) : null}
          </footer>
        ) : null}
      </aside>
    </>
  );
}
