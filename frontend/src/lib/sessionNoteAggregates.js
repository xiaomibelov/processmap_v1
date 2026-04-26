import { useEffect, useMemo, useState } from "react";
import {
  apiGetSessionNoteAggregate,
  apiGetSessionNoteAggregates,
} from "./api.js";

const cache = new Map();
const inFlight = new Map();
const aggregateVersions = new Map();
const subscribers = new Map();
let windowListenerAttached = false;

export function sessionNoteAggregateCacheKey(sessionId) {
  return `session:${String(sessionId || "").trim()}`;
}

export function normalizeSessionAggregateIds(sessionIds = []) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(sessionIds) ? sessionIds : []) {
    const sid = String(raw || "").trim();
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    out.push(sid);
  }
  return out;
}

export function getCachedSessionNoteAggregate(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  return cache.get(sessionNoteAggregateCacheKey(sid)) || null;
}

function notifySessionAggregateSubscribers(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const listeners = subscribers.get(sid);
  if (!listeners) return;
  for (const listener of Array.from(listeners)) {
    listener(sid);
  }
}

function ensureWindowAggregateListener() {
  if (windowListenerAttached || typeof window === "undefined") return;
  windowListenerAttached = true;
  window.addEventListener("processmap:notes-aggregate-changed", (event) => {
    const sid = String(event?.detail?.sessionId || "").trim();
    if (!sid) return;
    invalidateSessionNoteAggregate(sid);
  });
}

export function subscribeSessionNoteAggregate(sessionId, listener) {
  const sid = String(sessionId || "").trim();
  if (!sid || typeof listener !== "function") return () => {};
  ensureWindowAggregateListener();
  const listeners = subscribers.get(sid) || new Set();
  listeners.add(listener);
  subscribers.set(sid, listeners);
  return () => {
    const current = subscribers.get(sid);
    if (!current) return;
    current.delete(listener);
    if (!current.size) subscribers.delete(sid);
  };
}

export function invalidateSessionNoteAggregate(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  const key = sessionNoteAggregateCacheKey(sid);
  cache.delete(key);
  aggregateVersions.set(key, (aggregateVersions.get(key) || 0) + 1);
  inFlight.delete(key);
  notifySessionAggregateSubscribers(sid);
}

export function clearSessionNoteAggregateCache() {
  cache.clear();
  inFlight.clear();
  aggregateVersions.clear();
  subscribers.clear();
}

export async function fetchSessionNoteAggregate(sessionId, options = {}) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const force = options?.force === true;
  const key = sessionNoteAggregateCacheKey(sid);
  if (!force && cache.has(key)) return cache.get(key) || null;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const requestVersion = aggregateVersions.get(key) || 0;
  const request = apiGetSessionNoteAggregate(sid)
    .then((result) => {
      if (!result?.ok) return cache.get(key) || null;
      const aggregate = result.aggregate || null;
      if ((aggregateVersions.get(key) || 0) === requestVersion) {
        cache.set(key, aggregate);
      }
      return aggregate;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export async function fetchSessionNoteAggregates(sessionIds = [], options = {}) {
  const ids = normalizeSessionAggregateIds(sessionIds);
  const out = new Map();
  if (!ids.length) return out;
  const force = options?.force === true;
  const toBatch = [];
  const waits = [];

  for (const sid of ids) {
    const key = sessionNoteAggregateCacheKey(sid);
    if (!force && cache.has(key)) {
      out.set(sid, cache.get(key) || null);
      continue;
    }
    const pending = inFlight.get(key);
    if (pending) {
      waits.push(pending.then((aggregate) => out.set(sid, aggregate || null)));
      continue;
    }
    toBatch.push(sid);
  }

  if (toBatch.length) {
    const batchVersions = new Map(toBatch.map((sid) => {
      const key = sessionNoteAggregateCacheKey(sid);
      return [sid, aggregateVersions.get(key) || 0];
    }));
    const batchRequest = apiGetSessionNoteAggregates(toBatch).then((result) => {
      const batchMap = new Map();
      if (result?.ok) {
        for (const sid of toBatch) {
          const key = sessionNoteAggregateCacheKey(sid);
          const aggregate = result.aggregates?.[sid] || null;
          if ((aggregateVersions.get(key) || 0) === (batchVersions.get(sid) || 0)) {
            cache.set(key, aggregate);
          }
          batchMap.set(sid, aggregate);
        }
      }
      return batchMap;
    });

    for (const sid of toBatch) {
      const key = sessionNoteAggregateCacheKey(sid);
      const itemRequest = batchRequest
        .then((batchMap) => batchMap.get(sid) || cache.get(key) || null)
        .finally(() => {
          if (inFlight.get(key) === itemRequest) inFlight.delete(key);
        });
      inFlight.set(key, itemRequest);
      waits.push(itemRequest.then((aggregate) => out.set(sid, aggregate || null)));
    }
  }

  await Promise.all(waits);
  return out;
}

export function useSessionNoteAggregate(sessionId) {
  const sid = String(sessionId || "").trim();
  const [aggregate, setAggregate] = useState(() => getCachedSessionNoteAggregate(sid));

  useEffect(() => {
    let cancelled = false;
    if (!sid) {
      setAggregate(null);
      return () => {
        cancelled = true;
      };
    }
    setAggregate(getCachedSessionNoteAggregate(sid));
    void fetchSessionNoteAggregate(sid).then((nextAggregate) => {
      if (!cancelled) setAggregate(nextAggregate || null);
    });
    return () => {
      cancelled = true;
    };
  }, [sid]);

  useEffect(() => {
    if (!sid) return undefined;
    return subscribeSessionNoteAggregate(sid, () => {
      setAggregate(getCachedSessionNoteAggregate(sid));
      void fetchSessionNoteAggregate(sid, { force: true }).then((nextAggregate) => {
        setAggregate(nextAggregate || null);
      });
    });
  }, [sid]);

  return aggregate;
}

export function useSessionNoteAggregates(sessionIds = []) {
  const idsKey = normalizeSessionAggregateIds(sessionIds).join("\u001f");
  const ids = useMemo(() => idsKey.split("\u001f").filter(Boolean), [idsKey]);
  const [aggregatesBySessionId, setAggregatesBySessionId] = useState(() => {
    const next = new Map();
    for (const sid of ids) {
      const aggregate = getCachedSessionNoteAggregate(sid);
      if (aggregate) next.set(sid, aggregate);
    }
    return next;
  });

  useEffect(() => {
    let cancelled = false;
    const cached = new Map();
    for (const sid of ids) {
      const aggregate = getCachedSessionNoteAggregate(sid);
      if (aggregate) cached.set(sid, aggregate);
    }
    setAggregatesBySessionId(cached);
    void fetchSessionNoteAggregates(ids).then((nextMap) => {
      if (!cancelled) setAggregatesBySessionId(new Map(nextMap));
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  useEffect(() => {
    const unsubs = ids.map((sid) => subscribeSessionNoteAggregate(sid, (changedSid) => {
      setAggregatesBySessionId((prev) => {
        const next = new Map(prev);
        const cached = getCachedSessionNoteAggregate(changedSid);
        if (cached) next.set(changedSid, cached);
        else next.delete(changedSid);
        return next;
      });
      void fetchSessionNoteAggregate(changedSid, { force: true }).then((aggregate) => {
        setAggregatesBySessionId((prev) => {
          const next = new Map(prev);
          if (aggregate) next.set(changedSid, aggregate);
          else next.delete(changedSid);
          return next;
        });
      });
    }));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [idsKey]);

  return aggregatesBySessionId;
}
