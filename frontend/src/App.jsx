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
import {
  countOpenReviewComments,
  flattenReviewCommentsFromNotes,
  normalizeReviewAnchorType,
  normalizeReviewStatus,
  normalizeReviewV1Meta,
  withAddedReviewComment,
  withReviewCommentStatus,
} from "./features/review/reviewWorkflowV1";
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
  apiGetSessionSyncState,
  apiGetSessionCollabState,
  apiGetSessionRealtimeOps,
  apiPatchSession,
  apiPostSessionRealtimeOps,
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
  shouldAutoRestoreFromSnapshot,
} from "./features/process/bpmn/snapshots/bpmnSnapshots";
import {
  canonicalRobotMetaMapString,
  extractRobotMetaMapFromBpmnXml,
  normalizeRobotMetaMap,
  removeRobotMetaByElementId,
  upsertRobotMetaByElementId,
  validateRobotMetaV1,
} from "./features/process/robotmeta/robotMeta";
import {
  extractCamundaExtensionsMapFromBpmnXml,
  finalizeCamundaExtensionsXml,
  hydrateCamundaExtensionsFromBpmn,
  normalizeCamundaExtensionsMap,
  removeCamundaExtensionStateByElementId,
  upsertCamundaExtensionStateByElementId,
} from "./features/process/camunda/camundaExtensions";
import {
  normalizeCamundaPresentationMap,
  removeCamundaPresentationByElementId,
  shouldResetPropertiesOverlayPreviewForSelection,
  upsertCamundaPresentationByElementId,
} from "./features/process/camunda/camundaPresentation";
import { buildPropertiesOverlayPreview } from "./features/process/camunda/propertyDictionaryModel";
import { normalizeHybridLayerMap } from "./features/process/hybrid/hybridLayerUi";
import { mergeDrawioMeta, normalizeDrawioMeta } from "./features/process/drawio/drawioMeta";
import buildSessionMetaReadModel from "./features/session-meta/read/buildSessionMetaReadModel";
import applySessionMetaHydration from "./features/session-meta/hydrate/applySessionMetaHydration";
import { createSessionMetaConflictGuard } from "./features/session-meta/guards/sessionMetaConflictGuard";
import useSessionMetaWriteGateway from "./features/session-meta/write/useSessionMetaWriteGateway";
import { buildSessionMetaWriteEnvelope } from "./features/session-meta/write/sessionMetaMergePolicy";
import buildCamundaExtensionsXmlSyncPayload from "./features/session-meta/write/buildCamundaExtensionsXmlSyncPayload";
import { normalizeSessionCompanion } from "./features/process/session-companion/sessionCompanionContracts.js";
import { requestProcessStageFlushBeforeLeave } from "./features/process/navigation/processLeaveFlush";
import { useAuth } from "./features/auth/AuthProvider";
import { canCreateOrgTemplateForRole } from "./features/templates/model/templatesRbac";
import { buildWorkspacePermissions } from "./features/workspace/workspacePermissions";
import { resolveSessionStatusFromDraft } from "./features/workspace/sessionStatus";
import useSessionRouteOrchestration, {
  readSelectionFromUrl,
  shouldPreserveSelectionRouteDuringRestore,
  writeSelectionToUrl,
} from "./app/useSessionRouteOrchestration";
import useSessionActivationOrchestration from "./app/useSessionActivationOrchestration";
import useSessionShellOrchestration from "./app/useSessionShellOrchestration";
import { buildSessionDebugProbeSnapshot } from "./app/sessionDebugProbe";
import {
  mergeGlobalNotesLists,
  normalizeGlobalNotes,
} from "./app/sessionGlobalNotes";
import {
  normalizeStepTimeMinutes,
  normalizeStepTimeSeconds,
  readNodeStepTimeMinutes,
  readNodeStepTimeSeconds,
} from "./app/nodeStepTime";
import {
  projectIdOf,
  projectTitleOf,
  sessionIdOf,
} from "./app/projectSessionSelectors";
import {
  buildSessionVersionToken,
  deriveUnsafeLocalSessionSyncReason,
  hasUnsafeLocalSessionState,
} from "./features/sessions/live-sync/liveSessionSyncV1";
import useSessionSyncCoordinator from "./features/sessions/live-sync/useSessionSyncCoordinator";
import {
  emptyBpmnMeta,
  mergeHybridV2Doc,
  normalizeBpmnMeta,
  normalizeExecutionPlans,
  normalizeFlowMetaMap,
  normalizeFlowTier,
  normalizeNodePathEntry,
  normalizeNodePathMetaMap,
} from "./app/bpmnMetaNormalization";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function ensureObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
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

