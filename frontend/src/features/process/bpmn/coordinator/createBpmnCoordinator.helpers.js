export function asText(value) {
  return String(value || "");
}

export function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

export function readStaleConflictChangedKeys(errorDetails) {
  const details = asObject(errorDetails);
  const lastWrite = asObject(details.server_last_write || details.serverLastWrite);
  return asArray(lastWrite.changed_keys || lastWrite.changedKeys)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function normalizeErrorDetails(value) {
  const details = asObject(value);
  return Object.keys(details).length ? details : null;
}

export function isDiagramStateConflictResult(result) {
  const status = asNumber(result?.status, 0);
  if (status !== 409) return false;
  const details = asObject(result?.errorDetails);
  const code = asText(result?.errorCode || details?.code).trim().toUpperCase();
  if (!code) return true;
  return (
    code === "HTTP_409"
    || code.includes("DIAGRAM_STATE_CONFLICT")
    || code.includes("BASE_VERSION_REQUIRED")
    || code.includes("CONFLICT")
  );
}

export function isIntentPreservingReason(reasonRaw) {
  const reason = asText(reasonRaw).trim().toLowerCase();
  if (!reason) return false;
  return reason.startsWith("manual_save") || reason.startsWith("publish_manual_save");
}

export function isPublishManualSaveReason(reasonRaw) {
  const reason = asText(reasonRaw).trim().toLowerCase();
  if (!reason) return false;
  return reason.startsWith("publish_manual_save");
}

export function buildConflictReplayReason(reasonRaw) {
  const reason = asText(reasonRaw).trim();
  if (!isIntentPreservingReason(reason)) return "";
  if (reason.endsWith(":conflict_replay")) return reason;
  return `${reason}:conflict_replay`;
}

export function buildQueuedReplayReason(reasonRaw) {
  const reason = asText(reasonRaw).trim();
  if (!reason || reason === "queued") return "queued";
  if (reason.endsWith(":queued")) return reason;
  return `${reason}:queued`;
}

export function normalizeErrorCode(value) {
  return asText(value).trim().toUpperCase();
}

export function classifySaveTrigger(reasonRaw = "", options = {}) {
  const reason = asText(reasonRaw).trim().toLowerCase();
  if (options?.fromPending === true || reason.includes("pending_replay")) return "pending_replay";
  if (reason.includes("beforeunload") || reason.includes("pagehide") || reason.includes("visibility_hidden")) {
    return "beforeunload_reload_flush";
  }
  if (reason.includes("reload")) return "hydration_reload";
  if (reason.includes("autosave")) return "autosave";
  if (reason.includes("manual")) return "manual_save";
  return "other";
}

export function isStaleConflictFailure(saved = null) {
  const value = saved && typeof saved === "object" ? saved : {};
  const status = asNumber(value?.status, 0);
  const errorCode = normalizeErrorCode(value?.errorCode);
  const errorDetails = normalizeErrorDetails(value?.errorDetails);
  const detailsCode = normalizeErrorCode(errorDetails?.code);
  return (
    status === 409
    || errorCode === "DIAGRAM_STATE_CONFLICT"
    || detailsCode === "DIAGRAM_STATE_CONFLICT"
  );
}

export function fnv1aHex(input) {
  const src = asText(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function withTimeout(promiseFactory, ms, context) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${context || "operation"} timeout after ${ms}ms`));
    }, Math.max(100, Number(ms) || 1000));
    Promise.resolve()
      .then(() => promiseFactory())
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}
