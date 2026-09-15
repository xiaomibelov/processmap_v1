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
  // Очереди saveCoordinator per-pipeline (queueKey = pipeline::session), поэтому
  // mutual exclusion с full-save обеспечиваем явным poll'ом busy-статуса
  // pipelines xml/rawXml перед ops-flush.
  fullSaveBusyPollMs: 200,
  // Лимит keepalive-тела (~64 kB по спецификации fetch keepalive); батч ops
  // ≤ ~10 kB, запас на порядок.
  keepaliveBodyLimitBytes: 64 * 1024,
  // Таймаут drain очереди при выгрузке страницы (см. installOpsOutboxPageFlush).
  pageHideDrainTimeoutMs: 1500,
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
