function toText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseObjectJson(raw) {
  const text = toText(raw);
  if (!text) return {};
  try {
    return asObject(JSON.parse(text));
  } catch {
    return {};
  }
}

function normalizeConflictPayload(raw = null) {
  const value = asObject(raw);
  const code = toText(value.code).toUpperCase();
  const sessionId = toText(value.session_id || value.sessionId);
  const clientBaseVersion = toNumber(value.client_base_version ?? value.clientBaseVersion, 0);
  const serverCurrentVersion = toNumber(value.server_current_version ?? value.serverCurrentVersion, 0);
  const lastWrite = asObject(value.server_last_write || value.serverLastWrite);
  const actorLabel = toText(lastWrite.actor_label || lastWrite.actorLabel || lastWrite.actor_user_id || lastWrite.actorUserId);
  const at = toNumber(lastWrite.at, 0);
  const changedKeys = asArray(lastWrite.changed_keys || lastWrite.changedKeys)
    .map((item) => toText(item))
    .filter(Boolean);
  if (!code && !serverCurrentVersion && !clientBaseVersion) return null;
  return {
    code,
    sessionId,
    clientBaseVersion,
    serverCurrentVersion,
    actorLabel,
    at,
    changedKeys,
  };
}

function resolveConflictPayload({ status = 0, errorCode = "", errorDetails = null, errorRaw = null } = {}) {
  const detailsPayload = normalizeConflictPayload(errorDetails);
  if (detailsPayload) return detailsPayload;

  const rawObject = asObject(errorRaw);
  const fromRawDetail = normalizeConflictPayload(rawObject.detail);
  if (fromRawDetail) return fromRawDetail;
  const fromRaw = normalizeConflictPayload(rawObject);
  if (fromRaw) return fromRaw;

  const parsedRaw = parseObjectJson(errorRaw);
  const fromParsedDetail = normalizeConflictPayload(parsedRaw.detail);
  if (fromParsedDetail) return fromParsedDetail;
  const fromParsed = normalizeConflictPayload(parsedRaw);
  if (fromParsed) return fromParsed;

  const code = toText(errorCode).toUpperCase();
  if (Number(status || 0) === 409 || code === "HTTP_409" || code.includes("CONFLICT")) {
    return {
      code: code || "DIAGRAM_STATE_CONFLICT",
      sessionId: "",
      clientBaseVersion: 0,
      serverCurrentVersion: 0,
      actorLabel: "",
      at: 0,
      changedKeys: [],
    };
  }
  return null;
}

function formatConflictMoment(epochSeconds = 0) {
  const ts = toNumber(epochSeconds, 0);
  if (ts <= 0) return "";
  try {
    return new Date(ts * 1000).toLocaleString("ru-RU");
  } catch {
    return "";
  }
}

function formatErrorText(errorRaw = null, fallback = "") {
  if (typeof errorRaw === "string") {
    const text = toText(errorRaw);
    if (text && text !== "[object Object]") return text;
  }
  if (typeof errorRaw === "number" || typeof errorRaw === "boolean") {
    return toText(errorRaw);
  }
  const rawObject = asObject(errorRaw);
  const detail = rawObject.detail;
  if (typeof detail === "string" && toText(detail)) return toText(detail);
  const detailObject = asObject(detail);
  const fromDetailObject = toText(
    detailObject.message
    || detailObject.error
    || detailObject.reason
    || detailObject.code,
  );
  if (fromDetailObject) return fromDetailObject;
  const fromObject = toText(rawObject.message || rawObject.error || rawObject.reason || rawObject.code);
  if (fromObject) return fromObject;
  const parsed = parseObjectJson(errorRaw);
  if (Object.keys(parsed).length) {
    return formatErrorText(parsed, fallback);
  }
  return toText(fallback);
}

function buildConflictTitle(conflict = null, fallbackText = "") {
  const details = conflict && typeof conflict === "object" ? conflict : null;
  const lines = [];
  if (!details) {
    return toText(fallbackText) || "Конфликт версии BPMN. Обновите сессию.";
  }
  lines.push("Сервер отклонил сохранение: версия сессии изменилась.");
  if (details.serverCurrentVersion > 0 || details.clientBaseVersion > 0) {
    lines.push(`Серверная версия: ${details.serverCurrentVersion || "?"}. Ваша базовая: ${details.clientBaseVersion || "?"}.`);
  }
  const actor = toText(details.actorLabel);
  const atText = formatConflictMoment(details.at);
  if (actor || atText) {
    lines.push(`Последнее изменение: ${actor || "неизвестный пользователь"}${atText ? `, ${atText}` : ""}.`);
  }
  if (details.changedKeys.length) {
    lines.push(`Изменённые поля: ${details.changedKeys.join(", ")}.`);
  }
  if (toText(fallbackText) && toText(fallbackText) !== "[object Object]") {
    lines.push(`Детали: ${toText(fallbackText)}.`);
  }
  return lines.join(" ");
}

