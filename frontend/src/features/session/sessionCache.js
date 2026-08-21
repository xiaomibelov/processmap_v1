/**
 * Unified session cache.
 *
 * Keyed by sessionId, stores the session JSON, raw BPMN XML, parsed extensions,
 * and metadata. Provides LRU eviction and per-session/global subscriptions.
 */

function asText(value) {
  return String(value || "").trim();
}

function now() {
  return Date.now();
}

class SessionCache {
  constructor({ defaultTtlMs = 30000, maxSize = 10 } = {}) {
    this.cache = new Map();
    this.subscribers = new Map();
    this.defaultTtlMs = Math.max(1, Number(defaultTtlMs) || 30000);
    this.maxSize = Math.max(1, Number(maxSize) || 10);
  }

  _key(sessionId) {
    return asText(sessionId);
  }

  _touch(entry) {
    entry.accessedAt = now();
  }

  /**
   * Get cached data for a session, or null if missing/stale.
   */
  get(sessionId, { allowStale = false } = {}) {
    const key = this._key(sessionId);
    if (!key) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;
    const isFresh = allowStale || this.isFresh(sessionId);
    if (!isFresh) return null;
    this._touch(entry);
    return entry.data;
  }

  /**
   * Returns true if cached entry exists and is within TTL.
   */
  isFresh(sessionId, ttlMs) {
    const key = this._key(sessionId);
    const entry = this.cache.get(key);
    if (!entry) return false;
    const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : this.defaultTtlMs;
    return now() - entry.loadedAt <= ttl;
  }

  /**
   * Returns true if any entry exists (even stale).
   */
  has(sessionId) {
    return this.cache.has(this._key(sessionId));
  }

  /**
   * Store full session data.
   */
  set(sessionId, data) {
    const key = this._key(sessionId);
    if (!key) return this;
    const entry = {
      data,
      loadedAt: now(),
      accessedAt: now(),
    };
    this.cache.set(key, entry);
    this._prune();
    this._notify(key, { type: "set", data });
    return this;
  }

  /**
   * Partial update of cached data (e.g., after save success).
   */
  update(sessionId, updates) {
    const key = this._key(sessionId);
    if (!key) return this;
    const entry = this.cache.get(key);
    if (!entry) return this;
    entry.data = { ...entry.data, ...updates };
    entry.accessedAt = now();
    this._notify(key, { type: "update", data: entry.data, updates });
    return this;
  }

  /**
   * Mark cached data stale (does not delete; get() will treat as missing
   * unless allowStale=true).
   */
  invalidate(sessionId) {
    const key = this._key(sessionId);
    if (!key) return this;
    const entry = this.cache.get(key);
    if (!entry) return this;
    entry.loadedAt = 0;
    this._notify(key, { type: "invalidate", data: entry.data });
    return this;
  }

  /**
   * Remove entry from cache entirely.
   */
  delete(sessionId) {
    const key = this._key(sessionId);
    if (!key) return this;
    const had = this.cache.has(key);
    this.cache.delete(key);
    if (had) this._notify(key, { type: "delete" });
    return this;
  }

  /**
   * Clear all cached sessions.
   */
  clear() {
    const keys = Array.from(this.cache.keys());
    this.cache.clear();
    keys.forEach((key) => this._notify(key, { type: "clear" }));
    return this;
  }

  /**
   * Evict least-recently accessed entries beyond maxSize.
   */
  _prune() {
    if (this.cache.size <= this.maxSize) return;
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].accessedAt - b[1].accessedAt);
    const toEvict = entries.slice(0, entries.length - this.maxSize);
    for (const [key] of toEvict) {
      this.cache.delete(key);
      this._notify(key, { type: "evict" });
    }
  }

  prune(maxSize = this.maxSize) {
    const limit = Math.max(1, Number(maxSize) || this.maxSize);
    if (this.cache.size <= limit) return this;
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].accessedAt - b[1].accessedAt);
    const toEvict = entries.slice(0, entries.length - limit);
    for (const [key] of toEvict) {
      this.cache.delete(key);
      this._notify(key, { type: "evict" });
    }
    return this;
  }

  /**
   * Subscribe to cache events for a specific session, or globally (sessionId = null).
   * Callback receives ({ sessionId, type, data?, updates? }).
   */
  subscribe(sessionId, callback) {
    if (typeof callback !== "function") return () => {};
    const key = sessionId === null || sessionId === undefined ? "" : this._key(sessionId);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    const set = this.subscribers.get(key);
    set.add(callback);
    return () => {
      set.delete(callback);
      if (set.size === 0) this.subscribers.delete(key);
    };
  }

  _notify(key, event) {
    const payload = { sessionId: key || undefined, ...event };
    const globalSet = this.subscribers.get("");
    if (globalSet) {
      globalSet.forEach((cb) => {
        try { cb(payload); } catch { /* ignore */ }
      });
    }
    if (key) {
      const sessionSet = this.subscribers.get(key);
      if (sessionSet) {
        sessionSet.forEach((cb) => {
          try { cb(payload); } catch { /* ignore */ }
        });
      }
    }
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  size() {
    return this.cache.size;
  }
}

export { SessionCache };

export const sessionCache = new SessionCache();

export default sessionCache;
