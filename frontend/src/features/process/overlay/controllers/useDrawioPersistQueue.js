import { useCallback, useEffect, useRef } from "react";

const VISIBILITY_TOGGLE_SOURCE = "drawio_visibility_toggle";
const VISIBILITY_TOGGLE_DEBOUNCE_MS = 220;

export default function useDrawioPersistQueue({
  normalizeDrawioMeta,
  persistDrawioMeta,
}) {
  const persistQueueRef = useRef(Promise.resolve({ ok: true }));
  const persistSeqRef = useRef(0);
  const visibilityToggleDebounceRef = useRef({
    timer: null,
    pendingMeta: null,
    pendingResolvers: [],
  });

  const enqueuePersist = useCallback((nextMeta, source) => {
    const requestSeq = ++persistSeqRef.current;
    persistQueueRef.current = persistQueueRef.current
      .catch(() => ({ ok: false }))
      .then(async () => {
        if (requestSeq !== persistSeqRef.current) {
          return { ok: true, stale: true, skipped: true };
        }
        const result = await persistDrawioMeta(nextMeta, { source });
        if (requestSeq !== persistSeqRef.current) {
          return { ok: true, stale: true, dropped: true };
        }
        return result;
      });
    return persistQueueRef.current;
  }, [persistDrawioMeta]);

  const runVisibilityTogglePersistNow = useCallback(() => {
    const state = visibilityToggleDebounceRef.current;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    const pendingMeta = state.pendingMeta;
    const pendingResolvers = state.pendingResolvers.splice(0);
    state.pendingMeta = null;
    if (!pendingMeta) {
      const skipped = { ok: true, skipped: true };
      pendingResolvers.forEach((resolve) => resolve(skipped));
      return Promise.resolve(skipped);
    }
    const persistPromise = enqueuePersist(pendingMeta, VISIBILITY_TOGGLE_SOURCE);
    persistPromise
      .then((result) => {
        pendingResolvers.forEach((resolve) => resolve(result));
      })
      .catch((error) => {
        const failure = {
          ok: false,
          error: String(error?.message || error || "drawio_visibility_persist_failed"),
        };
        pendingResolvers.forEach((resolve) => resolve(failure));
      });
    return persistPromise;
  }, [enqueuePersist]);

  const persistDrawioMetaOrdered = useCallback((nextRaw, options = {}) => {
    const nextMeta = normalizeDrawioMeta(nextRaw);
    const source = String(options?.source || "overlay_drawio_persist");
    const debounceState = visibilityToggleDebounceRef.current;

    if (source === VISIBILITY_TOGGLE_SOURCE) {
      debounceState.pendingMeta = nextMeta;
      if (debounceState.timer) {
        clearTimeout(debounceState.timer);
      }
      return new Promise((resolve) => {
        debounceState.pendingResolvers.push(resolve);
        debounceState.timer = setTimeout(() => {
          debounceState.timer = null;
          void runVisibilityTogglePersistNow();
        }, VISIBILITY_TOGGLE_DEBOUNCE_MS);
      });
    }

    if (debounceState.timer || debounceState.pendingMeta) {
      if (debounceState.timer) {
        clearTimeout(debounceState.timer);
        debounceState.timer = null;
      }
      const pendingResolvers = debounceState.pendingResolvers.splice(0);
      debounceState.pendingMeta = null;
      const persistPromise = enqueuePersist(nextMeta, source);
      persistPromise
        .then((result) => pendingResolvers.forEach((resolve) => resolve(result)))
        .catch((error) => {
          const failure = {
            ok: false,
            error: String(error?.message || error || "drawio_visibility_followup_persist_failed"),
          };
          pendingResolvers.forEach((resolve) => resolve(failure));
        });
      return persistPromise;
    }

    return enqueuePersist(nextMeta, source);
  }, [enqueuePersist, normalizeDrawioMeta, runVisibilityTogglePersistNow]);

  useEffect(() => () => {
    const state = visibilityToggleDebounceRef.current;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    const cancelled = { ok: true, cancelled: true };
    state.pendingResolvers.splice(0).forEach((resolve) => resolve(cancelled));
    state.pendingMeta = null;
  }, []);

  return {
    persistDrawioMetaOrdered,
  };
}
