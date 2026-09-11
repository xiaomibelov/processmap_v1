export const NOTICE_POLL_INTERVAL_MS = 300_000;
export const NOTICE_POLL_MAX_BACKOFF_MS = 1_800_000;

/**
 * Чистая логика расписания поллинга deployment-уведомлений.
 *
 * - nextDelayMs() — задержка до следующей попытки: базовый интервал без
 *   ошибок; после k-й подряд ошибки пропускаем 2^(k-1) тиков
 *   (1, 2, 4, ...), итоговая задержка ограничена maxBackoffMs.
 * - noteSuccess() — сбрасывает счётчик ошибок.
 * - shouldSkipHiddenTick(isHidden) — тик при скрытом документе не должен
 *   порождать запрос.
 */
export function createNoticePollingSchedule({
  intervalMs = NOTICE_POLL_INTERVAL_MS,
  maxBackoffMs = NOTICE_POLL_MAX_BACKOFF_MS,
} = {}) {
  let consecutiveFailures = 0;

  return {
    noteSuccess() {
      consecutiveFailures = 0;
    },
    noteFailure() {
      consecutiveFailures += 1;
    },
    nextDelayMs() {
      if (consecutiveFailures === 0) return intervalMs;
      const maxMultiplier = Math.max(1, Math.floor(maxBackoffMs / intervalMs));
      const multiplier = Math.min(2 ** (consecutiveFailures - 1), maxMultiplier);
      return Math.min(multiplier * intervalMs, maxBackoffMs);
    },
    shouldSkipHiddenTick(isHidden) {
      return isHidden === true;
    },
  };
}
