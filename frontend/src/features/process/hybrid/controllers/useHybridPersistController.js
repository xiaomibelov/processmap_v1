import { useCallback, useEffect, useRef, useState } from "react";
import {
  getHybridPersistRetryDelayMs,
  makePendingHybridDraft,
  parsePersistStatus,
  reduceHybridPersistState,
} from "./persistRetryMachine.js";

function toText(value) {
  return String(value || "").trim();
}

function normalizeResult(resultRaw, fallbackCode = null) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const status = parsePersistStatus(result);
  return {
    ...result,
    ok: result?.ok === true,
    status,
    code: result?.code || result?.errorCode || fallbackCode || null,
  };
}

async function waitMs(msRaw, timerRef) {
  const ms = Math.max(0, Number(msRaw || 0));
  await new Promise((resolve) => {
    if (typeof window === "undefined" || ms <= 0) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      if (timerRef) timerRef.current = 0;
      resolve();
    }, ms);
    if (timerRef) timerRef.current = timer;
  });
}

export default function useHybridPersistController({
  persistHybridLayerMap,
  persistHybridV2Doc,
  persistDrawioMeta,
  sessionId,
  setInfoMsg,
  maxAutoRetries = 2,
}) {
  const [lastError, setLastError] = useState(null);
  const [pendingDraft, setPendingDraft] = useState(false);
  const [lockBusyNoticeOpen, setLockBusyNoticeOpen] = useState(false);

  const pendingDraftRef = useRef(null);
  const retryInFlightRef = useRef(false);
  const retryTimerRef = useRef(0);

  const applyPersistState = useCallback((resultRaw, draftRaw, options = {}) => {
    const reduced = reduceHybridPersistState(
      {
        lastError: null,
        pendingDraft: pendingDraftRef.current,
      },
      resultRaw,
      draftRaw,
      {
        maxAutoRetries,
        retryAttempt: Number(options.retryAttempt || 0),
      },
    );
    setLastError(reduced.lastError || null);
    pendingDraftRef.current = reduced.pendingDraft || null;
    setPendingDraft(!!pendingDraftRef.current);
    if (reduced.code === "LOCK_BUSY") {
      setInfoMsg?.("Session is being updated. Retry in a moment.");
      setLockBusyNoticeOpen(true);
    }
    if (resultRaw?.ok) {
      setLockBusyNoticeOpen(false);
    }
    return reduced;
  }, [maxAutoRetries, setInfoMsg]);

  const notifyLockBusy = useCallback((status) => {
    if (status !== 409 && status !== 423) return;
    setInfoMsg?.("Session is being updated. Retry in a moment.");
  }, [setInfoMsg]);

  const persistHybridLayerMapSafe = useCallback(async (nextRaw, options = {}) => {
    const result = normalizeResult(await persistHybridLayerMap(nextRaw, options));
    notifyLockBusy(Number(result.status || 0));
    return result;
  }, [notifyLockBusy, persistHybridLayerMap]);

  const clearPendingDraft = useCallback(() => {
    pendingDraftRef.current = null;
    setPendingDraft(false);
    setLastError(null);
    setLockBusyNoticeOpen(false);
  }, []);

  const saveHybridInternal = useCallback(async (nextRaw, options = {}, runtime = {}) => {
    const reason = toText(options?.reason || options?.source || "hybrid_v2_save");
    const resultRaw = await persistHybridV2Doc(nextRaw, options);
    const result = normalizeResult(resultRaw);
    const draft = makePendingHybridDraft(nextRaw, {
      reason,
      autoRetryAttempts: Number(runtime.retryAttempt || 0),
    });
    const reduced = applyPersistState(result, draft, runtime);
    if (result.ok) {
      clearPendingDraft();
      return { ...result, ok: true };
    }
    return {
      ...result,
      ok: false,
      code: reduced.code || result.code || "SAVE_FAILED",
      errorCode: reduced.code || result.code || "SAVE_FAILED",
      pendingDraft: !!pendingDraftRef.current,
    };
  }, [applyPersistState, clearPendingDraft, persistHybridV2Doc]);

  const runAutoRetry = useCallback(async () => {
    if (retryInFlightRef.current) return { ok: false, skipped: true };
    const pending = pendingDraftRef.current;
    if (!pending) return { ok: false, skipped: true };
    retryInFlightRef.current = true;
    try {
      for (let attempt = 1; attempt <= Math.max(0, Number(maxAutoRetries || 0)); attempt += 1) {
        const latestDraft = pendingDraftRef.current;
        if (!latestDraft) return { ok: true, skipped: true };
        await waitMs(getHybridPersistRetryDelayMs(attempt), retryTimerRef);
        const result = await saveHybridInternal(
          latestDraft.nextHybridV2,
          { source: `${latestDraft.reason || "hybrid_v2_retry"}_auto_${attempt}` },
          { retryAttempt: attempt, allowAutoRetry: false },
        );
        if (result.ok) return result;
        if (String(result.code || "") !== "LOCK_BUSY") return result;
      }
      return { ok: false, code: "LOCK_BUSY", pendingDraft: !!pendingDraftRef.current };
    } finally {
      retryInFlightRef.current = false;
    }
  }, [maxAutoRetries, saveHybridInternal]);

  const persistHybridV2DocSafe = useCallback(async (nextRaw, options = {}) => {
    const result = await saveHybridInternal(nextRaw, options, { retryAttempt: 0, allowAutoRetry: true });
    if (result.ok) return result;
    if (String(result.code || "") === "LOCK_BUSY") {
      void runAutoRetry();
    }
    return result;
  }, [runAutoRetry, saveHybridInternal]);

  const retryLastHybridV2Save = useCallback(async () => {
    const pending = pendingDraftRef.current;
    if (!pending) return { ok: true, skipped: true };
    const result = await saveHybridInternal(
      pending.nextHybridV2,
      { source: `${pending.reason || "hybrid_v2_retry"}_manual` },
      { retryAttempt: Number(pending.autoRetryAttempts || 0), allowAutoRetry: false },
    );
    if (!result.ok && String(result.code || "") === "LOCK_BUSY") {
      setLockBusyNoticeOpen(true);
    }
    return result;
  }, [saveHybridInternal]);

  const discardDraft = useCallback(() => {
    clearPendingDraft();
    setInfoMsg?.("Unsaved Hybrid draft dismissed.");
  }, [clearPendingDraft, setInfoMsg]);

  const dismissLockBusyNotice = useCallback(() => {
    setLockBusyNoticeOpen(false);
  }, []);

  const persistDrawioMetaSafe = useCallback(async (nextRaw, options = {}) => {
    const result = normalizeResult(await persistDrawioMeta(nextRaw, options));
    notifyLockBusy(Number(result.status || 0));
    return result;
  }, [notifyLockBusy, persistDrawioMeta]);

  const saveHybrid = useCallback(
    async (nextHybridV2, options = {}) => persistHybridV2DocSafe(nextHybridV2, options),
    [persistHybridV2DocSafe],
  );

  const patchHybrid = useCallback(async (patchFn, options = {}) => {
    const baseDraft = pendingDraftRef.current?.nextHybridV2 || null;
    const next = typeof patchFn === "function" ? patchFn(baseDraft) : null;
    if (!next) return { ok: false, errorCode: "SAVE_FAILED" };
    return persistHybridV2DocSafe(next, options);
  }, [persistHybridV2DocSafe]);

  useEffect(() => () => {
    if (typeof window === "undefined") return;
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = 0;
    }
  }, []);

  return {
    persistHybridLayerMap: persistHybridLayerMapSafe,
    persistHybridV2Doc: persistHybridV2DocSafe,
    persistDrawioMeta: persistDrawioMetaSafe,
    saveHybrid,
    patchHybrid,
    retryLastHybridV2Save,
    retryLast: retryLastHybridV2Save,
    discardDraft,
    dismissLockBusyNotice,
    pendingDraft,
    lockBusyNotice: {
      open: lockBusyNoticeOpen,
      message: "Session is being updated. Retry in a moment.",
      sessionId: toText(sessionId),
      pendingDraft,
    },
    get lastError() {
      return toText(lastError) || null;
    },
  };
}
