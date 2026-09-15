// Повторные попытки bootstrap-аутентификации при кратковременных сбоях.
// Одиночный 5xx (embedder-OOM, рестарт api, деградация gateway) не должен
// выбрасывать живого пользователя на /?next= — редирект только после
// подтверждённого не-transient отказа. fix/stage-slow-load-auth-outage.

export const AUTH_BOOT_MAX_ATTEMPTS = 3;
export const AUTH_BOOT_RETRY_DELAY_MS = 500;

const TRANSIENT_STATUSES = new Set([0, 500, 502, 503, 504]);

/**
 * Кратковременный ли это сбой авторизации.
 * status=0 — сетевой сбой/таймаут (fetch не получил HTTP-ответ).
 * ok=true никогда не transient.
 */
export function isTransientAuthFailure(result) {
  if (result && result.ok === true) return false;
  const status = Number(result?.status || 0);
  return TRANSIENT_STATUSES.has(status);
}

export function authBootDelay(ms = AUTH_BOOT_RETRY_DELAY_MS) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Вызвать fn до первого ok либо не-transient отказа; transient-сбои
 * повторяются не более maxAttempts раз с задержкой delayMs между попытками.
 * Возвращает последний результат fn (ок или финальный отказ).
 */
export async function withTransientRetry(fn, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || AUTH_BOOT_MAX_ATTEMPTS));
  const delayMs = Number(options.delayMs || AUTH_BOOT_RETRY_DELAY_MS);
  const sleep = options.sleep || authBootDelay;
  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await fn(attempt);
    if (lastResult?.ok) return lastResult;
    if (attempt >= maxAttempts || !isTransientAuthFailure(lastResult)) return lastResult;
    await sleep(delayMs);
  }
  return lastResult;
}
