// LLM4 — чистая view-логика панели PROCESSMAN (без React, тестируется node:test).
// Источник истины UX — документ владельца «PROCESSMAN-панель» (ревизия 1):
// контент следует за активной вкладкой воркбенча; состояния S1–S8; экономика
// токенов — построение контекста/статуса/кэша НЕ вызывает API и не делает
// side-effect (LLM-вызов только по клику действия или retry).

import { SA_STATUS, SA_ERROR_TEXTS } from "../../../components/process/schemaAssistantView.js";

// Контексты панели = активная поверхность воркбенча (П.4 документа владельца).
export const PROCESSMAN_CONTEXTS = ["tobe", "analysis", "neutral"];

/**
 * Активная вкладка воркбенча → контекст панели.
 * tab === "interview" («Анализ процессов») → analysis;
 * tab === "diagram" («Схема») → tobe — TO BE-контент (3 действия + последний
 *   ответ) — ОСНОВНОЙ контент схемы v1 (решение владельца 2026-08-08: в v1
 *   ProcessStage mode всегда "schema", TO BE workspace ProcessStage
 *   демонтирует — поэтому TO BE-контент показывается на вкладке «Схема»);
 * остальные вкладки (xml/doc/dod/analytics) и AS IS/Отчёты → neutral.
 */
export function resolvePanelContext({ tab = "" } = {}) {
  const t = String(tab || "").trim();
  if (t === "interview") return "analysis";
  if (t === "diagram") return "tobe";
  return "neutral";
}

/** Бейдж шапки = активная вкладка воркбенча (не контекст панели). */
export function tabBadgeKey(tab = "") {
  const t = String(tab || "").trim();
  if (t === "interview") return "contextAnalysis";
  if (t === "diagram") return "contextSchema";
  return "contextNeutral";
}

export function contextBadgeKey(context = "") {
  return {
    tobe: "contextTobe",
    analysis: "contextAnalysis",
    neutral: "contextNeutral",
  }[context] || "contextNeutral";
}

// Действия TO BE-контекста (кнопки 40px): те же API, что у SchemaAssistantBlock.
export const PROCESSMAN_ACTIONS = ["suggest", "explain", "qa"];

export function readElementId(element) {
  return String(element?.id || "").trim();
}

// ---------------------------------------------------------------- S-состояния
// S1 no-key / S2 empty / S3 cache-hit / S4 loading / S5 answer / S6 error /
// S7 quota-exhausted / S8 fallback-badge — собираются в resolveTobeView.

export const ANSWER_STATUS = {
  IDLE: "idle", // S2: ничего не запрашивалось
  LOADING: "loading", // S4 (skeleton — при slow=true, т.е. >300ms)
  OK: "ok", // S5
  ERROR: "error", // S6
};

/** Ключ in-memory кэша v1: действие + шаг. */
export function answerCacheKey(action = "", stepId = "") {
  return `${String(action || "")}:${String(stepId || "")}`;
}

/** Текст ответа из result конкретного действия (suggest/explain/qa и processman-аналоги). */
export function extractAnswerText(action = "", data = {}) {
  const d = data && typeof data === "object" ? data : {};
  // PROCESSMAN action-имена используют kebab-case (suggest-next и т.д.), но payload
  // идентичен старым suggest/explain/qa — reuse той же логики.
  if (action === "suggest" || action === "suggest-next") {
    const candidates = d?.suggestions?.candidates;
    const list = Array.isArray(candidates) ? candidates : [];
    const lines = list.map((c) => `• ${String(c?.code || "")} — ${String(c?.rationale || "")}`.trim());
    const note = String(d?.suggestions?.note || "").trim();
    return [lines.join("\n"), note].filter(Boolean).join("\n\n");
  }
  if (action === "explain" || action === "explain-step") {
    const explanation = String(d?.explanation || "").trim();
    const note = String(d?.note || "").trim();
    return [explanation, note].filter(Boolean).join("\n\n");
  }
  if (action === "qa" || action === "step-qa") {
    const answer = String(d?.answer || "").trim();
    const note = String(d?.note || "").trim();
    return [answer, note].filter(Boolean).join("\n\n");
  }
  return "";
}

