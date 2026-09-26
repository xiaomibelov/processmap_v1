// withTimeoutPromise — обёртка Promise с таймаутом (контур fix/canvas-apply-persist-softlock).
// Зависший persist/save не должен мягко блокировать очередь и статус
// «Сохранение…» навсегда: по истечении ms promise отклоняется TimeoutError.
// Underlying-операция не отменяется (нет AbortController у saveRaw-контракта) —
// она отстреливается позже в пустоту; lane/статус освобождаются по таймауту.

export class TimeoutError extends Error {
  constructor(message = "operation timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

export const DEFAULT_PERSIST_TIMEOUT_MS = 30000;

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms таймаут в миллисекундах (>=1)
 * @param {string} message текст ошибки таймаута
 * @returns {Promise<T>} значение promise либо throw TimeoutError
 */
export function withTimeoutPromise(promise, ms, message = "operation timeout") {
  const timeoutMs = Math.max(1, Number(ms) || 0);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${message} after ${timeoutMs}ms`));
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export default withTimeoutPromise;
