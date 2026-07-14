/**
 * React hook for unified session loading.
 *
 * Loads a session through sessionLoader, keeps the result in local React state,
 * and re-renders when the cached entry is updated or invalidated by other
 * subsystems (e.g. saveCoordinator after a successful save).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { sessionLoader } from "./sessionLoader.js";
import { sessionCache } from "./sessionCache.js";

function asText(value) {
  return String(value || "").trim();
}

export default function useSessionLoader(sessionId, options = {}) {
  const sid = asText(sessionId);
  const [data, setData] = useState(() => (sid ? sessionCache.get(sid) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const activeSidRef = useRef(sid);

  useEffect(() => {
    activeSidRef.current = sid;
  }, [sid]);

  const load = useCallback(
    async ({ force = false } = {}) => {
      const currentSid = activeSidRef.current;
      if (!currentSid) {
        setData(null);
        setError(null);
        return { ok: false, error: "missing session id" };
      }

      setLoading(true);
      setError(null);
      try {
        const result = await sessionLoader.load(currentSid, { force });
        if (activeSidRef.current === currentSid) {
          if (result.ok) {
            setData(result.data);
            setError(null);
          } else {
            setError(result.error || "load failed");
          }
        }
        return result;
      } catch (err) {
        const message = err?.message || String(err);
        if (activeSidRef.current === currentSid) {
          setError(message);
        }
        return { ok: false, error: message };
      } finally {
        if (activeSidRef.current === currentSid) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const reload = useCallback(() => load({ force: true }), [load]);

  useEffect(() => {
    if (!sid) {
      setData(null);
      setError(null);
      setLoading(false);
      return () => {};
    }

    const cached = sessionCache.get(sid);
    if (cached && cached !== data) {
      setData(cached);
    }

    setLoading(true);
    let cancelled = false;
    sessionLoader.load(sid).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || "load failed");
      }
    });

    const unsubscribe = sessionCache.subscribe(sid, (event) => {
      if (cancelled) return;
      if (event.type === "set" || event.type === "update") {
        setData(event.data);
      } else if (event.type === "invalidate" || event.type === "delete" || event.type === "evict") {
        setData(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sid]);

  return {
    data,
    loading,
    error,
    load,
    reload,
    sessionId: sid,
  };
}
