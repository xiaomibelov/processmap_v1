import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import { apiAgentResume, apiAgentStream, apiLlmExplainStep, apiLlmStepQa, apiLlmSuggestNext } from "../../../lib/api";
import {
  answerCacheKey,
  buildAnswerMeta,
  cleanAgentError,
  extractAnswerText,
  mapActionResponse,
  mapStreamEventToMessage,
  readElementId,
  readSseEvents,
  resolveLlmStatusView,
} from "./processmanView";
import {
  AGENT_STATUS,
  appendAgentPending,
  appendStreamingDelta,
  appendUserMessage,
  attachPendingEdit,
  failAgentMessage,
  finishAgentMessage,
  getChatHistory,
  hasPendingAgent,
  lastAgentMessage,
  resolveAgentMessage,
  stopAgentMessage,
  updateAgentMessage,
  updatePendingEditStatus,
} from "./chat/processmanChatStore";
import ProcessmanChatFeed from "./ProcessmanChatFeed";
import ProcessmanComposer from "./ProcessmanComposer";
import ProcessmanEmptyState from "./ProcessmanEmptyState";
import ProcessmanQuickActions from "./ProcessmanQuickActions";

// PROCESSMAN-REDESIGN (PR-1) — TO BE-контекст панели = лента диалога.
// Экономика токенов (не меняется): LLM-вызов ТОЛЬКО по клику действия/retry/Стоп;
// открытие панели, смена контекста/шага — 0 вызовов; useEffect без apiLlm/fetch.
// История — in-memory per sessionId (chat/processmanChatStore), переживает
// закрытие панели. Ответы по-прежнему кэшируются в cacheRef (S3).
const t = ru.processman;

const ACTION_RUNNERS = {
  suggest: (sid, stepId, { force, signal }) => apiLlmSuggestNext(sid, { afterStepId: stepId, force, signal }),
  explain: (sid, stepId, { force, signal }) => apiLlmExplainStep(sid, { stepId, force, signal }),
  qa: (sid, stepId, { force, question, signal }) => apiLlmStepQa(sid, { stepId, question, force, signal }),
};

const ACTION_USER_LABELS = {
  suggest: () => t.suggestLabel,
  explain: () => t.explainLabel,
};

