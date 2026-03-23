function toText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
  if (!stage || stage === "idle") {
    return {
      visible: false,
      tone: "",
      label: "",
      title: "",
    };
  }
  if (stage === "failed") {
    const status = toNumber(event.status, 0);
    return {
      visible: true,
      tone: "err",
      label: "Ошибка сохранения BPMN",
      title: toText(event.error) || "Backend не подтвердил сохранение BPMN.",
      ...(status > 0 ? { code: `HTTP ${status}` } : {}),
    };
  }
  return {
    visible: false,
    tone: "",
    label: "",
    title: "",
  };
}
