import { useEffect, useMemo, useRef, useState } from "react";
import {
  elementNotesForId,
  normalizeElementNotesMap,
} from "../features/notes/elementNotes";
import {
  buildCoverageMatrix,
  formatTemplateNoteText,
  getNoteTemplatePreset,
  normalizeAiQuestionsByElementMap,
} from "../features/notes/knowledgeTools";
import { parseBatchOpsFromNotes } from "../features/process/bpmn/ops/parseBatchOpsFromNotes";
import {
  collectBpmnTraversalOrderMeta,
  parseLaneMetaByNodeFromBpmnXml,
  parseNodeKindMapFromBpmnXml,
} from "./process/interview/utils";
import {
  canonicalRobotMetaString,
  createDefaultRobotMetaV1,
  getRobotMetaStatus,
  normalizeRobotMetaMap,
  normalizeRobotMetaV1,
  robotMetaMissingFields,
} from "../features/process/robotmeta/robotMeta";
import SidebarShell from "./sidebar/SidebarShell";
import ActorsSection from "./sidebar/ActorsSection";
import TemplatesAndTldrSection from "./sidebar/TemplatesAndTldrSection";
import SidebarPrimaryActions from "./sidebar/SidebarPrimaryActions";
import SelectedElementCard from "./sidebar/SelectedElementCard";
import SidebarAccordion from "./sidebar/SidebarAccordion";
import PathsSection from "./sidebar/PathsSection";
import TimeSection from "./sidebar/TimeSection";
import RobotMetaSection from "./sidebar/RobotMetaSection";
import AiSection from "./sidebar/AiSection";
import NotesSection from "./sidebar/NotesSection";
import { buildNodePathUpdatesFromFlowMeta } from "./sidebar/nodePathImport";
import { useTldr } from "../features/tldr/hooks/useTldr";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function str(v) {
  return String(v || "").trim();
}

function normalizeFlowTier(raw) {
  const tier = String(raw || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

const NODE_PATH_TAG_ORDER = ["P0", "P1", "P2"];
const NODE_PATH_TAG_SET = new Set(NODE_PATH_TAG_ORDER);
const NODE_PATH_GATEWAY_KINDS = new Set(["exclusivegateway", "inclusivegateway", "parallelgateway", "eventbasedgateway"]);

function normalizeNodePathTag(value) {
  const tag = String(value || "").trim().toUpperCase();
  return NODE_PATH_TAG_SET.has(tag) ? tag : "";
}

function normalizeSequenceKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeNodePathEntry(rawEntry) {
  const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const seen = new Set();
  const paths = asArray(entry.paths)
    .map((item) => normalizeNodePathTag(item))
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .sort((a, b) => NODE_PATH_TAG_ORDER.indexOf(a) - NODE_PATH_TAG_ORDER.indexOf(b));
  if (!paths.length) return null;
  const sequence_key = normalizeSequenceKey(entry.sequence_key || entry.sequenceKey);
  const sourceRaw = str(entry.source).toLowerCase();
  const source = sourceRaw === "color_auto" ? "color_auto" : "manual";
  const out = { paths, source };
  if (sequence_key) out.sequence_key = sequence_key;
  return out;
}

function normalizeNodePathMetaMap(rawMap) {
  const src = rawMap && typeof rawMap === "object" ? rawMap : {};
  const out = {};
  Object.keys(src).forEach((rawNodeId) => {
    const nodeId = str(rawNodeId);
    if (!nodeId) return;
    const entry = normalizeNodePathEntry(src[rawNodeId]);
    if (!entry) return;
    out[nodeId] = entry;
  });
  return out;
}

function parseStepTimeMinutes(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function parseStepTimeSeconds(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function normalizeStepTimeUnit(raw) {
  return String(raw || "").trim().toLowerCase() === "sec" ? "sec" : "min";
}

function readNodeStepTimeMinutes(nodeRaw) {
  const node = nodeRaw && typeof nodeRaw === "object" ? nodeRaw : {};
  const params = node.parameters && typeof node.parameters === "object" ? node.parameters : {};
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
    const parsed = parseStepTimeMinutes(candidates[i]);
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
    const seconds = parseStepTimeSeconds(secondsCandidates[i]);
    if (seconds !== null) return Math.round(seconds / 60);
  }
  return null;
}

function readNodeStepTimeSeconds(nodeRaw) {
  const node = nodeRaw && typeof nodeRaw === "object" ? nodeRaw : {};
  const params = node.parameters && typeof node.parameters === "object" ? node.parameters : {};
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
    const parsed = parseStepTimeSeconds(candidates[i]);
    if (parsed !== null) return parsed;
  }
  const minutes = readNodeStepTimeMinutes(node);
  if (minutes === null) return null;
  return Math.round(minutes * 60);
}

function normalizeLoose(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const LANE_COUNTABLE_NODE_KINDS = new Set([
  "task",
  "usertask",
  "servicetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "sendtask",
  "receivetask",
  "callactivity",
  "subprocess",
  "adhocsubprocess",
  "exclusivegateway",
  "inclusivegateway",
  "parallelgateway",
  "eventbasedgateway",
  "startevent",
  "endevent",
  "intermediatecatchevent",
  "intermediatethrowevent",
  "boundaryevent",
]);

function buildLaneElementCountsFromBpmn(xmlText) {
  const xml = str(xmlText);
  if (!xml) return { byKey: {}, byLaneId: {}, byName: {} };

  const laneMetaByNode = parseLaneMetaByNodeFromBpmnXml(xml);
  const nodeKindById = parseNodeKindMapFromBpmnXml(xml);
  const byKey = {};
  const byLaneId = {};
  const byName = {};

  Object.keys(laneMetaByNode).forEach((nodeId) => {
    const laneMeta = laneMetaByNode[nodeId] && typeof laneMetaByNode[nodeId] === "object" ? laneMetaByNode[nodeId] : {};
    const kind = str(nodeKindById[nodeId]).toLowerCase();
    if (!LANE_COUNTABLE_NODE_KINDS.has(kind)) return;

    const laneKey = str(laneMeta.key);
    const laneId = str(laneMeta.id);
    const laneNameKey = normalizeLoose(laneMeta.name || laneMeta.label);

    if (laneKey) byKey[laneKey] = Number(byKey[laneKey] || 0) + 1;
    if (laneId) byLaneId[laneId] = Number(byLaneId[laneId] || 0) + 1;
    if (laneNameKey) byName[laneNameKey] = Number(byName[laneNameKey] || 0) + 1;
  });

  return { byKey, byLaneId, byName };
}

function parseSequenceFlowXorContext(xmlText) {
  const xml = str(xmlText);
  if (!xml || typeof DOMParser === "undefined") {
    return { flowSourceById: {}, outgoingBySource: {}, gatewayModeByNode: {} };
  }
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (!doc || doc.getElementsByTagName("parsererror").length > 0) {
      return { flowSourceById: {}, outgoingBySource: {}, gatewayModeByNode: {} };
    }
    const flowSourceById = {};
    const outgoingBySource = {};
    const gatewayModeByNode = {};

    const all = Array.from(doc.getElementsByTagName("*"));
    all.forEach((el) => {
      const local = String(el.localName || "").toLowerCase();
      if (local === "exclusivegateway") {
        const gatewayId = str(el.getAttribute("id"));
        if (gatewayId) gatewayModeByNode[gatewayId] = "xor";
      }
      if (local !== "sequenceflow") return;
      const flowId = str(el.getAttribute("id"));
      const sourceId = str(el.getAttribute("sourceRef"));
      if (!flowId || !sourceId) return;
      flowSourceById[flowId] = sourceId;
      if (!outgoingBySource[sourceId]) outgoingBySource[sourceId] = [];
      outgoingBySource[sourceId].push(flowId);
    });
    Object.keys(outgoingBySource).forEach((sourceId) => {
      outgoingBySource[sourceId] = Array.from(new Set(asArray(outgoingBySource[sourceId]).map((id) => str(id)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
    });
    return { flowSourceById, outgoingBySource, gatewayModeByNode };
  } catch {
    return { flowSourceById: {}, outgoingBySource: {}, gatewayModeByNode: {} };
  }
}

function parseNodePathGraphContext(xmlText) {
  const xml = str(xmlText);
  if (!xml || typeof DOMParser === "undefined") {
    return {
      nodeKindById: {},
      outgoingByNodeId: {},
      flowEndpointsById: {},
      rankByNodeId: {},
    };
  }
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (!doc || doc.getElementsByTagName("parsererror").length > 0) {
      return {
        nodeKindById: {},
        outgoingByNodeId: {},
        flowEndpointsById: {},
        rankByNodeId: {},
      };
    }
    const nodeKindById = {};
    const flowEndpointsById = {};
    const outgoingByNodeId = {};
    const traversalMeta = collectBpmnTraversalOrderMeta(xml);
    const rankByNodeId = {};
    asArray(traversalMeta?.nodeIds).forEach((nodeId, idx) => {
      rankByNodeId[str(nodeId)] = idx;
    });

    Array.from(doc.getElementsByTagName("*")).forEach((el) => {
      const local = String(el.localName || "").toLowerCase();
      const nodeId = str(el.getAttribute("id"));
      if (nodeId && (
        local === "task"
        || local === "usertask"
        || local === "servicetask"
        || local === "manualtask"
        || local === "scripttask"
        || local === "businessruletask"
        || local === "sendtask"
        || local === "receivetask"
        || local === "callactivity"
        || local === "subprocess"
        || local === "adhocsubprocess"
        || local === "startevent"
        || local === "endevent"
        || local === "boundaryevent"
        || local === "intermediatecatchevent"
        || local === "intermediatethrowevent"
        || local === "intermediateevent"
        || local === "exclusivegateway"
        || local === "inclusivegateway"
        || local === "parallelgateway"
        || local === "eventbasedgateway"
      )) {
        nodeKindById[nodeId] = local;
      }
      if (local !== "sequenceflow") return;
      const flowId = str(el.getAttribute("id"));
      const sourceId = str(el.getAttribute("sourceRef"));
      const targetId = str(el.getAttribute("targetRef"));
      if (!flowId || !sourceId || !targetId || sourceId === targetId) return;
      flowEndpointsById[flowId] = { sourceId, targetId };
      if (!outgoingByNodeId[sourceId]) outgoingByNodeId[sourceId] = [];
      outgoingByNodeId[sourceId].push(targetId);
    });
    Object.keys(outgoingByNodeId).forEach((nodeId) => {
      outgoingByNodeId[nodeId] = Array.from(new Set(asArray(outgoingByNodeId[nodeId]).map((x) => str(x)).filter(Boolean)))
        .sort((a, b) => {
          const ar = Number(rankByNodeId[a]);
          const br = Number(rankByNodeId[b]);
          const av = Number.isFinite(ar) ? ar : Number.MAX_SAFE_INTEGER;
          const bv = Number.isFinite(br) ? br : Number.MAX_SAFE_INTEGER;
          if (av !== bv) return av - bv;
          return a.localeCompare(b, "ru");
        });
    });
    return { nodeKindById, outgoingByNodeId, flowEndpointsById, rankByNodeId };
  } catch {
    return {
      nodeKindById: {},
      outgoingByNodeId: {},
      flowEndpointsById: {},
      rankByNodeId: {},
    };
  }
}

function normalizeGlobalNoteItem(raw, fallbackIndex = 0) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const text = str(obj.text || obj.note || obj.notes || obj.message || raw);
  if (!text) return null;
  const rawTs = obj.ts ?? obj.createdAt ?? obj.created_at ?? obj.updatedAt ?? obj.updated_at;
  let ts = Number(rawTs);
  if (!Number.isFinite(ts) || ts <= 0) {
    const parsed = Date.parse(str(rawTs));
    ts = Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
  }
  const author = str(obj.author || obj.user || obj.created_by || "you") || "you";
  const id = str(obj.id || obj.note_id || obj.noteId) || `note_${ts}_${fallbackIndex + 1}`;
  return { id, text, ts, author };
}

function normalizeGlobalNotes(value) {
  let source = [];
  if (Array.isArray(value)) {
    source = value;
  } else if (value && typeof value === "object") {
    source = [value];
  } else {
    const raw = str(value);
    if (!raw) source = [];
    else {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) source = parsed;
        else if (parsed && typeof parsed === "object") source = [parsed];
        else source = [{ text: raw }];
      } catch {
        source = [{ text: raw }];
      }
    }
  }
  return source
    .map((item, idx) => normalizeGlobalNoteItem(item, idx))
    .filter(Boolean)
    .sort((a, b) => {
      const dt = Number(b?.ts || 0) - Number(a?.ts || 0);
      if (dt !== 0) return dt;
      return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
    });
}

function roleObj(r, idx) {
  if (!r) return null;
  if (typeof r === "string") {
    const label = str(r);
    if (!label) return null;
    return { role_id: `role_${idx + 1}`, label };
  }
  if (typeof r === "object") {
    const role_id = str(r.role_id || r.id || `role_${idx + 1}`);
    const label = str(r.label || r.title || role_id);
    if (!role_id && !label) return null;
    return {
      role_id: role_id || `role_${idx + 1}`,
      label: label || role_id,
      laneId: str(r.laneId || r.lane_id),
      poolId: str(r.poolId || r.pool_id),
      poolName: str(r.poolName || r.pool_name),
    };
  }
  const label = str(r);
  if (!label) return null;
  return { role_id: `role_${idx + 1}`, label };
}

function normalizeRoles(roles) {
  const arr = asArray(roles);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const x = roleObj(arr[i], out.length);
    if (x) out.push(x);
  }
  return out;
}

