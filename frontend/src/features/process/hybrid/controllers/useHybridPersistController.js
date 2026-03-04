import { useCallback, useRef } from "react";

function toText(value) {
  return String(value || "").trim();
}

function parsePersistStatus(resultRaw) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const explicit = Number(result.status || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = `${toText(result.error)} ${toText(result.message)}`;
  const match = text.match(/\b(409|423)\b/);
  if (match) return Number(match[1] || 0);
  return 0;
}

export default function useHybridPersistController({
  persistHybridLayerMap,
  persistHybridV2Doc,
  persistDrawioMeta,
  setInfoMsg,
}) {
  const lastFailedDocRef = useRef(null);
  const lastFailedSourceRef = useRef("");

  const notifyLockBusy = useCallback((status) => {
    if (status !== 409 && status !== 423) return;
    setInfoMsg?.("Сессия сейчас обновляется другим запросом. Повторите сохранение.");
  }, [setInfoMsg]);

  const persistHybridLayerMapSafe = useCallback(async (nextRaw, options = {}) => {
    const result = await persistHybridLayerMap(nextRaw, options);
    notifyLockBusy(parsePersistStatus(result));
    return result;
  }, [notifyLockBusy, persistHybridLayerMap]);

  const persistHybridV2DocSafe = useCallback(async (nextRaw, options = {}) => {
    const result = await persistHybridV2Doc(nextRaw, options);
    const status = parsePersistStatus(result);
    if (!result?.ok) {
      lastFailedDocRef.current = nextRaw;
      lastFailedSourceRef.current = toText(options?.source || "hybrid_v2_retry");
    } else {
      lastFailedDocRef.current = null;
      lastFailedSourceRef.current = "";
    }
    notifyLockBusy(status);
    return result;
  }, [notifyLockBusy, persistHybridV2Doc]);

  const retryLastHybridV2Save = useCallback(async () => {
    if (!lastFailedDocRef.current) return { ok: true, skipped: true };
    return persistHybridV2DocSafe(lastFailedDocRef.current, {
      source: lastFailedSourceRef.current || "hybrid_v2_retry",
    });
  }, [persistHybridV2DocSafe]);

  const persistDrawioMetaSafe = useCallback(async (nextRaw, options = {}) => {
    const result = await persistDrawioMeta(nextRaw, options);
    notifyLockBusy(parsePersistStatus(result));
    return result;
  }, [notifyLockBusy, persistDrawioMeta]);

  return {
    persistHybridLayerMap: persistHybridLayerMapSafe,
    persistHybridV2Doc: persistHybridV2DocSafe,
    persistDrawioMeta: persistDrawioMetaSafe,
    retryLastHybridV2Save,
  };
}
