import { apiListNoteThreads } from "./api.js";

const DEFAULT_TTL_MS = 10_000;

const cache = new Map();
const inFlight = new Map();
const versions = new Map();
const subscribers = new Map();
let windowListenerAttached = false;

function text(value) {
  return String(value || "").trim();
}

export function noteThreadsCacheKey(sessionId, scopeType, elementId) {
  return `${text(sessionId)}|${text(scopeType)}|${text(elementId)}`;
}

function isStale(entry) {
  if (!entry) return true;
  const ttlMs = Number(entry.ttlMs) > 0 ? Number(entry.ttlMs) : DEFAULT_TTL_MS;
  return Date.now() - entry.timestamp > ttlMs;
}

function notifySubscribers(key) {
  const listeners = subscribers.get(key);
  if (!listeners) return;
  for (const listener of Array.from(listeners)) {
    listener(key);
  }
}

function invalidateBySessionId(sessionId) {
  const sid = text(sessionId);
  if (!sid) return;
  const prefix = `${sid}|`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      versions.set(key, (versions.get(key) || 0) + 1);
      inFlight.delete(key);
      notifySubscribers(key);
    }
  }
}

export function invalidateNoteThreads(sessionId, scopeType, elementId) {
  const sid = text(sessionId);
  if (!sid) return;
  const key = noteThreadsCacheKey(sid, scopeType, elementId);
  cache.delete(key);
  versions.set(key, (versions.get(key) || 0) + 1);
  inFlight.delete(key);
  notifySubscribers(key);
}

export function seedNoteThreads(sessionId, scopeType, elementId, threads, ttlMs = DEFAULT_TTL_MS) {
  const sid = text(sessionId);
  if (!sid) return;
  const key = noteThreadsCacheKey(sid, scopeType, elementId);
  cache.set(key, { data: threads || [], timestamp: Date.now(), ttlMs });
  notifySubscribers(key);
}

export function getCachedNoteThreads(sessionId, scopeType, elementId) {
  const sid = text(sessionId);
  if (!sid) return null;
  const key = noteThreadsCacheKey(sid, scopeType, elementId);
  const entry = cache.get(key);
  if (isStale(entry)) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function clearNoteThreadsCache() {
  cache.clear();
  inFlight.clear();
  versions.clear();
  subscribers.clear();
}

export function __resetForTests() {
  clearNoteThreadsCache();
  windowListenerAttached = false;
}

export function subscribeNoteThreads(sessionId, scopeType, elementId, listener) {
  const sid = text(sessionId);
  if (!sid || typeof listener !== "function") return () => {};
  const key = noteThreadsCacheKey(sid, scopeType, elementId);
  const listeners = subscribers.get(key) || new Set();
  listeners.add(listener);
  subscribers.set(key, listeners);
  return () => {
    const current = subscribers.get(key);
    if (!current) return;
    current.delete(listener);
    if (!current.size) subscribers.delete(key);
  };
}

function ensureWindowListener() {
  if (windowListenerAttached || typeof window === "undefined") return;
  windowListenerAttached = true;
  window.addEventListener("processmap:element-note-threads-changed", (event) => {
    const sid = text(event?.detail?.sessionId);
    if (!sid) return;
    invalidateBySessionId(sid);
  });
  window.addEventListener("processmap:notes-aggregate-changed", (event) => {
    const sid = text(event?.detail?.sessionId);
    if (!sid) return;
    invalidateBySessionId(sid);
  });
}

export async function fetchNoteThreads(sessionId, scopeType, elementId, options = {}) {
  const sid = text(sessionId);
  if (!sid) return { ok: false, status: 0, error: "missing session_id", items: [] };
  const sType = text(scopeType);
  const eid = text(elementId);
  const key = noteThreadsCacheKey(sid, sType, eid);
  const force = options?.force === true;
  const ttlMs = Number(options?.ttlMs) > 0 ? Number(options?.ttlMs) : DEFAULT_TTL_MS;
  const transport = typeof options?.transport === "function" ? options.transport : apiListNoteThreads;

  ensureWindowListener();

  const cachedEntry = cache.get(key);
  if (!force && cachedEntry && !isStale(cachedEntry, ttlMs)) {
    return { ok: true, status: 200, items: cachedEntry.data };
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const requestVersion = versions.get(key) || 0;
  const filters = {};
  if (sType) filters.scopeType = sType;
  if (eid) filters.elementId = eid;

  const request = transport(sid, filters)
    .then((result) => {
      if (!result?.ok) return { ok: false, status: result?.status || 0, error: result?.error || "request_failed", items: [] };
      const items = Array.isArray(result.items) ? result.items : [];
      if ((versions.get(key) || 0) === requestVersion) {
        cache.set(key, { data: items, timestamp: Date.now(), ttlMs });
      }
      return { ok: true, status: result.status, items };
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function useNoteThreads(sessionId, scopeType, elementId) {
  ensureWindowListener();
  const sid = text(sessionId);
  const sType = text(scopeType);
  const eid = text(elementId);
  const [threads, setThreads] = useState(() => getCachedNoteThreads(sid, sType, eid) || []);

  useEffect(() => {
    let cancelled = false;
    if (!sid) {
      setThreads([]);
      return () => {
        cancelled = true;
      };
    }
    setThreads(getCachedNoteThreads(sid, sType, eid) || []);
    void fetchNoteThreads(sid, sType, eid).then((result) => {
      if (!cancelled && result?.ok) setThreads(result.items);
    });
    return () => {
      cancelled = true;
    };
  }, [sid, sType, eid]);

  useEffect(() => {
    if (!sid) return undefined;
    return subscribeNoteThreads(sid, sType, eid, () => {
      setThreads(getCachedNoteThreads(sid, sType, eid) || []);
      void fetchNoteThreads(sid, sType, eid, { force: true }).then((result) => {
        if (result?.ok) setThreads(result.items);
      });
    });
  }, [sid, sType, eid]);

  return threads;
}
