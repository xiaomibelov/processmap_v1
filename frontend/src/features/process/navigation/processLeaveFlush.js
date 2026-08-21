const PROCESS_STAGE_FLUSH_BEFORE_LEAVE_EVENT = "fpc:processstage_flush_before_leave";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function processStageFlushBeforeLeaveEventName() {
  return PROCESS_STAGE_FLUSH_BEFORE_LEAVE_EVENT;
}

export function attachProcessStageFlushBeforeLeaveListener(handler) {
  if (typeof window === "undefined" || typeof handler !== "function") {
    return () => {};
  }
  const eventName = processStageFlushBeforeLeaveEventName();
  const listener = (event) => {
    const detail = asObject(event?.detail);
    const respond = typeof detail.respond === "function" ? detail.respond : null;
    const payload = {
      sessionId: toText(detail.sessionId),
      reason: toText(detail.reason),
    };
    Promise.resolve(handler(payload))
      .then((result) => {
        respond?.(asObject(result));
      })
      .catch((error) => {
        respond?.({
          ok: false,
          error: toText(error?.message || error || "flush_before_leave_failed"),
        });
      });
  };
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener(eventName, listener);
  };
}

export function requestProcessStageFlushBeforeLeave({ sessionId = "", reason = "", timeoutMs = 2600 } = {}) {
  const sid = toText(sessionId);
  if (!sid || typeof window === "undefined") {
    return Promise.resolve({
      ok: true,
      skipped: true,
      reason: "missing_context",
    });
  }
  const ms = Number.isFinite(Number(timeoutMs)) ? Math.max(300, Number(timeoutMs)) : 2600;
  return new Promise((resolve) => {
    let settled = false;
    const done = (payload = {}) => {
      if (settled) return;
      settled = true;
      try {
        window.clearTimeout(timer);
      } catch {
      }
      resolve(asObject(payload));
    };
    const timer = window.setTimeout(() => {
      done({
        ok: false,
        timeout: true,
        reason: "flush_before_leave_timeout",
      });
    }, ms);
    const eventName = processStageFlushBeforeLeaveEventName();
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: {
        sessionId: sid,
        reason: toText(reason),
        respond: done,
      },
    }));
  });
}

