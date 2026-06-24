/**
 * Simple in-memory cache for BPMN XML keyed by session id.
 * Used to avoid backend fetches on subprocess return and soft reloads.
 */

export function createBpmnXmlCache() {
  const map = new Map();

  return {
    get(sid) {
      return sid ? map.get(String(sid)) : undefined;
    },
    set(sid, xml) {
      if (!sid) return;
      map.set(String(sid), String(xml || ""));
    },
    has(sid) {
      return sid ? map.has(String(sid)) : false;
    },
    delete(sid) {
      if (!sid) return;
      map.delete(String(sid));
    },
    clear() {
      map.clear();
    },
    keys() {
      return Array.from(map.keys());
    },
  };
}
