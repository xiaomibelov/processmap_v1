import { useCallback } from "react";

export default function useDrawioMutationBoundary({
  drawioMetaRef,
  setDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
  markPlaybackOverlayInteraction,
  persistDrawioMetaOrdered,
}) {
  const applyDrawioMutation = useCallback((mutator, options = {}) => {
    const prev = drawioMetaRef.current ?? normalizeDrawioMeta(null);
    const mutated = typeof mutator === "function" ? mutator(prev) : prev;
    if (mutated === prev) {
      return {
        changed: false,
        next: prev,
        persistPromise: Promise.resolve({ ok: true, skipped: true }),
      };
    }
    const next = normalizeDrawioMeta(mutated);
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
  };
}
