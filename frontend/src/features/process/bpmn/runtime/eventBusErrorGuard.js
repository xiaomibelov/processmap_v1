// Контур fix/canvas-nan-di-stuck-drag, P0-1 (root cause RC2 аудита
// canvas-drag-stuck-after-1008): исключение non-finite класса в
// render-listener'е (NaN/Infinity в DI-координатах → setTranslate и т.п.)
// re-throw'ится diagram-js EventBus'ом и убивает Dragging.end до cleanup()
// → .djs-dragging висит, drag «залипает» (только Esc). Guard подавляет
// ТОЛЬКО non-finite класс (return false = handled для handleError),
// записывая событие в saveDiagnosticsTrail; все прочие ошибки проходят
// с сохранением исходного rethrow — глушить всё подряд запрещено.

const NON_FINITE_RE = /non-?finite|NaN|Infinity|Expected number|Expected length/i;

export function shouldSuppressEventBusError(error) {
  if (!error || typeof error !== "object") return false;
  const message = String(error.message || error);
  return NON_FINITE_RE.test(message);
}

export function installEventBusErrorGuard(eventBus, { record } = {}) {
  if (!eventBus || typeof eventBus.on !== "function") return () => {};
  const onError = (event) => {
    const error = event?.error || event;
    if (!shouldSuppressEventBusError(error)) {
      // undefined → handleError получает !== false → исходный rethrow.
      return undefined;
    }
    try {
      record?.("canvas_nonfinite_render_error", {
        msg: String(error?.message || error),
      });
    } catch {
      // диагностика не должна ломать guard
    }
    return false; // handled: diagram-js handleError не делает rethrow
  };
  eventBus.on("error", 10000, onError);
  return () => {
    try {
      eventBus.off?.("error", onError);
    } catch {
      // no-op
    }
  };
}
