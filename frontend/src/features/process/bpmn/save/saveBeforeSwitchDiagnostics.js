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
  if (code === "bpmn_serialize_failed") return "payload_invalid";
  if (code === "http_409" || code === "http_412") return "conflict_detected";
  if (code === "http_422" || code === "http_400") return "payload_invalid";
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

const USER_SAFE_SAVE_MESSAGES = {
  permission_denied: "Нет прав на сохранение этой сессии. Попросите доступ у владельца.",
  conflict_detected: "Версия сессии изменилась. Мы синхронизируем изменения автоматически; если синхронизация не поможет — сохраним полностью.",
  payload_invalid: "Схема диаграммы не прошла проверку. Попробуйте отменить последнее действие или перезагрузите страницу.",
  source_state_invalid: "Состояние диаграммы устарело. Попробуйте сохранить ещё раз.",
  activation_unsupported: "Текущий режим редактора не поддерживает сохранение. Перезагрузите страницу.",
  backend_error: "Сервер не смог сохранить изменения. Попробуйте ещё раз через несколько секунд.",
  unknown_save_failure: "Не удалось сохранить изменения. Попробуйте ещё раз; если не поможет — перезагрузите страницу.",
};

export function buildBpmnSaveFailureMessage(errorClass, fallbackText = "") {
  const normalized = normalizeErrorClass(errorClass) || "unknown_save_failure";
  return USER_SAFE_SAVE_MESSAGES[normalized] || USER_SAFE_SAVE_MESSAGES.unknown_save_failure;
}

const USER_VISIBLE_ERROR_CODES = new Set([
  "bpmn_serialize_failed",
  "save_failed",
  "http_409",
  "http_422",
]);

export function sanitizeUserErrorText(raw) {
  const text = toText(raw);
  return USER_VISIBLE_ERROR_CODES.has(text) ? text : "";
}

function hasSerializableModdleDescriptor(value) {
  return !!value && typeof value === "object" && !!value.$descriptor;
}

export function stripUnsupportedTemplateValues(inst) {
  const registry = inst?.get?.("elementRegistry");
  const elements = typeof registry?.getAll === "function" ? registry.getAll() : [];
  let removed = 0;
  for (const element of elements) {
    const bo = element?.businessObject;
    if (!bo || typeof bo !== "object") continue;
    for (const key of Object.keys(bo)) {
      if (key.startsWith("$")) continue;
      const value = bo[key];
      const isArrayOfModdle = Array.isArray(value) && value.some((item) => item && typeof item === "object" && "$type" in item);
      const isSingleModdle = value && typeof value === "object" && !Array.isArray(value) && "$type" in value;
      if (!isArrayOfModdle && !isSingleModdle) continue;
      const invalidSingle = isSingleModdle && !hasSerializableModdleDescriptor(value);
      const invalidArray = isArrayOfModdle && value.some((item) => item && typeof item === "object" && "$type" in item && !hasSerializableModdleDescriptor(item));
      if (!invalidSingle && !invalidArray) continue;
      try {
        if (typeof bo.set === "function") bo.set(key, Array.isArray(value) ? value.filter((item) => hasSerializableModdleDescriptor(item)) : null);
        else bo[key] = Array.isArray(value) ? value.filter((item) => hasSerializableModdleDescriptor(item)) : null;
        removed += 1;
      } catch {
        // Keep element usable; save wrapper will report failure if serialization still breaks.
      }
    }
  }
  if (removed > 0) {
    try {
      console.warn(`[bpmn-save] stripped ${removed} unsupported template value(s) before serialization`);
    } catch {
      // logging must never break the save path
    }
  }
  return Promise.resolve(removed);
}

function looksLikeValidXml(xml) {
  const text = toText(xml).trim();
  if (!text) return false;
  if (typeof DOMParser === "undefined") return true;
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    return !doc?.getElementsByTagName?.("parsererror")?.length;
  } catch {
    return false;
  }
}

const TEMPLATE_STRIPPED_FLAG = "__pmTemplateDataStripped";

export async function saveXmlSafely(inst, options = {}) {
  try {
    const result = await inst.saveXML(options);
    const xml = result?.xml || "";
    if (inst?.[TEMPLATE_STRIPPED_FLAG]) {
      // Strip already mutated the model earlier; surface the explicit warning
      // exactly once on the first subsequent successful save (no silent strip).
      delete inst[TEMPLATE_STRIPPED_FLAG];
      return { ok: true, xml, recovered: true };
    }
    return { ok: true, xml };
  } catch (firstError) {
    try {
      const removed = await stripUnsupportedTemplateValues(inst);
      if (removed > 0 && inst && typeof inst === "object") {
        inst[TEMPLATE_STRIPPED_FLAG] = true;
      }
      const result = await inst.saveXML(options);
      const xml = result?.xml || "";
      if (!looksLikeValidXml(xml)) {
        throw new Error("serialization produced invalid XML after strip");
      }
      delete inst?.[TEMPLATE_STRIPPED_FLAG];
      return { ok: true, xml, recovered: true };
    } catch (secondError) {
      return {
        ok: false,
        errorCode: "bpmn_serialize_failed",
        diagnostics: {
          firstError: String(firstError?.message || firstError),
          secondError: String(secondError?.message || secondError),
        },
      };
    }
  }
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