function normalizeDerivedActors(actors) {
  const arr = asArray(actors);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < arr.length; i += 1) {
    const raw = arr[i];
    if (!raw || typeof raw !== "object") continue;
    const actorId = str(raw.actorId || raw.id || raw.laneId || `actor_${i + 1}`);
    const label = str(raw.name || raw.label || raw.laneName || actorId);
    if (!actorId || !label) continue;
    if (seen.has(actorId)) continue;
    seen.add(actorId);
    out.push({
      role_id: actorId,
      label,
      actorId,
      poolId: str(raw.poolId || raw.pool_id),
      poolName: str(raw.poolName || raw.pool_name),
      laneId: str(raw.laneId || raw.lane_id),
    });
  }
  return out;
}

function normalizeAiStatus(raw) {
  return String(raw || "").trim().toLowerCase() === "done" ? "done" : "open";
}

function resolveAiGenerateUiState({
  sid,
  selectedElementId,
  disabled,
  processUiState,
}) {
  if (disabled) {
    return {
      canGenerate: false,
      reasonCode: "locked",
      reasonText: "Редактирование недоступно в текущем режиме.",
      cta: null,
    };
  }
  if (!sid) {
    return {
      canGenerate: false,
      reasonCode: "no_session",
      reasonText: "Сначала откройте сессию процесса.",
      cta: null,
    };
  }
  if (!selectedElementId) {
    const ui = processUiState && typeof processUiState === "object" ? processUiState : null;
    const requiresDiagram = !!ui && String(ui.sid || "").trim() === sid && String(ui.tab || "") !== "diagram";
    return {
      canGenerate: false,
      reasonCode: "no_selection",
      reasonText: requiresDiagram
        ? "Генерация доступна в режиме Diagram при выбранном узле."
        : "Выберите узел на схеме.",
      cta: requiresDiagram ? { type: "diagram", label: "Перейти в Diagram" } : null,
    };
  }
  const ui = processUiState && typeof processUiState === "object" ? processUiState : null;
  if (!ui || String(ui.sid || "").trim() !== sid) {
    return {
      canGenerate: true,
      reasonCode: "",
      reasonText: "",
      cta: null,
    };
  }
  if (String(ui.tab || "") !== "diagram") {
    return {
      canGenerate: false,
      reasonCode: "tab_diagram_required",
      reasonText: "Генерация доступна в режиме Diagram при выбранном узле.",
      cta: { type: "diagram", label: "Перейти в Diagram" },
    };
  }
  if (ui.isLocal) {
    return {
      canGenerate: false,
      reasonCode: "local_session",
      reasonText: "Генерация AI-вопросов доступна только для API-сессий.",
      cta: null,
    };
  }
  if (ui.aiQuestionsBusy) {
    return {
      canGenerate: false,
      reasonCode: "busy",
      reasonText: "Генерация уже выполняется.",
      cta: null,
    };
  }
  if (ui.canGenerateAiQuestions === false) {
    return {
      canGenerate: false,
      reasonCode: String(ui.aiGenerateBlockReasonCode || "blocked"),
      reasonText: str(ui.aiGenerateBlockReason || "Генерация сейчас недоступна."),
      cta: null,
    };
  }
  return {
    canGenerate: true,
    reasonCode: "",
    reasonText: "",
    cta: null,
  };
}

function shouldLogActorsTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_ACTORS__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_actors") || "").trim() === "1";
  } catch {
    return false;
  }
}

const NOTES_BATCH_MODE_KEY = "fpc_notes_batch_mode";
const NOTES_BATCH_APPLY_EVENT = "fpc:batch_ops_apply";
const NOTES_BATCH_RESULT_PREFIX = "fpc:batch_ops_result:";
const NOTES_COVERAGE_OPEN_EVENT = "fpc:coverage_open";
const SIDEBAR_SECTIONS_STATE_KEY = "fpc_left_sidebar_sections";
const SIDEBAR_LAST_OPEN_KEY = "ui.sidebar.last_open.v2";
const SIDEBAR_ACCORDION_KEYS = ["paths", "time", "robotmeta", "ai", "notes", "advanced"];

const DEFAULT_SECTIONS_STATE = {
  paths: false,
  time: false,
  robotmeta: false,
  ai: false,
  notes: false,
  advanced: false,
};

function isHardReloadNavigation() {
  if (typeof window === "undefined") return false;
  try {
    const nav = window.performance?.getEntriesByType?.("navigation")?.[0];
    return String(nav?.type || "").toLowerCase() === "reload";
  } catch {
    return false;
  }
}

