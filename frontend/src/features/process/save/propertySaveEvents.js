/**
 * Lightweight pub/sub channel for property-save lifecycle events.
 *
 * Used to bridge the unified saveBpmnState pipeline (called from App.jsx) with
 * ProcessStage.jsx UI: toast notifications and the save-conflict modal. This
 * avoids prop-drilling a callback through NotesPanel and AppShell.
 */

const listeners = new Set();

/**
 * Subscribe to property-save lifecycle events.
 * @param {(event: PropertySaveEvent) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribePropertySaveEvents(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Emit a property-save lifecycle event.
 * @param {PropertySaveEvent} event
 */
export function emitPropertySaveEvent(event) {
  const payload = event && typeof event === "object" ? event : {};
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // no-op
    }
  });
}
