import {
  SAVE_FAILURE_KIND,
  classifySaveHttpStatus,
} from "../../../session/conflictModel.js";

function toText(value) {
  return String(value || "").trim();
}

export function parsePersistStatus(resultRaw) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const explicit = Number(result.status || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = `${toText(result.error)} ${toText(result.message)}`;
  const match = text.match(/\b(404|409|410|423)\b/);
  if (match) return Number(match[1] || 0);
  return 0;
}

export function isLockBusyStatus(statusRaw) {
  // P1: только 423 (временная блокировка) — авто-ретрай безопасен.
  // 409 (CAS-конфликт = чужая запись) — НЕ lock-busy, только решение пользователя.
  return classifySaveHttpStatus(statusRaw) === SAVE_FAILURE_KIND.LOCK_BUSY;
}

export function mapPersistErrorCode(resultRaw) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const status = parsePersistStatus(result);
  const kind = classifySaveHttpStatus(status);
  if (kind === SAVE_FAILURE_KIND.CONFLICT) {
    return { status, code: "CONFLICT" };
  }
  if (kind === SAVE_FAILURE_KIND.LOCK_BUSY) {
    return { status, code: "LOCK_BUSY" };
  }
  if (result?.ok === true) {
    return { status, code: null };
  }
  // P-1: терминальный 404/410 — сессия удалена (не путать с VALIDATION).
  if (status === 404 || status === 410) {
    return { status, code: "SESSION_NOT_FOUND" };
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
  if (code === "SESSION_NOT_FOUND") {
    // P-1: терминальный 404/410 — сессия удалена. Черновик сохраняем
    // (его можно восстановить с экрана мёртвой сессии), ретраев нет.
    return {
      lastError: "SESSION_NOT_FOUND",
      pendingDraft: draftRaw || state.pendingDraft || null,
      status,
      code: "SESSION_NOT_FOUND",
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
  if (code === "CONFLICT") {
    // P1: 409 — чужая запись на сервере. Черновик сохраняем, но НИКАКИХ
    // молчаливых ретраев: только явное решение пользователя (conflict-UX).
    const pendingDraft = draftRaw || state.pendingDraft || null;
    return {
      lastError: "CONFLICT",
      pendingDraft,
      status,
      code: "CONFLICT",
      shouldAutoRetry: false,
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
