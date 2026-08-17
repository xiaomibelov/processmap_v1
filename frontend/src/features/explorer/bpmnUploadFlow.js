// P6 [Г]: флоу «создание сессии + upload .bpmn/.xml».
// Чистые хелперы (тестируемые): stripBpmnExtension, validateBpmnUploadFile,
// reduceUploadStage. Оркестратор createSessionWithBpmnUpload: POST create →
// POST bpmn-upload; retry после ошибки upload НЕ создаёт сессию заново
// (uploadSessionBpmnOnly перевыкладывает файл в ту же сессию).

import { apiCreateSession, apiUploadSessionBpmn } from "./explorerApi.js";

export const BPMN_UPLOAD_MAX_BYTES = 20 * 1024 * 1024; // 20 МБ (как на сервере)
export const BPMN_UPLOAD_ACCEPT = ".bpmn,.xml";
export const BPMN_UPLOAD_ALLOWED_EXTENSIONS = [".bpmn", ".xml"];

export function stripBpmnExtension(filename) {
  const name = String(filename || "").trim();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  const ext = name.slice(dot).toLowerCase();
  return BPMN_UPLOAD_ALLOWED_EXTENSIONS.includes(ext) ? name.slice(0, dot) : name;
}

export function validateBpmnUploadFile(file) {
  const name = String(file?.name || "").trim();
  const size = Number(file?.size ?? 0);
  if (!name) return { ok: false, error: "Файл не выбран." };
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  if (!BPMN_UPLOAD_ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `Недопустимый тип файла «${name}». Выберите файл .bpmn или .xml.` };
  }
  if (size > BPMN_UPLOAD_MAX_BYTES) {
    return { ok: false, error: `Файл «${name}» превышает лимит 20 МБ.` };
  }
  if (size <= 0) {
    return { ok: false, error: `Файл «${name}» пустой.` };
  }
  return { ok: true, error: "" };
}

// Transient-стадии: creating → uploading → processing → done; error — с retry.
export const UPLOAD_STAGE_LABELS = {
  creating: "Создание…",
  uploading: "Загрузка…",
  processing: "Обработка…",
  error: "Ошибка",
};

export function reduceUploadStage(state, event) {
  const current = String(state || "idle");
  switch (event) {
    case "create_start":
      return current === "idle" || current === "error" ? "creating" : current;
    case "create_ok":
      return current === "creating" ? "uploading" : current;
    case "upload_ok":
      return current === "uploading" ? "processing" : current;
    case "done":
      return "done";
    case "fail":
      return "error";
    case "reset":
      return "idle";
    default:
      return current;
  }
}

export function uploadStageLabel(stage) {
  return UPLOAD_STAGE_LABELS[String(stage || "")] || "";
}

// Оркестратор: create → upload. onStage(stage) вызывается на каждый переход.
// Возвращает { ok, sessionId, error, stage }.
export async function createSessionWithBpmnUpload({
  workspaceId,
  projectId,
  name,
  processLayer = "as_is",
  derivedFrom = "",
  file = null,
  onStage,
}) {
  const emit = (stage) => { try { onStage?.(stage); } catch { /* noop */ } };
  emit("creating");
  const resp = await apiCreateSession(workspaceId, projectId, {
    name,
    process_layer: processLayer,
    derived_from_session_id: derivedFrom,
  });
  const sessionId = String(resp?.data?.id || resp?.data?.session_id || resp?.id || resp?.session_id || "").trim();
  if (!resp?.ok || !sessionId) {
    emit("error");
    return { ok: false, sessionId: "", stage: "error", error: String(resp?.error || "Не удалось создать сессию") };
  }
  if (!file) {
    emit("done");
    return { ok: true, sessionId, stage: "done", error: "" };
  }
  return uploadSessionBpmnOnly({ sessionId, file, onStage });
}

// Retry-путь: только повторный upload в существующую сессию (без дубликата).
export async function uploadSessionBpmnOnly({ sessionId, file, onStage }) {
  const emit = (stage) => { try { onStage?.(stage); } catch { /* noop */ } };
  emit("uploading");
  const up = await apiUploadSessionBpmn(sessionId, file);
  if (!up?.ok || up?.data?.ok === false) {
    emit("error");
    const detail = up?.data?.detail || up?.error || "Не удалось загрузить файл";
    return { ok: false, sessionId: String(sessionId || ""), stage: "error", error: String(detail) };
  }
  emit("processing");
  emit("done");
  return { ok: true, sessionId: String(sessionId || ""), stage: "done", error: "" };
}
