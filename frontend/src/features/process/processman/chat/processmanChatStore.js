// PROCESSMAN-REDESIGN — состояние диалога панели (чистая логика, без React).
// История хранится in-memory per sessionId (module-level Map): переживает
// закрытие/открытие панели, умирает с перезагрузкой страницы — как
// существующий processmanCacheRef ответов (решение из плана: персистентность
// в БД — отдельный контур).

export const CHAT_ROLE = Object.freeze({ USER: "user", AGENT: "agent" });

export const AGENT_STATUS = Object.freeze({
  PENDING: "pending",   // запрос в полёте (индикатор этапов)
  STREAMING: "streaming", // typewriter-reveal полного текста
  DONE: "done",
  STOPPED: "stopped",   // пользователь оборвал (Стоп)
  ERROR: "error",
  // AGENT-3 — HITL карточка подтверждения правки на канвасе.
  EDIT_PENDING: "edit_pending",
  EDIT_APPLIED: "edit_applied",
  EDIT_REJECTED: "edit_rejected",
  EDIT_EXPIRED: "edit_expired",
  EDIT_CONFLICT: "edit_conflict",
});

// Этапы pending-индикатора — ЧЕСТНЫЙ lifecycle запроса (без выдуманных
// «Ищу в базе знаний»: бэк не шлёт стадии): отправка → ожидание ответа.
export const PENDING_STAGES = Object.freeze(["stageSending", "stageAnalyzing"]);

const histories = new Map(); // sessionId -> messages[]

let seq = 0;
function nextId(prefix = "m") {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** История сессии (живой массив; мутируется только через helper'ы ниже). */
export function getChatHistory(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return [];
  if (!histories.has(sid)) histories.set(sid, []);
  return histories.get(sid);
}

export function appendUserMessage(sessionId, text) {
  const history = getChatHistory(sessionId);
  const msg = {
    id: nextId("u"),
    role: CHAT_ROLE.USER,
    text: String(text || ""),
    at: Date.now(),
  };
  history.push(msg);
  return msg;
}

export function appendAgentPending(sessionId, { action = "", stepId = "", question = "" } = {}) {
  const history = getChatHistory(sessionId);
  const msg = {
    id: nextId("a"),
    role: CHAT_ROLE.AGENT,
    status: AGENT_STATUS.PENDING,
    action,
    stepId,
    question,
    text: "",
    meta: null,
    errorText: "",
    errorStatus: "",
    at: Date.now(),
  };
  history.push(msg);
  return msg;
}

export function resolveAgentMessage(sessionId, messageId, { text = "", meta = null } = {}) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT) return null;
  if (msg.status === AGENT_STATUS.STOPPED || msg.status === AGENT_STATUS.ERROR) return msg;
  msg.status = AGENT_STATUS.STREAMING;
  msg.text = String(text || "");
  msg.meta = meta || null;
  return msg;
}

export function failAgentMessage(sessionId, messageId, { errorText = "", errorStatus = "" } = {}) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT) return null;
  msg.status = AGENT_STATUS.ERROR;
  msg.errorText = String(errorText || "");
  msg.errorStatus = String(errorStatus || "");
  return msg;
}

/** «Стоп» во время pending/streaming: запрос игнорируется, текст зафrozen. */
export function stopAgentMessage(sessionId, messageId, { visibleText = "" } = {}) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT) return null;
  if (msg.status !== AGENT_STATUS.PENDING && msg.status !== AGENT_STATUS.STREAMING) return msg;
  msg.status = AGENT_STATUS.STOPPED;
  if (visibleText) msg.text = String(visibleText);
  return msg;
}

/** Завершение typewriter: streaming → done. */
export function finishAgentMessage(sessionId, messageId) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT) return null;
  if (msg.status === AGENT_STATUS.STREAMING) msg.status = AGENT_STATUS.DONE;
  return msg;
}

/** Добавить delta к тексту streaming-сообщения (token event). */
export function appendStreamingDelta(sessionId, messageId, delta) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT) return null;
  if (msg.status === AGENT_STATUS.STOPPED || msg.status === AGENT_STATUS.ERROR) return msg;
  if (msg.status === AGENT_STATUS.PENDING) msg.status = AGENT_STATUS.STREAMING;
  msg.text = String(msg.text || "") + String(delta || "");
  return msg;
}

/** Обновить текст/meta/статус агент-сообщения (action/done event). */
export function updateAgentMessage(sessionId, messageId, { text, meta, status } = {}) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT) return null;
  if (text !== undefined) msg.text = String(text || "");
  if (meta !== undefined) msg.meta = meta || null;
  if (status !== undefined && Object.values(AGENT_STATUS).includes(status)) msg.status = status;
  return msg;
}

/** Прикрепить к агент-сообщению карточку HITL-подтверждения правки. */
export function attachPendingEdit(sessionId, messageId, payload = {}) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT) return null;
  msg.pendingEdit = {
    pendingEditId: String(payload.pendingEditId || ""),
    editPlan: payload.editPlan && typeof payload.editPlan === "object" ? payload.editPlan : {},
    diff: Array.isArray(payload.diff) ? payload.diff : [],
    timeoutSec: Number(payload.timeoutSec || 0),
    attachedAt: Number(payload.attachedAt || Date.now()),
    status: AGENT_STATUS.EDIT_PENDING,
    result: null,
    errorText: "",
  };
  msg.status = AGENT_STATUS.EDIT_PENDING;
  return msg;
}

/** Обновить статус карточки HITL (applied/rejected/expired/conflict). */
export function updatePendingEditStatus(sessionId, messageId, { status, result = null, errorText = "" } = {}) {
  const msg = getChatHistory(sessionId).find((m) => m.id === messageId);
  if (!msg || msg.role !== CHAT_ROLE.AGENT || !msg.pendingEdit) return null;
  if (!Object.values(AGENT_STATUS).includes(status)) return null;
  msg.pendingEdit.status = status;
  msg.pendingEdit.result = result || null;
  msg.pendingEdit.errorText = String(errorText || "");
  msg.status = status;
  return msg;
}

export function lastAgentMessage(sessionId) {
  const history = getChatHistory(sessionId);
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === CHAT_ROLE.AGENT) return history[i];
  }
  return null;
}

export function hasPendingAgent(sessionId) {
  return getChatHistory(sessionId).some(
    (m) => m.role === CHAT_ROLE.AGENT && (m.status === AGENT_STATUS.PENDING || m.status === AGENT_STATUS.STREAMING),
  );
}

/** Тестовый/жизненный сброс историй (node:test beforeEach). */
export function resetChatHistories(sessionId = "") {
  const sid = String(sessionId || "").trim();
  if (sid) histories.delete(sid);
  else histories.clear();
}

// ---------------------------------------------------------------- typewriter
// Быстрый reveal: не посимвольный, а порциями (feedback из review плана).
export const TYPEWRITER_CHARS_PER_TICK = 22;
export const TYPEWRITER_TICK_MS = 32;

/** Сколько символов показано после ticks тиков (монотонно, кап = длина). */
export function typewriterProgress(fullText, ticks) {
  const total = String(fullText || "").length;
  const n = Math.max(0, Math.round(Number(ticks) || 0));
  return Math.min(total, n * TYPEWRITER_CHARS_PER_TICK);
}

export function typewriterDone(fullText, ticks) {
  return typewriterProgress(fullText, ticks) >= String(fullText || "").length;
}
