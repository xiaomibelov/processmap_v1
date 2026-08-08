// LLM4 — чистая view-логика панели PROCESSMAN (без React, тестируется node:test).
// Источник истины UX — документ владельца «PROCESSMAN-панель» (ревизия 1):
// контент следует за активной вкладкой воркбенча; состояния S1–S8; экономика
// токенов — построение контекста/статуса/кэша НЕ вызывает API и не делает
// side-effect (LLM-вызов только по клику действия/↻).

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

/** Текст ответа из result конкретного действия (suggest/explain/qa). */
export function extractAnswerText(action = "", data = {}) {
  const d = data && typeof data === "object" ? data : {};
  if (action === "suggest") {
    const candidates = d?.suggestions?.candidates;
    const list = Array.isArray(candidates) ? candidates : [];
    const lines = list.map((c) => `• ${String(c?.code || "")} — ${String(c?.rationale || "")}`.trim());
    const note = String(d?.suggestions?.note || "").trim();
    return [lines.join("\n"), note].filter(Boolean).join("\n\n");
  }
  if (action === "explain") {
    const explanation = String(d?.explanation || "").trim();
    const note = String(d?.note || "").trim();
    return [explanation, note].filter(Boolean).join("\n\n");
  }
  if (action === "qa") {
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
  return {
    fallback: data?.fallback === true, // S8
    cachedBackend: data?.cached === true, // redis-кэш gateway (НЕ бейдж «из кэша»)
    fromCache: fromCache === true, // in-memory попадание v1 (бейдж «из кэша · 0 токенов»)
    confidence: Number.isFinite(confidence) && confidence > 0 ? confidence : null,
    openQuestions: extractOpenQuestions(data),
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
  return {
    kind: "configured",
    used,
    limit,
    exhausted: limit > 0 && used >= limit,
  };
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
