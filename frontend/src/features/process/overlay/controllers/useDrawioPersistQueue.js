import { useCallback, useRef } from "react";

export default function useDrawioPersistQueue({
  normalizeDrawioMeta,
  persistDrawioMeta,
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

  return {
    persistDrawioMetaOrdered,
  };
}
