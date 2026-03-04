function toText(value) {
  return String(value || "").trim();
}

export function parsePersistStatus(resultRaw) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const explicit = Number(result.status || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = `${toText(result.error)} ${toText(result.message)}`;
  const match = text.match(/\b(409|423)\b/);
  if (match) return Number(match[1] || 0);
  return 0;
}

export function isLockBusyStatus(statusRaw) {
  const status = Number(statusRaw || 0);
  return status === 409 || status === 423;
}

export function mapPersistErrorCode(resultRaw) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const status = parsePersistStatus(result);
  if (isLockBusyStatus(status)) {
    return { status, code: "LOCK_BUSY" };
  }
  if (result?.ok === true) {
    return { status, code: null };
  }
  if (status >= 400 && status < 500) {
    return { status, code: "VALIDATION" };
  }
  if (status >= 500 || status === 0) {
    return { status, code: "NETWORK" };
  }
  return { status, code: "SAVE_FAILED" };
}

export function makePendingHybridDraft(nextHybridV2, meta = {}) {
  return {
    nextHybridV2,
    reason: toText(meta.reason || meta.source || "hybrid_v2_retry"),
    autoRetryAttempts: Number(meta.autoRetryAttempts || 0),
    createdAt: Date.now(),
  };
}

export function reduceHybridPersistState(stateRaw, resultRaw, draftRaw = null, options = {}) {
  const state = stateRaw && typeof stateRaw === "object"
    ? stateRaw
    : { lastError: null, pendingDraft: null };
  const { status, code } = mapPersistErrorCode(resultRaw);
  const maxAutoRetries = Math.max(0, Number(options.maxAutoRetries || 2));
  const retryAttempt = Math.max(0, Number(options.retryAttempt || 0));
  if (resultRaw?.ok) {
    return {
      lastError: null,
      pendingDraft: null,
      status,
      code: null,
      shouldAutoRetry: false,
    };
  }
  if (code === "LOCK_BUSY") {
    const pendingDraft = draftRaw || state.pendingDraft || null;
    const canAutoRetry = retryAttempt < maxAutoRetries;
    return {
      lastError: "LOCK_BUSY",
      pendingDraft,
      status,
      code: "LOCK_BUSY",
      shouldAutoRetry: !!pendingDraft && canAutoRetry,
    };
  }
  return {
    lastError: code,
    pendingDraft: state.pendingDraft || null,
    status,
    code,
    shouldAutoRetry: false,
  };
}

export function getHybridPersistRetryDelayMs(attemptRaw) {
  const attempt = Math.max(1, Number(attemptRaw || 1));
  if (attempt <= 1) return 300;
  if (attempt === 2) return 800;
  return 1200;
}
