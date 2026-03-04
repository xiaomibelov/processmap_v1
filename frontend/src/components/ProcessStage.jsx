import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import DocStage from "./process/DocStage";
import InterviewStage from "./process/InterviewStage";
import WorkspaceDashboard from "./workspace/WorkspaceDashboard";
import Modal from "../shared/ui/Modal";
import { useAuth } from "../features/auth/AuthProvider";
import { apiPatchSession, apiRecompute } from "../lib/api/sessionApi";
import { apiGetBpmnXml } from "../lib/api/bpmnApi";
import { apiAiQuestions } from "../lib/api/interviewApi";
import { createAiInputHash, executeAi } from "../features/ai/aiExecutor";
import {
  listBpmnSnapshots,
  clearBpmnSnapshots,
  saveBpmnSnapshot,
  updateBpmnSnapshotMeta,
  shortSnapshotHash,
} from "../features/process/bpmn/snapshots/bpmnSnapshots";
import { buildSemanticBpmnDiff } from "../features/process/bpmn/diff/semanticDiff";
import { parseAndProjectBpmnToInterview } from "../features/process/hooks/useInterviewProjection";
import useBpmnSync from "../features/process/hooks/useBpmnSync";
import useProcessOrchestrator from "../features/process/hooks/useProcessOrchestrator";
import useProcessWorkbenchController from "../features/process/hooks/useProcessWorkbenchController";
import { normalizeElementNotesMap } from "../features/notes/elementNotes";
import {
  buildCoverageMatrix,
  normalizeAiQuestionsByElementMap,
} from "../features/notes/knowledgeTools";
import { deriveActorsFromBpmn, sameDerivedActors } from "../features/process/lib/deriveActorsFromBpmn";
import {
  asArray,
  asObject,
  interviewHasContent,
  isLikelySeedBpmnXml,
  mergeInterviewData,
  enrichInterviewWithNodeBindings,
  sanitizeGraphNodes,
  toNodeId,
  mergeNodesById,
  mergeEdgesByKey,
  buildBottleneckHints,
  readFileText,
  parseBpmnToSessionGraph,
  buildClarificationHints,
} from "../features/process/lib/processStageDomain";
import { parseCommandToOps } from "../features/process/bpmn/ops/parseOps";
import {
  buildLintAutoFixPreview,
  LINT_PROFILES,
  runBpmnLint,
} from "../features/process/bpmn/lint/bpmnLint";
import { computeDodSnapshotFromDraft } from "../features/process/dod/computeDodSnapshot";
import {
  buildRobotMetaStatusByElementId,
  getRobotMetaStatus,
  normalizeRobotMetaMap,
} from "../features/process/robotmeta/robotMeta";
import {
  appendExecutionPlanVersionEntry,
  buildExecutionPlan,
  normalizeExecutionPlanVersionList,
} from "../features/process/robotmeta/executionPlan";
import {
  buildRouteDecisionByNodeId,
  normalizePlaybackScenarioSpec,
} from "../features/process/playback/playbackEngine";
import {
  applyHybridModeTransition,
  applyHybridVisibilityTransition,
  getHybridUiStorageKey,
  loadHybridUiPrefs,
  normalizeHybridLayerMap,
  normalizeHybridUiPrefs,
  saveHybridUiPrefs,
} from "../features/process/hybrid/hybridLayerUi";
import {
  docToComparableJson,
  migrateHybridV1ToV2,
  normalizeHybridV2Doc,
} from "../features/process/hybrid/hybridLayerV2";
import {
  matrixToDiagram,
  matrixToScreen,
} from "../features/process/stage/utils/hybridCoords";
import LayersPopover from "../features/process/stage/components/LayersPopover";
import HybridOverlayRenderer from "../features/process/stage/renderers/HybridOverlayRenderer";
import useSessionMetaPersist from "../features/process/stage/controllers/useSessionMetaPersist";
import useBpmnCanvasController from "../features/process/stage/hooks/useBpmnCanvasController";
import useDiagramOverlayTransform from "../features/process/stage/hooks/useDiagramOverlayTransform";
import useHybridLayerViewportController from "../features/process/stage/hooks/useHybridLayerViewportController";
import usePlaybackController from "../features/process/stage/hooks/usePlaybackController";
import useDiagramActionPopovers from "../features/process/stage/hooks/useDiagramActionPopovers";
import { deleteHybridIds } from "../features/process/hybrid/actions/hybridDelete";
import useHybridSelectionController from "../features/process/hybrid/tools/useHybridSelectionController";
import useHybridToolsController from "../features/process/hybrid/tools/useHybridToolsController";
import HybridToolsPalette from "../features/process/hybrid/tools/HybridToolsPalette";
import HybridContextMenu from "../features/process/hybrid/tools/HybridContextMenu";
import DrawioEditorModal from "../features/process/drawio/DrawioEditorModal";
import DrawioOverlayRenderer from "../features/process/drawio/DrawioOverlayRenderer";
import {
  isDrawioXml,
  mergeDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
} from "../features/process/drawio/drawioMeta";
import {
  applyHybridPaletteModeIntent,
  applyHybridPaletteToolIntent,
} from "../features/process/hybrid/tools/hybridToolState";
import useTemplatesStore from "../features/templates/model/useTemplatesStore";
import TemplatesPicker from "../features/templates/ui/TemplatesPicker";
import CreateTemplateModal from "../features/templates/ui/CreateTemplateModal";
import { applyTemplateToDiagram } from "../features/templates/services/applyTemplateToDiagram";
import { buildManualPathReportSteps } from "./process/interview/services/pathReport";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return asArray(value);
}

function normalizePathTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function normalizePathSequenceKey(raw) {
  return toText(raw);
}

function buildPlaybackScenarioKey(tierRaw, sequenceKeyRaw) {
  const tier = normalizePathTier(tierRaw);
  const sequenceKey = normalizePathSequenceKey(sequenceKeyRaw);
  if (!tier) return "active";
  if (!sequenceKey) return tier;
  return `${tier}::${sequenceKey}`;
}

function parsePlaybackScenarioKey(keyRaw, fallbackRaw = {}) {
  const key = toText(keyRaw);
  const fallback = asObject(fallbackRaw);
  if (!key || key === "active") {
    return normalizePlaybackScenarioSpec({
      tier: normalizePathTier(fallback?.tier),
      sequenceKey: normalizePathSequenceKey(fallback?.sequenceKey),
      label: toText(fallback?.label) || "Active scenario",
    });
  }
  const [tierRaw, sequenceRaw] = key.split("::");
  return normalizePlaybackScenarioSpec({
    tier: normalizePathTier(tierRaw),
    sequenceKey: normalizePathSequenceKey(sequenceRaw),
    label: key,
  });
}

function playbackEventTitle(eventRaw) {
  const event = asObject(eventRaw);
  const type = toText(event?.type);
  if (type === "take_flow") return `Flow: ${toText(event?.flowId) || "—"}`;
  if (type === "enter_node") return `${toText(event?.nodeName || event?.nodeId) || "Node"}`;
  if (type === "wait_for_gateway_decision") return `Gateway: ${formatPlaybackGatewayTitle(event)}`;
  if (type === "parallel_batch_begin") return `Parallel x${Number(event?.count || asArray(event?.flowIds).length || 0)}`;
  if (type === "enter_subprocess") return `Enter ${toText(event?.nodeName || event?.subprocessId) || "subprocess"}`;
  if (type === "exit_subprocess") return `Exit ${toText(event?.nodeName || event?.subprocessId) || "subprocess"}`;
  if (type === "stop") return `Stop: ${toText(event?.reason) || "done"}`;
  return toText(event?.nodeName || event?.nodeId || type || "—");
}

function shouldDebugPlayback() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.DEBUG_PLAYBACK ?? window.localStorage?.getItem("DEBUG_PLAYBACK") ?? "";
    return String(raw || "").trim() === "1";
  } catch {
    return String(window.DEBUG_PLAYBACK || "").trim() === "1";
  }
}

function logPlaybackDebug(stage, payload = {}) {
  if (!shouldDebugPlayback()) return;
  // eslint-disable-next-line no-console
  console.debug(`[PLAYBACK_DEBUG] ${String(stage || "-")}`, payload);
}

function shortPlaybackId(rawId) {
  const id = toText(rawId);
  if (!id) return "";
  if (id.length <= 16) return id;
  return id.slice(-10);
}

function formatPlaybackGatewayTitle(eventRaw) {
  const event = asObject(eventRaw);
  const gatewayName = toText(event?.gatewayName);
  const gatewayId = shortPlaybackId(event?.gatewayId || event?.nodeId);
  if (gatewayName && gatewayId) return `${gatewayName} (${gatewayId})`;
  if (gatewayName) return gatewayName;
  if (gatewayId) return `Gateway (${gatewayId})`;
  return "Gateway";
}

function playbackGatewayOptionLabel(optionRaw, index = 0) {
  const option = asObject(optionRaw);
  const label = toText(option?.label || option?.condition);
  if (label) return label;
  return `Выбор ${Number(index || 0) + 1}`;
}

function normalizeNodePathMetaMap(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((rawNodeId) => {
    const nodeId = toNodeId(rawNodeId);
    if (!nodeId) return;
    const entry = asObject(source[rawNodeId]);
    const paths = asArray(entry?.paths)
      .map((tier) => normalizePathTier(tier))
      .filter(Boolean);
    if (!paths.length) return;
    out[nodeId] = {
      nodeId,
      paths: Array.from(new Set(paths)),
      sequenceKey: normalizePathSequenceKey(entry?.sequence_key || entry?.sequenceKey),
      source: toText(entry?.source).toLowerCase(),
    };
  });
  return out;
}

function normalizeFlowTierMetaMap(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((rawFlowId) => {
    const flowId = toText(rawFlowId);
    if (!flowId) return;
    const row = asObject(source[rawFlowId]);
    const tier = normalizePathTier(row?.tier || row?.path || (row?.happy ? "P0" : ""));
    if (!tier) return;
    out[flowId] = {
      flowId,
      tier,
      sequenceKey: normalizePathSequenceKey(row?.sequence_key || row?.sequenceKey),
      source: toText(row?.source).toLowerCase(),
    };
  });
  return out;
}

