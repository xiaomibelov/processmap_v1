import { fnv1aHex } from "../../../../../lib/apiCore.js";

/**
 * Lightweight shallow hash of a plain object.
 * Returns a stable string that changes only when top-level keys or array lengths change.
 * Does NOT deep-equal nested objects; use for coarse-grained versioning only.
 */
function shallowObjectVersionKey(obj) {
  if (!obj || typeof obj !== "object") return "";
  const keys = Object.keys(obj);
  if (keys.length === 0) return "empty";
  keys.sort((a, b) => a.localeCompare(b, "en"));
  const parts = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const v = obj[k];
    if (v === null || v === undefined) {
      parts.push(`${k}:_`);
    } else if (typeof v === "boolean") {
      parts.push(`${k}:${v ? 1 : 0}`);
    } else if (typeof v === "number") {
      parts.push(`${k}:${v}`);
    } else if (typeof v === "string") {
      parts.push(`${k}:${v.length}`);
    } else if (Array.isArray(v)) {
      parts.push(`${k}:[${v.length}]`);
    } else {
      parts.push(`${k}:{${Object.keys(v).length}}`);
    }
  }
  return fnv1aHex(parts.join("|")).slice(0, 16);
}

/**
 * Build a stable version key for bpmn_meta.
 * Prefers existing version/fingerprint fields; falls back to shallow hash.
 */
export function buildBpmnMetaVersionKey(bpmnMeta) {
  if (!bpmnMeta || typeof bpmnMeta !== "object") return "";
  const meta = bpmnMeta;
  // Prefer explicit version fields when present
  const explicit =
    meta.bpmn_graph_fingerprint
    || meta.bpmn_meta_version
    || meta.version
    || meta.updated_at
    || meta.updatedAt;
  if (explicit != null) return String(explicit);
  return shallowObjectVersionKey(meta);
}

/**
 * Build a stable version key for the interview object.
 */
export function buildInterviewVersionKey(interview) {
  if (!interview || typeof interview !== "object") return "";
  const steps = Array.isArray(interview.steps) ? interview.steps : [];
  const analysisKeys = Object.keys(interview.analysis || {}).length;
  const notesKeys = Object.keys(interview.notes_by_element || interview.notesByElementId || {}).length;
  const aiQuestionsKeys = Object.keys(interview.ai_questions_by_element || interview.aiQuestionsByElementId || {}).length;
  return `${steps.length}:${analysisKeys}:${notesKeys}:${aiQuestionsKeys}`;
}

/**
 * Build a stable version key for nodes array.
 */
export function buildNodesVersionKey(nodes) {
  const arr = Array.isArray(nodes) ? nodes : [];
  if (arr.length === 0) return "0";
  return `${arr.length}:${fnv1aHex(String(arr[0]?.id || "")).slice(0, 8)}:${fnv1aHex(String(arr[arr.length - 1]?.id || "")).slice(0, 8)}`;
}

/**
 * Build a stable version key for notes map.
 */
export function buildNotesVersionKey(notesMap) {
  if (!notesMap || typeof notesMap !== "object") return "";
  const keys = Object.keys(notesMap);
  if (keys.length === 0) return "0";
  keys.sort((a, b) => a.localeCompare(b, "en"));
  const totalItems = keys.reduce((sum, k) => {
    const entry = notesMap[k];
    return sum + (Array.isArray(entry?.items) ? entry.items.length : 0);
  }, 0);
  return `${keys.length}:${totalItems}`;
}

/**
 * Build a stable version key for hybrid layer map.
 */
export function buildHybridLayerVersionKey(hybridLayerMap) {
  if (!hybridLayerMap || typeof hybridLayerMap !== "object") return "";
  const keys = Object.keys(hybridLayerMap);
  return String(keys.length);
}

/**
 * Composite source key for the entire diagram derived model.
 * Uses only primitive values so it is safe as a useMemo dependency.
 */
export function buildDiagramSourceKey({
  sessionId,
  bpmnXmlVersion,
  diagramStateVersion,
  bpmnMetaVersion,
  nodesVersion,
  interviewVersion,
  notesVersion,
  hybridLayerVersion,
  overlaySettingsFlags,
}) {
  const parts = [
    `sid=${String(sessionId || "")}`,
    `xmlv=${Number(bpmnXmlVersion || 0)}`,
    `dsv=${Number(diagramStateVersion || 0)}`,
    `bmv=${String(bpmnMetaVersion || "")}`,
    `nv=${String(nodesVersion || "")}`,
    `iv=${String(interviewVersion || "")}`,
    `ntv=${String(notesVersion || "")}`,
    `hlv=${String(hybridLayerVersion || "")}`,
    `flags=${String(overlaySettingsFlags || "")}`,
  ];
  return parts.join("|");
}
