// LLM3 — маппер ответов помощника на Схеме в UI-state.
// Статусы: idle / loading / ok / partial / cached / no_trace / step_not_found /
// no_provider / rate_limited / disabled / error.

export const SA_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  OK: "ok",
  PARTIAL: "partial",
  CACHED: "cached",
  NO_TRACE: "no_trace",
  STEP_NOT_FOUND: "step_not_found",
  NO_PROVIDER: "no_provider",
  RATE_LIMITED: "rate_limited",
  DISABLED: "disabled",
  ERROR: "error",
};

export const SA_ERROR_TEXTS = {
  no_provider: "LLM-провайдер не настроен — помощник недоступен.",
  rate_limited: "Превышен дневной лимит токенов помощника — попробуйте завтра.",
  disabled: "Помощник на схеме отключён администратором.",
  error: "Ошибка при обращении к LLM — попробуйте ещё раз.",
  no_trace: "По этому шагу нет AI-решения трансформации — объяснять нечего (решения не додумываются).",
  step_not_found: "Шаг не найден в текущей схеме.",
};

const KNOWN = new Set(Object.values(SA_STATUS));

/** Общая обвязка: resp из api.js → {status, data, errorText}. */
export function mapSaResponse(resp) {
  if (!resp || typeof resp !== "object" || resp.ok !== true) {
    const err = String(resp?.error || "");
    return { status: SA_STATUS.ERROR, errorText: err || SA_ERROR_TEXTS.error };
  }
  const data = resp.result || {};
  const st = String(data.status || (data.ok ? "ok" : "error"));
  if (data.ok === false) {
    const status = KNOWN.has(st) ? st : SA_STATUS.ERROR;
    return { status, errorText: String(data.error || "") || SA_ERROR_TEXTS[status] || SA_ERROR_TEXTS.error };
  }
  if (st === "partial") {
    return { status: SA_STATUS.PARTIAL, data, rawExcerpt: String(data.raw_excerpt || "") };
  }
  return { status: data.cached ? SA_STATUS.CACHED : SA_STATUS.OK, data, cached: data.cached === true };
}

export function saStatusLine(status, dropped) {
  const parts = [];
  if (status === SA_STATUS.CACHED) parts.push("Результат из кэша (контекст не менялся, 0 токенов).");
  if (status === SA_STATUS.PARTIAL) parts.push("Ответ LLM распознан частично — показано то, что удалось разобрать.");
  if (Number(dropped) > 0) parts.push(`Отброшено кандидатов вне каталога: ${dropped}.`);
  return parts.join(" ");
}
