import { normalizeRobotMetaMap } from "../features/process/robotmeta/robotMeta.js";
import { normalizeCamundaExtensionsMap } from "../features/process/camunda/camundaExtensions.js";
import { normalizeCamundaPresentationMap } from "../features/process/camunda/camundaPresentation.js";
import { normalizeExecutionPlanVersionList } from "../features/process/robotmeta/executionPlan.js";
import { normalizeHybridLayerMap } from "../features/process/hybrid/hybridLayerUi.js";
import { normalizeHybridV2Doc } from "../features/process/hybrid/hybridLayerV2.js";
import { mergeDrawioMeta } from "../features/process/drawio/drawioMeta.js";
import { normalizeSessionCompanion } from "../features/process/session-companion/sessionCompanionContracts.js";

const FLOW_TIER_SET = new Set(["P0", "P1", "P2"]);
const R_FLOW_TIER_SET = new Set(["R0", "R1", "R2"]);
const FLOW_R_SOURCE_SET = new Set(["manual", "inferred"]);
const NODE_PATH_TAG_ORDER = ["P0", "P1", "P2"];
const NODE_PATH_TAG_SET = new Set(NODE_PATH_TAG_ORDER);

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function ensureObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

export function normalizeFlowTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  return FLOW_TIER_SET.has(tier) ? tier : "";
}

export function normalizeRFlowTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  return R_FLOW_TIER_SET.has(tier) ? tier : "";
}

export function normalizeFlowRSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return FLOW_R_SOURCE_SET.has(source) ? source : "";
}

export function normalizeFlowMetaEntry(rawEntry) {
  const entry = ensureObject(rawEntry);
  const directTier = normalizeFlowTier(entry.tier);
  const tier = directTier || (entry.happy === true ? "P0" : (typeof rawEntry === "boolean" && rawEntry ? "P0" : ""));
  const rtier = normalizeRFlowTier(entry.rtier);
  if (!tier && !rtier) return null;
  const out = {};
  if (tier) out.tier = tier;
  if (rtier) {
    out.rtier = rtier;
    const source = normalizeFlowRSource(entry.source) || "manual";
    out.source = source;
    const scopeStartId = String(entry.scopeStartId || entry.scope_start_id || "").trim();
    if (scopeStartId) out.scopeStartId = scopeStartId;
    const algoVersion = String(entry.algoVersion || entry.algo_version || "").trim();
    if (algoVersion) out.algoVersion = algoVersion;
    const computedAtIso = String(entry.computedAtIso || entry.computed_at_iso || "").trim();
    if (computedAtIso) out.computedAtIso = computedAtIso;
    const reason = String(entry.reason || "").trim();
    if (reason) out.reason = reason;
  }
  return out;
}

export function normalizeFlowMetaMap(rawMap) {
  const src = ensureObject(rawMap);
  const out = {};
  Object.keys(src).forEach((rawFlowId) => {
    const flowId = String(rawFlowId || "").trim();
    if (!flowId) return;
    const normalizedEntry = normalizeFlowMetaEntry(src[rawFlowId]);
    if (!normalizedEntry) return;
    out[flowId] = normalizedEntry;
  });
  return out;
}

export function normalizeNodePathTag(value) {
  const tag = String(value || "").trim().toUpperCase();
  return NODE_PATH_TAG_SET.has(tag) ? tag : "";
}

export function normalizeSequenceKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const compact = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return compact.slice(0, 64);
}

export function normalizeNodePathEntry(rawEntry) {
  const entry = ensureObject(rawEntry);
  const pathValues = Array.isArray(entry.paths)
    ? entry.paths
    : (entry.path ? [entry.path] : (entry.tier ? [entry.tier] : []));
  const seen = new Set();
  const paths = pathValues
    .map((item) => normalizeNodePathTag(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .sort((a, b) => NODE_PATH_TAG_ORDER.indexOf(a) - NODE_PATH_TAG_ORDER.indexOf(b));
  if (!paths.length) return null;
  const sourceRaw = String(entry.source || "").trim().toLowerCase();
  const source = sourceRaw === "color_auto" ? "color_auto" : "manual";
  const sequenceKey = normalizeSequenceKey(entry.sequence_key || entry.sequenceKey);
  const out = { paths, source };
  if (sequenceKey) out.sequence_key = sequenceKey;
  return out;
}

export function normalizeNodePathMetaMap(rawMap) {
  const src = ensureObject(rawMap);
  const out = {};
  Object.keys(src).forEach((rawNodeId) => {
    const nodeId = String(rawNodeId || "").trim();
    if (!nodeId) return;
    const entry = normalizeNodePathEntry(src[rawNodeId]);
    if (!entry) return;
    out[nodeId] = entry;
  });
  return out;
}

export function normalizeExecutionPlans(rawList) {
  return normalizeExecutionPlanVersionList(rawList);
}

export function hybridV2EntityCount(raw) {
  const doc = normalizeHybridV2Doc(raw);
  return ensureArray(doc.elements).length + ensureArray(doc.edges).length;
}

export function mergeHybridV2Doc(primaryRaw, fallbackRaw = {}) {
  const primary = normalizeHybridV2Doc(primaryRaw);
  const fallback = normalizeHybridV2Doc(fallbackRaw);
  if (hybridV2EntityCount(primary) <= 0 && hybridV2EntityCount(fallback) > 0) {
    return fallback;
  }
  return primary;
}

export function normalizeBpmnMeta(raw, options = {}) {
  const obj = ensureObject(raw);
  return {
    version: Number(obj.version) > 0 ? Number(obj.version) : 1,
    flow_meta: normalizeFlowMetaMap(obj.flow_meta),
    node_path_meta: normalizeNodePathMetaMap(obj.node_path_meta),
    robot_meta_by_element_id: normalizeRobotMetaMap(obj.robot_meta_by_element_id),
    camunda_extensions_by_element_id: normalizeCamundaExtensionsMap(obj.camunda_extensions_by_element_id),
    presentation_by_element_id: normalizeCamundaPresentationMap(obj.presentation_by_element_id),
    hybrid_layer_by_element_id: normalizeHybridLayerMap(obj.hybrid_layer_by_element_id),
    hybrid_v2: mergeHybridV2Doc(obj.hybrid_v2, options.fallbackHybridV2),
    drawio: mergeDrawioMeta(obj.drawio, options.fallbackDrawio),
    execution_plans: normalizeExecutionPlans(obj.execution_plans),
    auto_pass_v1: ensureObject(obj.auto_pass_v1),
    session_companion_v1: normalizeSessionCompanion(obj.session_companion_v1),
  };
}

export function emptyBpmnMeta() {
  return normalizeBpmnMeta({});
}