function readBatchMode() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(NOTES_BATCH_MODE_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function writeBatchMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(NOTES_BATCH_MODE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function readSectionsState() {
  if (typeof window === "undefined") return { ...DEFAULT_SECTIONS_STATE };
  if (isHardReloadNavigation()) return { ...DEFAULT_SECTIONS_STATE };
  try {
    const raw = window.localStorage?.getItem(SIDEBAR_SECTIONS_STATE_KEY) || "";
    if (!raw) return { ...DEFAULT_SECTIONS_STATE };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SECTIONS_STATE };
    return {
      ...DEFAULT_SECTIONS_STATE,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_SECTIONS_STATE };
  }
}

function writeSectionsState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(SIDEBAR_SECTIONS_STATE_KEY, JSON.stringify({
      ...DEFAULT_SECTIONS_STATE,
      ...(state && typeof state === "object" ? state : {}),
    }));
  } catch {
  }
}

function readLastOpenAccordionKey() {
  if (typeof window === "undefined") return "";
  try {
    const key = String(window.localStorage?.getItem(SIDEBAR_LAST_OPEN_KEY) || "").trim();
    return SIDEBAR_ACCORDION_KEYS.includes(key) ? key : "";
  } catch {
    return "";
  }
}

function writeLastOpenAccordionKey(keyRaw) {
  if (typeof window === "undefined") return;
  const key = String(keyRaw || "").trim();
  try {
    if (!SIDEBAR_ACCORDION_KEYS.includes(key)) {
      window.localStorage?.removeItem(SIDEBAR_LAST_OPEN_KEY);
      return;
    }
    window.localStorage?.setItem(SIDEBAR_LAST_OPEN_KEY, key);
  } catch {
  }
}

function shouldLogAiOpsTrace() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem("fpc_debug_ai_ops") || "").trim() === "1";
  } catch {
    return false;
  }
}

function dispatchBatchApply(payload = {}, timeoutMs = 16000) {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, error: "window_unavailable" });
  }
  const requestId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const resultEvent = `${NOTES_BATCH_RESULT_PREFIX}${requestId}`;

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      window.removeEventListener(resultEvent, onResult);
      resolve(value);
    };
    const onResult = (event) => {
      finish(event?.detail && typeof event.detail === "object" ? event.detail : { ok: false, error: "empty_result" });
    };
    window.addEventListener(resultEvent, onResult, { once: true });
    window.setTimeout(() => {
      finish({ ok: false, error: "batch_timeout" });
    }, timeoutMs);

    window.dispatchEvent(new CustomEvent(NOTES_BATCH_APPLY_EVENT, {
      detail: {
        ...payload,
        requestId,
      },
    }));
  });
}