function dedupeDiagramHints(itemsRaw) {
  const out = [];
  const seen = new Set();
  asArray(itemsRaw).forEach((hintRaw) => {
    const hint = asObject(hintRaw);
    const markerClass = toText(hint?.markerClass);
    const elementIds = asArray(hint?.elementIds).map((id) => toText(id)).filter(Boolean);
    const nodeId = toText(hint?.nodeId);
    const key = `${markerClass}::${nodeId}::${elementIds.join("|")}::${toText(hint?.title)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(hint);
  });
  return out;
}

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function shortErr(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

async function copyText(textRaw) {
  const text = String(textRaw || "");
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  return false;
}

function shortHash(value) {
  const text = toText(value);
  if (!text) return "—";
  return text.slice(0, 10);
}

function cssEscapeAttr(value) {
  const text = toText(value);
  if (!text) return "";
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(text);
  return text.replace(/["\\]/g, "\\$&");
}

function clampNumber(valueRaw, minRaw, maxRaw) {
  const value = Number(valueRaw || 0);
  const min = Number(minRaw || 0);
  const max = Number(maxRaw || 0);
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return value;
  return Math.min(max, Math.max(min, value));
}

function isEditableTarget(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  const tag = toText(el.tagName).toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return toText(el.getAttribute("contenteditable")).toLowerCase() === "true";
}

function serializeHybridLayerMap(rawMap) {
  const map = normalizeHybridLayerMap(rawMap);
  const sorted = {};
  Object.keys(map).sort().forEach((elementId) => {
    const row = asObject(map[elementId]);
    sorted[elementId] = {
      dx: Number(row.dx || 0),
      dy: Number(row.dy || 0),
    };
  });
  return JSON.stringify(sorted);
}

function downloadTextFile(filenameRaw, textRaw, mimeRaw = "text/plain;charset=utf-8") {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const filename = toText(filenameRaw) || "download.txt";
  try {
    const blob = new Blob([String(textRaw || "")], { type: String(mimeRaw || "text/plain;charset=utf-8") });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function downloadJsonFile(filenameRaw, payloadRaw) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const filename = toText(filenameRaw) || "execution_plan.json";
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function parseSequenceFlowsFromXml(xmlText) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") return [];
  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return [];
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return [];
  const out = [];
  Array.from(doc.getElementsByTagName("*")).forEach((el) => {
    const local = String(el?.localName || "").toLowerCase();
    if (local !== "sequenceflow") return;
    const id = toNodeId(el.getAttribute("id"));
    const sourceId = toNodeId(el.getAttribute("sourceRef"));
    const targetId = toNodeId(el.getAttribute("targetRef"));
    if (!id || !sourceId || !targetId) return;
    out.push({
      id,
      sourceId,
      targetId,
      name: String(el.getAttribute("name") || "").trim(),
    });
  });
  return out;
}

function toSec(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return Math.max(0, Number(fallback || 0));
  return Math.round(num);
}

function readStepBpmnRef(stepRaw) {
  const step = asObject(stepRaw);
  return toText(
    step?.bpmn_ref
    || step?.bpmnRef
    || step?.node_bind_id
    || step?.nodeBindId
    || step?.node_id
    || step?.nodeId
    || step?.id,
  );
}

function buildStepTitleLaneKey(stepRaw) {
  const step = asObject(stepRaw);
  const title = toText(step?.title || step?.action || step?.name).toLowerCase();
  const lane = toText(
    step?.lane_id
    || step?.laneId
    || step?.lane_name
    || step?.laneName
    || step?.lane_key
    || step?.role
    || step?.area,
  ).toLowerCase();
  if (!title) return "";
  return `${title}::${lane}`;
}

function buildRouteStepsFromInterviewPathSpec(interviewRaw) {
  const interview = asObject(interviewRaw);
  const interviewSteps = asArray(interview?.steps);
  const pathSpec = asObject(interview?.path_spec || interview?.pathSpec);
  const pathSteps = asArray(pathSpec?.steps)
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));

  const byStepId = {};
  const byTitleLane = {};
  const byTitleLaneDup = new Set();
  interviewSteps.forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const stepId = toText(step?.id);
    if (stepId && !byStepId[stepId]) byStepId[stepId] = step;
    const titleLaneKey = buildStepTitleLaneKey(step);
    if (titleLaneKey) {
      if (byTitleLane[titleLaneKey]) {
        byTitleLaneDup.add(titleLaneKey);
      } else {
        byTitleLane[titleLaneKey] = step;
      }
    }
  });

  if (!pathSteps.length) {
    return asArray(buildManualPathReportSteps(interview, {}))
      .map((stepRaw, idx) => ({
        ...asObject(stepRaw),
        order_index: idx + 1,
      }));
  }

  return pathSteps.map((entryRaw, idx) => {
    const entry = asObject(entryRaw);
    const stepId = toText(entry?.step_id || entry?.stepId || entry?.id);
    const titleLaneKey = buildStepTitleLaneKey(entry);
    const linked = asObject(
      byStepId[stepId]
      || (titleLaneKey && !byTitleLaneDup.has(titleLaneKey) ? byTitleLane[titleLaneKey] : null)
      || {},
    );
    const bpmnRef = readStepBpmnRef(entry) || readStepBpmnRef(linked);
    const workSec = toSec(
      entry?.work_duration_sec
      ?? entry?.workDurationSec
      ?? linked?.work_duration_sec
      ?? linked?.step_time_sec
      ?? linked?.duration_sec
      ?? linked?.stepTimeSec,
      0,
    );
    const waitSec = toSec(
      entry?.wait_duration_sec
      ?? entry?.waitDurationSec
      ?? linked?.wait_duration_sec
      ?? linked?.waitDurationSec,
      0,
    );
    return {
      order_index: idx + 1,
      step_id: stepId || toText(linked?.id) || null,
      title: toText(entry?.title || linked?.action || linked?.title || bpmnRef) || `Step ${idx + 1}`,
      lane_id: toText(entry?.lane_id || entry?.laneId || linked?.lane_id || linked?.laneId || linked?.lane_key) || null,
      lane_name: toText(entry?.lane_name || entry?.laneName || linked?.lane_name || linked?.laneName || linked?.role || linked?.area) || null,
      bpmn_ref: bpmnRef || null,
      work_duration_sec: workSec,
      wait_duration_sec: waitSec,
      notes: toText(linked?.notes || linked?.note || linked?.comment || linked?.description) || null,
      decision: asObject(entry?.decision || linked?.decision),
      is_decision: !!asObject(entry?.decision || linked?.decision)?.selected_flow_id,
    };
  });
}

function normalizeDebugRouteSteps(routeStepsRaw) {
  return asArray(routeStepsRaw)
    .map((stepRaw, idx) => {
      const step = asObject(stepRaw);
      const bpmnRef = readStepBpmnRef(step);
      if (!bpmnRef) return null;
      return {
        order_index: idx + 1,
        step_id: toText(step?.step_id || step?.stepId || step?.id) || null,
        title: toText(step?.title || step?.name || step?.action || bpmnRef) || bpmnRef,
        lane_id: toText(step?.lane_id || step?.laneId) || null,
        lane_name: toText(step?.lane_name || step?.laneName || step?.lane || step?.role || step?.area) || null,
        bpmn_ref: bpmnRef,
        work_duration_sec: toSec(step?.work_duration_sec, 0),
        wait_duration_sec: toSec(step?.wait_duration_sec, 0),
        notes: toText(step?.notes || step?.note || step?.comment || step?.description) || null,
        decision: asObject(step?.decision),
        is_decision: !!asObject(step?.decision)?.selected_flow_id,
      };
    })
    .filter(Boolean);
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

function snapshotScopeKey(projectId, sessionId) {
  const pid = String(projectId || "").trim() || "no_project";
  const sid = String(sessionId || "").trim();
  if (!sid) return "";
  return `snapshots:${pid}:${sid}`;
}

function readPersistMark(sid) {
  if (typeof window === "undefined") return null;
  const mark = window.__FPC_LAST_PERSIST_OK__;
  if (!mark || String(mark?.sid || "") !== String(sid || "")) return null;
  return mark;
}

const COMMAND_MODE_KEY = "fpc_ai_ops_mode";
const QUALITY_MODE_KEY = "fpc_quality_mode";
const QUALITY_PROFILE_KEY = "fpc_quality_profile";
const AI_QUESTIONS_MODE_KEY = "fpc_ai_questions_mode";
const DIAGRAM_MODE_KEY = "ui.diagram.mode.v1";
const COMMAND_HISTORY_LIMIT = 5;
const NOTES_BATCH_APPLY_EVENT = "fpc:batch_ops_apply";
const NOTES_BATCH_RESULT_PREFIX = "fpc:batch_ops_result:";
const NOTES_COVERAGE_OPEN_EVENT = "fpc:coverage_open";
const DIAGRAM_PATHS_INTENT_VERSION = 1;
const HYBRID_V2_KNOWN_SESSIONS_KEY = "fpc_hybrid_v2_known_sessions_v1";

function readCommandMode() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(COMMAND_MODE_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function readQualityMode() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(QUALITY_MODE_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function normalizeDiagramMode(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "interview" || value === "quality" || value === "coverage") return value;
  return "normal";
}

function readDiagramMode() {
  if (typeof window === "undefined") return "normal";
  try {
    const stored = String(window.localStorage?.getItem(DIAGRAM_MODE_KEY) || "").trim();
    if (stored) return normalizeDiagramMode(stored);
    // Backward compatibility with older independent toggles.
    if (readQualityMode()) return "quality";
    if (readAiQuestionsMode()) return "interview";
    return "normal";
  } catch {
    return "normal";
  }
}

function readQualityProfile() {
  if (typeof window === "undefined") return "mvp";
  try {
    const raw = String(window.localStorage?.getItem(QUALITY_PROFILE_KEY) || "").trim().toLowerCase();
    if (raw === "production" || raw === "haccp") return raw;
    return "mvp";
  } catch {
    return "mvp";
  }
}

function readAiQuestionsMode() {
  if (typeof window === "undefined") return false;
  try {
    return String(window.localStorage?.getItem(AI_QUESTIONS_MODE_KEY) || "").trim() === "1";
  } catch {
    return false;
  }
}

function writeCommandMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(COMMAND_MODE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function writeQualityMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(QUALITY_MODE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function writeAiQuestionsMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(AI_QUESTIONS_MODE_KEY, enabled ? "1" : "0");
  } catch {
  }
}

function writeDiagramMode(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(DIAGRAM_MODE_KEY, normalizeDiagramMode(mode));
  } catch {
  }
}

function writeQualityProfile(profileId) {
  if (typeof window === "undefined") return;
  const value = String(profileId || "mvp").trim().toLowerCase();
  try {
    window.localStorage?.setItem(QUALITY_PROFILE_KEY, value);
  } catch {
  }
}

function commandHistoryStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `fpc_ai_ops_history:${sid}` : "";
}

function readCommandHistory(sessionId) {
  if (typeof window === "undefined") return [];
  const key = commandHistoryStorageKey(sessionId);
  if (!key) return [];
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return asArray(parsed)
      .map((item) => ({
        text: String(item?.text || ""),
        ts: Number(item?.ts || Date.now()) || Date.now(),
      }))
      .filter((item) => item.text)
      .slice(0, COMMAND_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeCommandHistory(sessionId, list) {
  if (typeof window === "undefined") return;
  const key = commandHistoryStorageKey(sessionId);
  if (!key) return;
  try {
    window.localStorage?.setItem(key, JSON.stringify(asArray(list).slice(0, COMMAND_HISTORY_LIMIT)));
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

function logAiOpsTrace(tag, payload = {}) {
  if (!shouldLogAiOpsTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AI_OPS] ${String(tag || "trace")} ${suffix}`.trim());
}

function readKnownHybridV2Sessions(storageLike) {
  if (!storageLike) return new Set();
  try {
    const raw = storageLike.getItem(HYBRID_V2_KNOWN_SESSIONS_KEY);
    const parsed = JSON.parse(String(raw || "[]"));
    return new Set(asArray(parsed).map((row) => toText(row)).filter(Boolean));
  } catch {
    return new Set();
  }
}

function hasKnownHybridV2Session(storageLike, sidRaw) {
  const sid = toText(sidRaw);
  if (!sid) return false;
  return readKnownHybridV2Sessions(storageLike).has(sid);
}

function markKnownHybridV2Session(storageLike, sidRaw) {
  const sid = toText(sidRaw);
  if (!storageLike || !sid) return false;
  try {
    const next = readKnownHybridV2Sessions(storageLike);
    next.add(sid);
    storageLike.setItem(HYBRID_V2_KNOWN_SESSIONS_KEY, JSON.stringify(Array.from(next)));
    return true;
  } catch {
    return false;
  }
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

function logActorsTrace(tag, payload = {}) {
  if (!shouldLogActorsTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[ACTORS] ${String(tag || "trace")} ${suffix}`.trim());
}

function readInsertBetweenCandidate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const candidate = {
    available: raw.available !== false,
    fromId: String(raw.fromId || "").trim(),
    toId: String(raw.toId || "").trim(),
    flowId: String(raw.flowId || "").trim(),
    when: String(raw.when || "").trim(),
    laneId: String(raw.laneId || "").trim(),
    laneName: String(raw.laneName || "").trim(),
    source: String(raw.source || "").trim(),
    error: String(raw.error || "").trim(),
  };
  if (!candidate.fromId || !candidate.toId) return null;
  return candidate;
}

function insertBetweenErrorMessage(errorCode) {
  const code = String(errorCode || "").trim().toLowerCase();
  if (code === "multiple_edges_ambiguous") {
    return "Найдено несколько связей A→B. Выберите конкретную стрелку.";
  }
  if (code === "edge_not_found" || code === "flow_not_found") {
    return "Связь между выбранными шагами не найдена.";
  }
  if (code === "insert_nodes_not_found") {
    return "Не удалось найти узлы для вставки.";
  }
  if (!code) return "Операция недоступна для текущего выделения.";
  return `Операция недоступна: ${code}.`;
}

const QUALITY_RULE_COPY = Object.freeze({
  missing_start_event: {
    title: "Не указано начало процесса",
    short: "На схеме нет точки, откуда процесс стартует.",
    fix: "Добавьте событие «Старт» и соедините его со следующим шагом.",
  },
  missing_end_event: {
    title: "Не указано завершение процесса",
    short: "На схеме нет явной точки завершения.",
    fix: "Добавьте событие «Завершение» и подведите к нему финальный шаг.",
  },
  dangling_incoming: {
    title: "Шаг недостижим",
    short: "К этому шагу не ведет ни один переход.",
    fix: "Добавьте входящий переход от предыдущего шага.",
  },
  dangling_outgoing: {
    title: "Шаг обрывает процесс",
    short: "После этого шага нет перехода дальше.",
    fix: "Добавьте переход к следующему шагу или к завершению.",
  },
  gateway_missing_inout: {
    title: "Развилка разрывает цепочку",
    short: "У развилки нет корректного входа или выхода.",
    fix: "Проверьте, что к развилке есть вход и хотя бы один выход.",
  },
  gateway_missing_condition: {
    title: "Для веток не заданы условия",
    short: "У развилки есть несколько выходов, но не подписаны условия.",
    fix: "Добавьте условия переходов или отметьте ветку по умолчанию.",
  },
  gateway_single_outgoing: {
    title: "Развилка не дает ветвления",
    short: "У развилки только один выход.",
    fix: "Либо добавьте альтернативную ветку, либо уберите развилку.",
  },
  task_without_label: {
    title: "Шаг без названия",
    short: "Название шага пустое.",
    fix: "Укажите короткое понятное название шага.",
  },
  long_label: {
    title: "Слишком длинное название шага",
    short: "Название сложно читать на диаграмме.",
    fix: "Сократите название до краткой формулировки.",
  },
  task_without_lane: {
    title: "Шаг без роли/лайна",
    short: "Для шага не указан исполнитель.",
    fix: "Назначьте шагу роль или lane.",
  },
  duplicate_task_name: {
    title: "Повторяются названия шагов",
    short: "Несколько шагов имеют одинаковое название.",
    fix: "Переименуйте шаги, чтобы их можно было различать.",
  },
  cycle_detected: {
    title: "Обнаружен цикл в процессе",
    short: "Процесс может зациклиться.",
    fix: "Проверьте ветвления и условия переходов, чтобы разорвать цикл.",
  },
  unreachable_from_start: {
    title: "Шаг не связан с началом процесса",
    short: "Этот шаг не достижим от стартового события.",
    fix: "Свяжите шаг цепочкой переходов от старта.",
  },
  interview_mismatch: {
    title: "Несовпадение Interview и диаграммы",
    short: "Данные Interview не соответствуют текущей схеме.",
    fix: "Синхронизируйте шаги Interview с диаграммой.",
  },
  generic: {
    title: "Найдена проблема качества",
    short: "Проверьте выделенный шаг на схеме.",
    fix: "Откройте элемент и уточните связи, название и роль.",
  },
});

function qualityLevelLabel(levelRaw) {
  return String(levelRaw || "").toLowerCase() === "error" ? "Ошибка" : "Предупреждение";
}

function qualityImpactLabel(issue) {
  const score = Number(issue?.score || 0);
  if (String(issue?.level || "").toLowerCase() === "error" || score >= 9) return "Влияние: высокое";
  if (score >= 6) return "Влияние: среднее";
  return "Влияние: низкое";
}

function qualityIssueCopy(issue, nodeTitle = "") {
  const ruleId = String(issue?.ruleId || "generic").trim().toLowerCase() || "generic";
  const preset = QUALITY_RULE_COPY[ruleId] || QUALITY_RULE_COPY.generic;
  const fallbackReason = String(asArray(issue?.reasons)[0] || "").trim();
  const fallbackFix = String(issue?.fixHint || issue?.aiHint || "").trim();
  return {
    ruleId,
    title: String(preset?.title || QUALITY_RULE_COPY.generic.title),
    short: String(preset?.short || fallbackReason || QUALITY_RULE_COPY.generic.short),
    fix: fallbackFix || String(preset?.fix || QUALITY_RULE_COPY.generic.fix),
    nodeTitle: String(nodeTitle || "").trim() || "Шаг без названия",
  };
}

function coverageReadinessPercent(row) {
  const score = Number(row?.score || 0);
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(3, score)) : 0;
  return Math.round(((3 - clamped) / 3) * 100);
}

function coverageMarkerClass(row) {
  const score = Number(row?.score || 0);
  if (!Number.isFinite(score) || score <= 0) return "fpcCoverageReady";
  if (score <= 1) return "fpcCoverageWarn";
  return "fpcCoverageRisk";
}

const AI_QUESTIONS_TIMEOUT_MS = 120000;

function normalizeAiQuestionStatus(raw) {
  return String(raw || "").trim().toLowerCase() === "done" ? "done" : "open";
}

function normalizeAiQuestionItems(rawList, fallbackStepId = "") {
  const out = [];
  const byQid = new Set();
  const byText = new Set();
  asArray(rawList).forEach((rawItem, idx) => {
    const item = asObject(rawItem);
    const text = String(item?.text || item?.question || "").trim();
    const rawQid = String(item?.qid || item?.id || item?.question_id || item?.questionId || "").trim();
    if (!text && !rawQid) return;
    const qid = rawQid || `q_${idx + 1}_${fnv1aHex(text || `ai_q_${idx + 1}`).slice(0, 8)}`;
    const textKey = text.toLowerCase();
    if (qid && byQid.has(qid)) return;
    if (!qid && textKey && byText.has(textKey)) return;
    if (qid) byQid.add(qid);
    if (textKey) byText.add(textKey);
    out.push({
      qid,
      text: text || qid,
      comment: String(item?.comment || item?.answer || "").trim(),
      status: normalizeAiQuestionStatus(item?.status),
      createdAt: Number(item?.createdAt || item?.created_at || item?.ts || Date.now()) || Date.now(),
      source: String(item?.source || "ai").trim() || "ai",
      stepId: String(item?.stepId || item?.step_id || fallbackStepId || "").trim(),
    });
  });
  return out;
}

function collectAiQuestionsFromPayload(payloadRaw, fallbackNodeId = "") {
  const payload = asObject(payloadRaw);
  const llmStep = asObject(payload?.llm_step);
  const nodeId = String(llmStep?.node_id || fallbackNodeId || "").trim();
  let incomingRaw = asArray(llmStep?.questions);
  if (!incomingRaw.length) incomingRaw = asArray(llmStep?.new_questions);
  if (!incomingRaw.length) {
    const payloadQuestions = asArray(payload?.questions).filter((item) => {
      const q = asObject(item);
      const text = String(q?.text || q?.question || "").trim();
      return !!text;
    });
    if (payloadQuestions.length) {
      const exactNodeQuestions = payloadQuestions.filter((item) => {
        const q = asObject(item);
        const qNodeId = String(q?.node_id || q?.nodeId || "").trim();
        return !!nodeId && qNodeId === nodeId;
      });
      incomingRaw = exactNodeQuestions.length ? exactNodeQuestions : payloadQuestions;
    }
  }
  const stepId = String(llmStep?.step_id || "").trim();
  const questions = normalizeAiQuestionItems(incomingRaw, stepId);
  return { nodeId, questions };
}

function withInjectedAiQuestionsPayload(payloadRaw, { selectedElementId = "", draftInterview = {} } = {}) {
  const payload = asObject(payloadRaw);
  const interview = asObject(payload?.interview);
  const fallbackNodeId = String(selectedElementId || "").trim();
  const { nodeId, questions } = collectAiQuestionsFromPayload(payload, fallbackNodeId);
  if (!nodeId || !questions.length) return payload;

  const payloadMap = asObject(interview?.ai_questions_by_element || interview?.aiQuestionsByElementId);
  const draftInterviewObj = asObject(draftInterview);
  const draftMap = asObject(draftInterviewObj?.ai_questions_by_element || draftInterviewObj?.aiQuestionsByElementId);
  const mergedInterview = mergeInterviewData(
    { ai_questions_by_element: draftMap },
    {
      ai_questions_by_element: {
        ...payloadMap,
        [nodeId]: questions,
      },
    },
  );
  const mergedMap = asObject(mergedInterview?.ai_questions_by_element);
  if (!Object.keys(mergedMap).length) return payload;
  return {
    ...payload,
    interview: {
      ...interview,
      ai_questions_by_element: mergedMap,
    },
  };
}

function getAiGenerateGate({
  hasSession,
  tab,
  selectedElementId,
  isLocal,
  aiQuestionsBusy,
}) {
  if (!hasSession) {
    return {
      canGenerate: false,
      reasonCode: "no_session",
      reasonText: "Сначала откройте сессию процесса.",
    };
  }
  if (tab !== "diagram") {
    return {
      canGenerate: false,
      reasonCode: "tab_diagram_required",
      reasonText: "Генерация доступна во вкладке Diagram.",
    };
  }
  if (!String(selectedElementId || "").trim()) {
    return {
      canGenerate: false,
      reasonCode: "no_selection",
      reasonText: "Выберите узел на диаграмме.",
    };
  }
  if (isLocal) {
    return {
      canGenerate: false,
      reasonCode: "local_session",
      reasonText: "Генерация AI-вопросов доступна только для API-сессий.",
    };
  }
  if (aiQuestionsBusy) {
    return {
      canGenerate: false,
      reasonCode: "busy",
      reasonText: "Генерация уже выполняется.",
    };
  }
  return {
    canGenerate: true,
    reasonCode: "",
    reasonText: "",
  };
}

function emitBatchOpsResult(requestId, payload = {}) {
  if (typeof window === "undefined") return;
  const rid = String(requestId || "").trim();
  if (!rid) return;
  window.dispatchEvent(new CustomEvent(`${NOTES_BATCH_RESULT_PREFIX}${rid}`, {
    detail: payload && typeof payload === "object" ? payload : { ok: false, error: "invalid_payload" },
  }));
}

export default function ProcessStage({
  sessionId,
  activeProjectId,
  workspaceActiveOrgId = "",
  canInviteWorkspaceUsers = false,
  locked,
  draft,
  onSessionSync,
  onOpenWorkspaceSession,
  onCreateWorkspaceProject,
  onCreateWorkspaceSession,
  onOpenWorkspaceOrgSettings,
  onUiStateChange,
  processTabIntent,
  aiGenerateIntent,
  stepTimeUnit = "min",
  reloadKey,
  selectedBpmnElement,
  onBpmnElementSelect,
  onOpenElementNotes,
  onElementNotesRemap,
  onRecalculateRtiers,
  snapshotRestoreNotice,
}) {
  const sid = String(sessionId || "");
  const { user } = useAuth();
  const bpmnRef = useRef(null);
  const importInputRef = useRef(null);
  const processBodyRef = useRef(null);
  const toolbarMenuRef = useRef(null);
  const toolbarMenuButtonRef = useRef(null);
  const diagramActionBarRef = useRef(null);
  const diagramPathPopoverRef = useRef(null);
  const diagramHybridToolsPopoverRef = useRef(null);
  const diagramPlanPopoverRef = useRef(null);
  const diagramPlaybackPopoverRef = useRef(null);
  const diagramLayersPopoverRef = useRef(null);
  const diagramRobotMetaPopoverRef = useRef(null);
  const diagramRobotMetaListRef = useRef(null);
  const diagramQualityPopoverRef = useRef(null);
  const diagramOverflowPopoverRef = useRef(null);
  const bpmnStageHostRef = useRef(null);
  const hybridLayerOverlayRef = useRef(null);
  const hybridV2FileInputRef = useRef(null);
  const drawioFileInputRef = useRef(null);
  const hybridLayerDragRef = useRef(null);
  const hybridLayerMapRef = useRef({});
  const hybridLayerPersistedMapRef = useRef({});
  const hybridAutoFocusGuardRef = useRef("");
  const hybridV2DocRef = useRef(normalizeHybridV2Doc({}));
  const hybridV2PersistedDocRef = useRef(normalizeHybridV2Doc({}));
  const drawioMetaRef = useRef(normalizeDrawioMeta({}));
  const drawioPersistedMetaRef = useRef(normalizeDrawioMeta({}));
  const hybridV2MigrationGuardRef = useRef("");
  const lastDraftXmlHashRef = useRef("");
  const lastAiGenerateIntentKeyRef = useRef("");

  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [aiBottleneckOn, setAiBottleneckOn] = useState(false);
  const [aiStepBusy, setAiStepBusy] = useState(false);
  const [isManualSaveBusy, setIsManualSaveBusy] = useState(false);
  const [apiClarifyHints, setApiClarifyHints] = useState([]);
  const [apiClarifyList, setApiClarifyList] = useState([]);
  const [llmClarifyList, setLlmClarifyList] = useState([]);
  const [apiClarifyMeta, setApiClarifyMeta] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [versionsList, setVersionsList] = useState([]);
  const [previewSnapshotId, setPreviewSnapshotId] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBaseSnapshotId, setDiffBaseSnapshotId] = useState("");
  const [diffTargetSnapshotId, setDiffTargetSnapshotId] = useState("");
  const [commandModeEnabled, setCommandModeEnabled] = useState(() => readCommandMode());
  const [diagramMode, setDiagramMode] = useState(() => readDiagramMode());
  const [qualityProfileId, setQualityProfileId] = useState(() => readQualityProfile());
  const [commandInput, setCommandInput] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandStatus, setCommandStatus] = useState({ kind: "", text: "" });
  const [commandHistory, setCommandHistory] = useState([]);
  const [qualityIssueFocusKey, setQualityIssueFocusKey] = useState("");
  const [qualityAutoFixOpen, setQualityAutoFixOpen] = useState(false);
  const [qualityAutoFixBusy, setQualityAutoFixBusy] = useState(false);
  const [aiQuestionsBusy, setAiQuestionsBusy] = useState(false);
  const [aiQuestionsStatus, setAiQuestionsStatus] = useState({ kind: "", text: "" });
  const [insertBetweenOpen, setInsertBetweenOpen] = useState(false);
  const [insertBetweenBusy, setInsertBetweenBusy] = useState(false);
  const [insertBetweenName, setInsertBetweenName] = useState("");
  const [insertBetweenDraft, setInsertBetweenDraft] = useState(null);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [saveDirtyHint, setSaveDirtyHint] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionFilters, setAttentionFilters] = useState({
    quality: false,
    ai: false,
    notes: false,
  });
  const [diagramActionPathOpen, setDiagramActionPathOpen] = useState(false);
  const [diagramActionHybridToolsOpen, setDiagramActionHybridToolsOpen] = useState(false);
  const [diagramActionPlanOpen, setDiagramActionPlanOpen] = useState(false);
  const [diagramActionPlaybackOpen, setDiagramActionPlaybackOpen] = useState(false);
  const [diagramActionLayersOpen, setDiagramActionLayersOpen] = useState(false);
  const [diagramActionRobotMetaOpen, setDiagramActionRobotMetaOpen] = useState(false);
  const [diagramActionQualityOpen, setDiagramActionQualityOpen] = useState(false);
  const [diagramActionOverflowOpen, setDiagramActionOverflowOpen] = useState(false);
  const [pathHighlightEnabled, setPathHighlightEnabled] = useState(false);
  const [pathHighlightTier, setPathHighlightTier] = useState("P0");
  const [pathHighlightSequenceKey, setPathHighlightSequenceKey] = useState("");
  const [robotMetaOverlayEnabled, setRobotMetaOverlayEnabled] = useState(false);
  const [robotMetaOverlayFilters, setRobotMetaOverlayFilters] = useState({
    ready: true,
    incomplete: true,
  });
  const [robotMetaListOpen, setRobotMetaListOpen] = useState(false);
  const [robotMetaListTab, setRobotMetaListTab] = useState("ready");
  const [robotMetaListSearch, setRobotMetaListSearch] = useState("");
  const [qualityOverlayFilters, setQualityOverlayFilters] = useState({
    orphan: false,
    dead_end: false,
    gateway: false,
    link_errors: false,
    missing_duration: false,
    missing_notes: false,
    route_truncated: false,
  });
  const [qualityOverlayListKey, setQualityOverlayListKey] = useState("");
  const [qualityOverlaySearch, setQualityOverlaySearch] = useState("");
  const [diagramPathsIntent, setDiagramPathsIntent] = useState(null);
  const [executionPlanPreview, setExecutionPlanPreview] = useState(null);
  const [executionPlanBusy, setExecutionPlanBusy] = useState(false);
  const [executionPlanSaveBusy, setExecutionPlanSaveBusy] = useState(false);
  const [executionPlanError, setExecutionPlanError] = useState("");
  const [playbackAutoCamera, setPlaybackAutoCamera] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState("1");
  const [playbackManualAtGateway, setPlaybackManualAtGateway] = useState(false);
  const [playbackScenarioKey, setPlaybackScenarioKey] = useState("active");
  const [hybridUiPrefs, setHybridUiPrefs] = useState(() => normalizeHybridUiPrefs({}));
  const [hybridPeekActive, setHybridPeekActive] = useState(false);
  const [hybridLayerByElementId, setHybridLayerByElementId] = useState({});
  const [hybridLayerActiveElementId, setHybridLayerActiveElementId] = useState("");
  const [hybridV2Doc, setHybridV2Doc] = useState(() => normalizeHybridV2Doc({}));
  const [hybridV2BindPickMode, setHybridV2BindPickMode] = useState(false);
  const [drawioMeta, setDrawioMeta] = useState(() => normalizeDrawioMeta({}));
  const [drawioEditorOpen, setDrawioEditorOpen] = useState(false);

  useEffect(() => {
    setGenBusy(false);
    setGenErr("");
    setInfoMsg("");
    setAiBottleneckOn(false);
    setAiStepBusy(false);
    setIsManualSaveBusy(false);
    setApiClarifyHints([]);
    setApiClarifyList([]);
    setLlmClarifyList([]);
    setApiClarifyMeta(null);
    setVersionsOpen(false);
    setVersionsBusy(false);
    setVersionsList([]);
    setPreviewSnapshotId("");
    setDiffOpen(false);
    setDiffBaseSnapshotId("");
    setDiffTargetSnapshotId("");
    setCommandInput("");
    setCommandBusy(false);
    setCommandStatus({ kind: "", text: "" });
    setCommandHistory(readCommandHistory(sid));
    setQualityIssueFocusKey("");
    setQualityAutoFixOpen(false);
    setQualityAutoFixBusy(false);
    setAiQuestionsBusy(false);
    setAiQuestionsStatus({ kind: "", text: "" });
    setInsertBetweenOpen(false);
    setInsertBetweenBusy(false);
    setInsertBetweenName("");
    setInsertBetweenDraft(null);
    setToolbarMenuOpen(false);
    setSaveDirtyHint(false);
    setAttentionOpen(false);
    setAttentionFilters({
      quality: false,
      ai: false,
      notes: false,
    });
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionLayersOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
    setPathHighlightEnabled(false);
    setPathHighlightTier("P0");
    setPathHighlightSequenceKey("");
    setRobotMetaOverlayEnabled(false);
    setRobotMetaOverlayFilters({
      ready: true,
      incomplete: true,
    });
    setRobotMetaListOpen(false);
    setRobotMetaListTab("ready");
    setRobotMetaListSearch("");
    setQualityOverlayFilters({
      orphan: false,
      dead_end: false,
      gateway: false,
      link_errors: false,
      missing_duration: false,
      missing_notes: false,
      route_truncated: false,
    });
    setQualityOverlayListKey("");
    setQualityOverlaySearch("");
    setDiagramPathsIntent(null);
    setExecutionPlanPreview(null);
    setExecutionPlanBusy(false);
    setExecutionPlanSaveBusy(false);
    setExecutionPlanError("");
    setPlaybackAutoCamera(true);
    setPlaybackSpeed("1");
    setPlaybackManualAtGateway(false);
    setPlaybackScenarioKey("active");
    setHybridPeekActive(false);
    setHybridLayerActiveElementId("");
    {
      const emptyV2 = normalizeHybridV2Doc({});
      setHybridV2Doc(emptyV2);
      hybridV2DocRef.current = emptyV2;
      hybridV2PersistedDocRef.current = emptyV2;
    }
    hybridV2MigrationGuardRef.current = "";
    setHybridV2BindPickMode(false);
  }, [sid]);

  const hasSession = !!sid;
  const isLocal = isLocalSessionId(sid);
  const isInterviewMode = diagramMode === "interview";
  const isQualityMode = diagramMode === "quality";
  const isCoverageMode = diagramMode === "coverage";

  const projectionHelpers = useMemo(
    () => ({
      asArray,
      asObject,
      interviewHasContent,
      mergeInterviewData,
      sanitizeGraphNodes,
      mergeNodesById,
      mergeEdgesByKey,
      enrichInterviewWithNodeBindings,
      parseBpmnToSessionGraph,
    }),
    [],
  );

  const bpmnSync = useBpmnSync({
    sessionId: sid,
    isLocal,
    draft,
    bpmnRef,
    onSessionSync,
    apiGetBpmnXml,
  });

  const {
    tab,
    setTab,
    switchTab,
    isSwitchingTab,
    isFlushingTab,
    requestDiagramFocus,
    isInterview,
    isBpmnTab,
    markInterviewAsSaved,
    handleInterviewChange,
    queueDiagramMutation: queueDiagramMutationRaw,
  } = useProcessOrchestrator({
    sid,
    isLocal,
    draft,
    processTabIntent,
    bpmnRef,
    processBodyRef,
    bpmnSync,
    projectionHelpers,
    onSessionSync,
    onError: setGenErr,
  });

  const queueDiagramMutation = useCallback((mutation) => {
    const kind = String(mutation?.kind || mutation || "").trim().toLowerCase();
    if (kind.startsWith("diagram.") || kind.startsWith("xml.")) {
      setSaveDirtyHint(true);
    }
    queueDiagramMutationRaw(mutation);
  }, [queueDiagramMutationRaw]);

  const applyDiagramMode = useCallback((nextModeRaw) => {
    const nextMode = normalizeDiagramMode(nextModeRaw);
    setDiagramMode(nextMode);
  }, []);

  async function handleSaveCurrentTab() {
    if (!hasSession || !isBpmnTab || isSwitchingTab || isFlushingTab || isManualSaveBusy) return;
    setGenErr("");
    setInfoMsg("");
    setIsManualSaveBusy(true);
    try {
      const saved = await bpmnSync.flushFromActiveTab(tab, {
        force: tab === "diagram",
        source: "manual_save",
        reason: "manual_save",
      });
      if (!saved?.ok) {
        setGenErr(shortErr(saved?.error || "Не удалось сохранить BPMN."));
        return;
      }
      setSaveDirtyHint(false);
      if (selectedElementId) {
        bpmnRef.current?.flashNode?.(selectedElementId, "sync", { label: "Synced" });
      }
      setInfoMsg(saved?.pending ? "Сохранение поставлено в очередь (pending)." : "Сохранено.");
    } catch (e) {
      setGenErr(shortErr(e?.message || e || "Не удалось сохранить BPMN."));
    } finally {
      setIsManualSaveBusy(false);
    }
  }

  // TODO(tech-debt): Review/LLM tabs are temporarily hidden from UI.
  // Clarification data pipeline is kept for later re-introduction.
  const bottlenecks = useMemo(
    () => buildBottleneckHints(draft?.nodes, draft?.edges, draft?.questions),
    [draft?.nodes, draft?.edges, draft?.questions],
  );
  const lintResult = useMemo(
    () => runBpmnLint({
      xmlText: draft?.bpmn_xml,
      interview: draft?.interview,
      nodes: draft?.nodes,
      profileId: qualityProfileId,
    }),
    [draft?.bpmn_xml, draft?.interview, draft?.nodes, qualityProfileId],
  );
  const qualityHintsRaw = useMemo(
    () => asArray(lintResult?.issues),
    [lintResult],
  );
  const qualitySummary = useMemo(
    () => lintResult?.summary || { total: 0, errors: 0, warns: 0 },
    [lintResult],
  );
  const qualityProfile = useMemo(
    () => lintResult?.profile || LINT_PROFILES.mvp,
    [lintResult],
  );
  const qualityAutoFixPreview = useMemo(
    () => buildLintAutoFixPreview({
      xmlText: draft?.bpmn_xml,
      issues: qualityHintsRaw,
    }),
    [draft?.bpmn_xml, qualityHintsRaw],
  );
  const activeHints = useMemo(
    () => (apiClarifyHints.length ? apiClarifyHints : bottlenecks),
    [apiClarifyHints, bottlenecks],
  );
  const qualityHints = useMemo(
    () => (
      isQualityMode
        ? qualityHintsRaw.map((issue) => ({
          ...issue,
          markerClass: "fpcQualityProblem",
          hideTag: true,
        }))
        : []
    ),
    [isQualityMode, qualityHintsRaw],
  );
  const workbench = useProcessWorkbenchController({
    sessionId: sid,
    isLocal,
    locked,
    tab,
    isInterview,
    isBpmnTab,
    genBusy,
    aiStepBusy,
  });
  const selectedElementId = String(selectedBpmnElement?.id || "").trim();
  const selectedElementName = String(selectedBpmnElement?.name || selectedElementId || "").trim();
  const selectedElementType = String(selectedBpmnElement?.type || "").trim();
  const selectedElementLaneName = String(selectedBpmnElement?.laneName || "").trim();
  const selectedElementContext = useMemo(() => {
    if (!selectedElementId) return null;
    return {
      id: selectedElementId,
      name: selectedElementName || selectedElementId,
      type: selectedElementType,
      laneName: selectedElementLaneName,
    };
  }, [selectedElementId, selectedElementName, selectedElementType, selectedElementLaneName]);
  const selectedBpmnElementIds = useMemo(() => {
    const ids = new Set(
      toArray(selectedBpmnElement?.selectedIds)
        .map((row) => toText(row))
        .filter(Boolean),
    );
    if (selectedElementId) ids.add(selectedElementId);
    return Array.from(ids);
  }, [selectedBpmnElement?.selectedIds, selectedElementId]);
  const selectedTemplateNodes = useMemo(() => {
    if (!selectedBpmnElementIds.length) return [];
    const byId = new Set(selectedBpmnElementIds);
    return toArray(draft?.nodes).filter((node) => byId.has(toText(node?.id)));
  }, [draft?.nodes, selectedBpmnElementIds]);
  const templateSelectionContext = useMemo(() => ({
    name: selectedElementName || selectedElementId,
    primaryName: selectedElementName || selectedElementId,
    primaryElementId: selectedElementId,
    sourceSessionId: sid,
    elementTypes: Array.from(new Set([
      ...selectedTemplateNodes.map((node) => toText(node?.type)).filter(Boolean),
      toText(selectedElementType),
    ].filter(Boolean))),
    laneNames: Array.from(new Set([
      ...selectedTemplateNodes
        .map((node) => toText(node?.laneName || node?.lane_name || node?.lane || node?.role || node?.area))
        .filter(Boolean),
      toText(selectedElementLaneName),
    ].filter(Boolean))),
  }), [
    selectedElementId,
    selectedElementLaneName,
    selectedElementName,
    selectedElementType,
    selectedTemplateNodes,
    sid,
  ]);
  const getSelectedBpmnElementIds = useCallback(() => selectedBpmnElementIds, [selectedBpmnElementIds]);
  const applyTemplateSelectionIds = useCallback(
    async (ids) => applyTemplateToDiagram(bpmnRef.current, ids, { label: "Template" }),
    [],
  );
  const templatesStore = useTemplatesStore({
    userId: toText(user?.id),
    orgId: workspaceActiveOrgId,
    canCreateOrgTemplate: !!workspaceActiveOrgId && !!canInviteWorkspaceUsers,
    hasSession,
    tab,
    getSelectedBpmnElementIds,
    applySelectionIds: applyTemplateSelectionIds,
    selectionContext: templateSelectionContext,
    setError: setGenErr,
    setInfo: setInfoMsg,
  });
  const {
    templatesEnabled,
    setTemplatesEnabled,
    pickerOpen: templatesPickerOpen,
    setPickerOpen: setTemplatesPickerOpen,
    createOpen: createTemplateOpen,
    setCreateOpen: setCreateTemplateOpen,
    busy: templatesBusy,
    search: templatesSearch,
    setSearch: setTemplatesSearch,
    activeScope: templatesScope,
    setActiveScope: setTemplatesScope,
    createScope: createTemplateScope,
    setCreateScope: setCreateTemplateScope,
    createTitle: createTemplateTitle,
    setCreateTitle: setCreateTemplateTitle,
    scopedTemplates,
    suggestedTemplates,
    counts: templateCounts,
    openTemplatesPicker,
    openCreateTemplateModal,
    saveCurrentSelectionAsTemplate,
    reloadTemplates,
    applyTemplate,
    removeTemplate,
  } = templatesStore;
  const nodePathMetaMap = useMemo(
    () => normalizeNodePathMetaMap(asObject(asObject(draft?.bpmn_meta).node_path_meta)),
    [draft?.bpmn_meta],
  );
  const flowTierMetaMap = useMemo(
    () => normalizeFlowTierMetaMap(asObject(asObject(draft?.bpmn_meta).flow_meta)),
    [draft?.bpmn_meta],
  );
  const robotMetaByElementId = useMemo(
    () => normalizeRobotMetaMap(asObject(asObject(draft?.bpmn_meta).robot_meta_by_element_id)),
    [draft?.bpmn_meta],
  );
  const robotMetaStatusByElementId = useMemo(
    () => buildRobotMetaStatusByElementId(robotMetaByElementId),
    [robotMetaByElementId],
  );
  const robotMetaCounts = useMemo(() => {
    const summary = { ready: 0, incomplete: 0 };
    Object.values(robotMetaStatusByElementId).forEach((statusRaw) => {
      const status = toText(statusRaw).toLowerCase();
      if (status === "ready") summary.ready += 1;
      if (status === "incomplete") summary.incomplete += 1;
    });
    return summary;
  }, [robotMetaStatusByElementId]);
  const robotMetaNodeCatalogById = useMemo(() => {
    const out = {};
    asArray(draft?.nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      out[nodeId] = {
        id: nodeId,
        title: toText(node?.name || node?.title || nodeId) || nodeId,
        type: toText(node?.type),
      };
    });
    return out;
  }, [draft?.nodes]);
  const hybridLayerMapFromDraft = useMemo(
    () => normalizeHybridLayerMap(asObject(asObject(draft?.bpmn_meta).hybrid_layer_by_element_id)),
    [draft?.bpmn_meta],
  );
  const hybridV2FromDraft = useMemo(
    () => normalizeHybridV2Doc(asObject(asObject(draft?.bpmn_meta).hybrid_v2)),
    [draft?.bpmn_meta],
  );
  const drawioFromDraft = useMemo(
    () => normalizeDrawioMeta(asObject(asObject(draft?.bpmn_meta).drawio)),
    [draft?.bpmn_meta],
  );
  const hybridLayerMapLive = useMemo(
    () => normalizeHybridLayerMap(hybridLayerByElementId),
    [hybridLayerByElementId],
  );
  const hybridLayerItems = useMemo(() => {
    const out = [];
    const seen = new Set();
    Object.keys(robotMetaByElementId).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || seen.has(elementId)) return;
      const meta = asObject(robotMetaByElementId[elementId]);
      const mode = toText(meta?.exec?.mode).toLowerCase();
      if (mode !== "hybrid") return;
      seen.add(elementId);
      const node = asObject(robotMetaNodeCatalogById[elementId]);
      out.push({
        elementId,
        title: toText(node?.title || elementId) || elementId,
        status: toText(robotMetaStatusByElementId[elementId]).toLowerCase() || "none",
        executor: toText(meta?.exec?.executor),
        actionKey: toText(meta?.exec?.action_key),
      });
    });
    Object.keys(hybridLayerMapLive).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || seen.has(elementId)) return;
      seen.add(elementId);
      const node = asObject(robotMetaNodeCatalogById[elementId]);
      out.push({
        elementId,
        title: toText(node?.title || elementId) || elementId,
        status: toText(robotMetaStatusByElementId[elementId]).toLowerCase() || "none",
        executor: "",
        actionKey: "",
      });
    });
    return out.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru") || String(a.elementId || "").localeCompare(String(b.elementId || ""), "ru"));
  }, [
    robotMetaByElementId,
    robotMetaNodeCatalogById,
    robotMetaStatusByElementId,
    hybridLayerMapLive,
  ]);
  const hybridStorageKey = useMemo(
    () => getHybridUiStorageKey(toText(user?.id)),
    [user?.id],
  );
  const hybridVisible = !!hybridUiPrefs.visible || !!hybridPeekActive;
  const drawioVisible = !!drawioMeta.enabled && !!toText(drawioMeta.svg_cache);
  const overlayLayerVisible = hybridVisible || drawioVisible;
  const hybridModeEffective = hybridVisible
    ? (hybridPeekActive ? "view" : (hybridUiPrefs.mode === "edit" && !hybridUiPrefs.lock ? "edit" : "view"))
    : "hidden";
  const hybridOpacityValue = Number(hybridUiPrefs.opacity || 60) / 100;
  const hybridDebugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(String(window.location.search || "")).get("debugHybrid") === "1";
    } catch {
      return false;
    }
  }, [sid, tab]);
  const {
    hybridViewportSize,
    hybridViewportMatrix,
    overlayViewbox,
    overlayContainerRect,
    localToDiagram,
    clientToDiagram,
    getElementBBox,
  } = useDiagramOverlayTransform({
    tab,
    hybridVisible: overlayLayerVisible,
    bpmnRef,
    bpmnStageHostRef,
    matrixToScreen,
    matrixToDiagram,
  });
  const {
    hybridLayerPositions,
    hybridLayerPositionsRef,
    readHybridElementAnchor,
    resolveHybridTargetElementIdFromPoint,
    resolveFirstHybridSeedElementId,
  } = useBpmnCanvasController({
    tab,
    hybridVisible,
    hybridLayerItems,
    bpmnStageHostRef,
    toText,
    toNodeId,
    cssEscapeAttr,
    localToDiagram,
    getElementBBox,
  });
  const {
    getHybridLayerCardRefCallback,
    hybridLayerRenderRows,
    hybridLayerMissingBindingIds,
    hybridLayerVisibilityStats,
    hybridLayerCounts,
  } = useHybridLayerViewportController({
    resetKey: sid,
    tab,
    hybridVisible,
    hybridModeEffective,
    hybridLayerItems,
    hybridLayerPositions,
    hybridLayerByElementId,
    hybridViewportSize,
    hybridViewportMatrix,
    hybridLayerActiveElementId,
    matrixToDiagram,
    matrixToScreen,
    toText,
  });
  const { persistHybridLayerMap, persistHybridV2Doc, persistDrawioMeta } = useSessionMetaPersist({
    sid,
    isLocal,
    draftBpmnMeta: draft?.bpmn_meta,
    onSessionSync,
    setGenErr,
    shortErr,
    hybridLayerPersistedMapRef,
    hybridV2PersistedDocRef,
    drawioPersistedMetaRef,
    normalizeHybridLayerMap,
    serializeHybridLayerMap,
    normalizeHybridV2Doc,
    docToComparableJson,
    normalizeDrawioMeta,
    serializeDrawioMeta,
  });
  useEffect(() => {
    const incoming = normalizeHybridLayerMap(hybridLayerMapFromDraft);
    const incomingSig = serializeHybridLayerMap(incoming);
    const currentSig = serializeHybridLayerMap(hybridLayerMapRef.current);
    const persistedSig = serializeHybridLayerMap(hybridLayerPersistedMapRef.current);
    if (incomingSig === persistedSig && currentSig !== incomingSig) {
      return;
    }
    setHybridLayerByElementId(incoming);
    hybridLayerMapRef.current = incoming;
    hybridLayerPersistedMapRef.current = incoming;
  }, [hybridLayerMapFromDraft]);

  useEffect(() => {
    hybridLayerMapRef.current = normalizeHybridLayerMap(hybridLayerByElementId);
  }, [hybridLayerByElementId]);

  useEffect(() => {
    const incoming = normalizeHybridV2Doc(hybridV2FromDraft);
    const incomingSig = docToComparableJson(incoming);
    const currentDoc = normalizeHybridV2Doc(hybridV2DocRef.current);
    const persistedDoc = normalizeHybridV2Doc(hybridV2PersistedDocRef.current);
    const currentSig = docToComparableJson(currentDoc);
    const persistedSig = docToComparableJson(persistedDoc);
    const incomingCount = Number(asArray(incoming.elements).length) + Number(asArray(incoming.edges).length);
    const currentCount = Number(asArray(currentDoc.elements).length) + Number(asArray(currentDoc.edges).length);
    const persistedCount = Number(asArray(persistedDoc.elements).length) + Number(asArray(persistedDoc.edges).length);
    if (incomingSig === persistedSig && currentSig !== incomingSig) return;
    if (incomingCount <= 0 && incomingSig !== currentSig && (currentCount > 0 || persistedCount > 0)) return;
    setHybridV2Doc(incoming);
    hybridV2DocRef.current = incoming;
    hybridV2PersistedDocRef.current = incoming;
  }, [hybridV2FromDraft]);

  useEffect(() => {
    hybridV2DocRef.current = normalizeHybridV2Doc(hybridV2Doc);
  }, [hybridV2Doc]);

  useEffect(() => {
    const incoming = normalizeDrawioMeta(drawioFromDraft);
    const incomingSig = serializeDrawioMeta(incoming);
    const currentMeta = normalizeDrawioMeta(drawioMetaRef.current);
    const persistedMeta = normalizeDrawioMeta(drawioPersistedMetaRef.current);
    const currentSig = serializeDrawioMeta(currentMeta);
    const persistedSig = serializeDrawioMeta(persistedMeta);
    if (incomingSig === persistedSig && currentSig !== incomingSig) return;
    if (!incoming.doc_xml && currentMeta.doc_xml) return;
    setDrawioMeta(incoming);
    drawioMetaRef.current = incoming;
    drawioPersistedMetaRef.current = incoming;
  }, [drawioFromDraft]);

  useEffect(() => {
    drawioMetaRef.current = normalizeDrawioMeta(drawioMeta);
  }, [drawioMeta]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const count = Number(asArray(hybridV2Doc?.elements).length || 0) + Number(asArray(hybridV2Doc?.edges).length || 0);
    if (count <= 0 || !sid) return;
    markKnownHybridV2Session(window.localStorage, sid);
  }, [hybridV2Doc, sid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = normalizeHybridUiPrefs(
      loadHybridUiPrefs(window.localStorage, hybridStorageKey, toText(user?.id)),
    );
    setHybridUiPrefs((prevRaw) => {
      const prev = normalizeHybridUiPrefs(prevRaw);
      const loadedIsDefault = (
        !loaded.visible
        && loaded.mode === "view"
        && Number(loaded.opacity || 60) === 60
        && !loaded.lock
        && !loaded.focus
      );
      const prevHasUserState = (
        prev.visible
        || prev.mode === "edit"
        || Number(prev.opacity || 60) !== 60
        || prev.lock
        || prev.focus
      );
      if (loadedIsDefault && prevHasUserState) return prev;
      return loaded;
    });
  }, [hybridStorageKey, sid, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    saveHybridUiPrefs(window.localStorage, hybridStorageKey, hybridUiPrefs, toText(user?.id));
  }, [hybridStorageKey, hybridUiPrefs, user?.id]);
  useEffect(() => {
    if (!hybridDebugEnabled || typeof console === "undefined") return;
    // eslint-disable-next-line no-console
    console.debug(
      `[HYBRIDV2] prefs visible=${hybridUiPrefs.visible ? 1 : 0} mode=${toText(hybridUiPrefs.mode) || "view"} ` +
      `lock=${hybridUiPrefs.lock ? 1 : 0} peek=${hybridPeekActive ? 1 : 0} effective=${hybridModeEffective}`,
    );
  }, [hybridDebugEnabled, hybridUiPrefs.visible, hybridUiPrefs.mode, hybridUiPrefs.lock, hybridPeekActive, hybridModeEffective]);
  const robotMetaListItems = useMemo(() => {
    const tab = toText(robotMetaListTab).toLowerCase() === "incomplete" ? "incomplete" : "ready";
    const query = toText(robotMetaListSearch).toLowerCase();
    return Object.keys(robotMetaStatusByElementId)
      .map((elementId) => {
        const status = toText(robotMetaStatusByElementId[elementId]).toLowerCase();
        if (status !== tab) return null;
        const meta = asObject(robotMetaByElementId[elementId]);
        const node = asObject(robotMetaNodeCatalogById[elementId]);
        const mode = toText(meta?.exec?.mode).toLowerCase();
        const executor = toText(meta?.exec?.executor);
        const actionKey = toText(meta?.exec?.action_key);
        const title = toText(node?.title || elementId) || elementId;
        const searchText = [title, elementId, mode, executor, actionKey].join(" ").toLowerCase();
        if (query && !searchText.includes(query)) return null;
        return {
          nodeId: elementId,
          title,
          type: toText(node?.type),
          mode: mode || "human",
          executor,
          actionKey,
          status: getRobotMetaStatus(meta),
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru") || String(a.nodeId || "").localeCompare(String(b.nodeId || ""), "ru"));
  }, [
    robotMetaStatusByElementId,
    robotMetaByElementId,
    robotMetaNodeCatalogById,
    robotMetaListTab,
    robotMetaListSearch,
  ]);
  const executionPlanVersions = useMemo(
    () => normalizeExecutionPlanVersionList(asObject(asObject(draft?.bpmn_meta).execution_plans)),
    [draft?.bpmn_meta],
  );
  const executionPlanNodeTypeById = useMemo(() => {
    const out = {};
    asArray(draft?.nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      out[nodeId] = toText(node?.type) || null;
    });
    return out;
  }, [draft?.nodes]);
  const executionPlanSource = useMemo(() => {
    const interview = asObject(draft?.interview);
    const debug = asObject(interview?.report_build_debug);
    const highlightedTier = normalizePathTier(pathHighlightTier);
    const highlightedSeq = normalizePathSequenceKey(pathHighlightSequenceKey);
    const useHighlightScope = !!pathHighlightEnabled && !!(highlightedTier || highlightedSeq);
    const debugRouteSteps = normalizeDebugRouteSteps(debug?.route_steps || debug?.routeSteps);
    const routeSteps = debugRouteSteps.length
      ? debugRouteSteps
      : asArray(buildRouteStepsFromInterviewPathSpec(interview));
    const sourceSteps = routeSteps.length
      ? routeSteps
      : asArray(draft?.nodes).map((nodeRaw, idx) => {
        const node = asObject(nodeRaw);
        const workSec = Number(
          node?.step_time_sec
          ?? node?.stepTimeSec
          ?? node?.duration_sec
          ?? node?.durationSec
          ?? 0,
        );
        return {
          order_index: idx + 1,
          step_id: toText(node?.id) || `node_step_${idx + 1}`,
          title: toText(node?.name || node?.title || node?.id) || `Step ${idx + 1}`,
          bpmn_ref: toText(node?.id),
          lane_name: toText(node?.laneName || node?.role || node?.area),
          work_duration_sec: Number.isFinite(workSec) && workSec >= 0 ? Math.round(workSec) : 0,
          wait_duration_sec: 0,
        };
      });
    const readStepBpmnId = (stepRaw) => toText(
      asObject(stepRaw)?.bpmn_ref
      || asObject(stepRaw)?.bpmnRef
      || asObject(stepRaw)?.node_bind_id
      || asObject(stepRaw)?.nodeBindId
      || asObject(stepRaw)?.node_id
      || asObject(stepRaw)?.nodeId,
    );
    let filteredSteps = sourceSteps;
    if (useHighlightScope && highlightedTier) {
      const scoped = sourceSteps.filter((stepRaw) => {
        const bpmnId = readStepBpmnId(stepRaw);
        if (!bpmnId) return false;
        const nodeMeta = asObject(nodePathMetaMap[bpmnId]);
        const paths = asArray(nodeMeta?.paths)
          .map((item) => normalizePathTier(item))
          .filter(Boolean);
        if (!paths.includes(highlightedTier)) return false;
        if (!highlightedSeq) return true;
        const seq = normalizePathSequenceKey(nodeMeta?.sequence_key || nodeMeta?.sequenceKey);
        return seq === highlightedSeq;
      });
      if (scoped.length > 0) filteredSteps = scoped;
    }
    const debugPathId = toText(debug?.path_id_used);
    const pathId = toText(
      useHighlightScope
        ? (highlightedSeq || highlightedTier || debugPathId || "primary")
        : (debugPathId || highlightedSeq || highlightedTier || "primary"),
    );
    let scenarioLabel = toText(debug?.selectedScenarioLabel);
    if (!scenarioLabel && useHighlightScope && highlightedTier) {
      scenarioLabel = highlightedSeq ? `${highlightedTier} (${highlightedSeq})` : `${highlightedTier} Ideal`;
    }
    if (!scenarioLabel) scenarioLabel = highlightedTier ? `${highlightedTier} Ideal` : "P0 Ideal";
    return {
      pathId,
      scenarioLabel,
      steps: filteredSteps,
      source: useHighlightScope
        ? "diagram_path_highlight"
        : (debugRouteSteps.length ? "report_build_debug_route" : "interview_path_spec"),
    };
  }, [
    draft?.interview,
    draft?.nodes,
    nodePathMetaMap,
    pathHighlightEnabled,
    pathHighlightTier,
    pathHighlightSequenceKey,
  ]);
  const canExportExecutionPlan = asArray(executionPlanSource?.steps).length > 0;
  const playbackRouteDecisionByNodeId = useMemo(
    () => buildRouteDecisionByNodeId(asArray(executionPlanSource?.steps)),
    [executionPlanSource?.steps],
  );
  const playbackSpeedValue = Number(playbackSpeed || 1);
  const pathHighlightCatalog = useMemo(() => {
    const tiers = {
      P0: { id: "P0", nodes: 0, flows: 0, sequenceKeys: [] },
      P1: { id: "P1", nodes: 0, flows: 0, sequenceKeys: [] },
      P2: { id: "P2", nodes: 0, flows: 0, sequenceKeys: [] },
    };
    const seqByTier = {
      P0: new Set(),
      P1: new Set(),
      P2: new Set(),
    };
    Object.values(nodePathMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const sequenceKey = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      asArray(entry?.paths).forEach((tierRaw) => {
        const tier = normalizePathTier(tierRaw);
        if (!tier || !tiers[tier]) return;
        tiers[tier].nodes += 1;
        if (sequenceKey) seqByTier[tier].add(sequenceKey);
      });
    });
    Object.values(flowTierMetaMap).forEach((entryRaw) => {
      const tier = normalizePathTier(asObject(entryRaw)?.tier);
      if (!tier || !tiers[tier]) return;
      tiers[tier].flows += 1;
    });
    ["P0", "P1", "P2"].forEach((tier) => {
      tiers[tier].sequenceKeys = Array.from(seqByTier[tier]).sort((a, b) => a.localeCompare(b, "ru"));
    });
    return tiers;
  }, [nodePathMetaMap, flowTierMetaMap]);
  const availablePathTiers = useMemo(
    () => ["P0", "P1", "P2"].filter((tier) => {
      const row = asObject(pathHighlightCatalog[tier]);
      return Number(row?.nodes || 0) > 0 || Number(row?.flows || 0) > 0;
    }),
    [pathHighlightCatalog],
  );
  const availableSequenceKeysForTier = useMemo(
    () => asArray(asObject(pathHighlightCatalog[pathHighlightTier]).sequenceKeys),
    [pathHighlightCatalog, pathHighlightTier],
  );
  const playbackActiveScenarioFallback = useMemo(() => {
    const debug = asObject(asObject(draft?.interview)?.report_build_debug);
    return {
      tier: normalizePathTier(debug?.scenario_tier || pathHighlightTier || "P0") || "P0",
      sequenceKey: normalizePathSequenceKey(debug?.sequence_key || pathHighlightSequenceKey),
      label: toText(debug?.selectedScenarioLabel || executionPlanSource?.scenarioLabel || "Active scenario"),
    };
  }, [draft?.interview, pathHighlightTier, pathHighlightSequenceKey, executionPlanSource?.scenarioLabel]);
  const playbackScenarioOptions = useMemo(() => {
    const out = [
      {
        key: "active",
        label: `Active: ${toText(playbackActiveScenarioFallback?.label) || "Scenario"}`,
        tier: normalizePathTier(playbackActiveScenarioFallback?.tier),
        sequenceKey: normalizePathSequenceKey(playbackActiveScenarioFallback?.sequenceKey),
      },
    ];
    ["P0", "P1", "P2"].forEach((tier) => {
      const row = asObject(pathHighlightCatalog[tier]);
      const sequences = asArray(row?.sequenceKeys);
      if (!sequences.length && (Number(row?.nodes || 0) > 0 || Number(row?.flows || 0) > 0)) {
        out.push({
          key: buildPlaybackScenarioKey(tier, ""),
          label: `${tier} (all)`,
          tier,
          sequenceKey: "",
        });
        return;
      }
      sequences.forEach((sequenceKey) => {
        out.push({
          key: buildPlaybackScenarioKey(tier, sequenceKey),
          label: `${tier} · ${sequenceKey}`,
          tier,
          sequenceKey,
        });
      });
    });
    const dedupe = {};
    out.forEach((itemRaw) => {
      const item = asObject(itemRaw);
      const key = toText(item?.key);
      if (!key || dedupe[key]) return;
      dedupe[key] = {
        key,
        label: toText(item?.label || key),
        tier: normalizePathTier(item?.tier),
        sequenceKey: normalizePathSequenceKey(item?.sequenceKey),
      };
    });
    return Object.values(dedupe);
  }, [pathHighlightCatalog, playbackActiveScenarioFallback]);
  const playbackScenarioSpec = useMemo(() => parsePlaybackScenarioKey(
    playbackScenarioKey,
    playbackActiveScenarioFallback,
  ), [playbackScenarioKey, playbackActiveScenarioFallback]);
  const playbackScenarioLabel = useMemo(() => {
    const row = playbackScenarioOptions.find((item) => toText(item?.key) === toText(playbackScenarioKey));
    return toText(row?.label || playbackActiveScenarioFallback?.label || "Scenario");
  }, [playbackScenarioOptions, playbackScenarioKey, playbackActiveScenarioFallback]);
  useEffect(() => {
    const options = playbackScenarioOptions.map((item) => toText(item?.key)).filter(Boolean);
    if (!options.length) {
      if (playbackScenarioKey !== "active") setPlaybackScenarioKey("active");
      return;
    }
    if (options.includes(toText(playbackScenarioKey))) return;
    setPlaybackScenarioKey(options[0]);
  }, [playbackScenarioOptions, playbackScenarioKey]);
  const {
    playbackOverlayClickGuardRef,
    playbackIsPlaying,
    setPlaybackIsPlaying,
    playbackFrames,
    playbackGatewayPending,
    playbackGraphError,
    playbackIndex,
    playbackTotal,
    playbackCanRun,
    playbackIndexClamped,
    playbackCurrentEvent,
    playbackHighlightedBpmnIds,
    markPlaybackOverlayInteraction,
    handlePlaybackGatewayDecision,
    handlePlaybackPrev,
    handlePlaybackNext,
    handlePlaybackReset,
    handlePlaybackTogglePlay,
  } = usePlaybackController({
    sid,
    tab,
    draftBpmnXml: draft?.bpmn_xml,
    diagramActionPlaybackOpen,
    bpmnRef,
    playbackScenarioSpec,
    playbackScenarioKey,
    playbackRouteDecisionByNodeId,
    flowTierMetaMap,
    nodePathMetaMap,
    playbackManualAtGateway,
    playbackAutoCamera,
    playbackSpeedValue,
    playbackScenarioLabel,
    executionPlanPathId: executionPlanSource?.pathId,
  });
  const applyHybridV2Delete = useCallback((idsRaw) => {
    const prev = normalizeHybridV2Doc(hybridV2DocRef.current);
    const ids = asArray(idsRaw).map((row) => toText(row)).filter(Boolean);
    if (!ids.length) return false;
    const layerById = {};
    asArray(prev.layers).forEach((layerRaw) => {
      const layer = asObject(layerRaw);
      const layerId = toText(layer.id);
      if (layerId) layerById[layerId] = layer;
    });
    const blockedLockedIds = ids.filter((id) => {
      const element = asObject(asArray(prev.elements).find((rowRaw) => toText(asObject(rowRaw).id) === id));
      if (element.id) return asObject(layerById[toText(element.layer_id)]).locked === true;
      const edge = asObject(asArray(prev.edges).find((rowRaw) => toText(asObject(rowRaw).id) === id));
      if (edge.id) return asObject(layerById[toText(edge.layer_id)]).locked === true;
      return false;
    });
    if (blockedLockedIds.length) {
      setInfoMsg(`Удаление недоступно: слой заблокирован (${blockedLockedIds.join(", ")}).`);
      setGenErr("");
      return false;
    }
    const result = deleteHybridIds(prev, idsRaw);
    const next = normalizeHybridV2Doc(result.nextHybridV2);
    const changed = docToComparableJson(prev) !== docToComparableJson(next);
    if (!changed) {
      setInfoMsg("Нечего удалять: элемент не найден или уже удалён.");
      setGenErr("");
      return false;
    }
    hybridV2DocRef.current = next;
    setHybridV2Doc(next);
    markPlaybackOverlayInteraction({
      stage: "hybrid_v2_delete_item",
      count: Number(asArray(result.deleted.elements).length || 0) + Number(asArray(result.deleted.edges).length || 0),
      cleanedBindingsCount: Number(result.cleanedBindingsCount || 0),
    });
    setHybridV2BindPickMode(false);
    void persistHybridV2Doc(next, { source: "hybrid_v2_delete_item" });
    return changed;
  }, [markPlaybackOverlayInteraction, persistHybridV2Doc, setGenErr, setInfoMsg]);
  const hybridTools = useHybridToolsController({
    hybridDoc: hybridV2Doc,
    setHybridDoc: setHybridV2Doc,
    hybridDocRef: hybridV2DocRef,
    hybridVisible,
    modeEffective: hybridModeEffective,
    uiLocked: hybridUiPrefs.lock,
    hybridViewportMatrix,
    clientToDiagram,
    overlayRect: overlayContainerRect,
    persistHybridV2Doc,
    sid,
    markPlaybackOverlayInteraction,
    bpmnRef,
    setBindPickMode: setHybridV2BindPickMode,
    setGenErr,
    setInfoMsg,
    downloadTextFile,
  });
  const hybridSelection = useHybridSelectionController({
    enabled: tab === "diagram" && hybridVisible,
    modeEffective: hybridModeEffective,
    uiLocked: hybridUiPrefs.lock,
    overlayRect: overlayContainerRect,
    renderable: hybridTools.renderable,
    docLive: hybridTools.docLive,
    isEditableTarget,
    onDeleteIds: applyHybridV2Delete,
    onRequestEditSelected: hybridTools.openTextEditor,
  });
  const hybridV2DocLive = hybridTools.docLive;
  const hybridV2LayerById = hybridTools.layerById;
  const hybridV2BindingByHybridId = hybridTools.bindingByHybridId;
  const hybridV2Renderable = hybridTools.renderable;
  const hybridV2TotalCount = hybridTools.totalCount;
  const hybridV2HiddenCount = hybridTools.hiddenCount;
  const hybridV2ToolState = hybridTools.toolState;
  const hybridV2ActiveId = hybridSelection.primarySelectedId;
  const hybridV2SelectedIds = hybridSelection.selectedIds;
  const hybridV2SelectedIdSet = hybridSelection.selectedIdSet;
  const hybridV2ImportNotice = hybridTools.importNotice;
  const setHybridV2ActiveId = hybridSelection.selectOnly;
  const deleteSelectedHybridIds = hybridSelection.deleteSelected;
  const hybridTotalCount = Math.max(Number(hybridLayerCounts.total || 0), hybridV2TotalCount);
  const setHybridV2Tool = hybridTools.setTool;
  const hybridToolsUiState = useMemo(() => ({
    visible: hybridVisible,
    mode: hybridModeEffective,
    tool: hybridV2ToolState,
  }), [hybridModeEffective, hybridV2ToolState, hybridVisible]);
  const drawioUiState = useMemo(() => normalizeDrawioMeta(drawioMeta), [drawioMeta]);
  const setHybridToolsMode = useCallback((modeRaw) => {
    const nextState = applyHybridPaletteModeIntent(hybridToolsUiState, modeRaw);
    showHybridLayer();
    setHybridLayerMode(nextState.mode);
  }, [hybridToolsUiState, setHybridLayerMode, showHybridLayer]);
  const selectHybridPaletteTool = useCallback((toolRaw) => {
    const nextState = applyHybridPaletteToolIntent(hybridToolsUiState, toolRaw);
    showHybridLayer();
    if (nextState.mode === "edit") {
      setHybridLayerMode("edit", {
        skipV2Seed: nextState.tool !== "select",
        skipLegacySeed: nextState.tool !== "select",
      });
    }
    setHybridV2Tool(nextState.tool);
  }, [hybridToolsUiState, setHybridLayerMode, setHybridV2Tool, showHybridLayer]);
  const bindActiveHybridV2ToBpmn = useCallback((targetBpmnIdRaw, hybridIdRaw = "") => {
    hybridTools.bindHybridToBpmn(targetBpmnIdRaw, hybridIdRaw || hybridSelection.primarySelectedId);
  }, [hybridSelection.primarySelectedId, hybridTools]);
  const goToActiveHybridBinding = useCallback(() => {
    hybridTools.goToHybridBinding(hybridSelection.primarySelectedId);
  }, [hybridSelection.primarySelectedId, hybridTools]);
  const exportHybridV2Drawio = hybridTools.exportDrawio;
  const handleHybridV2ImportFile = hybridTools.importFile;
  const handleHybridV2ElementPointerDown = useCallback((event, elementIdRaw) => {
    hybridTools.onElementPointerDown(event, elementIdRaw, hybridSelection);
  }, [hybridSelection, hybridTools]);
  const handleHybridV2ResizeHandlePointerDown = useCallback((event, elementIdRaw, handleRaw) => {
    hybridTools.onResizeHandlePointerDown(event, elementIdRaw, handleRaw, hybridSelection);
  }, [hybridSelection, hybridTools]);
  const handleHybridV2OverlayPointerDown = useCallback((event) => {
    hybridTools.onOverlayPointerDown(event, hybridSelection);
  }, [hybridSelection, hybridTools]);
  const handleHybridV2OverlayContextMenu = useCallback((event) => {
    hybridTools.onOverlayContextMenu(event, hybridSelection.hitTestAtClientPoint);
  }, [hybridSelection.hitTestAtClientPoint, hybridTools]);
  const handleHybridV2ElementContextMenu = useCallback((event, elementIdRaw) => {
    if (!hybridV2SelectedIdSet.has(toText(elementIdRaw))) {
      hybridSelection.selectOnly(elementIdRaw);
    }
    hybridTools.onElementContextMenu(event, elementIdRaw);
  }, [hybridSelection, hybridTools, hybridV2SelectedIdSet]);
  const handleHybridV2ElementDoubleClick = useCallback((event, elementIdRaw) => {
    hybridTools.onElementDoubleClick(event, elementIdRaw, hybridSelection);
  }, [hybridSelection, hybridTools]);
  const deleteLegacyHybridMarkers = useCallback((elementIdsRaw, source = "hybrid_legacy_delete") => {
    const elementIds = Array.from(new Set(asArray(elementIdsRaw).map((row) => toText(row)).filter(Boolean)));
    if (!elementIds.length) return false;
    const boundHybridIds = new Set();
    elementIds.forEach((elementId) => {
      asArray(hybridTools.bindingByBpmnId[elementId]).forEach((bindingRaw) => {
        const binding = asObject(bindingRaw);
        const hybridId = toText(binding.hybrid_id || binding.hybridId);
        if (hybridId) boundHybridIds.add(hybridId);
      });
    });
    let nextMap = null;
    let removedCount = 0;
    setHybridLayerByElementId((prevRaw) => {
      const prev = normalizeHybridLayerMap(prevRaw);
      const next = {};
      Object.keys(prev).forEach((elementIdRaw) => {
        const elementId = toText(elementIdRaw);
        if (!elementId) return;
        if (elementIds.includes(elementId)) {
          removedCount += 1;
          return;
        }
        next[elementId] = asObject(prev[elementId]);
      });
      hybridLayerMapRef.current = next;
      nextMap = next;
      return next;
    });
    if (boundHybridIds.size) {
      applyHybridV2Delete(Array.from(boundHybridIds));
    }
    if (nextMap) {
      window.setTimeout(() => {
        void persistHybridLayerMap(nextMap, { source });
      }, 0);
    }
    if (elementIds.includes(toText(hybridLayerActiveElementId))) {
      setHybridLayerActiveElementId("");
    }
    const changed = removedCount > 0 || boundHybridIds.size > 0;
    if (!changed) {
      setInfoMsg("Нечего удалять: legacy-метка не найдена.");
      setGenErr("");
      return false;
    }
    markPlaybackOverlayInteraction({
      stage: source,
      legacyCount: removedCount,
      hybridCount: boundHybridIds.size,
    });
    return true;
  }, [
    applyHybridV2Delete,
    hybridLayerActiveElementId,
    hybridTools.bindingByBpmnId,
    markPlaybackOverlayInteraction,
    persistHybridLayerMap,
    setGenErr,
    setInfoMsg,
  ]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const e2eApi = {
      selectTool(toolRaw) {
        selectHybridPaletteTool(toolRaw);
      },
      ensureEditVisible() {
        showHybridLayer();
        setHybridLayerMode("edit", {
          skipV2Seed: true,
          skipLegacySeed: true,
        });
      },
      createElementAt(pointRaw, typeRaw = "rect") {
        showHybridLayer();
        setHybridLayerMode("edit", {
          skipV2Seed: true,
          skipLegacySeed: true,
        });
        const nextType = toText(typeRaw).toLowerCase() || "rect";
        setHybridV2Tool(nextType);
        return hybridTools.createElementAt(pointRaw, nextType);
      },
      readDoc() {
        return normalizeHybridV2Doc(hybridV2DocRef.current);
      },
    };
    window.__FPC_E2E_HYBRID__ = e2eApi;
    return () => {
      if (window.__FPC_E2E_HYBRID__ === e2eApi) {
        window.__FPC_E2E_HYBRID__ = null;
      }
    };
  }, [hybridTools, selectHybridPaletteTool, setHybridLayerMode, setHybridV2Tool, showHybridLayer]);
  const hybridV2PlaybackHighlightedIds = useMemo(() => {
    const byBpmnId = hybridTools.bindingByBpmnId;
    const out = new Set();
    playbackHighlightedBpmnIds.forEach((bpmnId) => {
      asArray(byBpmnId[bpmnId]).forEach((bindingRaw) => {
        const binding = asObject(bindingRaw);
        const hybridId = toText(binding.hybrid_id || binding.hybridId);
        if (hybridId) out.add(hybridId);
      });
    });
    return out;
  }, [hybridTools.bindingByBpmnId, playbackHighlightedBpmnIds]);
  useEffect(() => {
    if (tab !== "diagram" || !hybridVisible) return;
    const activeIds = Array.from(playbackHighlightedBpmnIds);
    if (!activeIds.length) return;
    const nextHybridId = activeIds.find((bpmnId) => !!asObject(hybridLayerMapLive)[toText(bpmnId)]);
    if (!nextHybridId) return;
    setHybridLayerActiveElementId((prevRaw) => {
      const prev = toText(prevRaw);
      return prev === nextHybridId ? prev : nextHybridId;
    });
  }, [tab, hybridVisible, playbackHighlightedBpmnIds, hybridLayerMapLive]);
  useDiagramActionPopovers({
    toolbarMenuOpen,
    setToolbarMenuOpen,
    diagramActionPathOpen,
    setDiagramActionPathOpen,
    diagramActionHybridToolsOpen,
    setDiagramActionHybridToolsOpen,
    diagramActionPlanOpen,
    setDiagramActionPlanOpen,
    diagramActionPlaybackOpen,
    setDiagramActionPlaybackOpen,
    diagramActionLayersOpen,
    setDiagramActionLayersOpen,
    diagramActionRobotMetaOpen,
    setDiagramActionRobotMetaOpen,
    robotMetaListOpen,
    setRobotMetaListOpen,
    setRobotMetaListSearch,
    diagramActionQualityOpen,
    setDiagramActionQualityOpen,
    diagramActionOverflowOpen,
    setDiagramActionOverflowOpen,
    toolbarMenuRef,
    toolbarMenuButtonRef,
    diagramActionBarRef,
    diagramPathPopoverRef,
    diagramHybridToolsPopoverRef,
    diagramPlanPopoverRef,
    diagramPlaybackPopoverRef,
    diagramLayersPopoverRef,
    diagramRobotMetaPopoverRef,
    diagramRobotMetaListRef,
    diagramQualityPopoverRef,
    diagramOverflowPopoverRef,
    hybridLayerOverlayRef,
    playbackOverlayClickGuardRef,
    logPlaybackDebug,
    toText,
  });
  const aiGenerateGate = useMemo(
    () => getAiGenerateGate({
      hasSession,
      tab,
      selectedElementId,
      isLocal,
      aiQuestionsBusy,
    }),
    [hasSession, tab, selectedElementId, isLocal, aiQuestionsBusy],
  );
  const canGenerateAiQuestions = aiGenerateGate.canGenerate;
  const selectedInsertBetween = readInsertBetweenCandidate(selectedBpmnElement?.insertBetween);
  const canInsertBetween =
    !!hasSession
    && tab === "diagram"
    && !!selectedInsertBetween
    && selectedInsertBetween.available !== false
    && !!selectedInsertBetween.fromId
    && !!selectedInsertBetween.toId;
  const notesByElementMap = useMemo(
    () => normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId),
    [draft?.notes_by_element, draft?.notesByElementId],
  );
  const aiQuestionsByElement = useMemo(
    () => normalizeAiQuestionsByElementMap(draft?.interview?.ai_questions_by_element || draft?.interview?.aiQuestionsByElementId),
    [draft?.interview?.ai_questions_by_element, draft?.interview?.aiQuestionsByElementId],
  );
  const coverageNodes = useMemo(() => {
    const direct = asArray(draft?.nodes);
    if (direct.length) return direct;
    const xml = String(draft?.bpmn_xml || "").trim();
    if (!xml) return [];
    const parsed = parseBpmnToSessionGraph(xml);
    return asArray(parsed?.nodes);
  }, [draft?.nodes, draft?.bpmn_xml]);
  const coverageMatrix = useMemo(
    () => buildCoverageMatrix({
      nodes: coverageNodes,
      notesByElement: notesByElementMap,
      aiQuestionsByElement,
    }),
    [coverageNodes, notesByElementMap, aiQuestionsByElement],
  );
  const coverageRowsAll = useMemo(
    () => asArray(coverageMatrix?.rows),
    [coverageMatrix],
  );
  const coverageRows = useMemo(
    () => coverageRowsAll.filter((row) => Number(row?.score || 0) > 0),
    [coverageRowsAll],
  );
  const coverageById = useMemo(() => {
    const map = {};
    coverageRowsAll.forEach((row) => {
      const id = toNodeId(row?.id);
      if (!id) return;
      map[id] = row;
    });
    return map;
  }, [coverageRowsAll]);
  const qualityIssueNodeIds = useMemo(() => {
    const set = new Set();
    asArray(qualityHintsRaw).forEach((issue) => {
      const id = toNodeId(issue?.nodeId);
      if (!id) return;
      set.add(id);
    });
    return set;
  }, [qualityHintsRaw]);
  const coverageMinimapRows = useMemo(
    () => coverageRowsAll
      .filter((row) => {
        const id = toNodeId(row?.id);
        if (!id) return false;
        if (Number(row?.score || 0) > 0) return true;
        return qualityIssueNodeIds.has(id);
      })
      .map((row) => {
        const id = toNodeId(row?.id);
        return {
          ...row,
          id,
          readiness: coverageReadinessPercent(row),
          hasQualityIssue: !!(id && qualityIssueNodeIds.has(id)),
        };
      }),
    [coverageRowsAll, qualityIssueNodeIds],
  );
  const coverageHints = useMemo(() => (
    isCoverageMode
      ? coverageRowsAll.map((row) => {
        const readiness = coverageReadinessPercent(row);
        const score = Number(row?.score || 0);
        const severity = score >= 2 ? "high" : (score >= 1 ? "medium" : "low");
        const reasons = [];
        if (row?.missingNotes) reasons.push("нет заметок");
        if (row?.missingAiQuestions) reasons.push("нет AI-вопросов");
        if (row?.missingDurationQuality) reasons.push("нет duration/quality");
        return {
          nodeId: toNodeId(row?.id),
          title: String(row?.title || row?.id || "").trim(),
          severity,
          reasons,
          markerClass: coverageMarkerClass(row),
          hideTag: true,
          aiHint: `READY ${readiness}%`,
          coverageScore: score,
          coverageReadiness: readiness,
        };
      }).filter((item) => item.nodeId)
      : []
  ), [isCoverageMode, coverageRowsAll]);
  const reportPathStopHints = useMemo(() => {
    const debug = asObject(draft?.interview?.report_build_debug);
    const stopReason = String(debug?.stop_reason || "").trim().toUpperCase();
    const stopNodeId = toNodeId(debug?.stop_at_bpmn_id);
    if (!stopNodeId || !stopReason || stopReason === "OK_COMPLETE") return [];
    return [{
      nodeId: stopNodeId,
      title: `Report path stopped here: ${stopReason}`,
      severity: "high",
      markerClass: "fpcReportStopMarker",
      aiHint: "!",
      reasons: [
        `path=${String(debug?.path_id_used || "—").trim() || "—"}`,
        `steps=${Number(debug?.steps_count || 0)}`,
      ],
    }];
  }, [draft?.interview?.report_build_debug]);
  const reportPathFlowConflictHints = useMemo(() => {
    const debug = asObject(draft?.interview?.report_build_debug);
    const stopReason = String(debug?.stop_reason || "").trim().toUpperCase();
    const stopNodeId = toNodeId(debug?.stop_at_bpmn_id);
    const activeSeq = String(debug?.path_id_used || "").trim();
    if (stopReason !== "FILTERED_OUT" || !stopNodeId || !activeSeq) return [];
    const nodePathMeta = asObject(asObject(draft?.bpmn_meta).node_path_meta);
    const outgoing = parseSequenceFlowsFromXml(draft?.bpmn_xml).filter((flow) => toNodeId(flow?.sourceId) === stopNodeId);
    if (!outgoing.length) return [];
    return outgoing.map((flow) => {
      const targetNodeId = toNodeId(flow?.targetId);
      const targetMeta = asObject(nodePathMeta[targetNodeId]);
      const targetSeq = String(targetMeta?.sequence_key || "").trim();
      const paths = asArray(targetMeta?.paths).map((item) => String(item || "").trim().toUpperCase());
      const hasMeta = !!targetNodeId && !!Object.keys(targetMeta).length;
      let kind = "MISS";
      if (hasMeta) kind = targetSeq === activeSeq ? "OK" : "OUT";
      const actionHint = kind === "OK"
        ? "action=ok"
        : (kind === "OUT"
          ? `action=move_target_sequence_to_${activeSeq}`
          : "action=assign_node_path_meta");
      return {
        elementIds: [String(flow?.id || "").trim()].filter(Boolean),
        title: `Path flow ${kind}: ${String(flow?.id || "").trim()}`,
        severity: kind === "OK" ? "low" : (kind === "OUT" ? "medium" : "high"),
        markerClass: kind === "OK"
          ? "fpcReportPathFlowOk"
          : (kind === "OUT" ? "fpcReportPathFlowOut" : "fpcReportPathFlowMiss"),
        aiHint: kind,
        reasons: [
          `active_seq=${activeSeq}`,
          `target=${targetNodeId || "—"}`,
          `target_seq=${targetSeq || "none"}`,
          `target_paths=${paths.join(",") || "none"}`,
          actionHint,
        ],
      };
    });
  }, [draft?.interview?.report_build_debug, draft?.bpmn_xml, draft?.bpmn_meta]);
  const diagramDodSnapshot = useMemo(() => {
    if (!hasSession) return null;
    try {
      return computeDodSnapshotFromDraft({
        draft,
        bpmnXml: draft?.bpmn_xml,
        qualityReport: lintResult,
      });
    } catch {
      return null;
    }
  }, [hasSession, draft, lintResult]);
  const qualityOverlayCatalog = useMemo(() => {
    const quality = asObject(diagramDodSnapshot?.quality);
    const bpmnNodesById = {};
    asArray(diagramDodSnapshot?.bpmn_nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      bpmnNodesById[nodeId] = {
        id: nodeId,
        title: toText(node?.name || node?.title) || nodeId,
        type: toText(node?.type),
      };
    });
    const resolveItem = (nodeIdRaw, extra = {}) => {
      const nodeId = toNodeId(nodeIdRaw);
      if (!nodeId) return null;
      const fromBpmn = asObject(bpmnNodesById[nodeId]);
      const fromCoverage = asObject(coverageById[nodeId]);
      return {
        nodeId,
        title: toText(extra?.title || fromCoverage?.title || fromBpmn?.title || nodeId) || nodeId,
        type: toText(extra?.type || fromCoverage?.type || fromBpmn?.type),
        detail: toText(extra?.detail),
      };
    };
    const orphanItems = toArray(quality?.orphan_bpmn_nodes)
      .map((nodeId) => resolveItem(nodeId, { detail: "Недостижим от startEvent." }))
      .filter(Boolean);
    const deadEndItems = toArray(quality?.dead_end_bpmn_nodes)
      .map((nodeId) => resolveItem(nodeId, { detail: "Обрывает процесс (нет исходящего flow)." }))
      .filter(Boolean);
    const gatewayItems = toArray(quality?.gateway_unjoined)
      .map((nodeId) => resolveItem(nodeId, { detail: "Gateway split без join." }))
      .filter(Boolean);

    const linkItemsMap = {};
    toArray(quality?.link_integrity).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const integrity = toText(row?.integrity).toLowerCase();
      if (!(integrity === "error" || integrity === "warn")) return;
      const detail = toText(row?.details) || `Link integrity: ${integrity}`;
      const allIds = [...toArray(row?.throw_ids), ...toArray(row?.catch_ids)];
      allIds.forEach((nodeIdRaw) => {
        const item = resolveItem(nodeIdRaw, { detail });
        if (!item) return;
        if (linkItemsMap[item.nodeId]) return;
        linkItemsMap[item.nodeId] = item;
      });
    });
    const linkItems = Object.values(linkItemsMap);

    const missingDurationItems = coverageRowsAll
      .filter((row) => !!row?.missingDurationQuality)
      .map((row) => resolveItem(row?.id, {
        title: toText(row?.title || row?.id),
        type: toText(row?.type),
        detail: "Нет work/wait или duration/quality.",
      }))
      .filter(Boolean);

    const missingNotesItems = coverageRowsAll
      .filter((row) => !!row?.missingNotes)
      .map((row) => resolveItem(row?.id, {
        title: toText(row?.title || row?.id),
        type: toText(row?.type),
        detail: "Нет заметок по узлу.",
      }))
      .filter(Boolean);

    const debug = asObject(draft?.interview?.report_build_debug);
    const stopReason = toText(debug?.stop_reason).toUpperCase();
    const stopNodeId = toNodeId(debug?.stop_at_bpmn_id);
    const routeTruncatedItems = (!stopNodeId || !stopReason || stopReason === "OK_COMPLETE")
      ? []
      : toArray([
        resolveItem(stopNodeId, {
          detail: `${stopReason} · path=${toText(debug?.path_id_used) || "—"} · steps=${Number(debug?.steps_count || 0)}`,
        }),
      ]).filter(Boolean);

    return {
      orphan: { key: "orphan", label: "Orphan / Unreachable", items: orphanItems },
      dead_end: { key: "dead_end", label: "Dead-end", items: deadEndItems },
      gateway: { key: "gateway", label: "Gateway split without join", items: gatewayItems },
      link_errors: { key: "link_errors", label: "Link event errors", items: linkItems },
      missing_duration: { key: "missing_duration", label: "Missing durations", items: missingDurationItems },
      missing_notes: { key: "missing_notes", label: "Missing notes", items: missingNotesItems },
      route_truncated: { key: "route_truncated", label: "Route truncated", items: routeTruncatedItems },
    };
  }, [diagramDodSnapshot, coverageById, coverageRowsAll, draft?.interview?.report_build_debug]);
  const pathHighlightHints = useMemo(() => {
    if (!pathHighlightEnabled) return [];
    const tier = normalizePathTier(pathHighlightTier);
    if (!tier) return [];
    const sequenceKey = normalizePathSequenceKey(pathHighlightSequenceKey);
    const hints = [];
    Object.values(nodePathMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const nodeId = toNodeId(entry?.nodeId || entryRaw?.nodeId);
      if (!nodeId) return;
      const paths = asArray(entry?.paths).map((item) => normalizePathTier(item));
      if (!paths.includes(tier)) return;
      const nodeSeq = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      if (sequenceKey && nodeSeq && nodeSeq !== sequenceKey) return;
      hints.push({
        nodeId,
        title: `Path ${tier}${sequenceKey ? ` · ${sequenceKey}` : ""}`,
        markerClass: "fpcPathHighlightNode",
        severity: "low",
        hideTag: true,
      });
    });
    Object.values(flowTierMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const flowId = toText(entry?.flowId || entryRaw?.flowId);
      if (!flowId) return;
      if (normalizePathTier(entry?.tier) !== tier) return;
      const flowSeq = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      if (sequenceKey && flowSeq && flowSeq !== sequenceKey) return;
      hints.push({
        elementIds: [flowId],
        title: `Path flow ${tier}`,
        markerClass: "fpcPathHighlightFlow",
        severity: "low",
        hideTag: true,
      });
    });
    return dedupeDiagramHints(hints);
  }, [pathHighlightEnabled, pathHighlightTier, pathHighlightSequenceKey, nodePathMetaMap, flowTierMetaMap]);
  const qualityOverlayHints = useMemo(() => {
    const markerByKey = {
      orphan: "fpcQualityProblem",
      dead_end: "fpcQualityProblem",
      gateway: "fpcQualityProblem",
      link_errors: "fpcQualityProblem",
      missing_duration: "fpcCoverageRisk",
      missing_notes: "fpcCoverageWarn",
      route_truncated: "fpcReportStopMarker",
    };
    const hints = [];
    Object.entries(asObject(qualityOverlayFilters)).forEach(([key, enabled]) => {
      if (!enabled) return;
      const category = asObject(qualityOverlayCatalog[key]);
      const markerClass = toText(markerByKey[key] || "fpcQualityProblem");
      toArray(category?.items).forEach((itemRaw) => {
        const item = asObject(itemRaw);
        const nodeId = toNodeId(item?.nodeId);
        if (!nodeId) return;
        hints.push({
          nodeId,
          title: toText(item?.title || nodeId),
          reasons: toArray([toText(item?.detail)]).filter(Boolean),
          markerClass,
          severity: key === "route_truncated" ? "high" : "medium",
          hideTag: key !== "route_truncated",
          aiHint: key === "route_truncated" ? "!" : "",
        });
      });
    });
    return dedupeDiagramHints(hints);
  }, [qualityOverlayFilters, qualityOverlayCatalog]);
  const diagramHints = useMemo(() => {
    const base = isQualityMode ? qualityHints : (isCoverageMode ? coverageHints : []);
    return dedupeDiagramHints([
      ...asArray(base),
      ...asArray(pathHighlightHints),
      ...asArray(qualityOverlayHints),
      ...asArray(reportPathStopHints),
      ...asArray(reportPathFlowConflictHints),
    ]);
  }, [
    isQualityMode,
    isCoverageMode,
    qualityHints,
    coverageHints,
    pathHighlightHints,
    qualityOverlayHints,
    reportPathStopHints,
    reportPathFlowConflictHints,
  ]);
  const qualityNodeTitleById = useMemo(() => {
    const map = {};
    asArray(coverageNodes).forEach((node) => {
      const id = toNodeId(node?.id);
      if (!id || map[id]) return;
      const title = String(node?.title || node?.name || "").trim();
      if (title) map[id] = title;
    });
    asArray(draft?.interview?.steps).forEach((step) => {
      const id = toNodeId(step?.node_id || step?.nodeId);
      if (!id || map[id]) return;
      const title = String(step?.action || step?.title || step?.name || "").trim();
      if (title) map[id] = title;
    });
    asArray(qualityHintsRaw).forEach((issue) => {
      const id = toNodeId(issue?.nodeId);
      if (!id || map[id]) return;
      const title = String(issue?.title || "").trim();
      if (title && title !== id) map[id] = title;
    });
    return map;
  }, [coverageNodes, draft?.interview?.steps, qualityHintsRaw]);
  const coverageNodeMetaById = useMemo(() => {
    const map = {};
    asArray(coverageNodes).forEach((node) => {
      const id = toNodeId(node?.id);
      if (!id) return;
      map[id] = {
        id,
        title: String(node?.title || node?.name || id).trim() || id,
        lane: String(node?.actor_role || node?.laneName || node?.lane || "").trim(),
        type: String(node?.type || "").trim(),
      };
    });
    return map;
  }, [coverageNodes]);
  const qualityReasonsByNode = useMemo(() => {
    const map = {};
    asArray(qualityHintsRaw).forEach((issue) => {
      const nodeId = toNodeId(issue?.nodeId);
      if (!nodeId) return;
      const nodeTitle = String(
        qualityNodeTitleById[nodeId]
        || coverageById[nodeId]?.title
        || issue?.title
        || nodeId,
      ).trim();
      const ui = qualityIssueCopy(issue, nodeTitle);
      const reason = {
        id: `quality:${ui.ruleId}`,
        kind: "quality",
        text: `Ошибка качества: ${ui.short}`,
        detail: ui.fix,
      };
      if (!Array.isArray(map[nodeId])) map[nodeId] = [];
      if (!map[nodeId].some((it) => String(it?.id || "") === reason.id)) {
        map[nodeId].push(reason);
      }
    });
    return map;
  }, [qualityHintsRaw, qualityNodeTitleById, coverageById]);
  const attentionItemsRaw = useMemo(() => {
    const byNode = {};
    const ensureItem = (nodeId) => {
      const id = toNodeId(nodeId);
      if (!id) return null;
      if (!byNode[id]) {
        const row = coverageById[id];
        const meta = coverageNodeMetaById[id] || {};
        byNode[id] = {
          id,
          title: String(row?.title || meta?.title || qualityNodeTitleById[id] || id).trim() || id,
          lane: String(row?.lane || meta?.lane || "").trim(),
          type: String(row?.type || meta?.type || "").trim(),
          reasons: [],
          hasQuality: false,
          hasAiMissing: false,
          hasNotesMissing: false,
          hasDodMissing: false,
          priority: Number(row?.score || 0),
        };
      }
      return byNode[id];
    };

    coverageRowsAll.forEach((row) => {
      const item = ensureItem(row?.id);
      if (!item) return;
      const dodMissingCount = Number(!!row?.missingNotes) + Number(!!row?.missingAiQuestions) + Number(!!row?.missingDurationQuality);
      if (row?.missingAiQuestions) {
        item.hasAiMissing = true;
        item.reasons.push({ id: "ai_missing", kind: "ai", text: "Нет AI-вопросов" });
      }
      if (row?.missingNotes) {
        item.hasNotesMissing = true;
        item.reasons.push({ id: "notes_missing", kind: "notes", text: "Нет заметок" });
      }
      if (dodMissingCount > 0) {
        item.hasDodMissing = true;
        item.reasons.push({ id: "dod_missing", kind: "dod", text: `DoD: missing ${dodMissingCount}` });
      }
    });

    Object.entries(qualityReasonsByNode).forEach(([nodeId, reasons]) => {
      const item = ensureItem(nodeId);
      if (!item) return;
      item.hasQuality = true;
      item.priority = Math.max(item.priority, 10);
      asArray(reasons).forEach((reason) => {
        if (!item.reasons.some((it) => String(it?.id || "") === String(reason?.id || ""))) {
          item.reasons.push(reason);
        }
      });
    });

    return Object.values(byNode)
      .map((item) => ({
        ...item,
        reasons: asArray(item?.reasons).slice(0, 3),
      }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => {
        const qualityDelta = Number(!!b.hasQuality) - Number(!!a.hasQuality);
        if (qualityDelta !== 0) return qualityDelta;
        const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDelta !== 0) return priorityDelta;
        return String(a.title || "").localeCompare(String(b.title || ""), "ru");
      });
  }, [coverageRowsAll, coverageById, coverageNodeMetaById, qualityNodeTitleById, qualityReasonsByNode]);
  const attentionFilterKinds = useMemo(
    () => Object.entries(attentionFilters || {})
      .filter(([, enabled]) => !!enabled)
      .map(([kind]) => String(kind || "").trim()),
    [attentionFilters],
  );
  const attentionItems = useMemo(() => {
    if (!attentionFilterKinds.length) return attentionItemsRaw;
    return attentionItemsRaw.filter((item) => attentionFilterKinds.some((kind) => {
      if (kind === "quality") return !!item?.hasQuality;
      if (kind === "ai") return !!item?.hasAiMissing;
      if (kind === "notes") return !!item?.hasNotesMissing;
      return false;
    }));
  }, [attentionItemsRaw, attentionFilterKinds]);
  const qualityOverlayRows = useMemo(
    () => ([
      "orphan",
      "dead_end",
      "gateway",
      "link_errors",
      "missing_duration",
      "missing_notes",
      "route_truncated",
    ]).map((key) => {
      const category = asObject(qualityOverlayCatalog[key]);
      return {
        key,
        label: toText(category?.label || key) || key,
        count: Number(toArray(category?.items).length || 0),
        items: toArray(category?.items),
      };
    }),
    [qualityOverlayCatalog],
  );
  const activeQualityOverlayCount = useMemo(
    () => Object.values(asObject(qualityOverlayFilters)).filter(Boolean).length,
    [qualityOverlayFilters],
  );
  const qualityOverlayListItems = useMemo(() => {
    const listKey = toText(qualityOverlayListKey);
    if (!listKey) return [];
    const row = qualityOverlayRows.find((item) => item.key === listKey);
    const all = toArray(row?.items);
    if (!all.length) return [];
    const query = toText(qualityOverlaySearch).toLowerCase();
    const filtered = query
      ? all.filter((itemRaw) => {
        const item = asObject(itemRaw);
        return [
          toText(item?.title),
          toText(item?.nodeId),
          toText(item?.type),
          toText(item?.detail),
        ].some((part) => part.toLowerCase().includes(query));
      })
      : all;
    return filtered.slice(0, 200);
  }, [qualityOverlayRows, qualityOverlayListKey, qualityOverlaySearch]);
  const pathHighlightBadge = useMemo(() => {
    const tier = normalizePathTier(pathHighlightTier);
    if (!tier) return "Путь: —";
    const seq = normalizePathSequenceKey(pathHighlightSequenceKey);
    return seq ? `${tier} · ${seq}` : tier;
  }, [pathHighlightTier, pathHighlightSequenceKey]);
  const snapshotProjectId = String(draft?.project_id || draft?.projectId || activeProjectId || "").trim();
  const previewSnapshot = useMemo(
    () => asArray(versionsList).find((item) => String(item?.id || "") === String(previewSnapshotId || "")) || null,
    [versionsList, previewSnapshotId],
  );

  function formatSnapshotTs(ts) {
    const n = Number(ts || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    try {
      return new Date(n).toLocaleString("ru-RU");
    } catch {
      return String(n);
    }
  }

  function defaultCheckpointLabel(ts) {
    return `Checkpoint ${formatSnapshotTs(ts || Date.now())}`;
  }

  function snapshotLabel(item) {
    const explicit = String(item?.label || "").trim();
    if (explicit) return explicit;
    if (item?.pinned) return defaultCheckpointLabel(item?.ts);
    return "Без названия";
  }

  const snapshotById = useMemo(() => {
    const out = {};
    asArray(versionsList).forEach((item) => {
      const id = String(item?.id || "").trim();
      if (!id) return;
      out[id] = item;
    });
    return out;
  }, [versionsList]);

  const semanticDiffView = useMemo(() => {
    const baseId = String(diffBaseSnapshotId || "").trim();
    const targetId = String(diffTargetSnapshotId || "").trim();
    if (!baseId || !targetId) {
      return { ok: false, error: "Выберите две версии для сравнения.", summary: null, details: null };
    }
    if (baseId === targetId) {
      return { ok: false, error: "Выберите разные версии A и B.", summary: null, details: null };
    }
    const base = snapshotById[baseId];
    const target = snapshotById[targetId];
    if (!base || !target) {
      return { ok: false, error: "Одна из выбранных версий недоступна.", summary: null, details: null };
    }
    return buildSemanticBpmnDiff(String(base?.xml || ""), String(target?.xml || ""));
  }, [diffBaseSnapshotId, diffTargetSnapshotId, snapshotById]);

  const refreshSnapshotVersions = useCallback(async () => {
    if (!sid) {
      setVersionsList([]);
      setPreviewSnapshotId("");
      return;
    }
    const list = await listBpmnSnapshots({
      projectId: snapshotProjectId,
      sessionId: sid,
    });
    // eslint-disable-next-line no-console
    console.debug(
      `UI_VERSIONS_LOAD sid=${sid} key="${snapshotScopeKey(snapshotProjectId, sid)}" count=${asArray(list).length}`,
    );
    setVersionsList(asArray(list));
    setPreviewSnapshotId((prev) => {
      const exists = asArray(list).some((item) => String(item?.id || "") === String(prev || ""));
      if (exists) return prev;
      return asArray(list)[0]?.id || "";
    });
  }, [sid, snapshotProjectId]);

  async function openVersionsModal() {
    setVersionsOpen(true);
    setVersionsBusy(true);
    try {
      await refreshSnapshotVersions();
    } finally {
      setVersionsBusy(false);
    }
  }

  async function createManualSnapshot(options = {}) {
    if (!sid) return;
    setVersionsBusy(true);
    setGenErr("");
    setInfoMsg("");
    const persistBefore = Number(readPersistMark(sid)?.ts || 0);
    try {
      const prepared = await bpmnSync.resolveXmlForExport(tab);
      if (!prepared?.ok) {
        setGenErr(shortErr(prepared?.error || "Не удалось подготовить BPMN для ручной версии."));
        return;
      }
      const xml = String(prepared?.xml || draft?.bpmn_xml || "");
      if (!xml.trim()) {
        setGenErr("Нет BPMN для сохранения версии.");
        return;
      }
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_CLICK sid=${sid} action=manual key="${snapshotScopeKey(snapshotProjectId, sid)}" `
        + `hash=${fnv1aHex(xml)} len=${xml.length} rev=${Number(draft?.bpmn_xml_version || draft?.version || 0)} force=1`,
      );
      const created = await saveBpmnSnapshot({
        projectId: snapshotProjectId,
        sessionId: sid,
        xml,
        reason: "manual_checkpoint",
        label: String(options?.label || "").trim() || `manual_${Date.now()}`,
        rev: Number(draft?.bpmn_xml_version || draft?.version || 0),
        force: true,
      });
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_RESULT sid=${sid} action=manual ok=${created?.ok ? 1 : 0} saved=${created?.saved ? 1 : 0} `
        + `reason=${String(created?.decisionReason || created?.error || "-")} key="${snapshotScopeKey(snapshotProjectId, sid)}"`,
      );
      if (!created?.ok || !created?.saved) {
        if (created?.ok && created?.saved === false) {
          setInfoMsg("Нет нового сохранения схемы.");
          return;
        }
        setGenErr(shortErr(created?.error || "Не удалось создать ручную версию."));
        return;
      }
      const persistAfter = Number(readPersistMark(sid)?.ts || 0);
      const persistObserved = persistAfter > persistBefore;
      setInfoMsg(persistObserved ? "Ручная версия создана." : "Ручная версия создана (нет нового сохранения схемы).");
      await refreshSnapshotVersions();
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось создать ручную версию."));
    } finally {
      setVersionsBusy(false);
    }
  }

  async function restoreSnapshot(item) {
    const xml = String(item?.xml || "");
    if (!xml.trim()) {
      setGenErr("В выбранной версии нет XML.");
      return;
    }
    setVersionsBusy(true);
    setGenErr("");
    setInfoMsg("");
    try {
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_CLICK sid=${sid} action=restore key="${snapshotScopeKey(snapshotProjectId, sid)}" `
        + `hash=${fnv1aHex(xml)} len=${xml.length}`,
      );
      const imported = await bpmnSync.importXml(xml);
      if (!imported?.ok) {
        setGenErr(shortErr(imported?.error || "Не удалось восстановить версию."));
        return;
      }
      const restored = await saveBpmnSnapshot({
        projectId: snapshotProjectId,
        sessionId: sid,
        xml,
        reason: "manual_restore",
        rev: Number(draft?.bpmn_xml_version || draft?.version || 0),
      });
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_RESULT sid=${sid} action=restore ok=${restored?.ok ? 1 : 0} saved=${restored?.saved ? 1 : 0} `
        + `reason=${String(restored?.decisionReason || restored?.error || "-")} key="${snapshotScopeKey(snapshotProjectId, sid)}"`,
      );
      setTab("diagram");
      await Promise.resolve(bpmnRef.current?.fit?.());
      setInfoMsg(`Версия восстановлена (${formatSnapshotTs(item?.ts)}).`);
      await refreshSnapshotVersions();
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось восстановить версию."));
    } finally {
      setVersionsBusy(false);
    }
  }

  async function clearSnapshotHistory() {
    if (!sid) return;
    setVersionsBusy(true);
    try {
      const cleared = await clearBpmnSnapshots({
        projectId: snapshotProjectId,
        sessionId: sid,
      });
      if (!cleared?.ok) {
        setGenErr("Не удалось очистить историю версий.");
        return;
      }
      setVersionsList([]);
      setPreviewSnapshotId("");
      setInfoMsg("История версий очищена.");
    } finally {
      setVersionsBusy(false);
    }
  }

  async function updateSnapshotMeta(item, patch = {}) {
    if (!sid) return;
    const snapshotId = String(item?.id || "").trim();
    if (!snapshotId) return;
    setVersionsBusy(true);
    setGenErr("");
    setInfoMsg("");
    try {
      const patchHasPinned = Object.prototype.hasOwnProperty.call(patch, "pinned");
      const nextPinned = Object.prototype.hasOwnProperty.call(patch, "pinned")
        ? patch.pinned === true
        : item?.pinned === true;
      const requestedLabel = Object.prototype.hasOwnProperty.call(patch, "label")
        ? String(patch?.label || "").trim()
        : String(item?.label || "").trim();
      const nextLabel = nextPinned ? (requestedLabel || defaultCheckpointLabel(item?.ts)) : requestedLabel;
      const updated = await updateBpmnSnapshotMeta({
        projectId: snapshotProjectId,
        sessionId: sid,
        snapshotId,
        pinned: nextPinned,
        label: nextLabel,
      });
      if (!updated?.ok) {
        setGenErr(shortErr(updated?.error || "Не удалось обновить метаданные версии."));
        return;
      }
      await refreshSnapshotVersions();
      setInfoMsg(
        patchHasPinned
          ? (nextPinned ? "Версия закреплена." : "Версия откреплена.")
          : "Название версии обновлено.",
      );
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось обновить версию."));
    } finally {
      setVersionsBusy(false);
    }
  }

  async function togglePinSnapshot(item) {
    await updateSnapshotMeta(item, { pinned: !(item?.pinned === true) });
  }

  async function editSnapshotLabel(item) {
    const fallback = snapshotLabel(item);
    const current = String(item?.label || "").trim() || fallback;
    const next = typeof window === "undefined"
      ? current
      : window.prompt("Название версии", current);
    if (next == null) return;
    const cleaned = String(next || "").trim() || fallback;
    await updateSnapshotMeta(item, { label: cleaned });
  }

  function openDiffForSnapshot(item) {
    const targetId = String(item?.id || "").trim();
    if (!targetId) return;
    const list = asArray(versionsList);
    const idx = list.findIndex((candidate) => String(candidate?.id || "") === targetId);
    const latestId = String(list[0]?.id || "");
    const previousId = idx >= 0 ? String(list[idx + 1]?.id || "") : "";
    let baseId = previousId || (latestId !== targetId ? latestId : String(list[1]?.id || ""));
    if (!baseId || baseId === targetId) {
      setGenErr("Для diff нужно минимум две разные версии.");
      return;
    }
    setDiffBaseSnapshotId(baseId);
    setDiffTargetSnapshotId(targetId);
    setDiffOpen(true);
  }

  function pushCommandHistory(commandText) {
    const text = String(commandText || "").trim();
    if (!text || !sid) return;
    const next = [
      { text, ts: Date.now() },
      ...commandHistory.filter((item) => String(item?.text || "").trim() && String(item?.text || "").trim() !== text),
    ].slice(0, COMMAND_HISTORY_LIMIT);
    setCommandHistory(next);
    writeCommandHistory(sid, next);
  }

  async function runAiCommand(commandText) {
    const text = String(commandText || "").trim();
    if (!text || !sid) return;
    if (tab !== "diagram") {
      setCommandStatus({ kind: "error", text: "Командный режим доступен только во вкладке Diagram." });
      return;
    }

    setCommandBusy(true);
    setCommandStatus({ kind: "loading", text: "AI работает…" });
    setGenErr("");

    try {
      const parsed = await parseCommandToOps({
        command: text,
        context: {
          selectedElementId,
          selectedElementName,
          selectedElementType,
          selectedElementLaneName,
        },
      });

      if (!parsed?.ok || !asArray(parsed?.ops).length) {
        const reason = shortErr(parsed?.error || "Не удалось распознать команду.");
        setCommandStatus({ kind: "error", text: reason || "Не удалось распознать команду." });
        logAiOpsTrace("parse_fail", {
          sid,
          command: text,
          reason: parsed?.error || "parse_failed",
        });
        return;
      }

      const applyResult = await Promise.resolve(
        bpmnRef.current?.applyCommandOps?.({
          ops: parsed.ops,
          command: text,
          selectedElementId,
        }),
      );

      const applied = Number(applyResult?.applied || 0);
      const failed = Number(applyResult?.failed || 0);
      const changedIds = asArray(applyResult?.changedIds).filter(Boolean);

      logAiOpsTrace("apply", {
        sid,
        source: parsed?.source || "rule",
        command: text,
        ops: JSON.stringify(parsed?.ops || []),
        applied,
        failed,
        changedIds: `[${changedIds.join(",")}]`,
      });

      if (!applyResult?.ok && applied <= 0) {
        setCommandStatus({
          kind: "error",
          text: shortErr(applyResult?.error || "Команда не применена."),
        });
        return;
      }

      pushCommandHistory(text);
      setCommandInput("");
      setCommandStatus({
        kind: failed > 0 ? "warn" : "ok",
        text: `Сделано: ${applied} опер. Изменено элементов: ${changedIds.length}.${failed > 0 ? ` Ошибок: ${failed}.` : ""}`,
      });
    } catch (error) {
      setCommandStatus({
        kind: "error",
        text: shortErr(error?.message || error || "Не удалось выполнить команду."),
      });
      logAiOpsTrace("exception", {
        sid,
        command: text,
        error: shortErr(error?.message || error || "unknown"),
      });
    } finally {
      setCommandBusy(false);
    }
  }

  function downloadSnapshot(item) {
    const xml = String(item?.xml || "");
    if (!xml.trim()) return;
    const base = String(draft?.title || sid || "process")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "process";
    const stamp = new Date(Number(item?.ts || Date.now()) || Date.now()).toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${base}_snapshot_${stamp}.bpmn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  function focusQualityIssue(issue) {
    const nodeId = toNodeId(issue?.nodeId || issue?.id || issue?.elementId);
    if (!nodeId) return;
    const key = `${nodeId}::${String(asArray(issue?.reasons).join("|"))}`;
    const nodeTitle = String(
      qualityNodeTitleById[nodeId]
      || coverageById[nodeId]?.title
      || issue?.title
      || "",
    ).trim();
    const copy = qualityIssueCopy(issue, nodeTitle);
    setQualityIssueFocusKey(key);
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Показано" });
    }, 160);
    setInfoMsg(`Качество: ${copy.short}`);
    setGenErr("");
  }

  function confirmExportWithQualityGate(target = "bpmn") {
    const errorCount = Number(qualitySummary?.errors || 0);
    if (errorCount <= 0) return true;
    const message = [
      `Обнаружены критичные проблемы качества: ${errorCount}.`,
      "Рекомендуется сначала исправить их в режиме «Качество».",
      `Продолжить экспорт ${target.toUpperCase()}?`,
    ].join("\n");
    // eslint-disable-next-line no-console
    console.debug(`[LINT] export_gate target=${target} errors=${errorCount} warns=${Number(qualitySummary?.warns || 0)}`);
    return window.confirm(message);
  }

  async function applyQualityAutoFix() {
    const ops = asArray(qualityAutoFixPreview?.ops);
    if (!ops.length) {
      setInfoMsg("Safe auto-fix недоступен для текущих проблем.");
      setQualityAutoFixOpen(false);
      return;
    }
    setQualityAutoFixBusy(true);
    setGenErr("");
    setInfoMsg("");
    // eslint-disable-next-line no-console
    console.debug(
      `[AUTOFIX] preview sid=${sid || "-"} profile=${qualityProfile?.id || qualityProfileId} `
      + `safe=${Number(qualityAutoFixPreview?.safeFixes || 0)} ops=${ops.length}`,
    );
    try {
      const result = await Promise.resolve(
        bpmnRef.current?.applyCommandOps?.({
          ops,
          command: "lint_autofix",
          selectedElementId: "",
        }),
      );
      const applied = Number(result?.applied || 0);
      const failed = Number(result?.failed || 0);
      // eslint-disable-next-line no-console
      console.debug(
        `[AUTOFIX] applied sid=${sid || "-"} applied=${applied} failed=${failed} changedIds=${asArray(result?.changedIds).length}`,
      );
      if (!result?.ok && applied <= 0) {
        setGenErr(shortErr(result?.error || "Автоисправление не выполнено."));
        return;
      }
      const flush = await bpmnSync.flushFromActiveTab("diagram", {
        force: true,
        source: "lint_autofix",
        reason: "lint_autofix",
      });
      if (!flush?.ok) {
        setGenErr(shortErr(flush?.error || "Не удалось сохранить BPMN после автоисправления."));
        return;
      }
      await createManualSnapshot({ label: "Auto-fix" });
      setInfoMsg(`Автоисправление: ${applied} опер.${failed > 0 ? ` Ошибок: ${failed}.` : ""}`);
      setQualityAutoFixOpen(false);
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Автоисправление не выполнено."));
    } finally {
      setQualityAutoFixBusy(false);
    }
  }

  function toggleRobotMetaOverlayFilter(keyRaw) {
    const key = toText(keyRaw).toLowerCase();
    if (key !== "ready" && key !== "incomplete") return;
    setRobotMetaOverlayFilters((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
    setRobotMetaOverlayEnabled(true);
  }

  function showRobotMetaOverlay() {
    setRobotMetaOverlayEnabled(true);
    setRobotMetaOverlayFilters((prev) => {
      const next = {
        ready: !!prev?.ready,
        incomplete: !!prev?.incomplete,
      };
      if (!next.ready && !next.incomplete) {
        return { ready: true, incomplete: true };
      }
      return next;
    });
  }

  function resetRobotMetaOverlay() {
    setRobotMetaOverlayEnabled(false);
    setRobotMetaOverlayFilters({ ready: true, incomplete: true });
    setRobotMetaListOpen(false);
    setRobotMetaListSearch("");
    setRobotMetaListTab("ready");
  }

  function focusRobotMetaItem(itemRaw, source = "robot_meta_list") {
    const item = asObject(itemRaw);
    const nodeId = toNodeId(item?.nodeId || item?.id);
    if (!nodeId) return;
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 3000,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Robot Meta" });
    }, 120);
    const title = toText(item?.title || robotMetaNodeCatalogById?.[nodeId]?.title || nodeId) || nodeId;
    onOpenElementNotes?.({
      id: nodeId,
      name: title,
      type: toText(item?.type || robotMetaNodeCatalogById?.[nodeId]?.type),
    }, "header_open_notes");
    setInfoMsg(`Robot Meta: ${title}`);
    setGenErr("");
    if (source === "robot_meta_list" && tab !== "diagram") {
      setTab("diagram");
    }
  }

  function focusCoverageIssue(item, source = "coverage_panel") {
    const nodeId = toNodeId(item?.id || item?.nodeId);
    if (!nodeId) return;
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Показано" });
    }, 160);
    const title = String(item?.title || nodeId).trim();
    onOpenElementNotes?.({
      id: nodeId,
      name: title,
      type: String(item?.type || "").trim(),
    }, "header_open_notes");
    setInfoMsg(`Покрытие: ${title}`);
    setGenErr("");
    if (source === "notes_panel_event") {
      setTab("diagram");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onOpenCoverage = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      applyDiagramMode("coverage");
      if (tab !== "diagram") setTab("diagram");
      const focusId = toNodeId(detail?.focusElementId);
      if (!focusId) return;
      const row = coverageById[focusId] || { id: focusId, title: focusId, type: "" };
      focusCoverageIssue(row, "notes_panel_event");
    };
    window.addEventListener(NOTES_COVERAGE_OPEN_EVENT, onOpenCoverage);
    return () => {
      window.removeEventListener(NOTES_COVERAGE_OPEN_EVENT, onOpenCoverage);
    };
  }, [tab, setTab, coverageById, applyDiagramMode]);

  const generateAiQuestionsForSelectedElement = useCallback(async () => {
    if (!canGenerateAiQuestions) {
      const reason = shortErr(aiGenerateGate.reasonText || "Генерация сейчас недоступна.");
      if (reason) setGenErr(reason);
      return;
    }

    setAiQuestionsBusy(true);
    setAiQuestionsStatus({ kind: "pending", text: "AI работает..." });
    setGenErr("");
    setInfoMsg("");
    try {
      let timeoutHandle = null;
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      if (controller) {
        timeoutHandle = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // noop
          }
        }, AI_QUESTIONS_TIMEOUT_MS);
      }
      const aiRes = await apiAiQuestions(
        sid,
        {
          mode: "node_step",
          node_id: selectedElementId,
          limit: 5,
        },
        { signal: controller?.signal },
      );
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (!aiRes || typeof aiRes !== "object") {
        const errText = "Не удалось получить ответ генератора.";
        setAiQuestionsStatus({ kind: "error", text: errText });
        setGenErr(errText);
        return;
      }
      if (!aiRes?.ok) {
        const aborted = !!aiRes?.aborted || String(aiRes?.error_name || "").toLowerCase() === "aborterror";
        const errText = aborted
          ? `Таймаут генерации (${Math.round(AI_QUESTIONS_TIMEOUT_MS / 1000)}с). Попробуйте ещё раз.`
          : shortErr(aiRes?.error || "Не удалось сгенерировать AI-вопросы.");
        setAiQuestionsStatus({ kind: "error", text: errText });
        setGenErr(errText);
        return;
      }
      const payloadRaw = aiRes.result && typeof aiRes.result === "object" ? aiRes.result : {};
      const payload = withInjectedAiQuestionsPayload(payloadRaw, {
        selectedElementId,
        draftInterview: draft?.interview,
      });
      const payloadInterview = asObject(payload?.interview);
      const payloadAiMap = asObject(payloadInterview?.ai_questions_by_element || payloadInterview?.aiQuestionsByElementId);
      if (String(payload?.error || "").trim()) {
        const errText = shortErr(payload.error);
        setAiQuestionsStatus({ kind: "error", text: errText });
        setGenErr(errText);
        return;
      }
      onSessionSync?.({
        ...payload,
        _sync_source: "diagram_ai_questions_generate",
      });
      if (Object.keys(payloadAiMap).length) {
        handleAiQuestionsByElementChange(payloadAiMap, {
          source: "diagram_ai_questions_generate",
          elementId: selectedElementId,
        });
      }
      applyClarifyFromSession(payload, draft?.nodes);
      const step = payload?.llm_step && typeof payload.llm_step === "object" ? payload.llm_step : {};
      const generated = Number(step?.generated || 0);
      const reused = !!step?.reused || generated <= 0;
      const msg = reused
        ? "AI-вопросы актуальны: новые не требуются."
        : `AI-вопросы обновлены: +${generated}.`;
      bpmnRef.current?.flashNode?.(selectedElementId, "ai", { label: "AI added" });
      bpmnRef.current?.flashBadge?.(selectedElementId, "ai");
      setAiQuestionsStatus({ kind: reused ? "warn" : "ok", text: msg });
      setInfoMsg(msg);
      onOpenElementNotes?.({
        id: selectedElementId,
        name: selectedElementName || selectedElementId,
        type: selectedElementType,
      }, "header_open_notes");
    } catch (error) {
      const errText = shortErr(error?.message || error || "Не удалось сгенерировать AI-вопросы.");
      setAiQuestionsStatus({ kind: "error", text: errText });
      setGenErr(errText);
    } finally {
      setAiQuestionsBusy(false);
    }
  }, [
    canGenerateAiQuestions,
    aiGenerateGate.reasonText,
    sid,
    selectedElementId,
    onSessionSync,
    handleAiQuestionsByElementChange,
    applyClarifyFromSession,
    draft?.interview,
    draft?.nodes,
    selectedElementName,
    selectedElementType,
    onOpenElementNotes,
  ]);

  function handleBpmnSelectionChange(payload) {
    const selected = payload && typeof payload === "object" ? payload : null;
    onBpmnElementSelect?.(selected);
    const source = String(selected?.source || "").toLowerCase();
    if (!selected?.id) return;
    if (source.includes("ai_badge_click") || source.includes("ai_indicator_click")) {
      onOpenElementNotes?.(selected, "header_open_ai");
      return;
    }
    if (source.includes("notes_badge_click")) {
      onOpenElementNotes?.(selected, "header_open_notes");
    }
  }

  function openInsertBetweenModal() {
    if (!hasSession || tab !== "diagram") {
      setGenErr("Операция доступна только во вкладке Diagram.");
      return;
    }
    const candidate = readInsertBetweenCandidate(selectedBpmnElement?.insertBetween);
    if (!candidate) {
      setGenErr("Выберите стрелку BPMN или пару связанных шагов A→B.");
      return;
    }
    if (candidate.available === false) {
      setGenErr(insertBetweenErrorMessage(candidate.error));
      return;
    }
    setGenErr("");
    setInfoMsg("");
    setInsertBetweenDraft(candidate);
    setInsertBetweenName("");
    setInsertBetweenOpen(true);
  }

  async function applyInsertBetweenFromDiagram() {
    const candidate = readInsertBetweenCandidate(insertBetweenDraft);
    if (!candidate || !candidate.fromId || !candidate.toId) {
      setGenErr("Не удалось определить связь для вставки.");
      return;
    }
    const newTaskName = String(insertBetweenName || "").trim();
    if (!newTaskName) {
      setGenErr("Введите название нового шага.");
      return;
    }

    setInsertBetweenBusy(true);
    setGenErr("");
    setInfoMsg("");
    try {
      const result = await Promise.resolve(
        bpmnRef.current?.applyCommandOps?.({
          command: `insert_between:${candidate.fromId}->${candidate.toId}`,
          selectedElementId: candidate.flowId || candidate.fromId,
          ops: [
            {
              type: "insertBetween",
              fromId: candidate.fromId,
              toId: candidate.toId,
              flowId: candidate.flowId,
              newTaskName,
              laneId: candidate.laneId,
              when: candidate.when,
              whenPolicy: "to_first",
            },
          ],
        }),
      );
      if (!result?.ok && Number(result?.applied || 0) <= 0) {
        const opError = String(result?.results?.[0]?.error || result?.error || "").trim();
        setGenErr(insertBetweenErrorMessage(opError));
        return;
      }
      setInsertBetweenOpen(false);
      setInsertBetweenName("");
      setInsertBetweenDraft(null);
      const changedIds = asArray(result?.changedIds).map((x) => String(x || "").trim()).filter(Boolean);
      if (changedIds.length) {
        changedIds.slice(0, 3).forEach((id, idx) => {
          bpmnRef.current?.flashNode?.(id, "flow", {
            label: idx === 0 ? "Branch added" : "",
          });
        });
      } else {
        bpmnRef.current?.flashNode?.(candidate.fromId, "flow", { label: "Branch added" });
      }
      setInfoMsg(`Шаг "${newTaskName}" вставлен между ${candidate.fromId} и ${candidate.toId}.`);
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось вставить шаг между."));
    } finally {
      setInsertBetweenBusy(false);
    }
  }

  const runNotesBatchOps = useCallback(async (detail = {}) => {
    const requestSid = String(detail?.sid || "").trim();
    if (!requestSid || requestSid !== String(sid || "")) {
      return { ok: false, error: "wrong_session" };
    }
    const ops = asArray(detail?.ops);
    if (!ops.length) {
      return { ok: false, error: "empty_ops" };
    }

    if (tab !== "diagram") {
      await switchTab("diagram");
    }

    try {
      await Promise.resolve(bpmnRef.current?.whenReady?.({
        timeoutMs: 4000,
        expectedSid: requestSid,
      }));
    } catch {
    }

    const result = await Promise.resolve(
      bpmnRef.current?.applyCommandOps?.({
        ops,
        command: String(detail?.commandText || "batch_notes"),
        selectedElementId: "",
      }),
    );
    const applied = Number(result?.applied || 0);
    const failed = Number(result?.failed || 0);
    if (!result?.ok && applied <= 0) {
      return {
        ok: false,
        applied,
        failed,
        error: String(result?.error || result?.results?.[0]?.error || "apply_failed"),
      };
    }
    setInfoMsg(`Batch: применено ${applied} опер.${failed > 0 ? ` Ошибок: ${failed}.` : ""}`);
    logAiOpsTrace("batch_apply", {
      sid: requestSid,
      applied,
      failed,
      source: String(detail?.source || "notes_batch"),
      ops: ops.length,
    });
    return {
      ok: true,
      applied,
      failed,
      changedIds: asArray(result?.changedIds),
    };
  }, [sid, tab, switchTab]);

  useEffect(() => {
    const notice = snapshotRestoreNotice && typeof snapshotRestoreNotice === "object" ? snapshotRestoreNotice : null;
    if (!notice) return;
    if (String(notice.sid || "") !== String(sid || "")) return;
    setInfoMsg(`Восстановлено из локальной истории (${formatSnapshotTs(notice.ts)}).`);
  }, [sid, snapshotRestoreNotice]);

  useEffect(() => {
    if (!versionsOpen || !sid) return;
    void refreshSnapshotVersions();
  }, [versionsOpen, sid, draft?.bpmn_xml_version, draft?.version, refreshSnapshotVersions]);

  useEffect(() => {
    if (!diffOpen) return;
    const ids = new Set(asArray(versionsList).map((item) => String(item?.id || "")));
    if (!ids.has(String(diffTargetSnapshotId || ""))) {
      setDiffTargetSnapshotId(String(asArray(versionsList)[0]?.id || ""));
    }
    if (!ids.has(String(diffBaseSnapshotId || ""))) {
      setDiffBaseSnapshotId(String(asArray(versionsList)[1]?.id || asArray(versionsList)[0]?.id || ""));
    }
  }, [diffOpen, versionsList, diffBaseSnapshotId, diffTargetSnapshotId]);

  useEffect(() => {
    writeCommandMode(commandModeEnabled);
  }, [commandModeEnabled]);

  useEffect(() => {
    writeDiagramMode(diagramMode);
    writeQualityMode(diagramMode === "quality");
    writeAiQuestionsMode(diagramMode === "interview");
  }, [diagramMode]);

  useEffect(() => {
    writeQualityProfile(qualityProfileId);
  }, [qualityProfileId]);

  useEffect(() => {
    if (!isQualityMode) setQualityIssueFocusKey("");
  }, [isQualityMode]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug(
      `[LINT] run sid=${sid || "-"} profile=${qualityProfile?.id || qualityProfileId} `
      + `issues=${Number(qualitySummary?.total || 0)} errors=${Number(qualitySummary?.errors || 0)} warns=${Number(qualitySummary?.warns || 0)}`,
    );
  }, [sid, qualityProfile?.id, qualityProfileId, qualitySummary?.total, qualitySummary?.errors, qualitySummary?.warns]);

  useEffect(() => {
    if (tab !== "diagram") setAiQuestionsStatus({ kind: "", text: "" });
  }, [tab]);

  useEffect(() => {
    if (typeof onUiStateChange !== "function") return;
    onUiStateChange({
      sid,
      tab,
      diagramMode,
      selectedElementId,
      hasSession,
      isLocal,
      aiQuestionsBusy,
      canGenerateAiQuestions,
      aiGenerateBlockReason: canGenerateAiQuestions ? "" : aiGenerateGate.reasonText,
      aiGenerateBlockReasonCode: canGenerateAiQuestions ? "" : aiGenerateGate.reasonCode,
    });
  }, [
    onUiStateChange,
    sid,
    tab,
    diagramMode,
    selectedElementId,
    hasSession,
    isLocal,
    aiQuestionsBusy,
    canGenerateAiQuestions,
    aiGenerateGate.reasonText,
    aiGenerateGate.reasonCode,
  ]);

  useEffect(() => {
    const intent = aiGenerateIntent && typeof aiGenerateIntent === "object" ? aiGenerateIntent : null;
    if (!intent) return;
    const intentSid = String(intent.sid || "").trim();
    if (!intentSid || intentSid !== sid) return;
    const intentNonce = String(intent.nonce || "").trim();
    const intentKey = `${intentSid}:${intentNonce || "none"}`;
    if (lastAiGenerateIntentKeyRef.current === intentKey) return;
    lastAiGenerateIntentKeyRef.current = intentKey;
    void generateAiQuestionsForSelectedElement();
  }, [aiGenerateIntent, sid, generateAiQuestionsForSelectedElement]);

  useEffect(() => {
    setToolbarMenuOpen(false);
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionLayersOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
  }, [tab, sid]);

  useEffect(() => {
    if (!availablePathTiers.length) {
      if (pathHighlightEnabled) setPathHighlightEnabled(false);
      if (pathHighlightTier) setPathHighlightTier("");
      if (pathHighlightSequenceKey) setPathHighlightSequenceKey("");
      return;
    }
    if (!availablePathTiers.includes(pathHighlightTier)) {
      setPathHighlightTier(availablePathTiers[0]);
      setPathHighlightSequenceKey("");
      return;
    }
    if (pathHighlightSequenceKey && !availableSequenceKeysForTier.includes(pathHighlightSequenceKey)) {
      setPathHighlightSequenceKey("");
    }
  }, [
    availablePathTiers,
    availableSequenceKeysForTier,
    pathHighlightEnabled,
    pathHighlightTier,
    pathHighlightSequenceKey,
  ]);

  useEffect(() => {
    const xml = String(draft?.bpmn_xml || "");
    const hash = fnv1aHex(xml);
    const prevHash = String(lastDraftXmlHashRef.current || "");
    lastDraftXmlHashRef.current = hash;
    if (!saveDirtyHint) return;
    if (!xml.trim()) return;
    if (prevHash && prevHash !== hash) {
      setSaveDirtyHint(false);
    }
  }, [draft?.bpmn_xml, saveDirtyHint]);


  useEffect(() => {
    const draftV2 = normalizeHybridV2Doc(asObject(asObject(draft?.bpmn_meta).hybrid_v2));
    if (asArray(draftV2.elements).length > 0 || asArray(draftV2.edges).length > 0) return;
    const v1Map = normalizeHybridLayerMap(hybridLayerMapFromDraft);
    if (!Object.keys(v1Map).length) return;
    if (typeof window !== "undefined" && hasKnownHybridV2Session(window.localStorage, sid)) return;
    const guardKey = `${sid}:${serializeHybridLayerMap(v1Map)}`;
    if (hybridV2MigrationGuardRef.current === guardKey) return;
    hybridV2MigrationGuardRef.current = guardKey;
    const migrated = migrateHybridV1ToV2(v1Map, (bpmnId) => {
      const anchor = asObject(readHybridElementAnchor(bpmnId));
      if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;
      return {
        x: Number(anchor.x || 0),
        y: Number(anchor.y || 0),
      };
    });
    setHybridV2Doc(migrated);
    hybridV2DocRef.current = migrated;
    hybridTools.setImportNotice("Migrated v1 -> v2");
    void persistHybridV2Doc(migrated, { source: "hybrid_v2_migrate_v1" });
  }, [draft?.bpmn_meta, hybridLayerMapFromDraft, readHybridElementAnchor, sid]);

  useEffect(() => {
    if (!hybridDebugEnabled || tab !== "diagram" || !hybridVisible) return;
    const rows = asArray(hybridLayerRenderRows).slice(0, 20).map((rowRaw) => {
      const row = asObject(rowRaw);
      return {
        elementId: toText(row?.elementId),
        hasCenter: !!row?.hasCenter,
        dx: Number(row?.rawDx || 0),
        dy: Number(row?.rawDy || 0),
        x: Math.round(Number(row?.rawX || 0) * 10) / 10,
        y: Math.round(Number(row?.rawY || 0) * 10) / 10,
        insideViewport: !!row?.insideViewport,
        clamped: !!row?.wasClamped,
      };
    });
    // Dev-only diagnostics for offscreen marker issues.
    // eslint-disable-next-line no-console
    console.info("[HYBRID_DEBUG] visibility", {
      viewport: asObject(hybridViewportSize),
      viewbox: asObject(overlayViewbox),
      container: asObject(overlayContainerRect),
      stats: asObject(hybridLayerVisibilityStats),
      rows,
    });
  }, [hybridDebugEnabled, hybridLayerRenderRows, hybridLayerVisibilityStats, hybridViewportSize, overlayViewbox, overlayContainerRect, hybridVisible, tab]);

  useEffect(() => {
    if (tab !== "diagram" || !hybridVisible) return;
    const total = Number(hybridLayerVisibilityStats.total || 0);
    const inside = Number(hybridLayerVisibilityStats.insideViewport || 0);
    if (total <= 0 || inside > 0) {
      hybridAutoFocusGuardRef.current = "";
      return;
    }
    const guardKey = `${sid}:${total}:${inside}`;
    if (hybridAutoFocusGuardRef.current === guardKey) return;
    hybridAutoFocusGuardRef.current = guardKey;
    focusHybridLayer("hybrid_auto_focus_outside_viewport");
  }, [hybridLayerVisibilityStats.insideViewport, hybridLayerVisibilityStats.total, hybridVisible, sid, tab]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      if (tab !== "diagram" || hybridModeEffective !== "edit" || hybridUiPrefs.lock) return;
      const key = String(event?.key || "");
      if (key !== "Delete" && key !== "Backspace") return;
      if (hybridSelection.selectionCount > 0) return;
      const legacyId = toText(hybridLayerActiveElementId);
      if (!legacyId) return;
      if (!deleteLegacyHybridMarkers([legacyId], "hybrid_legacy_keyboard_delete")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    deleteLegacyHybridMarkers,
    hybridLayerActiveElementId,
    hybridModeEffective,
    hybridSelection.selectionCount,
    hybridUiPrefs.lock,
    tab,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      if (tab === "diagram" && diagramActionHybridToolsOpen && !event.repeat) {
        const key = String(event?.key || "");
        if (key === "1") {
          event.preventDefault();
          selectHybridPaletteTool("select");
          return;
        }
        if (key === "2") {
          event.preventDefault();
          selectHybridPaletteTool("rect");
          return;
        }
        if (key === "3") {
          event.preventDefault();
          selectHybridPaletteTool("text");
          return;
        }
        if (key === "4") {
          event.preventDefault();
          selectHybridPaletteTool("container");
          return;
        }
      }
      if (String(event?.key || "").toLowerCase() === "h" && !event.repeat) {
        if (!hybridUiPrefs.visible) {
          setHybridPeekActive(true);
          markPlaybackOverlayInteraction({ stage: "hybrid_peek_down" });
        }
      }
      if (String(event?.key || "") === "Escape" && hybridModeEffective === "edit") {
        setHybridUiPrefs((prev) => applyHybridModeTransition(prev, "view"));
        setHybridV2BindPickMode(false);
        setDiagramActionHybridToolsOpen(false);
        hybridTools.cancelTransientState();
        markPlaybackOverlayInteraction({ stage: "hybrid_edit_escape" });
      }
    };
    const onKeyUp = (event) => {
      if (String(event?.key || "").toLowerCase() !== "h") return;
      if (hybridPeekActive) {
        setHybridPeekActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [diagramActionHybridToolsOpen, hybridUiPrefs.visible, hybridPeekActive, hybridModeEffective, hybridTools, markPlaybackOverlayInteraction, selectHybridPaletteTool, tab]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (hybridModeEffective !== "edit") return undefined;
    const onMove = (event) => {
      const state = asObject(hybridLayerDragRef.current);
      const elementId = toText(state?.elementId);
      if (!elementId) return;
      const pointer = clientToDiagram(event?.clientX, event?.clientY);
      if (!pointer) return;
      const dx = Number(pointer.x || 0) - Number(state.startX || 0);
      const dy = Number(pointer.y || 0) - Number(state.startY || 0);
      setHybridLayerByElementId((prevRaw) => {
        const prev = normalizeHybridLayerMap(prevRaw);
        const row = asObject(prev[elementId]);
        return {
          ...prev,
          [elementId]: {
            dx: Math.round((Number(state.baseDx || row.dx || 0) + dx) * 10) / 10,
            dy: Math.round((Number(state.baseDy || row.dy || 0) + dy) * 10) / 10,
          },
        };
      });
    };
    const onUp = () => {
      const hadDrag = !!asObject(hybridLayerDragRef.current).elementId;
      hybridLayerDragRef.current = null;
      if (!hadDrag) return;
      void persistHybridLayerMap(hybridLayerMapRef.current, { source: "hybrid_layer_drag_end" });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [hybridModeEffective, draft?.bpmn_meta, isLocal, onSessionSync, sid]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock || !hybridVisible) return undefined;
    const onMouseDownCapture = (event) => {
      if (hybridV2ToolState !== "select") return;
      const host = bpmnStageHostRef.current;
      const target = event?.target;
      if (!host || !(target instanceof Node) || !host.contains(target)) return;
      if (
        target instanceof Element
        && (target.closest?.(".hybridLayerCard")
          || target.closest?.(".hybridLayerHotspot")
          || target.closest?.("[data-testid='hybrid-layer-overlay']")
          || target.closest?.("[data-testid='diagram-action-layers-popover']"))
      ) {
        return;
      }
      const elementId = resolveHybridTargetElementIdFromPoint(event?.clientX, event?.clientY);
      if (!elementId) return;
      if (hybridV2BindPickMode && hybridV2ActiveId) {
        bindActiveHybridV2ToBpmn(elementId);
        markPlaybackOverlayInteraction({
          stage: "hybrid_v2_bind_pick",
          elementId,
          hybridId: hybridV2ActiveId,
        });
        return;
      }
      addOrSelectHybridMarker(elementId, "hybrid_edit_surface_pointer");
      markPlaybackOverlayInteraction({
        stage: "hybrid_edit_surface_pointer",
        elementId,
      });
    };
    window.addEventListener("mousedown", onMouseDownCapture, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDownCapture, true);
    };
  }, [hybridModeEffective, hybridUiPrefs.lock, hybridVisible, resolveHybridTargetElementIdFromPoint, hybridV2BindPickMode, hybridV2ActiveId, hybridV2ToolState]);

  useEffect(() => {
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock) return;
    if (hybridV2ToolState !== "select") return;
    if (asArray(hybridV2DocRef.current?.elements).length > 0 || asArray(hybridV2DocRef.current?.edges).length > 0) return;
    const elementId = toNodeId(selectedElementId);
    const type = toText(selectedElementType).toLowerCase();
    if (!elementId) return;
    if (type.includes("sequenceflow") || type.includes("connection")) return;
    addOrSelectHybridMarker(elementId, "hybrid_edit_selection");
  }, [hybridModeEffective, hybridUiPrefs.lock, hybridV2ToolState, selectedElementId, selectedElementType]);

  useEffect(() => {
    if (!diagramActionPlanOpen) return;
    void buildExecutionPlanNow({ suppressError: true });
  }, [
    diagramActionPlanOpen,
    sid,
    draft?.project_id,
    draft?.projectId,
    executionPlanSource,
    robotMetaByElementId,
    executionPlanNodeTypeById,
  ]);

  useEffect(() => {
    if (diagramActionPlanOpen) return;
    setExecutionPlanError("");
  }, [diagramActionPlanOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onBatchApply = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const requestId = String(detail?.requestId || "").trim();
      if (!requestId) return;
      void (async () => {
        try {
          const result = await runNotesBatchOps(detail);
          emitBatchOpsResult(requestId, result);
        } catch (error) {
          emitBatchOpsResult(requestId, {
            ok: false,
            error: String(error?.message || error || "batch_apply_failed"),
          });
        }
      })();
    };
    window.addEventListener(NOTES_BATCH_APPLY_EVENT, onBatchApply);
    return () => {
      window.removeEventListener(NOTES_BATCH_APPLY_EVENT, onBatchApply);
    };
  }, [runNotesBatchOps]);

  useEffect(() => {
    if (!sid) {
      setCommandHistory([]);
      return;
    }
    setCommandHistory(readCommandHistory(sid));
  }, [sid]);

  function handleAiQuestionsByElementChange(nextMap, meta = {}) {
    const interviewNow = asObject(draft?.interview);
    handleInterviewChange(
      {
        ...interviewNow,
        ai_questions_by_element: asObject(nextMap),
      },
      {
        type: "diagram.ai_questions_by_element.update",
        source: String(meta?.source || "bpmn_overlay"),
        element_id: String(meta?.elementId || ""),
        question_id: String(meta?.qid || ""),
      },
    );
  }

  useEffect(() => {
    if (!sid) return;
    const rawXml = String(draft?.bpmn_xml || "");
    logActorsTrace("derive start", {
      sid,
      source: "process_stage_effect",
      xmlLen: rawXml.length,
      xmlHash: fnv1aHex(rawXml),
    });
    const derivedActors = deriveActorsFromBpmn(rawXml);
    logActorsTrace("derive done", {
      sid,
      source: "process_stage_effect",
      count: derivedActors.length,
    });
    if (sameDerivedActors(draft?.actors_derived, derivedActors)) return;
    onSessionSync?.({
      id: sid,
      session_id: sid,
      actors_derived: derivedActors,
      _sync_source: "actors_derive_effect",
    });
  }, [sid, draft?.bpmn_xml, draft?.actors_derived, onSessionSync]);

  function applyClarifyFromSession(updated, fallbackNodes) {
    const review = buildClarificationHints(updated?.questions, updated?.nodes || fallbackNodes || []);
    setApiClarifyHints(review.hints);
    setApiClarifyList(review.list);
    setLlmClarifyList(review.llmList || []);
    const sourceLabel = review.hasLlm
      ? "API-валидаторы + DeepSeek вопросы (llm)"
      : "API-валидаторы (coverage/resources/disposition/loss)";
    setApiClarifyMeta({
      openTotal: review.openTotal,
      validatorOpenTotal: review.validatorOpenTotal,
      criticalTotal: review.criticalTotal,
      hasLlm: review.hasLlm,
      llmOpenTotal: review.llmOpenTotal,
      issueStats: review.issueStats,
      sourceLabel,
    });
    return review;
  }

  async function doGenerate() {
    if (!workbench.canGenerate) return;

    setGenErr("");
    setGenBusy(true);

    try {
      setTab("diagram");
      const runInputHash = createAiInputHash({
        tool: "generate_process",
        sid,
        bpmn_len: String(draft?.bpmn_xml || "").length,
        nodes_len: asArray(draft?.nodes).length,
        edges_len: asArray(draft?.edges).length,
        interview: asObject(draft?.interview),
      });
      const exec = await executeAi({
        toolId: "generate_process",
        sessionId: sid,
        projectId: String(draft?.project_id || draft?.projectId || ""),
        inputHash: runInputHash,
        payload: {
          source: "process_header_generate",
        },
        mode: "live",
        run: () => apiRecompute(sid),
      });
      if (!exec.ok) {
        const msg = shortErr(exec?.error?.message || exec?.error?.code || "Не удалось сгенерировать процесс.");
        if (exec?.error?.shouldNotify !== false) setGenErr(msg);
        return;
      }
      const r = exec.result;
      if (!r?.ok) {
        setGenErr(shortErr(r?.error || `recompute failed (${r?.status || 0})`));
        return;
      }

      if (exec.cached) {
        setInfoMsg("AI недоступен: показан последний успешный результат генерации (cached).");
      }
      await bpmnSync.resetBackend();
      await Promise.resolve(bpmnRef.current?.fit?.());
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    } finally {
      setGenBusy(false);
    }
  }

  async function onImportPicked(e) {
    const file = e?.target?.files?.[0];
    if (e?.target) e.target.value = "";
    if (!file) return;

    if (!hasSession) {
      setGenErr("Сначала выберите сессию.");
      return;
    }
    if (isInterview) {
      setGenErr("Переключитесь на Diagram/XML для импорта BPMN.");
      return;
    }

    setGenErr("");
    setInfoMsg("");
    try {
      const text = (await readFileText(file)).trim();
      if (!text) {
        setGenErr("Файл пустой.");
        return;
      }
      if (!text.includes("<") || (!text.includes("bpmn:") && !text.includes("definitions"))) {
        setGenErr("Похоже, это не BPMN/XML файл.");
        return;
      }

      const imported = await bpmnSync.importXml(text);
      if (!imported.ok) {
        setGenErr(shortErr(imported.error || "Импорт не выполнен."));
        return;
      }
      const replaceSeedInterview = isLikelySeedBpmnXml(draft?.bpmn_xml);
      const projected = parseAndProjectBpmnToInterview({
        xmlText: text,
        draft,
        helpers: projectionHelpers,
        preferBpmn: true,
        canAutofillInterview: replaceSeedInterview || !interviewHasContent(draft?.interview),
      });
      const derivedActors = deriveActorsFromBpmn(text);
      if (projected.ok) {
        const hasProjectedInterview = interviewHasContent(projected.nextInterview);
        if (hasProjectedInterview) {
          const savePlan = markInterviewAsSaved(
            projected.nextInterview,
            projected.nextNodes,
            draft?.nodes,
            projected.nextEdges,
            draft?.edges,
          );
          const optimisticSession = {
            ...(draft || {}),
            id: sid,
            session_id: sid,
            interview: projected.nextInterview,
            bpmn_xml: text,
            actors_derived: derivedActors,
            ...(savePlan.nodesChanged ? { nodes: projected.nextNodes } : {}),
            ...(savePlan.edgesChanged ? { edges: projected.nextEdges } : {}),
          };
          onSessionSync?.(optimisticSession);
          if (!isLocal) {
            const syncRes = await apiPatchSession(sid, savePlan.patch);
            if (syncRes.ok) {
              const serverSession =
                syncRes.session && typeof syncRes.session === "object"
                  ? {
                      ...syncRes.session,
                      actors_derived: derivedActors,
                    }
                  : optimisticSession;
              onSessionSync?.(serverSession);
            } else {
              setGenErr(shortErr(syncRes.error || "Не удалось сохранить Interview из BPMN."));
            }
          }
        }
        setInfoMsg(
          replaceSeedInterview
            ? `BPMN распознан: ${projected.parsed.nodes.length} узл., ${projected.parsed.edges.length} связей. Стартовый seed BPMN заменён импортом.`
            : `BPMN распознан: ${projected.parsed.nodes.length} узл., ${projected.parsed.edges.length} связей.`,
        );
      } else {
        setInfoMsg(projected.error || "BPMN загружен, но парсинг не выполнен.");
      }
      setApiClarifyHints([]);
      setApiClarifyList([]);
      setLlmClarifyList([]);
      setApiClarifyMeta(null);
      setTab("diagram");
      await Promise.resolve(bpmnRef.current?.fit?.());
    } catch (e2) {
      setGenErr(shortErr(e2?.message || e2));
    }
  }

  function openImportDialog() {
    importInputRef.current?.click?.();
  }

  function requestToolbarDangerConfirm(kind = "reset") {
    if (kind === "clear") {
      return window.confirm("Очистить текущую диаграмму? Это действие нельзя отменить.");
    }
    return window.confirm("Сбросить диаграмму к последнему состоянию на backend?");
  }

  function runToolbarReset() {
    if (!requestToolbarDangerConfirm("reset")) return;
    void bpmnSync.resetBackend();
    setSaveDirtyHint(false);
    setToolbarMenuOpen(false);
  }

  function runToolbarClear() {
    if (!requestToolbarDangerConfirm("clear")) return;
    bpmnRef.current?.clearLocal?.();
    setSaveDirtyHint(false);
    setToolbarMenuOpen(false);
  }

  async function toggleAiBottlenecks() {
    if (!hasSession || isInterview || aiStepBusy) return;
    if (isLocal) {
      setAiBottleneckOn((prev) => !prev);
      if (!aiBottleneckOn && activeHints.length === 0) {
        setGenErr("AI не нашёл выраженных узких мест в текущем графе.");
      }
      return;
    }

    setAiStepBusy(true);
    setGenErr("");
    setInfoMsg("");
    try {
      const inputHash = createAiInputHash({
        tool: "ai_questions",
        sid,
        mode: "sequential",
        limit: 5,
        bpmn_len: String(draft?.bpmn_xml || "").length,
        nodes: asArray(draft?.nodes).map((n) => ({ id: n?.id, title: n?.title })),
      });
      const exec = await executeAi({
        toolId: "ai_questions",
        sessionId: sid,
        projectId: String(draft?.project_id || draft?.projectId || ""),
        inputHash,
        payload: { limit: 5, mode: "sequential" },
        mode: "live",
        run: () => apiAiQuestions(sid, { limit: 5, mode: "sequential" }),
      });
      if (!exec.ok) {
        const msg = shortErr(exec?.error?.message || "LLM шаг не выполнен");
        if (exec?.error?.shouldNotify !== false) setGenErr(msg);
        return;
      }
      const aiRes = exec.result;
      if (!aiRes?.ok) {
        setGenErr(shortErr(aiRes?.error || "LLM шаг не выполнен"));
        return;
      }
      const payload = aiRes.result || {};
      const step = payload?.llm_step && typeof payload.llm_step === "object" ? payload.llm_step : null;
      const updated = payload?.session && typeof payload.session === "object" ? payload.session : payload;
      onSessionSync?.(updated);
      applyClarifyFromSession(updated, draft?.nodes);
      setAiBottleneckOn(true);

      const cachePrefix = exec.cached ? "cached · " : "";
      if (step?.status === "completed") {
        setInfoMsg(`${cachePrefix}LLM: все элементы обработаны (${Number(step.processed || 0)}/${Number(step.total || 0)}).`);
      } else if (step?.status === "processed") {
        const title = String(step.node_title || step.node_id || "узел");
        setInfoMsg(`${cachePrefix}LLM: ${title} · +${Number(step.generated || 0)} вопроса(ов) · осталось ${Number(step.remaining || 0)}.`);
      } else {
        setInfoMsg(exec.cached ? "AI недоступен: показан прошлый успешный LLM результат (cached)." : "LLM шаг выполнен.");
      }
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    } finally {
      setAiStepBusy(false);
    }
  }

  async function exportBpmn() {
    if (!sid) {
      setGenErr("Сначала выберите сессию.");
      return;
    }
    if (!confirmExportWithQualityGate("bpmn")) {
      setInfoMsg("Экспорт BPMN отменён: сначала исправьте критичные ошибки качества.");
      return;
    }
    setGenErr("");
    setInfoMsg("");

    try {
      // Force-save the live model before export; in Interview tab we still export from modeler runtime.
      const prepared = tab === "interview"
        ? await bpmnSync.saveFromModeler({ force: true, source: "export_bpmn_interview" })
        : await bpmnSync.resolveXmlForExport(tab);
      if (!prepared.ok) {
        setGenErr(shortErr(prepared.error || "Не удалось подготовить BPMN к экспорту."));
        return;
      }

      // Export raw session XML (no interview/AI overlay, no backend regeneration side-effects).
      let xml = String(prepared.xml || "");
      const rawResp = await apiGetBpmnXml(sid, { raw: true, cacheBust: true });
      if (rawResp?.ok) {
        const rawXml = String(rawResp.xml || "");
        if (rawXml.trim()) xml = rawXml;
      }

      if (!xml.trim()) {
        setGenErr("Нет BPMN для экспорта.");
        return;
      }

      const base = String(draft?.title || sid || "process")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "process";
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${base}.bpmn`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setInfoMsg("BPMN экспортирован.");
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    }
  }

  useEffect(() => {
    if (!hasSession || !isBpmnTab) {
      bpmnRef.current?.clearBottlenecks?.();
      return;
    }
    if (!diagramHints.length) {
      bpmnRef.current?.clearBottlenecks?.();
      return;
    }
    bpmnRef.current?.setBottlenecks?.(diagramHints);
  }, [diagramHints, hasSession, isBpmnTab]);

  function openClarifyNode(nodeId) {
    const nid = toNodeId(nodeId);
    if (!nid) return;
    setAiBottleneckOn(true);
    requestDiagramFocus(nid);
  }

  function toggleAttentionFilter(kind) {
    const id = String(kind || "").trim();
    if (!id) return;
    setAttentionFilters((prev) => ({
      ...prev,
      [id]: !prev?.[id],
    }));
  }

  function focusAttentionItem(item, source = "attention_panel") {
    const nodeId = toNodeId(item?.id || item?.nodeId);
    if (!nodeId) return;
    if (tab !== "diagram") setTab("diagram");
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Показано" });
    }, 180);
    const selected = {
      id: nodeId,
      name: String(item?.title || nodeId).trim() || nodeId,
      type: String(item?.type || "").trim(),
      laneName: String(item?.lane || "").trim(),
    };
    if (item?.hasAiMissing) {
      onOpenElementNotes?.(selected, "header_open_ai");
    } else {
      onOpenElementNotes?.(selected, "header_open_notes");
    }
    setInfoMsg(`Требует внимания: ${selected.name}`);
    setGenErr("");
    if (source === "attention_panel") setAttentionOpen(false);
  }

  function openSelectedElementNotes() {
    if (!selectedElementContext) return;
    onOpenElementNotes?.(selectedElementContext, "header_open_notes");
    setDiagramActionOverflowOpen(false);
  }

  function openSelectedElementAi() {
    if (!selectedElementContext) return;
    onOpenElementNotes?.(selectedElementContext, "header_open_ai");
    setDiagramActionOverflowOpen(false);
  }

  function openReportsFromDiagram() {
    const intent = {
      version: DIAGRAM_PATHS_INTENT_VERSION,
      key: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      sid,
      action: "open_reports",
      tier: normalizePathTier(pathHighlightTier) || "P0",
      sequenceKey: normalizePathSequenceKey(pathHighlightSequenceKey),
      source: "diagram_action_bar",
    };
    setDiagramPathsIntent(intent);
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setTab("interview");
    setDiagramActionOverflowOpen(false);
  }

  async function buildExecutionPlanNow(options = {}) {
    const suppressError = options?.suppressError === true;
    if (!suppressError) setExecutionPlanError("");
    setExecutionPlanBusy(true);
    try {
      const plan = await buildExecutionPlan({
        sessionId: sid,
        projectId: toText(draft?.project_id || draft?.projectId),
        pathId: toText(executionPlanSource?.pathId),
        scenarioLabel: toText(executionPlanSource?.scenarioLabel) || "P0 Ideal",
        steps: asArray(executionPlanSource?.steps),
        robotMetaByElementId,
        bpmnTypeById: executionPlanNodeTypeById,
      });
      setExecutionPlanPreview(plan);
      return plan;
    } catch (error) {
      const msg = shortErr(error?.message || error || "Не удалось собрать Execution Plan.");
      if (!suppressError) {
        setExecutionPlanError(msg);
        setGenErr(msg);
      }
      return null;
    } finally {
      setExecutionPlanBusy(false);
    }
  }

  async function copyExecutionPlanFromDiagram() {
    const payload = await buildExecutionPlanNow();
    if (!payload) return;
    const serialized = JSON.stringify(payload, null, 2);
    const copied = await copyText(serialized);
    if (copied) {
      setInfoMsg(`Execution plan скопирован (${Number(asArray(payload?.steps).length)} шагов).`);
      setGenErr("");
      setExecutionPlanError("");
    } else {
      setExecutionPlanError("Не удалось скопировать Execution Plan.");
      setGenErr("Не удалось скопировать Execution Plan.");
    }
  }

  async function downloadExecutionPlanFromDiagram() {
    const payload = executionPlanPreview || await buildExecutionPlanNow();
    if (!payload) return;
    const sidText = toText(payload?.session_id || sid) || "session";
    const pathText = toText(payload?.path_id) || "path";
    const stamp = toText(payload?.generated_at).replace(/[^0-9]/g, "").slice(0, 14) || Date.now();
    const ok = downloadJsonFile(`execution_plan_${sidText}_${pathText}_${stamp}.json`, payload);
    if (ok) {
      setInfoMsg("Execution Plan выгружен в .json.");
      setGenErr("");
      setExecutionPlanError("");
    } else {
      setExecutionPlanError("Не удалось скачать Execution Plan.");
      setGenErr("Не удалось скачать Execution Plan.");
    }
  }

  async function saveExecutionPlanVersionFromDiagram() {
    const payload = executionPlanPreview || await buildExecutionPlanNow();
    if (!payload) return;
    const currentMeta = asObject(draft?.bpmn_meta);
    const nextVersions = appendExecutionPlanVersionEntry(
      executionPlanVersions,
      payload,
    );
    const optimisticMeta = {
      ...currentMeta,
      version: Number(currentMeta?.version) > 0 ? Number(currentMeta.version) : 1,
      flow_meta: flowTierMetaMap,
      node_path_meta: nodePathMetaMap,
      robot_meta_by_element_id: robotMetaByElementId,
      execution_plans: nextVersions,
    };
    const optimisticSession = {
      id: sid,
      session_id: sid,
      bpmn_meta: optimisticMeta,
      _sync_source: "execution_plan_save_optimistic",
    };
    onSessionSync?.(optimisticSession);

    if (!sid || isLocal) {
      setInfoMsg(`Execution Plan сохранён: v${nextVersions.length}.`);
      setGenErr("");
      setExecutionPlanError("");
      return;
    }

    setExecutionPlanSaveBusy(true);
    try {
      const syncRes = await apiPatchSession(sid, { bpmn_meta: optimisticMeta });
      if (!syncRes?.ok) {
        onSessionSync?.({
          id: sid,
          session_id: sid,
          bpmn_meta: {
            ...currentMeta,
            version: Number(currentMeta?.version) > 0 ? Number(currentMeta.version) : 1,
            flow_meta: flowTierMetaMap,
            node_path_meta: nodePathMetaMap,
            robot_meta_by_element_id: robotMetaByElementId,
            execution_plans: executionPlanVersions,
          },
          _sync_source: "execution_plan_save_rollback",
        });
        const msg = shortErr(syncRes?.error || "Не удалось сохранить версию Execution Plan.");
        setExecutionPlanError(msg);
        setGenErr(msg);
        return;
      }

      if (syncRes.session && typeof syncRes.session === "object") {
        onSessionSync?.({
          ...syncRes.session,
          _sync_source: "execution_plan_save_session_patch",
        });
      } else {
        onSessionSync?.({
          ...optimisticSession,
          _sync_source: "execution_plan_save_session_patch_fallback",
        });
      }
      setInfoMsg(`Execution Plan сохранён: v${nextVersions.length}.`);
      setGenErr("");
      setExecutionPlanError("");
    } finally {
      setExecutionPlanSaveBusy(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!hybridVisible) return undefined;
    if (hybridLayerDragRef.current) return undefined;
    const nextSig = serializeHybridLayerMap(hybridLayerByElementId);
    const prevSig = serializeHybridLayerMap(hybridLayerPersistedMapRef.current);
    if (nextSig === prevSig) return undefined;
    const timerId = window.setTimeout(() => {
      void persistHybridLayerMap(hybridLayerByElementId, { source: "hybrid_layer_autosave" });
    }, 220);
    return () => window.clearTimeout(timerId);
  }, [hybridLayerByElementId, hybridVisible, isLocal, sid]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!hybridVisible) return undefined;
    const nextSig = docToComparableJson(hybridV2Doc);
    const prevSig = docToComparableJson(hybridV2PersistedDocRef.current);
    if (nextSig === prevSig) return undefined;
    const timerId = window.setTimeout(() => {
      void persistHybridV2Doc(hybridV2Doc, { source: "hybrid_v2_autosave" });
    }, 220);
    return () => window.clearTimeout(timerId);
  }, [hybridV2Doc, hybridVisible, isLocal, sid]);

  const applyDrawioMetaUpdate = useCallback((mutator, source = "drawio_update") => {
    const prev = normalizeDrawioMeta(drawioMetaRef.current);
    const next = normalizeDrawioMeta(typeof mutator === "function" ? mutator(prev) : prev);
    if (serializeDrawioMeta(next) === serializeDrawioMeta(prev)) return next;
    setDrawioMeta(next);
    drawioMetaRef.current = next;
    markPlaybackOverlayInteraction?.({ stage: source });
    return next;
  }, [markPlaybackOverlayInteraction]);

  const saveDrawioMetaNow = useCallback(async (mutator, source = "drawio_save") => {
    const next = applyDrawioMetaUpdate(mutator, source);
    await persistDrawioMeta(next, { source });
    return next;
  }, [applyDrawioMetaUpdate, persistDrawioMeta]);

  const openEmbeddedDrawioEditor = useCallback(() => {
    if (drawioMetaRef.current.locked === true) {
      setInfoMsg("Draw.io overlay заблокирован. Снимите lock, чтобы редактировать.");
      setGenErr("");
      return false;
    }
    setDrawioEditorOpen(true);
    return true;
  }, [setGenErr, setInfoMsg]);

  const closeEmbeddedDrawioEditor = useCallback(() => {
    setDrawioEditorOpen(false);
  }, []);

  const handleDrawioEditorSave = useCallback(async (payloadRaw = {}) => {
    const payload = asObject(payloadRaw);
    const docXml = toText(payload.docXml || payload.doc_xml || payload.xml);
    const svgCache = toText(payload.svgCache || payload.svg_cache || payload.svg);
    if (!isDrawioXml(docXml)) {
      setGenErr("Draw.io вернул некорректный документ.");
      return false;
    }
    const next = normalizeDrawioMeta({
      ...drawioMetaRef.current,
      enabled: true,
      doc_xml: docXml,
      svg_cache: svgCache,
      last_saved_at: new Date().toISOString(),
    });
    setDrawioMeta(next);
    drawioMetaRef.current = next;
    const persisted = await persistDrawioMeta(next, { source: "drawio_editor_save" });
    if (!persisted?.ok) {
      return false;
    }
    setDrawioEditorOpen(false);
    setInfoMsg(svgCache ? "Draw.io сохранён." : "Draw.io сохранён без SVG preview.");
    setGenErr("");
    return true;
  }, [persistDrawioMeta, setGenErr, setInfoMsg]);

  const toggleDrawioEnabled = useCallback(async () => {
    const current = normalizeDrawioMeta(drawioMetaRef.current);
    const nextEnabled = !current.enabled;
    await saveDrawioMetaNow((prev) => ({
      ...prev,
      enabled: nextEnabled,
    }), "drawio_visibility_toggle");
    if (nextEnabled && !toText(current.doc_xml)) {
      setDrawioEditorOpen(true);
    }
  }, [saveDrawioMetaNow]);

  const setDrawioOpacity = useCallback(async (opacityRaw) => {
    const opacity = Math.max(0.05, Math.min(1, Number(opacityRaw || 1)));
    await saveDrawioMetaNow((prev) => ({
      ...prev,
      opacity,
    }), "drawio_opacity_change");
  }, [saveDrawioMetaNow]);

  const toggleDrawioLock = useCallback(async () => {
    await saveDrawioMetaNow((prev) => ({
      ...prev,
      locked: prev.locked !== true,
    }), "drawio_lock_toggle");
  }, [saveDrawioMetaNow]);

  const exportEmbeddedDrawio = useCallback(() => {
    const current = normalizeDrawioMeta(drawioMetaRef.current);
    const xml = toText(current.doc_xml);
    if (!xml) {
      setInfoMsg("Draw.io документ пока пуст. Сначала открой редактор и нажми Save.");
      setGenErr("");
      return false;
    }
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) || Date.now();
    const ok = downloadTextFile(`drawio_${sid || "session"}_${stamp}.drawio`, xml, "application/xml;charset=utf-8");
    if (ok) {
      setInfoMsg("Draw.io экспортирован (.drawio).");
      setGenErr("");
      return true;
    }
    setGenErr("Не удалось экспортировать Draw.io.");
    return false;
  }, [downloadTextFile, setGenErr, setInfoMsg, sid]);

  const handleDrawioImportFile = useCallback(async (fileRaw) => {
    const file = fileRaw instanceof File ? fileRaw : null;
    if (!file) return false;
    const text = toText(await readFileText(file).catch(() => ""));
    if (!isDrawioXml(text)) {
      setGenErr("Импорт Draw.io ожидает файл .drawio / <mxfile>.");
      return false;
    }
    applyDrawioMetaUpdate((prev) => ({
      ...prev,
      enabled: true,
      doc_xml: text,
      svg_cache: prev.svg_cache,
    }), "drawio_import_stage");
    setDrawioEditorOpen(true);
    setInfoMsg("Файл Draw.io загружен. Нажми Save в редакторе, чтобы обновить preview.");
    setGenErr("");
    return true;
  }, [applyDrawioMetaUpdate, setGenErr, setInfoMsg]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const e2eApi = {
      openEditor() {
        setDrawioEditorOpen(true);
      },
      savePayload(payloadRaw = {}) {
        return handleDrawioEditorSave(payloadRaw);
      },
      setOpacity(valueRaw) {
        return setDrawioOpacity(valueRaw);
      },
      readMeta() {
        return normalizeDrawioMeta(drawioMetaRef.current);
      },
    };
    window.__FPC_E2E_DRAWIO__ = e2eApi;
    return () => {
      if (window.__FPC_E2E_DRAWIO__ === e2eApi) {
        window.__FPC_E2E_DRAWIO__ = null;
      }
    };
  }, [handleDrawioEditorSave]);

  function updateHybridUiPrefs(mutator) {
    setHybridUiPrefs((prevRaw) => {
      const prev = normalizeHybridUiPrefs(prevRaw);
      const next = typeof mutator === "function" ? mutator(prev) : prev;
      const normalized = normalizeHybridUiPrefs(next);
      if (typeof window !== "undefined") {
        saveHybridUiPrefs(window.localStorage, hybridStorageKey, normalized, toText(user?.id));
      }
      return normalized;
    });
  }

  function showHybridLayer() {
    updateHybridUiPrefs((prev) => applyHybridVisibilityTransition(prev, true));
  }

  function hideHybridLayer() {
    updateHybridUiPrefs((prev) => applyHybridVisibilityTransition(prev, false));
    setHybridPeekActive(false);
    setHybridV2BindPickMode(false);
    hybridTools.cancelTransientState();
  }

  function setHybridLayerMode(modeRaw, options = {}) {
    const nextMode = toText(modeRaw).toLowerCase() === "edit" ? "edit" : "view";
    const skipV2Seed = !!options?.skipV2Seed;
    const skipLegacySeed = !!options?.skipLegacySeed;
    updateHybridUiPrefs((prev) => applyHybridModeTransition(prev, nextMode));
    hybridTools.updateDoc((prev) => ({
      ...prev,
      view: {
        ...asObject(prev.view),
        mode: nextMode,
      },
    }), "hybrid_v2_mode_change");
    if (nextMode !== "edit") return;
    const initialV2Count = Number(asArray(hybridV2DocRef.current?.elements).length || 0)
      + Number(asArray(hybridV2DocRef.current?.edges).length || 0);
    if (!skipV2Seed && initialV2Count <= 0) {
      const selectedIdForV2 = toNodeId(selectedElementId);
      if (selectedIdForV2) {
        const anchor = asObject(readHybridElementAnchor(selectedIdForV2));
        const point = Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
          ? { x: Number(anchor.x || 0), y: Number(anchor.y || 0) }
          : { x: 260, y: 220 };
        const createdId = hybridTools.createElementAt(point, "note");
        if (createdId) {
          bindActiveHybridV2ToBpmn(selectedIdForV2, createdId);
          return;
        }
      }
    }
    if (Number(asArray(hybridV2DocRef.current?.elements).length || 0) + Number(asArray(hybridV2DocRef.current?.edges).length || 0) > 0) {
      return;
    }
    if (skipLegacySeed) return;
    const currentMap = normalizeHybridLayerMap(hybridLayerMapRef.current);
    if (Object.keys(currentMap).length > 0) return;
    const selectedId = toNodeId(selectedElementId);
    if (selectedId) {
      addOrSelectHybridMarker(selectedId, "hybrid_edit_seed_selected");
      return;
    }
    const domSelectedId = (() => {
      const host = bpmnStageHostRef.current;
      if (!host) return "";
      const selectedNode = host.querySelector(
        "g.djs-element.selected[data-element-id], g.djs-shape.selected[data-element-id]",
      );
      return toNodeId(selectedNode?.getAttribute?.("data-element-id"));
    })();
    if (domSelectedId) {
      addOrSelectHybridMarker(domSelectedId, "hybrid_edit_seed_dom_selected");
      return;
    }
    const graphSeedId = (() => {
      const graphRes = asObject(bpmnRef.current?.getPlaybackGraph?.());
      const nodesById = asObject(asObject(graphRes?.graph).nodesById);
      const nodeIds = Object.keys(nodesById);
      for (let i = 0; i < nodeIds.length; i += 1) {
        const nodeId = toNodeId(nodeIds[i]);
        const node = asObject(nodesById[nodeId]);
        const type = toText(node?.type).toLowerCase();
        if (!nodeId) continue;
        if (type.includes("startevent") || type.includes("endevent") || type.includes("lane") || type.includes("participant")) continue;
        return nodeId;
      }
      return "";
    })();
    if (graphSeedId) {
      addOrSelectHybridMarker(graphSeedId, "hybrid_edit_seed_graph");
      return;
    }
    const domSeedId = resolveFirstHybridSeedElementId();
    if (domSeedId) {
      addOrSelectHybridMarker(domSeedId, "hybrid_edit_seed_dom");
      return;
    }
    const xmlSeedId = parseSequenceFlowsFromXml(draft?.bpmn_xml)
      .map((flowRaw) => toNodeId(asObject(flowRaw)?.targetId || asObject(flowRaw)?.sourceId))
      .find((nodeIdRaw) => {
        const nodeId = toNodeId(nodeIdRaw);
        const lowered = nodeId.toLowerCase();
        if (!nodeId) return false;
        if (lowered.includes("startevent") || lowered.includes("endevent") || lowered.includes("lane") || lowered.includes("participant")) return false;
        return true;
      });
    if (xmlSeedId) {
      addOrSelectHybridMarker(xmlSeedId, "hybrid_edit_seed_xml");
      return;
    }
    const fallbackNode = asArray(draft?.nodes).find((rowRaw) => {
      const row = asObject(rowRaw);
      const nodeId = toNodeId(row?.id);
      if (!nodeId) return false;
      const type = toText(row?.type).toLowerCase();
      if (type.includes("startevent") || type.includes("endevent")) return false;
      return true;
    });
    const fallbackId = toNodeId(asObject(fallbackNode)?.id);
    if (!fallbackId) return;
    addOrSelectHybridMarker(fallbackId, "hybrid_edit_seed_fallback");
  }

  const toggleHybridToolsVisible = useCallback(() => {
    if (hybridVisible) {
      hideHybridLayer();
      return;
    }
    showHybridLayer();
  }, [hybridVisible, hideHybridLayer, showHybridLayer]);

  function setHybridLayerOpacity(opacityRaw) {
    const opacity = Number(opacityRaw || 60);
    updateHybridUiPrefs((prev) => ({
      ...prev,
      opacity: opacity >= 95 ? 100 : opacity >= 45 ? 60 : 30,
    }));
  }

  function toggleHybridLayerLock() {
    updateHybridUiPrefs((prev) => ({ ...prev, lock: !prev.lock }));
  }

  function toggleHybridLayerFocus() {
    updateHybridUiPrefs((prev) => ({ ...prev, focus: !prev.focus }));
  }

  function toggleHybridV2LayerVisibility(layerIdRaw) {
    const layerId = toText(layerIdRaw);
    if (!layerId) return;
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      const nextLayers = asArray(prev.layers).map((layerRaw) => {
        const layer = asObject(layerRaw);
        if (toText(layer.id) !== layerId) return layer;
        return {
          ...layer,
          visible: layer.visible === false,
        };
      });
      const activeLayerId = toText(asObject(prev.view).active_layer_id);
      const stillVisible = asArray(nextLayers).some((rowRaw) => {
        const row = asObject(rowRaw);
        return toText(row.id) === activeLayerId && row.visible !== false;
      });
      const firstVisibleLayerId = toText(asArray(nextLayers).find((rowRaw) => asObject(rowRaw).visible !== false)?.id);
      return {
        ...prev,
        layers: nextLayers,
        view: {
          ...asObject(prev.view),
          active_layer_id: stillVisible ? activeLayerId : (firstVisibleLayerId || activeLayerId || "L1"),
        },
      };
    }, "hybrid_v2_layer_visibility_toggle");
  }

  function toggleHybridV2LayerLock(layerIdRaw) {
    const layerId = toText(layerIdRaw);
    if (!layerId) return;
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      return {
        ...prev,
        layers: asArray(prev.layers).map((layerRaw) => {
          const layer = asObject(layerRaw);
          if (toText(layer.id) !== layerId) return layer;
          return {
            ...layer,
            locked: layer.locked !== true,
          };
        }),
      };
    }, "hybrid_v2_layer_lock_toggle");
  }

  function setHybridV2LayerOpacity(layerIdRaw, opacityRaw) {
    const layerId = toText(layerIdRaw);
    if (!layerId) return;
    const targetOpacity = Math.max(0.1, Math.min(1, Number(opacityRaw || 1)));
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      return {
        ...prev,
        layers: asArray(prev.layers).map((layerRaw) => {
          const layer = asObject(layerRaw);
          if (toText(layer.id) !== layerId) return layer;
          return {
            ...layer,
            opacity: targetOpacity,
          };
        }),
      };
    }, "hybrid_v2_layer_opacity_change");
  }

  function revealAllHybridV2(source = "hybrid_v2_reveal_all") {
    hybridTools.updateDoc((prevRaw) => {
      const prev = normalizeHybridV2Doc(prevRaw);
      return {
        ...prev,
        layers: asArray(prev.layers).map((layerRaw) => ({ ...asObject(layerRaw), visible: true })),
        elements: asArray(prev.elements).map((rowRaw) => ({ ...asObject(rowRaw), visible: true })),
        edges: asArray(prev.edges).map((rowRaw) => ({ ...asObject(rowRaw), visible: true })),
      };
    }, source);
  }

  function focusHybridLayer(source = "hybrid_layer_focus") {
    const rows = asArray(hybridLayerRenderRows);
    if (!rows.length && !asArray(hybridV2DocLive?.elements).length) return;
    if (!rows.length && asArray(hybridV2DocLive?.elements).length) {
      const first = asObject(hybridV2DocLive.elements[0]);
      const firstId = toText(first.id);
      if (!firstId) return;
      setHybridV2ActiveId(firstId);
      const binding = asObject(hybridV2BindingByHybridId[firstId]);
      const bpmnId = toText(binding.bpmn_id || binding.bpmnId);
      if (bpmnId) {
        bpmnRef.current?.focusNode?.(bpmnId, { keepPrevious: false, durationMs: 1200 });
      }
      return;
    }
    const target = asObject(rows.find((row) => !!asObject(row).hasCenter) || rows[0]);
    const elementId = toText(target?.elementId);
    if (!elementId) return;
    if (target?.hasCenter && !target?.insideViewport && (Math.abs(Number(target?.rawDx || 0)) > 0.5 || Math.abs(Number(target?.rawDy || 0)) > 0.5)) {
      let rebasedMap = null;
      setHybridLayerByElementId((prevRaw) => {
        const prev = normalizeHybridLayerMap(prevRaw);
        if (!prev[elementId]) return prev;
        const next = {
          ...prev,
          [elementId]: { dx: 0, dy: 0 },
        };
        hybridLayerMapRef.current = next;
        rebasedMap = next;
        return next;
      });
      if (rebasedMap) {
        window.setTimeout(() => {
          void persistHybridLayerMap(rebasedMap, { source: `${source}_rebase` });
        }, 0);
      }
    }
    setHybridLayerActiveElementId(elementId);
    markPlaybackOverlayInteraction({
      stage: "hybrid_layer_focus",
      source,
      elementId,
    });
    bpmnRef.current?.focusNode?.(elementId, { keepPrevious: false, durationMs: 1400 });
  }

  function goToHybridLayerItem(elementIdRaw, source = "hybrid_layer_go_to") {
    const elementId = toNodeId(elementIdRaw);
    if (!elementId) return;
    setHybridLayerActiveElementId(elementId);
    markPlaybackOverlayInteraction({
      stage: "hybrid_layer_go_to",
      source,
      elementId,
    });
    bpmnRef.current?.focusNode?.(elementId, { keepPrevious: false, durationMs: 1200 });
  }

  function cleanupMissingHybridBindings(source = "hybrid_layer_cleanup_missing") {
    const missingIds = new Set(asArray(hybridLayerMissingBindingIds).map((row) => toText(row)).filter(Boolean));
    if (!missingIds.size) return;
    let nextMap = null;
    setHybridLayerByElementId((prevRaw) => {
      const prev = normalizeHybridLayerMap(prevRaw);
      const next = {};
      Object.keys(prev).forEach((elementIdRaw) => {
        const elementId = toText(elementIdRaw);
        if (!elementId || missingIds.has(elementId)) return;
        next[elementId] = asObject(prev[elementId]);
      });
      hybridLayerMapRef.current = next;
      nextMap = next;
      return next;
    });
    if (nextMap) {
      window.setTimeout(() => {
        void persistHybridLayerMap(nextMap, { source });
      }, 0);
    }
    if (toText(hybridLayerActiveElementId) && missingIds.has(toText(hybridLayerActiveElementId))) {
      setHybridLayerActiveElementId("");
    }
    markPlaybackOverlayInteraction({
      stage: "hybrid_layer_cleanup_missing",
      count: missingIds.size,
      source,
    });
  }

  function withHybridOverlayGuard(event, meta = {}) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    markPlaybackOverlayInteraction({ stage: "hybrid_overlay_guard", ...asObject(meta) });
  }

  function handleHybridLayerItemPointerDown(event, itemRaw) {
    const item = asObject(itemRaw);
    const elementId = toText(item?.elementId);
    if (!elementId) return;
    withHybridOverlayGuard(event, { elementId, action: "item_pointer_down" });
    setHybridLayerActiveElementId(elementId);
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock) return;
    const row = asObject(hybridLayerByElementId[elementId]);
    const pointer = clientToDiagram(event?.clientX, event?.clientY);
    if (!pointer) return;
    hybridLayerDragRef.current = {
      elementId,
      startX: Number(pointer.x || 0),
      startY: Number(pointer.y || 0),
      baseDx: Number(row.dx || 0),
      baseDy: Number(row.dy || 0),
    };
  }

  function addOrSelectHybridMarker(elementIdRaw, source = "hybrid_edit_click") {
    const elementId = toNodeId(elementIdRaw);
    if (!elementId) return;
    let createdMap = null;
    setHybridLayerActiveElementId(elementId);
    setHybridLayerByElementId((prevRaw) => {
      const prev = normalizeHybridLayerMap(prevRaw);
      if (prev[elementId]) return prev;
      const next = {
        ...prev,
        [elementId]: { dx: 0, dy: 0 },
      };
      hybridLayerMapRef.current = next;
      markPlaybackOverlayInteraction({
        stage: "hybrid_marker_added",
        source,
        elementId,
      });
      createdMap = next;
      return next;
    });
    if (createdMap) {
      window.setTimeout(() => {
        void persistHybridLayerMap(createdMap, { source: `${source}_create` });
      }, 0);
    }
  }

  function handleHybridEditSurfacePointerDown(event, source = "hybrid_edit_surface") {
    if (hybridModeEffective !== "edit" || hybridUiPrefs.lock) return;
    const elementId = resolveHybridTargetElementIdFromPoint(event?.clientX, event?.clientY) || toNodeId(selectedElementId);
    withHybridOverlayGuard(event, { action: source, elementId });
    if (!elementId) return;
    addOrSelectHybridMarker(elementId, source);
  }

  function openPathsFromDiagram() {
    const intent = {
      version: DIAGRAM_PATHS_INTENT_VERSION,
      key: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      sid,
      action: "open_paths",
      tier: normalizePathTier(pathHighlightTier) || "P0",
      sequenceKey: normalizePathSequenceKey(pathHighlightSequenceKey),
      source: "diagram_action_bar",
    };
    setDiagramPathsIntent(intent);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
    setTab("interview");
    setDiagramActionPathOpen(false);
  }

  function toggleQualityOverlayFilter(keyRaw) {
    const key = toText(keyRaw);
    if (!key) return;
    setQualityOverlayFilters((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  }

  function setQualityOverlayAll(enabled) {
    const value = !!enabled;
    setQualityOverlayFilters({
      orphan: value,
      dead_end: value,
      gateway: value,
      link_errors: value,
      missing_duration: value,
      missing_notes: value,
      route_truncated: value,
    });
  }

  function focusQualityOverlayItem(itemRaw, source = "quality_overlay") {
    const item = asObject(itemRaw);
    const nodeId = toNodeId(item?.nodeId);
    if (!nodeId) return;
    if (tab !== "diagram") setTab("diagram");
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Issue" });
    }, 120);
    if (source === "quality_overlay_list") {
      setDiagramActionQualityOpen(false);
    }
  }

  const canSaveNow = !!hasSession && !!isBpmnTab && !isSwitchingTab && !isFlushingTab && !isManualSaveBusy;
  const saveSmartText = canSaveNow
    ? (saveDirtyHint ? "Сохранить" : "Сохранено ✓")
    : workbench.labels.save;
  const toolbarInlineMessage = String(genErr || infoMsg || "").trim();
  const toolbarInlineTone = genErr ? "err" : "";
  const canUseElementContextActions = !!selectedElementContext;
  const templateSelectionCount = selectedBpmnElementIds.length;
  const canCreateTemplateFromSelection = hasSession && tab === "diagram" && !templatesBusy && templateSelectionCount > 0;
  const canOpenTemplatesList = hasSession && !templatesBusy;
  const hasPathHighlightData = availablePathTiers.length > 0;

  return (
    <div className="processShell">
      <div className="processHeader diagramToolbarHeader">
        <div className="diagramToolbarSlot diagramToolbarSlot--left">
          {canSaveNow ? (
            saveDirtyHint ? (
              <button
                type="button"
                className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                onClick={handleSaveCurrentTab}
                title={workbench.saveTooltip}
                data-testid="diagram-toolbar-save"
              >
                {saveSmartText}
              </button>
            ) : (
              <span className="badge text-[11px] text-muted" data-testid="diagram-toolbar-save-status">
                {saveSmartText}
              </span>
            )
          ) : (
            <button
              type="button"
              className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
              disabled
              title={workbench.saveTooltip}
            >
              {workbench.labels.save}
            </button>
          )}
        </div>

        <div className="diagramToolbarSlot diagramToolbarSlot--center">
          <div className="seg" role="tablist" aria-label="Process tabs" aria-orientation="horizontal">
            {workbench.tabs.map((x) => (
              <button
                type="button"
                key={x.id}
                className={`segBtn rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === x.id ? "on bg-accent text-white" : "text-muted hover:bg-accentSoft hover:text-fg"}`}
                role="tab"
                aria-selected={tab === x.id}
                aria-current={tab === x.id ? "page" : undefined}
                tabIndex={tab === x.id ? 0 : -1}
                disabled={isSwitchingTab || isFlushingTab}
                onClick={async () => {
                  await switchTab(x.id);
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>

        <div className="diagramToolbarSlot diagramToolbarSlot--right">
          {tab === "diagram" ? (
            <div className="seg hidden lg:inline-flex" data-testid="diagram-mode-switch-inline">
              {[
                { id: "normal", label: "Normal" },
                { id: "interview", label: "Interview" },
                { id: "quality", label: "Quality" },
                { id: "coverage", label: "Coverage" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`segBtn px-2 py-1 text-[11px] ${diagramMode === mode.id ? "on" : ""}`}
                  onClick={() => applyDiagramMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          ) : null}
          {(tab === "diagram" || tab === "interview") && hasSession ? (
            <button
              type="button"
              className={`secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs ${attentionOpen ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => setAttentionOpen((prev) => !prev)}
              data-testid="attention-panel-toggle"
              title="Открыть список узлов с пробелами"
            >
              Требует внимания ({attentionItemsRaw.length})
            </button>
          ) : null}
          {toolbarInlineMessage ? (
            <span
              className={`badge hidden max-w-[36ch] truncate lg:inline-flex ${toolbarInlineTone ? toolbarInlineTone : ""}`}
              title={toolbarInlineMessage}
            >
              {toolbarInlineMessage}
            </span>
          ) : null}
          <button
            type="button"
            className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
            onClick={doGenerate}
            disabled={!workbench.canGenerate}
            title={workbench.generateTooltip}
          >
            {workbench.generateLabel}
          </button>
          <button
            ref={toolbarMenuButtonRef}
            type="button"
            className="secondaryBtn h-8 w-9 px-0 text-sm"
            onClick={() => setToolbarMenuOpen((prev) => !prev)}
            aria-expanded={toolbarMenuOpen ? "true" : "false"}
            aria-label="Открыть меню действий"
            data-testid="diagram-toolbar-overflow-toggle"
          >
            ⋯
          </button>
        </div>

        <input ref={importInputRef} type="file" accept=".bpmn,.xml,text/xml,application/xml" style={{ display: "none" }} onChange={onImportPicked} />
        <input
          ref={hybridV2FileInputRef}
          type="file"
          accept=".drawio,.xml,text/xml,application/xml"
          style={{ display: "none" }}
          data-testid="hybrid-v2-import-input"
          onChange={(event) => {
            const file = asArray(event?.target?.files)[0];
            if (file) {
              void handleHybridV2ImportFile(file);
            }
            if (event?.target) event.target.value = "";
          }}
        />
        <input
          ref={drawioFileInputRef}
          type="file"
          accept=".drawio,.xml,text/xml,application/xml"
          style={{ display: "none" }}
          data-testid="drawio-import-input"
          onChange={(event) => {
            const file = asArray(event?.target?.files)[0];
            if (file) {
              void handleDrawioImportFile(file);
            }
            if (event?.target) event.target.value = "";
          }}
        />

        {toolbarMenuOpen ? (
          <div ref={toolbarMenuRef} className="diagramToolbarOverlay" data-testid="diagram-toolbar-overlay">
            <div className="diagramToolbarOverlaySection">
              <div className="diagramToolbarOverlayTitle">Режимы</div>
              <div className="diagramToolbarOverlayRow">
                <span>Отображение</span>
                <div className="seg p-0.5" data-testid="diagram-mode-switch">
                  {[
                    { id: "normal", label: "Normal" },
                    { id: "interview", label: "Interview" },
                    { id: "quality", label: "Quality" },
                    { id: "coverage", label: "Coverage" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`segBtn px-2 py-1 text-[11px] ${diagramMode === mode.id ? "on" : ""}`}
                      onClick={() => applyDiagramMode(mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="diagramToolbarOverlayRow">
                <span>Команды</span>
                <div className="flex items-center gap-2">
                  <span className={`badge text-[10px] ${commandModeEnabled ? "ok" : ""}`}>{commandModeEnabled ? "ON" : "OFF"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={commandModeEnabled ? "true" : "false"}
                    className={`toolbarSwitch ${commandModeEnabled ? "on" : ""}`}
                    onClick={() => setCommandModeEnabled((prev) => !prev)}
                    data-testid="ai-command-toggle"
                  >
                    <span className="toolbarSwitchKnob" />
                  </button>
                </div>
              </div>
            </div>

            <div className="diagramToolbarOverlaySection">
              <div className="diagramToolbarOverlayTitle">Файл и версии</div>
              <div className="diagramToolbarOverlayActions">
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => {
                    openImportDialog();
                    setToolbarMenuOpen(false);
                  }}
                  disabled={!hasSession || !isBpmnTab}
                  title={workbench.importTooltip}
                >
                  {workbench.labels.importBpmn}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => {
                    void exportBpmn();
                    setToolbarMenuOpen(false);
                  }}
                  disabled={!hasSession}
                  title={workbench.labels.exportBpmn}
                  data-testid="bpmn-export-button"
                >
                  {workbench.labels.exportBpmn}
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => {
                    openVersionsModal();
                    setToolbarMenuOpen(false);
                  }}
                  disabled={!hasSession}
                  data-testid="bpmn-versions-open"
                >
                  Версии
                </button>
              </div>
            </div>

            <div className="diagramToolbarOverlaySection">
              <div className="diagramToolbarOverlayTitle">Контекст</div>
              {selectedElementId ? (
                <div className="diagramToolbarOverlayActions">
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      openInsertBetweenModal();
                      setToolbarMenuOpen(false);
                    }}
                    disabled={insertBetweenBusy || !selectedInsertBetween || !canInsertBetween}
                    title={!selectedInsertBetween ? "Выберите шаг/переход" : (!canInsertBetween ? insertBetweenErrorMessage(selectedInsertBetween?.error) : "Вставить шаг между")}
                    data-testid="diagram-insert-between-open"
                  >
                    Вставить между
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      onOpenElementNotes?.(selectedBpmnElement, "header_open_notes");
                      setToolbarMenuOpen(false);
                    }}
                    title="Открыть заметки выбранного элемента"
                  >
                    Открыть заметки
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      void generateAiQuestionsForSelectedElement();
                      setToolbarMenuOpen(false);
                    }}
                    disabled={!canGenerateAiQuestions}
                    data-testid="diagram-ai-generate-questions"
                    title={canGenerateAiQuestions ? "Сгенерировать AI-вопросы для выбранного элемента" : aiGenerateGate.reasonText}
                  >
                    {aiQuestionsBusy ? "AI работает…" : "Сгенерировать вопросы"}
                  </button>
                </div>
              ) : (
                <div className="muted small">Выберите элемент/переход на диаграмме, чтобы открыть контекстные действия.</div>
              )}
              {aiQuestionsStatus?.text ? (
                <div
                  className={`mt-2 rounded-md border px-2 py-1 text-[11px] ${
                    aiQuestionsStatus.kind === "error"
                      ? "border-danger/50 bg-danger/10 text-danger"
                      : (aiQuestionsStatus.kind === "warn" ? "border-warning/40 bg-warning/10 text-warning" : "border-success/40 bg-success/10 text-success")
                  }`}
                  data-testid="diagram-ai-questions-status"
                >
                  {aiQuestionsStatus.text}
                </div>
              ) : null}
            </div>

            <div className="diagramToolbarOverlaySection">
              <div className="diagramToolbarOverlayTitle">Шаблоны</div>
              <div className="diagramToolbarOverlayActions">
                <button
                  type="button"
                  className={`${templatesEnabled ? "primaryBtn" : "secondaryBtn"} h-7 px-2 text-[11px]`}
                  onClick={() => setTemplatesEnabled((prev) => !prev)}
                  disabled={!hasSession}
                  data-testid="template-pack-toggle"
                >
                  Шаблоны: {templatesEnabled ? "ON" : "OFF"}
                </button>
              </div>
              {templatesEnabled && selectedBpmnElementIds.length > 0 && suggestedTemplates.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-panel2/45 px-2 py-1 text-[11px] text-muted">
                  <span className="text-fg">Подходит:</span>
                  {suggestedTemplates.slice(0, 3).map((template) => (
                    <button
                      key={String(template?.id || "")}
                      type="button"
                      className="secondaryBtn h-7 px-2 text-[11px]"
                      onClick={() => void applyTemplate(template)}
                      title={`score=${Number(template?.score || 0).toFixed(2)}`}
                      data-testid="template-pack-suggest-item"
                    >
                      {String(template?.title || "Шаблон")}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {commandModeEnabled ? (
              <div className="diagramToolbarOverlaySection" data-testid="ai-command-panel">
                <div className="diagramToolbarOverlayTitle">Командный режим</div>
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="text"
                    className="input h-8 min-h-0 flex-1 px-3 py-0 text-xs"
                    placeholder="Команда BPMN: добавь шаг Проверить температуру после Start"
                    value={commandInput}
                    onChange={(e) => setCommandInput(String(e.target.value || ""))}
                    disabled={commandBusy}
                    data-testid="ai-command-input"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      void runAiCommand(commandInput);
                    }}
                  />
                  <button
                    type="button"
                    className="primaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                    disabled={commandBusy || !String(commandInput || "").trim()}
                    onClick={() => void runAiCommand(commandInput)}
                    data-testid="ai-command-run"
                  >
                    {commandBusy ? "AI работает…" : "Применить"}
                  </button>
                </div>
                {commandStatus?.text ? (
                  <div
                    className={`mb-2 rounded-md border px-2 py-1 text-xs ${
                      commandStatus.kind === "error"
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : (commandStatus.kind === "warn"
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : "border-success/50 bg-success/10 text-success")
                    }`}
                    data-testid="ai-command-status"
                  >
                    {commandStatus.text}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>История:</span>
                  {commandHistory.length === 0 ? <span>пока пусто</span> : null}
                  {commandHistory.slice(0, 5).map((item, idx) => (
                    <button
                      key={`cmd_${idx}_${item?.ts || 0}`}
                      type="button"
                      className="secondaryBtn h-7 max-w-[220px] truncate px-2 text-[11px]"
                      title={String(item?.text || "")}
                      onClick={() => setCommandInput(String(item?.text || ""))}
                      data-testid="ai-command-history-item"
                    >
                      {String(item?.text || "")}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="diagramToolbarOverlaySection">
              <div className="diagramToolbarOverlayTitle">Редкие действия</div>
              <div className="diagramToolbarOverlayActions">
                <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={runToolbarReset} title={workbench.labels.reset}>
                  {workbench.labels.reset}
                </button>
                <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={runToolbarClear} title={workbench.clearTooltip}>
                  {workbench.labels.clear}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {isBpmnTab && isQualityMode ? (
        <div
          className="aiBottleneckPanel qualityPanel m-3 rounded-xl border border-border bg-panel px-3 py-2"
          data-testid="quality-panel"
          onWheelCapture={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="aiBottleneckHead text-sm font-semibold">
              Качество схемы: {qualitySummary.total}
              <span className="ml-2 text-xs text-muted">
                errors: {qualitySummary.errors} · warns: {qualitySummary.warns}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                className="input h-8 min-h-0 px-2 py-0 text-xs"
                value={qualityProfile?.id || qualityProfileId}
                onChange={(e) => setQualityProfileId(String(e.target.value || "mvp"))}
                data-testid="quality-profile-select"
              >
                <option value="mvp">MVP</option>
                <option value="production">Production</option>
                <option value="haccp">HACCP</option>
              </select>
              <button
                type="button"
                className="secondaryBtn h-8 whitespace-nowrap px-2.5 text-xs"
                onClick={() => setQualityAutoFixOpen(true)}
                disabled={qualityAutoFixBusy || Number(qualityAutoFixPreview?.safeFixes || 0) <= 0}
                data-testid="quality-autofix-open"
              >
                Автоисправить ({Number(qualityAutoFixPreview?.safeFixes || 0)})
              </button>
            </div>
          </div>
          <div className="mb-2 text-xs text-muted">
            Профиль: <b className="text-fg">{qualityProfile?.title || qualityProfileId}</b>
            {qualityProfile?.isStub ? <span> · stub</span> : null}
            <span> · {qualityProfile?.description || ""}</span>
          </div>
          {qualityHints.length === 0 ? (
            <div className="muted small">Проблем не найдено.</div>
          ) : (
            <div className="aiBottleneckList qualityIssueList mt-2 space-y-1.5" onWheelCapture={(e) => e.stopPropagation()}>
              {qualityHints.map((item, idx) => {
                const nodeId = toNodeId(item?.nodeId);
                const reason = String(asArray(item?.reasons)[0] || "").trim() || "Проверьте элемент BPMN.";
                const key = `${nodeId}::${reason}`;
                const focused = key === qualityIssueFocusKey;
                const level = String(item?.level || "warn").toLowerCase() === "error" ? "error" : "warn";
                const nodeTitle = String(
                  qualityNodeTitleById[nodeId]
                  || coverageById[nodeId]?.title
                  || item?.title
                  || "",
                ).trim();
                const ui = qualityIssueCopy(item, nodeTitle);
                return (
                  <div
                    key={`${key}_${idx}`}
                    className={`aiBottleneckItem qualityIssueCard sev-${item.severity} w-full cursor-pointer rounded-lg border border-border bg-panel2 px-2 py-1 text-left ${focused ? "is-active ring-1 ring-accent/70" : ""}`}
                    onClick={() => focusQualityIssue(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        focusQualityIssue(item);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    data-testid="quality-issue-item"
                    data-node-id={nodeId}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b>{ui.title}</b>
                      <span className={`badge px-1.5 py-0 text-[10px] ${level === "error" ? "err" : "warn"}`}>{qualityLevelLabel(item?.level)}</span>
                      <span className="text-[11px] text-muted">{qualityImpactLabel(item)}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">{ui.short}</div>
                    <div className="mt-0.5 text-[11px] text-muted">Узел: <span className="text-fg">{ui.nodeTitle}</span></div>
                    <div className="mt-0.5 text-[11px] text-muted">Как исправить: {ui.fix}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="primaryBtn h-7 px-2 text-[11px]"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          focusQualityIssue(item);
                        }}
                      >
                        Показать на схеме
                      </button>
                      <details
                        className="qualityIssueDetails text-[11px] text-muted"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <summary className="cursor-pointer select-none hover:text-fg">Подробнее</summary>
                        <div className="mt-1 space-y-0.5 rounded border border-border/70 bg-panel px-2 py-1.5">
                          <div><span className="text-muted">rule_code:</span> <span className="font-mono text-fg">{ui.ruleId}</span></div>
                          <div><span className="text-muted">node_id:</span> <span className="font-mono text-fg">{nodeId || "—"}</span></div>
                          <div><span className="text-muted">score:</span> <span className="text-fg">{Number(item?.score || 0)}</span></div>
                          <div><span className="text-muted">raw:</span> <span className="text-fg">{reason}</span></div>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {isBpmnTab && isCoverageMode ? (
        <div className="aiBottleneckPanel m-3 rounded-xl border border-border bg-panel px-3 py-2" data-testid="coverage-panel">
          <div className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold">
            <span>Покрытие: {Number(coverageMatrix?.summary?.total || 0)} элементов</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => applyDiagramMode("normal")}
            >
              Скрыть
            </button>
          </div>
          <div className="mb-2 text-xs text-muted">
            без notes: <b className="text-fg">{Number(coverageMatrix?.summary?.missingNotes || 0)}</b>
            <span> · без AI: <b className="text-fg">{Number(coverageMatrix?.summary?.missingAiQuestions || 0)}</b></span>
            <span> · без duration/quality: <b className="text-fg">{Number(coverageMatrix?.summary?.missingDurationQuality || 0)}</b></span>
          </div>
          {coverageRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
              Пробелов покрытия не найдено.
            </div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-auto pr-1">
              {coverageRows.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-lg border border-border bg-panel2 px-2 py-1.5 text-left"
                  onClick={() => focusCoverageIssue(item, "coverage_panel")}
                  data-testid="coverage-issue-item"
                  data-element-id={item.id}
                >
                  <div className="text-xs font-semibold text-fg">{item.title}</div>
                  <div className="text-[11px] text-muted">
                    {item.missingNotes ? "notes " : ""}
                    {item.missingAiQuestions ? "ai_questions " : ""}
                    {item.missingDurationQuality ? "duration/quality" : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {isBpmnTab && aiBottleneckOn ? (
        <div className="aiBottleneckPanel m-3 rounded-xl border border-border bg-panel px-3 py-2">
          <div className="aiBottleneckHead text-sm font-semibold">{apiClarifyHints.length ? "API-уточнения на узлах" : "AI-подсветка узких мест"}: {activeHints.length}</div>
          {activeHints.length === 0 ? (
            <div className="muted small">Критичных узлов не найдено по текущим данным.</div>
          ) : (
            <div className="aiBottleneckList mt-2 space-y-2">
              {activeHints.map((b) => (
                <div key={b.nodeId} className={`aiBottleneckItem sev-${b.severity} rounded-lg border border-border bg-panel2 px-2 py-1.5`}>
                  <b>{b.title}</b> · score {b.score}
                  <span className="muted small"> · {b.reasons.join("; ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="processBody relative" ref={processBodyRef}>
        {!hasSession ? (
          <div className="h-full min-h-0 p-3">
            <WorkspaceDashboard
              activeOrgId={workspaceActiveOrgId}
              canInviteUsers={!!canInviteWorkspaceUsers}
              onOpenSession={(session) => onOpenWorkspaceSession?.(session)}
              onCreateProject={() => onCreateWorkspaceProject?.()}
              onCreateSession={() => onCreateWorkspaceSession?.()}
              onInviteUsers={() => onOpenWorkspaceOrgSettings?.()}
            />
          </div>
        ) : tab === "doc" ? (
          <DocStage
            sessionId={sid}
            draft={draft}
            qualityErrorCount={Number(qualitySummary?.errors || 0)}
            onRecalculateRtiers={onRecalculateRtiers}
            onClose={() => setTab("diagram")}
          />
        ) : (
          <div className="relative h-full min-h-0">
            <div className={isInterview ? "absolute inset-0 opacity-0 pointer-events-none" : "absolute inset-0"}>
              <div
                className={`bpmnStageHost h-full ${(hybridVisible && hybridUiPrefs.focus) ? "isHybridFocus" : ""}`}
                ref={bpmnStageHostRef}
              >
                {tab === "diagram" ? (
                  <>
                    <div className="bpmnCanvasTools diagramActionBar" ref={diagramActionBarRef}>
                      <button
                        type="button"
                        className={`primaryBtn h-8 min-w-[124px] px-2.5 text-xs ${pathHighlightEnabled ? "" : "opacity-95"}`}
                        onClick={() => {
                          setDiagramActionPathOpen((prev) => !prev);
                          setDiagramActionHybridToolsOpen(false);
                          setDiagramActionPlanOpen(false);
                          setDiagramActionPlaybackOpen(false);
                          setDiagramActionLayersOpen(false);
                          setDiagramActionRobotMetaOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionQualityOpen(false);
                          setDiagramActionOverflowOpen(false);
                        }}
                        data-testid="diagram-action-path-toggle"
                      >
                        <span>Подсветить путь</span>
                        <span className="diagramActionChip">{pathHighlightEnabled ? pathHighlightBadge : "off"}</span>
                      </button>
                      <button
                        type="button"
                        className={`secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary ${(hybridVisible || drawioUiState.enabled) ? "ring-1 ring-accent/60" : ""}`}
                        onClick={() => {
                          setDiagramActionHybridToolsOpen((prev) => !prev);
                          setDiagramActionPathOpen(false);
                          setDiagramActionPlanOpen(false);
                          setDiagramActionPlaybackOpen(false);
                          setDiagramActionLayersOpen(false);
                          setDiagramActionRobotMetaOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionQualityOpen(false);
                          setDiagramActionOverflowOpen(false);
                        }}
                        title="Hybrid Tools (Draw.io)"
                        data-testid="diagram-action-hybrid-tools-toggle"
                      >
                        <span>Draw.io</span>
                        <span className="diagramActionChip">{(drawioUiState.enabled || hybridVisible) ? (drawioUiState.enabled ? "full" : toText(hybridV2ToolState || hybridModeEffective || "on")) : "off"}</span>
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
                        onClick={openCreateTemplateModal}
                        disabled={!canCreateTemplateFromSelection}
                        title={canCreateTemplateFromSelection ? "Сохранить выделенные BPMN элементы как шаблон" : "Выделите BPMN элементы на Diagram"}
                        data-testid="template-pack-save-open"
                      >
                        {`Add template${templateSelectionCount > 0 ? ` (${templateSelectionCount})` : ""}`}
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
                        onClick={() => {
                          void openTemplatesPicker();
                        }}
                        disabled={!canOpenTemplatesList}
                        title="Открыть список шаблонов"
                        data-testid="template-pack-insert-open"
                      >
                        Templates
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
                        onClick={openSelectedElementNotes}
                        disabled={!canUseElementContextActions}
                        title={canUseElementContextActions ? "Открыть Notes для выбранного элемента" : "Выберите элемент на диаграмме"}
                        data-testid="diagram-action-notes"
                      >
                        Notes
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
                        onClick={openSelectedElementAi}
                        disabled={!canUseElementContextActions}
                        title={canUseElementContextActions ? "Открыть AI-вопросы для выбранного элемента" : "Выберите элемент на диаграмме"}
                        data-testid="diagram-action-ai"
                      >
                        AI
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-2 text-[11px] diagramActionSecondary"
                        onClick={openReportsFromDiagram}
                        disabled={!hasSession}
                        title="Открыть Reports для выбранного сценария"
                        data-testid="diagram-action-reports"
                      >
                        Reports
                      </button>
                      <button
                        type="button"
                        className={`secondaryBtn h-8 px-2 text-[11px] ${diagramActionPlanOpen ? "ring-1 ring-accent/60" : ""}`}
                        onClick={() => {
                          setDiagramActionPlanOpen((prev) => !prev);
                          setDiagramActionPathOpen(false);
                          setDiagramActionHybridToolsOpen(false);
                          setDiagramActionPlaybackOpen(false);
                          setDiagramActionLayersOpen(false);
                          setDiagramActionRobotMetaOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionQualityOpen(false);
                          setDiagramActionOverflowOpen(false);
                        }}
                        title={`Экспорт плана: ${toText(executionPlanSource?.scenarioLabel) || "Scenario"}`}
                        data-testid="diagram-action-export-plan"
                      >
                        Export Plan
                      </button>
                      <button
                        type="button"
                        className={`secondaryBtn h-8 px-2 text-[11px] ${diagramActionPlaybackOpen || playbackIsPlaying ? "ring-1 ring-accent/60" : ""}`}
                        onClick={() => {
                          setDiagramActionPlaybackOpen((prev) => !prev);
                          setDiagramActionPathOpen(false);
                          setDiagramActionPlanOpen(false);
                          setDiagramActionHybridToolsOpen(false);
                          setDiagramActionLayersOpen(false);
                          setDiagramActionRobotMetaOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionQualityOpen(false);
                          setDiagramActionOverflowOpen(false);
                        }}
                        title={`Проезд по сценарию: ${toText(playbackScenarioLabel) || "Scenario"}`}
                        data-testid="diagram-action-playback"
                      >
                        ▶ Проезд
                      </button>
                      <button
                        type="button"
                        className={`secondaryBtn h-8 px-2 text-[11px] ${diagramActionLayersOpen || hybridVisible || drawioUiState.enabled ? "ring-1 ring-accent/60" : ""}`}
                        onClick={() => {
                          setDiagramActionLayersOpen((prev) => !prev);
                          setDiagramActionPathOpen(false);
                          setDiagramActionPlanOpen(false);
                          setDiagramActionHybridToolsOpen(false);
                          setDiagramActionRobotMetaOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionQualityOpen(false);
                          setDiagramActionOverflowOpen(false);
                        }}
                        title="Управление Hybrid Layer"
                        data-testid="diagram-action-layers"
                      >
                        Layers
                      </button>
                      <button
                        type="button"
                        className={`secondaryBtn h-8 px-2 text-[11px] ${robotMetaOverlayEnabled ? "ring-1 ring-accent/60" : ""}`}
                        onClick={() => {
                          setDiagramActionRobotMetaOpen((prev) => !prev);
                          setDiagramActionPathOpen(false);
                          setDiagramActionPlanOpen(false);
                          setDiagramActionPlaybackOpen(false);
                          setDiagramActionHybridToolsOpen(false);
                          setDiagramActionLayersOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionQualityOpen(false);
                          setDiagramActionOverflowOpen(false);
                          setRobotMetaOverlayEnabled(true);
                          setRobotMetaOverlayFilters((prev) => {
                            const next = {
                              ready: !!prev?.ready,
                              incomplete: !!prev?.incomplete,
                            };
                            if (!next.ready && !next.incomplete) {
                              return { ready: true, incomplete: true };
                            }
                            return next;
                          });
                        }}
                        title="Подсветка готовности Robot Meta"
                        data-testid="diagram-action-robotmeta"
                      >
                        Robot Meta {robotMetaOverlayEnabled ? `(${robotMetaCounts.ready}/${robotMetaCounts.incomplete})` : "off"}
                      </button>
                      <button
                        type="button"
                        className={`secondaryBtn h-8 px-2 text-[11px] ${activeQualityOverlayCount > 0 ? "ring-1 ring-accent/60" : ""}`}
                        onClick={() => {
                          setDiagramActionQualityOpen((prev) => !prev);
                          setDiagramActionPathOpen(false);
                          setDiagramActionPlanOpen(false);
                          setDiagramActionPlaybackOpen(false);
                          setDiagramActionHybridToolsOpen(false);
                          setDiagramActionLayersOpen(false);
                          setDiagramActionRobotMetaOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionOverflowOpen(false);
                        }}
                        title="Проблемы на диаграмме"
                        data-testid="diagram-action-quality"
                      >
                        Проблемы {activeQualityOverlayCount > 0 ? `(${activeQualityOverlayCount})` : ""}
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 w-8 px-0 text-sm"
                        onClick={() => {
                          setDiagramActionOverflowOpen((prev) => !prev);
                          setDiagramActionPathOpen(false);
                          setDiagramActionPlanOpen(false);
                          setDiagramActionPlaybackOpen(false);
                          setDiagramActionHybridToolsOpen(false);
                          setDiagramActionLayersOpen(false);
                          setDiagramActionRobotMetaOpen(false);
                          setRobotMetaListOpen(false);
                          setDiagramActionQualityOpen(false);
                        }}
                        aria-label="Открыть дополнительные действия Diagram"
                        data-testid="diagram-action-overflow"
                      >
                        ⋯
                      </button>
                      <div className="diagramActionBarSpacer" />
                      <button
                        type="button"
                        className="iconBtn"
                        onClick={() => bpmnRef.current?.zoomOut?.()}
                        disabled={!isBpmnTab}
                        title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom out"}
                        data-testid="diagram-zoom-out"
                      >
                        –
                      </button>
                      <button
                        type="button"
                        className="iconBtn"
                        onClick={() => bpmnRef.current?.fit?.()}
                        disabled={!isBpmnTab}
                        title={!isBpmnTab ? "Доступно в Diagram/XML" : "Fit"}
                        data-testid="diagram-zoom-fit"
                      >
                        ↔
                      </button>
                      <button
                        type="button"
                        className="iconBtn"
                        onClick={() => bpmnRef.current?.zoomIn?.()}
                        disabled={!isBpmnTab}
                        title={!isBpmnTab ? "Доступно в Diagram/XML" : "Zoom in"}
                        data-testid="diagram-zoom-in"
                      >
                        +
                      </button>
                    </div>

                    {diagramActionPathOpen ? (
                      <div className="diagramActionPopover diagramActionPopover--path" ref={diagramPathPopoverRef} data-testid="diagram-action-path-popover">
                        <div className="diagramActionPopoverHead">
                          <span>Path highlight</span>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => setDiagramActionPathOpen(false)}
                          >
                            Закрыть
                          </button>
                        </div>
                        {!hasPathHighlightData ? (
                          <div className="diagramActionPopoverEmpty">
                            Нет path-meta в `bpmn_meta.node_path_meta/flow_meta`.
                          </div>
                        ) : (
                          <>
                            <label className="diagramActionCheckboxRow">
                              <input
                                type="checkbox"
                                checked={pathHighlightEnabled}
                                onChange={(event) => setPathHighlightEnabled(!!event.target.checked)}
                              />
                              <span>Включить подсветку</span>
                            </label>
                            <div className="diagramActionTierList">
                              {availablePathTiers.map((tier) => {
                                const row = asObject(pathHighlightCatalog[tier]);
                                const selected = tier === pathHighlightTier;
                                return (
                                  <button
                                    key={`path_tier_${tier}`}
                                    type="button"
                                    className={`diagramActionTierBtn ${selected ? "isActive" : ""}`}
                                    onClick={() => {
                                      setPathHighlightTier(tier);
                                      setPathHighlightSequenceKey("");
                                      setPathHighlightEnabled(true);
                                    }}
                                  >
                                    <span>{tier}</span>
                                    <span className="diagramActionTierMeta">{Number(row?.nodes || 0)} узл · {Number(row?.flows || 0)} flow</span>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="diagramActionField">
                              <span>Alt / sequence</span>
                              <select
                                className="select h-8 min-h-0 text-xs"
                                value={pathHighlightSequenceKey}
                                onChange={(event) => {
                                  setPathHighlightSequenceKey(toText(event.target.value));
                                  setPathHighlightEnabled(true);
                                }}
                              >
                                <option value="">Все для {pathHighlightTier || "tier"}</option>
                                {availableSequenceKeysForTier.map((key) => (
                                  <option key={`path_seq_${key}`} value={key}>{key}</option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                        <div className="diagramActionPopoverActions">
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={openPathsFromDiagram}
                          >
                            Открыть Paths
                          </button>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={openReportsFromDiagram}
                          >
                            Открыть Reports
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <HybridToolsPalette
                      open={diagramActionHybridToolsOpen}
                      popoverRef={diagramHybridToolsPopoverRef}
                      state={hybridToolsUiState}
                      drawioState={drawioUiState}
                      onToggleVisible={toggleHybridToolsVisible}
                      onSetTool={selectHybridPaletteTool}
                      onSetMode={setHybridToolsMode}
                      onOpenDrawioEditor={openEmbeddedDrawioEditor}
                      onToggleDrawioVisible={toggleDrawioEnabled}
                      onSetDrawioOpacity={setDrawioOpacity}
                      onToggleDrawioLock={toggleDrawioLock}
                      onImportDrawio={() => drawioFileInputRef.current?.click?.()}
                      onExportDrawio={exportEmbeddedDrawio}
                      onClose={() => setDiagramActionHybridToolsOpen(false)}
                    />

                    {diagramActionPlanOpen ? (
                      <div className="diagramActionPopover diagramActionPopover--plan" ref={diagramPlanPopoverRef} data-testid="diagram-action-plan-popover">
                        <div className="diagramActionPopoverHead">
                          <span>Execution Plan</span>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => setDiagramActionPlanOpen(false)}
                          >
                            Закрыть
                          </button>
                        </div>
                        <div className="diagramActionField">
                          <span>Экспорт плана:</span>
                          <b>{toText(executionPlanSource?.scenarioLabel) || "Scenario"}</b>
                          <span className="muted small">path: {toText(executionPlanSource?.pathId) || "—"}</span>
                        </div>
                        {!canExportExecutionPlan ? (
                          <div className="diagramActionPopoverEmpty">Нет шагов для экспорта в текущем source.</div>
                        ) : executionPlanBusy && !executionPlanPreview ? (
                          <div className="diagramActionPopoverEmpty">Сбор Execution Plan…</div>
                        ) : (
                          <>
                            <div className="diagramIssueRows">
                              <div className="diagramIssueRow">
                                Steps: <b>{Number(asObject(executionPlanPreview?.stats).steps_total || 0)}</b>
                                {" · "}
                                Ready: <b>{Number(asObject(executionPlanPreview?.stats).robot_ready || 0)}</b>
                                {" · "}
                                Incomplete: <b data-testid="diagram-action-plan-summary-incomplete">{Number(asObject(executionPlanPreview?.stats).robot_incomplete || 0)}</b>
                                {" · "}
                                Human: <b>{Number(asObject(executionPlanPreview?.stats).human_only || 0)}</b>
                              </div>
                              <div className="diagramIssueRow muted small">
                                hash: {shortHash(executionPlanPreview?.steps_hash)}
                              </div>
                            </div>
                            {Number(asObject(executionPlanPreview?.stats).robot_incomplete || 0) > 0 ? (
                              <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning">
                                План не полностью роботизируем: incomplete {Number(asObject(executionPlanPreview?.stats).robot_incomplete || 0)}
                              </div>
                            ) : null}
                            <div className="diagramIssueListWrap mt-2 border-t border-border/70 pt-2">
                              <div className="muted mb-1 text-[11px]">Issues (top 10)</div>
                              <div className="diagramIssueList">
                                {asArray(executionPlanPreview?.issues).slice(0, 10).length === 0 ? (
                                  <div className="diagramActionPopoverEmpty">Нет issues.</div>
                                ) : (
                                  asArray(executionPlanPreview?.issues).slice(0, 10).map((issueRaw, idx) => {
                                    const issue = asObject(issueRaw);
                                    return (
                                      <div key={`plan_issue_${idx}_${toText(issue?.code)}`} className="diagramIssueListItem">
                                        <span className="diagramIssueListItemTitle">{toText(issue?.code) || "ISSUE"}</span>
                                        <span className="diagramIssueListItemMeta">
                                          #{Number(issue?.order_index || 0)} · {toText(issue?.bpmn_id) || "—"} · {toText(issue?.severity) || "warn"}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </>
                        )}
                        {executionPlanError ? (
                          <div className="mt-2 text-[11px] text-danger">{executionPlanError}</div>
                        ) : null}
                        <div className="diagramActionPopoverActions">
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => void copyExecutionPlanFromDiagram()}
                            disabled={!canExportExecutionPlan || executionPlanBusy}
                            data-testid="diagram-action-plan-copy"
                          >
                            Copy JSON
                          </button>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => void downloadExecutionPlanFromDiagram()}
                            disabled={!canExportExecutionPlan || executionPlanBusy}
                            data-testid="diagram-action-plan-download"
                          >
                            Download .json
                          </button>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => void saveExecutionPlanVersionFromDiagram()}
                            disabled={!canExportExecutionPlan || executionPlanBusy || executionPlanSaveBusy}
                            data-testid="diagram-action-plan-save"
                          >
                            {executionPlanSaveBusy ? "Saving…" : "Save version"}
                          </button>
                        </div>
                        <div className="diagramActionField">
                          <span>Сохранённых версий:</span>
                          <b data-testid="diagram-action-plan-versions-count">{executionPlanVersions.length}</b>
                        </div>
                        {executionPlanVersions.length > 0 ? (
                          <div className="diagramIssueListWrap">
                            <div className="diagramIssueList">
                              {executionPlanVersions.slice(-5).reverse().map((versionRaw) => {
                                const version = asObject(versionRaw);
                                return (
                                  <div key={`plan_version_${toText(version?.id)}`} className="diagramIssueListItem">
                                    <span className="diagramIssueListItemTitle">{toText(version?.path_id) || "path"}</span>
                                    <span className="diagramIssueListItemMeta">
                                      {toText(version?.created_at).replace("T", " ").slice(0, 19)} · {shortHash(version?.steps_hash)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        {executionPlanPreview ? (
                          <div className="diagramActionField">
                            <span>JSON preview</span>
                            <pre className="diagramActionJsonPreview" data-testid="diagram-action-plan-json-preview">
                              {JSON.stringify(executionPlanPreview, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {diagramActionPlaybackOpen ? (
                      <div className="diagramActionPopover diagramActionPopover--playback" ref={diagramPlaybackPopoverRef} data-testid="diagram-action-playback-popover">
                        <div className="diagramActionPopoverHead">
                          <span>Process Playback</span>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => setDiagramActionPlaybackOpen(false)}
                          >
                            Закрыть
                          </button>
                        </div>
                        {!!toText(playbackGraphError) ? (
                          <div className="diagramActionPopoverEmpty">
                            Graph error: {toText(playbackGraphError)}
                          </div>
                        ) : !playbackCanRun ? (
                          <div className="diagramActionPopoverEmpty">
                            Нет событий playback. Нажмите Reset.
                          </div>
                        ) : (
                          <>
                            <div className="diagramActionField">
                              <span>Сценарий:</span>
                              <b>{toText(playbackScenarioLabel) || "Scenario"}</b>
                              <span className="muted small">path: {toText(executionPlanSource?.pathId) || "—"}</span>
                            </div>
                            <div className="diagramActionField">
                              <span>Scenario selector</span>
                              <select
                                className="select h-8 min-h-0 text-xs"
                                value={playbackScenarioKey}
                                onChange={(event) => setPlaybackScenarioKey(toText(event.target.value) || "active")}
                                data-testid="diagram-action-playback-scenario"
                              >
                                {playbackScenarioOptions.map((optionRaw) => {
                                  const option = asObject(optionRaw);
                                  const key = toText(option?.key);
                                  return (
                                    <option key={`playback_scenario_${key}`} value={key}>
                                      {toText(option?.label || key)}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                            <div className="diagramIssueRows">
                              <div className="diagramIssueRow">
                                <span>Event</span>
                                <b data-testid="diagram-action-playback-progress">
                                  {Math.min(playbackIndexClamped + 1, Math.max(playbackTotal, 1))} / {playbackTotal}
                                </b>
                              </div>
                              <div className="diagramIssueRow">
                                <span className="truncate" title={playbackEventTitle(playbackCurrentEvent)}>
                                  {playbackEventTitle(playbackCurrentEvent)}
                                </span>
                                <span className="muted small" data-testid="diagram-action-playback-event-type">
                                  {toText(playbackCurrentEvent?.type) || "—"}
                                </span>
                              </div>
                              {toText(playbackCurrentEvent?.flowId) ? (
                                <div className="diagramIssueRow">
                                  <span>flow</span>
                                  <span className="diagramIssueChip">{toText(playbackCurrentEvent?.flowId)}</span>
                                </div>
                              ) : null}
                              {toText(playbackCurrentEvent?.nodeId || playbackCurrentEvent?.gatewayId) ? (
                                <div className="diagramIssueRow">
                                  <span>node</span>
                                  <span className="diagramIssueChip">
                                    {toText(playbackCurrentEvent?.nodeId || playbackCurrentEvent?.gatewayId)}
                                  </span>
                                </div>
                              ) : null}
                              {toText(playbackCurrentEvent?.reason) ? (
                                <div className="diagramIssueRow">
                                  <span>reason</span>
                                  <span className="diagramIssueChip">{toText(playbackCurrentEvent?.reason)}</span>
                                </div>
                              ) : null}
                              {toText(playbackCurrentEvent?.type) === "stop" ? (
                                <>
                                  <div className="diagramIssueRow">
                                    <span>steps</span>
                                    <span className="diagramIssueChip">
                                      {Number(asObject(playbackCurrentEvent?.metrics)?.stepsTotal || 0)}
                                    </span>
                                  </div>
                                  <div className="diagramIssueRow">
                                    <span>variations</span>
                                    <span className="diagramIssueChip">
                                      {Number(asObject(playbackCurrentEvent?.metrics)?.variationPoints || 0)}
                                    </span>
                                  </div>
                                  <div className="diagramIssueRow">
                                    <span>decisions</span>
                                    <span className="diagramIssueChip">
                                      m:{Number(asObject(playbackCurrentEvent?.metrics)?.manualDecisionsApplied || 0)}
                                      {" / "}
                                      a:{Number(asObject(playbackCurrentEvent?.metrics)?.autoDecisionsApplied || 0)}
                                    </span>
                                  </div>
                                  <div className="diagramIssueRow">
                                    <span>flows</span>
                                    <span className="diagramIssueChip">
                                      {Number(asObject(playbackCurrentEvent?.metrics)?.flowTransitions || 0)}
                                    </span>
                                  </div>
                                </>
                              ) : null}
                            </div>
                            <div className="diagramActionPopoverActions">
                              <button
                                type="button"
                                className="secondaryBtn h-7 px-2 text-[11px]"
                                onClick={handlePlaybackPrev}
                                disabled={playbackIndexClamped <= 0}
                                data-testid="diagram-action-playback-prev"
                              >
                                ⏮
                              </button>
                              <button
                                type="button"
                                className="secondaryBtn h-7 px-2 text-[11px]"
                                onClick={handlePlaybackTogglePlay}
                                data-testid="diagram-action-playback-play"
                              >
                                {playbackIsPlaying ? "⏸ Pause" : "▶ Play"}
                              </button>
                              <button
                                type="button"
                                className="secondaryBtn h-7 px-2 text-[11px]"
                                onClick={handlePlaybackNext}
                                data-testid="diagram-action-playback-next"
                              >
                                ⏭
                              </button>
                              <button
                                type="button"
                                className="secondaryBtn h-7 px-2 text-[11px]"
                                onClick={handlePlaybackReset}
                                data-testid="diagram-action-playback-reset"
                              >
                                Reset
                              </button>
                            </div>
                            <div className="diagramActionField">
                              <span>Speed</span>
                              <select
                                className="select h-8 min-h-0 text-xs"
                                value={playbackSpeed}
                                onChange={(event) => setPlaybackSpeed(toText(event.target.value) || "1")}
                                data-testid="diagram-action-playback-speed"
                              >
                                <option value="0.5">0.5x</option>
                                <option value="1">1x</option>
                                <option value="2">2x</option>
                                <option value="4">4x</option>
                              </select>
                            </div>
                            <label className="diagramActionCheckboxRow mt-1">
                              <input
                                type="checkbox"
                                checked={!!playbackManualAtGateway}
                                onChange={(event) => setPlaybackManualAtGateway(!!event.target.checked)}
                                data-testid="diagram-action-playback-manual-gateway"
                              />
                              <span>Manual at gateways</span>
                            </label>
                            <label className="diagramActionCheckboxRow mt-1">
                              <input
                                type="checkbox"
                                checked={!!playbackAutoCamera}
                                onChange={(event) => setPlaybackAutoCamera(!!event.target.checked)}
                                data-testid="diagram-action-playback-autocamera"
                              />
                              <span>Auto-camera</span>
                            </label>
                            {asObject(playbackGatewayPending)?.type === "wait_for_gateway_decision" ? (
                              <div className="diagramIssueListWrap mt-2">
                                <div className="muted mb-1 text-[11px]">
                                  Gateway: {formatPlaybackGatewayTitle(playbackGatewayPending)}
                                </div>
                                <div className="diagramActionPopoverActions">
                                  {asArray(playbackGatewayPending?.outgoingOptions).map((optionRaw, index) => {
                                    const option = asObject(optionRaw);
                                    const flowId = toText(option?.flowId);
                                    const label = playbackGatewayOptionLabel(option, index);
                                    const targetHint = toText(option?.targetName || option?.targetId);
                                    return (
                                      <button
                                        key={`playback_gateway_option_${flowId}`}
                                        type="button"
                                        className="secondaryBtn h-7 px-2 text-[11px]"
                                        title={targetHint ? `→ ${targetHint}` : ""}
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          markPlaybackOverlayInteraction({
                                            stage: "manual_gateway_button_mousedown",
                                            gatewayId: toText(playbackGatewayPending?.gatewayId),
                                            flowId,
                                          });
                                        }}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          handlePlaybackGatewayDecision(playbackGatewayPending?.gatewayId, flowId);
                                        }}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}

                    <LayersPopover
                      open={diagramActionLayersOpen}
                      popoverRef={diagramLayersPopoverRef}
                      onClose={() => setDiagramActionLayersOpen(false)}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        markPlaybackOverlayInteraction({ stage: "layers_popover_mousedown" });
                      }}
                      hybridVisible={hybridVisible}
                      hybridTotalCount={hybridTotalCount}
                      showHybridLayer={showHybridLayer}
                      hideHybridLayer={hideHybridLayer}
                      focusHybridLayer={focusHybridLayer}
                      hybridModeEffective={hybridModeEffective}
                      setHybridLayerMode={setHybridLayerMode}
                      hybridUiPrefs={hybridUiPrefs}
                      onOpenHybridTools={() => {
                        setDiagramActionHybridToolsOpen(true);
                        setDiagramActionLayersOpen(false);
                      }}
                      setHybridLayerOpacity={setHybridLayerOpacity}
                      toggleHybridLayerLock={toggleHybridLayerLock}
                      toggleHybridLayerFocus={toggleHybridLayerFocus}
                      drawioState={drawioUiState}
                      onOpenDrawioEditor={openEmbeddedDrawioEditor}
                      onToggleDrawioVisible={toggleDrawioEnabled}
                      onSetDrawioOpacity={setDrawioOpacity}
                      onToggleDrawioLock={toggleDrawioLock}
                      onImportEmbeddedDrawioClick={() => drawioFileInputRef.current?.click?.()}
                      onExportEmbeddedDrawio={exportEmbeddedDrawio}
                      hybridV2DocLive={hybridV2DocLive}
                      hybridV2HiddenCount={hybridV2HiddenCount}
                      revealAllHybridV2={revealAllHybridV2}
                      toggleHybridV2LayerVisibility={toggleHybridV2LayerVisibility}
                      toggleHybridV2LayerLock={toggleHybridV2LayerLock}
                      setHybridV2LayerOpacity={setHybridV2LayerOpacity}
                      hybridV2ActiveId={hybridV2ActiveId}
                      hybridV2SelectedIds={hybridV2SelectedIds}
                      legacyActiveElementId={hybridLayerActiveElementId}
                      hybridV2BindPickMode={hybridV2BindPickMode}
                      setHybridV2BindPickMode={setHybridV2BindPickMode}
                      goToActiveHybridBinding={goToActiveHybridBinding}
                      hybridV2BindingByHybridId={hybridV2BindingByHybridId}
                      exportHybridV2Drawio={exportHybridV2Drawio}
                      onImportDrawioClick={() => hybridV2FileInputRef.current?.click?.()}
                      hybridV2ImportNotice={hybridV2ImportNotice}
                      hybridLayerCounts={hybridLayerCounts}
                      hybridLayerVisibilityStats={hybridLayerVisibilityStats}
                      cleanupMissingHybridBindings={cleanupMissingHybridBindings}
                      hybridLayerRenderRows={hybridLayerRenderRows}
                      hybridV2Renderable={hybridV2Renderable}
                      setHybridV2ActiveId={setHybridV2ActiveId}
                      deleteSelectedHybridIds={deleteSelectedHybridIds}
                      deleteLegacyHybridMarkers={deleteLegacyHybridMarkers}
                      bpmnRef={bpmnRef}
                      goToHybridLayerItem={goToHybridLayerItem}
                    />

                    {diagramActionRobotMetaOpen ? (
                      <div className="diagramActionPopover diagramActionPopover--robotmeta" ref={diagramRobotMetaPopoverRef} data-testid="diagram-action-robotmeta-popover">
                        <div className="diagramActionPopoverHead">
                          <span>Robot Meta</span>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => setDiagramActionRobotMetaOpen(false)}
                          >
                            Закрыть
                          </button>
                        </div>
                        <div className="diagramIssueRows">
                          <div className="diagramIssueRow">
                            <label className="diagramActionCheckboxRow">
                              <input
                                type="checkbox"
                                checked={!!robotMetaOverlayFilters?.ready}
                                onChange={() => toggleRobotMetaOverlayFilter("ready")}
                                data-testid="diagram-action-robotmeta-filter-ready"
                              />
                              <span>Ready ({Number(robotMetaCounts.ready || 0)})</span>
                            </label>
                          </div>
                          <div className="diagramIssueRow">
                            <label className="diagramActionCheckboxRow">
                              <input
                                type="checkbox"
                                checked={!!robotMetaOverlayFilters?.incomplete}
                                onChange={() => toggleRobotMetaOverlayFilter("incomplete")}
                                data-testid="diagram-action-robotmeta-filter-incomplete"
                              />
                              <span>Incomplete ({Number(robotMetaCounts.incomplete || 0)})</span>
                            </label>
                          </div>
                        </div>
                        <div className="diagramActionPopoverActions">
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={showRobotMetaOverlay}
                            data-testid="diagram-action-robotmeta-show"
                          >
                            Показать
                          </button>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={resetRobotMetaOverlay}
                            data-testid="diagram-action-robotmeta-reset"
                          >
                            Сбросить
                          </button>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => setRobotMetaListOpen((prev) => !prev)}
                            data-testid="diagram-action-robotmeta-list-toggle"
                          >
                            Список…
                          </button>
                        </div>
                        {robotMetaListOpen ? (
                          <div className="diagramIssueListWrap mt-2 border-t border-border/70 pt-2" ref={diagramRobotMetaListRef} data-testid="diagram-action-robotmeta-list">
                            <input
                              type="text"
                              className="input h-8 min-h-0 text-xs"
                              value={robotMetaListSearch}
                              onChange={(event) => setRobotMetaListSearch(toText(event.target.value))}
                              placeholder="Поиск по названию / bpmn_id / executor"
                              data-testid="diagram-action-robotmeta-search"
                            />
                            <div className="diagramActionTabRow">
                              <button
                                type="button"
                                className={`diagramActionTabBtn ${robotMetaListTab === "ready" ? "isActive" : ""}`}
                                onClick={() => setRobotMetaListTab("ready")}
                                data-testid="diagram-action-robotmeta-tab-ready"
                              >
                                Ready
                              </button>
                              <button
                                type="button"
                                className={`diagramActionTabBtn ${robotMetaListTab === "incomplete" ? "isActive" : ""}`}
                                onClick={() => setRobotMetaListTab("incomplete")}
                                data-testid="diagram-action-robotmeta-tab-incomplete"
                              >
                                Incomplete
                              </button>
                            </div>
                            <div className="diagramIssueList">
                              {robotMetaListItems.length === 0 ? (
                                <div className="diagramActionPopoverEmpty">Ничего не найдено.</div>
                              ) : (
                                robotMetaListItems.slice(0, 120).map((itemRaw) => {
                                  const item = asObject(itemRaw);
                                  const nodeId = toText(item?.nodeId);
                                  const title = toText(item?.title || nodeId) || nodeId;
                                  return (
                                    <button
                                      key={`robotmeta_item_${robotMetaListTab}_${nodeId}`}
                                      type="button"
                                      className="diagramIssueListItem"
                                      onClick={() => focusRobotMetaItem(item, "robot_meta_list")}
                                      title={`${title} · ${nodeId}`}
                                      data-testid="diagram-action-robotmeta-item"
                                    >
                                      <span className="diagramIssueListItemTitle">{title}</span>
                                      <span className="diagramIssueListItemMeta">{nodeId}</span>
                                      <span className="diagramIssueListItemChips">
                                        <span className="diagramIssueChip">{toText(item?.mode) || "human"}</span>
                                        <span className="diagramIssueChip">{toText(item?.executor) || "executor:—"}</span>
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {diagramActionQualityOpen ? (
                      <div className="diagramActionPopover diagramActionPopover--quality" ref={diagramQualityPopoverRef} data-testid="diagram-action-quality-popover">
                        <div className="diagramActionPopoverHead">
                          <span>Проблемы на диаграмме</span>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => setDiagramActionQualityOpen(false)}
                          >
                            Закрыть
                          </button>
                        </div>
                        <div className="diagramActionPopoverActions">
                          <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => setQualityOverlayAll(true)}>
                            Показать все
                          </button>
                          <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => setQualityOverlayAll(false)}>
                            Сбросить
                          </button>
                        </div>
                        <div className="diagramIssueRows">
                          {qualityOverlayRows.map((row) => {
                            const checked = !!qualityOverlayFilters?.[row.key];
                            return (
                              <div className="diagramIssueRow" key={`quality_row_${row.key}`}>
                                <label className="diagramActionCheckboxRow">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleQualityOverlayFilter(row.key)}
                                  />
                                  <span>{row.label} ({row.count})</span>
                                </label>
                                <button
                                  type="button"
                                  className="secondaryBtn h-7 px-2 text-[11px]"
                                  onClick={() => {
                                    setQualityOverlayListKey((prev) => (prev === row.key ? "" : row.key));
                                    setQualityOverlaySearch("");
                                  }}
                                  disabled={row.count <= 0}
                                >
                                  Список
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {qualityOverlayListKey ? (
                          <div className="diagramIssueListWrap">
                            <input
                              type="text"
                              className="input h-8 min-h-0 text-xs"
                              value={qualityOverlaySearch}
                              onChange={(event) => setQualityOverlaySearch(toText(event.target.value))}
                              placeholder="Поиск по названию / bpmn_id"
                            />
                            <div className="diagramIssueList">
                              {qualityOverlayListItems.length === 0 ? (
                                <div className="diagramActionPopoverEmpty">Ничего не найдено.</div>
                              ) : (
                                qualityOverlayListItems.map((itemRaw) => {
                                  const item = asObject(itemRaw);
                                  const nodeId = toText(item?.nodeId);
                                  return (
                                    <button
                                      key={`quality_item_${qualityOverlayListKey}_${nodeId}`}
                                      type="button"
                                      className="diagramIssueListItem"
                                      onClick={() => focusQualityOverlayItem(item, "quality_overlay_list")}
                                      title={`${toText(item?.title)} · ${nodeId}`}
                                    >
                                      <span className="diagramIssueListItemTitle">{toText(item?.title) || nodeId}</span>
                                      <span className="diagramIssueListItemMeta">{nodeId}</span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {diagramActionOverflowOpen ? (
                      <div className="diagramActionPopover diagramActionPopover--overflow" ref={diagramOverflowPopoverRef} data-testid="diagram-action-overflow-popover">
                        <div className="diagramActionPopoverHead">
                          <span>Действия Diagram</span>
                          <button
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => setDiagramActionOverflowOpen(false)}
                          >
                            Закрыть
                          </button>
                        </div>
                        <div className="diagramActionPopoverActions">
                          {selectedInsertBetween ? (
                            <button
                              type="button"
                              className="secondaryBtn h-7 px-2 text-[11px]"
                              onClick={openInsertBetweenModal}
                              disabled={insertBetweenBusy || !canInsertBetween}
                              title={canInsertBetween ? "Вставить шаг между" : insertBetweenErrorMessage(selectedInsertBetween?.error)}
                            >
                              Вставить между
                            </button>
                          ) : (
                            <div className="diagramActionPopoverEmpty">Дублирующих действий нет.</div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <BpmnStage
                  ref={bpmnRef}
                  sessionId={sid}
                  activeProjectId={activeProjectId}
                  view={tab === "xml" ? "xml" : "editor"}
                  draft={draft}
                  reloadKey={reloadKey}
                  onDiagramMutation={queueDiagramMutation}
                  onElementSelectionChange={handleBpmnSelectionChange}
                  onElementNotesRemap={onElementNotesRemap}
                  onAiQuestionsByElementChange={handleAiQuestionsByElementChange}
                  onSessionSync={onSessionSync}
                  aiQuestionsModeEnabled={isInterviewMode}
                  diagramDisplayMode={diagramMode}
                  stepTimeUnit={stepTimeUnit}
                  robotMetaOverlayEnabled={robotMetaOverlayEnabled}
                  robotMetaOverlayFilters={robotMetaOverlayFilters}
                  robotMetaStatusByElementId={robotMetaStatusByElementId}
                />
                <DrawioOverlayRenderer
                  visible={tab === "diagram" && drawioVisible}
                  drawioMeta={drawioUiState}
                  overlayMatrix={hybridViewportMatrix}
                />
                <HybridOverlayRenderer
                  visible={tab === "diagram" && hybridVisible}
                  modeEffective={hybridModeEffective}
                  uiPrefs={hybridUiPrefs}
                  opacityValue={hybridOpacityValue}
                  overlayRef={hybridLayerOverlayRef}
                  onOverlayPointerDown={handleHybridV2OverlayPointerDown}
                  onOverlayPointerMove={hybridTools.onOverlayPointerMove}
                  onOverlayPointerLeave={hybridTools.onOverlayPointerLeave}
                  onOverlayContextMenu={handleHybridV2OverlayContextMenu}
                  v2Renderable={hybridV2Renderable}
                  v2ActiveId={hybridV2ActiveId}
                  v2SelectedIds={hybridV2SelectedIdSet}
                  v2PlaybackHighlightedIds={hybridV2PlaybackHighlightedIds}
                  v2BindingByHybridId={hybridV2BindingByHybridId}
                  onV2ElementPointerDown={handleHybridV2ElementPointerDown}
                  onV2ElementContextMenu={handleHybridV2ElementContextMenu}
                  onV2ElementDoubleClick={handleHybridV2ElementDoubleClick}
                  onV2ResizeHandlePointerDown={handleHybridV2ResizeHandlePointerDown}
                  v2GhostPreview={hybridTools.ghostPreview}
                  v2ArrowPreview={hybridTools.arrowPreview}
                  v2TextEditor={hybridTools.textEditor}
                  onV2TextEditorChange={hybridTools.updateTextEditorValue}
                  onV2TextEditorCommit={hybridTools.commitTextEditor}
                  onV2TextEditorCancel={hybridTools.closeTextEditor}
                  legacyRows={hybridLayerRenderRows}
                  legacyActiveElementId={hybridLayerActiveElementId}
                  debugEnabled={hybridDebugEnabled}
                  onLegacyHotspotMouseDown={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "hotspot_mousedown", elementId });
                  }}
                  onLegacyHotspotClick={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "hotspot_click", elementId });
                    setHybridLayerActiveElementId(elementId);
                    bpmnRef.current?.focusNode?.(elementId, { keepPrevious: false, durationMs: 1200 });
                  }}
                  onLegacyCardMouseDown={handleHybridLayerItemPointerDown}
                  onLegacyCardClick={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "card_click", elementId });
                  }}
                  onLegacyMissingCleanupMouseDown={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "card_missing_cleanup_mousedown", elementId });
                  }}
                  onLegacyMissingCleanupClick={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "card_missing_cleanup_click", elementId });
                    cleanupMissingHybridBindings("card_missing_cleanup");
                  }}
                  onLegacyCardRef={getHybridLayerCardRefCallback}
                />
                <HybridContextMenu
                  menu={hybridTools.contextMenu}
                  selectionCount={hybridSelection.selectionCount}
                  canRename={hybridSelection.selectionCount === 1 && !!hybridV2DocLive.elements.find((row) => toText(asObject(row).id) === hybridV2ActiveId)}
                  onClose={hybridTools.closeContextMenu}
                  onDelete={() => {
                    deleteSelectedHybridIds();
                    hybridTools.closeContextMenu();
                  }}
                  onRename={() => {
                    hybridTools.renameHybridItem(hybridV2ActiveId);
                    hybridTools.closeContextMenu();
                  }}
                  onHide={() => {
                    hybridTools.hideHybridIds(hybridV2SelectedIds);
                    hybridTools.closeContextMenu();
                  }}
                  onLock={() => {
                    hybridTools.lockLayersForHybridIds(hybridV2SelectedIds);
                    hybridTools.closeContextMenu();
                  }}
                />
                <DrawioEditorModal
                  open={drawioEditorOpen}
                  title="Draw.io Editor"
                  initialXml={drawioUiState.doc_xml}
                  onSave={handleDrawioEditorSave}
                  onClose={closeEmbeddedDrawioEditor}
                />
                {tab === "diagram" && isCoverageMode ? (
                  <div className="coverageMiniMap" data-testid="coverage-minimap">
                    <div className="coverageMiniMapHead">
                      <span className="coverageMiniMapTitle">Coverage map</span>
                      <span className="coverageMiniMapCount">{coverageMinimapRows.length}</span>
                    </div>
                    <div className="coverageMiniMapLegend">
                      <span className="coverageMiniMapLegendItem">
                        <i className="coverageMiniMapLegendSwatch fpcCoverageReady" />
                        <span>OK</span>
                      </span>
                      <span className="coverageMiniMapLegendItem">
                        <i className="coverageMiniMapLegendSwatch fpcCoverageWarn" />
                        <span>Partial</span>
                      </span>
                      <span className="coverageMiniMapLegendItem">
                        <i className="coverageMiniMapLegendSwatch fpcCoverageRisk" />
                        <span>Gap</span>
                      </span>
                    </div>
                    {coverageMinimapRows.length === 0 ? (
                      <div className="coverageMiniMapEmpty">Нет маркеров покрытия.</div>
                    ) : (
                      <div className="coverageMiniMapGrid">
                        {coverageMinimapRows.slice(0, 80).map((item) => {
                          const readiness = Number(item?.readiness || 0);
                          const markerClass = coverageMarkerClass(item);
                          const title = String(item?.title || item?.id || "").trim() || "Узел";
                          const detail = [
                            `Готовность: ${readiness}%`,
                            item?.hasQualityIssue ? "ошибка качества" : "",
                            item?.missingAiQuestions ? "нет AI" : "",
                            item?.missingNotes ? "нет заметок" : "",
                            item?.missingDurationQuality ? "нет duration/quality" : "",
                          ].filter(Boolean).join(" · ");
                          return (
                            <button
                              key={`coverage_minimap_${item.id}`}
                              type="button"
                              className={`coverageMiniMapMarker ${markerClass}`}
                              onClick={() => focusCoverageIssue(item, "coverage_minimap")}
                              title={`${title}${detail ? ` · ${detail}` : ""}`}
                              data-testid="coverage-minimap-marker"
                              data-element-id={item.id}
                            >
                              <span className="coverageMiniMapMarkerTitle">{title}</span>
                              <span className="coverageMiniMapMarkerMeta">{readiness}%</span>
                              <span className="coverageMiniMapMarkerFlags">
                                {item?.hasQualityIssue ? <span className="coverageMiniMapFlag is-error">E</span> : null}
                                {item?.missingAiQuestions ? <span className="coverageMiniMapFlag is-ai">AI</span> : null}
                                {item?.missingNotes ? <span className="coverageMiniMapFlag is-notes">N</span> : null}
                                {item?.missingDurationQuality ? <span className="coverageMiniMapFlag is-missing">D</span> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {(tab === "diagram" || tab === "interview") && hasSession && attentionOpen ? (
              <div className="attentionPanel" data-testid="attention-panel">
                <div className="attentionPanelHead">
                  <div className="attentionPanelTitle">
                    <span>Требует внимания</span>
                    <span className="attentionPanelCount">{attentionItemsRaw.length}</span>
                  </div>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => setAttentionOpen(false)}
                    aria-label="Закрыть панель Требует внимания"
                  >
                    Закрыть
                  </button>
                </div>
                <div className="attentionPanelFilters">
                  <label className="attentionPanelFilter">
                    <input
                      type="checkbox"
                      checked={!!attentionFilters?.quality}
                      onChange={() => toggleAttentionFilter("quality")}
                      data-testid="attention-filter-quality"
                    />
                    <span>Только Quality</span>
                  </label>
                  <label className="attentionPanelFilter">
                    <input
                      type="checkbox"
                      checked={!!attentionFilters?.ai}
                      onChange={() => toggleAttentionFilter("ai")}
                      data-testid="attention-filter-ai"
                    />
                    <span>Только AI</span>
                  </label>
                  <label className="attentionPanelFilter">
                    <input
                      type="checkbox"
                      checked={!!attentionFilters?.notes}
                      onChange={() => toggleAttentionFilter("notes")}
                      data-testid="attention-filter-notes"
                    />
                    <span>Только Notes</span>
                  </label>
                </div>
                {attentionItems.length === 0 ? (
                  <div className="attentionPanelEmpty">
                    {attentionItemsRaw.length === 0 ? "Пробелов не найдено." : "По выбранным фильтрам ничего не найдено."}
                  </div>
                ) : (
                  <div className="attentionPanelList">
                    {attentionItems.map((item) => (
                      <div
                        key={`attention_${item.id}`}
                        className="attentionItem"
                        role="button"
                        tabIndex={0}
                        onClick={() => focusAttentionItem(item)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          focusAttentionItem(item);
                        }}
                        data-testid="attention-item"
                        data-element-id={item.id}
                      >
                        <div className="attentionItemHead">
                          <div className="attentionItemTitle">{String(item?.title || item?.id || "").trim()}</div>
                          <div className="attentionItemFlags">
                            {item?.hasQuality ? <span className="attentionFlag is-quality">Quality</span> : null}
                            {item?.hasAiMissing ? <span className="attentionFlag is-ai">AI</span> : null}
                            {item?.hasNotesMissing ? <span className="attentionFlag is-notes">Notes</span> : null}
                          </div>
                        </div>
                        {String(item?.lane || "").trim() ? (
                          <div className="attentionItemLane">Lane: {String(item.lane).trim()}</div>
                        ) : null}
                        <ul className="attentionItemReasons">
                          {asArray(item?.reasons).slice(0, 3).map((reason, idx) => (
                            <li key={`attention_reason_${item.id}_${idx}`}>
                              {String(reason?.text || "").trim()}
                            </li>
                          ))}
                        </ul>
                        <div className="attentionItemActions">
                          <button
                            type="button"
                            className="primaryBtn h-7 px-2 text-[11px]"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              focusAttentionItem(item);
                            }}
                            data-testid="attention-item-focus"
                          >
                            Показать на схеме
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            {isInterview ? (
              <div className="absolute inset-0 h-full min-h-0 overflow-auto">
                <InterviewStage
                  sessionId={sid}
                  sessionTitle={draft?.title}
                  sessionDraft={draft}
                  interview={draft?.interview}
                  nodes={draft?.nodes}
                  edges={draft?.edges}
                  roles={draft?.roles}
                  actorsDerived={draft?.actors_derived}
                  bpmnXml={draft?.bpmn_xml}
                  selectedDiagramElement={selectedBpmnElement}
                  onChange={handleInterviewChange}
                  stepTimeUnit={stepTimeUnit}
                  pathsUiIntent={diagramPathsIntent}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Modal
        open={qualityAutoFixOpen}
        title="Автоисправление качества"
        onClose={() => {
          if (qualityAutoFixBusy) return;
          setQualityAutoFixOpen(false);
        }}
        footer={(
          <>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => setQualityAutoFixOpen(false)}
              disabled={qualityAutoFixBusy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="primaryBtn"
              onClick={() => void applyQualityAutoFix()}
              disabled={qualityAutoFixBusy || Number(qualityAutoFixPreview?.safeFixes || 0) <= 0}
              data-testid="quality-autofix-apply"
            >
              {qualityAutoFixBusy ? "Применение..." : `Автоисправить (${Number(qualityAutoFixPreview?.safeFixes || 0)})`}
            </button>
          </>
        )}
      >
        <div className="space-y-3" data-testid="quality-autofix-modal">
          <div className="rounded-lg border border-border bg-panel2/40 px-3 py-2 text-xs text-muted">
            Профиль: <b className="text-fg">{qualityProfile?.title || qualityProfileId}</b>
            <span> · safe fixes: <b className="text-fg">{Number(qualityAutoFixPreview?.safeFixes || 0)}</b></span>
            <span> · всего пунктов: <b className="text-fg">{asArray(qualityAutoFixPreview?.fixes).length}</b></span>
          </div>
          <div className="max-h-[48vh] space-y-2 overflow-auto pr-1">
            {asArray(qualityAutoFixPreview?.fixes).length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
                Нет автоисправлений для текущих проблем.
              </div>
            ) : (
              asArray(qualityAutoFixPreview?.fixes).map((fix) => (
                <div key={String(fix?.id || "")} className="rounded-md border border-border bg-panel px-2 py-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <b className="text-fg">{String(fix?.title || "Fix")}</b>
                    <span className={`badge px-1.5 py-0 text-[10px] ${fix?.safe ? "ok" : "warn"}`}>{fix?.safe ? "safe" : "warn"}</span>
                    <span className="badge px-1.5 py-0 text-[10px]">{String(fix?.ruleId || "generic")}</span>
                    <span className="font-mono text-[11px] text-muted">{String(fix?.target || "")}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{String(fix?.detail || "")}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={insertBetweenOpen}
        title="Вставить шаг между"
        onClose={() => {
          if (insertBetweenBusy) return;
          setInsertBetweenOpen(false);
        }}
        footer={(
          <>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => setInsertBetweenOpen(false)}
              disabled={insertBetweenBusy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="primaryBtn"
              onClick={() => void applyInsertBetweenFromDiagram()}
              disabled={insertBetweenBusy || !String(insertBetweenName || "").trim()}
              data-testid="diagram-insert-between-confirm"
            >
              {insertBetweenBusy ? "Применение..." : "Вставить"}
            </button>
          </>
        )}
      >
        <div className="space-y-3" data-testid="diagram-insert-between-modal">
          <div className="rounded-lg border border-border bg-panel2/40 px-3 py-2 text-xs text-muted">
            <div>
              Связь: <b className="font-mono text-fg">{String(insertBetweenDraft?.fromId || "")}</b> →{" "}
              <b className="font-mono text-fg">{String(insertBetweenDraft?.toId || "")}</b>
            </div>
            <div>
              Lane: <b className="text-fg">{String(insertBetweenDraft?.laneName || insertBetweenDraft?.laneId || "auto")}</b>
            </div>
            <div>
              Условие перехода переносится на <b className="text-fg">A→C</b>.
            </div>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted">Название нового шага</span>
            <input
              className="input w-full"
              value={insertBetweenName}
              onChange={(e) => setInsertBetweenName(String(e.target.value || ""))}
              placeholder="Например: Проверка качества"
              data-testid="diagram-insert-between-name"
            />
          </label>
        </div>
      </Modal>

      <CreateTemplateModal
        open={createTemplateOpen}
        onClose={() => {
          if (templatesBusy) return;
          setCreateTemplateOpen(false);
        }}
        title={createTemplateTitle}
        onTitleChange={setCreateTemplateTitle}
        scope={createTemplateScope}
        onScopeChange={setCreateTemplateScope}
        canCreateOrgTemplate={!!workspaceActiveOrgId && !!canInviteWorkspaceUsers}
        selectionCount={selectedBpmnElementIds.length}
        busy={templatesBusy}
        onSave={saveCurrentSelectionAsTemplate}
      />

      <TemplatesPicker
        open={templatesPickerOpen}
        onClose={() => {
          if (templatesBusy) return;
          setTemplatesPickerOpen(false);
        }}
        activeScope={templatesScope}
        onScopeChange={setTemplatesScope}
        search={templatesSearch}
        onSearchChange={setTemplatesSearch}
        personalCount={templateCounts.personal}
        orgCount={templateCounts.org}
        templates={scopedTemplates}
        busy={templatesBusy}
        onRefresh={reloadTemplates}
        onApply={applyTemplate}
        onDelete={removeTemplate}
      />

      <Modal
        open={versionsOpen}
        title="История версий BPMN"
        onClose={() => setVersionsOpen(false)}
        footer={(
          <>
            <button type="button" className="secondaryBtn" onClick={() => void refreshSnapshotVersions()} disabled={versionsBusy || !hasSession}>
              Обновить
            </button>
            <button type="button" className="secondaryBtn" onClick={() => void createManualSnapshot()} disabled={versionsBusy || !hasSession}>
              Создать версию
            </button>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => {
                const latestId = String(asArray(versionsList)[0]?.id || "");
                const prevId = String(asArray(versionsList)[1]?.id || "");
                if (!latestId || !prevId) {
                  setGenErr("Для сравнения нужно минимум две версии.");
                  return;
                }
                setDiffTargetSnapshotId(latestId);
                setDiffBaseSnapshotId(prevId);
                setDiffOpen(true);
              }}
              disabled={versionsBusy || versionsList.length < 2}
              data-testid="bpmn-versions-open-diff"
            >
              Сравнить A/B
            </button>
            <button type="button" className="secondaryBtn" onClick={() => void clearSnapshotHistory()} disabled={versionsBusy || !hasSession || versionsList.length === 0}>
              Очистить историю
            </button>
            <button type="button" className="primaryBtn" onClick={() => setVersionsOpen(false)}>
              Закрыть
            </button>
          </>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]" data-testid="bpmn-versions-modal">
          <div className="rounded-xl border border-border bg-panel2/45 p-2">
            <div className="mb-2 px-1 text-xs text-muted" data-testid="bpmn-versions-count">
              Последние версии: {versionsList.length} · pinned: {asArray(versionsList).filter((item) => item?.pinned === true).length}
            </div>
            <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">
              {versionsList.length === 0 ? (
                <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">История пуста.</div>
              ) : (
                versionsList.map((item) => {
                  const id = String(item?.id || "");
                  const active = id === String(previewSnapshotId || "");
                  return (
                    <div
                      key={id}
                      className={"rounded-lg border px-2.5 py-2 " + (active ? "border-accent bg-accentSoft/35" : "border-border bg-panel")}
                      data-testid="bpmn-version-item"
                      data-snapshot-id={id}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                        <span>{formatSnapshotTs(item?.ts)}</span>
                        <span className="uppercase">{String(item?.reason || "autosave")}</span>
                      </div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-fg" data-testid="bpmn-version-label">
                          {snapshotLabel(item)}
                        </span>
                        {item?.pinned ? (
                          <span className="rounded-full border border-accent/40 bg-accentSoft/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                            Pinned
                          </span>
                        ) : null}
                      </div>
                      <div className="mb-2 text-xs text-muted">
                        rev: {Number(item?.rev || 0)} · hash: <span className="font-mono text-fg">{shortSnapshotHash(item?.hash || item?.xml || "")}</span> · len: {Number(item?.len || String(item?.xml || "").length)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => setPreviewSnapshotId(id)}
                          data-testid="bpmn-version-preview"
                        >
                          Предпросмотр XML
                        </button>
                        <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => downloadSnapshot(item)}>
                          Скачать .bpmn
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => void editSnapshotLabel(item)}
                          disabled={versionsBusy}
                          data-testid="bpmn-version-label-edit"
                        >
                          Label
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => void togglePinSnapshot(item)}
                          disabled={versionsBusy}
                          data-testid="bpmn-version-pin"
                        >
                          {item?.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => openDiffForSnapshot(item)}
                          disabled={versionsBusy || versionsList.length < 2}
                          data-testid="bpmn-version-diff"
                        >
                          Diff
                        </button>
                        <button
                          type="button"
                          className="primaryBtn h-7 px-2 text-[11px]"
                          onClick={() => void restoreSnapshot(item)}
                          disabled={versionsBusy}
                          data-testid="bpmn-version-restore"
                        >
                          Восстановить
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-border bg-panel2/35">
            <div className="border-b border-border px-3 py-2 text-xs text-muted">
              {previewSnapshot ? `XML предпросмотр · ${formatSnapshotTs(previewSnapshot.ts)}` : "Выберите версию слева"}
            </div>
            <div className="min-h-0 flex-1 p-3">
              <textarea
                className="xmlEditorTextarea h-full min-h-[44vh] w-full"
                value={String(previewSnapshot?.xml || "")}
                readOnly
                data-testid="bpmn-version-preview-xml"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={diffOpen}
        title="Semantic Diff BPMN"
        onClose={() => setDiffOpen(false)}
        footer={(
          <>
            <button type="button" className="secondaryBtn" onClick={() => setDiffOpen(false)}>
              Закрыть
            </button>
          </>
        )}
      >
        <div className="space-y-3" data-testid="bpmn-versions-diff-modal">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block space-y-1 text-xs text-muted">
              <span>Версия A (base)</span>
              <select
                className="select w-full"
                value={String(diffBaseSnapshotId || "")}
                onChange={(e) => setDiffBaseSnapshotId(String(e.target.value || ""))}
                data-testid="bpmn-diff-base-select"
              >
                <option value="">Выберите версию</option>
                {asArray(versionsList).map((item) => {
                  const id = String(item?.id || "");
                  return (
                    <option key={`base_${id}`} value={id}>
                      {snapshotLabel(item)} · {formatSnapshotTs(item?.ts)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="block space-y-1 text-xs text-muted">
              <span>Версия B (target)</span>
              <select
                className="select w-full"
                value={String(diffTargetSnapshotId || "")}
                onChange={(e) => setDiffTargetSnapshotId(String(e.target.value || ""))}
                data-testid="bpmn-diff-target-select"
              >
                <option value="">Выберите версию</option>
                {asArray(versionsList).map((item) => {
                  const id = String(item?.id || "");
                  return (
                    <option key={`target_${id}`} value={id}>
                      {snapshotLabel(item)} · {formatSnapshotTs(item?.ts)}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          {!semanticDiffView?.ok ? (
            <div className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-muted">
              {String(semanticDiffView?.error || "Не удалось построить diff.")}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border bg-panel">
                <table className="min-w-full text-xs">
                  <thead className="border-b border-border text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Сущность</th>
                      <th className="px-3 py-2 text-right">Added</th>
                      <th className="px-3 py-2 text-right">Removed</th>
                      <th className="px-3 py-2 text-right">Changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "tasks", title: "Tasks" },
                      { key: "flows", title: "Flows" },
                      { key: "lanes", title: "Lanes" },
                      { key: "subprocess", title: "Subprocess" },
                      { key: "conditions", title: "Conditions" },
                    ].map((row) => (
                      <tr key={row.key} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 text-fg">{row.title}</td>
                        <td className="px-3 py-2 text-right text-fg" data-testid={`bpmn-diff-count-${row.key}-added`}>
                          {Number(semanticDiffView?.summary?.added?.[row.key] || 0)}
                        </td>
                        <td className="px-3 py-2 text-right text-fg" data-testid={`bpmn-diff-count-${row.key}-removed`}>
                          {Number(semanticDiffView?.summary?.removed?.[row.key] || 0)}
                        </td>
                        <td className="px-3 py-2 text-right text-fg" data-testid={`bpmn-diff-count-${row.key}-changed`}>
                          {Number(semanticDiffView?.summary?.changed?.[row.key] || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-panel px-3 py-2">
                  <div className="mb-1 text-xs font-semibold text-fg">Changed tasks</div>
                  <div className="space-y-1 text-xs text-muted">
                    {asArray(semanticDiffView?.details?.tasks?.changed).slice(0, 6).map((item) => (
                      <div key={`task_changed_${item.id}`}>
                        {String(item?.id || "")}: {String(item?.before?.name || "—")} → {String(item?.after?.name || "—")}
                      </div>
                    ))}
                    {asArray(semanticDiffView?.details?.tasks?.changed).length === 0 ? <div>Нет изменений</div> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-panel px-3 py-2">
                  <div className="mb-1 text-xs font-semibold text-fg">Changed conditions</div>
                  <div className="space-y-1 text-xs text-muted">
                    {asArray(semanticDiffView?.details?.conditions?.changed).slice(0, 6).map((item) => (
                      <div key={`condition_changed_${item.key}`}>
                        {String(item?.from || "")} → {String(item?.to || "")}: {String(item?.before || "—")} → {String(item?.after || "—")}
                      </div>
                    ))}
                    {asArray(semanticDiffView?.details?.conditions?.changed).length === 0 ? <div>Нет изменений</div> : null}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