/** Открытые вопросы из ответа (confidence < 0.6 — компонент LLM2, спека S5). */
export function extractOpenQuestions(data = {}) {
  const list = data?.open_questions;
  return Array.isArray(list) ? list : [];
}

/**
 * Ответ api-действия ({ok, result}|{ok:false,...}) → state зоны ответа.
 * Статусы ошибок маппятся через SA_STATUS/SA_ERROR_TEXTS (S6, человекочитаемо).
 */
export function mapActionResponse(resp) {
  if (!resp || typeof resp !== "object" || resp.ok !== true) {
    // okOrError (apiCore) конвертирует domain-ошибку {ok:false, status, error}
    // в HTTP-уровень (resp.ok=false), сохраняя исходный payload в data —
    // восстанавливаем честный статус (no_provider/rate_limited/disabled) оттуда.
    const data = resp?.data && typeof resp.data === "object" ? resp.data : null;
    const st = String(data?.status || "");
    const known = Object.values(SA_STATUS).includes(st) ? st : SA_STATUS.ERROR;
    const err = String(resp?.error || "");
    return {
      status: ANSWER_STATUS.ERROR,
      errorStatus: known,
      errorText: SA_ERROR_TEXTS[known] || err || SA_ERROR_TEXTS.error,
    };
  }
  const data = resp.result || {};
  if (data.ok === false) {
    const st = String(data.status || "error");
    const known = Object.values(SA_STATUS).includes(st) ? st : SA_STATUS.ERROR;
    return {
      status: ANSWER_STATUS.ERROR,
      errorStatus: known,
      // S6 — человекочитаемо: локализованный текст статуса приоритетнее сырого
      // backend error (англ.); сырой — только fallback для неизвестных статусов.
      errorText: SA_ERROR_TEXTS[known] || String(data.error || "") || SA_ERROR_TEXTS.error,
    };
  }
  return { status: ANSWER_STATUS.OK, data };
}

