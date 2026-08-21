import { useCallback } from "react";

export default function useDrawioMutationBoundary({
  drawioMetaRef,
  setDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
  markPlaybackOverlayInteraction,
  persistDrawioMetaOrdered,
  onPersistError,
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
      persistPromise.then((result) => {
        if (
          result && result.ok === false
          && !result.skipped && !result.stale && !result.cancelled
          && options?.skipPersistErrorCallback !== true
        ) {
          setDrawioMeta(prev);
          drawioMetaRef.current = prev;
          if (typeof onPersistError === "function") {
            onPersistError({
              error: String(result.error || "drawio_persist_failed"),
              status: Number(result.status || 0),
              source: String(options?.source || ""),
            });
          }
        }
      });
    }
    return { changed: true, next, persistPromise };
  }, [
    drawioMetaRef,
    markPlaybackOverlayInteraction,
    normalizeDrawioMeta,
    onPersistError,
    persistDrawioMetaOrdered,
    serializeDrawioMeta,
    setDrawioMeta,
  ]);

  return {
    applyDrawioMutation,
  };
}
