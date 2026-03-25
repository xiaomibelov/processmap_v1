import { useCallback, useRef } from "react";

export default function useOverlayPersistBoundary({
  drawioMetaRef,
  setDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
  persistDrawioMeta,
  markPlaybackOverlayInteraction,
}) {
  const persistQueueRef = useRef(Promise.resolve({ ok: true }));
  const persistSeqRef = useRef(0);

  const persistDrawioMetaOrdered = useCallback((nextRaw, options = {}) => {
    const nextMeta = normalizeDrawioMeta(nextRaw);
    const requestSeq = ++persistSeqRef.current;
    const source = String(options?.source || "overlay_drawio_persist");
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
  }, [normalizeDrawioMeta, persistDrawioMeta]);

  const applyDrawioMutation = useCallback((mutator, options = {}) => {
    const prev = normalizeDrawioMeta(drawioMetaRef.current);
    const mutated = typeof mutator === "function" ? mutator(prev) : prev;
    // Fast-path: mutators follow contract — return same `prev` ref when nothing changed.
    // Avoids double JSON.stringify(100KB+ object) on every no-op mutation.
    if (mutated === prev) {
      return {
        changed: false,
        next: prev,
        persistPromise: Promise.resolve({ ok: true, skipped: true }),
      };
    }
    const next = normalizeDrawioMeta(mutated);
    // Structural fallback: catches the rare case where a mutator creates a new
    // object that is semantically identical to prev.
    if (serializeDrawioMeta(next) === serializeDrawioMeta(prev)) {
      return {
        changed: false,
        next,
        persistPromise: Promise.resolve({ ok: true, skipped: true }),
      };
    }
    setDrawioMeta(next);
    drawioMetaRef.current = next;
    const stage = String(options?.playbackStage || options?.source || "").trim();
    if (stage) markPlaybackOverlayInteraction?.({ stage });
    const persistPromise = options?.persist !== false
      ? persistDrawioMetaOrdered(next, { source: options?.source || "overlay_drawio_update" })
      : Promise.resolve({ ok: true, skipped: true });
    if (options?.persist !== false) {
      void persistPromise;
    }
    return { changed: true, next, persistPromise };
  }, [
    drawioMetaRef,
    markPlaybackOverlayInteraction,
    normalizeDrawioMeta,
    persistDrawioMetaOrdered,
    serializeDrawioMeta,
    setDrawioMeta,
  ]);

  return {
    applyDrawioMutation,
    persistDrawioMetaOrdered,
  };
}
