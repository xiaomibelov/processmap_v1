/**
 * Pure / top-level runtime helpers extracted from BpmnStage.jsx.
 * No React hooks, no component state/refs, only browser globals.
 */

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function getOverlayMeasurementContainer() {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("__fpc_overlay_measurer__");
  if (!el) {
    el = document.createElement("div");
    el.id = "__fpc_overlay_measurer__";
    el.style.position = "absolute";
    el.style.visibility = "hidden";
    el.style.pointerEvents = "none";
    el.style.top = "-9999px";
    el.style.left = "-9999px";
    if (!document.body) return null;
    document.body.appendChild(el);
  }
  return el;
}

function toText(v) {
  return String(v || "").trim();
}

function publishE2ESaveProbe(patch = {}) {
  if (typeof window === "undefined" || window.__FPC_E2E__ !== true) return;
  const prev = asObject(window.__FPC_E2E_LAST_SAVE_PROBE__);
  window.__FPC_E2E_LAST_SAVE_PROBE__ = {
    ...prev,
    ...asObject(patch),
  };
}

function cloneJsonValue(value) {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function isEditableKeyTarget(target) {
  const tag = String(target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return String(target?.getAttribute?.("contenteditable") || "").toLowerCase() === "true";
}

function readStepTimeMinutes(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node.parameters);
  const candidates = [
    node.step_time_min,
    node.stepTimeMin,
    node.duration_min,
    node.durationMin,
    params.step_time_min,
    params.stepTimeMin,
    params.duration_min,
    params.durationMin,
    params.duration,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  return null;
}

function readStepTimeSeconds(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node.parameters);
  const candidates = [
    node.step_time_sec,
    node.stepTimeSec,
    node.duration_sec,
    node.durationSec,
    params.step_time_sec,
    params.stepTimeSec,
    params.duration_sec,
    params.durationSec,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  const minutes = readStepTimeMinutes(node);
  if (minutes === null) return null;
  return Math.round(minutes * 60);
}

function normalizeStepTimeUnit(raw) {
  return String(raw || "").trim().toLowerCase() === "sec" ? "sec" : "min";
}

function normalizeLoose(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAiQuestionStatus(raw) {
  const status = String(raw || "").trim().toLowerCase();
  return status === "done" ? "done" : "open";
}

function normalizeAiQuestionItems(rawList) {
  return asArray(rawList)
    .map((raw, idx) => {
      const item = asObject(raw);
      const qid = toText(item?.qid || item?.id || item?.question_id || item?.questionId || `q_${idx + 1}`);
      const text = toText(item?.text || item?.question || item?.label);
      if (!qid || !text) return null;
      return {
        qid,
        text,
        comment: toText(item?.comment || item?.answer),
        status: normalizeAiQuestionStatus(item?.status),
        createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
        updatedAt: Number(item?.updatedAt || item?.updated_at || item?.createdAt || Date.now()) || Date.now(),
        source: toText(item?.source || "ai"),
        stepId: toText(item?.stepId || item?.step_id),
      };
    })
    .filter(Boolean);
}

function normalizeAiQuestionsByElementMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawElementId) => {
    const elementId = toText(rawElementId);
    if (!elementId) return;
    const rawEntry = rawMap[rawElementId];
    const rawItems = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    const items = normalizeAiQuestionItems(rawItems)
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    if (items.length) out[elementId] = items;
  });
  return out;
}

function normalizeFlowTierMetaMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawFlowId) => {
    const flowId = toText(rawFlowId);
    if (!flowId) return;
    const entry = asObject(rawMap[rawFlowId]);
    const tier = toText(entry?.tier).toUpperCase();
    if (tier === "P0" || tier === "P1" || tier === "P2") {
      out[flowId] = { tier };
      return;
    }
    if (entry?.happy) {
      out[flowId] = { tier: "P0" };
    }
  });
  return out;
}

function normalizeNodePathMetaMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawNodeId) => {
    const nodeId = toText(rawNodeId);
    if (!nodeId) return;
    const entry = asObject(rawMap[rawNodeId]);
    const seen = new Set();
    const paths = asArray(entry?.paths)
      .map((item) => toText(item).toUpperCase())
      .filter((tag) => {
        if (!(tag === "P0" || tag === "P1" || tag === "P2")) return false;
        if (seen.has(tag)) return false;
        seen.add(tag);
        return true;
      });
    if (!paths.length) return;
    const sourceRaw = toText(entry?.source).toLowerCase();
    out[nodeId] = {
      paths: paths.sort((a, b) => (a > b ? 1 : -1)),
      source: sourceRaw === "color_auto" ? "color_auto" : "manual",
      sequence_key: toText(entry?.sequence_key || entry?.sequenceKey),
    };
  });
  return out;
}

