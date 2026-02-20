function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function readGlobalFlag() {
  if (typeof window === "undefined") return false;
  return !!window.__FPC_DEBUG_TRACE__;
}

function readLocalStorageFlag() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem("fpc_debug_trace") || "").trim() === "1";
  } catch {
    return false;
  }
}

export function isProcessTraceEnabled() {
  return readGlobalFlag() || readLocalStorageFlag();
}

export function traceProcess(eventName, payload = {}) {
  if (!isProcessTraceEnabled()) return;
  if (typeof window === "undefined") return;
  const event = String(eventName || "").trim() || "unknown";
  const record = {
    ts: new Date().toISOString(),
    event,
    payload: payload && typeof payload === "object" ? payload : { value: payload },
  };
  const list = Array.isArray(window.__FPC_TRACE_LOG__) ? window.__FPC_TRACE_LOG__ : [];
  list.push(record);
  if (list.length > 500) list.splice(0, list.length - 500);
  window.__FPC_TRACE_LOG__ = list;
  try {
    // Keep single-line logs to simplify copy/paste from browser console.
    // eslint-disable-next-line no-console
    console.debug(`[FPC TRACE] ${event} ${safeStringify(record.payload)}`);
  } catch {
  }
}