function stableJsonForHash(value) {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonForHash(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableJsonForHash(value[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

function overlayExtensionStateSourceHash(extensionStateRaw) {
  return fnv1aHex(stableJsonForHash(ensureObject(extensionStateRaw)));
}

const XML_DERIVED_META_CACHE = new Map();
const XML_DERIVED_META_CACHE_LIMIT = 6;

function readCachedXmlDerivedMeta(xmlTextRaw) {
  const xmlText = String(xmlTextRaw || "");
  if (!xmlText.trim()) {
    return {
      xmlRobotMeta: {},
      xmlCamundaExtensions: {},
    };
  }
  const key = `${xmlText.length}:${fnv1aHex(xmlText)}`;
  const cached = XML_DERIVED_META_CACHE.get(key);
  if (cached && typeof cached === "object") {
    return {
      xmlRobotMeta: normalizeRobotMetaMap(cached.xmlRobotMeta),
      xmlCamundaExtensions: normalizeCamundaExtensionsMap(cached.xmlCamundaExtensions),
    };
  }
  const next = {
    xmlRobotMeta: normalizeRobotMetaMap(extractRobotMetaMapFromBpmnXml(xmlText)),
    xmlCamundaExtensions: normalizeCamundaExtensionsMap(extractCamundaExtensionsMapFromBpmnXml(xmlText)),
  };
  XML_DERIVED_META_CACHE.set(key, next);
  if (XML_DERIVED_META_CACHE.size > XML_DERIVED_META_CACHE_LIMIT) {
    const oldestKey = XML_DERIVED_META_CACHE.keys().next().value;
    if (oldestKey) XML_DERIVED_META_CACHE.delete(oldestKey);
  }
  return {
    xmlRobotMeta: normalizeRobotMetaMap(next.xmlRobotMeta),
    xmlCamundaExtensions: normalizeCamundaExtensionsMap(next.xmlCamundaExtensions),
  };
}

function normalizeOverlayServerProjectionEntry(rawEntry, fallbackElementId = "") {
  const entry = ensureObject(rawEntry);
  const elementId = String(entry.elementId || fallbackElementId || "").trim();
  const items = ensureArray(entry.items)
    .map((rawItem) => ({
      key: String(rawItem?.key || "").trim(),
      label: String(rawItem?.label || "").trim(),
      value: String(rawItem?.value || "").trim(),
    }))
    .filter((row) => row.label && row.value);
  const hiddenCount = Math.max(0, Number(entry.hiddenCount || 0));
  const totalCountRaw = Number(entry.totalCount || 0);
  const totalCount = totalCountRaw > 0 ? totalCountRaw : items.length;
  return {
    enabled: entry.enabled === true && items.length > 0,
    elementId,
    items,
    hiddenCount,
    totalCount,
  };
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

function normalizeOrgSettingsTab(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "members" || value === "invites" || value === "audit" || value === "dictionary") return value;
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

const LEFT_PANEL_OPEN_KEY = "ui.sidebar.left.open";
const LEFT_PANEL_COMPACT_KEY = "fpc_leftpanel_compact";
const STEP_TIME_UNIT_KEY = "fpc_step_time_unit_v1";
const BPMN_META_LOCAL_KEY_PREFIX = "fpc_bpmn_meta_v1:";
const PROPERTIES_OVERLAY_ALWAYS_KEY_PREFIX = "fpc_properties_overlay_always_v1:";
const PROPERTIES_OVERLAY_ON_SELECT_KEY_PREFIX = "fpc_properties_overlay_on_select_v1:";
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

function propertiesOverlayAlwaysLocalStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `${PROPERTIES_OVERLAY_ALWAYS_KEY_PREFIX}${sid}` : "";
}

function propertiesOverlayOnSelectLocalStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `${PROPERTIES_OVERLAY_ON_SELECT_KEY_PREFIX}${sid}` : "";
}

function readPropertiesOverlayAlwaysEnabled(sessionId) {
  if (typeof window === "undefined") return false;
  const key = propertiesOverlayAlwaysLocalStorageKey(sessionId);
  if (!key) return false;
  try {
    const raw = String(window.localStorage?.getItem(key) || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return false;
  }
}

function writePropertiesOverlayAlwaysEnabled(sessionId, value) {
  if (typeof window === "undefined") return;
  const key = propertiesOverlayAlwaysLocalStorageKey(sessionId);
  if (!key) return;
  try {
    window.localStorage?.setItem(key, value ? "1" : "0");
  } catch {
  }
}

function readPropertiesOverlayOnSelectEnabled(sessionId) {
  if (typeof window === "undefined") return false;
  const key = propertiesOverlayOnSelectLocalStorageKey(sessionId);
  if (!key) return false;
  try {
    const raw = String(window.localStorage?.getItem(key) || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return false;
  }
}

function writePropertiesOverlayOnSelectEnabled(sessionId, value) {
  if (typeof window === "undefined") return;
  const key = propertiesOverlayOnSelectLocalStorageKey(sessionId);
  if (!key) return;
  try {
    window.localStorage?.setItem(key, value ? "1" : "0");
  } catch {
  }
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
  const {
    xmlRobotMeta,
    xmlCamundaExtensions,
  } = readCachedXmlDerivedMeta(next?.bpmn_xml || "");
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
  const camundaHydration = hydrateCamundaExtensionsFromBpmn({
    extractedMap: xmlCamundaExtensions,
    sessionMetaMap: normalizedMeta.camunda_extensions_by_element_id,
  });
  let effectiveCamundaExtensions = normalizeCamundaExtensionsMap(camundaHydration.nextSessionMetaMap);
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
      camunda_extensions_by_element_id: normalizeCamundaExtensionsMap(effectiveCamundaExtensions),
      presentation_by_element_id: normalizeCamundaPresentationMap(normalizedMeta.presentation_by_element_id),
      hybrid_layer_by_element_id: normalizedMeta.hybrid_layer_by_element_id,
      hybrid_v2: normalizedMeta.hybrid_v2,
      drawio: normalizeDrawioMeta(normalizedMeta.drawio),
      execution_plans: normalizedMeta.execution_plans,
      auto_pass_v1: ensureObject(normalizedMeta.auto_pass_v1),
      session_companion_v1: normalizeSessionCompanion(normalizedMeta.session_companion_v1),
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
  const sourceKey = String(source || "").trim().toLowerCase();
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

  const prevBpmnMeta = ensureObject(prev?.bpmn_meta);
  const nextBpmnMeta = ensureObject(next?.bpmn_meta);
  const incomingBpmnMeta = ensureObject(incoming?.bpmn_meta);
  const incomingHasBpmnMeta = hasOwn(incoming, "bpmn_meta");
  const incomingHasCamundaExtensionsMap = incomingHasBpmnMeta && hasOwn(incomingBpmnMeta, "camunda_extensions_by_element_id");
  if (sourceKey.endsWith("_xml_sync") && incomingHasCamundaExtensionsMap) {
    next = {
      ...next,
      bpmn_meta: {
        ...nextBpmnMeta,
        camunda_extensions_by_element_id: normalizeCamundaExtensionsMap(incomingBpmnMeta.camunda_extensions_by_element_id),
      },
    };
  }
  const incomingHasPresentationMap = incomingHasBpmnMeta && hasOwn(incomingBpmnMeta, "presentation_by_element_id");
  if (!incomingHasPresentationMap) {
    const prevPresentationMap = normalizeCamundaPresentationMap(prevBpmnMeta.presentation_by_element_id);
    if (Object.keys(prevPresentationMap).length > 0) {
      next = {
        ...next,
        bpmn_meta: {
          ...nextBpmnMeta,
          presentation_by_element_id: prevPresentationMap,
        },
      };
      logDraftTrace("MERGE_KEEP_PRESENTATION_BY_ELEMENT", {
        sid: sid || "-",
        source,
        count: Object.keys(prevPresentationMap).length,
      });
    }
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
  const [drawioCompanionFocusIntent, setDrawioCompanionFocusIntent] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const openSessionReqSeqRef = useRef(0);
  const sessionMetaConflictGuardRef = useRef(createSessionMetaConflictGuard());
  const suppressProjectAutoselectRef = useRef(false);
  const initialProjectSelectionConsumedRef = useRef(false);
  const {
    initialSelectionRef,
    requestedSessionIdRef,
    activeSessionIdRef,
    confirmedSessionIdRef,
    setRequestedSessionId,
    rememberActiveSessionId,
    rememberConfirmedSessionId,
    clearSessionRestoreMemory,
  } = useSessionRouteOrchestration();
  const projectWorkspaceHintsRef = useRef(new Map());
  const [snapshotRestoreNotice, setSnapshotRestoreNotice] = useState(null);
  const [sessionNavNotice, setSessionNavNotice] = useState(null);
  const [renameDialog, setRenameDialog] = useState({ open: false, scope: "", value: "", error: "", busy: false });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, scope: "", error: "", busy: false });
  const [orgSettingsOpen, setOrgSettingsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return String(window.location.pathname || "").startsWith("/app/org");
  });
  const [orgSettingsTab, setOrgSettingsTab] = useState(() => readOrgSettingsTabFromUrl());
  const [orgSettingsOperationKey, setOrgSettingsOperationKey] = useState("");
  const [orgSettingsDictionaryOnly, setOrgSettingsDictionaryOnly] = useState(false);
  const [orgPropertyDictionaryRevision, setOrgPropertyDictionaryRevision] = useState(0);

  const [leftHidden, setLeftHidden] = useState(() => readLeftPanelHidden());
  const [leftCompact, setLeftCompact] = useState(() => readLeftPanelCompact());
  const [stepTimeUnit, setStepTimeUnit] = useState(() => readStepTimeUnit());
  const [showPropertiesOverlayAlways, setShowPropertiesOverlayAlways] = useState(false);
  const [showPropertiesOverlayOnSelect, setShowPropertiesOverlayOnSelect] = useState(false);
  const propertiesOverlayProjectionCacheRef = useRef(new Map());
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
  const workspacePermissions = useMemo(
    () => buildWorkspacePermissions(activeOrgRole, Boolean(user?.is_admin)),
    [activeOrgRole, user?.is_admin],
  );
  const canManageProjectEntities = workspacePermissions.canEdit;
  const canInviteWorkspaceUsers = workspacePermissions.canManageInvites;
  const canManageSharedTemplates = useMemo(() => {
    return canCreateOrgTemplateForRole(activeOrgRole, Boolean(user?.is_admin));
  }, [activeOrgRole, user?.is_admin]);
  const draftSessionId = String(draft?.session_id || "").trim();
  const reviewMeta = useMemo(
    () => normalizeReviewV1Meta(draft?.bpmn_meta?.review_v1),
    [draft?.bpmn_meta?.review_v1],
  );
  const reviewComments = useMemo(
    () => flattenReviewCommentsFromNotes(draft?.notes_by_element || draft?.notesByElementId, { sessionId: draftSessionId }),
    [draft?.notes_by_element, draft?.notesByElementId, draftSessionId],
  );
  const reviewOpenCommentsCount = useMemo(
    () => countOpenReviewComments(draft?.notes_by_element || draft?.notesByElementId, { sessionId: draftSessionId }),
    [draft?.notes_by_element, draft?.notesByElementId, draftSessionId],
  );
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

  const persistCamundaExtensionsXmlBoundary = useCallback(async ({
    sid,
    camundaExtensionsByElementId,
    source = "camunda_extensions_save",
  } = {}) => {
    const sessionId = String(sid || "").trim();
    if (!sessionId || isLocalSessionId(sessionId)) {
      return { ok: true, skipped: true, reason: "local_or_missing_session" };
    }
    const baseXml = String(draft?.bpmn_xml || "");
    if (!baseXml.trim()) {
      return { ok: true, skipped: true, reason: "empty_bpmn_xml" };
    }
    const finalizedXml = String(finalizeCamundaExtensionsXml({
      xmlText: baseXml,
      camundaExtensionsByElementId: normalizeCamundaExtensionsMap(camundaExtensionsByElementId),
    }) || "");
    if (!finalizedXml.trim() || finalizedXml === baseXml) {
      return { ok: true, skipped: true, reason: "no_xml_delta" };
    }
    const rev = Number(draft?.bpmn_xml_version || draft?.version || 0);
    const putRes = await apiPutBpmnXml(sessionId, finalizedXml, { rev });
    if (!putRes?.ok) {
      return {
        ok: false,
        status: Number(putRes?.status || 0),
        error: String(putRes?.error || "Не удалось синхронизировать BPMN XML после сохранения Properties."),
      };
    }
    onSessionSync(buildCamundaExtensionsXmlSyncPayload({
      sessionId,
      finalizedXml,
      camundaExtensionsByElementId,
      storedRev: putRes?.storedRev,
      fallbackRev: rev,
      source: `${String(source || "camunda_extensions_save")}_xml_sync`,
    }));
    return { ok: true, skipped: false };
  }, [draft, onSessionSync]);

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

  function closeLeftSidebar(source = "sidebar_close") {
    setLeftHidden((prev) => {
      if (prev) return true;
      try {
        window.sessionStorage?.setItem(LEFT_PANEL_OPEN_KEY, "0");
      } catch {
      }
      // eslint-disable-next-line no-console
      console.debug(`[UI] sidebar.force_close source=${String(source || "sidebar_close")}`);
      return true;
    });
    setLeftCompact(false);
    try {
      window.localStorage?.setItem(LEFT_PANEL_COMPACT_KEY, "0");
    } catch {
    }
  }

  useEffect(() => {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return;
    rememberActiveSessionId(sid);
  }, [draft?.session_id, rememberActiveSessionId]);

  useEffect(() => {
    sessionMetaConflictGuardRef.current = createSessionMetaConflictGuard();
  }, [draft?.session_id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__FPC_E2E__) return;
    window.__FPC_E2E_DRAFT__ = draft;
  }, [draft]);

  useEffect(() => {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return;
    writeLocalBpmnMeta(sid, draft?.bpmn_meta);
  }, [draft?.bpmn_meta, draft?.session_id]);

  async function refreshMeta() {
    const r = await apiMeta();
    if (r.ok) {
      markOk("API OK");
      return true;
    }
    markFail(r.error);
    return false;
  }

  const sessionActivation = useSessionActivationOrchestration({
    projectId,
    setProjectId,
    projects,
    setProjects,
    draft,
    setDraftPersisted,
    resetDraft,
    setSessions,
    sessionNavNotice,
    setSessionNavNotice,
    setSnapshotRestoreNotice,
    refreshMeta,
    markOk,
    markFail,
    logNav,
    logCreateTrace,
    logDraftTrace,
    logSnapshotTrace,
    ensureArray,
    ensureObject,
    ensureDraftShape,
    sessionToDraft,
    projectIdOf,
    projectTitleOf,
    sessionIdOf,
    isLocalSessionId,
    fnv1aHex,
    routeOrchestration: {
      initialSelectionRef,
      requestedSessionIdRef,
      activeSessionIdRef,
      confirmedSessionIdRef,
      setRequestedSessionId,
      rememberActiveSessionId,
      rememberConfirmedSessionId,
      clearSessionRestoreMemory,
    },
    initialProjectSelectionConsumedRef,
    suppressProjectAutoselectRef,
    openSessionReqSeqRef,
    projectWorkspaceHintsRef,
    createLocalSessionId: () => `local_${uid()}`,
  });

  const {
    openSession,
    openWorkspaceSession: openWorkspaceSessionBase,
    refreshProjects,
    refreshSessions,
    createLocalSession,
    activationState,
  } = sessionActivation;

  const openWorkspaceSession = useCallback(async (sessionLike, options = {}) => {
    const row = ensureObject(sessionLike);
    const sid = String(row?.id || row?.session_id || sessionLike || "").trim();
    const openTab = String(options?.openTab || "").trim().toLowerCase();
    await openWorkspaceSessionBase(sessionLike, options);
    if (sid && (openTab === "diagram" || openTab === "interview" || openTab === "xml" || openTab === "doc" || openTab === "dod")) {
      setProcessTabIntent({ sid, tab: openTab, nonce: Date.now() });
    }
  }, [openWorkspaceSessionBase]);

  const {
    shellSessionId,
    shellTransitionReason,
    shellResetInfo,
    sidebarActiveSection,
    setSidebarActiveSection,
    sidebarShortcutRequest,
    setSidebarShortcutRequest,
    selectedBpmnElement,
    setSelectedBpmnElement,
    selectedPropertiesOverlayPreview,
    setSelectedPropertiesOverlayPreview,
    selectedPropertiesOverlayAlwaysPreview,
    setSelectedPropertiesOverlayAlwaysPreview,
    processUiState,
    setProcessUiState,
    aiGenerateIntent,
    setAiGenerateIntent,
  } = useSessionShellOrchestration({
    draftSessionId: draft?.session_id,
    activationState,
  });

  const liveSyncLocalVersionToken = useMemo(
    () => buildSessionVersionToken(draft),
    [
      draft?.sync_version_token,
      draft?.syncVersionToken,
      draft?.version,
      draft?.bpmn_xml_version,
      draft?.updated_at,
      draft?.updatedAt,
    ],
  );
  const hasUnsafeLocalSyncState = useMemo(
    () => hasUnsafeLocalSessionState(processUiState),
    [processUiState],
  );
  const unsafeLocalSyncReason = useMemo(
    () => deriveUnsafeLocalSessionSyncReason(processUiState),
    [processUiState],
  );
  const {
    remoteSessionSyncState,
    publishRealtimeBpmnOps,
    applyPendingRemoteSessionSync,
    acknowledgeSessionSyncPayload,
  } = useSessionSyncCoordinator({
    draftSessionId: draft?.session_id,
    draftBpmnMeta: draft?.bpmn_meta,
    isLocalSessionId,
    liveSyncLocalVersionToken,
    hasUnsafeLocalSyncState,
    unsafeLocalSyncReason,
    onSessionSync,
    normalizeBpmnMeta,
    apiGetSession,
    apiGetSessionSyncState,
    apiGetSessionCollabState,
    apiGetSessionRealtimeOps,
    apiPostSessionRealtimeOps,
  });

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
    setShowPropertiesOverlayAlways(readPropertiesOverlayAlwaysEnabled(draftSessionId));
    setShowPropertiesOverlayOnSelect(readPropertiesOverlayOnSelectEnabled(draftSessionId));
    setSelectedPropertiesOverlayAlwaysPreview(null);
    propertiesOverlayProjectionCacheRef.current = new Map();
  }, [draftSessionId, setSelectedPropertiesOverlayAlwaysPreview]);

  useEffect(() => {
    writePropertiesOverlayAlwaysEnabled(draftSessionId, !!showPropertiesOverlayAlways);
  }, [draftSessionId, showPropertiesOverlayAlways]);

  useEffect(() => {
    writePropertiesOverlayOnSelectEnabled(draftSessionId, !!showPropertiesOverlayOnSelect);
  }, [draftSessionId, showPropertiesOverlayOnSelect]);

  const propertiesOverlayAlwaysPreviewByElementId = useMemo(() => {
    if (!showPropertiesOverlayAlways) return {};
    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const extensionMap = normalizeCamundaExtensionsMap(currentMeta.camunda_extensions_by_element_id);
    const projection = ensureObject(currentMeta.properties_overlay_projection_v1);
    const projectionEntriesByElementId = ensureObject(projection.entries_by_element_id);
    const cache = propertiesOverlayProjectionCacheRef.current;
    const out = {};
    const t0 = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : 0;
    let reusedCount = 0;
    let rebuiltCount = 0;

    Object.keys(extensionMap).forEach((rawElementId) => {
      const elementId = String(rawElementId || "").trim();
      if (!elementId) return;
      const extensionStateRaw = extensionMap[rawElementId];
      const sourceHash = overlayExtensionStateSourceHash(extensionStateRaw);
      const cached = cache.get(elementId);
      let preview = null;

      if (cached && cached.sourceHash === sourceHash) {
        preview = cached.preview;
        reusedCount += 1;
      }

      if (!preview) {
        const serverProjection = ensureObject(projectionEntriesByElementId[elementId]);
        const serverSourceHash = String(serverProjection.source_hash || "").trim();
        if (serverSourceHash && serverSourceHash === sourceHash) {
          preview = normalizeOverlayServerProjectionEntry(serverProjection, elementId);
          reusedCount += 1;
        }
      }

      if (!preview) {
        preview = buildPropertiesOverlayPreview({
          elementId,
          extensionStateRaw,
          showPropertiesOverlay: true,
        });
        rebuiltCount += 1;
      }

      cache.set(elementId, { sourceHash, preview });
      if (preview?.enabled && ensureArray(preview.items).length) {
        out[elementId] = preview;
      }
    });

    const liveElementIds = new Set(Object.keys(extensionMap).map((rawElementId) => String(rawElementId || "").trim()).filter(Boolean));
    Array.from(cache.keys()).forEach((elementId) => {
      if (!liveElementIds.has(elementId)) {
        cache.delete(elementId);
      }
    });

    const draftPreview = ensureObject(selectedPropertiesOverlayAlwaysPreview);
    const draftElementId = String(draftPreview.elementId || "").trim();
    if (draftElementId) {
      const draftItems = ensureArray(draftPreview.items);
      if (draftPreview.enabled === true && draftItems.length) {
        out[draftElementId] = {
          ...draftPreview,
          elementId: draftElementId,
          items: draftItems,
        };
      } else {
        delete out[draftElementId];
      }
    }

    if (typeof window !== "undefined") {
      const durationMs = (typeof performance !== "undefined" && typeof performance.now === "function")
        ? Math.max(0, performance.now() - t0)
        : 0;
      window.__FPC_OVERLAY_PERF__ = {
        computedAt: Date.now(),
        totalElements: Object.keys(extensionMap).length,
        reusedCount,
        rebuiltCount,
        durationMs,
      };
    }
    return out;
  }, [
    showPropertiesOverlayAlways,
    draft?.bpmn_meta,
    selectedPropertiesOverlayAlwaysPreview,
    propertiesOverlayProjectionCacheRef,
  ]);

  const sidebarHandleSections = useMemo(() => {
    const hasActiveSession = !!String(shellSessionId || "").trim();
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
        muted: !hasActiveSession || !selectedElementId,
      },
      {
        id: "ai",
        title: "AI-вопросы",
        count: selectedAiCount,
        active: sidebarActiveSection === "ai",
        muted: !hasActiveSession,
      },
      {
        id: "actors",
        title: "Акторы",
        count: actorsCount,
        active: sidebarActiveSection === "actors",
        muted: !hasActiveSession,
      },
      {
        id: "templates",
        title: "Шаблоны / TL;DR",
        count: hasSummary ? 1 : 0,
        active: sidebarActiveSection === "templates",
        muted: !hasActiveSession,
      },
    ];
  }, [
    shellSessionId,
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
    if (typeof window === "undefined") return;
    if (!window.__FPC_E2E__) return;
    window.__FPC_E2E_SELECTED_ELEMENT_ID__ = String(selectedBpmnElement?.id || "").trim();
  }, [selectedBpmnElement]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.__FPC_E2E__) return undefined;
    const readSnapshot = () => buildSessionDebugProbeSnapshot({
      routeSelection: readSelectionFromUrl(window),
      requestedSessionId: requestedSessionIdRef.current,
      activeSessionId: activeSessionIdRef.current,
      confirmedSessionId: confirmedSessionIdRef.current,
      activationState,
      shellSessionId,
      shellTransitionReason,
      shellResetInfo,
      processStageSessionId: draft?.session_id,
    });
    window.__FPC_E2E_SESSION_SHELL__ = readSnapshot();
    window.__FPC_E2E_GET_SESSION_SHELL__ = readSnapshot;
    return () => {
      if (window.__FPC_E2E_GET_SESSION_SHELL__ === readSnapshot) {
        window.__FPC_E2E_GET_SESSION_SHELL__ = null;
      }
    };
  }, [
    activationState,
    activeSessionIdRef,
    confirmedSessionIdRef,
    draft?.session_id,
    requestedSessionIdRef,
    shellResetInfo,
    shellSessionId,
    shellTransitionReason,
  ]);

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
    const sourceKey = source.trim().toLowerCase();
    const isRemoteSyncPayload = sourceKey.startsWith("remote_session_sync_")
      || sourceKey === "realtime_bpmn_ops_stream"
      || sourceKey === "realtime_remote_ops_apply";
    const normalizedSession = isRemoteSyncPayload
      ? session
      : {
          ...(session && typeof session === "object" ? session : {}),
          _remote_version_token: "",
          _remote_force_bpmn_apply_token: "",
          _remote_realtime_ops: null,
        };
    acknowledgeSessionSyncPayload?.(normalizedSession);
    setDraftPersisted((prevDraft) => {
      const hydration = applySessionMetaHydration({
        sid,
        activeSessionId: activeSid,
        source,
        payloadRaw: normalizedSession,
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
      setSelectedPropertiesOverlayPreview(null);
      setSelectedPropertiesOverlayAlwaysPreview(null);
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
      setSelectedPropertiesOverlayPreview(null);
      setSelectedPropertiesOverlayAlwaysPreview(null);
      return;
    }
    if (shouldResetPropertiesOverlayPreviewForSelection(selectedBpmnElement?.id, next.id)) {
      setSelectedPropertiesOverlayPreview(null);
      setSelectedPropertiesOverlayAlwaysPreview(null);
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
        && prev.isManualSaveBusy === next.isManualSaveBusy
        && ensureObject(prev.save).status === ensureObject(next.save).status
        && ensureObject(prev.save).isDirty === ensureObject(next.save).isDirty
        && ensureObject(prev.save).isSaving === ensureObject(next.save).isSaving
        && ensureObject(prev.save).isStale === ensureObject(next.save).isStale
        && ensureObject(prev.save).isFailed === ensureObject(next.save).isFailed
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
    const currentCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(currentMeta.camunda_extensions_by_element_id);
    const currentPresentationByElementId = normalizeCamundaPresentationMap(currentMeta.presentation_by_element_id);
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
      camunda_extensions_by_element_id: currentCamundaExtensionsByElementId,
      presentation_by_element_id: currentPresentationByElementId,
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
    const currentCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(currentMeta.camunda_extensions_by_element_id);
    const currentPresentationByElementId = normalizeCamundaPresentationMap(currentMeta.presentation_by_element_id);
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
      camunda_extensions_by_element_id: currentCamundaExtensionsByElementId,
      presentation_by_element_id: currentPresentationByElementId,
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
    const currentCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(currentMeta.camunda_extensions_by_element_id);
    const currentPresentationByElementId = normalizeCamundaPresentationMap(currentMeta.presentation_by_element_id);
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
      camunda_extensions_by_element_id: currentCamundaExtensionsByElementId,
      presentation_by_element_id: currentPresentationByElementId,
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

  async function setElementCamundaExtensions(elementIdRaw, extensionStateRaw, options = {}) {
    const sid = String(draft?.session_id || "").trim();
    const elementId = String(elementIdRaw || "").trim();
    if (!elementId) return { ok: false, error: "Не выбран BPMN-элемент." };

    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const currentFlowMeta = normalizeFlowMetaMap(currentMeta.flow_meta);
    const currentNodePathMeta = normalizeNodePathMetaMap(currentMeta.node_path_meta);
    const currentRobotMetaByElementId = normalizeRobotMetaMap(currentMeta.robot_meta_by_element_id);
    const currentCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(currentMeta.camunda_extensions_by_element_id);
    const currentPresentationByElementId = normalizeCamundaPresentationMap(currentMeta.presentation_by_element_id);
    const currentHybridLayerByElementId = normalizeHybridLayerMap(currentMeta.hybrid_layer_by_element_id);
    const currentExecutionPlans = normalizeExecutionPlans(currentMeta.execution_plans);
    const shouldRemove = options?.remove === true || extensionStateRaw === null;
    const nextCamundaExtensionsByElementId = shouldRemove
      ? removeCamundaExtensionStateByElementId(currentCamundaExtensionsByElementId, elementId)
      : upsertCamundaExtensionStateByElementId(currentCamundaExtensionsByElementId, elementId, extensionStateRaw);

    const optimisticMeta = {
      version: Number(currentMeta.version) > 0 ? Number(currentMeta.version) : 1,
      flow_meta: currentFlowMeta,
      node_path_meta: currentNodePathMeta,
      robot_meta_by_element_id: currentRobotMetaByElementId,
      camunda_extensions_by_element_id: nextCamundaExtensionsByElementId,
      presentation_by_element_id: currentPresentationByElementId,
      hybrid_layer_by_element_id: currentHybridLayerByElementId,
      hybrid_v2: currentMeta.hybrid_v2,
      drawio: currentMeta.drawio,
      execution_plans: currentExecutionPlans,
    };
    const persistResult = await persistSessionMetaBoundary(optimisticMeta, {
      source: "camunda_extensions_save",
      successHint: sid && !isLocalSessionId(sid)
        ? (shouldRemove ? "Properties удалены." : "Properties сохранены.")
        : (shouldRemove ? "Properties удалены локально." : "Properties сохранены локально."),
      failureHint: "Не удалось сохранить Properties.",
    });
    if (!persistResult?.ok) {
      return { ok: false, error: String(persistResult?.error || "Не удалось сохранить Properties.") };
    }
    const xmlPersistResult = await persistCamundaExtensionsXmlBoundary({
      sid,
      camundaExtensionsByElementId: nextCamundaExtensionsByElementId,
      source: "camunda_extensions_save",
    });
    if (!xmlPersistResult?.ok) {
      return {
        ok: false,
        error: String(xmlPersistResult?.error || "Properties сохранены, но BPMN XML не синхронизирован."),
        status: Number(xmlPersistResult?.status || 0),
      };
    }
    return { ok: true };
  }

  async function setElementCamundaPresentation(elementIdRaw, presentationRaw, options = {}) {
    const sid = String(draft?.session_id || "").trim();
    const elementId = String(elementIdRaw || "").trim();
    if (!elementId) return { ok: false, error: "Не выбран BPMN-элемент." };

    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const currentFlowMeta = normalizeFlowMetaMap(currentMeta.flow_meta);
    const currentNodePathMeta = normalizeNodePathMetaMap(currentMeta.node_path_meta);
    const currentRobotMetaByElementId = normalizeRobotMetaMap(currentMeta.robot_meta_by_element_id);
    const currentCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(currentMeta.camunda_extensions_by_element_id);
    const currentPresentationByElementId = normalizeCamundaPresentationMap(currentMeta.presentation_by_element_id);
    const currentHybridLayerByElementId = normalizeHybridLayerMap(currentMeta.hybrid_layer_by_element_id);
    const currentExecutionPlans = normalizeExecutionPlans(currentMeta.execution_plans);
    const shouldRemove = options?.remove === true || presentationRaw === null;
    const nextPresentationByElementId = shouldRemove
      ? removeCamundaPresentationByElementId(currentPresentationByElementId, elementId)
      : upsertCamundaPresentationByElementId(currentPresentationByElementId, elementId, presentationRaw);

    const optimisticMeta = {
      version: Number(currentMeta.version) > 0 ? Number(currentMeta.version) : 1,
      flow_meta: currentFlowMeta,
      node_path_meta: currentNodePathMeta,
      robot_meta_by_element_id: currentRobotMetaByElementId,
      camunda_extensions_by_element_id: currentCamundaExtensionsByElementId,
      presentation_by_element_id: nextPresentationByElementId,
      hybrid_layer_by_element_id: currentHybridLayerByElementId,
      hybrid_v2: currentMeta.hybrid_v2,
      drawio: currentMeta.drawio,
      execution_plans: currentExecutionPlans,
    };
    const persistResult = await persistSessionMetaBoundary(optimisticMeta, {
      source: "camunda_presentation_save",
      successHint: sid && !isLocalSessionId(sid)
        ? "Настройка overlay сохранена."
        : "Настройка overlay сохранена локально.",
      failureHint: "Не удалось сохранить настройку overlay.",
    });
    if (!persistResult?.ok) {
      return { ok: false, error: String(persistResult?.error || "Не удалось сохранить настройку overlay.") };
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
    const normalizedCamundaExtensionsByElementId = normalizeCamundaExtensionsMap(serverMeta?.camunda_extensions_by_element_id);
    const normalizedPresentationByElementId = normalizeCamundaPresentationMap(serverMeta?.presentation_by_element_id || currentMeta.presentation_by_element_id);
    const normalizedHybridLayerByElementId = normalizeHybridLayerMap(serverMeta?.hybrid_layer_by_element_id);
    const normalizedExecutionPlans = normalizeExecutionPlans(serverMeta?.execution_plans);
    const effectiveExecutionPlans = normalizedExecutionPlans.length ? normalizedExecutionPlans : currentExecutionPlans;
    const nextMeta = {
      version: Number(serverMeta?.version) > 0 ? Number(serverMeta.version) : 1,
      flow_meta: normalizedFlowMeta,
      node_path_meta: normalizedNodePathMeta,
      robot_meta_by_element_id: normalizedRobotMetaByElementId,
      camunda_extensions_by_element_id: normalizedCamundaExtensionsByElementId,
      presentation_by_element_id: normalizedPresentationByElementId,
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

  async function returnToSessionList(reason = "manual_return", options = {}) {
    const shouldFlushBeforeLeave = options?.flushBeforeLeave !== false;
    const sid = String(draft?.session_id || "").trim();
    if (shouldFlushBeforeLeave && sid && !isLocalSessionId(sid)) {
      const flushResult = await requestProcessStageFlushBeforeLeave({
        sessionId: sid,
        reason,
        timeoutMs: 7000,
      });
      if (!flushResult?.ok) {
        setSessionNavNotice({
          code: "LEAVE_FLUSH_FAILED",
          status: 0,
          projectId: String(projectId || ""),
          sessionId: sid,
          message: "Не удалось сохранить изменения перед выходом в проект. Попробуйте снова.",
        });
        markFail(String(flushResult?.error || "flush_before_leave_failed"));
        return { ok: false, error: String(flushResult?.error || "flush_before_leave_failed") };
      }
    }
    logNav("return_to_session_list", { reason });
    setSessionNavNotice(null);
    closeLeftSidebar(`return_to_project:${reason}`);
    clearSessionRestoreMemory();
    resetDraft(ensureDraftShape(null));
    return { ok: true };
  }

  async function deleteCurrentProject(options = {}) {
    if (!workspacePermissions.canDeleteProject) return { ok: false, error: "forbidden" };
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
    await returnToSessionList("project_deleted", { flushBeforeLeave: false });
    await refreshProjects();
    markOk("API OK");
    return { ok: true };
  }

  async function deleteCurrentSession(options = {}) {
    if (!workspacePermissions.canDeleteSession) return { ok: false, error: "forbidden" };
    const sid = String(draft?.session_id || "");
    if (!sid || isLocalSessionId(sid)) {
      await returnToSessionList("local_session_clear", { flushBeforeLeave: false });
      return { ok: true };
    }
    const skipConfirm = !!options?.skipConfirm;
    if (!skipConfirm) {
      const currentStatus = String(draft?.interview?.status || "").trim().toLowerCase();
      const message = currentStatus === "ready" || currentStatus === "archived"
        ? "Удалить сессию с финальным статусом? Это действие необратимо."
        : "Удалить сессию?";
      const ok = confirm(message);
      if (!ok) return { ok: false, cancelled: true };
    }

    const r = await apiDeleteSession(sid);
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "delete_session_failed") };
    }

    await returnToSessionList("session_deleted", { flushBeforeLeave: false });
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

  async function changeCurrentSessionStatus(nextStatus) {
    if (!workspacePermissions.canChangeStatus) return { ok: false, error: "forbidden" };
    const sid = String(draft?.session_id || "").trim();
    if (!sid || isLocalSessionId(sid)) return { ok: false, error: "Сессия не выбрана." };
    const status = String(nextStatus || "").trim();
    if (!status) return { ok: false, error: "status_required" };
    const r = await apiPatchSession(sid, { status });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "status_update_failed") };
    }
    onSessionSync(r.session || {});
    await refreshSessions(projectId);
    markOk("API OK");
    return { ok: true };
  }

  async function patchReviewMeta(nextReviewMetaRaw, options = {}) {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return { ok: false, error: "Сессия не выбрана." };
    const currentMeta = normalizeBpmnMeta(draft?.bpmn_meta);
    const nextReviewMeta = normalizeReviewV1Meta(nextReviewMetaRaw);
    const nextMeta = {
      ...currentMeta,
      review_v1: {
        ...nextReviewMeta,
        version: 1,
      },
    };

    if (isLocalSessionId(sid)) {
      setDraftPersisted((prev) => ({
        ...prev,
        bpmn_meta: nextMeta,
      }));
      return { ok: true, local: true };
    }

    const r = await apiPatchSession(sid, { bpmn_meta: nextMeta });
    if (!r.ok) {
      if (options?.markError) markFail(r.error);
      return { ok: false, error: String(r.error || "review_meta_patch_failed") };
    }
    onSessionSync(r.session || {});
    if (options?.markOk) markOk(String(options.markOk));
    return { ok: true, session: r.session || null };
  }

  async function changeSessionReviewStatus(nextStatus, options = {}) {
    const next = normalizeReviewStatus(nextStatus, reviewMeta?.status || "draft");
    const actorUserId = String(user?.id || "").trim();
    const actorLabel = String(user?.email || user?.id || "you").trim() || "you";
    const result = await patchReviewMeta({
      ...(reviewMeta || {}),
      status: next,
      updated_at: Date.now(),
      updated_by_user_id: actorUserId,
      updated_by_label: actorLabel,
    }, options);
    if (!result.ok) return result;
    return { ok: true, status: next };
  }

  async function addAnchoredReviewComment(anchorRaw, bodyRaw) {
    const sid = String(draft?.session_id || "").trim();
    const body = String(bodyRaw || "").trim();
    const anchor = anchorRaw && typeof anchorRaw === "object" ? anchorRaw : {};
    const anchorId = String(anchor?.anchor_id || anchor?.anchorId || anchor?.id || "").trim();
    if (!sid || !anchorId || !body) {
      return { ok: false, error: "Требуется выбранный якорь и текст комментария." };
    }
    const selectedType = String(anchor?.anchor_type || anchor?.anchorType || "").trim();
    const elementType = String(anchor?.element_type || anchor?.elementType || anchor?.type || "").trim();
    const anchorType = normalizeReviewAnchorType(selectedType, elementType);
    const authorUserId = String(user?.id || "").trim();
    const authorLabel = String(user?.email || user?.id || "you").trim() || "you";

    const currentMap = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    const nextMap = withAddedReviewComment(currentMap, {
      session_id: sid,
      anchor_type: anchorType,
      anchor_id: anchorId,
      anchor_label: String(anchor?.anchor_label || anchor?.anchorLabel || anchor?.name || anchorId).trim() || anchorId,
      anchor_path: String(anchor?.anchor_path || anchor?.anchorPath || "").trim(),
      body,
      author_user_id: authorUserId,
      author_label: authorLabel,
      status: "open",
    });

    if (isLocalSessionId(sid)) {
      setDraftPersisted((d) => ({ ...d, notes_by_element: nextMap }));
      await changeSessionReviewStatus("in_review", { markOk: "Комментарий добавлен." });
      emitDiagramFlash({
        sid,
        elementId: anchorId,
        type: "accent",
        badgeKind: "notes",
        label: "Review comment",
      });
      return { ok: true, local: true };
    }

    const r = await apiPatchSession(sid, { notes_by_element: nextMap });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось сохранить комментарий.") };
    }
    onSessionSync(r.session || {});
    await changeSessionReviewStatus("in_review");
    emitDiagramFlash({
      sid,
      elementId: anchorId,
      type: "accent",
      badgeKind: "notes",
      label: "Review comment",
    });
    markOk("Комментарий добавлен.");
    return { ok: true };
  }

  async function setAnchoredReviewCommentStatus(commentIdRaw, nextStatusRaw) {
    const sid = String(draft?.session_id || "").trim();
    const commentId = String(commentIdRaw || "").trim();
    const nextStatus = String(nextStatusRaw || "").trim().toLowerCase();
    if (!sid || !commentId || !nextStatus) {
      return { ok: false, error: "Комментарий не найден." };
    }
    const actorUserId = String(user?.id || "").trim();
    const actorLabel = String(user?.email || user?.id || "you").trim() || "you";
    const currentMap = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
    const nextMap = withReviewCommentStatus(currentMap, {
      comment_id: commentId,
      status: nextStatus,
      actor_user_id: actorUserId,
      actor_label: actorLabel,
    });

    if (isLocalSessionId(sid)) {
      setDraftPersisted((d) => ({ ...d, notes_by_element: nextMap }));
      return { ok: true, local: true };
    }
    const r = await apiPatchSession(sid, { notes_by_element: nextMap });
    if (!r.ok) {
      markFail(r.error);
      return { ok: false, error: String(r.error || "Не удалось обновить статус комментария.") };
    }
    onSessionSync(r.session || {});
    markOk("Статус комментария обновлён.");
    return { ok: true };
  }

  function focusReviewAnchor(anchorRaw = {}) {
    const sid = String(draft?.session_id || "").trim();
    const anchorId = String(anchorRaw?.anchor_id || anchorRaw?.anchorId || "").trim();
    if (!anchorId) return;
    const anchorType = normalizeReviewAnchorType(anchorRaw?.anchor_type || anchorRaw?.anchorType, anchorRaw?.elementType || anchorRaw?.type);
    if (sid) {
      setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
    }
    focusElementNotes({
      id: anchorId,
      name: String(anchorRaw?.anchor_label || anchorRaw?.anchorLabel || anchorId).trim() || anchorId,
      type: anchorType === "sequence_flow" ? "bpmn:SequenceFlow" : "bpmn:Task",
      laneName: "",
    }, "header_open_notes", { openSidebar: true });
    emitDiagramFlash({
      sid,
      elementId: anchorId,
      type: "accent",
      badgeKind: "notes",
      label: "Review anchor",
    });
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

  const currentProjectWorkspaceId = useMemo(() => {
    const pid = String(projectId || "").trim();
    if (!pid) return "";
    const found = projects.find((item) => projectIdOf(item) === pid);
    return String(found?.workspace_id || projectWorkspaceHintsRef.current.get(pid) || "").trim();
  }, [projects, projectId]);

  const currentSessionTitle = useMemo(() => {
    const sid = String(draft?.session_id || "").trim();
    if (!sid) return "";
    const found = sessions.find((item) => sessionIdOf(item) === sid);
    return String(found?.title || found?.name || draft?.title || "").trim();
  }, [sessions, draft?.session_id, draft?.title]);

  const openOrgSettings = useCallback((options = {}) => {
    const nextTab = normalizeOrgSettingsTab(options?.tab);
    const nextDictionaryOnly = nextTab === "dictionary" && !!options?.dictionaryOnly;
    setOrgSettingsTab(nextTab);
    setOrgSettingsOperationKey(String(options?.operationKey || options?.operation_key || "").trim());
    setOrgSettingsDictionaryOnly(nextDictionaryOnly);
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
    setOrgSettingsOperationKey("");
    setOrgSettingsDictionaryOnly(false);
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

  const notifyOrgPropertyDictionaryChanged = useCallback(() => {
    setOrgPropertyDictionaryRevision((prev) => prev + 1);
  }, []);

  const consumeSnapshotRestoreNotice = useCallback((sessionIdRaw, nonceRaw = 0) => {
    const sid = String(sessionIdRaw || "").trim();
    const nonce = Number(nonceRaw || 0);
    setSnapshotRestoreNotice((prev) => {
      if (!prev || String(prev?.sid || "").trim() !== sid) return prev;
      if (nonce > 0 && Number(prev?.nonce || 0) !== nonce) return prev;
      return null;
    });
  }, []);

  useEffect(() => {
    setDrawioCompanionFocusIntent(null);
  }, [projectId, draft?.session_id]);

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
        onSetElementCamundaExtensions={setElementCamundaExtensions}
        onSetElementCamundaPresentation={setElementCamundaPresentation}
        activeOrgId={activeOrgId}
        reviewStatus={reviewMeta.status}
        reviewComments={reviewComments}
        reviewOpenCommentsCount={reviewOpenCommentsCount}
        onChangeSessionReviewStatus={changeSessionReviewStatus}
        onAddReviewComment={addAnchoredReviewComment}
        onSetReviewCommentStatus={setAnchoredReviewCommentStatus}
        onFocusReviewAnchor={focusReviewAnchor}
        currentUserId={String(user?.id || "").trim()}
        currentUserLabel={String(user?.email || user?.id || "you").trim() || "you"}
        onOpenOrgSettings={openOrgSettings}
        orgPropertyDictionaryRevision={orgPropertyDictionaryRevision}
        onOrgPropertyDictionaryChanged={notifyOrgPropertyDictionaryChanged}
        onPropertiesOverlayPreviewChange={setSelectedPropertiesOverlayPreview}
        onPropertiesOverlayAlwaysPreviewChange={setSelectedPropertiesOverlayAlwaysPreview}
        showPropertiesOverlayAlways={showPropertiesOverlayAlways}
        onShowPropertiesOverlayAlwaysChange={setShowPropertiesOverlayAlways}
        showPropertiesOverlayOnSelect={showPropertiesOverlayOnSelect}
        onShowPropertiesOverlayOnSelectChange={setShowPropertiesOverlayOnSelect}
        onGoToDiagram={() => {
          const sid = String(draft?.session_id || "").trim();
          if (!sid) return;
          setProcessTabIntent({ sid, tab: "diagram", nonce: Date.now() });
        }}
        onFocusDrawioCompanion={(objectId) => {
          const sid = String(draft?.session_id || "").trim();
          const targetId = String(objectId || "").trim();
          if (!sid || !targetId) return;
          const nonce = Date.now();
          setProcessTabIntent({ sid, tab: "diagram", nonce });
          setDrawioCompanionFocusIntent({ sid, objectId: targetId, nonce });
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
        onDeleteProject={workspacePermissions.canDeleteProject ? (() => openDeleteDialog("project")) : undefined}
        onRenameSession={canManageProjectEntities ? (() => openRenameDialog("session")) : undefined}
        onDeleteSession={workspacePermissions.canDeleteSession ? (() => openDeleteDialog("session")) : undefined}
        disabled={locked}
      />
    );
  }, [
    phase,
    backendHint,
    draft,
    locked,
    projectId,
    activeOrgId,
    orgPropertyDictionaryRevision,
    currentProjectTitle,
    currentSessionTitle,
    selectedBpmnElement,
    processUiState,
    elementNotesFocusKey,
    showPropertiesOverlayAlways,
    showPropertiesOverlayOnSelect,
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
    setElementCamundaExtensions,
    setElementCamundaPresentation,
    reviewMeta.status,
    reviewComments,
    reviewOpenCommentsCount,
    changeSessionReviewStatus,
    addAnchoredReviewComment,
    setAnchoredReviewCommentStatus,
    focusReviewAnchor,
    openOrgSettings,
    notifyOrgPropertyDictionaryChanged,
    openSession,
    returnToSessionList,
    openRenameDialog,
    openDeleteDialog,
    canManageProjectEntities,
    workspacePermissions,
    user?.id,
    user?.email,
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
    clearSessionRestoreMemory();
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
        const nextTab = readOrgSettingsTabFromUrl();
        setOrgSettingsTab(nextTab);
        setOrgSettingsDictionaryOnly((prev) => (nextTab === "dictionary" ? prev : false));
      }
      logNav("popstate", {
        projectId: fromUrl.projectId || "-",
        sessionId: fromUrl.sessionId || "-",
      });
      if (fromUrl.projectId && fromUrl.projectId !== String(projectId || "").trim()) {
        setProjectId(fromUrl.projectId);
      }
      if (fromUrl.sessionId) {
        setRequestedSessionId(fromUrl.sessionId);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const pid = String(projectId || "").trim();
    const sid = String(draft?.session_id || "").trim();
    const requestedSid = String(requestedSessionIdRef.current || "").trim();
    const fromUrl = readSelectionFromUrl();
    if (shouldPreserveSelectionRouteDuringRestore({
      projectId: pid,
      sessionId: sid,
      requestedSessionId: requestedSid,
      urlProjectId: fromUrl.projectId,
      urlSessionId: fromUrl.sessionId,
    })) {
      logNav("selection_sync_preserve_requested", {
        projectId: pid || fromUrl.projectId || "-",
        sessionId: requestedSid,
      });
      return;
    }
    writeSelectionToUrl({ projectId: pid, sessionId: sid });
    logNav("selection_sync", { projectId: pid || "-", sessionId: sid || "-" });
    if (sid) setRequestedSessionId(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, draft?.session_id]);

  useEffect(() => {
    if (!projectId) return;
    refreshSessions(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <>
      <AppShell
        draft={draft}
        shellSessionId={shellSessionId}
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
        projectWorkspaceId={currentProjectWorkspaceId}
        onProjectChange={async (pid) => {
          const next = String(pid || "");
          logNav("project_change", { projectId: next || "-" });
          if (!next.trim()) {
            suppressProjectAutoselectRef.current = true;
          }
          setProjectId(next);
          setSessionNavNotice(null);
          clearSessionRestoreMemory();
          setSessions([]);
          resetDraft(ensureDraftShape(null));
        }}
        onDeleteProject={workspacePermissions.canDeleteProject ? deleteCurrentProject : undefined}
        canManageProjectEntities={canManageProjectEntities}
        sessions={sessions}
        sessionId={String(draft?.session_id || "")}
        sessionStatus={resolveSessionStatusFromDraft(draft, "draft")}
        sessionReviewStatus={reviewMeta.status}
        sessionReviewOpenCommentsCount={reviewOpenCommentsCount}
        sessionRemoteSyncState={remoteSessionSyncState}
        onOpenSession={openSession}
        onOpenWorkspaceSession={openWorkspaceSession}
        onDeleteSession={workspacePermissions.canDeleteSession ? deleteCurrentSession : undefined}
        onChangeSessionStatus={workspacePermissions.canChangeStatus ? changeCurrentSessionStatus : undefined}
        onChangeSessionReviewStatus={workspacePermissions.canChangeStatus ? changeSessionReviewStatus : undefined}
        onApplySessionRemoteSync={applyPendingRemoteSessionSync}
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
        onPublishRealtimeBpmnOps={publishRealtimeBpmnOps}
        onRecalculateRtiers={recalculateRtiers}
        snapshotRestoreNotice={snapshotRestoreNotice}
        onSnapshotRestoreNoticeConsumed={consumeSnapshotRestoreNotice}
        selectedPropertiesOverlayPreview={selectedPropertiesOverlayPreview}
        propertiesOverlayAlwaysEnabled={showPropertiesOverlayAlways}
        propertiesOverlayAlwaysPreviewByElementId={propertiesOverlayAlwaysPreviewByElementId}
        drawioCompanionFocusIntent={drawioCompanionFocusIntent}
        sessionNavNotice={sessionNavNotice}
        onDismissSessionNavNotice={() => setSessionNavNotice(null)}
        onReturnToSessionList={() => returnToSessionList("banner_action")}
      />

      <OrgSettingsModal
        open={orgSettingsOpen}
        onClose={closeOrgSettings}
        initialTab={orgSettingsTab}
        dictionaryOnly={orgSettingsDictionaryOnly}
        activeOrgId={activeOrgId}
        activeOrgRole={activeOrgRole}
        isAdmin={Boolean(user?.is_admin)}
        orgName={activeOrgName}
        onRequestRefreshOrgs={refreshOrgs}
        initialOperationKey={orgSettingsOperationKey}
        onDictionaryChanged={notifyOrgPropertyDictionaryChanged}
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