function aiQuestionStats(rawItems) {
  const items = normalizeAiQuestionItems(rawItems);
  const total = items.length;
  const done = items.filter((q) => normalizeAiQuestionStatus(q?.status) === "done").length;
  const withoutComment = items.filter((q) => !toText(q?.comment)).length;
  return {
    total,
    done,
    open: Math.max(total - done, 0),
    withoutComment,
  };
}

function shouldLogAiOverlayTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_AI__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_ai") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logAiOverlayTrace(tag, payload = {}) {
  if (!shouldLogAiOverlayTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AI_OVERLAY] ${String(tag || "trace")} ${suffix}`.trim());
}

function shouldTraceSelectionContinuity() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_E2E__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_selection_continuity") || "").trim() === "1";
  } catch {
    return false;
  }
}

function traceSelectionContinuity(event, payload = {}) {
  if (!shouldTraceSelectionContinuity()) return;
  const detail = payload && typeof payload === "object" ? payload : {};
  try {
    const prev = Array.isArray(window.__FPC_SELECTION_CONTINUITY_LOG__) ? window.__FPC_SELECTION_CONTINUITY_LOG__ : [];
    const next = [
      ...prev,
      {
        ts: Date.now(),
        event: String(event || "trace"),
        ...detail,
      },
    ];
    if (next.length > 200) next.splice(0, next.length - 200);
    window.__FPC_SELECTION_CONTINUITY_LOG__ = next;
  } catch {
  }
  const suffix = Object.entries(detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[SELECTION_CONTINUITY] ${String(event || "trace")}${suffix ? ` ${suffix}` : ""}`);
}

function colorFromKey(key) {
  let h = 17;
  const src = normalizeLoose(key || "sp");
  for (let i = 0; i < src.length; i += 1) {
    h = (h * 31 + src.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 88% 74%)`;
}

const DIAGRAM_FLASH_EVENT = "fpc:diagram_flash";

function createFlashRuntimeState() {
  return {
    node: {},
    badge: {},
    pill: {},
  };
}

function createPlaybackDecorRuntimeState() {
  return {
    nodeId: "",
    prevNodeId: "",
    flowId: "",
    subprocessId: "",
    frameKey: "",
    stepOverlayId: null,
    branchOverlayId: null,
    subprocessOverlayId: null,
    exitOverlayId: null,
    exitTimer: 0,
    markerNodeIds: [],
    markerFlowIds: [],
    markerSubprocessIds: [],
    overlayIds: [],
    gatewayOverlayId: null,
    cameraRaf: 0,
  };
}

function localKey(sessionId) {
  return `fpc_bpmn_xml_${sessionId}`;
}

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function safeBpmnId(raw) {
  let s = String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!s) s = "id";
  if (!/^[A-Za-z_]/.test(s)) s = `id_${s}`;
  return s;
}

function escapeXmlAttr(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function validateBpmnXmlText(rawXml) {
  const raw = String(rawXml || "").trim();
  if (!raw) return "XML пустой";
  if (!raw.includes("<") || (!raw.includes("definitions") && !raw.includes("bpmn:"))) {
    return "Это не BPMN XML";
  }
  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(raw, "application/xml");
      const parserErr = doc.getElementsByTagName("parsererror");
      if (parserErr && parserErr.length > 0) {
        return "XML содержит синтаксические ошибки";
      }
    }
  } catch {
    return "XML содержит синтаксические ошибки";
  }
  return "";
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export {
  asArray,
  asObject,
  getOverlayMeasurementContainer,
  toText,
  publishE2ESaveProbe,
  cloneJsonValue,
  isEditableKeyTarget,
  readStepTimeMinutes,
  readStepTimeSeconds,
  normalizeStepTimeUnit,
  normalizeLoose,
  normalizeAiQuestionStatus,
  normalizeAiQuestionItems,
  normalizeAiQuestionsByElementMap,
  normalizeFlowTierMetaMap,
  normalizeNodePathMetaMap,
  aiQuestionStats,
  shouldLogAiOverlayTrace,
  logAiOverlayTrace,
  shouldTraceSelectionContinuity,
  traceSelectionContinuity,
  colorFromKey,
  DIAGRAM_FLASH_EVENT,
  createFlashRuntimeState,
  createPlaybackDecorRuntimeState,
  localKey,
  isLocalSessionId,
  safeBpmnId,
  escapeXmlAttr,
  validateBpmnXmlText,
  fnv1aHex,
};