export default function ProcessmanTobe({
  sessionId,
  selectedElement = null,
  llmStatus = null,
  cacheRef,
  onAnswerChange,
  onStatusChange,
  diagramNodes = [],
  onFocusElement,
}) {
  const [, bump] = useReducer((v) => v + 1, 0);
  const [question, setQuestion] = useState("");
  const abortRef = useRef(null);
  const resumeAbortRef = useRef(null);
  const composerRef = useRef(null);

  const sid = String(sessionId || "");
  const elementId = readElementId(selectedElement);
  const llmView = useMemo(() => resolveLlmStatusView(llmStatus), [llmStatus]);
  const notConfigured = llmView.kind === "not_configured"; // S1
  const quotaExhausted = llmView.kind === "configured" && llmView.exhausted; // S7

  const messages = getChatHistory(sid);
  const pending = hasPendingAgent(sid);
  const actionsDisabled = pending || !elementId || notConfigured || quotaExhausted;

  // статус хранит последний реальный ответ агента; UI-фидбек живет под сообщением
  useEffect(() => {
    const history = getChatHistory(sid);
    let last = null;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const m = history[i];
      if (m.role === "agent" && m.status === AGENT_STATUS.DONE && m.action) { last = m; break; }
    }
    onAnswerChange?.({
      hasAnswer: !!last,
      fromCache: last?.meta?.fromCache === true,
      action: last?.action || "",
    });
  }, [sid, messages.length, messages[messages.length - 1]?.status, onAnswerChange]);

  // шапка: текстовый статус («Готов помочь»/«Анализирую схему…»/«Формирую ответ…»)
  useEffect(() => {
    const history = getChatHistory(sid);
    const hasStreaming = history.some((m) => m.role === "agent" && m.status === AGENT_STATUS.STREAMING);
    const hasPending = history.some((m) => m.role === "agent" && m.status === AGENT_STATUS.PENDING);
    onStatusChange?.(hasStreaming ? "writing" : hasPending ? "analyzing" : "ready");
  }, [sid, messages.length, messages[messages.length - 1]?.status, onStatusChange]);

  const appendLocalNote = useCallback((title, text) => {
    const msg = appendAgentPending(sid, {});
    resolveAgentMessage(sid, msg.id, { text: `${title}\n${text}`, meta: { local: true } });
    // локальная честная заметка — сразу done (без typewriter-спама)
    msg.status = AGENT_STATUS.DONE;
    bump();
  }, [sid]);

  const run = useCallback(async (action, { force = 0, question: qRaw = "" } = {}) => {
    if (!sid) return;
    const q = String(qRaw || "").trim();
    if (action === "qa" && !q) return;
    if (action === "chat" && !q) return;

    // пользовательское сообщение в ленту
    appendUserMessage(sid, action === "qa" || action === "chat" ? q : (ACTION_USER_LABELS[action]?.() || action));
    bump();

    // qa/chat без выбранного шага — честный локальный ответ (0 LLM-вызовов, API не трогаем)
    if (!elementId) {
      appendLocalNote(t.noStepReplyTitle, t.noStepReplyText);
      return;
    }

    // AGENT-1 — свободный вопрос через SSE streaming (/agent/stream).
    if (action === "chat") {
      const pendingMsg = appendAgentPending(sid, { action: "chat", stepId: elementId, question: q });
      bump();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const stream = await apiAgentStream(sid, { message: q, selected_step_id: elementId }, { signal: controller.signal });
        if (!stream.ok) {
          failAgentMessage(sid, pendingMsg.id, { errorText: cleanAgentError(stream.error, stream.status) });
          bump();
          return;
        }
        resolveAgentMessage(sid, pendingMsg.id, { text: "" });
        bump();
        for await (const { event, data } of readSseEvents(stream.reader)) {
          const patch = mapStreamEventToMessage(event, data);
          if (patch.type === "text") {
            appendStreamingDelta(sid, pendingMsg.id, patch.delta);
            bump();
          } else if (patch.type === "action") {
            const mapped = mapActionResponse({ ok: true, result: patch.actionPayload });
            if (mapped.status === "ok") {
              const text = extractAnswerText(patch.action, mapped.data) || "";
              updateAgentMessage(sid, pendingMsg.id, {
                text,
                meta: { ...buildAnswerMeta(mapped.data, { fromCache: false }), fromCache: false },
              });
            } else {
              failAgentMessage(sid, pendingMsg.id, { errorText: mapped.errorText, errorStatus: mapped.errorStatus });
            }
            bump();
          } else if (patch.type === "confirm_required") {
            finishAgentMessage(sid, pendingMsg.id);
            attachPendingEdit(sid, pendingMsg.id, {
              pendingEditId: patch.pendingEditId,
              editPlan: patch.editPlan,
              diff: patch.diff,
              timeoutSec: patch.timeoutSec,
            });
            bump();
          } else if (patch.type === "done") {
            if (patch.usage) {
              updateAgentMessage(sid, pendingMsg.id, {
                meta: { ...(pendingMsg.meta || {}), usage: patch.usage },
              });
            }
            finishAgentMessage(sid, pendingMsg.id);
            bump();
          } else if (patch.type === "error") {
            const mapped = mapActionResponse({ ok: false, data: { status: patch.errorStatus, error: patch.errorText } });
            failAgentMessage(sid, pendingMsg.id, { errorText: mapped.errorText, errorStatus: patch.errorStatus });
            bump();
          }
        }
        // если бэк закрыл поток без done — финализируем вручную
        const current = lastAgentMessage(sid);
        if (current?.id === pendingMsg.id && current?.status === AGENT_STATUS.STREAMING) {
          finishAgentMessage(sid, pendingMsg.id);
          bump();
        }
      } catch (err) {
        if (String(err?.name || "") === "AbortError") return;
        failAgentMessage(sid, pendingMsg.id, { errorText: cleanAgentError(String(err?.message || err || t.errorTitle)) });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        bump();
      }
      return;
    }

    const cache = cacheRef?.current;
    const key = answerCacheKey(action, elementId);
    if (!force && cache?.has(key)) {
      const hit = cache.get(key);
      const msg = appendAgentPending(sid, { action, stepId: elementId, question: q });
      resolveAgentMessage(sid, msg.id, { text: hit.text, meta: { ...hit.meta, fromCache: true } });
      msg.at = hit.at;
      msg.status = AGENT_STATUS.DONE; // кэш — без reveal
      bump();
      return;
    }

    const pendingMsg = appendAgentPending(sid, { action, stepId: elementId, question: q });
    bump();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resp = await ACTION_RUNNERS[action]?.(sid, elementId, { force, question: q, signal: controller.signal });
      const current = lastAgentMessage(sid);
      if (!current || current.id !== pendingMsg.id || current.status === AGENT_STATUS.STOPPED) return;
      const mapped = mapActionResponse(resp);
      if (mapped.status === "ok") {
        const text = extractAnswerText(action, mapped.data) || t.noStepReplyText;
        const meta = {
          ...buildAnswerMeta(mapped.data, { fromCache: false }),
          trace: mapped.data?.trace && typeof mapped.data.trace === "object" ? mapped.data.trace : null,
        };
        cache?.set(key, { text, meta, at: Date.now() });
        resolveAgentMessage(sid, pendingMsg.id, { text, meta });
        // typewriter завершён (клик-скип или конец reveal) → done
        pendingMsg.onRevealDone = () => {
          finishAgentMessage(sid, pendingMsg.id);
          bump();
        };
      } else {
        failAgentMessage(sid, pendingMsg.id, {
          errorText: mapped.errorText,
          errorStatus: mapped.errorStatus,
        });
      }
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return;
      failAgentMessage(sid, pendingMsg.id, { errorText: String(err?.message || err || t.errorTitle) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      bump();
    }
  }, [sid, elementId, cacheRef, appendLocalNote]);

  const submitQuestion = useCallback(() => {
    const q = String(question || "").trim();
    if (!q || pending || notConfigured || quotaExhausted) return;
    setQuestion("");
    void run("chat", { question: q });
  }, [question, pending, notConfigured, quotaExhausted, run]);

  const handleStop = useCallback((msg, visibleText) => {
    abortRef.current?.abort();
    stopAgentMessage(sid, msg.id, { visibleText });
    bump();
  }, [sid]);

  const handleRetry = useCallback((msg) => {
    void run(msg.action, { force: 1, question: msg.question || "" });
  }, [run]);

  const handleRejectEdit = useCallback((msg) => {
    resumeAbortRef.current?.abort();
    updatePendingEditStatus(sid, msg.id, { status: AGENT_STATUS.EDIT_REJECTED });
    bump();
  }, [sid]);

  const handleConfirmEdit = useCallback(async (msg) => {
    const pe = msg?.pendingEdit;
    if (!pe || pe.status !== AGENT_STATUS.EDIT_PENDING) return;
    const controller = new AbortController();
    resumeAbortRef.current = controller;
    try {
      const stream = await apiAgentResume(
        sid,
        { pending_edit_id: pe.pendingEditId, decision: "confirm" },
        { signal: controller.signal },
      );
      if (!stream.ok) {
        updatePendingEditStatus(sid, msg.id, { status: AGENT_STATUS.ERROR, errorText: cleanAgentError(stream.error, stream.status) });
        bump();
        return;
      }
      for await (const { event, data } of readSseEvents(stream.reader)) {
        const patch = mapStreamEventToMessage(event, data);
        if (patch.type === "text") {
          appendStreamingDelta(sid, msg.id, patch.delta);
          bump();
        } else if (patch.type === "done") {
          const status = data?.status === "applied" ? AGENT_STATUS.EDIT_APPLIED : AGENT_STATUS.EDIT_REJECTED;
          updatePendingEditStatus(sid, msg.id, { status, result: data });
          bump();
        } else if (patch.type === "error") {
          const status = patch.errorStatus === "conflict_rev" ? AGENT_STATUS.EDIT_CONFLICT : AGENT_STATUS.ERROR;
          updatePendingEditStatus(sid, msg.id, { status, errorText: patch.errorText, result: data });
          bump();
        }
      }
      const current = lastAgentMessage(sid);
      if (current?.id === msg.id && current?.status === AGENT_STATUS.STREAMING) {
        finishAgentMessage(sid, msg.id);
        bump();
      }
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return;
      updatePendingEditStatus(sid, msg.id, {
        status: AGENT_STATUS.ERROR,
        errorText: cleanAgentError(String(err?.message || err || t.errorTitle)),
      });
    } finally {
      if (resumeAbortRef.current === controller) resumeAbortRef.current = null;
      bump();
    }
  }, [sid]);

  const handlePickExample = useCallback((text) => {
    setQuestion(text);
    composerRef.current?.focus?.();
  }, []);

  return (
    <div className="pm-processman-chat" data-testid="processman-tobe">
      {notConfigured ? (
        <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-tobe-no-key">
          <div className="pm-processman__state-title">{t.noKeyTitle}</div>
          <div className="pm-processman__state-text">{t.noKeyText}</div>
        </div>
      ) : null}
      {quotaExhausted ? (
        <div className="pm-processman__state pm-processman__state--warning" data-testid="processman-tobe-quota">
          <div className="pm-processman__state-title">{t.quotaExhaustedTitle}</div>
          <div className="pm-processman__state-text">{t.quotaExhaustedText}</div>
        </div>
      ) : null}

      {messages.length === 0 ? (
        <ProcessmanEmptyState onPickExample={handlePickExample} />
      ) : (
        <ProcessmanChatFeed
          messages={messages}
          sessionId={sid}
          nodes={diagramNodes}
          onNodeClick={(id) => onFocusElement?.(id)}
          onStop={handleStop}
          onRetry={handleRetry}
          onConfirmEdit={handleConfirmEdit}
          onRejectEdit={handleRejectEdit}
        />
      )}

      <ProcessmanQuickActions
        hasMessages={messages.length > 0}
        disabled={actionsDisabled}
        disabledReason={!elementId ? t.emptyTitle : undefined}
        onSuggest={() => void run("suggest")}
        onExplain={() => void run("explain")}
        onFindIssues={() => handlePickExample(t.exampleQ3)}
      />

      <ProcessmanComposer
        value={question}
        onChange={setQuestion}
        onSubmit={submitQuestion}
        hasSelection={!!elementId}
        disabled={pending || notConfigured || quotaExhausted}
        inputRef={composerRef}
      />
    </div>
  );
}
