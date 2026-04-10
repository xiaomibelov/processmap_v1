import {
  clearBackendBpmnClipboard,
  copyBackendBpmnClipboard,
  pasteBackendBpmnClipboard,
  readBackendBpmnClipboard,
} from "./backendBpmnClipboardApi.js";

function toText(value) {
  return String(value || "").trim();
}

function describeErrorValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => describeErrorValue(item))
      .filter(Boolean)
      .join("; ");
  }
  if (typeof value === "object") {
    const direct = describeErrorValue(value.message)
      || describeErrorValue(value.error)
      || describeErrorValue(value.detail)
      || describeErrorValue(value.code);
    if (direct) return direct;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value || "").trim();
    }
  }
  return String(value || "").trim();
}

function normalizeError(resultRaw, fallbackError) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  return {
    ok: false,
    status: Number(result.status || 0),
    error: describeErrorValue(result.error || result.detail || result.message) || toText(fallbackError),
    data: result.data || null,
  };
}

export function createBackendBpmnClipboardController({
  getSessionId = null,
  refreshAfterPaste = null,
  apiClient = null,
} = {}) {
  const client = apiClient || {
    copy: copyBackendBpmnClipboard,
    read: readBackendBpmnClipboard,
    paste: pasteBackendBpmnClipboard,
    clear: clearBackendBpmnClipboard,
  };

  const resolveSessionId = (sessionIdRaw = "") => {
    const explicit = toText(sessionIdRaw);
    if (explicit) return explicit;
    if (typeof getSessionId !== "function") return "";
    return toText(getSessionId());
  };

  return {
    async copyElement({ sessionId = "", elementId = "" } = {}) {
      const sid = resolveSessionId(sessionId);
      const eid = toText(elementId);
      if (!sid) return normalizeError({}, "missing_session_id");
      if (!eid) return normalizeError({}, "missing_element_id");
      const result = await client.copy({ sessionId: sid, elementId: eid });
      if (!result?.ok) return normalizeError(result, "backend_clipboard_copy_failed");
      return {
        ...result,
        sessionId: sid,
        elementId: eid,
      };
    },

    async readClipboard() {
      const result = await client.read();
      if (!result?.ok) return normalizeError(result, "backend_clipboard_read_failed");
      return result;
    },

    async pasteIntoSession({ sessionId = "" } = {}) {
      const sid = resolveSessionId(sessionId);
      if (!sid) return normalizeError({}, "missing_session_id");
      const result = await client.paste({ sessionId: sid });
      if (!result?.ok) return normalizeError(result, "backend_clipboard_paste_failed");
      let refresh = null;
      if (typeof refreshAfterPaste === "function") {
        refresh = await refreshAfterPaste({
          sessionId: sid,
          pasteResult: result,
        });
      }
      return {
        ...result,
        sessionId: sid,
        refresh,
      };
    },

    async clearClipboard() {
      const result = await client.clear();
      if (!result?.ok) return normalizeError(result, "backend_clipboard_clear_failed");
      return result;
    },
  };
}

export default createBackendBpmnClipboardController;
