import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ProjectWizardModal from "./components/ProjectWizardModal";
import SessionFlowModal from "./components/SessionFlowModal";
import OrgSettingsModal from "./components/org/OrgSettingsModal";
import Modal from "./shared/ui/Modal";
import useSessionStore from "./features/sessions/hooks/useSessionStore";
import {
  normalizeElementNotesMap,
  withAddedElementNote,
  withElementNoteSummary,
  withRemappedElementNotes,
} from "./features/notes/elementNotes";
import { deriveActorsFromBpmn } from "./features/process/lib/deriveActorsFromBpmn";
import { createAiInputHash, executeAi } from "./features/ai/aiExecutor";

import { uid } from "./lib/ids";
import {
  apiMeta,
  apiListProjects,
  apiCreateProject,
  apiListProjectSessions,
  apiCreateProjectSession,
  apiPatchProject,
  apiListSessions,
  apiCreateSession,
  apiGetSession,
  apiPatchSession,
  apiPostNote,
  apiDeleteProject,
  apiDeleteSession,
  apiGetLlmSettings,
  apiPostLlmSettings,
  apiVerifyLlmSettings,
  apiRecompute,
  apiPutBpmnXml,
  apiInferBpmnRtiers,
} from "./lib/api";
import {
  getLatestBpmnSnapshot,
} from "./features/process/bpmn/snapshots/bpmnSnapshots";
import {
  canonicalRobotMetaMapString,
  extractRobotMetaMapFromBpmnXml,
  normalizeRobotMetaMap,
  removeRobotMetaByElementId,
  upsertRobotMetaByElementId,
  validateRobotMetaV1,
} from "./features/process/robotmeta/robotMeta";
import { normalizeExecutionPlanVersionList } from "./features/process/robotmeta/executionPlan";
import { normalizeHybridLayerMap } from "./features/process/hybrid/hybridLayerUi";
import { normalizeHybridV2Doc } from "./features/process/hybrid/hybridLayerV2";
import { mergeDrawioMeta, normalizeDrawioMeta } from "./features/process/drawio/drawioMeta";
import buildSessionMetaReadModel from "./features/session-meta/read/buildSessionMetaReadModel";
import applySessionMetaHydration from "./features/session-meta/hydrate/applySessionMetaHydration";
import { createSessionMetaConflictGuard } from "./features/session-meta/guards/sessionMetaConflictGuard";
import useSessionMetaWriteGateway from "./features/session-meta/write/useSessionMetaWriteGateway";
import { buildSessionMetaWriteEnvelope } from "./features/session-meta/write/sessionMetaMergePolicy";
import { useAuth } from "./features/auth/AuthProvider";
import { canCreateOrgTemplateForRole } from "./features/templates/model/templatesRbac";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function ensureObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function normalizeStepTimeMinutes(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function normalizeStepTimeSeconds(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function readNodeStepTimeMinutes(nodeRaw) {
  const node = ensureObject(nodeRaw);
  const params = ensureObject(node.parameters);
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
    const parsed = normalizeStepTimeMinutes(candidates[i]);
    if (parsed !== null) return parsed;
  }
  const secondsCandidates = [
    node.step_time_sec,
    node.stepTimeSec,
    node.duration_sec,
    node.durationSec,
    params.step_time_sec,
    params.stepTimeSec,
    params.duration_sec,
    params.durationSec,
  ];
  for (let i = 0; i < secondsCandidates.length; i += 1) {
    const sec = normalizeStepTimeSeconds(secondsCandidates[i]);
    if (sec !== null) return Math.round(sec / 60);
  }
  return null;
}

function readNodeStepTimeSeconds(nodeRaw) {
  const node = ensureObject(nodeRaw);
  const params = ensureObject(node.parameters);
  const secondsCandidates = [
    node.step_time_sec,
    node.stepTimeSec,
    node.duration_sec,
    node.durationSec,
    params.step_time_sec,
    params.stepTimeSec,
    params.duration_sec,
    params.durationSec,
  ];
  for (let i = 0; i < secondsCandidates.length; i += 1) {
    const parsed = normalizeStepTimeSeconds(secondsCandidates[i]);
    if (parsed !== null) return parsed;
  }
  const fallbackMinutes = readNodeStepTimeMinutes(node);
  if (fallbackMinutes === null) return null;
  return Math.round(fallbackMinutes * 60);
}

function normalizeGlobalNoteItem(raw, fallbackIndex = 0) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const text = String(obj.text || obj.note || obj.notes || obj.message || raw || "").trim();
  if (!text) return null;
  const rawTs = obj.ts ?? obj.createdAt ?? obj.created_at ?? obj.updatedAt ?? obj.updated_at;
  let ts = Number(rawTs);
  if (!Number.isFinite(ts) || ts <= 0) {
    const parsedDate = Date.parse(String(rawTs || "").trim());
    ts = Number.isFinite(parsedDate) && parsedDate > 0 ? parsedDate : Date.now();
  }
  const author = String(obj.author || obj.user || obj.created_by || obj.by || "you").trim() || "you";
  const id = String(obj.id || obj.note_id || obj.noteId || "").trim() || `note_${ts}_${fallbackIndex + 1}`;
  return { id, text, ts, author };
}

function normalizeGlobalNotes(value) {
  let source = [];
  if (Array.isArray(value)) {
    source = value;
  } else if (value && typeof value === "object") {
    source = [value];
  } else {
    const text = String(value || "").trim();
    if (!text) source = [];
    else {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) source = parsed;
        else if (parsed && typeof parsed === "object") source = [parsed];
        else source = [{ text }];
      } catch {
        source = [{ text }];
      }
    }
  }
  const normalized = source
    .map((item, idx) => normalizeGlobalNoteItem(item, idx))
    .filter(Boolean);
  normalized.sort((a, b) => {
    const dt = Number(a?.ts || 0) - Number(b?.ts || 0);
    if (dt !== 0) return dt;
    return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
  });
  return normalized;
}

function mergeGlobalNotesLists(baseRaw, incomingRaw) {
  const out = [];
  const byId = new Set();
  const bySignature = new Set();
  function add(rawItem, idx) {
    const item = normalizeGlobalNoteItem(rawItem, idx);
    if (!item) return;
    const id = String(item.id || "").trim();
    const signature = `${String(item.text || "").trim().toLowerCase()}|${Number(item.ts || 0)}|${String(item.author || "").trim().toLowerCase()}`;
    if (id && byId.has(id)) return;
    if (signature && bySignature.has(signature)) return;
    if (id) byId.add(id);
    if (signature) bySignature.add(signature);
    out.push(item);
  }
  normalizeGlobalNotes(baseRaw).forEach((item, idx) => add(item, idx));
  normalizeGlobalNotes(incomingRaw).forEach((item, idx) => add(item, idx));
  out.sort((a, b) => {
    const dt = Number(a?.ts || 0) - Number(b?.ts || 0);
    if (dt !== 0) return dt;
    return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
  });
  return out;
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function shouldLogDraftTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

function shouldLogCreateTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_CREATE__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_create") || "").trim() === "1";
  } catch {
    return false;
  }
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

function shortStack() {
  try {
    return String(new Error("draft_merge_trace").stack || "")
      .split("\n")
      .slice(2, 7)
      .map((line) => line.trim())
      .join(" | ");
  } catch {
    return "";
  }
}

function logDraftTrace(tag, payload = {}) {
  if (!shouldLogDraftTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[${String(tag || "DRAFT").toUpperCase()}] ${suffix}`.trim());
}

function logCreateTrace(tag, payload = {}) {
  if (!shouldLogCreateTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[${String(tag || "CREATE_FLOW").toUpperCase()}] ${suffix}`.trim());
}

