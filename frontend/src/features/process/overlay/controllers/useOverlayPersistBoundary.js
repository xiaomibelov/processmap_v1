import useDrawioMutationBoundary from "./useDrawioMutationBoundary.js";
import useDrawioPersistQueue from "./useDrawioPersistQueue.js";

export default function useOverlayPersistBoundary({
  drawioMetaRef,
  setDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
  persistDrawioMeta,
  markPlaybackOverlayInteraction,
}) {
  const { persistDrawioMetaOrdered } = useDrawioPersistQueue({
    normalizeDrawioMeta,
    persistDrawioMeta,
  });

  const { applyDrawioMutation } = useDrawioMutationBoundary({
    drawioMetaRef,
    setDrawioMeta,
    normalizeDrawioMeta,
    serializeDrawioMeta,
    markPlaybackOverlayInteraction,
    persistDrawioMetaOrdered,
  });

  return {
    applyDrawioMutation,
    persistDrawioMetaOrdered,
  };
}
