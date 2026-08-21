import { useCallback, useEffect, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import processmanIconRaw from "../../../assets/icons/processman.svg?raw";
import ProcessmanAnalysis from "./ProcessmanAnalysis";
import ProcessmanNeutral from "./ProcessmanNeutral";
import ProcessmanTobe from "./ProcessmanTobe";
import ProcessmanContextChip from "./ProcessmanContextChip";
import ProcessmanOnboarding from "./ProcessmanOnboarding";
import { isOnboardingSeen, markOnboardingSeen } from "./chat/processmanOnboarding";
import { resetChatHistories } from "./chat/processmanChatStore";
import { resolvePanelContext } from "./processmanView";
import "./processman.css";

// PROCESSMAN-REDESIGN (PR-2) — компактная шапка панели, message-level actions,
// TO BE chat feed, collapse-to-icon rail (48px) и простой footer-дисклеймер.
// Экономика токенов: панель сама НЕ дёргает LLM API; useEffect без apiLlm/fetch.
const t = ru.processman;

function IconNewConversation() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconQuestion() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.7a2.4 2.4 0 0 1 4.4 1.4c0 1.6-1.6 2.1-2.1 3.1" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function IconPanelLeft() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M9 5v14M15 9l-3 3 3 3" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M9 5v14M12 9l3 3-3 3" />
    </svg>
  );
}

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
  const [assistantStatus, setAssistantStatus] = useState("ready");
  const [collapsed, setCollapsed] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(() => isOnboardingSeen(globalThis.localStorage));
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatResetVersion, setChatResetVersion] = useState(0);
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

  const handleAnswerChange = useCallback(() => {}, []);

  const handleStatusChange = useCallback((next) => {
    setAssistantStatus(next);
  }, []);

  const handleHideOnboarding = useCallback(() => {
    markOnboardingSeen(globalThis.localStorage);
    setOnboardingSeen(true);
    setHelpOpen(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    resetChatHistories(sessionId);
    setAssistantStatus("ready");
    setChatResetVersion((v) => v + 1);
  }, [sessionId]);

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
              <button
                type="button"
                className="pm-processman__header-btn"
                data-testid="processman-new-conversation"
                aria-label={t.newConversationAria}
                title={t.newConversationAria}
                onClick={handleNewConversation}
              >
                <IconNewConversation />
              </button>
              {context === "tobe" && onboardingSeen ? (
                <button
                  type="button"
                  className="pm-processman__header-btn"
                  data-testid="processman-help"
                  aria-label={t.helpAria}
                  title={t.helpAria}
                  onClick={() => setHelpOpen((v) => !v)}
                >
                  <IconQuestion />
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
                <IconPanelLeft />
              </button>
              <button
                type="button"
                className="pm-processman__close"
                data-testid="processman-close"
                onClick={onClose}
                aria-label={t.close}
                title={t.close}
              >
                <IconClose />
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
              <IconExpand />
            </button>
          )}
        </header>

        {!collapsed ? (
          <div className="pm-processman__body" data-testid="processman-body">
            {context === "tobe" ? (
              <div className="pm-processman-workbench" data-testid="processman-workbench">
                <div className="pm-processman__chat-wrap">
                  <ProcessmanContextChip
                    selectedElement={selectedBpmnElement}
                    onFocus={onFocusElement}
                    onReset={onClearSelection}
                  />
                  {showOnboarding ? <ProcessmanOnboarding onHide={handleHideOnboarding} /> : null}
                  <ProcessmanTobe
                    key={chatResetVersion}
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
            <span className="pm-processman__footer-disclaimer" title={t.disclaimer}>{t.disclaimer}</span>
          </footer>
        ) : null}
      </aside>
    </>
  );
}
