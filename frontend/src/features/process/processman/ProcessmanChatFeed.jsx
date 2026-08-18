import { useEffect, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import { apiLlmFeedback } from "../../../lib/api";
import processmanIconRaw from "../../../assets/icons/processman.svg?raw";
import { formatClock } from "./processmanView";
import {
  AGENT_STATUS,
  PENDING_STAGES,
  TYPEWRITER_TICK_MS,
  typewriterDone,
  typewriterProgress,
} from "./chat/processmanChatStore";
import { splitTextByMentions } from "./chat/nodeMentions";

// PROCESSMAN-REDESIGN (PR-2) — лента диалога.
// user-сообщения — вправо без label; agent — full-width карточка без
// повторной шапки, только avatar rail + content + message actions.
const t = ru.processman;

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

function IconThumbUp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 10v10M7 10l5-7 1.5 1.2c.5.4.7 1 .5 1.6L13 10h5.5c1 0 1.7.9 1.5 1.9l-1.1 5.6a3 3 0 0 1-2.9 2.5H7" />
      <path d="M3 10h4v10H3z" />
    </svg>
  );
}

function IconThumbDown() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 14V4M7 14l5 7 1.5-1.2c.5-.4.7-1 .5-1.6L13 14h5.5c1 0 1.7-.9 1.5-1.9l-1.1-5.6A3 3 0 0 0 16 4H7" />
      <path d="M3 4h4v10H3z" />
    </svg>
  );
}

function IconRetry() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

/** Быстрый typewriter: порции символов на тик; клик/скип — весь текст сразу. */
function useTypewriter(fullText, active) {
  const [ticks, setTicks] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const text = String(fullText || "");

  useEffect(() => {
    setTicks(0);
    setSkipped(false);
  }, [text]);

  useEffect(() => {
    if (!active || skipped || typewriterDone(text, ticks)) return undefined;
    const timer = setTimeout(() => setTicks((v) => v + 1), TYPEWRITER_TICK_MS);
    return () => clearTimeout(timer);
  }, [active, skipped, text, ticks]);

  const done = skipped || !active || typewriterDone(text, ticks);
  const visibleCount = done ? text.length : typewriterProgress(text, ticks);
  return {
    visibleText: text.slice(0, visibleCount),
    done,
    skip: () => setSkipped(true),
  };
}

function MentionedText({ text, nodes, onNodeClick }) {
  const segments = splitTextByMentions(text, nodes);
  return (
    <>
      {segments.map((seg, i) => (seg.kind === "mention" ? (
        <button
          key={`m-${i}-${seg.id}`}
          type="button"
          className="pm-processman-nodechip"
          data-testid={`processman-node-chip-${seg.id}`}
          title={seg.id}
          onClick={(e) => {
            e.stopPropagation();
            onNodeClick?.(seg.id);
          }}
        >
          <IconPin />
          {seg.name}
        </button>
      ) : (
        <span key={`t-${i}`}>{seg.text}</span>
      )))}
    </>
  );
}

function PendingStages() {
  const [stageIdx, setStageIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setStageIdx((v) => Math.min(v + 1, PENDING_STAGES.length - 1));
    }, 900);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="pm-processman-stages" data-testid="processman-stages">
      {PENDING_STAGES.map((key, i) => (
        <span
          key={key}
          className={`pm-processman-stages__item${i < stageIdx ? " pm-processman-stages__item--done" : ""}${i === stageIdx ? " pm-processman-stages__item--active" : ""}`}
        >
          {t[key]}
        </span>
      ))}
    </div>
  );
}

