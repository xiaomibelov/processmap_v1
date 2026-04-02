const ERROR_CLASSES = new Set([
  "payload_invalid",
  "permission_denied",
  "conflict_detected",
  "source_state_invalid",
  "activation_unsupported",
  "backend_error",
  "unknown_save_failure",
]);

function toText(value) {
  return String(value || "").trim();
}

function toStatus(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function normalizeErrorClass(value) {
  const normalized = toText(value).toLowerCase();
  return ERROR_CLASSES.has(normalized) ? normalized : "";
}

function looksLikePayloadInvalid(errorText) {
  const text = toText(errorText).toLowerCase();
  if (!text) return false;
  return (
    text.includes("savexml")
    || text.includes("serialization")
    || text.includes("serialize")
    || text.includes("parse")
    || text.includes("validation")
    || text.includes("invalid xml")
    || text.includes("invalid bpmn")
    || text.includes("некоррект")
    || text.includes("xml")
  );
}

function classifyByStatus(status) {
  const http = toStatus(status);
  if (http === 401 || http === 403) return "permission_denied";
  if (http === 409 || http === 412 || http === 423) return "conflict_detected";
  if (http === 400 || http === 422) return "payload_invalid";
  if (http >= 500) return "backend_error";
  return "";
}

export function classifyBpmnSaveFailure(raw = {}) {
  const explicitClass = normalizeErrorClass(raw?.errorClass);
  if (explicitClass) return explicitClass;

  const statusClass = classifyByStatus(raw?.status);
  if (statusClass) return statusClass;

  const code = toText(raw?.errorCode || raw?.code).toLowerCase();
  if (code.includes("permission") || code.includes("forbidden") || code === "http_403") return "permission_denied";
  if (code.includes("conflict") || code.includes("revision") || code === "http_409" || code === "http_412") return "conflict_detected";
  if (code.includes("payload") || code.includes("validation")) return "payload_invalid";
  if (code.includes("activation") || code.includes("unsupported")) return "activation_unsupported";
  if (code.includes("source_state") || code.includes("stale_source")) return "source_state_invalid";
  if (code.includes("backend") || code === "http_500" || code === "http_503") return "backend_error";

  const errorText = toText(raw?.error || raw?.message || raw?.reason).toLowerCase();
  if (
    errorText.includes("forbidden")
    || errorText.includes("permission")
    || errorText.includes("unauthorized")
    || errorText.includes("доступ")
    || errorText.includes("прав")
  ) {
    return "permission_denied";
  }
  if (
    errorText.includes("conflict")
    || errorText.includes("if-match")
    || errorText.includes("revision")
    || errorText.includes("version mismatch")
    || errorText.includes("конфликт")
  ) {
    return "conflict_detected";
  }
  if (looksLikePayloadInvalid(errorText)) return "payload_invalid";
  if (errorText.includes("activation") || errorText.includes("unsupported mode")) return "activation_unsupported";
  if (
    errorText.includes("source")
    || errorText.includes("stale")
    || errorText.includes("not_ready")
    || errorText.includes("missing session")
  ) {
    return "source_state_invalid";
  }
  if (errorText.includes("backend") || errorText.includes("server error")) return "backend_error";
  return "unknown_save_failure";
}

export function buildBpmnSaveFailureMessage(errorClass, fallbackText = "") {
  const normalized = normalizeErrorClass(errorClass) || "unknown_save_failure";
  const defaultMessage = (() => {
    if (normalized === "permission_denied") return "Нет прав на сохранение BPMN для этой сессии.";
    if (normalized === "conflict_detected") return "Конфликт версии BPMN. Обновите сессию и повторите сохранение.";
    if (normalized === "payload_invalid") return "Некорректный BPMN/XML payload: сохранение не выполнено.";
    if (normalized === "source_state_invalid") return "Состояние BPMN устарело или недействительно для сохранения.";
    if (normalized === "activation_unsupported") return "Текущий режим клиента не поддерживает сохранение BPMN перед переключением.";
    if (normalized === "backend_error") return "Backend вернул ошибку при сохранении BPMN.";
    return "Не удалось сохранить BPMN перед переключением вкладки.";
  })();
  const fallback = toText(fallbackText);
  if (!fallback) return defaultMessage;
  if (fallback === defaultMessage) return defaultMessage;
  if (fallback.toLowerCase().includes(defaultMessage.toLowerCase())) return fallback;
  return `${defaultMessage} (${fallback})`;
}

function diagnosticsSeverityByClass(errorClass) {
  if (errorClass === "permission_denied" || errorClass === "backend_error" || errorClass === "activation_unsupported") {
    return "high";
  }
  if (errorClass === "payload_invalid" || errorClass === "conflict_detected" || errorClass === "source_state_invalid") {
    return "medium";
  }
  return "medium";
}

function classifyRetryability(errorClass) {
  if (errorClass === "permission_denied" || errorClass === "activation_unsupported") {
    return { canRetry: false, canLeaveUnsafely: true };
  }
  if (errorClass === "payload_invalid") {
    return { canRetry: true, canLeaveUnsafely: true };
  }
  if (errorClass === "conflict_detected" || errorClass === "source_state_invalid") {
    return { canRetry: true, canLeaveUnsafely: false };
  }
  if (errorClass === "backend_error") {
    return { canRetry: true, canLeaveUnsafely: false };
  }
  return { canRetry: true, canLeaveUnsafely: false };
}

export function buildBpmnSaveFailureDiagnostics(raw = {}, context = {}) {
  const status = toStatus(raw?.status || context?.status || 0);
  const errorClass = classifyBpmnSaveFailure({
    ...raw,
    status,
  });
  const errorCode = toText(
    raw?.errorCode
      || raw?.code
      || context?.errorCode
      || (status > 0 ? `http_${status}` : "save_failed"),
  );
  const errorText = toText(raw?.error || raw?.message || raw?.reason || context?.error || "");
  const userMessage = buildBpmnSaveFailureMessage(errorClass, errorText);
  const retry = classifyRetryability(errorClass);
  return {
    saveAttemptKind: toText(context?.saveAttemptKind || raw?.saveAttemptKind || "manual"),
    activeBpmnSource: toText(context?.activeBpmnSource || raw?.activeBpmnSource || raw?.source || "unknown"),
    sourceReason: toText(context?.sourceReason || raw?.sourceReason || ""),
    sessionId: toText(context?.sessionId || raw?.sessionId || ""),
    projectId: toText(context?.projectId || raw?.projectId || ""),
    requestBaseRev: Number(context?.requestBaseRev ?? raw?.requestBaseRev ?? 0) || 0,
    storedRev: Number(context?.storedRev ?? raw?.storedRev ?? 0) || 0,
    payloadHash: toText(context?.payloadHash || raw?.payloadHash || ""),
    errorClass,
    errorCode,
    status,
    diagnosticsSeverity: diagnosticsSeverityByClass(errorClass),
    canRetry: retry.canRetry,
    canLeaveUnsafely: retry.canLeaveUnsafely,
    error: errorText,
    userMessage,
  };
}
