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
  const lastErrorRef = useRef("");

  const withErrorCode = useCallback((resultRaw) => {
    const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
    const status = parsePersistStatus(result);
    let errorCode = "";
    if (status === 409 || status === 423) errorCode = "LOCK_BUSY";
    if (!errorCode && result?.ok === false) errorCode = "SAVE_FAILED";
    if (errorCode) lastErrorRef.current = errorCode;
    else if (result?.ok) lastErrorRef.current = "";
    return {
      ...result,
      status,
      errorCode,
    };
  }, []);

  const notifyLockBusy = useCallback((status) => {
    if (status !== 409 && status !== 423) return;
    setInfoMsg?.("Сессия сейчас обновляется другим запросом. Повторите сохранение.");
  }, [setInfoMsg]);

  const persistHybridLayerMapSafe = useCallback(async (nextRaw, options = {}) => {
    const result = withErrorCode(await persistHybridLayerMap(nextRaw, options));
    notifyLockBusy(Number(result.status || 0));
    return result;
  }, [notifyLockBusy, persistHybridLayerMap, withErrorCode]);

  const persistHybridV2DocSafe = useCallback(async (nextRaw, options = {}) => {
    const result = withErrorCode(await persistHybridV2Doc(nextRaw, options));
    const status = Number(result.status || 0);
    if (!result?.ok) {
      lastFailedDocRef.current = nextRaw;
      lastFailedSourceRef.current = toText(options?.source || "hybrid_v2_retry");
    } else {
      lastFailedDocRef.current = null;
      lastFailedSourceRef.current = "";
    }
    notifyLockBusy(status);
    return result;
  }, [notifyLockBusy, persistHybridV2Doc, withErrorCode]);

  const retryLastHybridV2Save = useCallback(async () => {
    if (!lastFailedDocRef.current) return { ok: true, skipped: true };
    return persistHybridV2DocSafe(lastFailedDocRef.current, {
      source: lastFailedSourceRef.current || "hybrid_v2_retry",
    });
  }, [persistHybridV2DocSafe]);

  const persistDrawioMetaSafe = useCallback(async (nextRaw, options = {}) => {
    const result = withErrorCode(await persistDrawioMeta(nextRaw, options));
    notifyLockBusy(Number(result.status || 0));
    return result;
  }, [notifyLockBusy, persistDrawioMeta, withErrorCode]);

  const saveHybrid = useCallback(
    async (nextHybridV2, options = {}) => persistHybridV2DocSafe(nextHybridV2, options),
    [persistHybridV2DocSafe],
  );

  const patchHybrid = useCallback(async (patchFn, options = {}) => {
    const next = typeof patchFn === "function" ? patchFn(lastFailedDocRef.current) : null;
    if (!next) return { ok: false, errorCode: "SAVE_FAILED" };
    return persistHybridV2DocSafe(next, options);
  }, [persistHybridV2DocSafe]);

  return {
    persistHybridLayerMap: persistHybridLayerMapSafe,
    persistHybridV2Doc: persistHybridV2DocSafe,
    persistDrawioMeta: persistDrawioMetaSafe,
    saveHybrid,
    patchHybrid,
    retryLastHybridV2Save,
    get lastError() {
      return toText(lastErrorRef.current);
    },
  };
}
