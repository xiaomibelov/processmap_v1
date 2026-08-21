// Pure debounce factory. Unit-tested in debounceModel.test.mjs with fake
// timers (no DOM, no React).

export function createDebouncer(fn, delayMs = 300, timers = globalThis) {
  const delay = Number.isFinite(Number(delayMs)) ? Math.max(0, Number(delayMs)) : 300;
  let timer = 0;
  let pendingValue;
  let hasPending = false;
  return {
    push(value) {
      pendingValue = value;
      hasPending = true;
      if (timer) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => {
        timer = 0;
        if (!hasPending) return;
        hasPending = false;
        fn(pendingValue);
      }, delay);
    },
    cancel() {
      if (timer) timers.clearTimeout(timer);
      timer = 0;
      hasPending = false;
    },
    isPending() {
      return timer !== 0;
    },
  };
}

export const SEARCH_DEBOUNCE_MS = 300;
