import {
  normalizeDocumentationRows as sharedNormalizeDocumentationRows,
} from "../../features/process/bpmn/documentation/normalizeDocumentationRows.js";
import {
  normalizePathTier,
  normalizePathSequenceKey,
} from "../../features/process/pathClassification.js";
export const SHOW_PROPERTIES_FLAG_KEY = "fpc-show-properties";

export function toText(value) {
  return String(value || "").trim();
}

export const str = toText;

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function clampInlineValue(value, limit = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(18, limit - 1)).trimEnd()}…`;
}

export const TASK_LIKE_BPMN_TYPES = new Set([
  "bpmn:Task",
  "bpmn:UserTask",
  "bpmn:ServiceTask",
  "bpmn:SendTask",
  "bpmn:ReceiveTask",
  "bpmn:ManualTask",
  "bpmn:BusinessRuleTask",
  "bpmn:ScriptTask",
  "bpmn:CallActivity",
]);

export function isTaskLikeBpmnType(typeRaw) {
  return TASK_LIKE_BPMN_TYPES.has(String(typeRaw || "").trim());
}

export function camundaIoTypeLabel(shapeRaw) {
  const shape = String(shapeRaw || "text").toLowerCase();
  if (shape === "expression") return "expr";
  if (shape === "empty") return "empty";
  if (shape === "script") return "script";
  if (shape === "nested") return "nested";
  if (shape === "mapping") return "map";
  return "text";
}

export const NODE_PATH_SEQUENCE_PRESETS = [
  { key: "primary", label: "Основной" },
  { key: "primary_alt_2", label: "Основной 2" },
  { key: "primary_alt_3", label: "Основной 3" },
  { key: "mitigated_1", label: "Смягчённый 1" },
  { key: "mitigated_2", label: "Смягчённый 2" },
  { key: "mitigated_3", label: "Смягчённый 3" },
  { key: "fail_1", label: "Сбой 1" },
  { key: "fail_2", label: "Сбой 2" },
  { key: "fail_3", label: "Сбой 3" },
];

export function normalizeNodePathTag(value) {
  return normalizePathTier(value);
}

export function normalizeSequenceKey(value) {
  return normalizePathSequenceKey(value);
}

export function formatSequenceLabel(value) {
  const normalized = normalizeSequenceKey(value);
  if (!normalized) return "Не выбрано";
  return NODE_PATH_SEQUENCE_PRESETS.find((preset) => preset.key === normalized)?.label || value;
}

export function normalizeDocumentationRows(rowsRaw, options = {}) {
  // Shared implementation; draft rows always carry a stable id
  // (fallback documentation_<index+1>).
  return sharedNormalizeDocumentationRows(rowsRaw, { ...(options || {}), withId: true });
}

export function isShowPropertiesFlagRow(row) {
  return String(row?.name || "").trim().toLowerCase() === SHOW_PROPERTIES_FLAG_KEY;
}

export function buildCamundaPropertiesDraftKey(sessionIdRaw, elementIdRaw) {
  const sessionId = str(sessionIdRaw);
  const elementId = str(elementIdRaw);
  if (!sessionId || !elementId) return "";
  return `${sessionId}:${elementId}:camunda-properties`;
}

// V2 → display mode coupling (B3): the mode captured before V2 was enabled
// is persisted per session (same namespacing style as the showAlways flag in
// App.jsx: `fpc_*_v1:{sid}`) so turning V2 off restores the user's choice.
const DISPLAY_MODE_BEFORE_V2_KEY_PREFIX = "fpc_display_mode_before_v2_v1:";

export function displayModeBeforeV2StorageKey(sessionId) {
  const sid = str(sessionId);
  return sid ? `${DISPLAY_MODE_BEFORE_V2_KEY_PREFIX}${sid}` : "";
}

export function readDisplayModeBeforeV2(sessionId) {
  if (typeof window === "undefined") return null;
  const key = displayModeBeforeV2StorageKey(sessionId);
  if (!key) return null;
  try {
    const raw = str(window.localStorage?.getItem(key));
    return raw || null;
  } catch {
    return null;
  }
}

export function writeDisplayModeBeforeV2(sessionId, mode) {
  if (typeof window === "undefined") return;
  const key = displayModeBeforeV2StorageKey(sessionId);
  if (!key) return;
  try {
    window.localStorage?.setItem(key, str(mode));
  } catch {
    // no-op
  }
}
