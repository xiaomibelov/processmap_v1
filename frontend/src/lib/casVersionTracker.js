/**
 * Unified CAS (compare-and-swap) base diagram state version tracker.
 *
 * Single in-memory store keyed by sessionId. Consumers read/write versions via
 * function calls instead of duplicating the value into React state or closure
 * variables. Rollback uses a small history ring so nested optimistic edits can
 * be reverted to the last known-good version.
 */

function normalizeVersion(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function normalizeSessionId(value) {
  return String(value || "").trim();
}

const MAX_HISTORY = 8;

const store = new Map();

function ensureEntry(sessionId) {
  if (!store.has(sessionId)) {
    store.set(sessionId, {
      history: [],
    });
  }
  return store.get(sessionId);
}

/**
 * Set the authoritative version for a session, e.g. on session load/activation.
 * @param {string} sessionId
 * @param {number|null|undefined} version
 */
export function setVersion(sessionId, version) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return;
  const normalized = normalizeVersion(version);
  const entry = ensureEntry(sid);
  entry.history = normalized !== null ? [normalized] : [];
}

/**
 * Return the current known version for a session, or null.
 * @param {string} sessionId
 * @returns {number|null}
 */
export function getVersion(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return null;
  const entry = store.get(sid);
  if (!entry || !entry.history.length) return null;
  return entry.history[entry.history.length - 1];
}

/**
 * Atomically update the version after a successful save. The previous version is
 * preserved in a small ring so rollbackVersion can restore it.
 * @param {string} sessionId
 * @param {number|null|undefined} newVersion
 */
export function bumpVersion(sessionId, newVersion) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return;
  const normalized = normalizeVersion(newVersion);
  if (normalized === null) return;

  const entry = ensureEntry(sid);
  entry.history.push(normalized);
  if (entry.history.length > MAX_HISTORY) {
    entry.history.shift();
  }
}

/**
 * Revert to the last known-good version. Useful when a save fails (409/error)
 * and an optimistic bump needs to be undone.
 * @param {string} sessionId
 * @returns {number|null} The version after rollback (or current if no prior known).
 */
export function rollbackVersion(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return null;
  const entry = store.get(sid);
  if (!entry) return null;

  if (entry.history.length > 1) {
    entry.history.pop();
  }
  return entry.history.length ? entry.history[entry.history.length - 1] : null;
}

/**
 * Check whether a version is known for the session.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function isValidForSession(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return false;
  const entry = store.get(sid);
  if (!entry) return false;
  return entry.history.length > 0;
}

/**
 * Remove all state for a session when it closes.
 * @param {string} sessionId
 */
export function clearSession(sessionId) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return;
  store.delete(sid);
}

/**
 * Reset the entire tracker. Intended for tests only.
 */
export function __resetForTests() {
  store.clear();
}
