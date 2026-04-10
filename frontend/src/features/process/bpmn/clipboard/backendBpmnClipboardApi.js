import { apiRequest, okOrError } from "../../../../lib/apiCore.js";
import { apiRoutes } from "../../../../lib/apiRoutes.js";

function toText(value) {
  return String(value || "").trim();
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
  if (isObject(value)) {
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

function normalizeClipboardError(resultRaw, fallback = "backend_clipboard_failed") {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const data = isObject(result.data) ? result.data : null;
  const detail = data?.detail;
  const code = isObject(detail) ? detail.code : data?.code;
  const resultError = toText(result.error);
  const raw = detail
    || data?.error
    || data?.message
    || (resultError === "[object Object]" ? "" : result.error)
    || result.error_message
    || result.message;
  const described = describeErrorValue(raw) || describeErrorValue(code) || fallback;
  return {
    ...result,
    ok: false,
    status: Number(result.status || 0),
    error: described,
    errorCode: toText(code || data?.error_code || result.errorCode || result.code),
  };
}

function normalizeOkResult(resultRaw, fallback = {}) {
  const result = okOrError(resultRaw);
  if (!result?.ok) return normalizeClipboardError(result, "backend_clipboard_failed");
  const data = result.data && typeof result.data === "object" ? result.data : {};
  return {
    ok: true,
    status: Number(result.status || 200),
    ...fallback,
    ...data,
  };
}

export async function copyBackendBpmnClipboard({ sessionId = "", elementId = "" } = {}) {
  const sid = toText(sessionId);
  const eid = toText(elementId);
  if (!sid) return { ok: false, status: 0, error: "missing_session_id" };
  if (!eid) return { ok: false, status: 0, error: "missing_element_id" };
  return normalizeOkResult(await apiRequest(apiRoutes.clipboard.bpmnCopy(), {
    method: "POST",
    body: {
      session_id: sid,
      element_id: eid,
    },
  }));
}

export async function readBackendBpmnClipboard() {
  return normalizeOkResult(await apiRequest(apiRoutes.clipboard.bpmn(), {
    method: "GET",
  }), { empty: true, item: null });
}

export async function pasteBackendBpmnClipboard({ sessionId = "" } = {}) {
  const sid = toText(sessionId);
  if (!sid) return { ok: false, status: 0, error: "missing_session_id" };
  return normalizeOkResult(await apiRequest(apiRoutes.clipboard.bpmnPaste(), {
    method: "POST",
    body: {
      session_id: sid,
    },
  }));
}

export async function clearBackendBpmnClipboard() {
  return normalizeOkResult(await apiRequest(apiRoutes.clipboard.bpmn(), {
    method: "DELETE",
  }));
}

export default {
  copy: copyBackendBpmnClipboard,
  read: readBackendBpmnClipboard,
  paste: pasteBackendBpmnClipboard,
  clear: clearBackendBpmnClipboard,
};
