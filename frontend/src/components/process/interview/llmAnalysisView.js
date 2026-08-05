// LLM1 — чистая view-логика блока «Анализ LLM» (без React, тестируется node:test).
// Маппинг ответа POST /api/sessions/{id}/llm/analysis → состояние UI.

export const LLM_ANALYSIS_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  OK: "ok",
  PARTIAL: "partial",
  CACHED: "cached",
  NO_PROVIDER: "no_provider",
  RATE_LIMITED: "rate_limited",
  DISABLED: "disabled",
  ERROR: "error",
});

const ERROR_TEXTS = {
  no_provider: "LLM-провайдер не настроен. Обратитесь к администратору.",
  rate_limited: "Дневной лимит токенов исчерпан. Попробуйте завтра.",
  disabled: "Функция анализа LLM отключена администратором.",
  error: "Не удалось выполнить анализ LLM.",
};

/**
 * Ответ apiLlmAnalysis ({ok, result} | {ok:false, status, error}) →
 * { status, analysis, dropped, cached, errorText, rawExcerpt }.
 */
export function mapLlmAnalysisResponse(resp) {
  if (!resp || typeof resp !== "object") {
    return { status: LLM_ANALYSIS_STATUS.ERROR, errorText: ERROR_TEXTS.error };
  }
  if (!resp.ok) {
    const err = String(resp.error || "");
    return { status: LLM_ANALYSIS_STATUS.ERROR, errorText: err || ERROR_TEXTS.error };
  }
  const data = resp.result || {};
  if (data.ok === false) {
    const st = String(data.status || "error");
    const status = Object.values(LLM_ANALYSIS_STATUS).includes(st) ? st : LLM_ANALYSIS_STATUS.ERROR;
    return { status, errorText: String(data.error || "") || ERROR_TEXTS[status] || ERROR_TEXTS.error };
  }
  const analysis = data.analysis && typeof data.analysis === "object" ? data.analysis : {};
  const base = {
    analysis: {
      bottlenecks: Array.isArray(analysis.bottlenecks) ? analysis.bottlenecks : [],
      robotization_candidates: Array.isArray(analysis.robotization_candidates) ? analysis.robotization_candidates : [],
      risks: Array.isArray(analysis.risks) ? analysis.risks : [],
      open_questions: Array.isArray(analysis.open_questions) ? analysis.open_questions : [],
    },
    dropped: Number(data.dropped || 0),
    rawExcerpt: String(data.raw_excerpt || ""),
  };
  if (data.status === "partial") {
    return { status: LLM_ANALYSIS_STATUS.PARTIAL, ...base };
  }
  return {
    status: data.cached ? LLM_ANALYSIS_STATUS.CACHED : LLM_ANALYSIS_STATUS.OK,
    cached: data.cached === true,
    ...base,
  };
}

/** Расшифровка кода операции из каталога: {code → name_ru}. */
export function buildOperationLabels(catalogItems) {
  const out = {};
  for (const item of Array.isArray(catalogItems) ? catalogItems : []) {
    const code = String(item?.code || "").trim();
    if (code) out[code] = String(item?.name_ru || item?.name || code);
  }
  return out;
}

/** Подпись шага: name_ru по step_id из шагов сессии (fallback — сам id). */
export function buildStepLabels(steps) {
  const out = {};
  for (const s of Array.isArray(steps) ? steps : []) {
    const id = String(s?.id || "").trim();
    if (id) out[id] = String(s?.name_ru || s?.title || id);
  }
  return out;
}

export function errorTextForStatus(status) {
  return ERROR_TEXTS[status] || ERROR_TEXTS.error;
}
