import {
  normalizeDocumentationRows as sharedNormalizeDocumentationRows,
} from "../../features/process/bpmn/documentation/normalizeDocumentationRows.js";
import {
  normalizePathTier,
  normalizePathSequenceKey,
} from "../../features/process/pathClassification.js";

/**
 * Local-storage / row key used to toggle the properties section visibility.
 * @type {string}
 */
export const SHOW_PROPERTIES_FLAG_KEY = "fpc-show-properties";

/**
 * Coerce a value to a trimmed string.
 * @param {unknown} value
 * @returns {string}
 */
export function toText(value) {
  return String(value || "").trim();
}

/**
 * Alias for {@link toText}.
 * @param {unknown} value
 * @returns {string}
 */
export const str = toText;

/**
 * Return the value if it is an array, otherwise an empty array.
 * @param {unknown} value
 * @returns {Array}
 */
export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Clamp inline text to a maximum length, collapsing whitespace and adding an ellipsis.
 * @param {unknown} value
 * @param {number} [limit=120]
 * @returns {string}
 */
export function clampInlineValue(value, limit = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(18, limit - 1)).trimEnd()}…`;
}

/**
 * BPMN types that behave like tasks in the element settings sidebar.
 * @type {Set<string>}
 */
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

/**
 * Check whether a BPMN type is task-like.
 * @param {unknown} typeRaw
 * @returns {boolean}
 */
export function isTaskLikeBpmnType(typeRaw) {
  return TASK_LIKE_BPMN_TYPES.has(String(typeRaw || "").trim());
}

/**
 * Map a Camunda I/O connector shape to a short label.
 * @param {unknown} shapeRaw
 * @returns {string}
 */
export function camundaIoTypeLabel(shapeRaw) {
  const shape = String(shapeRaw || "text").toLowerCase();
  if (shape === "expression") return "expr";
  if (shape === "empty") return "empty";
  if (shape === "script") return "script";
  if (shape === "nested") return "nested";
  if (shape === "mapping") return "map";
  return "text";
}

/**
 * Preset labels for node-path sequence variants.
 * @type {Array<{key: string, label: string}>}
 */
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

/**
 * Normalize a node-path tier/tag value.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeNodePathTag(value) {
  return normalizePathTier(value);
}

/**
 * Normalize a sequence-key value.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSequenceKey(value) {
  return normalizePathSequenceKey(value);
}

/**
 * Format a sequence key as a human-readable label.
 * @param {unknown} value
 * @returns {string}
 */
export function formatSequenceLabel(value) {
  const normalized = normalizeSequenceKey(value);
  if (!normalized) return "Не выбрано";
  return NODE_PATH_SEQUENCE_PRESETS.find((preset) => preset.key === normalized)?.label || value;
}

/**
 * Normalize documentation rows, ensuring every row has a stable id.
 * @param {unknown} rowsRaw
 * @param {Object} [options]
 * @returns {Array}
 */
export function normalizeDocumentationRows(rowsRaw, options = {}) {
  // Shared implementation; draft rows always carry a stable id
  // (fallback documentation_<index+1>).
  return sharedNormalizeDocumentationRows(rowsRaw, { ...(options || {}), withId: true });
}

/**
 * Check whether a property row is the show-properties visibility flag.
 * @param {Object} row
 * @returns {boolean}
 */
export function isShowPropertiesFlagRow(row) {
  return String(row?.name || "").trim().toLowerCase() === SHOW_PROPERTIES_FLAG_KEY;
}

/**
 * Build a cache key for local Camunda property drafts.
 * @param {unknown} sessionIdRaw
 * @param {unknown} elementIdRaw
 * @returns {string}
 */
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

/**
 * Build the localStorage key for the display mode captured before V2.
 * @param {unknown} sessionId
 * @returns {string}
 */
export function displayModeBeforeV2StorageKey(sessionId) {
  const sid = str(sessionId);
  return sid ? `${DISPLAY_MODE_BEFORE_V2_KEY_PREFIX}${sid}` : "";
}

/**
 * Read the pre-V2 display mode from localStorage.
 * @param {unknown} sessionId
 * @returns {string | null}
 */
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

/**
 * Write the pre-V2 display mode to localStorage.
 * @param {unknown} sessionId
 * @param {unknown} mode
 * @returns {void}
 */
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
