function toText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  return {
    event,
    stage,
    at: toNumber(value.at, Date.now()),
    reason: toText(payload.reason || value.reason),
    sessionId: toText(payload.sid || value.sessionId),
    rev: toNumber(payload.rev || value.rev, 0),
    status: toNumber(payload.status || value.status, 0),
    xmlBytes: Math.max(0, toNumber(payload.xml_len || value.xmlBytes, 0)),
    error: toText(payload.error || value.error),
  };
}

export function buildSaveUploadStatusBadge(raw = null) {
  const event = raw && typeof raw === "object" ? raw : {};
  const stage = toText(event.stage).toLowerCase();
  const sizeText = formatPayloadSize(event.xmlBytes);
  if (!stage || stage === "idle") {
    return {
      visible: false,
      tone: "",
      label: "",
      title: "",
    };
  }
  if (stage === "preparing") {
    return {
      visible: true,
      tone: "warn",
      label: "BPMN: подготовка сохранения",
      title: "Подготовка BPMN перед отправкой на backend.",
    };
  }
  if (stage === "uploading") {
    return {
      visible: true,
      tone: "warn",
      label: sizeText ? `BPMN: загрузка ${sizeText}` : "BPMN: загрузка",
      title: "Выполняется отправка BPMN на backend.",
    };
  }
  if (stage === "persisted") {
    return {
      visible: true,
      tone: "ok",
      label: sizeText ? `BPMN: сохранено (${sizeText})` : "BPMN: сохранено",
      title: "Backend подтвердил сохранение BPMN.",
    };
  }
  if (stage === "skipped_unchanged") {
    return {
      visible: true,
      tone: "ok",
      label: "BPMN: без изменений, повторная отправка не требуется",
      title: "Сохранение не отправлялось, потому что XML не изменился.",
    };
  }
  if (stage === "failed") {
    const status = toNumber(event.status, 0);
    return {
      visible: true,
      tone: "err",
      label: status > 0 ? `BPMN: ошибка сохранения (HTTP ${status})` : "BPMN: ошибка сохранения",
      title: toText(event.error) || "Backend не подтвердил сохранение BPMN.",
    };
  }
  return {
    visible: false,
    tone: "",
    label: "",
    title: "",
  };
}