export default function NotesPanel({
  draft,
  projectId = "",
  projectTitle = "",
  sessionTitle = "",
  selectedElement,
  elementNotesFocusKey,
  onAddNote,
  onAddElementNote,
  onSetElementStepTime,
  onSetElementNoteSummary,
  onUpdateElementAiQuestion,
  onSetStartRole,
  processUiState,
  onRequestGenerateAiQuestions,
  onSetFlowPathTier,
  onSetFlowHappyPath,
  onSetNodePathAssignments,
  onSetElementRobotMeta,
  onGoToDiagram,
  onProjectBreadcrumbClick,
  onSessionBreadcrumbClick,
  sidebarHidden,
  sidebarCompact,
  onToggleSidebarCompact,
  onToggleSidebarHidden,
  activeSectionId,
  onActiveSectionChange,
  sidebarShortcutRequest,
  onSidebarShortcutHandled,
  stepTimeUnit = "min",
  onStepTimeUnitChange,
  onRenameProject,
  onDeleteProject,
  onRenameSession,
  onDeleteSession,
  disabled,
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [elementText, setElementText] = useState("");
  const [elementBusy, setElementBusy] = useState(false);
  const [elementErr, setElementErr] = useState("");
  const [stepTimeInput, setStepTimeInput] = useState("");
  const [stepTimeBusy, setStepTimeBusy] = useState(false);
  const [stepTimeErr, setStepTimeErr] = useState("");
  const [flowHappyBusy, setFlowHappyBusy] = useState(false);
  const [flowHappyErr, setFlowHappyErr] = useState("");
  const [flowHappyInfo, setFlowHappyInfo] = useState("");
  const [nodePathBusy, setNodePathBusy] = useState(false);
  const [nodePathErr, setNodePathErr] = useState("");
  const [nodePathInfo, setNodePathInfo] = useState("");
  const [nodePathDraftPaths, setNodePathDraftPaths] = useState([]);
  const [nodePathDraftSequence, setNodePathDraftSequence] = useState("");
  const [robotMetaDraft, setRobotMetaDraft] = useState(() => createDefaultRobotMetaV1());
  const [robotMetaBusy, setRobotMetaBusy] = useState(false);
  const [robotMetaErr, setRobotMetaErr] = useState("");
  const [robotMetaInfo, setRobotMetaInfo] = useState("");
  const [bulkNodeIds, setBulkNodeIds] = useState([]);
  const [aiErr, setAiErr] = useState("");
  const [aiBusyQid, setAiBusyQid] = useState("");
  const [aiSavedQid, setAiSavedQid] = useState("");
  const [aiCommentDraft, setAiCommentDraft] = useState({});
  const [batchMode, setBatchMode] = useState(() => readBatchMode());
  const [batchText, setBatchText] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchErr, setBatchErr] = useState("");
  const [batchResult, setBatchResult] = useState("");
  const [templateErr, setTemplateErr] = useState("");
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [startRoleBusy, setStartRoleBusy] = useState(false);
  const [startRoleErr, setStartRoleErr] = useState("");
  const [laneElementCounts, setLaneElementCounts] = useState(() => ({ byKey: {}, byLaneId: {}, byName: {} }));
  const [sectionsOpen, setSectionsOpen] = useState(() => readSectionsState());
  const [selectedCardOpen, setSelectedCardOpen] = useState(true);
  const elementNotesSectionRef = useRef(null);
  const pathsSectionRef = useRef(null);
  const timeSectionRef = useRef(null);
  const robotMetaSectionRef = useRef(null);
  const aiSectionRef = useRef(null);
  const notesSectionRef = useRef(null);
  const advancedSectionRef = useRef(null);
  const sidebarHiddenRef = useRef(Boolean(sidebarHidden));
  const nodeEditorRef = useRef(null);

  const derivedActors = useMemo(() => normalizeDerivedActors(draft?.actors_derived), [draft]);
  const legacyRoles = useMemo(() => normalizeRoles(draft?.roles), [draft]);
  const roles = derivedActors.length ? derivedActors : legacyRoles;
  const rolesSourceLabel = derivedActors.length ? "из Diagram lanes" : "из сессии";
  const roleElementCounts = useMemo(() => {
    const byRole = {};
    const byKey = laneElementCounts?.byKey && typeof laneElementCounts.byKey === "object" ? laneElementCounts.byKey : {};
    const byLaneId = laneElementCounts?.byLaneId && typeof laneElementCounts.byLaneId === "object" ? laneElementCounts.byLaneId : {};
    const byName = laneElementCounts?.byName && typeof laneElementCounts.byName === "object" ? laneElementCounts.byName : {};
    asArray(roles).forEach((role) => {
      const roleId = str(role?.role_id);
      if (!roleId) return;
      const laneId = str(role?.laneId);
      const laneNameKey = normalizeLoose(role?.label);
      let count = Number(byKey[roleId]);
      if (!Number.isFinite(count)) count = Number(byLaneId[laneId]);
      if (!Number.isFinite(count)) count = Number(byName[laneNameKey]);
      byRole[roleId] = Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
    });
    return byRole;
  }, [roles, laneElementCounts]);
  const startRoleValue = str(draft?.start_role);
  const normalizedNotes = useMemo(() => normalizeGlobalNotes(draft?.notes), [draft?.notes]);
  const notes = normalizedNotes;
  const noteCount = normalizedNotes.length;
  const notesByElement = useMemo(
    () => normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId),
    [draft?.notes_by_element, draft?.notesByElementId],
  );
  const selectedElementId = str(selectedElement?.id);
  const selectedElementName = str(selectedElement?.name || selectedElementId);
  const selectedElementType = str(selectedElement?.type);
  const selectedElementLaneName = str(selectedElement?.laneName || selectedElement?.lane || selectedElement?.actorRole);
  const selectedElementNode = useMemo(
    () => asArray(draft?.nodes).find((node) => str(node?.id) === selectedElementId) || null,
    [draft?.nodes, selectedElementId],
  );
  const normalizedStepTimeUnit = normalizeStepTimeUnit(stepTimeUnit);
  const selectedElementStepTime = useMemo(
    () => readNodeStepTimeMinutes(selectedElementNode),
    [selectedElementNode],
  );
  const selectedElementStepTimeSec = useMemo(
    () => readNodeStepTimeSeconds(selectedElementNode),
    [selectedElementNode],
  );
  const selectedElementNotes = useMemo(
    () => elementNotesForId(notesByElement, selectedElementId),
    [notesByElement, selectedElementId],
  );
  const sessionTldr = useTldr(draft);
  const aiQuestionsByElement = useMemo(
    () => normalizeAiQuestionsByElementMap(draft?.interview?.ai_questions_by_element || draft?.interview?.aiQuestionsByElementId),
    [draft?.interview?.ai_questions_by_element, draft?.interview?.aiQuestionsByElementId],
  );
  const selectedElementAiQuestions = useMemo(
    () => asArray(aiQuestionsByElement[selectedElementId]),
    [aiQuestionsByElement, selectedElementId],
  );
  const isElementMode = !!selectedElementId;
  const isSelectedSequenceFlow = /(^|:)sequenceflow$/i.test(selectedElementType);
  const bpmnFlowMetaById = useMemo(() => {
    const rawMeta = draft?.bpmn_meta && typeof draft.bpmn_meta === "object" ? draft.bpmn_meta : {};
    return rawMeta.flow_meta && typeof rawMeta.flow_meta === "object" ? rawMeta.flow_meta : {};
  }, [draft?.bpmn_meta]);
  const bpmnNodePathMetaById = useMemo(() => {
    const rawMeta = draft?.bpmn_meta && typeof draft.bpmn_meta === "object" ? draft.bpmn_meta : {};
    return normalizeNodePathMetaMap(rawMeta.node_path_meta);
  }, [draft?.bpmn_meta]);
  const bpmnRobotMetaByElementId = useMemo(() => {
    const rawMeta = draft?.bpmn_meta && typeof draft.bpmn_meta === "object" ? draft.bpmn_meta : {};
    return normalizeRobotMetaMap(rawMeta.robot_meta_by_element_id);
  }, [draft?.bpmn_meta]);
  const hasExplicitNodePathMeta = useMemo(
    () => Object.keys(bpmnNodePathMetaById).length > 0,
    [bpmnNodePathMetaById],
  );
  const hasTieredFlowMeta = useMemo(() => {
    const flowMetaEntries = bpmnFlowMetaById && typeof bpmnFlowMetaById === "object"
      ? Object.values(bpmnFlowMetaById)
      : [];
    return flowMetaEntries.some((entryRaw) => {
      const entry = entryRaw && typeof entryRaw === "object" ? entryRaw : {};
      return !!normalizeFlowTier(entry?.tier) || !!entry?.happy;
    });
  }, [bpmnFlowMetaById]);
  const showLegacyPathImportHint = !hasExplicitNodePathMeta && hasTieredFlowMeta;
  const flowGatewayContext = useMemo(
    () => parseSequenceFlowXorContext(draft?.bpmn_xml),
    [draft?.bpmn_xml],
  );
  const nodePathGraphContext = useMemo(
    () => parseNodePathGraphContext(draft?.bpmn_xml),
    [draft?.bpmn_xml],
  );
  const selectedElementNodeKind = useMemo(
    () => str(nodePathGraphContext?.nodeKindById?.[selectedElementId]).toLowerCase(),
    [nodePathGraphContext, selectedElementId],
  );
  const isSelectedPathNode = !!selectedElementId
    && !isSelectedSequenceFlow
    && !!selectedElementNodeKind;
  const selectedNodePathEntry = useMemo(
    () => normalizeNodePathEntry(bpmnNodePathMetaById[selectedElementId]) || { paths: [], source: "manual" },
    [bpmnNodePathMetaById, selectedElementId],
  );
  const selectedRobotMetaEntry = useMemo(
    () => normalizeRobotMetaV1(bpmnRobotMetaByElementId[selectedElementId] || createDefaultRobotMetaV1()),
    [bpmnRobotMetaByElementId, selectedElementId],
  );
  const selectedRobotMetaEditable = !!selectedElementId && !isSelectedSequenceFlow && !!selectedElementNodeKind;
  const selectedRobotMetaStatus = useMemo(
    () => (selectedRobotMetaEditable ? getRobotMetaStatus(selectedRobotMetaEntry) : "none"),
    [selectedRobotMetaEditable, selectedRobotMetaEntry],
  );
  const selectedRobotMetaMissing = useMemo(
    () => (selectedRobotMetaEditable ? robotMetaMissingFields(selectedRobotMetaEntry) : []),
    [selectedRobotMetaEditable, selectedRobotMetaEntry],
  );
  const selectedElementTierLabel = useMemo(() => {
    const tags = asArray(selectedNodePathEntry?.paths).map((item) => normalizeNodePathTag(item)).filter(Boolean);
    if (!tags.length) return "";
    return tags.join("/");
  }, [selectedNodePathEntry]);
  const selectedElementFlowCounts = useMemo(() => {
    if (!selectedElementId) return { incoming: 0, outgoing: 0 };
    const endpoints = nodePathGraphContext?.flowEndpointsById && typeof nodePathGraphContext.flowEndpointsById === "object"
      ? nodePathGraphContext.flowEndpointsById
      : {};
    let incoming = 0;
    let outgoing = 0;
    Object.keys(endpoints).forEach((flowId) => {
      const edge = endpoints[flowId] && typeof endpoints[flowId] === "object" ? endpoints[flowId] : {};
      if (str(edge.sourceId) === selectedElementId) outgoing += 1;
      if (str(edge.targetId) === selectedElementId) incoming += 1;
    });
    return { incoming, outgoing };
  }, [nodePathGraphContext, selectedElementId]);
  const selectedElementSelectionIds = useMemo(() => {
    const ids = asArray(selectedElement?.selectedIds).map((id) => str(id)).filter(Boolean);
    if (selectedElementId && !ids.includes(selectedElementId)) ids.unshift(selectedElementId);
    return ids;
  }, [selectedElement?.selectedIds, selectedElementId]);
  const selectedFlowTier = useMemo(() => {
    if (!isSelectedSequenceFlow) return "";
    const entry = bpmnFlowMetaById[selectedElementId];
    const tier = normalizeFlowTier(entry?.tier);
    if (tier) return tier;
    if (entry?.happy) return "P0";
    return "";
  }, [isSelectedSequenceFlow, bpmnFlowMetaById, selectedElementId]);
  const selectedTemplate = useMemo(
    () => getNoteTemplatePreset(selectedElementType),
    [selectedElementType],
  );
  const coverage = useMemo(
    () => buildCoverageMatrix({
      nodes: asArray(draft?.nodes),
      notesByElement,
      aiQuestionsByElement,
    }),
    [draft?.nodes, notesByElement, aiQuestionsByElement],
  );
  const coverageRows = useMemo(
    () => asArray(coverage?.rows).filter((item) => Number(item?.score || 0) > 0),
    [coverage],
  );
  const sid = str(draft?.session_id || draft?.id);
  const setFlowTierHandler = typeof onSetFlowPathTier === "function"
    ? onSetFlowPathTier
    : onSetFlowHappyPath;
  const setNodePathHandler = typeof onSetNodePathAssignments === "function"
    ? onSetNodePathAssignments
    : null;
  const aiGenerateUi = useMemo(
    () => resolveAiGenerateUiState({
      sid,
      selectedElementId,
      disabled,
      processUiState,
    }),
    [sid, selectedElementId, disabled, processUiState],
  );
  const processTitle = str(draft?.title || draft?.name);
  const batchPlan = useMemo(() => {
    const raw = str(batchText);
    if (!raw) {
      return {
        ok: false,
        ops: [],
        preview: { total: 0, items: [] },
        errors: [],
        warnings: [],
      };
    }
    return parseBatchOpsFromNotes({
      text: raw,
      xmlText: str(draft?.bpmn_xml || ""),
      maxPreview: 5,
    });
  }, [batchText, draft?.bpmn_xml]);

  useEffect(() => {
    if (!shouldLogActorsTrace()) return;
    // eslint-disable-next-line no-console
    console.debug(
      `[ACTORS] leftpanel render sid=${sid || "-"} actorsDerivedCount=${derivedActors.length}`,
    );
  }, [sid, derivedActors.length]);

  useEffect(() => {
    const xml = str(draft?.bpmn_xml || "");
    const timer = setTimeout(() => {
      setLaneElementCounts(buildLaneElementCountsFromBpmn(xml));
    }, 80);
    return () => clearTimeout(timer);
  }, [draft?.bpmn_xml]);

  useEffect(() => {
    if (!selectedElementId) return;
    const node = elementNotesSectionRef.current;
    if (!node) return;
    node.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selectedElementId, elementNotesFocusKey]);

  useEffect(() => {
    setFlowHappyInfo("");
    setFlowHappyErr("");
  }, [selectedElementId]);

  useEffect(() => {
    setNodePathErr("");
    setNodePathInfo("");
    setNodePathBusy(false);
    setBulkNodeIds([]);
  }, [selectedElementId]);

  useEffect(() => {
    if (!isSelectedPathNode) {
      setNodePathDraftPaths([]);
      setNodePathDraftSequence("");
      return;
    }
    setNodePathDraftPaths(asArray(selectedNodePathEntry?.paths).map((tag) => normalizeNodePathTag(tag)).filter(Boolean));
    setNodePathDraftSequence(normalizeSequenceKey(selectedNodePathEntry?.sequence_key));
  }, [isSelectedPathNode, selectedNodePathEntry]);

  useEffect(() => {
    if (!selectedRobotMetaEditable) {
      setRobotMetaDraft(createDefaultRobotMetaV1());
      setRobotMetaErr("");
      setRobotMetaInfo("");
      return;
    }
    setRobotMetaDraft(selectedRobotMetaEntry);
    setRobotMetaErr("");
    setRobotMetaInfo("");
  }, [selectedRobotMetaEditable, selectedRobotMetaEntry]);

  useEffect(() => {
    const next = {};
    selectedElementAiQuestions.forEach((q) => {
      next[q.qid] = str(q.comment);
    });
    setAiCommentDraft(next);
    setAiErr("");
    setAiSavedQid("");
  }, [selectedElementId, selectedElementAiQuestions]);

  useEffect(() => {
    setTemplateErr("");
  }, [selectedElementId]);

  useEffect(() => {
    setFlowHappyErr("");
    setFlowHappyBusy(false);
  }, [selectedElementId]);

  useEffect(() => {
    setStepTimeErr("");
    let nextInput = "";
    if (normalizedStepTimeUnit === "sec") {
      nextInput = selectedElementStepTimeSec === null ? "" : String(selectedElementStepTimeSec);
    } else {
      nextInput = selectedElementStepTime === null ? "" : String(selectedElementStepTime);
    }
    setStepTimeInput((prev) => (prev === nextInput ? prev : nextInput));
  }, [selectedElementId, selectedElementStepTime, selectedElementStepTimeSec, normalizedStepTimeUnit]);

  useEffect(() => {
    writeBatchMode(batchMode);
  }, [batchMode]);

  useEffect(() => {
    writeSectionsState(sectionsOpen);
  }, [sectionsOpen]);

  useEffect(() => {
    setBatchErr("");
    setBatchResult("");
  }, [batchText]);

  useEffect(() => {
    const savedKey = readLastOpenAccordionKey();
    const nextKey = savedKey || "paths";
    setSectionsOpen(
      SIDEBAR_ACCORDION_KEYS.reduce((acc, key) => {
        acc[key] = key === nextKey;
        return acc;
      }, {}),
    );
    setSelectedCardOpen(true);
  }, [sid]);

  useEffect(() => {
    if (!isElementMode) return;
    setSectionsOpen((prev) => {
      if (Object.values(prev).some(Boolean)) return prev;
      return { ...DEFAULT_SECTIONS_STATE, paths: true };
    });
  }, [isElementMode, selectedElementId]);

  useEffect(() => {
    const wasHidden = sidebarHiddenRef.current;
    const isHidden = Boolean(sidebarHidden);
    if (wasHidden && !isHidden) {
      const savedKey = readLastOpenAccordionKey();
      const nextKey = savedKey || "paths";
      setSectionsOpen(
        SIDEBAR_ACCORDION_KEYS.reduce((acc, key) => {
          acc[key] = key === nextKey;
          return acc;
        }, {}),
      );
    }
    sidebarHiddenRef.current = isHidden;
  }, [sidebarHidden]);

  function toggleSection(sectionId) {
    const key = str(sectionId);
    if (!key || !SIDEBAR_ACCORDION_KEYS.includes(key)) return;
    setSectionsOpen((prev) => {
      const shouldOpen = !prev?.[key];
      const next = SIDEBAR_ACCORDION_KEYS.reduce((acc, id) => {
        acc[id] = shouldOpen && id === key;
        return acc;
      }, {});
      writeLastOpenAccordionKey(shouldOpen ? key : "");
      return next;
    });
    onActiveSectionChange?.(key);
  }

  function openSectionShortcut(sectionId) {
    const key = str(sectionId);
    if (!key || !SIDEBAR_ACCORDION_KEYS.includes(key)) return;
    onToggleSidebarCompact?.(false, "shortcut");
    setSectionsOpen(
      SIDEBAR_ACCORDION_KEYS.reduce((acc, id) => {
        acc[id] = id === key;
        return acc;
      }, {}),
    );
    writeLastOpenAccordionKey(key);
    onActiveSectionChange?.(key);
    const node = sectionRefById(key)?.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function sectionRefById(sectionId) {
    const key = str(sectionId);
    if (key === "paths") return pathsSectionRef;
    if (key === "time") return timeSectionRef;
    if (key === "robotmeta") return robotMetaSectionRef;
    if (key === "ai") return aiSectionRef;
    if (key === "notes") return notesSectionRef;
    if (key === "advanced") return advancedSectionRef;
    return { current: null };
  }

  function openAiFromCard() {
    openSectionShortcut("ai");
  }

  function focusNodeNotesFromCard() {
    openSectionShortcut("notes");
    window.setTimeout(() => {
      try {
        nodeEditorRef.current?.focus?.();
      } catch {
      }
    }, 0);
  }

  useEffect(() => {
    const rawKey = str(sidebarShortcutRequest);
    const keyMap = {
      selected: "paths",
      ai: "ai",
      notes: "notes",
      actors: "advanced",
      templates: "advanced",
      robotmeta: "robotmeta",
      time: "time",
      paths: "paths",
      advanced: "advanced",
    };
    const key = keyMap[rawKey] || "";
    if (!key) return;
    if (sidebarHidden) return;
    openSectionShortcut(key);
    onSidebarShortcutHandled?.();
  }, [sidebarShortcutRequest, sidebarHidden]);

  async function saveStartRole(nextRoleId) {
    if (typeof onSetStartRole !== "function") return;
    if (disabled || startRoleBusy) return;
    setStartRoleBusy(true);
    setStartRoleErr("");
    try {
      const result = await Promise.resolve(onSetStartRole(nextRoleId));
      if (result && result.ok === false) {
        setStartRoleErr(str(result.error || "Не удалось обновить стартового актора."));
      }
    } catch (error) {
      setStartRoleErr(str(error?.message || error || "Не удалось обновить стартового актора."));
    } finally {
      setStartRoleBusy(false);
    }
  }

  async function sendGlobalNote() {
    const t = str(text);
    if (!t) return;
    if (disabled || busy) return;

    setBusy(true);
    setErr("");
    try {
      const r = onAddNote?.(t);
      const rr = r && typeof r.then === "function" ? await r : r;

      if (rr && rr.ok === false) {
        setErr(String(rr.error || "API error"));
        return;
      }

      setText("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function sendElementNote() {
    const t = str(elementText);
    if (!selectedElementId || !t) return;
    if (disabled || elementBusy) return;
    setElementBusy(true);
    setElementErr("");
    try {
      const r = onAddElementNote?.(selectedElementId, t);
      const rr = r && typeof r.then === "function" ? await r : r;
      if (rr && rr.ok === false) {
        setElementErr(String(rr.error || "API error"));
        return;
      }
      setElementText("");
    } catch (e) {
      setElementErr(String(e?.message || e));
    } finally {
      setElementBusy(false);
    }
  }

  function openCoveragePanel(payload = {}) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(NOTES_COVERAGE_OPEN_EVENT, {
        detail: payload && typeof payload === "object" ? payload : {},
      }));
    }
  }

  async function requestAiQuestionsGenerate() {
    if (!aiGenerateUi.canGenerate) {
      setAiErr(str(aiGenerateUi.reasonText || "Генерация сейчас недоступна."));
      return;
    }
    setAiErr("");
    onRequestGenerateAiQuestions?.({
      sid,
      source: "notes_panel",
      selectedElementId,
    });
  }

  async function saveSelectedElementStepTime() {
    if (!selectedElementId) return;
    if (typeof onSetElementStepTime !== "function") return;
    if (disabled || stepTimeBusy) return;

    const raw = String(stepTimeInput ?? "").trim();
    let nextMinutes = null;
    let nextSeconds = null;
    if (raw) {
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
        setStepTimeErr(
          `Введите целое число ${normalizedStepTimeUnit === "sec" ? "секунд" : "минут"} (0 или больше).`,
        );
        return;
      }
      if (normalizedStepTimeUnit === "sec") {
        nextSeconds = Math.round(num);
        nextMinutes = Math.round(nextSeconds / 60);
      } else {
        nextMinutes = Math.round(num);
        nextSeconds = Math.round(nextMinutes * 60);
      }
    }
    const prevMinutes = selectedElementStepTime;
    const prevSeconds = selectedElementStepTimeSec;
    if (nextMinutes === prevMinutes && nextSeconds === prevSeconds) {
      setStepTimeErr("");
      return;
    }

    setStepTimeBusy(true);
    setStepTimeErr("");
    try {
      const result = await Promise.resolve(
        onSetElementStepTime(selectedElementId, nextMinutes, {
          unit: normalizedStepTimeUnit,
          stepTimeSeconds: nextSeconds,
        }),
      );
      if (result && result.ok === false) {
        setStepTimeErr(str(result.error || "Не удалось сохранить время шага."));
      }
    } catch (error) {
      setStepTimeErr(str(error?.message || error || "Не удалось сохранить время шага."));
    } finally {
      setStepTimeBusy(false);
    }
  }

  async function setSelectedFlowTier(nextTierRaw) {
    if (!selectedElementId || !isSelectedSequenceFlow) return;
    if (typeof setFlowTierHandler !== "function") return;
    if (disabled || flowHappyBusy) return;
    const nextTier = normalizeFlowTier(nextTierRaw);
    const sourceId = str(flowGatewayContext?.flowSourceById?.[selectedElementId]);
    const sourceMode = str(flowGatewayContext?.gatewayModeByNode?.[sourceId]);
    const siblingFlowIds = asArray(flowGatewayContext?.outgoingBySource?.[sourceId])
      .map((flowId) => str(flowId))
      .filter((flowId) => flowId && flowId !== selectedElementId);
    const conflictingTierFlowIds = (nextTier === "P0" || nextTier === "P1")
      && sourceMode === "xor"
      ? siblingFlowIds.filter((flowId) => normalizeFlowTier(bpmnFlowMetaById?.[flowId]?.tier) === nextTier)
      : [];

    if (conflictingTierFlowIds.length) {
      const tierTitle = nextTier === "P0" ? "P0 (идеальный путь)" : "P1 (восстановление)";
      const conflictLabel = conflictingTierFlowIds.join(", ");
      const shouldReplace = window.confirm(
        `Для XOR уже выбран ${tierTitle}: ${conflictLabel}.\nЗаменить на текущий flow (${selectedElementId})?`,
      );
      if (!shouldReplace) return;
      setFlowHappyInfo(`Замена ${nextTier}: ${conflictLabel} → ${selectedElementId}`);
    } else {
      setFlowHappyInfo("");
    }

    setFlowHappyBusy(true);
    setFlowHappyErr("");
    try {
      const result = await Promise.resolve(
        setFlowTierHandler(selectedElementId, nextTier || null, {
          source: "selected_node_section",
          xorConflictFlowIds: conflictingTierFlowIds,
          xorSourceId: sourceId,
          xorTier: nextTier,
        }),
      );
      if (result && result.ok === false) {
        const rawError = str(result.error || "Не удалось сохранить уровень пути.");
        if (/not found/i.test(rawError)) {
          setFlowHappyErr("Сохранение уровня пути недоступно: обновите backend и перезапустите сервер.");
        } else {
          setFlowHappyErr(rawError);
        }
      } else if (result?.normalizationNotice) {
        setFlowHappyInfo(str(result.normalizationNotice));
      } else if (conflictingTierFlowIds.length && nextTier) {
        setFlowHappyInfo(`Нормализация: ${nextTier} оставлен на ${selectedElementId}, конфликтующие значения сняты.`);
      }
    } catch (error) {
      setFlowHappyErr(str(error?.message || error || "Не удалось сохранить уровень пути."));
    } finally {
      setFlowHappyBusy(false);
    }
  }

  function toggleNodePathTag(tagRaw) {
    const tag = normalizeNodePathTag(tagRaw);
    if (!tag) return;
    setNodePathDraftPaths((prev) => {
      const list = asArray(prev).map((item) => normalizeNodePathTag(item)).filter(Boolean);
      const has = list.includes(tag);
      const next = has ? list.filter((item) => item !== tag) : [...list, tag];
      return next.sort((a, b) => NODE_PATH_TAG_ORDER.indexOf(a) - NODE_PATH_TAG_ORDER.indexOf(b));
    });
  }

  async function applySelectedNodePath() {
    if (!isSelectedPathNode || !selectedElementId) return;
    if (!setNodePathHandler || disabled || nodePathBusy) return;
    const normalizedPaths = asArray(nodePathDraftPaths).map((item) => normalizeNodePathTag(item)).filter(Boolean);
    if (!normalizedPaths.length) {
      setNodePathErr("Выберите хотя бы один path-tag (P0/P1/P2).");
      return;
    }
    const sequenceKey = normalizeSequenceKey(nodePathDraftSequence);
    setNodePathBusy(true);
    setNodePathErr("");
    setNodePathInfo("");
    try {
      const result = await Promise.resolve(
        setNodePathHandler([{
          node_id: selectedElementId,
          paths: normalizedPaths,
          sequence_key: sequenceKey || null,
          source: "manual",
        }], { source: "manual", from: "selected_node_paths_apply" }),
      );
      if (result && result.ok === false) {
        setNodePathErr(str(result.error || "Не удалось сохранить разметку узла."));
        return;
      }
      setNodePathInfo("Разметка узла сохранена.");
    } catch (error) {
      setNodePathErr(str(error?.message || error || "Не удалось сохранить разметку узла."));
    } finally {
      setNodePathBusy(false);
    }
  }

  async function resetSelectedNodePath() {
    if (!isSelectedPathNode || !selectedElementId) return;
    if (!setNodePathHandler || disabled || nodePathBusy) return;
    setNodePathBusy(true);
    setNodePathErr("");
    setNodePathInfo("");
    try {
      const result = await Promise.resolve(
        setNodePathHandler([{
          node_id: selectedElementId,
          paths: [],
          sequence_key: null,
          source: "manual",
        }], { source: "manual", from: "selected_node_paths_reset" }),
      );
      if (result && result.ok === false) {
        setNodePathErr(str(result.error || "Не удалось сбросить разметку узла."));
        return;
      }
      setNodePathDraftPaths([]);
      setNodePathDraftSequence("");
      setNodePathInfo("Разметка узла сброшена.");
    } catch (error) {
      setNodePathErr(str(error?.message || error || "Не удалось сбросить разметку узла."));
    } finally {
      setNodePathBusy(false);
    }
  }

  async function autoNodePathFromColors() {
    if (!setNodePathHandler || disabled || nodePathBusy) return;
    const flowMeta = bpmnFlowMetaById && typeof bpmnFlowMetaById === "object" ? bpmnFlowMetaById : {};
    const imported = buildNodePathUpdatesFromFlowMeta({
      flowMetaById: flowMeta,
      graphContext: nodePathGraphContext,
    });
    const updates = asArray(imported?.updates);
    if (!updates.length) {
      setNodePathErr("Не удалось импортировать node-path из цветов: нет размеченных sequenceFlow.");
      return;
    }
    setNodePathBusy(true);
    setNodePathErr("");
    setNodePathInfo("");
    try {
      const result = await Promise.resolve(
        setNodePathHandler(updates, { source: "color_auto", from: "selected_node_paths_auto_from_colors" }),
      );
      if (result && result.ok === false) {
        setNodePathErr(str(result.error || "Не удалось выполнить импорт из цветов."));
        return;
      }
      const componentsByTier = imported?.stats?.components_by_tier || {};
      const p0 = Number(componentsByTier?.P0 || 0);
      const p1 = Number(componentsByTier?.P1 || 0);
      const p2 = Number(componentsByTier?.P2 || 0);
      setNodePathInfo(`Импорт из цветов: ${updates.length} узлов (P0:${p0}, P1:${p1}, P2:${p2}).`);
    } catch (error) {
      setNodePathErr(str(error?.message || error || "Не удалось выполнить импорт из цветов."));
    } finally {
      setNodePathBusy(false);
    }
  }

  function updateRobotMetaDraft(nextRaw) {
    setRobotMetaDraft(normalizeRobotMetaV1(nextRaw));
    setRobotMetaErr("");
  }

  async function saveSelectedRobotMeta() {
    if (!selectedRobotMetaEditable || !selectedElementId) return;
    if (typeof onSetElementRobotMeta !== "function" || disabled || robotMetaBusy) return;
    const normalized = normalizeRobotMetaV1(robotMetaDraft);
    const prevCanonical = canonicalRobotMetaString(selectedRobotMetaEntry);
    const nextCanonical = canonicalRobotMetaString(normalized);
    if (prevCanonical === nextCanonical) {
      setRobotMetaErr("");
      setRobotMetaInfo("Без изменений.");
      return;
    }
    setRobotMetaBusy(true);
    setRobotMetaErr("");
    setRobotMetaInfo("");
    try {
      const result = await Promise.resolve(onSetElementRobotMeta(selectedElementId, normalized));
      if (result && result.ok === false) {
        setRobotMetaErr(str(result.error || "Не удалось сохранить Robot Meta."));
        return;
      }
      setRobotMetaInfo("Robot Meta сохранена.");
    } catch (error) {
      setRobotMetaErr(str(error?.message || error || "Не удалось сохранить Robot Meta."));
    } finally {
      setRobotMetaBusy(false);
    }
  }

  async function resetSelectedRobotMeta() {
    if (!selectedRobotMetaEditable || !selectedElementId) return;
    if (typeof onSetElementRobotMeta !== "function" || disabled || robotMetaBusy) return;
    setRobotMetaBusy(true);
    setRobotMetaErr("");
    setRobotMetaInfo("");
    try {
      const result = await Promise.resolve(onSetElementRobotMeta(selectedElementId, null, { remove: true }));
      if (result && result.ok === false) {
        setRobotMetaErr(str(result.error || "Не удалось удалить Robot Meta."));
        return;
      }
      setRobotMetaDraft(createDefaultRobotMetaV1());
      setRobotMetaInfo("Robot Meta удалена.");
    } catch (error) {
      setRobotMetaErr(str(error?.message || error || "Не удалось удалить Robot Meta."));
    } finally {
      setRobotMetaBusy(false);
    }
  }

  function selectBranchUntilBoundary() {
    if (!isSelectedPathNode || !selectedElementId) return;
    const outgoingByNodeId = nodePathGraphContext?.outgoingByNodeId || {};
    const nodeKindById = nodePathGraphContext?.nodeKindById || {};
    const rankByNodeId = nodePathGraphContext?.rankByNodeId || {};

    function sortedTargets(nodeId) {
      const list = asArray(outgoingByNodeId[nodeId]).map((id) => str(id)).filter(Boolean);
      return list.sort((a, b) => {
        const ar = Number(rankByNodeId[a]);
        const br = Number(rankByNodeId[b]);
        const av = Number.isFinite(ar) ? ar : Number.MAX_SAFE_INTEGER;
        const bv = Number.isFinite(br) ? br : Number.MAX_SAFE_INTEGER;
        if (av !== bv) return av - bv;
        return a.localeCompare(b, "ru");
      });
    }

    const picked = new Set([selectedElementId]);
    const visitedGlobal = new Set();
    const seeds = NODE_PATH_GATEWAY_KINDS.has(str(nodeKindById[selectedElementId]).toLowerCase())
      ? sortedTargets(selectedElementId)
      : [selectedElementId];

    seeds.forEach((seedNodeId) => {
      let current = str(seedNodeId);
      let hop = 0;
      const visitedLocal = new Set();
      while (current && hop < 300) {
        hop += 1;
        if (visitedLocal.has(current) || visitedGlobal.has(current)) break;
        visitedLocal.add(current);
        visitedGlobal.add(current);
        picked.add(current);
        const kind = str(nodeKindById[current]).toLowerCase();
        if (current !== seedNodeId && (NODE_PATH_GATEWAY_KINDS.has(kind) || kind === "endevent")) break;
        const targets = sortedTargets(current);
        if (!targets.length) break;
        current = str(targets[0]);
      }
    });

    const nextBulkIds = Array.from(picked).filter(Boolean);
    setBulkNodeIds(nextBulkIds);
    setNodePathInfo(`Выделено узлов в ветке: ${nextBulkIds.length}.`);
    setNodePathErr("");
  }

  async function applyP1ForSelectedNodes() {
    if (!setNodePathHandler || disabled || nodePathBusy) return;
    const selectedIds = asArray(
      bulkNodeIds.length ? bulkNodeIds : selectedElementSelectionIds,
    )
      .map((id) => str(id))
      .filter((id) => !!str(nodePathGraphContext?.nodeKindById?.[id]));
    if (!selectedIds.length) {
      setNodePathErr("Нет выбранных BPMN-узлов для применения P1.");
      return;
    }
    const updates = selectedIds.map((nodeId) => {
      const existing = normalizeNodePathEntry(bpmnNodePathMetaById[nodeId]) || { paths: [] };
      const merged = Array.from(new Set([...asArray(existing.paths), "P1"])).sort((a, b) => NODE_PATH_TAG_ORDER.indexOf(a) - NODE_PATH_TAG_ORDER.indexOf(b));
      const nextSequence = normalizeSequenceKey(existing.sequence_key || "") || "mitigated_1";
      return {
        node_id: nodeId,
        paths: merged,
        sequence_key: nextSequence,
        source: "manual",
      };
    });
    setNodePathBusy(true);
    setNodePathErr("");
    setNodePathInfo("");
    try {
      const result = await Promise.resolve(
        setNodePathHandler(updates, { source: "manual", from: "selected_node_paths_apply_p1_bulk" }),
      );
      if (result && result.ok === false) {
        setNodePathErr(str(result.error || "Не удалось применить P1 для выбранных узлов."));
        return;
      }
      setNodePathInfo(`P1 применён для ${selectedIds.length} узлов.`);
    } catch (error) {
      setNodePathErr(str(error?.message || error || "Не удалось применить P1 для выбранных узлов."));
    } finally {
      setNodePathBusy(false);
    }
  }

  async function insertTemplateNote() {
    if (!selectedElementId) return;
    if (disabled || elementBusy || busy) return;
    setTemplateErr("");
    try {
      const templateText = formatTemplateNoteText(selectedTemplate, {
        elementName: selectedElementName,
      });
      const r = onAddElementNote?.(selectedElementId, templateText);
      const rr = r && typeof r.then === "function" ? await r : r;
      if (rr && rr.ok === false) {
        setTemplateErr(String(rr.error || "Не удалось вставить шаблон."));
        return;
      }
      setBatchResult(`Шаблон «${selectedTemplate?.title || "Template"}» добавлен.`);
    } catch (error) {
      setTemplateErr(String(error?.message || error || "Не удалось вставить шаблон."));
    }
  }

  async function saveElementAiQuestion(question, patch = {}) {
    const qid = str(question?.qid);
    if (!selectedElementId || !qid) return;
    if (typeof onUpdateElementAiQuestion !== "function") return;
    if (disabled || aiBusyQid) return;

    const status = Object.prototype.hasOwnProperty.call(patch, "status")
      ? normalizeAiStatus(patch?.status)
      : normalizeAiStatus(question?.status);
    const comment = Object.prototype.hasOwnProperty.call(patch, "comment")
      ? str(patch?.comment)
      : str(aiCommentDraft[qid] ?? question?.comment);

    setAiBusyQid(qid);
    setAiErr("");
    try {
      const r = onUpdateElementAiQuestion?.(selectedElementId, qid, { status, comment });
      const rr = r && typeof r.then === "function" ? await r : r;
      if (rr && rr.ok === false) {
        setAiErr(String(rr.error || "Не удалось сохранить AI-комментарий."));
        return;
      }
      setAiSavedQid(qid);
      setTimeout(() => {
        setAiSavedQid((prev) => (prev === qid ? "" : prev));
      }, 1200);
    } catch (e) {
      setAiErr(String(e?.message || e));
    } finally {
      setAiBusyQid("");
    }
  }

  async function applyBatchOps() {
    if (disabled || batchBusy) return;
    if (!sid) {
      setBatchErr("Сессия не выбрана.");
      return;
    }
    const ops = asArray(batchPlan?.ops);
    if (!ops.length) {
      setBatchErr("Нет изменений для применения.");
      return;
    }
    if (asArray(batchPlan?.errors).length) {
      setBatchErr(asArray(batchPlan.errors).slice(0, 2).join(" "));
      return;
    }

    setBatchBusy(true);
    setBatchErr("");
    setBatchResult("");
    try {
      if (shouldLogAiOpsTrace()) {
        // eslint-disable-next-line no-console
        console.debug(`[AI_OPS] batch_apply sid=${sid} ops=${ops.length}`);
      }
      const result = await dispatchBatchApply({
        sid,
        source: "notes_batch",
        commandText: str(batchText),
        ops,
      });
      if (!result?.ok) {
        setBatchErr(String(result?.error || "batch_apply_failed"));
        return;
      }
      const applied = Number(result?.applied || 0);
      const failed = Number(result?.failed || 0);
      setBatchResult(`Сделано: ${applied} опер.${failed > 0 ? ` Ошибок: ${failed}.` : ""}`);
    } catch (error) {
      setBatchErr(String(error?.message || error || "batch_apply_failed"));
    } finally {
      setBatchBusy(false);
    }
  }

  const sectionShortcuts = [
    {
      id: "paths",
      title: "Пути",
      count: isElementMode ? 1 : 0,
      active: !!sectionsOpen.paths || String(activeSectionId || "") === "paths",
      muted: !isElementMode,
    },
    {
      id: "ai",
      title: "AI-вопросы",
      count: selectedElementAiQuestions.length,
      active: !!sectionsOpen.ai || String(activeSectionId || "") === "ai",
      muted: !isElementMode,
    },
    {
      id: "notes",
      title: "Заметки",
      count: selectedElementNotes.length,
      active: !!sectionsOpen.notes || String(activeSectionId || "") === "notes",
      muted: !isElementMode,
    },
    {
      id: "advanced",
      title: "Advanced",
      count: Number(roles.length || 0) + (!sessionTldr?.empty ? 1 : 0),
      active: !!sectionsOpen.advanced || String(activeSectionId || "") === "advanced",
      muted: false,
    },
  ];

  return (
    <div className="leftPanel h-full min-h-0 p-2">
      <SidebarShell
        processTitle={processTitle}
        projectId={projectId}
        projectTitle={projectTitle}
        sessionId={sid}
        sessionTitle={sessionTitle || str(draft?.title)}
        selectedNodeId={selectedElementId}
        aiBadgeCount={selectedElementAiQuestions.length}
        notesBadgeCount={selectedElementNotes.length}
        actorsBadgeCount={roles.length}
        onProjectBreadcrumbClick={onProjectBreadcrumbClick}
        onSessionBreadcrumbClick={onSessionBreadcrumbClick}
        onProcessBreadcrumbClick={onGoToDiagram}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
        tierLabel={selectedElementTierLabel}
        collapsed={!!sidebarCompact}
        onToggleCollapse={() => onToggleSidebarCompact?.(!sidebarCompact, "sidebar_header")}
        onCloseSidebar={() => onToggleSidebarHidden?.()}
        sections={sectionShortcuts}
        showQuickNav={false}
        onSectionShortcut={openSectionShortcut}
        stickyContent={null}
        bottomBar={null}
      >
        <div id="element-notes-section" ref={elementNotesSectionRef} className="sidebarRedesignStack">
          <SelectedElementCard
            selectedElementId={isElementMode ? selectedElementId : ""}
            selectedElementName={isElementMode ? selectedElementName : ""}
            selectedElementType={isElementMode ? selectedElementType : ""}
            selectedElementLaneName={isElementMode ? selectedElementLaneName : ""}
            noteCount={isElementMode ? selectedElementNotes.length : 0}
            aiCount={isElementMode ? selectedElementAiQuestions.length : 0}
            incomingCount={isElementMode ? Number(selectedElementFlowCounts.incoming || 0) : 0}
            outgoingCount={isElementMode ? Number(selectedElementFlowCounts.outgoing || 0) : 0}
            robotMetaStatus={selectedRobotMetaStatus}
            robotMetaMissing={selectedRobotMetaMissing}
            open={selectedCardOpen}
            onToggle={() => setSelectedCardOpen((prev) => !prev)}
          />

          <SidebarPrimaryActions
            onOpenDiagram={onGoToDiagram}
            onOpenAi={openAiFromCard}
            onOpenNotes={focusNodeNotesFromCard}
          />

          <section className="sidebarCardSurface sidebarSettingsSurface">
            <div className="sidebarSectionCaption">Настройки элемента</div>
            <div className="sidebarAccordionStack mt-2">
              <div ref={pathsSectionRef}>
                <SidebarAccordion
                sectionKey="paths"
                title="Пути и последовательность"
                subtitle={isElementMode ? selectedElementId : "Выберите узел"}
                open={!!sectionsOpen.paths}
                onToggle={toggleSection}
              >
                <PathsSection
                  selectedElementId={isElementMode ? selectedElementId : ""}
                  nodePathEditable={isElementMode ? isSelectedPathNode : false}
                  nodePathPaths={isElementMode ? nodePathDraftPaths : []}
                  nodePathSequenceKey={isElementMode ? nodePathDraftSequence : ""}
                  nodePathBusy={isElementMode ? nodePathBusy : false}
                  nodePathErr={isElementMode ? nodePathErr : ""}
                  nodePathInfo={isElementMode ? nodePathInfo : ""}
                  selectedNodeCount={isElementMode ? selectedElementSelectionIds.length : 0}
                  bulkSelectionCount={isElementMode ? bulkNodeIds.length : 0}
                  onToggleNodePathTag={toggleNodePathTag}
                  onNodePathSequenceChange={setNodePathDraftSequence}
                  onApplyNodePath={applySelectedNodePath}
                  onResetNodePath={resetSelectedNodePath}
                  onAutoNodePathFromColors={autoNodePathFromColors}
                  onSelectBranchUntilBoundary={selectBranchUntilBoundary}
                  onApplyP1ToSelected={applyP1ForSelectedNodes}
                  showLegacyPathImportHint={isElementMode ? showLegacyPathImportHint : false}
                  flowPathTier={isElementMode ? selectedFlowTier : ""}
                  onSetFlowPathTier={setSelectedFlowTier}
                  flowHappyBusy={isElementMode ? flowHappyBusy : false}
                  flowHappyErr={isElementMode ? flowHappyErr : ""}
                  flowHappyInfo={isElementMode ? flowHappyInfo : ""}
                  flowHappyEditable={isElementMode ? isSelectedSequenceFlow : false}
                  disabled={disabled}
                />
              </SidebarAccordion>
              </div>

              <div ref={timeSectionRef}>
                <SidebarAccordion
                sectionKey="time"
                title="Время шага"
                open={!!sectionsOpen.time}
                onToggle={toggleSection}
              >
                <TimeSection
                  selectedElementId={isElementMode ? selectedElementId : ""}
                  stepTimeInput={isElementMode ? stepTimeInput : ""}
                  onStepTimeInputChange={setStepTimeInput}
                  onSaveStepTime={saveSelectedElementStepTime}
                  stepTimeBusy={isElementMode ? stepTimeBusy : false}
                  stepTimeErr={isElementMode ? stepTimeErr : ""}
                  stepTimeEditable={isElementMode ? !!selectedElementNode : false}
                  stepTimeUnit={normalizedStepTimeUnit}
                  onStepTimeUnitChange={onStepTimeUnitChange}
                  disabled={disabled}
                />
              </SidebarAccordion>
              </div>

              <div ref={robotMetaSectionRef}>
                <SidebarAccordion
                sectionKey="robotmeta"
                title="Robot Meta"
                badge={selectedRobotMetaEditable ? "v1" : ""}
                open={!!sectionsOpen.robotmeta}
                onToggle={toggleSection}
              >
                <RobotMetaSection
                  selectedElementId={isElementMode ? selectedElementId : ""}
                  robotMetaEditable={isElementMode ? selectedRobotMetaEditable : false}
                  robotMetaDraft={isElementMode ? robotMetaDraft : createDefaultRobotMetaV1()}
                  robotMetaBusy={isElementMode ? robotMetaBusy : false}
                  robotMetaErr={isElementMode ? robotMetaErr : ""}
                  robotMetaInfo={isElementMode ? robotMetaInfo : ""}
                  onRobotMetaDraftChange={updateRobotMetaDraft}
                  onSaveRobotMeta={saveSelectedRobotMeta}
                  onResetRobotMeta={resetSelectedRobotMeta}
                  disabled={disabled}
                />
              </SidebarAccordion>
              </div>

              <div ref={notesSectionRef}>
                <SidebarAccordion
                sectionKey="notes"
                title="Notes"
                badge={isElementMode ? String(selectedElementNotes.length) : ""}
                open={!!sectionsOpen.notes}
                onToggle={toggleSection}
              >
                <NotesSection
                  selectedElementId={isElementMode ? selectedElementId : ""}
                  selectedElementName={isElementMode ? selectedElementName : ""}
                  selectedElementNotes={isElementMode ? selectedElementNotes : []}
                  noteCount={isElementMode ? selectedElementNotes.length : 0}
                  elementText={isElementMode ? elementText : ""}
                  onElementTextChange={setElementText}
                  onSendElementNote={sendElementNote}
                  elementBusy={isElementMode ? elementBusy : false}
                  elementErr={isElementMode ? elementErr : ""}
                  onNodeEditorRef={(node) => {
                    nodeEditorRef.current = node;
                  }}
                  disabled={disabled}
                />
              </SidebarAccordion>
              </div>

              <div ref={aiSectionRef}>
                <SidebarAccordion
                sectionKey="ai"
                title="AI Questions"
                badge={isElementMode ? String(selectedElementAiQuestions.length) : ""}
                open={!!sectionsOpen.ai}
                onToggle={toggleSection}
              >
                <AiSection
                  selectedElementId={isElementMode ? selectedElementId : ""}
                  selectedElementAiQuestions={isElementMode ? selectedElementAiQuestions : []}
                  onGenerateAiQuestions={requestAiQuestionsGenerate}
                  aiGenerateAvailable={aiGenerateUi.canGenerate}
                  aiGenerateHint={!aiGenerateUi.canGenerate ? aiGenerateUi.reasonText : ""}
                  aiGenerateReasonCode={aiGenerateUi.reasonCode}
                  onGenerateAiCta={aiGenerateUi.cta?.type === "diagram" ? onGoToDiagram : undefined}
                  aiGenerateCtaLabel={aiGenerateUi.cta?.label || ""}
                  aiBusyQid={aiBusyQid}
                  aiSavedQid={aiSavedQid}
                  aiErr={aiErr}
                  aiCommentDraft={aiCommentDraft}
                  onAiCommentDraftChange={(qid, value) => {
                    setAiCommentDraft((prev) => ({ ...prev, [qid]: String(value || "") }));
                  }}
                  onSaveElementAiQuestion={saveElementAiQuestion}
                  disabled={!isElementMode || disabled}
                />
              </SidebarAccordion>
              </div>

              <div ref={advancedSectionRef}>
                <SidebarAccordion
                  sectionKey="advanced"
                  title="Advanced / Debug"
                  badge={String(roles.length || 0)}
                  open={!!sectionsOpen.advanced}
                  onToggle={toggleSection}
                >
                  <details className="sidebarAdvanced" data-testid="sidebar-advanced-templates">
                    <summary className="sidebarAdvancedSummary">Templates / TL;DR</summary>
                    <div className="mt-2">
                      <TemplatesAndTldrSection
                        contentOnly
                        open={true}
                        onToggle={undefined}
                        selectedElementId={isElementMode ? selectedElementId : ""}
                        selectedTemplate={selectedTemplate}
                        tldr={sessionTldr}
                        disabled={!isElementMode || disabled}
                        elementBusy={isElementMode ? elementBusy : false}
                        onInsertTemplate={insertTemplateNote}
                        onRefreshTldr={undefined}
                        templateErr={isElementMode ? templateErr : ""}
                      />
                    </div>
                  </details>
                  <details className="sidebarAdvanced mt-2" data-testid="sidebar-advanced-actors">
                    <summary className="sidebarAdvancedSummary">Actors</summary>
                    <div className="mt-2">
                      <ActorsSection
                        contentOnly
                        open={true}
                        onToggle={undefined}
                        roles={roles}
                        laneCounts={roleElementCounts}
                        sourceLabel={rolesSourceLabel}
                        startRoleValue={startRoleValue}
                        onStartRoleChange={saveStartRole}
                        startRoleBusy={startRoleBusy}
                        startRoleErr={startRoleErr}
                        disabled={disabled}
                      />
                    </div>
                  </details>
                </SidebarAccordion>
              </div>
            </div>
          </section>
        </div>
      </SidebarShell>
    </div>
  );
}