function EditCard({ edit, onConfirm, onReject }) {
  const isPending = edit.status === AGENT_STATUS.EDIT_PENDING;
  const isApplied = edit.status === AGENT_STATUS.EDIT_APPLIED;
  const isRejected = edit.status === AGENT_STATUS.EDIT_REJECTED;
  const isExpired = edit.status === AGENT_STATUS.EDIT_EXPIRED;
  const isConflict = edit.status === AGENT_STATUS.EDIT_CONFLICT;
  const isError = edit.status === AGENT_STATUS.ERROR;

  const statusText = isApplied
    ? t.editCardApplied
    : isRejected
      ? t.editCardRejected
      : isExpired
        ? t.editCardExpired
        : isConflict
          ? t.editCardConflict
          : isError
            ? edit.errorText || t.errorTitle
            : t.editCardPending;

  return (
    <div className="pm-processman-edit-card" data-testid="processman-edit-card">
      <div className="pm-processman-edit-card__title">{t.editCardTitle}</div>
      <div className="pm-processman-edit-card__diff" data-testid="processman-edit-diff">
        <div className="pm-processman-edit-card__diff-title">{t.editCardDiffTitle}</div>
        {edit.diff.length === 0 ? (
          <div className="pm-processman-edit-card__diff-empty">—</div>
        ) : (
          <ul className="pm-processman-edit-card__diff-list">
            {edit.diff.map((item, idx) => {
              const key = `${item.op}-${item.node_id || item.from_id || "x"}-${idx}`;
              let line = "";
              if (item.op === "update") {
                line = `${item.node_id}: ${item.field} ${t.editCardFieldWas} → ${t.editCardFieldWill}: ${String(item.new_value ?? "")}`;
              } else if (item.op === "add_node") {
                line = `+ ${item.node_id} (${item.title || "<без имени>"})`;
              } else if (item.op === "add_edge") {
                line = `+ связь ${item.from_id} → ${item.to_id}`;
              } else if (item.op === "delete_node") {
                line = `− ${item.node_id}`;
              } else {
                line = JSON.stringify(item);
              }
              return (
                <li key={key} className={`pm-processman-edit-card__diff-item pm-processman-edit-card__diff-item--${item.op}`}>
                  {line}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="pm-processman-edit-card__status" data-testid="processman-edit-status">
        {statusText}
      </div>
      {isPending ? (
        <div className="pm-processman-edit-card__actions" data-testid="processman-edit-actions">
          <button
            type="button"
            className="pm-processman-edit-card__confirm"
            data-testid="processman-edit-confirm"
            onClick={(e) => { e.stopPropagation(); onConfirm?.(); }}
          >
            {t.editCardConfirm}
          </button>
          <button
            type="button"
            className="pm-processman-edit-card__reject"
            data-testid="processman-edit-reject"
            onClick={(e) => { e.stopPropagation(); onReject?.(); }}
          >
            {t.editCardReject}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AgentCard({
  msg,
  isLast,
  sessionId,
  nodes,
  onNodeClick,
  onStop,
  onRetry,
  onConfirmEdit,
  onRejectEdit,
}) {
  const [feedback, setFeedback] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const streaming = msg.status === AGENT_STATUS.STREAMING;
  const pending = msg.status === AGENT_STATUS.PENDING;
  const { visibleText, done, skip } = useTypewriter(msg.text, streaming);

  // сигналим родителю о завершении reveal (streaming → done)
  const finishedRef = useRef(false);
  useEffect(() => {
    if (streaming && done && !finishedRef.current) {
      finishedRef.current = true;
      msg.onRevealDone?.();
    }
    if (!streaming) finishedRef.current = false;
  }, [streaming, done, msg]);

  const stopped = msg.status === AGENT_STATUS.STOPPED;
  const failed = msg.status === AGENT_STATUS.ERROR;
  const meta = msg.meta || {};
  const trace = meta.trace && typeof meta.trace === "object" ? meta.trace : null;
  const complete = !pending && !failed && done && !stopped;
  const candidates = Array.isArray(meta.suggestions?.candidates) ? meta.suggestions.candidates : [];
  const displayText = candidates.length ? String(meta.suggestions?.note || "").trim() : visibleText;
  const edit = msg.pendingEdit;
  const hasAgentContent = pending || failed || stopped || String(displayText || "").trim() || candidates.length || trace || !!edit;

  if (!hasAgentContent) return null;

  const title = formatClock(msg.at);
  const sendFeedback = (rating) => {
    if (!msg.action) return;
    setFeedback(rating === "up" ? "up" : "down");
    apiLlmFeedback({
      rating,
      sessionId,
      action: msg.action,
    }).catch(() => {});
  };

  return (
    <div
      className={`pm-processman-msg pm-processman-msg--agent${streaming ? " pm-processman-msg--streaming" : ""}${failed ? " pm-processman-msg--error" : ""}`}
      data-testid="processman-msg-agent"
      onClick={() => {
        if (streaming && !done) skip();
      }}
      title={title || (streaming && !done ? t.skipRevealAria : undefined)}
    >
      <div className="pm-processman-msg__avatar-row" aria-hidden="true">
        <span className="pm-processman-msg__avatar" aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: processmanIconRaw }} />
      </div>
      <div className="pm-processman-msg__body">
        {pending ? (
          <div className="pm-processman-generating" data-testid="processman-answer-loading">
            <PendingStages />
            <div className="pm-processman-generating__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}

        {failed ? (
          <div className="pm-processman-msg__error" data-testid="processman-answer-error">
            <div className="pm-processman__state-title">{t.errorTitle}</div>
            <div className="pm-processman__state-text">{msg.errorText}</div>
            <button
              type="button"
              className="pm-processman-msg__secondary"
              data-testid="processman-answer-retry"
              onClick={(e) => { e.stopPropagation(); onRetry?.(msg); }}
            >
              <IconRetry />
              {t.retryLabel}
            </button>
          </div>
        ) : null}

        {!pending && !failed ? (
          <>
            <div
              className="pm-processman-msg__text"
              data-testid={isLast && done && !stopped ? "processman-answer-text" : undefined}
            >
              <MentionedText text={displayText} nodes={nodes} onNodeClick={onNodeClick} />
              {streaming && !done ? <span className="pm-processman-caret" aria-hidden="true">▍</span> : null}
            </div>
            {candidates.length ? (
              <div className="pm-processman-candidates" role="radiogroup" aria-label={t.suggestLabel}>
                {candidates.map((candidate, idx) => (
                  <button
                    key={`${candidate.code}-${idx}`}
                    type="button"
                    className={`pm-processman-candidate-card${idx === selectedCandidate ? " pm-processman-candidate-card--selected" : ""}`}
                    data-testid="processman-candidate-card"
                    role="radio"
                    aria-checked={idx === selectedCandidate}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCandidate(idx);
                    }}
                  >
                    <span className="pm-processman-candidate-card__radio" aria-hidden="true" />
                    <span className="pm-processman-candidate-card__body">
                      <span className="pm-processman-candidate-card__code">{candidate.code}</span>
                      {candidate.rationale ? <span className="pm-processman-candidate-card__rationale">{candidate.rationale}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {stopped ? <div className="pm-processman-msg__stopped">{t.stopLabel}</div> : null}

            {trace ? (
              <details className="pm-processman-sources" data-testid="processman-sources">
                <summary>{t.sourcesTitle}</summary>
                <div className="pm-processman-sources__body">
                  {trace.rule_name ? <div className="pm-processman-sources__rule">{String(trace.rule_name)}</div> : null}
                  {trace.source ? <div className="pm-processman-sources__src">{String(trace.source)}</div> : null}
                </div>
              </details>
            ) : null}
            {edit ? (
              <EditCard
                edit={edit}
                onConfirm={() => onConfirmEdit?.(msg)}
                onReject={() => onRejectEdit?.(msg)}
              />
            ) : null}
          </>
        ) : null}

        {pending || (streaming && !done) ? (
          <button
            type="button"
            className="pm-processman-stop"
            data-testid="processman-stop"
            aria-label={t.stopAria}
            onClick={(e) => {
              e.stopPropagation();
              onStop?.(msg, streaming ? visibleText : "");
            }}
          >
            <IconStop />
            {t.stopLabel}
          </button>
        ) : null}
      </div>
      {isLast && complete ? (
        <div className="pm-processman__answer-meta" data-testid="processman-answer-ok">
          {meta.confidence != null ? (
            <span className="pm-processman__metachip pm-processman__metachip--violet" data-testid="processman-answer-confidence">
              {t.confidenceLabel}: {Math.round(meta.confidence * 100)}%
            </span>
          ) : null}
          {meta.fallback ? (
            <span className="pm-processman__fallback-badge" data-testid="processman-answer-fallback">
              {t.fallbackBadge}
            </span>
          ) : null}
        </div>
      ) : null}
      {complete && msg.action ? (
        <div className="pm-processman-msg__actions" data-testid="processman-msg-actions">
          <button
            type="button"
            className={`pm-processman-msg__action${feedback === "up" ? " pm-processman-msg__action--active" : ""}`}
            data-testid="processman-feedback-up"
            onClick={(e) => { e.stopPropagation(); sendFeedback("up"); }}
            aria-label={t.feedbackUpAria}
            title={t.feedbackUpAria}
          >
            <IconThumbUp />
          </button>
          <button
            type="button"
            className={`pm-processman-msg__action${feedback === "down" ? " pm-processman-msg__action--active" : ""}`}
            data-testid="processman-feedback-down"
            onClick={(e) => { e.stopPropagation(); sendFeedback("down"); }}
            aria-label={t.feedbackDownAria}
            title={t.feedbackDownAria}
          >
            <IconThumbDown />
          </button>
          {feedback ? (
            <span className="pm-processman__feedback-thanks" data-testid="processman-feedback-thanks">{t.feedbackThanks}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ProcessmanChatFeed({
  messages = [],
  sessionId = "",
  nodes = [],
  onNodeClick,
  onStop,
  onRetry,
  onConfirmEdit,
  onRejectEdit,
}) {
  const feedRef = useRef(null);
  const lastAgentId = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "agent") return messages[i].id;
    }
    return "";
  })();

  // автопрокрутка к последнему сообщению
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.status]);

  return (
    <div className="pm-processman-feed" data-testid="processman-chat-feed" ref={feedRef} aria-live="polite">
      <div className="pm-processman-feed__ambient" aria-hidden="true" />
      {messages.map((msg) => (msg.role === "user" ? (
        <div key={msg.id} className="pm-processman-msg pm-processman-msg--user" data-testid="processman-msg-user" title={formatClock(msg.at)}>
          <span className="pm-processman-msg__user-text">{msg.text}</span>
        </div>
      ) : (
        <AgentCard
          key={msg.id}
          msg={msg}
          isLast={msg.id === lastAgentId}
          sessionId={sessionId}
          nodes={nodes}
          onNodeClick={onNodeClick}
          onStop={onStop}
          onRetry={onRetry}
          onConfirmEdit={onConfirmEdit}
          onRejectEdit={onRejectEdit}
        />
      )))}
    </div>
  );
}
