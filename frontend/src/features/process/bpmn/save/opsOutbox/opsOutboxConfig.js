// Централизованный реестр констант SaveOutbox (contour feature/async-save-pipeline-step1).
// Стиль — autosaveConfig.js (MOVE, NOT REWRITE): единый источник таймингов
// дельта-сохранения. Контракты значений — UI.md §1/§6 и PLAN §6:
//   - flushDebounceMs: 2500 — debounce с последней op;
//   - maxOpsPerFlush: 50 — порог немедленного flush;
//   - coalesceMs: 400 — окно coalesce drag-шторма, жёсткий контракт 300–500
//     (TESTS §1.1: значения вне окна отклоняются — не «тихий» clamp);
//   - mouseupCommit — commit pending move-op на drag end, без ожидания debounce.
export const OPS_OUTBOX_CONFIG = Object.freeze({
  pipelineName: "ops",
  flushDebounceMs: 2500,
  maxOpsPerFlush: 50,
  coalesceMs: 400,
  coalesceMsMin: 300,
  coalesceMsMax: 500,
  mouseupCommit: true,
  // C3/S1: взаимное исключение ops-flush с full-save даёт per-session mutation
  // lane координатора (gatewayLane.js) — busy-poll 200 мс удалён как ad-hoc
  // механизм.
  // Retry-политика pipeline "ops" (hardening fix/post-step1-load-regression):
  // экспоненциальный backoff 1s→8s (base = retryDelayMs * 2^(n-1), cap =
  // maxRetryDelayMs) с джиттером ±retryJitterRatio против синхронизации
  // retry-шторма вкладок при деградации сети/сервера. Джиттер инжектируется
  // в координатор через retryJitterRandom (default Math.random).
  retryDelayMs: 1000,
  maxRetryDelayMs: 8000,
  retryJitterRatio: 0.3,
  // Keepalive-flush (уход со страницы) обрывается через keepaliveAbortMs:
  // зависший keepalive-запрос не должен держать браузерное соединение
  // неограниченно (connection-pool starvation класса H3).
  keepaliveAbortMs: 5000,
  // Debounce инкремента syncState.lastLocalVersion (PLAN §4): правки идут
  // пачками, durable-запись счётчика — не чаще раза в секунду.
  syncStateDebounceMs: 1000,
});

export function createOpsOutboxConfig(overrides = {}) {
  const base = OPS_OUTBOX_CONFIG;
  const coalesceMs = Number(overrides?.coalesceMs ?? base.coalesceMs);
  if (!Number.isFinite(coalesceMs) || coalesceMs < base.coalesceMsMin || coalesceMs > base.coalesceMsMax) {
    throw new RangeError(
      `opsOutboxConfig: coalesceMs must be within ${base.coalesceMsMin}..${base.coalesceMsMax} (timing contract), got ${coalesceMs}`,
    );
  }
  return Object.freeze({
    ...base,
    ...overrides,
    coalesceMs,
  });
}