/** Метаданные ответа для S5/S8/бейджа кэша (без секретов — только флаги/числа). */
export function buildAnswerMeta(data = {}, { fromCache = false } = {}) {
  const usage = data?.usage && typeof data.usage === "object" ? data.usage : {};
  const confidence = Number(data?.confidence);
  const candidatesRaw = data?.suggestions?.candidates;
  const candidates = Array.isArray(candidatesRaw)
    ? candidatesRaw.map((c) => ({
      code: String(c?.code || "").trim(),
      rationale: String(c?.rationale || "").trim(),
    })).filter((c) => c.code || c.rationale)
    : [];
  const suggestions = candidates.length
    ? { candidates, note: String(data?.suggestions?.note || "").trim() }
    : null;
  return {
    fallback: data?.fallback === true, // S8
    cachedBackend: data?.cached === true, // redis-кэш gateway (НЕ бейдж «из кэша»)
    fromCache: fromCache === true, // in-memory попадание v1 (бейдж «из кэша · 0 токенов»)
    confidence: Number.isFinite(confidence) && confidence > 0 ? confidence : null,
    openQuestions: extractOpenQuestions(data),
    suggestions,
    promptTokens: Number(usage.prompt_tokens || 0),
    completionTokens: Number(usage.completion_tokens || 0),
  };
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

// Статус LLM для панели (S1/S7). llmStatus — результат apiLlmStatus():
// { ok, status, result? } | null (ещё грузится).
export function resolveLlmStatusView(llmStatus = null) {
  if (llmStatus === null) return { kind: "idle" };
  if (llmStatus?.ok !== true) return { kind: "unknown" };
  const result = llmStatus?.result && typeof llmStatus.result === "object" ? llmStatus.result : {};
  if (result.configured !== true) return { kind: "not_configured" };
  const quota = result.quota && typeof result.quota === "object" ? result.quota : {};
  const used = toInt(quota.used);
  const limit = toInt(quota.limit);
  const model = result.model && typeof result.model === "object" ? result.model : {};
  return {
    kind: "configured",
    used,
    limit,
    exhausted: limit > 0 && used >= limit,
    // Активная модель из реестра (feat/llm-model-config): apiLlmStatus.model.
    modelName: typeof model.name === "string" ? model.name : "",
    modelDisplayName: typeof model.display_name === "string" ? model.display_name : "",
    modelSource: typeof model.source === "string" ? model.source : "",
  };
}

/** Очистить ошибку API от HTML-тела nginx (502 Bad Gateway и т.п.) для S6. */
export function cleanAgentError(raw, status = 0) {
  const text = String(raw || "").trim();
  if (!text) return status ? `HTTP ${status}` : SA_ERROR_TEXTS.error;
  const lower = text.toLowerCase();
  if (text.startsWith("<") || lower.startsWith("<!doctype")) {
    return status ? `HTTP ${status} Bad Gateway` : "Bad Gateway";
  }
  return text;
}

/** has_api_key=false для кнопки: known ответ и configured === false (S1). */
export function isLlmNotConfigured(llmStatus = null) {
  return resolveLlmStatusView(llmStatus).kind === "not_configured";
}

/** Локализация времени последнего ответа (S5). */
export function formatClock(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ---------------------------------------------------------------- AGENT-1 SSE
// Парсер Server-Sent Events из fetch() ReadableStream.
// Контракт бэкенда: event: start|token|action|done|error; data: JSON.

export const SSE_EVENT = Object.freeze({
  START: "start",
  TOKEN: "token",
  ACTION: "action",
  CONFIRM_REQUIRED: "confirm_required",
  DONE: "done",
  ERROR: "error",
});

function safeJson(text) {
  try {
    return JSON.parse(String(text || "{}"));
  } catch {
    return {};
  }
}

/** Разобрать накопленный буфер на SSE-сообщения. */
export function parseSseBuffer(buffer) {
  const text = String(buffer || "");
  const blocks = text.split("\n\n");
  const events = [];
  // Последний кусок может быть незавершённым — оставляем в leftover.
  for (let i = 0; i < blocks.length - 1; i += 1) {
    const block = blocks[i].trim();
    if (!block) continue;
    const lines = block.split("\n");
    let event = "";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        event = line.slice("event: ".length).trim();
      } else if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice("data: ".length);
      } else if (line.startsWith("data:")) {
        data = line.slice("data:".length).trimStart();
      }
    }
    if (event) events.push({ event, data: safeJson(data) });
  }
  return { events, leftover: blocks[blocks.length - 1] };
}

/** Асинхронный генератор событий из fetch reader. */
export async function* readSseEvents(reader) {
  if (!reader) return;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, leftover } = parseSseBuffer(buffer);
      for (const ev of events) yield ev;
      buffer = leftover;
    }
  } finally {
    const final = buffer.trim();
    if (final) {
      const { events } = parseSseBuffer(final + "\n\n");
      for (const ev of events) yield ev;
    }
  }
}

/** Преобразовать SSE-событие в patch для сообщения панели. */
export function mapStreamEventToMessage(event, data) {
  if (event === SSE_EVENT.TOKEN) {
    return { type: "text", delta: String(data?.delta || "") };
  }
  if (event === SSE_EVENT.ACTION) {
    const payload = data?.payload && typeof data.payload === "object" ? data.payload : {};
    return { type: "action", action: String(data?.action || ""), actionPayload: payload };
  }
  if (event === SSE_EVENT.CONFIRM_REQUIRED) {
    return {
      type: "confirm_required",
      pendingEditId: String(data?.pending_edit_id || ""),
      editPlan: data?.edit_plan && typeof data.edit_plan === "object" ? data.edit_plan : {},
      diff: Array.isArray(data?.diff) ? data.diff : [],
      timeoutSec: Number(data?.timeout_sec || 0),
    };
  }
  if (event === SSE_EVENT.DONE) {
    const usage = data?.usage && typeof data.usage === "object" ? data.usage : {};
    return { type: "done", usage };
  }
  if (event === SSE_EVENT.ERROR) {
    return { type: "error", errorStatus: String(data?.status || "error"), errorText: String(data?.error || "") };
  }
  return { type: "noop" };
}
