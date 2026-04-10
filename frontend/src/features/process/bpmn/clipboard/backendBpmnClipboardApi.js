import { apiRequest, okOrError } from "../../../../lib/apiCore.js";
import { apiRoutes } from "../../../../lib/apiRoutes.js";

function toText(value) {
  return String(value || "").trim();
}

function normalizeOkResult(resultRaw, fallback = {}) {
  const result = okOrError(resultRaw);
  if (!result?.ok) return result;
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
