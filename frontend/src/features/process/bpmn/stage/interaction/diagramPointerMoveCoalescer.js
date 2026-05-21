/**
 * DiagramPointerMoveCoalescer
 *
 * RAF-coalesced UI updates during high-frequency pointer events.
 * Avoids React setState per pointermove by batching work to a single
 * requestAnimationFrame callback.
 */

const rafTokens = new WeakMap();

export function scheduleRafForInstance(inst, fn) {
  if (!inst) return;
  const prev = rafTokens.get(inst);
  if (prev) {
    try {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(prev);
    } catch {
      // no-op
    }
  }
  const token =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => {
          rafTokens.delete(inst);
          fn();
        })
      : setTimeout(() => {
          rafTokens.delete(inst);
          fn();
        }, 0);
  rafTokens.set(inst, token);
}

export function cancelRafForInstance(inst) {
  if (!inst) return;
  const prev = rafTokens.get(inst);
  if (prev) {
    try {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(prev);
      else clearTimeout(prev);
    } catch {
      // no-op
    }
    rafTokens.delete(inst);
  }
}
