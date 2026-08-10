import { useEffect, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
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

// PROCESSMAN-REDESIGN (PR-1) — лента диалога.
// user-сообщения — вправо, компактно; agent — карточки на всю ширину с
// аватаром ✦, быстрым скипаемым typewriter (клик по карточке → весь текст),
// «Стоп» во время pending/streaming, индикатор этапов (честный lifecycle),
// раскрываемые «Источники» (trace), имена узлов — кликабельные чипы 📍.
const t = ru.processman;

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
          📍 {seg.name}
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

function AgentCard({
  msg,
  isLast,
  nodes,
  onNodeClick,
  onStop,
  onRetry,
  onRefresh,
}) {
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

  return (
    <div
      className={`pm-processman-msg pm-processman-msg--agent${streaming ? " pm-processman-msg--streaming" : ""}`}
      data-testid="processman-msg-agent"
      onClick={() => {
        if (streaming && !done) skip();
      }}
      title={streaming && !done ? t.skipRevealAria : undefined}
    >
      {/* карточка агента (прототип v3): header / body / meta */}
      <div className="pm-processman-msg__header">
        <span className="pm-processman-msg__avatar" aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: processmanIconRaw }} />
        <span className="pm-processman-msg__agent-name">{t.buttonLabel}</span>
        {complete ? (
          <span
            className="pm-processman-msg__time"
            data-testid={isLast ? "processman-answer-time" : undefined}
          >
            {formatClock(msg.at)}
          </span>
        ) : null}
      </div>
      <div className="pm-processman-msg__body">
        {pending ? (
          <div data-testid="processman-answer-loading">
            <PendingStages />
            <div className="pm-processman__skeleton-line" style={{ width: "72%" }} />
            <div className="pm-processman__skeleton-line" style={{ width: "94%" }} />
            <div className="pm-processman__skeleton-line" style={{ width: "58%" }} />
          </div>
        ) : null}

        {failed ? (
          <div className="pm-processman__state pm-processman__state--error" data-testid="processman-answer-error">
            <div className="pm-processman__state-title">{t.errorTitle}</div>
            <div className="pm-processman__state-text" style={{ marginBottom: 8 }}>{msg.errorText}</div>
            <button
              type="button"
              className="pm-processman__action"
              data-testid="processman-answer-retry"
              onClick={(e) => { e.stopPropagation(); onRetry?.(msg); }}
            >
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
              <MentionedText text={visibleText} nodes={nodes} onNodeClick={onNodeClick} />
              {streaming && !done ? <span className="pm-processman-caret" aria-hidden="true">▍</span> : null}
            </div>
            {stopped ? <div className="pm-processman-msg__stopped">{t.stopLabel} ■</div> : null}

            {trace ? (
              <details className="pm-processman-sources" data-testid="processman-sources">
                <summary>{t.sourcesTitle}</summary>
                <div className="pm-processman-sources__body">
                  {trace.rule_name ? <div className="pm-processman-sources__rule">{String(trace.rule_name)}</div> : null}
                  {trace.source ? <div className="pm-processman-sources__src">{String(trace.source)}</div> : null}
                </div>
              </details>
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
            ■ {t.stopLabel}
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
          <button
            type="button"
            className="pm-processman__ghostbtn"
            data-testid="processman-answer-refresh"
            aria-label={t.refreshAria}
            onClick={(e) => { e.stopPropagation(); onRefresh?.(msg); }}
          >
            ↻ {t.refreshLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function ProcessmanChatFeed({
  messages = [],
  nodes = [],
  onNodeClick,
  onStop,
  onRetry,
  onRefresh,
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
      {messages.map((msg) => (msg.role === "user" ? (
        <div key={msg.id} className="pm-processman-msg pm-processman-msg--user" data-testid="processman-msg-user">
          <span className="pm-processman-msg__user-label">{t.youLabel}</span>
          <span className="pm-processman-msg__user-text">{msg.text}</span>
        </div>
      ) : (
        <AgentCard
          key={msg.id}
          msg={msg}
          isLast={msg.id === lastAgentId}
          nodes={nodes}
          onNodeClick={onNodeClick}
          onStop={onStop}
          onRetry={onRetry}
          onRefresh={onRefresh}
        />
      )))}
    </div>
  );
}