function resolveSaveState(stage = "") {
  const normalized = toText(stage).toLowerCase();
  if (normalized === "preparing" || normalized === "uploading") return "saving";
  if (normalized === "persisted" || normalized === "skipped_unchanged") return "saved";
  if (normalized === "conflict") return "conflict";
  if (normalized === "failed") return "save_failed";
  return "saved";
}

function formatPayloadSize(bytesRaw = 0) {
  const bytes = Math.max(0, toNumber(bytesRaw, 0));
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeBpmnSaveLifecycleEvent(raw = null) {
  const value = raw && typeof raw === "object" ? raw : {};
  const payload = value.payload && typeof value.payload === "object" ? value.payload : {};
  const event = toText(value.event || payload.event).toUpperCase();
  let stage = "idle";
  if (event === "SAVE_REQUESTED" || event === "SAVE_EXECUTED") stage = "preparing";
  if (event === "SAVE_PERSIST_STARTED") stage = "uploading";
  if (event === "SAVE_PERSIST_DONE") stage = "persisted";
  if (event === "SAVE_PERSIST_FAIL") stage = "failed";
  if (event === "SAVE_PERSIST_SKIPPED_UNCHANGED") stage = "skipped_unchanged";
  const status = toNumber(payload.status ?? value.status, 0);
  const errorCode = toText(payload.error_code || value.errorCode || payload.code || value.code);
  const errorRaw = (
    payload.error !== undefined
      ? payload.error
      : value.error
  );
  const explicitErrorDetails = (
    payload.error_details !== undefined
      ? payload.error_details
      : (value.errorDetails ?? value.error_details)
  );
  const errorDetails = asObject(explicitErrorDetails);
  const conflict = resolveConflictPayload({
    status,
    errorCode,
    errorDetails,
    errorRaw,
  });
  const errorText = formatErrorText(errorRaw, toText(payload.error || value.error));
  if (stage === "failed" && conflict) stage = "conflict";
  return {
    event,
    stage,
    state: resolveSaveState(stage),
    at: toNumber(value.at, Date.now()),
    reason: toText(payload.reason || value.reason),
    sessionId: toText(payload.sid || value.sessionId),
    rev: toNumber(payload.rev || value.rev, 0),
    status,
    xmlBytes: Math.max(0, toNumber(payload.xml_len || value.xmlBytes, 0)),
    errorCode,
    error: errorText,
    errorDetails: Object.keys(errorDetails).length ? errorDetails : null,
    conflict,
  };
}

export function buildSaveUploadStatusBadge(raw = null) {
  const event = raw && typeof raw === "object" ? raw : {};
  const stage = toText(event.stage).toLowerCase();
  const state = resolveSaveState(stage);
  const sizeText = formatPayloadSize(event.xmlBytes);
  if (!stage || stage === "idle") {
    return {
      visible: false,
      tone: "",
      label: "",
      title: "",
      state: "saved",
      conflict: null,
    };
  }
  if (stage === "preparing") {
    return {
      visible: true,
      tone: "warn",
      label: "BPMN: подготовка сохранения",
      title: "Подготовка BPMN перед отправкой на backend.",
      state,
      conflict: null,
    };
  }
  if (stage === "uploading") {
    return {
      visible: true,
      tone: "warn",
      label: sizeText ? `BPMN: загрузка ${sizeText}` : "BPMN: загрузка",
      title: "Выполняется отправка BPMN на backend.",
      state,
      conflict: null,
    };
  }
  if (stage === "persisted") {
    return {
      visible: true,
      tone: "ok",
      label: sizeText ? `BPMN: сохранено (${sizeText})` : "BPMN: сохранено",
      title: "Backend подтвердил сохранение BPMN.",
      state,
      conflict: null,
    };
  }
  if (stage === "skipped_unchanged") {
    return {
      visible: true,
      tone: "ok",
      label: "BPMN: без изменений, повторная отправка не требуется",
      title: "Сохранение не отправлялось, потому что XML не изменился.",
      state,
      conflict: null,
    };
  }
  if (stage === "conflict") {
    const status = toNumber(event.status, 0);
    const conflict = event?.conflict && typeof event.conflict === "object"
      ? event.conflict
      : resolveConflictPayload({
        status,
        errorCode: toText(event.errorCode),
        errorDetails: asObject(event.errorDetails),
        errorRaw: event.error,
      });
    return {
      visible: true,
      tone: "err",
      label: status > 0 ? `BPMN: конфликт сохранения (HTTP ${status})` : "BPMN: конфликт сохранения",
      title: buildConflictTitle(conflict, toText(event.error)),
      state,
      conflict,
    };
  }
  if (stage === "failed") {
    const status = toNumber(event.status, 0);
    return {
      visible: true,
      tone: "err",
      label: status > 0 ? `BPMN: ошибка сохранения (HTTP ${status})` : "BPMN: ошибка сохранения",
      title: toText(event.error) || "Backend не подтвердил сохранение BPMN.",
      state,
      conflict: null,
    };
  }
  return {
    visible: false,
    tone: "",
    label: "",
    title: "",
    state,
    conflict: null,
  };
}