function shouldLogSnapshotTrace() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem("fpc_debug_snapshots") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logSnapshotTrace(tag, payload = {}) {
  if (!shouldLogSnapshotTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[SNAPSHOT] ${String(tag || "trace")} ${suffix}`.trim());
}

function readSelectionFromUrl() {
  if (typeof window === "undefined") return { projectId: "", sessionId: "" };
  try {
    const params = new URLSearchParams(window.location.search || "");
    return {
      projectId: String(params.get("project") || "").trim(),
      sessionId: String(params.get("session") || "").trim(),
    };
  } catch {
    return { projectId: "", sessionId: "" };
  }
}

function writeSelectionToUrl({ projectId, sessionId }) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (projectId) url.searchParams.set("project", String(projectId || "").trim());
    else url.searchParams.delete("project");
    if (sessionId) url.searchParams.set("session", String(sessionId || "").trim());
    else url.searchParams.delete("session");
    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextHref !== currentHref) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
  } catch {
  }
}

function normalizeOrgSettingsTab(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "members" || value === "invites" || value === "audit") return value;
  return "members";
}

function readOrgSettingsTabFromUrl() {
  if (typeof window === "undefined") return "members";
  try {
    const params = new URLSearchParams(window.location.search || "");
    return normalizeOrgSettingsTab(params.get("tab"));
  } catch {
    return "members";
  }
}

function projectIdOf(p) {
  return String((p && (p.id || p.project_id || p.slug)) || "").trim();
}

function sessionIdOf(s) {
  return String((s && (s.id || s.session_id)) || "").trim();
}

function projectTitleOf(p) {
  return String((p && (p.title || p.name || p.id || p.project_id || p.slug)) || "").trim();
}

const LEFT_PANEL_OPEN_KEY = "ui.sidebar.left.open";
const LEFT_PANEL_COMPACT_KEY = "fpc_leftpanel_compact";
const STEP_TIME_UNIT_KEY = "fpc_step_time_unit_v1";
const BPMN_META_LOCAL_KEY_PREFIX = "fpc_bpmn_meta_v1:";
const FLOW_TIER_SET = new Set(["P0", "P1", "P2"]);
const R_FLOW_TIER_SET = new Set(["R0", "R1", "R2"]);
const FLOW_R_SOURCE_SET = new Set(["manual", "inferred"]);
const NODE_PATH_TAG_ORDER = ["P0", "P1", "P2"];
const NODE_PATH_TAG_SET = new Set(NODE_PATH_TAG_ORDER);

function normalizeStepTimeUnit(raw) {
  return String(raw || "").trim().toLowerCase() === "sec" ? "sec" : "min";
}

function readStepTimeUnit() {
  if (typeof window === "undefined") return "min";
  try {
    return normalizeStepTimeUnit(window.localStorage?.getItem(STEP_TIME_UNIT_KEY) || "min");
  } catch {
    return "min";
  }
}

function writeStepTimeUnit(unit) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STEP_TIME_UNIT_KEY, normalizeStepTimeUnit(unit));
  } catch {
  }
}

function bpmnMetaLocalStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `${BPMN_META_LOCAL_KEY_PREFIX}${sid}` : "";
}

function normalizeFlowTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  return FLOW_TIER_SET.has(tier) ? tier : "";
}

function normalizeRFlowTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  return R_FLOW_TIER_SET.has(tier) ? tier : "";
}

function normalizeFlowRSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return FLOW_R_SOURCE_SET.has(source) ? source : "";
}

function normalizeFlowMetaEntry(rawEntry) {
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

function normalizeFlowMetaMap(rawMap) {
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

function normalizeNodePathTag(value) {
  const tag = String(value || "").trim().toUpperCase();
  return NODE_PATH_TAG_SET.has(tag) ? tag : "";
}

function normalizeSequenceKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const compact = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return compact.slice(0, 64);
}

function normalizeNodePathEntry(rawEntry) {
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

function normalizeNodePathMetaMap(rawMap) {
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

function normalizeExecutionPlans(rawList) {
  return normalizeExecutionPlanVersionList(rawList);
}

function hybridV2EntityCount(raw) {
  const doc = normalizeHybridV2Doc(raw);
  return ensureArray(doc.elements).length + ensureArray(doc.edges).length;
}

function mergeHybridV2Doc(primaryRaw, fallbackRaw = {}) {
  const primary = normalizeHybridV2Doc(primaryRaw);
  const fallback = normalizeHybridV2Doc(fallbackRaw);
  if (hybridV2EntityCount(primary) <= 0 && hybridV2EntityCount(fallback) > 0) {
    return fallback;
  }
  return primary;
}

function normalizeBpmnMeta(raw, options = {}) {
  const obj = ensureObject(raw);
  return {
    version: Number(obj.version) > 0 ? Number(obj.version) : 1,
    flow_meta: normalizeFlowMetaMap(obj.flow_meta),
    node_path_meta: normalizeNodePathMetaMap(obj.node_path_meta),
    robot_meta_by_element_id: normalizeRobotMetaMap(obj.robot_meta_by_element_id),
    hybrid_layer_by_element_id: normalizeHybridLayerMap(obj.hybrid_layer_by_element_id),
    hybrid_v2: mergeHybridV2Doc(obj.hybrid_v2, options.fallbackHybridV2),
    drawio: mergeDrawioMeta(obj.drawio, options.fallbackDrawio),
    execution_plans: normalizeExecutionPlans(obj.execution_plans),
  };
}

function emptyBpmnMeta() {
  return normalizeBpmnMeta({});
}

function readLocalBpmnMeta(sessionId) {
  if (typeof window === "undefined") return emptyBpmnMeta();
  const key = bpmnMetaLocalStorageKey(sessionId);
  if (!key) return emptyBpmnMeta();
  try {
    const raw = String(window.localStorage?.getItem(key) || "").trim();
    if (!raw) return emptyBpmnMeta();
    const parsed = JSON.parse(raw);
    return normalizeBpmnMeta(parsed);
  } catch {
    return emptyBpmnMeta();
  }
}

function writeLocalBpmnMeta(sessionId, meta) {
  if (typeof window === "undefined") return;
  const key = bpmnMetaLocalStorageKey(sessionId);
  if (!key) return;
  try {
    const payload = normalizeBpmnMeta(meta);
    window.localStorage?.setItem(key, JSON.stringify(payload));
  } catch {
  }
}

function isHardReloadNavigation() {
  if (typeof window === "undefined") return false;
  try {
    const nav = window.performance?.getEntriesByType?.("navigation")?.[0];
    const navType = String(nav?.type || "").toLowerCase();
    return navType === "reload";
  } catch {
    return false;
  }
}

function readLeftPanelHidden() {
  if (typeof window === "undefined") return true;
  // Hard reload always starts with closed sidebar.
  if (isHardReloadNavigation()) return true;
  try {
    const openRaw = String(window.sessionStorage?.getItem(LEFT_PANEL_OPEN_KEY) || "").trim();
    if (openRaw === "0") return true;
    if (openRaw === "1") return false;
    return true;
  } catch {
    return true;
  }
}

function readLeftPanelCompact() {
  return false;
}

function ensureDraftShape(sessionId) {
  return {
    session_id: sessionId || null,
    title: "",
    roles: [],
    start_role: "",
    actors_derived: [],
    nodes: [],
    edges: [],
    notes: [],
    notes_by_element: {},
    bpmn_meta: emptyBpmnMeta(),
    interview: {},
    questions: [],
  };
}

function sessionToDraft(sid, session) {
  const next = session || ensureDraftShape(sid);
  const localMeta = normalizeBpmnMeta(readLocalBpmnMeta(sid));
  const sessionMeta = normalizeBpmnMeta(ensureObject(next.bpmn_meta));
  const xmlRobotMeta = normalizeRobotMetaMap(extractRobotMetaMapFromBpmnXml(next?.bpmn_xml || ""));
  const { derivedReadMeta: normalizedMeta } = buildSessionMetaReadModel({
    sessionMetaRaw: sessionMeta,
    localMetaRaw: localMeta,
    normalizeBpmnMeta,
    normalizeHybridLayerMap,
    mergeHybridV2Doc,
    mergeDrawioMeta,
    preferServerOverlay: true,
  });
  const hasSessionRobotMeta = Object.keys(normalizeRobotMetaMap(sessionMeta.robot_meta_by_element_id)).length > 0;
  const hasXmlRobotMeta = Object.keys(xmlRobotMeta).length > 0;
  let effectiveRobotMeta = normalizedMeta.robot_meta_by_element_id;
  if (!Object.keys(effectiveRobotMeta).length && hasXmlRobotMeta) {
    effectiveRobotMeta = xmlRobotMeta;
  }
  if (hasSessionRobotMeta && hasXmlRobotMeta) {
    const sessionRobotCanonical = canonicalRobotMetaMapString(sessionMeta.robot_meta_by_element_id);
    const xmlRobotCanonical = canonicalRobotMetaMapString(xmlRobotMeta);
    if (sessionRobotCanonical !== xmlRobotCanonical && typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[ROBOT_META] BPMN robotMeta differs; session meta wins", { sessionId: String(sid || "") });
    }
  }
  return {
    ...ensureDraftShape(sid),
    ...next,
    session_id: sid,
    roles: ensureArray(next.roles),
    actors_derived: ensureArray(next.actors_derived),
    nodes: ensureArray(next.nodes),
    edges: ensureArray(next.edges),
    notes: normalizeGlobalNotes(next.notes),
    notes_by_element: normalizeElementNotesMap(next.notes_by_element || next.notesByElementId),
    bpmn_meta: {
      version: Number(normalizedMeta.version) > 0 ? Number(normalizedMeta.version) : 1,
      flow_meta: normalizedMeta.flow_meta,
      node_path_meta: normalizedMeta.node_path_meta,
      robot_meta_by_element_id: effectiveRobotMeta,
      hybrid_layer_by_element_id: normalizedMeta.hybrid_layer_by_element_id,
      hybrid_v2: normalizedMeta.hybrid_v2,
      drawio: normalizeDrawioMeta(normalizedMeta.drawio),
      execution_plans: normalizedMeta.execution_plans,
    },
    interview: ensureObject(next.interview),
    questions: ensureArray(next.questions),
  };
}

function normalizeDraftForStore(value) {
  const next = ensureObject(value);
  const sid = String(next.session_id || next.id || "").trim();
  return sessionToDraft(sid || null, next);
}

function summarizeElementNotesMap(notesMap) {
  const map = normalizeElementNotesMap(notesMap);
  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, "ru"));
  let noteCount = 0;
  let maxUpdatedAt = 0;
  const compact = keys.map((key) => {
    const entry = ensureObject(map[key]);
    const items = ensureArray(entry.items);
    noteCount += items.length;
    const updatedAt = Number(entry.updatedAt || 0);
    if (Number.isFinite(updatedAt) && updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
    const itemCompact = items
      .map((it) => ({
        id: String(it?.id || ""),
        text: String(it?.text || ""),
        updatedAt: Number(it?.updatedAt || 0),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), "ru"));
    return {
      key,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      items: itemCompact,
    };
  });
  return {
    keyCount: keys.length,
    noteCount,
    maxUpdatedAt: Number.isFinite(maxUpdatedAt) ? maxUpdatedAt : 0,
    hash: fnv1aHex(JSON.stringify(compact)),
  };
}

function normalizeAiQuestionsByElementForMerge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((rawElementId) => {
    const elementId = String(rawElementId || "").trim();
    if (!elementId) return;
    const rawEntry = value[rawElementId];
    const rawList = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    if (!rawList.length) return;
    const byQid = {};
    rawList.forEach((rawItem, idx) => {
      const item = ensureObject(rawItem);
      const qid = String(item?.qid || item?.id || item?.question_id || "").trim();
      const text = String(item?.text || item?.question || "").trim();
      if (!qid && !text) return;
      const key = qid || `q_${idx + 1}_${fnv1aHex(text).slice(0, 8)}`;
      byQid[key] = {
        qid: key,
        text,
        comment: String(item?.comment || item?.answer || "").trim(),
        status: String(item?.status || "open").trim() || "open",
        createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
        source: String(item?.source || "ai").trim() || "ai",
        stepId: String(item?.stepId || item?.step_id || "").trim(),
      };
    });
    const list = Object.values(byQid)
      .filter((item) => String(item?.qid || "").trim() && String(item?.text || "").trim())
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
    if (list.length) out[elementId] = list;
  });
  return out;
}

function mergeAiQuestionsByElementMaps(prevMapRaw, incomingMapRaw) {
  const prevMap = normalizeAiQuestionsByElementForMerge(prevMapRaw);
  const incomingMap = normalizeAiQuestionsByElementForMerge(incomingMapRaw);
  const out = { ...prevMap };
  Object.keys(incomingMap).forEach((elementId) => {
    const prevList = ensureArray(out[elementId]).map((item) => ({ ...item }));
    const byQid = {};
    const byText = {};
    prevList.forEach((item) => {
      const qid = String(item?.qid || item?.id || "").trim();
      if (qid) byQid[qid] = item;
      const textKey = String(item?.text || "").trim().toLowerCase();
      if (textKey) byText[textKey] = item;
    });
    ensureArray(incomingMap[elementId]).forEach((incoming) => {
      const qid = String(incoming?.qid || incoming?.id || "").trim();
      const text = String(incoming?.text || "").trim();
      const textKey = text.toLowerCase();
      const found = (qid && byQid[qid]) || (textKey && byText[textKey]) || null;
      if (found) {
        if (text) found.text = text;
        if (!String(found?.comment || "").trim() && String(incoming?.comment || "").trim()) found.comment = String(incoming.comment).trim();
        if (!String(found?.status || "").trim() && String(incoming?.status || "").trim()) found.status = String(incoming.status).trim();
        if (!String(found?.stepId || "").trim() && String(incoming?.stepId || "").trim()) found.stepId = String(incoming.stepId).trim();
        return;
      }
      const next = { ...incoming };
      prevList.push(next);
      if (qid) byQid[qid] = next;
      if (textKey) byText[textKey] = next;
    });
    out[elementId] = prevList
      .filter((item) => String(item?.qid || "").trim() && String(item?.text || "").trim())
      .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
  });
  return out;
}

function mergeSessionDraft(prevDraft, sid, session, source = "session_sync") {
  const prev = sessionToDraft(sid || null, prevDraft);
  const incomingRaw = ensureObject(session);
  const incomingPatchKeys = ensureArray(incomingRaw?._patch_payload_keys).map((key) => String(key || "").trim()).filter(Boolean);
  const patchHasBpmnXml = incomingPatchKeys.includes("bpmn_xml");
  const incoming = { ...incomingRaw };
  delete incoming._sync_source;
  delete incoming._source;
  delete incoming._patch_payload_keys;
  let next = sessionToDraft(sid || null, {
    ...prev,
    ...incoming,
    session_id: sid || null,
  });

  const prevXml = String(prev?.bpmn_xml || "");
  const incomingHasXml = hasOwn(incoming, "bpmn_xml");
  const incomingXml = incomingHasXml ? String(incoming?.bpmn_xml || "") : "";
  if (incomingHasXml && !incomingXml.trim() && prevXml.trim()) {
    next = { ...next, bpmn_xml: prevXml };
    logDraftTrace("MERGE_SKIP_EMPTY_BPMN_XML", {
      sid: sid || "-",
      source,
      prevLen: prevXml.length,
      prevHash: fnv1aHex(prevXml),
    });
  } else if (incomingHasXml && incomingXml.trim() && prevXml.trim()) {
    const sourceKey = String(source || "").trim().toLowerCase();
    const prevHash = fnv1aHex(prevXml);
    const incomingHash = fnv1aHex(incomingXml);
    const xmlChanged = incomingHash !== prevHash;
    const prevRev = Number(prev?.bpmn_xml_version || prev?.version || 0);
    const nextRev = Number(incoming?.bpmn_xml_version || incoming?.version || 0);
    const incomingHasXmlRev = hasOwn(incoming, "bpmn_xml_version") || hasOwn(incoming, "version");
    const shouldSkipPatchXml =
      sourceKey === "patch_session"
      && xmlChanged;

    if (shouldSkipPatchXml) {
      next = {
        ...next,
        bpmn_xml: prevXml,
      };
      logDraftTrace("MERGE_SKIP_PATCH_STALE_BPMN_XML", {
        sid: sid || "-",
        source,
        prevLen: prevXml.length,
        prevHash,
        nextLen: incomingXml.length,
        nextHash: incomingHash,
        patchHasBpmnXml: patchHasBpmnXml ? 1 : 0,
        incomingHasXmlRev: incomingHasXmlRev ? 1 : 0,
        patchPayloadKeys: incomingPatchKeys.join(",") || "-",
      });
    } else if (prevRev > 0 && nextRev > 0 && nextRev < prevRev) {
      next = {
        ...next,
        bpmn_xml: prevXml,
        bpmn_xml_version: prevRev,
      };
      logDraftTrace("MERGE_SKIP_OLDER_BPMN_XML", {
        sid: sid || "-",
        source,
        prevRev,
        nextRev,
        prevLen: prevXml.length,
        prevHash: fnv1aHex(prevXml),
      });
    }
  }

  const prevActors = ensureArray(prev?.actors_derived);
  const incomingHasActors = hasOwn(incoming, "actors_derived");
  const incomingActors = ensureArray(incoming?.actors_derived);
  if (prevActors.length > 0 && (!incomingHasActors || incomingActors.length === 0)) {
    next = {
      ...next,
      actors_derived: prevActors,
    };
  } else if ((!incomingHasActors || incomingActors.length === 0) && String(next?.bpmn_xml || "").trim()) {
    const xmlForDerive = String(next?.bpmn_xml || "");
    const derivedActors = ensureArray(deriveActorsFromBpmn(xmlForDerive));
    if (derivedActors.length > 0) {
      next = {
        ...next,
        actors_derived: derivedActors,
      };
      logDraftTrace("MERGE_DERIVE_ACTORS", {
        sid: sid || "-",
        source,
        xmlLen: xmlForDerive.length,
        xmlHash: fnv1aHex(xmlForDerive),
        actorsLen: derivedActors.length,
      });
    }
  }

  const prevElementNotes = normalizeElementNotesMap(prev?.notes_by_element || prev?.notesByElementId);
  const incomingHasElementNotes = hasOwn(incoming, "notes_by_element") || hasOwn(incoming, "notesByElementId");
  const incomingElementNotes = normalizeElementNotesMap(incoming?.notes_by_element || incoming?.notesByElementId);
  if (incomingHasElementNotes && Object.keys(incomingElementNotes).length === 0 && Object.keys(prevElementNotes).length > 0) {
    next = {
      ...next,
      notes_by_element: prevElementNotes,
    };
    logDraftTrace("MERGE_SKIP_EMPTY_NOTES_BY_ELEMENT", {
      sid: sid || "-",
      source,
      beforeCount: Object.keys(prevElementNotes).length,
    });
  } else if (incomingHasElementNotes && Object.keys(incomingElementNotes).length > 0 && Object.keys(prevElementNotes).length > 0) {
    const prevStats = summarizeElementNotesMap(prevElementNotes);
    const incomingStats = summarizeElementNotesMap(incomingElementNotes);
    const olderByTime = incomingStats.maxUpdatedAt > 0
      && prevStats.maxUpdatedAt > 0
      && incomingStats.maxUpdatedAt < prevStats.maxUpdatedAt;
    const equalTimeButWeaker = incomingStats.maxUpdatedAt === prevStats.maxUpdatedAt
      && incomingStats.hash !== prevStats.hash
      && incomingStats.noteCount <= prevStats.noteCount;
    if (olderByTime || equalTimeButWeaker) {
      next = {
        ...next,
        notes_by_element: prevElementNotes,
      };
      logDraftTrace("MERGE_SKIP_OLDER_NOTES_BY_ELEMENT", {
        sid: sid || "-",
        source,
        prevHash: prevStats.hash,
        nextHash: incomingStats.hash,
        prevNotes: prevStats.noteCount,
        nextNotes: incomingStats.noteCount,
        prevUpdatedAt: prevStats.maxUpdatedAt,
        nextUpdatedAt: incomingStats.maxUpdatedAt,
      });
    }
  }

  const prevNotes = normalizeGlobalNotes(prev?.notes);
  const incomingHasNotes = hasOwn(incoming, "notes");
  const incomingNotes = normalizeGlobalNotes(incoming?.notes);
  if (incomingHasNotes && incomingNotes.length === 0 && prevNotes.length > 0) {
    next = {
      ...next,
      notes: prevNotes,
    };
    logDraftTrace("MERGE_SKIP_EMPTY_NOTES", {
      sid: sid || "-",
      source,
      prevCount: prevNotes.length,
    });
  } else if (incomingHasNotes && prevNotes.length > 0) {
    next = {
      ...next,
      notes: mergeGlobalNotesLists(prevNotes, incomingNotes),
    };
  } else {
    next = {
      ...next,
      notes: normalizeGlobalNotes(next?.notes),
    };
  }

  const prevInterview = ensureObject(prev?.interview);
  const nextInterview = ensureObject(next?.interview);
  const prevAiQuestionsByElement = normalizeAiQuestionsByElementForMerge(
    prevInterview.ai_questions_by_element || prevInterview.aiQuestionsByElementId,
  );
  const incomingHasAiQuestionsByElement =
    hasOwn(nextInterview, "ai_questions_by_element") || hasOwn(nextInterview, "aiQuestionsByElementId");
  const incomingAiQuestionsByElement = normalizeAiQuestionsByElementForMerge(
    nextInterview.ai_questions_by_element || nextInterview.aiQuestionsByElementId,
  );
  if (incomingHasAiQuestionsByElement || Object.keys(prevAiQuestionsByElement).length > 0) {
    const mergedAiQuestionsByElement = mergeAiQuestionsByElementMaps(
      prevAiQuestionsByElement,
      incomingHasAiQuestionsByElement ? incomingAiQuestionsByElement : prevAiQuestionsByElement,
    );
    next = {
      ...next,
      interview: {
        ...nextInterview,
        ai_questions_by_element: mergedAiQuestionsByElement,
      },
    };
  }

  const afterXml = String(next?.bpmn_xml || "");
  logDraftTrace("DRAFT_MERGE", {
    sid: sid || "-",
    source,
    beforeLen: prevXml.length,
    beforeHash: fnv1aHex(prevXml),
    afterLen: afterXml.length,
    afterHash: fnv1aHex(afterXml),
  });

  return next;
}

export default function App() {
  const { user, orgs, activeOrgId, switchOrg, refreshOrgs } = useAuth();
  const SESSION_MODE = "quick_skeleton";
  const [backendStatus, setBackendStatus] = useState("idle"); // idle|ok|fail
  const [backendHint, setBackendHint] = useState("");

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");

  const [sessions, setSessions] = useState([]);
  const sessionStore = useSessionStore(ensureDraftShape(null), { normalize: normalizeDraftForStore });
  const {
    draft,
    setDraft,
    setDraftPersisted,
    resetDraft,
  } = sessionStore;

  const [wizardOpen, setWizardOpen] = useState(false);
  const [sessionFlowOpen, setSessionFlowOpen] = useState(false);
  const [sessionFlowBusy, setSessionFlowBusy] = useState(false);
  const [processTabIntent, setProcessTabIntent] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const openSessionReqSeqRef = useRef(0);
  const sessionMetaConflictGuardRef = useRef(createSessionMetaConflictGuard());
  const activeSessionIdRef = useRef("");
  const suppressProjectAutoselectRef = useRef(false);
  const initialSelectionRef = useRef(readSelectionFromUrl());
  const requestedSessionIdRef = useRef(String(initialSelectionRef.current?.sessionId || "").trim());
  const [snapshotRestoreNotice, setSnapshotRestoreNotice] = useState(null);
  const [sessionNavNotice, setSessionNavNotice] = useState(null);
  const [renameDialog, setRenameDialog] = useState({ open: false, scope: "", value: "", error: "", busy: false });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, scope: "", error: "", busy: false });
  const [orgSettingsOpen, setOrgSettingsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return String(window.location.pathname || "").startsWith("/app/org");
  });
  const [orgSettingsTab, setOrgSettingsTab] = useState(() => readOrgSettingsTabFromUrl());

  const [leftHidden, setLeftHidden] = useState(() => readLeftPanelHidden());
  const [leftCompact, setLeftCompact] = useState(() => readLeftPanelCompact());
  const [stepTimeUnit, setStepTimeUnit] = useState(() => readStepTimeUnit());
  const [sidebarActiveSection, setSidebarActiveSection] = useState("selected");
  const [sidebarShortcutRequest, setSidebarShortcutRequest] = useState("");
  const [selectedBpmnElement, setSelectedBpmnElement] = useState(null);
  const [processUiState, setProcessUiState] = useState(null);
  const [aiGenerateIntent, setAiGenerateIntent] = useState(null);
  const [elementNotesFocusKey, setElementNotesFocusKey] = useState(0);
  const [llmHasApiKey, setLlmHasApiKey] = useState(false);
  const [llmBaseUrl, setLlmBaseUrl] = useState("https://api.deepseek.com");
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmErr, setLlmErr] = useState("");
  const [llmVerifyState, setLlmVerifyState] = useState("off"); // off|unknown|checking|ok|fail
  const [llmVerifyMsg, setLlmVerifyMsg] = useState("Ключ не задан.");
  const [llmVerifyAt, setLlmVerifyAt] = useState(0);
  const [llmVerifyBusy, setLlmVerifyBusy] = useState(false);
  const activeOrgIdRef = useRef(String(activeOrgId || "").trim());
  const activeOrgRole = useMemo(() => {
    const oid = String(activeOrgId || "").trim();
    if (!oid) return "";
    const row = ensureArray(orgs).find((item) => String(item?.org_id || item?.id || "").trim() === oid);
    return String(row?.role || "").trim().toLowerCase();
  }, [activeOrgId, orgs]);
  const activeOrgName = useMemo(() => {
    const oid = String(activeOrgId || "").trim();
    if (!oid) return "";
    const row = ensureArray(orgs).find((item) => String(item?.org_id || item?.id || "").trim() === oid);
    return String(row?.name || row?.org_name || oid).trim();
  }, [activeOrgId, orgs]);
  const canManageProjectEntities = useMemo(() => {
    if (Boolean(user?.is_admin)) return true;
    return activeOrgRole !== "viewer" && activeOrgRole !== "auditor";
  }, [activeOrgRole, user?.is_admin]);
  const canInviteWorkspaceUsers = useMemo(() => {
    if (Boolean(user?.is_admin)) return true;
    return activeOrgRole === "org_owner" || activeOrgRole === "org_admin";
  }, [activeOrgRole, user?.is_admin]);
  const canManageSharedTemplates = useMemo(() => {
    return canCreateOrgTemplateForRole(activeOrgRole, Boolean(user?.is_admin));
  }, [activeOrgRole, user?.is_admin]);
  const draftSessionId = String(draft?.session_id || "").trim();
  const isSessionLocalMode = !draftSessionId || isLocalSessionId(draftSessionId);
  const serializeSessionMetaForBoundary = useCallback((valueRaw) => JSON.stringify(normalizeBpmnMeta(valueRaw)), []);
  const shortSessionMetaErr = useCallback((value) => String(value || "Не удалось сохранить session meta."), []);
  const ignoreSessionMetaErr = useCallback(() => {}, []);
  const sessionMetaWriteGateway = useSessionMetaWriteGateway({
    sid: draftSessionId,
    isLocal: isSessionLocalMode,
    normalizeMeta: normalizeBpmnMeta,
    serializeMeta: serializeSessionMetaForBoundary,
    getPersistedMeta: () => normalizeBpmnMeta(draft?.bpmn_meta),
    onSessionSync,
    shortErr: shortSessionMetaErr,
    setGenErr: ignoreSessionMetaErr,
  });

  const persistSessionMetaBoundary = useCallback(async (nextMetaRaw, options = {}) => {
    const sid = String(draftSessionId || "").trim();
    const source = String(options?.source || "app_session_meta_write");
    const successHint = String(options?.successHint || "").trim();
    const failureHint = String(options?.failureHint || "Не удалось сохранить session meta.");
    const nextMeta = normalizeBpmnMeta(nextMetaRaw);
    const result = await sessionMetaWriteGateway.persistSessionMeta(nextMeta, {
      source,
      onRollback: ({ prevMeta, writeSeq }) => {
        if (!sid) return;
        onSessionSync(buildSessionMetaWriteEnvelope({
          sessionId: sid,
          bpmnMeta: normalizeBpmnMeta(prevMeta),
          source: `${source}_rollback`,
          writeSeq,
        }));
      },
    });
    if (!result?.ok) {
      const error = String(result?.error || failureHint || "Не удалось сохранить session meta.");
      markFail(error);
      return {
        ok: false,
        error,
        status: Number(result?.status || 0),
      };
    }
    if (successHint) markOk(successHint);
    return {
      ok: true,
      session: result?.session || null,
      writeSeq: Number(result?.writeSeq || 0),
      local: result?.local === true,
      skipped: result?.skipped === true,
      stale: result?.stale === true,
    };
  }, [draftSessionId, markFail, markOk, onSessionSync, sessionMetaWriteGateway]);

  function markOk(hint) {
    setBackendStatus("ok");
    setBackendHint(String(hint || ""));
  }

  function markFail(err) {
    setBackendStatus("fail");
    setBackendHint(String(err || "API error"));
  }

  function logNav(reason, payload = {}) {
    if (typeof window === "undefined") return;
    const isDev = Boolean(import.meta?.env?.DEV) || window.__FPC_DEBUG_NAV__;
    if (!isDev) return;
    const sid = String(payload?.sessionId ?? draft?.session_id ?? "").trim() || "-";
    const pid = String(payload?.projectId ?? projectId ?? "").trim() || "-";
    const route = `${window.location.pathname || ""}${window.location.search || ""}${window.location.hash || ""}`;
    const extra = Object.entries(payload || {})
      .filter(([k]) => k !== "sessionId" && k !== "projectId")
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    // eslint-disable-next-line no-console
    console.debug(`[NAV] session=${sid} project=${pid} route=${route} reason=${String(reason || "-")}${extra ? ` ${extra}` : ""}`);
  }

  const handleStepTimeUnitChange = useCallback((nextUnitRaw) => {
    const nextUnit = normalizeStepTimeUnit(nextUnitRaw);
    setStepTimeUnit((prev) => {
      if (prev === nextUnit) return prev;
      writeStepTimeUnit(nextUnit);
      return nextUnit;
    });
  }, []);

  function handleToggleLeft(source = "button") {
    const rawSource = String(source || "button");
    const shortcutPrefix = "global_handle:";
    const shortcutId = rawSource.startsWith(shortcutPrefix)
      ? String(rawSource.slice(shortcutPrefix.length) || "").trim()
      : "";
    setLeftHidden((prev) => {
      const next = !prev;
      let persisted = 0;
      try {
        window.sessionStorage?.setItem(LEFT_PANEL_OPEN_KEY, next ? "0" : "1");
        persisted = 1;
      } catch {
        persisted = 0;
      }
      if (prev && !next) {
        setLeftCompact(false);
        try {
          window.localStorage?.setItem(LEFT_PANEL_COMPACT_KEY, "0");
        } catch {
        }
      }
      if (prev && !next && shortcutId && shortcutId !== "open") {
        setSidebarShortcutRequest(shortcutId);
        setSidebarActiveSection(shortcutId);
      }
      // eslint-disable-next-line no-console
      console.debug(`[UI] sidebar.toggle next=${next ? 1 : 0} source=${rawSource} persisted=${persisted}`);
      return next;
    });
  }

  function handleSidebarCompact(nextValue, source = "sidebar") {
    const next = typeof nextValue === "boolean" ? nextValue : !leftCompact;
    setLeftCompact(next);
    try {
      window.localStorage?.setItem(LEFT_PANEL_COMPACT_KEY, next ? "1" : "0");
    } catch {
    }
    // eslint-disable-next-line no-console
    console.debug(`[UI] sidebar.compact next=${next ? 1 : 0} source=${String(source || "sidebar")}`);
  }

  const sidebarHandleSections = useMemo(() => {
    const selectedElementId = String(selectedBpmnElement?.id || "").trim();
    const notesMap = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    const aiMapRaw = draft?.interview?.ai_questions_by_element || draft?.interview?.aiQuestionsByElementId || {};
    const selectedAiRaw = aiMapRaw && typeof aiMapRaw === "object" ? aiMapRaw[selectedElementId] : null;
    const selectedAiCount = Array.isArray(selectedAiRaw)
      ? selectedAiRaw.length
      : (Array.isArray(selectedAiRaw?.items) ? selectedAiRaw.items.length : 0);
    const actorsCount = Array.isArray(draft?.actors_derived) && draft.actors_derived.length
      ? draft.actors_derived.length
      : (Array.isArray(draft?.roles) ? draft.roles.length : 0);
    const hasSummary = !!String(notesMap?.[selectedElementId]?.summary || notesMap?.[selectedElementId]?.meta?.summary || "").trim();
    return [
      {
        id: "selected",
        title: selectedElementId ? "Выбранный узел" : "Узел не выбран",
        count: selectedElementId ? 1 : 0,
        active: sidebarActiveSection === "selected",
        muted: !selectedElementId,
      },
      {
        id: "ai",
        title: "AI-вопросы",
        count: selectedAiCount,
        active: sidebarActiveSection === "ai",
      },
      {
        id: "actors",
        title: "Акторы",
        count: actorsCount,
        active: sidebarActiveSection === "actors",
      },
      {
        id: "templates",
        title: "Шаблоны / TL;DR",
        count: hasSummary ? 1 : 0,
        active: sidebarActiveSection === "templates",
      },
    ];
  }, [
    selectedBpmnElement?.id,
    draft?.notes_by_element,
    draft?.notesByElementId,
    draft?.interview?.ai_questions_by_element,
    draft?.interview?.aiQuestionsByElementId,
    draft?.actors_derived,
    draft?.roles,
    sidebarActiveSection,
  ]);

  useEffect(() => {
    activeSessionIdRef.current = String(draft?.session_id || "").trim();
  }, [draft?.session_id]);

  useEffect(() => {
    sessionMetaConflictGuardRef.current = createSessionMetaConflictGuard();
  }, [draft?.session_id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__FPC_E2E__) return;
    window.__FPC_E2E_DRAFT__ = draft;
  }, [draft]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.__FPC_E2E__) return undefined;
    const e2eOpenSession = async (sessionIdRaw) => {
      const sid = String(sessionIdRaw || "").trim();
      if (!sid) return { ok: false, error: "missing_session_id" };
      try {
        await openSession(sid, { source: "e2e_helper" });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error?.message || error || "open_session_failed") };
      }
    };
    window.__FPC_E2E_OPEN_SESSION__ = e2eOpenSession;
    return () => {
      if (window.__FPC_E2E_OPEN_SESSION__ === e2eOpenSession) {
        window.__FPC_E2E_OPEN_SESSION__ = null;
      }
    };
  }, [openSession]);

  useEffect(() => {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return;
    writeLocalBpmnMeta(sid, draft?.bpmn_meta);
  }, [draft?.bpmn_meta, draft?.session_id]);

  useEffect(() => {
    setSelectedBpmnElement(null);
    setProcessUiState(null);
    setAiGenerateIntent(null);
    setSidebarActiveSection("selected");
    setSidebarShortcutRequest("");
  }, [draft?.session_id]);

  async function refreshMeta() {
    const r = await apiMeta();
    if (r.ok) {
      markOk("API OK");
      return true;
    }
    markFail(r.error);
    return false;
  }

  async function refreshProjects() {
    const ok = await refreshMeta();
    if (!ok) return;
    const r = await apiListProjects();
    if (!r.ok) return markFail(r.error);
    const list = ensureArray(r.projects || r.items);
    setProjects(list);
    const preferredFromUrl = String(initialSelectionRef.current?.projectId || "").trim();
    const suppressAutoselect = !!suppressProjectAutoselectRef.current;
    if (suppressAutoselect) {
      suppressProjectAutoselectRef.current = false;
    }
    const current = String(projectId || "").trim();
    if (current) {
      const existsCurrent = list.some((p) => projectIdOf(p) === current);
      if (existsCurrent) return;
      // Current project was deleted or became unavailable; clear stale session context.
      setProjectId("");
      setSessions([]);
      setSessionNavNotice(null);
      requestedSessionIdRef.current = "";
      resetDraft(ensureDraftShape(null));
    }
    if (!list.length) return;
    const preferred = preferredFromUrl && list.some((p) => projectIdOf(p) === preferredFromUrl)
      ? preferredFromUrl
      : "";
    if (!preferred && suppressAutoselect) {
      logNav("project_autoselect_suppressed", {});
      return;
    }
    const nextProjectId = preferred || projectIdOf(list[0]);
    if (nextProjectId) {
      setProjectId(nextProjectId);
      logNav("project_autoselect", { projectId: nextProjectId, fromUrl: preferredFromUrl ? 1 : 0 });
    }
  }

  async function refreshLlmSettings() {
    const r = await apiGetLlmSettings();
    if (!r.ok) {
      setLlmErr(String(r.error || "Не удалось загрузить настройки AI"));
      return r;
    }
    const settings = r.settings || {};
    const hasKey = !!settings.has_api_key;
    setLlmHasApiKey(hasKey);
    setLlmBaseUrl(String(settings.base_url || "https://api.deepseek.com"));
    setLlmErr("");
    setLlmVerifyState(hasKey ? "unknown" : "off");
    setLlmVerifyMsg(hasKey ? "Ключ сохранён." : "Ключ не задан.");
    if (!hasKey) setLlmVerifyAt(0);
    return { ok: true };
  }

  async function verifyLlmSettings(payload) {
    const apiKey = String(payload?.api_key || "").trim();
    const baseUrl = String(payload?.base_url || "").trim() || llmBaseUrl || "https://api.deepseek.com";

    if (!apiKey && !llmHasApiKey) {
      const error = "Сначала сохраните API key.";
      setLlmVerifyState("off");
      setLlmVerifyMsg(error);
      return { ok: false, error };
    }

    setLlmVerifyBusy(true);
    setLlmVerifyState("checking");
    setLlmVerifyMsg("Проверяем подключение к DeepSeek...");
    try {
      const verifyPayload = { api_key: apiKey, base_url: baseUrl };
      const verifyExec = await executeAi({
        toolId: "llm_verify",
        sessionId: String(draft?.session_id || ""),
        projectId: String(projectId || ""),
        inputHash: createAiInputHash({
          base_url: baseUrl,
          has_key: !!(apiKey || llmHasApiKey),
        }),
        payload: verifyPayload,
        mode: "live",
        run: () => apiVerifyLlmSettings(verifyPayload),
      });
      if (!verifyExec.ok) {
        const error = String(verifyExec?.error?.message || "Проверка AI не выполнена");
        const missingEndpoint = Number(verifyExec?.error?.status || 0) === 404;
        setLlmVerifyState(missingEndpoint ? "unknown" : "fail");
        setLlmVerifyMsg(error);
        setLlmVerifyAt(Date.now());
        return { ok: false, error, needs_backend_restart: missingEndpoint };
      }
      const r = verifyExec.result;
      if (!r?.ok) {
        const error = String(r?.error || "Проверка AI не выполнена");
        const missingEndpoint = Number(r?.status) === 404 || !!r?.needs_backend_restart;
        setLlmVerifyState(missingEndpoint ? "unknown" : "fail");
        setLlmVerifyMsg(error);
        setLlmVerifyAt(Date.now());
        return { ok: false, error, needs_backend_restart: missingEndpoint };
      }

      const result = r.result || {};
      if (!result.ok) {
        const error = String(result.error || "DeepSeek не подтвердил запрос");
        const latency = Number(result.latency_ms || 0);
        setLlmVerifyState("fail");
        setLlmVerifyMsg(latency > 0 ? `${error} (${latency} мс)` : error);
        setLlmVerifyAt(Date.now());
        return { ok: false, error };
      }

      const latency = Number(result.latency_ms || 0);
      setLlmVerifyState("ok");
      const cachedLabel = verifyExec.cached ? " · cached" : "";
      setLlmVerifyMsg((latency > 0 ? `AI отвечает (${latency} мс)` : "AI отвечает") + cachedLabel);
      setLlmVerifyAt(Date.now());
      return { ok: true, result };
    } catch (e) {
      const error = String(e?.message || e);
      setLlmVerifyState("fail");
      setLlmVerifyMsg(error);
      setLlmVerifyAt(Date.now());
      return { ok: false, error };
    } finally {
      setLlmVerifyBusy(false);
    }
  }

  async function saveLlmSettings(payload) {
    const apiKey = String(payload?.api_key || "").trim();
    const baseUrl = String(payload?.base_url || "").trim() || "https://api.deepseek.com";

    if (!apiKey) {
      const error = "Вставьте API key DeepSeek для сохранения.";
      setLlmErr(error);
      return { ok: false, error };
    }

    setLlmSaving(true);
    setLlmErr("");
    try {
      const r = await apiPostLlmSettings({ api_key: apiKey, base_url: baseUrl });
      if (!r.ok) {
        setLlmErr(String(r.error || "Не удалось сохранить настройки AI"));
        return r;
      }
      const settings = r.settings || {};
      setLlmHasApiKey(!!settings.has_api_key);
      setLlmBaseUrl(String(settings.base_url || baseUrl));
      setLlmErr("");
      const verifyRes = await verifyLlmSettings({ api_key: apiKey, base_url: String(settings.base_url || baseUrl) });
      if (!verifyRes.ok) {
        if (verifyRes.needs_backend_restart) {
          setLlmErr("Ключ сохранён. Для live-проверки AI перезапустите backend.");
        } else {
          setLlmErr("Ключ сохранён, но проверка AI не прошла.");
        }
      }
      return { ok: true, verify_ok: !!verifyRes.ok };
    } catch (e) {
      const error = String(e?.message || e);
      setLlmErr(error);
      return { ok: false, error };
    } finally {
      setLlmSaving(false);
    }
  }

  async function refreshSessions(pid) {
    const p = String(pid || "");
    if (!p) {
      setSessions([]);
      return;
    }
    logNav("sessions_refresh_start", { projectId: p });
    const r = await apiListProjectSessions(p);
    if (!r.ok) {
      markFail(r.error);
      logNav("sessions_refresh_error", { projectId: p, status: Number(r?.status || 0), error: String(r?.error || "api_error") });
      return;
    }
    markOk("API OK");
    const nextSessions = ensureArray(r.sessions || r.items);
    setSessions(nextSessions);

    const currentSid = String(draft?.session_id || "").trim();
    if (currentSid && !isLocalSessionId(currentSid)) {
      const stillExists = nextSessions.some((s) => sessionIdOf(s) === currentSid);
      if (!stillExists) {
        setSessionNavNotice({
          code: "MISSING_IN_LIST",
          status: 404,
          projectId: p,
          sessionId: currentSid,
          message: `Сессия ${currentSid} не найдена в текущем проекте.`,
        });
        logNav("session_missing_in_list", { projectId: p, sessionId: currentSid });
      } else if (String(sessionNavNotice?.sessionId || "") === currentSid) {
        setSessionNavNotice(null);
      }
    }

    const requestedSid = String(requestedSessionIdRef.current || "").trim();
    if (!requestedSid || isLocalSessionId(requestedSid)) return;
    if (requestedSid === currentSid) return;
    const existsRequested = nextSessions.some((s) => sessionIdOf(s) === requestedSid);
    if (existsRequested) {
      void openSession(requestedSid, { source: "url_restore" });
    }
  }

  async function openSession(sessionId, options = {}) {
    const reqSeq = openSessionReqSeqRef.current + 1;
    openSessionReqSeqRef.current = reqSeq;
    const sid = String(sessionId || "");
    const source = String(options?.source || "manual_select");
    requestedSessionIdRef.current = sid;
    logNav("open_session_start", { sessionId: sid || "-", source });
    logCreateTrace("OPEN_SESSION", {
      phase: "start",
      sid: sid || "-",
      projectId: String(projectId || "-"),
      reqSeq,
    });
    if (!sid) {
      setSessionNavNotice(null);
      resetDraft(ensureDraftShape(null));
      logNav("open_session_empty", { source });
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid: "-",
        projectId: String(projectId || "-"),
        bpmnLen: 0,
        bpmnHash: fnv1aHex(""),
        mode: "empty_sid",
      });
      return;
    }

    if (isLocalSessionId(sid)) {
      setSessionNavNotice(null);
      resetDraft(ensureDraftShape(sid));
      logNav("open_session_local", { sessionId: sid, source });
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid,
        projectId: String(projectId || "-"),
        bpmnLen: 0,
        bpmnHash: fnv1aHex(""),
        mode: "local",
      });
      return;
    }

    const r = await apiGetSession(sid);
    if (reqSeq !== openSessionReqSeqRef.current) return;
    if (!r.ok) {
      const status = Number(r?.status || 0);
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid,
        projectId: String(projectId || "-"),
        ok: 0,
        error: String(r.error || "api_get_session_failed"),
      });
      markFail(r.error);
      const isUnavailable = status === 401 || status === 403 || status === 404;
      if (isUnavailable) {
        setSessionNavNotice({
          code: `HTTP_${status || "ERR"}`,
          status,
          projectId: String(projectId || ""),
          sessionId: sid,
          message: `Сессия недоступна: ${String(r.error || "request failed")}`,
        });
      }
      logNav("open_session_error", { sessionId: sid, source, status, error: String(r?.error || "api_error") });
      return;
    }

    const nextRaw = r.session || ensureDraftShape(sid);
    const sidProject = String(nextRaw?.project_id || projectId || "").trim();
    const backendXml = String(nextRaw?.bpmn_xml || "");
    const backendHash = fnv1aHex(backendXml);
    let restoredFromSnapshot = false;
    let restoredSnapshot = null;
    let next = nextRaw;

    try {
      const latestSnapshot = await getLatestBpmnSnapshot({
        projectId: sidProject,
        sessionId: sid,
      });
      const snapshotXml = String(latestSnapshot?.xml || "");
      const snapshotHash = String(latestSnapshot?.hash || fnv1aHex(snapshotXml));
      if (snapshotXml.trim() && snapshotHash && snapshotHash !== backendHash) {
        restoredFromSnapshot = true;
        restoredSnapshot = latestSnapshot;
        next = {
          ...nextRaw,
          bpmn_xml: snapshotXml,
        };
        logSnapshotTrace("restore_apply", {
          sid,
          projectId: sidProject || "-",
          backendLen: backendXml.length,
          backendHash,
          snapshotLen: snapshotXml.length,
          snapshotHash,
          snapshotTs: Number(latestSnapshot?.ts || 0),
        });
      }
    } catch (snapshotError) {
      logSnapshotTrace("restore_skip_error", {
        sid,
        error: String(snapshotError?.message || snapshotError || "snapshot_read_error"),
      });
    }

    const xml = String(next?.bpmn_xml || "");
    logDraftTrace("DRAFT_REPLACE", {
      sid,
      source: "open_session",
      len: xml.length,
      hash: fnv1aHex(xml),
      stack: shortStack(),
    });
    setDraftPersisted(sessionToDraft(sid, next));
    setSessionNavNotice(null);
    if (restoredFromSnapshot && restoredSnapshot) {
      const ts = Number(restoredSnapshot?.ts || Date.now()) || Date.now();
      setSnapshotRestoreNotice({ sid, ts, nonce: Date.now() });
      void (async () => {
        const putRes = await apiPutBpmnXml(sid, xml, {
          rev: Number(next?.bpmn_xml_version || next?.version || restoredSnapshot?.rev || 0),
        });
        logSnapshotTrace("restore_persist_backend", {
          sid,
          ok: putRes?.ok ? 1 : 0,
          status: Number(putRes?.status || 0),
          len: xml.length,
          hash: fnv1aHex(xml),
        });
      })();
    }
    logCreateTrace("OPEN_SESSION", {
      phase: "done",
      sid,
      projectId: sidProject || "-",
      bpmnLen: xml.length,
      bpmnHash: fnv1aHex(xml),
      ok: 1,
    });
    logNav("open_session_done", { sessionId: sid, projectId: sidProject || projectId, source });
    markOk("API OK");
  }

  async function openWorkspaceSession(sessionLike, options = {}) {
    const row = ensureObject(sessionLike);
    const sid = String(row?.id || row?.session_id || sessionLike || "").trim();
    const pid = String(row?.project_id || "").trim();
    const source = String(options?.source || "workspace_dashboard").trim() || "workspace_dashboard";
    const openTab = String(options?.openTab || "").trim().toLowerCase();
    if (!sid) return;
    if (pid && pid !== String(projectId || "").trim()) {
      setProjectId(pid);
      await refreshSessions(pid);
    }
    await openSession(sid, { source });
    if (openTab === "diagram" || openTab === "interview" || openTab === "xml" || openTab === "doc") {
      setProcessTabIntent({ sid, tab: openTab, nonce: Date.now() });
    }
  }

  function createLocalSession() {
    const sid = `local_${uid()}`;
    resetDraft(ensureDraftShape(sid));
  }

  async function createBackendSession(preferredTitle = "", projectIdOverride = "", aiPrepQuestions = undefined) {
    const pid = String(projectIdOverride || projectId || "");
    if (!pid) return;

    const now = new Date();
    const ts = now.toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const proj = ensureArray(projects).find((p) => projectIdOf(p) === pid);
    const projTitle = projectTitleOf(proj);
    const title =
      String(preferredTitle || "").trim() ||
      (projTitle ? `${projTitle} · ${ts}` : `Сессия ${ts}`);

    logCreateTrace("CREATE_SESSION", {
      phase: "start",
      projectId: pid,
      title,
      mode: SESSION_MODE,
      prepCount: ensureArray(aiPrepQuestions).length,
    });
    const create = await apiCreateProjectSession(pid, SESSION_MODE, title, undefined, undefined, aiPrepQuestions);
    if (!create.ok) {
      logCreateTrace("CREATE_SESSION", {
        phase: "done",
        projectId: pid,
        ok: 0,
        error: String(create.error || "api_create_project_session_failed"),
      });
      return markFail(create.error);
    }

    const sid = String(create.session_id || sessionIdOf(create.session) || "").trim();
    if (!sid) {
      logCreateTrace("CREATE_SESSION", {
        phase: "done",
        projectId: pid,
        ok: 0,
        error: "create session: empty id",
      });
      return markFail("create session: empty id");
    }

    await refreshSessions(pid);
    await openSession(sid);
    logCreateTrace("CREATE_SESSION", {
      phase: "done",
      projectId: pid,
      sid,
      ok: 1,
    });
    return sid;
  }

  async function runSessionFlow(payload) {
    const pid = String(projectId || "");
    if (!pid) return;
    const title = String(payload?.title || "").trim();
    const prepQuestions = ensureArray(payload?.ai_prep_questions);
    const action = String(payload?.action || "interview").trim();

    setSessionFlowBusy(true);
    let success = false;
    try {
      const sid = await createBackendSession(title, pid, prepQuestions);
      if (!sid) return false;

      if (action === "generate") {
        const recomputeExec = await executeAi({
          toolId: "generate_process",
          sessionId: sid,
          projectId: pid,
          inputHash: createAiInputHash({
            sid,
            source: "session_flow_generate",
            prep_count: prepQuestions.length,
          }),
          payload: {
            source: "session_flow_generate",
          },
          mode: "live",
          run: () => apiRecompute(sid),
        });
        if (!recomputeExec.ok) {
          markFail(recomputeExec?.error?.message || "recompute failed");
          return false;
        }
        await openSession(sid);
        setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
      } else {
        setProcessTabIntent({ sid, tab: "interview", nonce: Date.now() });
      }
      setSessionFlowOpen(false);
      markOk("API OK");
      success = true;
    } finally {
      setSessionFlowBusy(false);
    }
    return success;
  }

  async function createProjectFromWizard(payload) {
    const title =
      String(payload?.title || payload?.name || "").trim() ||
      `Проект ${new Date().toLocaleString("ru-RU")}`;
    const passport = payload?.passport && typeof payload.passport === "object" ? payload.passport : {};
    logCreateTrace("CREATE_PROJECT", {
      phase: "start",
      title,
      passportKeys: Object.keys(passport).join(",") || "-",
    });

    const r = await apiCreateProject({ title, passport });
    if (!r.ok) {
      logCreateTrace("CREATE_PROJECT", {
        phase: "done",
        ok: 0,
        title,
        error: String(r.error || "api_create_project_failed"),
      });
      return markFail(r.error);
    }

    const pid = String(r.project?.id || "");
    if (!pid) {
      logCreateTrace("CREATE_PROJECT", {
        phase: "done",
        ok: 0,
        title,
        error: "create project: empty id",
      });
      return markFail("create project: empty id");
    }

    await refreshProjects();
    setProjectId(pid);
    await refreshSessions(pid);
    logCreateTrace("CREATE_PROJECT", {
      phase: "done",
      ok: 1,
      projectId: pid,
      title,
    });
    markOk("API OK");
    setWizardOpen(false);
  }

  function onSessionSync(session) {
    const sid = String(session?.id || session?.session_id || draft?.session_id || "").trim();
    if (!sid) return;
    const activeSid = String(activeSessionIdRef.current || "").trim();
    if (activeSid && sid !== activeSid) return;
    const source = String(session?._sync_source || session?._source || "session_sync");
    setDraftPersisted((prevDraft) => {
      const hydration = applySessionMetaHydration({
        sid,
        activeSessionId: activeSid,
        source,
        payloadRaw: session,
        conflictGuard: sessionMetaConflictGuardRef.current,
        mergeDraft: mergeSessionDraft,
        prevDraft,
      });
      return hydration.nextDraft;
    });
  }

  async function patchDraft(partial) {
    const sid = String(draft?.session_id || "");
    if (!sid || isLocalSessionId(sid)) {
      setDraft((d) => ({ ...d, ...partial }));
      return { ok: true, local: true };
    }

    const r = await apiPatchSession(sid, partial);
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "patch_failed") };
    }
    if (r.session && typeof r.session === "object") {
      onSessionSync({
        ...r.session,
        _sync_source: "patch_draft_session",
      });
    } else {
      onSessionSync({
        id: sid,
        session_id: sid,
        ...partial,
        _sync_source: "patch_draft_local",
      });
    }
    markOk("API OK");
    return { ok: true };
  }

  async function saveActors({ roles, start_role }) {
    const cleanRoles = ensureArray(roles).map((x) => String(x || "").trim()).filter(Boolean);
    const start = String(start_role || "").trim();

    await patchDraft({ roles: cleanRoles, start_role: start });
  }

  async function setStartRole(startRoleId) {
    const start = String(startRoleId || "").trim();
    return patchDraft({ start_role: start });
  }

  async function addNote(text) {
    const sid = String(draft?.session_id || "");
    const t = String(text || "").trim();
    if (!sid || !t) return;

    if (isLocalSessionId(sid)) {
      return { ok: false, error: "Заметки доступны только для API-сессий." };
    }

    const noteExec = await executeAi({
      toolId: "notes_extract_process",
      sessionId: sid,
      projectId: String(projectId || ""),
      inputHash: createAiInputHash({
        sid,
        note: t,
      }),
      payload: { notes: t },
      mode: "live",
      run: () => apiPostNote(sid, { notes: t }),
    });
    if (!noteExec.ok) {
      const error = String(noteExec?.error?.message || "Не удалось обработать заметку.");
      markFail(error);
      return { ok: false, error };
    }
    if (noteExec.cached) {
      const error = "AI недоступен: показан cached ответ. Повторите отправку заметки.";
      markFail(error);
      return { ok: false, error };
    }
    const r = noteExec.result;
    if (!r?.ok) {
      const error = String(r?.error || "Не удалось сохранить заметку.");
      markFail(error);
      return { ok: false, error };
    }

    const sessionFromResp = r.session || r.result || {};
    setDraftPersisted((d) => {
      const pendingItem = {
        text: t,
        ts: Date.now(),
        author: "you",
      };
      const optimistic = mergeGlobalNotesLists(d?.notes, [pendingItem]);
      const merged = mergeGlobalNotesLists(optimistic, sessionFromResp.notes);
      return { ...d, notes: merged };
    });
    markOk("API OK");
    return { ok: true };
  }

  function focusElementNotes(element, source = "diagram_click", options = {}) {
    const selectedIds = ensureArray(element?.selectedIds)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const next = element && typeof element === "object"
      ? {
          id: String(element.id || "").trim(),
          name: String(element.name || element.id || "").trim(),
          type: String(element.type || "").trim(),
          laneName: String(element.laneName || element.lane || element.actorRole || "").trim(),
          selectedIds,
          selectedCount: Number(element.selectedCount || selectedIds.length || 1),
          insertBetween: element?.insertBetween && typeof element.insertBetween === "object"
            ? { ...element.insertBetween }
            : null,
        }
      : null;
    if (!next?.id) {
      setSelectedBpmnElement(null);
      return;
    }
    setSelectedBpmnElement(next);
    const shouldOpenSidebar = (
      options?.openSidebar === true
      || source === "header_open_notes"
      || source === "header_open_ai"
    );
    if (shouldOpenSidebar) {
      setLeftHidden((prev) => {
        if (!prev) return false;
        try {
          window.sessionStorage?.setItem(LEFT_PANEL_OPEN_KEY, "1");
        } catch {
        }
        return false;
      });
    }
    if (source === "header_open_ai") {
      setSidebarActiveSection("ai");
    } else {
      setSidebarActiveSection("selected");
    }
    setElementNotesFocusKey((x) => x + 1);
    if (shouldLogDraftTrace()) {
      // eslint-disable-next-line no-console
      console.debug(`[UI] element_notes.focus sid=${String(draft?.session_id || "-")} elementId=${next.id} source=${source}`);
    }
  }

  function handleBpmnElementSelect(element) {
    const selectedIds = ensureArray(element?.selectedIds)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const next = element && typeof element === "object"
      ? {
          id: String(element.id || "").trim(),
          name: String(element.name || element.id || "").trim(),
          type: String(element.type || "").trim(),
          laneName: String(element.laneName || element.lane || element.actorRole || "").trim(),
          selectedIds,
          selectedCount: Number(element.selectedCount || selectedIds.length || 1),
          insertBetween: element?.insertBetween && typeof element.insertBetween === "object"
            ? { ...element.insertBetween }
            : null,
        }
      : null;
    if (!next?.id) {
      setSelectedBpmnElement(null);
      return;
    }
    focusElementNotes(next, "diagram_select", { openSidebar: false });
  }

  const handleProcessUiStateChange = useCallback((nextState) => {
    const next = nextState && typeof nextState === "object" ? nextState : null;
    if (!next) return;
    setProcessUiState((prev) => {
      if (
        prev
        && prev.sid === next.sid
        && prev.tab === next.tab
        && prev.diagramMode === next.diagramMode
        && prev.selectedElementId === next.selectedElementId
        && prev.hasSession === next.hasSession
        && prev.isLocal === next.isLocal
        && prev.aiQuestionsBusy === next.aiQuestionsBusy
        && prev.canGenerateAiQuestions === next.canGenerateAiQuestions
        && prev.aiGenerateBlockReason === next.aiGenerateBlockReason
        && prev.aiGenerateBlockReasonCode === next.aiGenerateBlockReasonCode
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const requestGenerateAiQuestionsFromSidebar = useCallback(() => {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return;
    setAiGenerateIntent({
      sid,
      nonce: Date.now(),
      source: "notes_panel",
    });
  }, [draft?.session_id]);

  function emitDiagramFlash(detail = {}) {
    if (typeof window === "undefined") return;
    const payload = detail && typeof detail === "object" ? detail : {};
    window.dispatchEvent(new CustomEvent("fpc:diagram_flash", { detail: payload }));
  }

  async function addElementNote(elementId, text) {
    const sid = String(draft?.session_id || "");
    const eid = String(elementId || "").trim();
    const noteText = String(text || "").trim();
    if (!eid || !noteText) return { ok: false, error: "Пустая заметка или элемент не выбран." };

    const current = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    const nextMap = withAddedElementNote(current, eid, noteText);

    if (!sid || isLocalSessionId(sid)) {
      setDraftPersisted((d) => ({ ...d, notes_by_element: nextMap }));
      markOk("Локальная заметка сохранена.");
      emitDiagramFlash({
        sid,
        elementId: eid,
        type: "notes",
        badgeKind: "notes",
        label: "Note added",
      });
      return { ok: true };
    }

    const r = await apiPatchSession(sid, { notes_by_element: nextMap });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось сохранить заметку узла.") };
    }
    const serverMap = normalizeElementNotesMap(r.session?.notes_by_element || nextMap);
    setDraftPersisted((d) => ({ ...d, notes_by_element: serverMap }));
    markOk("API OK");
    emitDiagramFlash({
      sid,
      elementId: eid,
      type: "notes",
      badgeKind: "notes",
      label: "Note added",
    });
    return { ok: true };
  }

  async function setElementNoteSummary(elementId, summaryText, options = {}) {
    const sid = String(draft?.session_id || "");
    const eid = String(elementId || "").trim();
    if (!eid) return { ok: false, error: "Элемент не выбран." };
    const summary = String(summaryText || "").trim();

    const current = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    const nextMap = withElementNoteSummary(current, eid, summary, {
      templateKey: String(options?.templateKey || "").trim(),
    });

    if (!sid || isLocalSessionId(sid)) {
      setDraftPersisted((d) => ({ ...d, notes_by_element: nextMap }));
      markOk("Локальный TL;DR сохранён.");
      emitDiagramFlash({
        sid,
        elementId: eid,
        type: "notes",
        badgeKind: "notes",
        label: "Updated",
      });
      return { ok: true };
    }

    const r = await apiPatchSession(sid, { notes_by_element: nextMap });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось сохранить TL;DR.") };
    }
    const serverMap = normalizeElementNotesMap(r.session?.notes_by_element || nextMap);
    setDraftPersisted((d) => ({ ...d, notes_by_element: serverMap }));
    markOk("API OK");
    emitDiagramFlash({
      sid,
      elementId: eid,
      type: "notes",
      badgeKind: "notes",
      label: "Updated",
    });
    return { ok: true };
  }

  async function setElementStepTime(elementId, stepTimeMinutes, options = {}) {
    const sid = String(draft?.session_id || "");
    const eid = String(elementId || "").trim();
    if (!eid) return { ok: false, error: "Элемент не выбран." };

    const requestedUnit = normalizeStepTimeUnit(options?.unit || "min");
    if (stepTimeMinutes !== null && stepTimeMinutes !== undefined && String(stepTimeMinutes).trim() !== "") {
      const num = Number(stepTimeMinutes);
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
        return {
          ok: false,
          error: `Время шага должно быть целым числом ${requestedUnit === "sec" ? "секунд" : "минут"} (0 или больше).`,
        };
      }
    }
    if (options?.stepTimeSeconds !== null && options?.stepTimeSeconds !== undefined && String(options.stepTimeSeconds).trim() !== "") {
      const secondsRaw = Number(options.stepTimeSeconds);
      if (!Number.isFinite(secondsRaw) || secondsRaw < 0 || !Number.isInteger(secondsRaw)) {
        return { ok: false, error: "Время шага в секундах должно быть целым числом (0 или больше)." };
      }
    }
    const nextStepTime = normalizeStepTimeMinutes(stepTimeMinutes);
    const nextStepTimeSec = nextStepTime === null
      ? null
      : normalizeStepTimeSeconds(
        options?.stepTimeSeconds !== undefined
          ? options.stepTimeSeconds
          : nextStepTime * 60,
      );

    const baseNodes = ensureArray(draft?.nodes).map((node) => ({
      ...ensureObject(node),
      parameters: { ...ensureObject(node?.parameters) },
    }));
    let nodeFound = false;
    let nodesChanged = false;
    const nextNodes = baseNodes.map((node) => {
      if (String(node?.id || "").trim() !== eid) return node;
      nodeFound = true;
      const nextNode = {
        ...node,
        parameters: { ...ensureObject(node?.parameters) },
      };
      const prevStepTime = readNodeStepTimeMinutes(node);
      const prevStepTimeSec = readNodeStepTimeSeconds(node);
      if (prevStepTime === nextStepTime && prevStepTimeSec === nextStepTimeSec) return nextNode;
      nodesChanged = true;
      if (nextStepTime === null) {
        delete nextNode.step_time_min;
        delete nextNode.stepTimeMin;
        nextNode.duration_min = null;
        delete nextNode.durationMin;
        delete nextNode.step_time_sec;
        delete nextNode.stepTimeSec;
        nextNode.duration_sec = null;
        delete nextNode.durationSec;
        delete nextNode.parameters.step_time_min;
        delete nextNode.parameters.stepTimeMin;
        delete nextNode.parameters.duration_min;
        delete nextNode.parameters.durationMin;
        delete nextNode.parameters.step_time_sec;
        delete nextNode.parameters.stepTimeSec;
        delete nextNode.parameters.duration_sec;
        delete nextNode.parameters.durationSec;
        delete nextNode.parameters.duration;
      } else {
        nextNode.step_time_min = nextStepTime;
        nextNode.duration_min = nextStepTime;
        nextNode.step_time_sec = nextStepTimeSec;
        nextNode.duration_sec = nextStepTimeSec;
        nextNode.parameters.step_time_min = nextStepTime;
        nextNode.parameters.duration_min = nextStepTime;
        nextNode.parameters.step_time_sec = nextStepTimeSec;
        nextNode.parameters.duration_sec = nextStepTimeSec;
        nextNode.parameters.duration = nextStepTime;
      }
      return nextNode;
    });
    if (!nodeFound) return { ok: false, error: "Выбранный элемент не найден в списке BPMN-узлов." };

    const baseInterview = ensureObject(draft?.interview);
    const baseSteps = ensureArray(baseInterview.steps).map((step) => ({ ...ensureObject(step) }));
    let stepsChanged = false;
    const nextSteps = baseSteps.map((step) => {
      const stepNodeId = String(step?.node_bind_id || step?.node_id || step?.nodeId || "").trim();
      if (stepNodeId !== eid) return step;
      const nextStep = { ...step };
      const nextDurationValue = nextStepTime === null ? "" : String(nextStepTime);
      const nextDurationSecValue = nextStepTimeSec === null ? "" : String(nextStepTimeSec);
      if (String(nextStep.duration_min ?? "").trim() !== nextDurationValue) {
        nextStep.duration_min = nextDurationValue;
        stepsChanged = true;
      }
      if (String(nextStep.duration_sec ?? "").trim() !== nextDurationSecValue) {
        nextStep.duration_sec = nextDurationSecValue;
        stepsChanged = true;
      }
      if (nextStepTime === null) {
        if (Object.prototype.hasOwnProperty.call(nextStep, "step_time_min")) {
          delete nextStep.step_time_min;
          stepsChanged = true;
        }
        if (Object.prototype.hasOwnProperty.call(nextStep, "step_time_sec")) {
          delete nextStep.step_time_sec;
          stepsChanged = true;
        }
      } else {
        if (Number(nextStep.step_time_min) !== nextStepTime) {
          nextStep.step_time_min = nextStepTime;
          stepsChanged = true;
        }
        if (Number(nextStep.step_time_sec) !== nextStepTimeSec) {
          nextStep.step_time_sec = nextStepTimeSec;
          stepsChanged = true;
        }
      }
      return nextStep;
    });
    const nextInterview = stepsChanged ? { ...baseInterview, steps: nextSteps } : baseInterview;

    if (!nodesChanged && !stepsChanged) return { ok: true, skipped: true };

    setDraftPersisted((prev) => ({
      ...prev,
      nodes: nextNodes,
      ...(stepsChanged ? { interview: nextInterview } : {}),
    }));
    emitDiagramFlash({
      sid,
      elementId: eid,
      type: "sync",
      label: "Время шага обновлено",
    });

    if (!sid || isLocalSessionId(sid)) {
      markOk("Локальное время шага сохранено.");
      return { ok: true };
    }

    const payload = {
      nodes: nextNodes,
      ...(stepsChanged ? { interview: nextInterview } : {}),
    };
    const r = await apiPatchSession(sid, payload);
    if (!r.ok) {
      setDraftPersisted((prev) => ({
        ...prev,
        nodes: baseNodes,
        ...(stepsChanged ? { interview: baseInterview } : {}),
      }));
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось сохранить время шага.") };
    }

    if (r.session && typeof r.session === "object") {
      onSessionSync({
        ...r.session,
        _sync_source: "notespanel_step_time_update",
      });
    } else {
      setDraftPersisted((prev) => ({
        ...prev,
        nodes: nextNodes,
        ...(stepsChanged ? { interview: nextInterview } : {}),
      }));
    }
    markOk("API OK");
    return { ok: true };
  }

  async function setFlowHappyPath(flowIdRaw, tierRaw, options = {}) {
    const sid = String(draft?.session_id || "");
    const flowId = String(flowIdRaw || "").trim();
    if (!flowId) return { ok: false, error: "Переход не выбран." };
    const tier = normalizeFlowTier(tierRaw);
    const xorConflictFlowIds = ensureArray(options?.xorConflictFlowIds)
      .map((id) => String(id || "").trim())
      .filter((id) => id && id !== flowId);
    const xorTier = normalizeFlowTier(options?.xorTier || tier);

    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const currentFlowMeta = normalizeFlowMetaMap(currentMeta.flow_meta);
    const currentNodePathMeta = normalizeNodePathMetaMap(currentMeta.node_path_meta);
    const currentRobotMetaByElementId = normalizeRobotMetaMap(currentMeta.robot_meta_by_element_id);
    const currentHybridLayerByElementId = normalizeHybridLayerMap(currentMeta.hybrid_layer_by_element_id);
    const currentExecutionPlans = normalizeExecutionPlans(currentMeta.execution_plans);
    const nextFlowMeta = { ...currentFlowMeta };
    if (xorConflictFlowIds.length && (xorTier === "P0" || xorTier === "P1")) {
      xorConflictFlowIds.forEach((conflictFlowId) => {
        const prev = ensureObject(nextFlowMeta[conflictFlowId]);
        const next = { ...prev };
        delete next.tier;
        if (next.rtier) nextFlowMeta[conflictFlowId] = next;
        else delete nextFlowMeta[conflictFlowId];
      });
    }
    if (tier) {
      const prev = ensureObject(nextFlowMeta[flowId]);
      nextFlowMeta[flowId] = { ...prev, tier };
    } else {
      const prev = ensureObject(nextFlowMeta[flowId]);
      const next = { ...prev };
      delete next.tier;
      if (next.rtier) nextFlowMeta[flowId] = next;
      else delete nextFlowMeta[flowId];
    }
    const optimisticMeta = {
      version: Number(currentMeta.version) > 0 ? Number(currentMeta.version) : 1,
      flow_meta: nextFlowMeta,
      node_path_meta: currentNodePathMeta,
      robot_meta_by_element_id: currentRobotMetaByElementId,
      hybrid_layer_by_element_id: currentHybridLayerByElementId,
      hybrid_v2: currentMeta.hybrid_v2,
      drawio: currentMeta.drawio,
      execution_plans: currentExecutionPlans,
    };
    const persistResult = await persistSessionMetaBoundary(optimisticMeta, {
      source: "flow_happy_path_save",
      successHint: sid && !isLocalSessionId(sid) ? "Уровень пути сохранён" : "Локальный уровень пути обновлён.",
      failureHint: "Не удалось сохранить happy-path.",
    });
    if (!persistResult?.ok) {
      return { ok: false, error: String(persistResult?.error || "Не удалось сохранить happy-path.") };
    }

    const serverMeta = normalizeBpmnMeta(ensureObject(ensureObject(persistResult?.session).bpmn_meta));
    const normalizedFlowMeta = normalizeFlowMetaMap(serverMeta.flow_meta);
    const requestedTier = tier;
    let normalizationNotice = "";
    if (requestedTier && Object.keys(normalizedFlowMeta).length && normalizedFlowMeta[flowId]?.tier !== requestedTier) {
      const competingFlowIds = [flowId, ...xorConflictFlowIds];
      const keptFlowId = Object.keys(normalizedFlowMeta).find((id) => (
        competingFlowIds.includes(id) && normalizeFlowTier(normalizedFlowMeta[id]?.tier) === requestedTier
      ));
      normalizationNotice = keptFlowId
        ? `Нормализация: ${requestedTier} оставлен на ${keptFlowId}.`
        : `Нормализация: ${requestedTier} скорректирован по правилам XOR.`;
    } else if (xorConflictFlowIds.length && requestedTier) {
      normalizationNotice = `Нормализация: ${requestedTier} оставлен на ${flowId}, конфликтующие значения сняты.`;
    }
    if (normalizationNotice) markOk(normalizationNotice);
    return {
      ok: true,
      normalizedConflicts: xorConflictFlowIds,
      normalizationNotice,
    };
  }

  async function setNodePathAssignments(updatesRaw, options = {}) {
    const sid = String(draft?.session_id || "");
    const updatesInput = ensureArray(updatesRaw);
    if (!updatesInput.length) return { ok: false, error: "Нет изменений для path-тегов." };

    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const currentFlowMeta = normalizeFlowMetaMap(currentMeta.flow_meta);
    const currentNodePathMeta = normalizeNodePathMetaMap(currentMeta.node_path_meta);
    const currentRobotMetaByElementId = normalizeRobotMetaMap(currentMeta.robot_meta_by_element_id);
    const currentHybridLayerByElementId = normalizeHybridLayerMap(currentMeta.hybrid_layer_by_element_id);
    const currentExecutionPlans = normalizeExecutionPlans(currentMeta.execution_plans);
    const nextNodePathMeta = { ...currentNodePathMeta };
    const apiUpdates = [];

    updatesInput.forEach((rawUpdate) => {
      const update = ensureObject(rawUpdate);
      const nodeId = String(update.node_id || update.nodeId || "").trim();
      if (!nodeId) return;
      const normalizedEntry = normalizeNodePathEntry({
        paths: Object.prototype.hasOwnProperty.call(update, "paths") ? update.paths : currentNodePathMeta[nodeId]?.paths,
        sequence_key: Object.prototype.hasOwnProperty.call(update, "sequence_key") ? update.sequence_key : (
          Object.prototype.hasOwnProperty.call(update, "sequenceKey") ? update.sequenceKey : currentNodePathMeta[nodeId]?.sequence_key
        ),
        source: Object.prototype.hasOwnProperty.call(update, "source") ? update.source : (options?.source || "manual"),
      });

      if (normalizedEntry) {
        nextNodePathMeta[nodeId] = normalizedEntry;
        apiUpdates.push({
          node_id: nodeId,
          paths: normalizedEntry.paths,
          sequence_key: normalizedEntry.sequence_key || null,
          source: normalizedEntry.source,
        });
      } else {
        delete nextNodePathMeta[nodeId];
        apiUpdates.push({
          node_id: nodeId,
          paths: [],
          sequence_key: null,
          source: String(update.source || options?.source || "manual"),
        });
      }
    });

    if (!apiUpdates.length) return { ok: false, error: "Нет валидных узлов для обновления." };

    const optimisticMeta = {
      version: Number(currentMeta.version) > 0 ? Number(currentMeta.version) : 1,
      flow_meta: currentFlowMeta,
      node_path_meta: nextNodePathMeta,
      robot_meta_by_element_id: currentRobotMetaByElementId,
      hybrid_layer_by_element_id: currentHybridLayerByElementId,
      hybrid_v2: currentMeta.hybrid_v2,
      drawio: currentMeta.drawio,
      execution_plans: currentExecutionPlans,
    };
    const persistResult = await persistSessionMetaBoundary(optimisticMeta, {
      source: "node_path_meta_save",
      successHint: sid && !isLocalSessionId(sid) ? "Разметка Paths сохранена" : "Локальная разметка Paths обновлена.",
      failureHint: "Не удалось сохранить разметку Paths.",
    });
    if (!persistResult?.ok) {
      return { ok: false, error: String(persistResult?.error || "Не удалось сохранить разметку Paths.") };
    }
    return { ok: true, applied: apiUpdates.length };
  }

  async function setElementRobotMeta(elementIdRaw, robotMetaRaw, options = {}) {
    const sid = String(draft?.session_id || "").trim();
    const elementId = String(elementIdRaw || "").trim();
    if (!elementId) return { ok: false, error: "Не выбран BPMN-элемент." };

    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const currentFlowMeta = normalizeFlowMetaMap(currentMeta.flow_meta);
    const currentNodePathMeta = normalizeNodePathMetaMap(currentMeta.node_path_meta);
    const currentRobotMetaByElementId = normalizeRobotMetaMap(currentMeta.robot_meta_by_element_id);
    const currentHybridLayerByElementId = normalizeHybridLayerMap(currentMeta.hybrid_layer_by_element_id);
    const currentExecutionPlans = normalizeExecutionPlans(currentMeta.execution_plans);
    const shouldRemove = options?.remove === true || robotMetaRaw === null;
    let nextRobotMetaByElementId = currentRobotMetaByElementId;
    if (shouldRemove) {
      nextRobotMetaByElementId = removeRobotMetaByElementId(currentRobotMetaByElementId, elementId);
    } else {
      const validation = validateRobotMetaV1(robotMetaRaw);
      if (!validation.ok) {
        return { ok: false, error: `Некорректные поля Robot Meta: ${validation.errors.join("; ")}` };
      }
      nextRobotMetaByElementId = upsertRobotMetaByElementId(
        currentRobotMetaByElementId,
        elementId,
        validation.value,
      );
    }

    const optimisticMeta = {
      version: Number(currentMeta.version) > 0 ? Number(currentMeta.version) : 1,
      flow_meta: currentFlowMeta,
      node_path_meta: currentNodePathMeta,
      robot_meta_by_element_id: nextRobotMetaByElementId,
      hybrid_layer_by_element_id: currentHybridLayerByElementId,
      hybrid_v2: currentMeta.hybrid_v2,
      drawio: currentMeta.drawio,
      execution_plans: currentExecutionPlans,
    };
    const persistResult = await persistSessionMetaBoundary(optimisticMeta, {
      source: "robot_meta_save",
      successHint: sid && !isLocalSessionId(sid)
        ? (shouldRemove ? "Robot Meta удалена." : "Robot Meta сохранена.")
        : (shouldRemove ? "Robot Meta удалена локально." : "Robot Meta сохранена локально."),
      failureHint: "Не удалось сохранить Robot Meta.",
    });
    if (!persistResult?.ok) {
      return { ok: false, error: String(persistResult?.error || "Не удалось сохранить Robot Meta.") };
    }
    return { ok: true };
  }

  function guessScopeStartIdFromDraft(draftRaw) {
    const interview = ensureObject(draftRaw?.interview);
    const steps = ensureArray(interview.steps)
      .map((step, idx) => {
        const row = ensureObject(step);
        const orderIndex = Number(row.order_index || row.order || idx + 1);
        const nodeId = String(
          row.bpmn_ref
            || row.bpmnRef
            || row.node_bind_id
            || row.nodeBindId
            || row.node_id
            || row.nodeId
            || "",
        ).trim();
        return {
          nodeId,
          orderIndex: Number.isFinite(orderIndex) && orderIndex > 0 ? Math.floor(orderIndex) : idx + 1,
          idx,
        };
      })
      .filter((row) => row.nodeId);
    if (!steps.length) return "";
    steps.sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0) || Number(a.idx || 0) - Number(b.idx || 0));
    return String(steps[0]?.nodeId || "").trim();
  }

  async function recalculateRtiers(options = {}) {
    const sid = String(draft?.session_id || "").trim();
    if (!sid || isLocalSessionId(sid)) {
      return { ok: false, error: "Пересчёт R-tier доступен только для backend-сессии." };
    }
    const scopeStartId = String(options?.scopeStartId || guessScopeStartIdFromDraft(draft) || "").trim();
    const payload = {};
    if (scopeStartId) payload.scopeStartId = scopeStartId;
    if (Array.isArray(options?.successEndIds) && options.successEndIds.length) payload.successEndIds = options.successEndIds;
    if (Array.isArray(options?.failEndIds) && options.failEndIds.length) payload.failEndIds = options.failEndIds;

    const result = await apiInferBpmnRtiers(sid, payload);
    if (!result?.ok) {
      markFail(result?.error || "Не удалось пересчитать R-tier.");
      return { ok: false, error: String(result?.error || "Не удалось пересчитать R-tier.") };
    }

    const serverMeta = ensureObject(result.meta);
    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const currentExecutionPlans = normalizeExecutionPlans(currentMeta.execution_plans);
    const normalizedFlowMeta = normalizeFlowMetaMap(serverMeta?.flow_meta);
    const normalizedNodePathMeta = normalizeNodePathMetaMap(serverMeta?.node_path_meta);
    const normalizedRobotMetaByElementId = normalizeRobotMetaMap(serverMeta?.robot_meta_by_element_id);
    const normalizedHybridLayerByElementId = normalizeHybridLayerMap(serverMeta?.hybrid_layer_by_element_id);
    const normalizedExecutionPlans = normalizeExecutionPlans(serverMeta?.execution_plans);
    const effectiveExecutionPlans = normalizedExecutionPlans.length ? normalizedExecutionPlans : currentExecutionPlans;
    const nextMeta = {
      version: Number(serverMeta?.version) > 0 ? Number(serverMeta.version) : 1,
      flow_meta: normalizedFlowMeta,
      node_path_meta: normalizedNodePathMeta,
      robot_meta_by_element_id: normalizedRobotMetaByElementId,
      hybrid_layer_by_element_id: normalizedHybridLayerByElementId,
      hybrid_v2: mergeHybridV2Doc(serverMeta?.hybrid_v2, currentMeta.hybrid_v2),
      drawio: mergeDrawioMeta(serverMeta?.drawio, currentMeta.drawio),
      execution_plans: effectiveExecutionPlans,
    };
    setDraftPersisted((prev) => ({
      ...prev,
      bpmn_meta: nextMeta,
    }));
    writeLocalBpmnMeta(sid, nextMeta);
    markOk("R-tier пересчитан и сохранён.");
    return { ok: true, inference: ensureObject(result.inference), meta: nextMeta };
  }

  async function updateElementAiQuestion(elementId, questionId, patch = {}) {
    const sid = String(draft?.session_id || "");
    const eid = String(elementId || "").trim();
    const qid = String(questionId || "").trim();
    if (!eid || !qid) return { ok: false, error: "Не найден элемент или вопрос." };

    const interviewNow = ensureObject(draft?.interview);
    const aiMapNow = normalizeAiQuestionsByElementForMerge(
      interviewNow.ai_questions_by_element || interviewNow.aiQuestionsByElementId,
    );
    const listNow = ensureArray(aiMapNow[eid]).map((item) => ({ ...item }));
    const idx = listNow.findIndex((item) => String(item?.qid || item?.id || "").trim() === qid);
    if (idx < 0) return { ok: false, error: "Вопрос для выбранного узла не найден." };

    const prev = ensureObject(listNow[idx]);
    const hasStatusPatch = hasOwn(patch, "status");
    const hasCommentPatch = hasOwn(patch, "comment");
    const nextStatus = hasStatusPatch
      ? String(patch?.status || "").trim().toLowerCase() === "done" ? "done" : "open"
      : String(prev?.status || "open").trim().toLowerCase() === "done" ? "done" : "open";
    const nextComment = hasCommentPatch
      ? String(patch?.comment || "").trim()
      : String(prev?.comment || "").trim();

    if (
      nextStatus === (String(prev?.status || "open").trim().toLowerCase() === "done" ? "done" : "open")
      && nextComment === String(prev?.comment || "").trim()
    ) {
      return { ok: true, skipped: true };
    }

    listNow[idx] = {
      ...prev,
      status: nextStatus,
      comment: nextComment,
      updatedAt: Date.now(),
    };
    const nextMap = {
      ...aiMapNow,
      [eid]: listNow,
    };
    const nextInterview = {
      ...interviewNow,
      ai_questions_by_element: nextMap,
    };

    setDraftPersisted((d) => ({
      ...d,
      interview: nextInterview,
    }));

    if (!sid || isLocalSessionId(sid)) {
      return { ok: true };
    }

    const r = await apiPatchSession(sid, { interview: nextInterview });
    if (!r.ok) {
      setDraftPersisted((d) => ({
        ...d,
        interview: interviewNow,
      }));
      return { ok: false, error: String(r.error || "Не удалось сохранить AI-комментарий.") };
    }

    if (r.session && typeof r.session === "object") {
      onSessionSync({
        ...r.session,
        _sync_source: "notespanel_ai_question_update",
      });
    }
    markOk("API OK");
    return { ok: true };
  }

  async function remapElementNotes(oldElementId, newElementId, meta = {}) {
    const sid = String(draft?.session_id || "");
    const oldId = String(oldElementId || "").trim();
    const newId = String(newElementId || "").trim();
    if (!oldId || !newId) return { ok: true, moved: false };

    const snapshotRaw = ensureObject(meta?.notesEntry);
    const snapshotItems = ensureArray(snapshotRaw.items)
      .map((item) => ({ ...ensureObject(item) }))
      .filter((item) => String(item?.text || "").trim());
    const snapshotEntry = snapshotItems.length
      ? {
          items: snapshotItems,
          updatedAt: Number(snapshotRaw.updatedAt || Date.now()) || Date.now(),
        }
      : null;

    const current = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    try {
      if (typeof window !== "undefined" && (window.__FPC_E2E__ || shouldLogDraftTrace())) {
        const prev = Array.isArray(window.__FPC_NOTES_REMAP_LOG__) ? window.__FPC_NOTES_REMAP_LOG__ : [];
        const next = [
          ...prev,
          {
            ts: Date.now(),
            sid: sid || "-",
            oldId,
            newId,
            forceRestore: meta?.forceRestore ? 1 : 0,
            source: String(meta?.source || "shape_replace"),
            currentKeys: Object.keys(current || {}),
            hasSnapshot: snapshotEntry ? 1 : 0,
          },
        ];
        if (next.length > 120) next.splice(0, next.length - 120);
        window.__FPC_NOTES_REMAP_LOG__ = next;
      }
    } catch {
    }
    const hasOld = Object.prototype.hasOwnProperty.call(current, oldId)
      && ensureArray(current?.[oldId]?.items).length > 0;
    let nextMap = current;
    if (oldId === newId) {
      if (!snapshotEntry) return { ok: true, moved: false };
      const currentCount = ensureArray(current?.[newId]?.items).length;
      if (currentCount > 0 && !meta?.forceRestore) return { ok: true, moved: false };
      nextMap = {
        ...current,
        [newId]: snapshotEntry,
      };
    } else {
      if (!hasOld && !snapshotEntry) return { ok: true, moved: false };
      nextMap = withRemappedElementNotes(current, oldId, newId);
      if (snapshotEntry && ensureArray(nextMap?.[newId]?.items).length === 0) {
        nextMap = {
          ...nextMap,
          [newId]: snapshotEntry,
        };
      }
    }

    if (shouldLogDraftTrace()) {
      // eslint-disable-next-line no-console
      console.debug(
        `[NOTES_REMAP] sid=${sid || "-"} oldId=${oldId} newId=${newId} source=${String(meta?.source || "shape_replace")} oldType=${String(meta?.oldType || "-")} newType=${String(meta?.newType || "-")} forceRestore=${meta?.forceRestore ? 1 : 0}`,
      );
    }
    try {
      if (typeof window !== "undefined" && (window.__FPC_E2E__ || shouldLogDraftTrace())) {
        const prev = Array.isArray(window.__FPC_NOTES_REMAP_LOG__) ? window.__FPC_NOTES_REMAP_LOG__ : [];
        const next = [
          ...prev,
          {
            ts: Date.now(),
            sid: sid || "-",
            stage: "apply",
            oldId,
            newId,
            nextKeys: Object.keys(nextMap || {}),
            nextCount: ensureArray(nextMap?.[newId]?.items).length,
          },
        ];
        if (next.length > 120) next.splice(0, next.length - 120);
        window.__FPC_NOTES_REMAP_LOG__ = next;
      }
    } catch {
    }

    const reinforceNotesMap = () => {
      setDraftPersisted((d) => {
        const currentMap = normalizeElementNotesMap(d?.notes_by_element || d?.notesByElementId);
        const currentCount = ensureArray(currentMap?.[newId]?.items).length;
        if (currentCount > 0 && !meta?.forceRestore) return d;
        return { ...d, notes_by_element: nextMap };
      });
    };

    reinforceNotesMap();
    try {
      window.setTimeout(() => reinforceNotesMap(), 180);
    } catch {
    }
    setSelectedBpmnElement((prev) => {
      const prevId = String(prev?.id || "").trim();
      if (prevId !== oldId) return prev;
      return {
        ...prev,
        id: newId,
        name: String(prev?.name || newId),
      };
    });

    if (!sid || isLocalSessionId(sid)) {
      return { ok: true, moved: true };
    }

    const r = await apiPatchSession(sid, { notes_by_element: nextMap });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось перенести заметки узла.") };
    }
    const serverMap = normalizeElementNotesMap(r.session?.notes_by_element || {});
    const mergedServerMap = normalizeElementNotesMap({
      ...serverMap,
      ...nextMap,
    });
    if (oldId !== newId) {
      delete mergedServerMap[oldId];
    }
    setDraftPersisted((d) => ({ ...d, notes_by_element: mergedServerMap }));
    markOk("API OK");
    return { ok: true, moved: true };
  }

  async function generateProcess() {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return { ok: false, error: "Сначала выберите сессию." };
    if (isLocalSessionId(sid)) return { ok: false, error: "recompute доступен только для API-сессий." };
    if (locked) return { ok: false, error: "Сначала настройте роли и start_role." };

    const recomputeExec = await executeAi({
      toolId: "generate_process",
      sessionId: sid,
      projectId: String(projectId || ""),
      inputHash: createAiInputHash({
        sid,
        source: "app_generate_process",
        bpmn_len: String(draft?.bpmn_xml || "").length,
      }),
      payload: {
        source: "app_generate_process",
      },
      mode: "live",
      run: () => apiRecompute(sid),
    });
    if (!recomputeExec.ok) {
      const err = String(recomputeExec?.error?.message || "recompute failed");
      markFail(err);
      return { ok: false, error: err };
    }
    const r = recomputeExec.result;
    if (!r?.ok) {
      markFail(r?.error || "recompute failed");
      return { ok: false, error: String(r?.error || "recompute failed") };
    }

    onSessionSync(r.result || {});
    setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
    setReloadKey((x) => x + 1);
    markOk("API OK");
    return { ok: true };
  }

  function returnToSessionList(reason = "manual_return") {
    logNav("return_to_session_list", { reason });
    setSessionNavNotice(null);
    requestedSessionIdRef.current = "";
    resetDraft(ensureDraftShape(null));
  }

  async function deleteCurrentProject(options = {}) {
    if (!canManageProjectEntities) return { ok: false, error: "forbidden" };
    const pid = String(projectId || "");
    if (!pid) return { ok: false, error: "Проект не выбран." };
    const skipConfirm = !!options?.skipConfirm;
    if (!skipConfirm) {
      const ok = confirm("Удалить проект и все сессии?");
      if (!ok) return { ok: false, cancelled: true };
    }

    const r = await apiDeleteProject(pid);
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "delete_project_failed") };
    }

    suppressProjectAutoselectRef.current = true;
    setProjects((prev) => ensureArray(prev).filter((item) => projectIdOf(item) !== pid));
    setProjectId("");
    setSessions([]);
    returnToSessionList("project_deleted");
    await refreshProjects();
    markOk("API OK");
    return { ok: true };
  }

  async function deleteCurrentSession(options = {}) {
    if (!canManageProjectEntities) return { ok: false, error: "forbidden" };
    const sid = String(draft?.session_id || "");
    if (!sid || isLocalSessionId(sid)) {
      returnToSessionList("local_session_clear");
      return { ok: true };
    }
    const skipConfirm = !!options?.skipConfirm;
    if (!skipConfirm) {
      const ok = confirm("Удалить сессию?");
      if (!ok) return { ok: false, cancelled: true };
    }

    const r = await apiDeleteSession(sid);
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "delete_session_failed") };
    }

    returnToSessionList("session_deleted");
    await refreshSessions(projectId);
    markOk("API OK");
    return { ok: true };
  }

  function openRenameDialog(scope) {
    if (!canManageProjectEntities) return;
    const kind = String(scope || "").trim();
    if (!(kind === "project" || kind === "session")) return;
    const currentValue = kind === "project"
      ? String(projects.find((p) => projectIdOf(p) === String(projectId || ""))?.title || "").trim()
      : String(draft?.title || sessions.find((s) => sessionIdOf(s) === String(draft?.session_id || ""))?.title || "").trim();
    setRenameDialog({ open: true, scope: kind, value: currentValue, error: "", busy: false });
  }

  function openDeleteDialog(scope) {
    if (!canManageProjectEntities) return;
    const kind = String(scope || "").trim();
    if (!(kind === "project" || kind === "session")) return;
    setDeleteDialog({ open: true, scope: kind, error: "", busy: false });
  }

  async function submitRenameDialog() {
    const scope = String(renameDialog?.scope || "").trim();
    const nextTitle = String(renameDialog?.value || "").trim();
    if (!nextTitle) {
      setRenameDialog((prev) => ({ ...prev, error: "Введите название." }));
      return;
    }
    setRenameDialog((prev) => ({ ...prev, busy: true, error: "" }));
    try {
      if (scope === "project") {
        const pid = String(projectId || "").trim();
        if (!pid) throw new Error("Проект не выбран.");
        const r = await apiPatchProject(pid, { title: nextTitle });
        if (!r.ok) throw new Error(String(r.error || "Не удалось переименовать проект."));
        await refreshProjects();
      } else if (scope === "session") {
        const sid = String(draft?.session_id || "").trim();
        if (!sid || isLocalSessionId(sid)) throw new Error("Сессия не выбрана.");
        const r = await apiPatchSession(sid, { title: nextTitle });
        if (!r.ok) throw new Error(String(r.error || "Не удалось переименовать сессию."));
        onSessionSync(r.session || { id: sid, title: nextTitle, _sync_source: "rename_session" });
        await refreshSessions(projectId);
      }
      setRenameDialog({ open: false, scope: "", value: "", error: "", busy: false });
      markOk("API OK");
    } catch (error) {
      setRenameDialog((prev) => ({ ...prev, busy: false, error: String(error?.message || error || "rename_failed") }));
    }
  }

  async function submitDeleteDialog() {
    const scope = String(deleteDialog?.scope || "").trim();
    setDeleteDialog((prev) => ({ ...prev, busy: true, error: "" }));
    try {
      let result = { ok: false, error: "unknown_scope" };
      if (scope === "project") {
        result = await deleteCurrentProject({ skipConfirm: true });
      } else if (scope === "session") {
        result = await deleteCurrentSession({ skipConfirm: true });
      }
      if (!result?.ok) {
        setDeleteDialog((prev) => ({ ...prev, busy: false, error: String(result?.error || "delete_failed") }));
        return;
      }
      setDeleteDialog({ open: false, scope: "", error: "", busy: false });
    } catch (error) {
      setDeleteDialog((prev) => ({ ...prev, busy: false, error: String(error?.message || error || "delete_failed") }));
    }
  }

  // Sessions are valid even without predefined actors; keep editing flow open.
  const locked = false;

  const phase = useMemo(() => {
    const sid = String(draft?.session_id || "");
    if (!sid) return "no_session";
    return "notes";
  }, [draft]);

  const currentProjectTitle = useMemo(() => {
    const pid = String(projectId || "").trim();
    if (!pid) return "";
    const found = projects.find((item) => projectIdOf(item) === pid);
    return String(found?.title || found?.name || "").trim();
  }, [projects, projectId]);

  const currentSessionTitle = useMemo(() => {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return "";
    const found = sessions.find((item) => sessionIdOf(item) === sid);
    return String(found?.title || found?.name || draft?.title || "").trim();
  }, [sessions, draft?.session_id, draft?.title]);

  const left = useMemo(() => {
    if (phase === "no_session") {
      return (
        <NoSession
          backendHint={backendHint}
          projectId={projectId}
          onNewProject={() => setWizardOpen(true)}
          onNewBackendSession={() => setSessionFlowOpen(true)}
        />
      );
    }

    return (
      <NotesPanel
        draft={draft}
        projectId={projectId}
        projectTitle={currentProjectTitle}
        sessionTitle={currentSessionTitle}
        selectedElement={selectedBpmnElement}
        elementNotesFocusKey={elementNotesFocusKey}
        onAddNote={addNote}
        onAddElementNote={addElementNote}
        onSetElementStepTime={setElementStepTime}
        onSetElementNoteSummary={setElementNoteSummary}
        onUpdateElementAiQuestion={updateElementAiQuestion}
        onSetStartRole={setStartRole}
        processUiState={processUiState}
        onRequestGenerateAiQuestions={requestGenerateAiQuestionsFromSidebar}
        onSetFlowPathTier={setFlowHappyPath}
        onSetNodePathAssignments={setNodePathAssignments}
        onSetElementRobotMeta={setElementRobotMeta}
        onGoToDiagram={() => {
          const sid = String(draft?.session_id || "").trim();
          if (!sid) return;
          setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
        }}
        onProjectBreadcrumbClick={() => returnToSessionList("breadcrumb_project")}
        onSessionBreadcrumbClick={() => {
          const sid = String(draft?.session_id || "").trim();
          if (!sid) return;
          void openSession(sid, { source: "breadcrumb_session" });
        }}
        sidebarHidden={leftHidden}
        sidebarCompact={leftCompact}
        onToggleSidebarCompact={handleSidebarCompact}
        onToggleSidebarHidden={() => handleToggleLeft("sidebar_header")}
        activeSectionId={sidebarActiveSection}
        onActiveSectionChange={(sectionId) => {
          const next = String(sectionId || "").trim();
          if (!next) return;
          setSidebarActiveSection(next);
        }}
        sidebarShortcutRequest={sidebarShortcutRequest}
        onSidebarShortcutHandled={() => setSidebarShortcutRequest("")}
        stepTimeUnit={stepTimeUnit}
        onStepTimeUnitChange={handleStepTimeUnitChange}
        onRenameProject={canManageProjectEntities ? (() => openRenameDialog("project")) : undefined}
        onDeleteProject={canManageProjectEntities ? (() => openDeleteDialog("project")) : undefined}
        onRenameSession={canManageProjectEntities ? (() => openRenameDialog("session")) : undefined}
        onDeleteSession={canManageProjectEntities ? (() => openDeleteDialog("session")) : undefined}
        disabled={locked}
      />
    );
  }, [
    phase,
    backendHint,
    draft,
    locked,
    projectId,
    currentProjectTitle,
    currentSessionTitle,
    selectedBpmnElement,
    processUiState,
    elementNotesFocusKey,
    leftCompact,
    leftHidden,
    sidebarActiveSection,
    sidebarShortcutRequest,
    stepTimeUnit,
    handleStepTimeUnitChange,
    requestGenerateAiQuestionsFromSidebar,
    setFlowHappyPath,
    setNodePathAssignments,
    setElementRobotMeta,
    openSession,
    returnToSessionList,
    openRenameDialog,
    openDeleteDialog,
    canManageProjectEntities,
  ]);

  useEffect(() => {
    refreshProjects();
    refreshLlmSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextOrg = String(activeOrgId || "").trim();
    if (!nextOrg || nextOrg === activeOrgIdRef.current) return;
    activeOrgIdRef.current = nextOrg;
    let canceled = false;
    setProjectId("");
    setSessions([]);
    setSessionNavNotice(null);
    requestedSessionIdRef.current = "";
    resetDraft(ensureDraftShape(null));
    void (async () => {
      await refreshProjects();
      if (canceled) return;
      await refreshLlmSettings();
    })();
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  useEffect(() => {
    function onPopState() {
      const fromUrl = readSelectionFromUrl();
      const pathname = String(window.location.pathname || "");
      const orgOpen = pathname.startsWith("/app/org");
      setOrgSettingsOpen(orgOpen);
      if (orgOpen) {
        setOrgSettingsTab(readOrgSettingsTabFromUrl());
      }
      logNav("popstate", {
        projectId: fromUrl.projectId || "-",
        sessionId: fromUrl.sessionId || "-",
      });
      if (fromUrl.projectId && fromUrl.projectId !== String(projectId || "").trim()) {
        setProjectId(fromUrl.projectId);
      }
      if (fromUrl.sessionId) {
        requestedSessionIdRef.current = fromUrl.sessionId;
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const pid = String(projectId || "").trim();
    const sid = String(draft?.session_id || "").trim();
    writeSelectionToUrl({ projectId: pid, sessionId: sid });
    logNav("selection_sync", { projectId: pid || "-", sessionId: sid || "-" });
    if (sid) requestedSessionIdRef.current = sid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, draft?.session_id]);

  useEffect(() => {
    if (!projectId) return;
    refreshSessions(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openOrgSettings = useCallback((options = {}) => {
    const nextTab = normalizeOrgSettingsTab(options?.tab);
    setOrgSettingsTab(nextTab);
    setOrgSettingsOpen(true);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const pathname = String(url.pathname || "");
      url.pathname = "/app/org";
      if (nextTab === "members") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      const nextHref = `${url.pathname}${url.search}${url.hash}`;
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextHref === currentHref && pathname.startsWith("/app/org")) return;
      window.history.pushState({}, "", nextHref);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      // ignore
    }
  }, []);

  const closeOrgSettings = useCallback(() => {
    setOrgSettingsOpen(false);
    if (typeof window === "undefined") return;
    const pathname = String(window.location.pathname || "");
    if (!pathname.startsWith("/app/org")) return;
    try {
      const url = new URL(window.location.href);
      url.pathname = "/app";
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      // ignore
    }
  }, []);

  return (
    <>
      <AppShell
        draft={draft}
        locked={locked}
        left={left}
        leftHidden={leftHidden}
        leftCompact={phase === "notes" ? leftCompact : false}
        sidebarHandleSections={sidebarHandleSections}
        onToggleLeft={handleToggleLeft}
        onPatchDraft={patchDraft}
        processTabIntent={processTabIntent}
        aiGenerateIntent={aiGenerateIntent}
        onProcessUiStateChange={handleProcessUiStateChange}
        stepTimeUnit={stepTimeUnit}
        reloadKey={reloadKey}
        backendStatus={backendStatus}
        backendHint={backendHint}
        orgs={orgs}
        activeOrgId={activeOrgId}
        canInviteWorkspaceUsers={canInviteWorkspaceUsers}
        canManageSharedTemplates={canManageSharedTemplates}
        onOrgChange={async (orgId) => {
          const next = String(orgId || "").trim();
          if (!next || next === String(activeOrgId || "").trim()) return;
          const switched = await switchOrg(next, { refreshMe: false });
          if (!switched?.ok) {
            markFail(String(switched?.error || "org_switch_failed"));
          }
        }}
        onOpenOrgSettings={openOrgSettings}
        projects={projects}
        projectId={projectId}
        onProjectChange={async (pid) => {
          const next = String(pid || "");
          logNav("project_change", { projectId: next || "-" });
          setProjectId(next);
          setSessionNavNotice(null);
          requestedSessionIdRef.current = "";
          setSessions([]);
          resetDraft(ensureDraftShape(null));
        }}
        onDeleteProject={canManageProjectEntities ? deleteCurrentProject : undefined}
        canManageProjectEntities={canManageProjectEntities}
        sessions={sessions}
        sessionId={String(draft?.session_id || "")}
        onOpenSession={openSession}
        onOpenWorkspaceSession={openWorkspaceSession}
        onDeleteSession={canManageProjectEntities ? deleteCurrentSession : undefined}
        onRefresh={async () => {
          await refreshProjects();
          await refreshSessions(projectId);
          await refreshLlmSettings();
        }}
        onNewProject={() => setWizardOpen(true)}
        onNewBackendSession={() => setSessionFlowOpen(true)}
        llmHasApiKey={llmHasApiKey}
        llmBaseUrl={llmBaseUrl}
        llmSaving={llmSaving}
        llmErr={llmErr}
        llmVerifyState={llmVerifyState}
        llmVerifyMsg={llmVerifyMsg}
        llmVerifyAt={llmVerifyAt}
        llmVerifyBusy={llmVerifyBusy}
        onSaveLlmSettings={saveLlmSettings}
        onVerifyLlmSettings={verifyLlmSettings}
        selectedBpmnElement={selectedBpmnElement}
        onBpmnElementSelect={handleBpmnElementSelect}
        onOpenElementNotes={focusElementNotes}
        onElementNotesRemap={remapElementNotes}
        onSessionSync={onSessionSync}
        onRecalculateRtiers={recalculateRtiers}
        snapshotRestoreNotice={snapshotRestoreNotice}
        sessionNavNotice={sessionNavNotice}
        onDismissSessionNavNotice={() => setSessionNavNotice(null)}
        onReturnToSessionList={() => returnToSessionList("banner_action")}
      />

      <OrgSettingsModal
        open={orgSettingsOpen}
        onClose={closeOrgSettings}
        initialTab={orgSettingsTab}
        activeOrgId={activeOrgId}
        activeOrgRole={activeOrgRole}
        orgName={activeOrgName}
        onRequestRefreshOrgs={refreshOrgs}
      />

      <ProjectWizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} onCreate={createProjectFromWizard} />
      <SessionFlowModal
        open={sessionFlowOpen}
        busy={sessionFlowBusy}
        projectId={projectId}
        onClose={() => setSessionFlowOpen(false)}
        onSubmit={runSessionFlow}
      />

      <Modal
        open={!!renameDialog.open}
        title={renameDialog.scope === "project" ? "Переименовать проект" : "Переименовать сессию"}
        onClose={() => setRenameDialog({ open: false, scope: "", value: "", error: "", busy: false })}
        footer={(
          <>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => setRenameDialog({ open: false, scope: "", value: "", error: "", busy: false })}
              disabled={renameDialog.busy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="primaryBtn"
              onClick={() => {
                void submitRenameDialog();
              }}
              disabled={renameDialog.busy || !String(renameDialog.value || "").trim()}
            >
              {renameDialog.busy ? "Сохраняю..." : "Сохранить"}
            </button>
          </>
        )}
      >
        <label htmlFor="rename-dialog-input" className="text-sm text-muted">Новое название</label>
        <input
          id="rename-dialog-input"
          className="input mt-2 w-full"
          value={renameDialog.value}
          onChange={(event) => setRenameDialog((prev) => ({ ...prev, value: event.target.value, error: "" }))}
          maxLength={120}
          autoFocus
        />
        {renameDialog.error ? <div className="mt-2 text-xs text-danger">{renameDialog.error}</div> : null}
      </Modal>

      <Modal
        open={!!deleteDialog.open}
        title={deleteDialog.scope === "project" ? "Удалить проект" : "Удалить сессию"}
        onClose={() => setDeleteDialog({ open: false, scope: "", error: "", busy: false })}
        footer={(
          <>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => setDeleteDialog({ open: false, scope: "", error: "", busy: false })}
              disabled={deleteDialog.busy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="primaryBtn danger"
              onClick={() => {
                void submitDeleteDialog();
              }}
              disabled={deleteDialog.busy}
            >
              {deleteDialog.busy ? "Удаляю..." : "Удалить"}
            </button>
          </>
        )}
      >
        <div className="text-sm text-muted">
          {deleteDialog.scope === "project"
            ? "Удаление проекта необратимо. Связанные сессии будут удалены."
            : "Удаление сессии необратимо."}
        </div>
        {deleteDialog.error ? <div className="mt-2 text-xs text-danger">{deleteDialog.error}</div> : null}
      </Modal>
    </>
  );
}
