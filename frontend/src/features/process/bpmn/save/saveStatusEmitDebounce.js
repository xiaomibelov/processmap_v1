// Debounce эмитов save-статуса (контур canvas-save-hot-path-v1, коммит 4).
// RC4-п.5 аудита: setSaveUploadLifecycleEvent не чаще раза в 500мс; цепочка
// started→persisted коллапсируется в один setState-апдейт (keep-latest).
// События отката (conflict/failed) эмитятся немедленно — optimistic-статус
// откатывается честно и без задержки. Retry/backoff и прочая логика
// save-lifecycle не затронуты; модуль только регулирует частоту onEmit.

export const SAVE_STATUS_EMIT_DEBOUNCE_MS = 300;
export const SAVE_STATUS_EMIT_MIN_INTERVAL_MS = 500;

const IMMEDIATE_STAGES = new Set(["conflict", "failed"]);

export function createSaveStatusEmitDebouncer(options = {}) {
  const onEmit = typeof options?.onEmit === "function" ? options.onEmit : null;
  const debounceMs = Math.max(
    0,
    Number(options?.debounceMs ?? SAVE_STATUS_EMIT_DEBOUNCE_MS) || 0,
  );
  const minIntervalMs = Math.max(
    0,
    Number(options?.minIntervalMs ?? SAVE_STATUS_EMIT_MIN_INTERVAL_MS) || 0,
  );
  const now = typeof options?.now === "function" ? options.now : () => Date.now();
  const immediateStages = options?.immediateStages instanceof Set
    ? options.immediateStages
    : IMMEDIATE_STAGES;

  let pendingEvent = null;
  let timer = 0;
  let lastEmitAt = 0;

  function clearTimer() {
    if (!timer) return;
    globalThis.clearTimeout(timer);
    timer = 0;
  }

  function emit(event) {
    lastEmitAt = now();
    onEmit?.(event);
  }

  function firePending() {
    timer = 0;
    const event = pendingEvent;
    pendingEvent = null;
    if (!event) return;
    const sinceLast = lastEmitAt ? now() - lastEmitAt : Number.POSITIVE_INFINITY;
    if (sinceLast < minIntervalMs) {
      // Не чаще одного эмита в minIntervalMs: недостающее время ждём таймером.
      pendingEvent = event;
      timer = globalThis.setTimeout(firePending, minIntervalMs - sinceLast);
      return;
    }
    emit(event);
  }

  function schedule(event) {
    const stage = String(event?.stage || "").toLowerCase();
    if (immediateStages.has(stage)) {
      // Честный откат статуса: conflict/failed доходят до UI синхронно.
      clearTimer();
      pendingEvent = null;
      emit(event);
      return;
    }
    pendingEvent = event;
    clearTimer();
    timer = globalThis.setTimeout(firePending, debounceMs);
  }

  function flush() {
    if (!pendingEvent) return;
    clearTimer();
    const event = pendingEvent;
    pendingEvent = null;
    emit(event);
  }

  function dispose() {
    clearTimer();
    pendingEvent = null;
  }

  return {
    schedule,
    flush,
    dispose,
    hasPending: () => pendingEvent !== null,
  };
}
