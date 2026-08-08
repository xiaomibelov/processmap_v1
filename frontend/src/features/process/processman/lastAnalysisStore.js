// LLM4 — in-memory стор последнего анализа LLM1 (память сессии фронта, v1).
// LlmAnalysisBlock (вкладка «Анализ процессов») пишет результат после успешного
// запуска; панель PROCESSMAN читает для сводки БЕЗ сетевых запросов
// (экономика токенов: открытие панели/смена контекста = 0 вызовов).
// Никакого backend cache-read endpoint (спека: кэш v1 = in-memory).

const store = new Map(); // sessionId → { analysis, at }

export function writeLastAnalysis(sessionId, analysis) {
  const sid = String(sessionId || "").trim();
  if (!sid || !analysis || typeof analysis !== "object") return;
  store.set(sid, { analysis, at: Date.now() });
}

export function readLastAnalysis(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  return store.get(sid) || null;
}

/** Только для тестов. */
export function clearLastAnalysisStore() {
  store.clear();
}
