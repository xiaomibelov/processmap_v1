export const RECENT_PUBLISH_LEAVE_BYPASS_MS = 30_000;

function toText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fnv1aHex(input) {
  const text = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hasDirtyDraftState({ saveDirtyHint = false, hasXmlDraftChanges = false } = {}) {
  return saveDirtyHint === true || hasXmlDraftChanges === true;
}

export function shouldBypassLeaveFlushAfterRecentPublish({
  activeSessionId = "",
  saveDirtyHint = false,
  hasXmlDraftChanges = false,
  lastSuccessfulPublish = null,
  nowMs = Date.now(),
  bypassWindowMs = RECENT_PUBLISH_LEAVE_BYPASS_MS,
} = {}) {
  if (hasDirtyDraftState({ saveDirtyHint, hasXmlDraftChanges })) {
    return { skip: false, reason: "dirty_session" };
  }
  const sid = toText(activeSessionId);
  if (!sid) return { skip: false, reason: "no_active_session" };
  const publishSid = toText(lastSuccessfulPublish?.sessionId);
  if (!publishSid || publishSid !== sid) {
    return { skip: false, reason: "publish_sid_mismatch" };
  }
  const publishedAtMs = toNumber(lastSuccessfulPublish?.atMs, 0);
  if (publishedAtMs <= 0) {
    return { skip: false, reason: "publish_ts_missing" };
  }
  const ageMs = Math.max(0, toNumber(nowMs, 0) - publishedAtMs);
  if (ageMs > Math.max(1_000, toNumber(bypassWindowMs, RECENT_PUBLISH_LEAVE_BYPASS_MS))) {
    return { skip: false, reason: "publish_too_old" };
  }
  return {
    skip: true,
    reason: "recent_publish_no_local_changes",
    ageMs,
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function flushProcessStageBeforeLeave({
  requestedSessionId = "",
  activeSessionId = "",
  activeTab = "diagram",
  bpmnSync = null,
  flushFromActiveTab = null,
  saveDirtyHint = false,
  hasXmlDraftChanges = false,
  lastSuccessfulPublish = null,
  now = () => Date.now(),
  sleep = defaultSleep,
  maxWaitMs = 4_200,
  pendingSleepMs = 220,
  stableSleepMs = 180,
} = {}) {
  const sid = toText(activeSessionId);
  const requestedSid = toText(requestedSessionId);
  if (!sid) {
    return { ok: true, skipped: true, reason: "no_active_session" };
  }
  if (requestedSid && requestedSid !== sid) {
    return { ok: true, skipped: true, reason: "session_mismatch" };
  }

  const bypass = shouldBypassLeaveFlushAfterRecentPublish({
    activeSessionId: sid,
    saveDirtyHint,
    hasXmlDraftChanges,
    lastSuccessfulPublish,
    nowMs: Number(now()),
  });
  if (bypass.skip) {
    return { ok: true, skipped: true, reason: bypass.reason };
  }

  const flushFn = typeof flushFromActiveTab === "function"
    ? flushFromActiveTab
    : bpmnSync?.flushFromActiveTab;
  if (typeof flushFn !== "function") {
    return { ok: false, error: "flush_before_leave_handler_missing", attempts: 0 };
  }

  const flushTab = toText(activeTab).toLowerCase() === "xml" ? "xml" : "diagram";
  const startedAt = Number(now());
  let attempts = 0;
  let stableFlushCount = 0;
  let stableXmlHash = "";

  while (Number(now()) - startedAt <= maxWaitMs) {
    attempts += 1;
    const flush = await flushFn(flushTab, {
      force: true,
      source: "leave_to_project",
      reason: "leave_to_project",
    });
    if (!flush?.ok) {
      return {
        ok: false,
        error: toText(flush?.error || "flush_before_leave_failed"),
        attempts,
      };
    }
    if (flush?.pending) {
      stableFlushCount = 0;
      stableXmlHash = "";
      await sleep(pendingSleepMs);
      continue;
    }
    const xmlHash = fnv1aHex(String(flush?.xml || ""));
    if (xmlHash && xmlHash === stableXmlHash) {
      stableFlushCount += 1;
    } else {
      stableXmlHash = xmlHash;
      stableFlushCount = 1;
    }
    if (stableFlushCount >= 2) {
      return {
        ok: true,
        pending: false,
        attempts,
        stableXmlHash,
      };
    }
    await sleep(stableSleepMs);
  }

  return {
    ok: false,
    error: "flush_before_leave_pending_timeout",
    attempts,
  };
}
