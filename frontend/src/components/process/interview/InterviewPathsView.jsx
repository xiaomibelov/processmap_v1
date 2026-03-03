import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { isLocalSessionId, sanitizeDisplayText, toArray, toText } from "./utils";
import {
  apiCreatePathReportVersion,
  apiDeleteReportVersion,
  apiGetReportVersion,
  apiListPathReportVersions,
} from "../../../lib/api";
import { useAuth } from "../../../features/auth/AuthProvider";
import {
  buildScenarioMatrixRows,
  buildStepMetaByNodeId,
  validateScenarioRowOrder,
} from "./services/scenarios/buildScenarioMatrixRows.js";
import {
  buildScenarioSequenceForReport,
  buildManualPathReportSteps,
  buildReportBuildDebug,
  buildDecisionHintsByNodeIdFromScenarioRows,
  buildPathReportRequest,
  decorateReportVersionsWithActuality,
  normalizeReportMarkdown,
  resolveStepIdForRecommendation,
} from "./services/pathReport.js";
import { markInterviewPerf, measureInterviewSpan, scheduleInterviewIdle } from "./perf";
import PathsLayout from "./paths/PathsLayout";
import ScenarioNav from "./paths/ScenarioNav";
import PathHeader from "./paths/PathHeader";
import PathStepList from "./paths/PathStepList";
import StepDetailsPanel from "./paths/StepDetailsPanel";
import ReportsDrawer from "./paths/ReportsDrawer";
import { buildScenarioMetrics, buildScenarioStepRows } from "./paths/scenarioMetrics.js";

function normalizeTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function rankClassOrder(rankClassRaw) {
  const rankClass = toText(rankClassRaw).toLowerCase();
  if (rankClass === "ideal") return 1;
  if (rankClass === "alt_happy") return 2;
  if (rankClass === "mitigated") return 3;
  if (rankClass === "fail") return 4;
  return 9;
}

function formatSeconds(totalSecRaw) {
  const totalSec = Number(totalSecRaw || 0);
  if (!Number.isFinite(totalSec) || totalSec <= 0) return "—";
  if (totalSec < 60) return `${Math.round(totalSec)}s`;
  const mm = Math.floor(totalSec / 60);
  const ss = Math.round(totalSec % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function scenarioStatusLabel(scenario) {
  return toText(scenario?.outcome).toLowerCase() === "fail" ? "FAIL" : "OK";
}

function scenarioStatusClass(scenario) {
  return toText(scenario?.outcome).toLowerCase() === "fail" ? "danger" : "ok";
}

function getInitialTierFilter(tierFilters) {
  const selected = toArray(tierFilters)
    .map((tier) => normalizeTier(tier === "NONE" ? "None" : tier))
    .filter((tier) => tier === "P0" || tier === "P1" || tier === "P2");
  return selected.length === 1 ? selected[0] : "ALL";
}

function sortScenarios(listRaw) {
  return [...toArray(listRaw)].sort((a, b) => {
    const ao = rankClassOrder(a?.rank_class);
    const bo = rankClassOrder(b?.rank_class);
    if (ao !== bo) return ao - bo;
    return toText(a?.label).localeCompare(toText(b?.label), "ru");
  });
}

function scenarioDurationSec(scenario, stepMetaByNodeId) {
  return Number(buildScenarioMetrics(scenario, stepMetaByNodeId)?.total_time_sec || 0);
}

function scenarioContainsNodeId(scenario, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  if (!nodeId) return false;
  return toArray(scenario?.sequence).some((step) => toText(step?.node_id) === nodeId);
}

function scenarioOutcomeIcon(scenario) {
  return toText(scenario?.outcome).toLowerCase() === "fail" ? "⛔" : "✅";
}

function resolveScenarioPathId(scenarioRaw) {
  const scenario = asObject(scenarioRaw);
  return toText(scenario?.sequence_key || scenario?.sequenceKey)
    || toText(scenario?.path_id || scenario?.pathId)
    || toText(scenario?.id);
}

function normalizeDebugRouteSteps(stepsRaw) {
  return toArray(stepsRaw)
    .map((stepRaw, idx) => {
      const step = asObject(stepRaw);
      const bpmnRef = toText(
        step?.bpmn_ref
        || step?.bpmnRef
        || step?.node_id
        || step?.nodeId,
      );
      if (!bpmnRef) return null;
      const workSec = Number(step?.work_duration_sec);
      const waitSec = Number(step?.wait_duration_sec);
      return {
        order_index: idx + 1,
        step_id: toText(step?.step_id || step?.stepId || step?.id) || null,
        title: toText(step?.title || step?.name || step?.action || bpmnRef) || bpmnRef,
        lane_id: toText(step?.lane_id || step?.laneId) || null,
        lane_name: toText(step?.lane_name || step?.laneName || step?.lane || step?.role || step?.area) || null,
        bpmn_ref: bpmnRef,
        work_duration_sec: Number.isFinite(workSec) && workSec >= 0 ? Math.round(workSec) : 0,
        wait_duration_sec: Number.isFinite(waitSec) && waitSec >= 0 ? Math.round(waitSec) : 0,
        decision: asObject(step?.decision),
      };
    })
    .filter(Boolean);
}

function buildReportBuildDebugComparable(debugRaw) {
  const debug = asObject(debugRaw);
  return {
    path_id_used: toText(debug?.path_id_used),
    selectedScenarioLabel: toText(debug?.selectedScenarioLabel),
    selected_scenario_id: toText(debug?.selected_scenario_id || debug?.selectedScenarioId),
    scenario_tier: normalizeTier(debug?.scenario_tier || debug?.tier),
    sequence_key: toText(debug?.sequence_key || debug?.sequenceKey),
    steps_count: Number(debug?.steps_count || 0),
    route_steps: normalizeDebugRouteSteps(debug?.route_steps || debug?.routeSteps).map((step) => ({
      order_index: Number(step?.order_index || 0),
      bpmn_ref: toText(step?.bpmn_ref),
      title: toText(step?.title),
      work_duration_sec: Number(step?.work_duration_sec || 0),
      wait_duration_sec: Number(step?.wait_duration_sec || 0),
      selected_flow_id: toText(asObject(step?.decision)?.selected_flow_id),
    })),
  };
}

function findScenarioByIntent(scenariosRaw, intentRaw) {
  const scenarios = toArray(scenariosRaw);
  const intent = asObject(intentRaw);
  if (!scenarios.length) return null;
  const scenarioId = toText(intent?.scenarioId);
  if (scenarioId) {
    const byId = scenarios.find((scenario) => toText(scenario?.id) === scenarioId);
    if (byId) return byId;
  }
  const pathId = toText(intent?.pathId);
  if (pathId) {
    const byPath = scenarios.find((scenario) => resolveScenarioPathId(scenario) === pathId);
    if (byPath) return byPath;
  }
  const sequenceKey = toText(intent?.sequenceKey);
  if (sequenceKey) {
    const bySeq = scenarios.find((scenario) => toText(scenario?.sequence_key || scenario?.sequenceKey) === sequenceKey);
    if (bySeq) return bySeq;
  }
  const tier = normalizeTier(intent?.tier);
  if (tier && tier !== "ALL") {
    const byTier = scenarios.find((scenario) => normalizeTier(scenario?.tier) === tier);
    if (byTier) return byTier;
  }
  return null;
}

function buildReportNodeStub(graphModelRaw, nodeIdRaw) {
  const graphModel = asObject(graphModelRaw);
  const nodesById = asObject(graphModel?.nodesById);
  const nodeId = toText(nodeIdRaw);
  const node = asObject(nodesById[nodeId]);
  return {
    node_id: nodeId,
    bpmn_ref: nodeId,
    title: toText(node?.name || nodeId) || nodeId,
    lane_id: toText(node?.laneId || ""),
    lane_name: "",
  };
}

function buildLinkThrowToCatchMap(dodSnapshotRaw) {
  const out = {};
  toArray(dodSnapshotRaw?.link_groups).forEach((groupRaw) => {
    const group = asObject(groupRaw);
    const catches = toArray(group?.catch_ids).map((id) => toText(id)).filter(Boolean);
    if (!catches.length) return;
    const target = catches[0];
    toArray(group?.throw_ids)
      .map((id) => toText(id))
      .filter(Boolean)
      .forEach((throwId) => {
        if (!out[throwId]) out[throwId] = target;
      });
  });
  return out;
}

function flowPriorityForReport(flowRaw) {
  const flow = asObject(flowRaw);
  const tier = toText(flow?.tier || flow?.rtier).toUpperCase();
  if (tier === "P0" || tier === "R0") return 0;
  if (tier === "P1" || tier === "R1") return 1;
  if (tier === "P2" || tier === "R2") return 3;
  return 2;
}

function stitchScenarioSequenceByLinkEvents({
  scenarioSequence,
  graphModel,
  dodSnapshot,
  maxAppend = 96,
}) {
  const base = toArray(scenarioSequence).map((stepRaw) => {
    const step = asObject(stepRaw);
    const nodeId = toText(step?.node_id || step?.bpmn_ref || step?.nodeId);
    if (!nodeId) return null;
    return {
      ...step,
      node_id: nodeId,
      bpmn_ref: toText(step?.bpmn_ref || nodeId),
      title: toText(step?.title || nodeId) || nodeId,
    };
  }).filter(Boolean);
  if (!base.length) return { sequence: [], stitched: false };
  const graph = asObject(graphModel);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const nodesById = asObject(graph?.nodesById);
  const throwToCatch = buildLinkThrowToCatchMap(dodSnapshot);
  if (!Object.keys(throwToCatch).length) return { sequence: base, stitched: false };

  const next = [...base];
  const seenNodeIds = new Set(next.map((step) => toText(step?.node_id)).filter(Boolean));
  let stitched = false;
  let appendBudget = Math.max(8, Number(maxAppend || 96));
  let tailNodeId = toText(next[next.length - 1]?.node_id);
  while (appendBudget > 0 && tailNodeId) {
    const outgoing = toArray(outgoingByNode[tailNodeId]);
    if (outgoing.length) break;
    const jumpNodeId = toText(throwToCatch[tailNodeId]);
    if (!jumpNodeId || seenNodeIds.has(jumpNodeId)) break;
    stitched = true;
    next.push(buildReportNodeStub(nodesById ? graph : null, jumpNodeId));
    seenNodeIds.add(jumpNodeId);
    appendBudget -= 1;
    let cursor = jumpNodeId;
    let guard = 0;
    while (appendBudget > 0 && guard < 120) {
      guard += 1;
      const edges = [...toArray(outgoingByNode[cursor])].sort((aRaw, bRaw) => {
        const a = asObject(aRaw);
        const b = asObject(bRaw);
        const ap = flowPriorityForReport(a);
        const bp = flowPriorityForReport(b);
        if (ap !== bp) return ap - bp;
        return toText(a?.id).localeCompare(toText(b?.id), "ru");
      });
      const first = asObject(edges[0]);
      const targetId = toText(first?.targetId);
      if (!targetId || seenNodeIds.has(targetId)) break;
      next.push(buildReportNodeStub(nodesById ? graph : null, targetId));
      seenNodeIds.add(targetId);
      appendBudget -= 1;
      cursor = targetId;
      const nodeType = toText(asObject(nodesById[targetId])?.type).toLowerCase();
      if (nodeType === "endevent") break;
    }
    tailNodeId = toText(next[next.length - 1]?.node_id);
  }
  return {
    sequence: next,
    stitched,
  };
}

function scenarioBucket(scenarioRaw) {
  const scenario = asObject(scenarioRaw);
  const outcome = toText(scenario?.outcome).toLowerCase();
  const rank = toText(scenario?.rank_class).toLowerCase();
  if (outcome === "fail") return "P2_FAIL";
  if (outcome === "success" && rank === "ideal") return "P0_IDEAL";
  if (outcome === "success" && rank === "alt_happy") return "P0_ALT";
  if (outcome === "success" && rank === "mitigated") return "P1_MITIGATED";
  return "OTHER";
}

function buildScenarioPresentation(scenariosRaw) {
  const ordered = sortScenarios(scenariosRaw);
  const sections = [
    { key: "P0_IDEAL", title: "P0 Ideal", items: [] },
    { key: "P0_ALT", title: "P0 Alt", items: [] },
    { key: "P1_MITIGATED", title: "P1 Mitigated", items: [] },
    { key: "P2_FAIL", title: "P2 Fail", items: [] },
    { key: "OTHER", title: "Other", items: [] },
  ];
  const byKey = {};
  sections.forEach((section) => {
    byKey[section.key] = section;
  });
  ordered.forEach((scenario) => {
    const key = scenarioBucket(scenario);
    if (byKey[key]) byKey[key].items.push(scenario);
  });

  const altIndexById = {};
  const mitigatedIndexById = {};
  const failIndexById = {};
  byKey.P0_ALT.items.forEach((scenario, idx) => {
    altIndexById[toText(scenario?.id)] = idx + 1;
  });
  byKey.P1_MITIGATED.items.forEach((scenario, idx) => {
    mitigatedIndexById[toText(scenario?.id)] = idx + 1;
  });
  byKey.P2_FAIL.items.forEach((scenario, idx) => {
    failIndexById[toText(scenario?.id)] = idx + 1;
  });

  function scenarioDisplayTitle(scenario) {
    const id = toText(scenario?.id);
    const bucket = scenarioBucket(scenario);
    if (bucket === "P0_IDEAL") return "P0 Ideal";
    if (bucket === "P0_ALT") return `P0 Alt #${Number(altIndexById[id] || 1)}`;
    if (bucket === "P1_MITIGATED") return `P1 Mitigated #${Number(mitigatedIndexById[id] || 1)}`;
    if (bucket === "P2_FAIL") return `P2 Fail #${Number(failIndexById[id] || 1)}`;
    return toText(scenario?.label || scenario?.id || "Scenario");
  }

  return {
    all: ordered,
    sections,
    scenarioDisplayTitle,
  };
}

function filterScenariosByTierView(scenariosRaw, selectedTier) {
  const list = toArray(scenariosRaw);
  if (selectedTier === "P0") {
    return list.filter((scenario) => {
      const bucket = scenarioBucket(scenario);
      return bucket === "P0_IDEAL" || bucket === "P0_ALT";
    });
  }
  if (selectedTier === "P1") {
    return list.filter((scenario) => scenarioBucket(scenario) === "P1_MITIGATED");
  }
  if (selectedTier === "P2") {
    return list.filter((scenario) => scenarioBucket(scenario) === "P2_FAIL");
  }
  return list;
}

function makeStepIdMaps(vmStepsRaw) {
  const stepById = {};
  const firstStepIdByNodeId = {};
  toArray(vmStepsRaw).forEach((step) => {
    const stepId = toText(step?.id);
    const nodeId = toText(step?.node_id);
    if (stepId) stepById[stepId] = step;
    if (nodeId && stepId && !firstStepIdByNodeId[nodeId]) firstStepIdByNodeId[nodeId] = stepId;
  });
  return { stepById, firstStepIdByNodeId };
}

function makeSelectedNodeIdSet(selectedStepIds, stepById) {
  const out = new Set();
  toArray(selectedStepIds).forEach((stepIdRaw) => {
    const stepId = toText(stepIdRaw);
    const nodeId = toText(stepById?.[stepId]?.node_id);
    if (nodeId) out.add(nodeId);
  });
  return out;
}

function buildDecisionHintsByOrderIndexFromScenarioRows(rowsRaw) {
  const out = {};
  function walk(list) {
    toArray(list).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const rowType = toText(row?.row_type).toLowerCase();
      if (rowType === "decision") {
        const orderIndex = Number(row?.order_index || 0);
        if (Number.isFinite(orderIndex) && orderIndex > 0) {
          out[String(Math.floor(orderIndex))] = {
            selected_flow_id: toText(
              row?.decision?.selected_flow_id
              || row?.selected_outgoing_flow_id,
            ),
            selected_label: toText(
              row?.decision?.selected_label
              || row?.selected_condition,
            ),
            condition: toText(
              row?.decision?.selected_condition
              || row?.selected_condition,
            ),
          };
        }
      }
      walk(row?.children);
    });
  }
  walk(rowsRaw);
  return out;
}

function buildFlowMaps(dodSnapshot) {
  const incomingByNodeId = {};
  const outgoingByNodeId = {};
  toArray(dodSnapshot?.bpmn_flows).forEach((flowRaw) => {
    const flow = flowRaw && typeof flowRaw === "object" ? flowRaw : {};
    const flowId = toText(flow?.flow_id || flow?.id);
    const fromId = toText(flow?.from_id || flow?.sourceId || flow?.sourceRef);
    const toId = toText(flow?.to_id || flow?.targetId || flow?.targetRef);
    if (!flowId || !fromId || !toId) return;
    const item = {
      id: flowId,
      label: toText(flow?.label || flow?.condition || flow?.name),
      tier: normalizeTier(flow?.tier),
      fromId,
      toId,
    };
    if (!outgoingByNodeId[fromId]) outgoingByNodeId[fromId] = [];
    if (!incomingByNodeId[toId]) incomingByNodeId[toId] = [];
    outgoingByNodeId[fromId].push(item);
    incomingByNodeId[toId].push(item);
  });
  return { incomingByNodeId, outgoingByNodeId };
}

function buildDodByNodeId(dodSnapshot) {
  const byNodeId = {};
  toArray(dodSnapshot?.steps).forEach((stepRaw) => {
    const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
    const nodeId = toText(step?.bpmn?.nodeId || step?.bpmnId || step?.node_id);
    if (!nodeId) return;
    const missing = toArray(step?.dod?.missing).map((item) => toText(item)).filter(Boolean);
    if (!byNodeId[nodeId] || missing.length > byNodeId[nodeId].length) byNodeId[nodeId] = missing;
  });
  return byNodeId;
}

function linkGroupForNode(linkGroupsRaw, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  if (!nodeId) return null;
  return toArray(linkGroupsRaw).find((group) => {
    const ids = new Set([
      ...toArray(group?.throw_ids).map((id) => toText(id)),
      ...toArray(group?.catch_ids).map((id) => toText(id)),
    ]);
    return ids.has(nodeId);
  }) || null;
}

function counterpartIdsForNode(group, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  const ids = [
    ...toArray(group?.throw_ids).map((id) => toText(id)),
    ...toArray(group?.catch_ids).map((id) => toText(id)),
  ].filter(Boolean);
  const seen = new Set();
  return ids.filter((id) => {
    if (!id || id === nodeId || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildStepTimeByNodeId(stepsRaw) {
  const out = {};
  toArray(stepsRaw).forEach((step) => {
    const nodeId = toText(step?.node_id || step?.bpmn_ref);
    if (!nodeId || out[nodeId]) return;
    out[nodeId] = {
      step_id: toText(step?.id),
      work_duration_sec: Math.max(0, Number(step?.work_duration_sec || step?.duration_sec || 0)),
      wait_duration_sec: Math.max(0, Number(step?.wait_duration_sec || 0)),
    };
  });
  return out;
}

function toMinutesInputFromSeconds(secondsRaw) {
  const sec = Number(secondsRaw || 0);
  if (!Number.isFinite(sec) || sec <= 0) return "";
  if (sec % 60 === 0) return String(Math.round(sec / 60));
  return String(Math.round((sec / 60) * 10) / 10);
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function trimErrorPayload(raw, maxLen = 1200) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function buildApiErrorMeta(sourceRaw, fallback = {}) {
  const source = asObject(sourceRaw);
  const status = Number(source?.status || fallback?.status || 0);
  const method = toText(source?.method || fallback?.method || "GET").toUpperCase() || "GET";
  const endpoint = toText(source?.endpoint || fallback?.endpoint || source?.path);
  const requestUrl = toText(source?.request_url || source?.url);
  const errorName = toText(source?.error_name);
  const errorMessage = toText(source?.error_message || source?.message || source?.error);
  const detailRaw = toText(source?.response_text || source?.text)
    || trimErrorPayload(safeStringify(source?.data));
  return {
    status,
    method,
    endpoint,
    request_url: requestUrl,
    error_name: errorName,
    error_message: errorMessage,
    detail: trimErrorPayload(detailRaw),
  };
}

function buildApiErrorTitle(sourceRaw, fallbackTitle = "Ошибка API.") {
  const source = asObject(sourceRaw);
  return toText(source?.error || source?.message || fallbackTitle) || fallbackTitle;
}

function formatErrorClipboard(metaRaw) {
  const meta = asObject(metaRaw);
  const lines = [];
  if (Number.isFinite(Number(meta?.status)) && Number(meta?.status) > 0) lines.push(`status: ${Number(meta.status)}`);
  if (toText(meta?.method) || toText(meta?.endpoint)) lines.push(`${toText(meta?.method || "GET")} ${toText(meta?.endpoint || "")}`.trim());
  if (toText(meta?.request_url)) lines.push(`url: ${toText(meta?.request_url)}`);
  if (toText(meta?.error_name) || toText(meta?.error_message)) lines.push(`network: ${toText(meta?.error_name || "Error")} ${toText(meta?.error_message)}`.trim());
  if (toText(meta?.detail)) {
    lines.push("response:");
    lines.push(toText(meta.detail));
  }
  return lines.join("\n").trim();
}

function makeReportTraceEntry(seq, eventRaw, fallbackScope = "") {
  const event = asObject(eventRaw);
  const statusNum = Number(event?.status || 0);
  return {
    seq: Number(seq || 0),
    at_iso: new Date().toISOString(),
    phase: toText(event?.phase || "progress"),
    title: toText(event?.title || event?.message || "Шаг"),
    detail: toText(event?.detail),
    method: toText(event?.method || ""),
    endpoint: toText(event?.endpoint || ""),
    status: Number.isFinite(statusNum) && statusNum > 0 ? Math.floor(statusNum) : 0,
    report_id: toText(event?.report_id || event?.reportId),
    report_status: toText(event?.report_status || event?.reportStatus),
    scope: toText(event?.scope || fallbackScope),
  };
}

function applyReportTerminalOverrides(versionsRaw, overridesRaw) {
  const overrides = asObject(overridesRaw);
  return toArray(versionsRaw).map((rowRaw) => {
    const row = asObject(rowRaw);
    const reportId = toText(row?.id);
    const override = asObject(overrides[reportId]);
    if (!reportId || !toText(override?.status)) return row;
    return {
      ...row,
      status: toText(override?.status),
      error: toText(override?.error_message || row?.error),
    };
  });
}

const DURATION_COMMIT_DEBOUNCE_MS = 250;
const STEP_HIGHLIGHT_MS = 2600;
const REPORT_POLL_MAX_ATTEMPTS = 20;
const REPORT_POLL_MAX_MS = 120000;

function reportPollDelayMs(attemptRaw) {
  const attempt = Math.max(1, Number(attemptRaw || 1));
  if (attempt <= 1) return 1000;
  if (attempt === 2) return 2000;
  if (attempt === 3) return 3000;
  return 5000;
}

function parseMinutesToNullableSeconds(valueRaw) {
  const raw = String(valueRaw ?? "").trim();
  if (!raw) return null;
  const minutes = Number(raw.replace(",", "."));
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return Math.round(minutes * 60);
}

function isAbortLikeError(error) {
  if (!error) return false;
  const name = String(error?.name || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const msg = String(error?.message || error || "").toLowerCase();
  return name === "aborterror" || code === "abort_err" || msg.includes("aborted");
}

const StepDurationEditor = memo(function StepDurationEditor({
  stepId,
  workSec,
  waitSec,
  onCommitSeconds,
  variant = "row",
}) {
  const [workInput, setWorkInput] = useState(() => toMinutesInputFromSeconds(workSec));
  const [waitInput, setWaitInput] = useState(() => toMinutesInputFromSeconds(waitSec));
  const [presetsOpen, setPresetsOpen] = useState(false);
  const timersRef = useRef({ work: 0, wait: 0 });
  const presetsRef = useRef(null);

  useEffect(() => {
    setWorkInput(toMinutesInputFromSeconds(workSec));
  }, [stepId, workSec]);

  useEffect(() => {
    setWaitInput(toMinutesInputFromSeconds(waitSec));
  }, [stepId, waitSec]);

  useEffect(() => {
    return () => {
      if (timersRef.current.work) window.clearTimeout(timersRef.current.work);
      if (timersRef.current.wait) window.clearTimeout(timersRef.current.wait);
      timersRef.current = { work: 0, wait: 0 };
    };
  }, []);

  useEffect(() => {
    if (!presetsOpen) return undefined;
    function handleMouseDown(event) {
      const node = presetsRef.current;
      if (!node || node.contains(event.target)) return;
      setPresetsOpen(false);
    }
    window.addEventListener("mousedown", handleMouseDown);
    return () => window.removeEventListener("mousedown", handleMouseDown);
  }, [presetsOpen]);

  const commitNow = useCallback((kind, inputValue) => {
    if (!toText(stepId)) return;
    const seconds = parseMinutesToNullableSeconds(inputValue);
    if (String(inputValue ?? "").trim() === "") {
      onCommitSeconds?.(stepId, kind, null);
      return;
    }
    if (!Number.isFinite(seconds) || seconds < 0) return;
    onCommitSeconds?.(stepId, kind, seconds);
  }, [stepId, onCommitSeconds]);

  const scheduleCommit = useCallback((kind, inputValue) => {
    const key = kind === "wait" ? "wait" : "work";
    const timerId = timersRef.current[key];
    if (timerId) window.clearTimeout(timerId);
    timersRef.current[key] = window.setTimeout(() => {
      commitNow(kind, inputValue);
      timersRef.current[key] = 0;
    }, DURATION_COMMIT_DEBOUNCE_MS);
  }, [commitNow]);

  const flushCommit = useCallback((kind, inputValue) => {
    const key = kind === "wait" ? "wait" : "work";
    const timerId = timersRef.current[key];
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current[key] = 0;
    }
    commitNow(kind, inputValue);
  }, [commitNow]);

  function applyPreset(kind, deltaSec) {
    const isWork = kind === "work";
    const currentInput = isWork ? workInput : waitInput;
    const parsed = parseMinutesToNullableSeconds(currentInput);
    const baseSec = Number.isFinite(parsed) ? parsed : Number(isWork ? workSec : waitSec || 0);
    const nextSec = Math.max(0, Math.round(baseSec + Number(deltaSec || 0)));
    const nextInput = toMinutesInputFromSeconds(nextSec);
    if (isWork) setWorkInput(nextInput);
    else setWaitInput(nextInput);
    onCommitSeconds?.(stepId, kind, nextSec);
  }

  function clearField(kind) {
    const key = kind === "wait" ? "wait" : "work";
    const timerId = timersRef.current[key];
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current[key] = 0;
    }
    if (kind === "work") setWorkInput("");
    else setWaitInput("");
    onCommitSeconds?.(stepId, kind, null);
  }

  const presets = [
    { sec: 30, label: "+30s" },
    { sec: 60, label: "+1m" },
    { sec: 120, label: "+2m" },
    { sec: 300, label: "+5m" },
  ];

  function renderMinutesInput(kind) {
    const isWork = kind === "work";
    const inputValue = isWork ? workInput : waitInput;
    const setInput = isWork ? setWorkInput : setWaitInput;
    return (
      <div className={`interviewPathsTimeInputWrap ${variant === "detailed" ? "" : "compact"}`}>
        <input
          className="input interviewPathsTimeCompactInput"
          type="number"
          min="0"
          step="0.5"
          placeholder={isWork ? "Work" : "Wait"}
          aria-label={isWork ? "Work (мин)" : "Wait (мин)"}
          title={isWork ? "Work (активная работа), минуты" : "Wait (ожидание), минуты"}
          value={inputValue}
          onChange={(e) => {
            const value = e.target.value;
            setInput(value);
            scheduleCommit(kind, value);
          }}
          onBlur={() => flushCommit(kind, inputValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") flushCommit(kind, inputValue);
          }}
        />
        {toText(inputValue) ? (
          <button type="button" className="secondaryBtn tinyBtn interviewPathsTimeClearBtn" onClick={() => clearField(kind)} title="Очистить">
            ×
          </button>
        ) : null}
      </div>
    );
  }

  function renderPresets() {
    return (
      <div ref={presetsRef} className="interviewPathsPresetWrap">
        <button
          type="button"
          className="secondaryBtn tinyBtn interviewPathsPresetTrigger"
          onClick={() => setPresetsOpen((prev) => !prev)}
          title="Пресеты времени"
          aria-label="Открыть пресеты времени"
          aria-haspopup="menu"
          aria-expanded={presetsOpen}
        >
          {variant === "detailed" ? "Presets" : "+"}
        </button>
        {presetsOpen ? (
          <div className="interviewPathsPresetPopover" role="menu">
            <div className="interviewPathsPresetGroup">
              <div className="interviewPathsPresetTitle">Work</div>
              <div className="interviewPathsPresetButtons">
                {presets.map((preset) => (
                  <button
                    key={`work_${preset.sec}`}
                    type="button"
                    className="secondaryBtn tinyBtn"
                    onClick={() => applyPreset("work", preset.sec)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="interviewPathsPresetGroup">
              <div className="interviewPathsPresetTitle">Wait</div>
              <div className="interviewPathsPresetButtons">
                {presets.map((preset) => (
                  <button
                    key={`wait_${preset.sec}`}
                    type="button"
                    className="secondaryBtn tinyBtn"
                    onClick={() => applyPreset("wait", preset.sec)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (variant === "row") {
    return (
      <>
        <div className="interviewRouteTimeCell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {renderMinutesInput("work")}
        </div>
        <div className="interviewRouteTimeCell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {renderMinutesInput("wait")}
        </div>
        <div className="interviewRoutePresetCell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {renderPresets()}
        </div>
      </>
    );
  }

  return (
    <div
      className="interviewPathsInlineTimeEditor isDetailed"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <label className="interviewPathsTimeField">
        <span title="Работа = активное действие">Work, мин</span>
        {renderMinutesInput("work")}
      </label>
      <label className="interviewPathsTimeField">
        <span title="Ожидание = очередь/таймер/ожидание устройства/курьера">Wait, мин</span>
        {renderMinutesInput("wait")}
      </label>
      {renderPresets()}
    </div>
  );
});

const ReportApiErrorNotice = memo(function ReportApiErrorNotice({
  title,
  meta,
  tone = "warn",
  onCopyDetails,
}) {
  const message = toText(title);
  if (!message) return null;
  const clipboard = formatErrorClipboard(meta);
  const status = Number(meta?.status || 0);
  const method = toText(meta?.method || "GET");
  const endpoint = toText(meta?.endpoint || "—");
  return (
    <div className={`interviewAnnotationNotice ${tone}`}>
      <div>{message}</div>
      {(status > 0 || endpoint) ? (
        <div className="muted small">
          HTTP {status || "?"} · {method || "GET"} {endpoint || "—"}
        </div>
      ) : null}
      {clipboard ? (
        <details className="interviewApiErrorDetails">
          <summary>Показать детали</summary>
          <pre className="interviewApiErrorDetailsBody">{clipboard}</pre>
          <button
            type="button"
            className="secondaryBtn tinyBtn"
            onClick={() => onCopyDetails?.(meta)}
          >
            Copy details
          </button>
        </details>
      ) : null}
    </div>
  );
});

export default function InterviewPathsView({
  active = false,
  sessionId,
  interviewData,
  interviewVM,
  interviewGraph,
  tierFilters,
  selectedStepIds,
  onSelectStep,
  onSetTimelineViewMode,
  dodSnapshot,
  pathMetrics,
  patchStep,
  onReportBuildDebug,
  onPerfReady,
  externalIntent = null,
}) {
  const { user, orgs, activeOrgId } = useAuth();
  const vm = interviewVM && typeof interviewVM === "object" ? interviewVM : {};
  const [pathsCalcReady, setPathsCalcReady] = useState(false);
  const [scenarioPresentation, setScenarioPresentation] = useState(() => buildScenarioPresentation([]));
  const [stepMetaByNodeId, setStepMetaByNodeId] = useState({});
  const [stepIdMaps, setStepIdMaps] = useState({ stepById: {}, firstStepIdByNodeId: {} });
  const calcRunRef = useRef(0);
  const { stepById, firstStepIdByNodeId } = stepIdMaps;
  const selectedNodeIds = useMemo(() => makeSelectedNodeIdSet(selectedStepIds, stepById), [selectedStepIds, stepById]);
  const scenarios = scenarioPresentation.all;
  const legacyColorSource = toText(vm?.path_source).toLowerCase() === "flow_tier";

  const [selectedTier, setSelectedTier] = useState(() => getInitialTierFilter(tierFilters));
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [scenarioSortMode, setScenarioSortMode] = useState("bpmn");
  const [collapsedScenarioGroups, setCollapsedScenarioGroups] = useState({});
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [isPendingTransition, startTransition] = useTransition();
  const [reportLoadingCount, setReportLoadingCount] = useState(0);
  const [pendingGenerationVersions, setPendingGenerationVersions] = useState([]);
  const [reportVersionsLoading, setReportVersionsLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportErrorMeta, setReportErrorMeta] = useState(null);
  const [reportDetailsError, setReportDetailsError] = useState("");
  const [reportDetailsErrorMeta, setReportDetailsErrorMeta] = useState(null);
  const [currentStepsHash, setCurrentStepsHash] = useState("");
  const [reportVersions, setReportVersions] = useState([]);
  const [reportDetailsById, setReportDetailsById] = useState({});
  const [selectedReportId, setSelectedReportId] = useState("");
  const [reportDetailsLoadingId, setReportDetailsLoadingId] = useState("");
  const [reportFilterActualOnly, setReportFilterActualOnly] = useState(false);
  const [reportFilterErrorsOnly, setReportFilterErrorsOnly] = useState(false);
  const [activeRecommendationOrderIndex, setActiveRecommendationOrderIndex] = useState(0);
  const [reportGenerationTrace, setReportGenerationTrace] = useState([]);
  const [latestReportBuildDebugByPath, setLatestReportBuildDebugByPath] = useState({});
  const [reportTerminalOverrides, setReportTerminalOverrides] = useState({});
  const [reportDeleteInFlightId, setReportDeleteInFlightId] = useState("");
  const [isReportsDrawerOpen, setIsReportsDrawerOpen] = useState(false);
  const recommendationHighlightTimerRef = useRef(0);
  const reportListAbortRef = useRef(null);
  const reportDetailsAbortRef = useRef(null);
  const reportListReqIdRef = useRef(0);
  const reportDetailsReqIdRef = useRef(0);
  const reportScopeRef = useRef("");
  const reportTraceSeqRef = useRef(0);
  const reportTraceStatusByReportRef = useRef({});
  const reportTracePersistByReportRef = useRef({});
  const reportTraceInterruptedByReportRef = useRef({});
  const reportTraceHideTimerRef = useRef(0);
  const externalIntentHandledRef = useRef("");
  useEffect(() => {
    const persisted = asObject(interviewData?.report_build_debug);
    const pathId = toText(persisted?.path_id_used);
    if (!pathId) return;
    setLatestReportBuildDebugByPath((prev) => {
      const current = asObject(prev);
      const existing = asObject(current[pathId]);
      if (JSON.stringify(existing || {}) === JSON.stringify(persisted || {})) return current;
      return {
        ...current,
        [pathId]: persisted,
      };
    });
  }, [interviewData?.report_build_debug]);
  useEffect(() => {
    externalIntentHandledRef.current = "";
  }, [sessionId]);
  const deferredSelectedTier = useDeferredValue(selectedTier);
  const reportLoading = reportLoadingCount > 0;
  const stepTimeByNodeId = useMemo(() => buildStepTimeByNodeId(vm?.steps), [vm?.steps]);
  const activeOrgRole = useMemo(() => {
    const oid = toText(activeOrgId);
    if (!oid) return "";
    const row = toArray(orgs).find((item) => toText(item?.org_id || item?.id) === oid);
    return toText(row?.role).toLowerCase();
  }, [activeOrgId, orgs]);
  const canDeleteReports = useMemo(() => {
    if (Boolean(user?.is_admin)) return true;
    return activeOrgRole === "org_owner" || activeOrgRole === "org_admin" || activeOrgRole === "project_manager";
  }, [activeOrgRole, user?.is_admin]);

  useEffect(() => {
    return () => {
      try {
        reportListAbortRef.current?.abort();
      } catch {
        // ignore abort errors
      }
      try {
        reportDetailsAbortRef.current?.abort();
      } catch {
        // ignore abort errors
      }
      if (reportTraceHideTimerRef.current) {
        window.clearTimeout(reportTraceHideTimerRef.current);
        reportTraceHideTimerRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setPathsCalcReady(false);
      return undefined;
    }
    const runId = ++calcRunRef.current;
    const startMark = `interview.paths.vm.start:${runId}`;
    const endMark = `interview.paths.vm.done:${runId}`;
    markInterviewPerf(startMark);
    setPathsCalcReady(false);
    const cancelIdle = scheduleInterviewIdle(() => {
      if (runId !== calcRunRef.current) return;
      const nextScenarioPresentation = buildScenarioPresentation(vm?.scenarios);
      const nextStepMetaByNodeId = buildStepMetaByNodeId(vm?.steps);
      const nextStepIdMaps = makeStepIdMaps(vm?.steps);
      if (runId !== calcRunRef.current) return;
      setScenarioPresentation(nextScenarioPresentation);
      setStepMetaByNodeId(nextStepMetaByNodeId);
      setStepIdMaps(nextStepIdMaps);
      setPathsCalcReady(true);
      markInterviewPerf(endMark);
      const durationMs = measureInterviewSpan({
        name: `interview.paths.vm:${toText(sessionId) || "unknown"}`,
        startMark,
        endMark,
        meta: () => ({
          sid: toText(sessionId),
          scenarios: toArray(vm?.scenarios).length,
          steps: toArray(vm?.steps).length,
        }),
      });
      onPerfReady?.({
        phase: "paths_vm",
        duration_ms: durationMs,
        scenarios: toArray(vm?.scenarios).length,
        steps: toArray(vm?.steps).length,
      });
    }, { timeout: 320 });
    return () => {
      cancelIdle?.();
    };
  }, [active, sessionId, vm?.scenarios, vm?.steps, onPerfReady]);

  const commitDurationSeconds = useCallback((stepIdRaw, kindRaw, nextSecRaw) => {
    const stepId = toText(stepIdRaw);
    const kind = toText(kindRaw);
    if (!stepId || !kind || typeof patchStep !== "function") return;
    const sec = Number.isFinite(Number(nextSecRaw)) ? Math.max(0, Math.round(Number(nextSecRaw))) : null;
    if (kind === "work") {
      const min = sec === null ? "" : String(Math.round(sec / 60));
      patchStep(stepId, "work_duration_sec", sec);
      patchStep(stepId, "duration_sec", sec === null ? "" : sec);
      patchStep(stepId, "step_time_sec", sec === null ? "" : sec);
      patchStep(stepId, "duration_min", min);
      patchStep(stepId, "step_time_min", min);
      return;
    }
    const waitMin = sec === null ? "" : String(Math.round(sec / 60));
    patchStep(stepId, "wait_duration_sec", sec);
    patchStep(stepId, "wait_sec", sec === null ? "" : sec);
    patchStep(stepId, "wait_min", waitMin);
  }, [patchStep]);

  useEffect(() => {
    const fromFilters = getInitialTierFilter(tierFilters);
    setSelectedTier((prev) => prev || fromFilters);
  }, [tierFilters]);

  const visibleScenarios = useMemo(() => {
    const base = filterScenariosByTierView(scenarios, deferredSelectedTier);
    const query = toText(scenarioSearch).toLowerCase();
    const filtered = query
      ? base.filter((scenario) => (
        toText(scenarioPresentation.scenarioDisplayTitle(scenario)).toLowerCase().includes(query)
        || toText(scenario?.label).toLowerCase().includes(query)
        || toText(scenario?.id).toLowerCase().includes(query)
      ))
      : base;

    const withTime = filtered.map((scenario) => ({
      scenario,
      durationSec: scenarioDurationSec(scenario, stepTimeByNodeId),
      failRank: toText(scenario?.outcome).toLowerCase() === "fail" ? 1 : 0,
      bpmnOrder: Number(toArray(scenario?.sequence)?.[0]?.order_index || 0),
    }));

    withTime.sort((a, b) => {
      if (scenarioSortMode === "time") {
        if (b.durationSec !== a.durationSec) return b.durationSec - a.durationSec;
      } else if (scenarioSortMode === "errors") {
        if (b.failRank !== a.failRank) return b.failRank - a.failRank;
        const da = Number(toArray(a.scenario?.diff_from_ideal?.differing_gateway_decisions).length || 0);
        const db = Number(toArray(b.scenario?.diff_from_ideal?.differing_gateway_decisions).length || 0);
        if (db !== da) return db - da;
      } else if (a.bpmnOrder !== b.bpmnOrder) {
        return a.bpmnOrder - b.bpmnOrder;
      }
      return toText(scenarioPresentation.scenarioDisplayTitle(a.scenario)).localeCompare(
        toText(scenarioPresentation.scenarioDisplayTitle(b.scenario)),
        "ru",
      );
    });
    return withTime.map((item) => item.scenario);
  }, [deferredSelectedTier, scenarios, scenarioSearch, scenarioSortMode, scenarioPresentation, stepTimeByNodeId]);

  const scenarioMetricsById = useMemo(() => {
    const out = {};
    toArray(scenarios).forEach((scenario) => {
      const scenarioId = toText(scenario?.id);
      if (!scenarioId) return;
      const metrics = buildScenarioMetrics(scenario, stepTimeByNodeId);
      out[scenarioId] = {
        ...metrics,
        total_time_sec_label: formatSeconds(metrics?.total_time_sec),
      };
    });
    return out;
  }, [scenarios, stepTimeByNodeId]);

  const visibleSections = useMemo(() => {
    const byKey = {
      P0_IDEAL: { key: "P0_IDEAL", title: "P0 Ideal", items: [] },
      P0_ALT: { key: "P0_ALT", title: "P0 Alt", items: [] },
      P1_MITIGATED: { key: "P1_MITIGATED", title: "P1 Mitigated", items: [] },
      P2_FAIL: { key: "P2_FAIL", title: "P2 Fail", items: [] },
    };
    toArray(visibleScenarios).forEach((scenario) => {
      const bucket = scenarioBucket(scenario);
      if (byKey[bucket]) byKey[bucket].items.push(scenario);
    });
    return ["P0_IDEAL", "P0_ALT", "P1_MITIGATED", "P2_FAIL"]
      .map((key) => byKey[key])
      .filter((section) => toArray(section?.items).length > 0);
  }, [visibleScenarios]);

  useEffect(() => {
    const list = visibleScenarios;
    if (!list.length) {
      setSelectedScenarioId("");
      return;
    }
    setSelectedScenarioId((prev) => {
      if (prev && list.some((scenario) => toText(scenario?.id) === prev)) return prev;
      if (deferredSelectedTier === "P0" || deferredSelectedTier === "ALL") {
        const ideal = list.find((scenario) => toText(scenario?.rank_class).toLowerCase() === "ideal");
        return toText(ideal?.id || list[0]?.id);
      }
      return toText(list[0]?.id);
    });
  }, [deferredSelectedTier, visibleScenarios]);

  useEffect(() => {
    const intent = asObject(externalIntent);
    const intentKey = toText(intent?.key);
    if (!active || !intentKey) return;
    if (externalIntentHandledRef.current === intentKey) return;
    const intentSid = toText(intent?.sid);
    if (intentSid && intentSid !== toText(sessionId)) return;
    if (!pathsCalcReady || !scenarios.length) return;

    const intentTier = normalizeTier(intent?.tier);
    if (intentTier && intentTier !== "ALL") {
      setSelectedTier(intentTier);
    }
    const matchedScenario = findScenarioByIntent(scenarios, intent);
    if (matchedScenario) {
      setSelectedScenarioId(toText(matchedScenario?.id));
    }
    const action = toText(intent?.action).toLowerCase();
    if (action === "open_reports") {
      setIsReportsDrawerOpen(true);
    } else if (action === "open_paths") {
      setIsReportsDrawerOpen(false);
    }
    externalIntentHandledRef.current = intentKey;
  }, [externalIntent, active, sessionId, pathsCalcReady, scenarios]);

  const activeScenario = useMemo(() => {
    const list = visibleScenarios;
    if (!list.length) return null;
    if (selectedScenarioId) {
      const found = list.find((scenario) => toText(scenario?.id) === selectedScenarioId);
      if (found) return found;
    }
    return list[0] || null;
  }, [visibleScenarios, selectedScenarioId]);

  useEffect(() => {
    const selectedNode = Array.from(selectedNodeIds)[0] || "";
    if (!selectedNode) return;
    if (activeScenario && scenarioContainsNodeId(activeScenario, selectedNode)) return;

    const inVisible = visibleScenarios.find((scenario) => scenarioContainsNodeId(scenario, selectedNode));
    if (inVisible) {
      setSelectedScenarioId(toText(inVisible?.id));
      return;
    }
    const inAny = scenarios.find((scenario) => scenarioContainsNodeId(scenario, selectedNode));
    if (inAny) {
      setSelectedTier(normalizeTier(inAny?.tier));
      setSelectedScenarioId(toText(inAny?.id));
    }
  }, [selectedNodeIds, activeScenario, visibleScenarios, scenarios]);

  const routeRows = useMemo(() => toArray(activeScenario?.rows), [activeScenario]);
  const routeStepRows = useMemo(() => buildScenarioStepRows(activeScenario), [activeScenario]);
  const decisionByNodeId = useMemo(
    () => buildDecisionHintsByNodeIdFromScenarioRows(routeRows),
    [routeRows],
  );
  const decisionByOrderIndex = useMemo(
    () => buildDecisionHintsByOrderIndexFromScenarioRows(routeRows),
    [routeRows],
  );
  const activePathId = useMemo(() => {
    return resolveScenarioPathId(activeScenario);
  }, [
    activeScenario?.sequence_key,
    activeScenario?.sequenceKey,
    activeScenario?.path_id,
    activeScenario?.pathId,
    activeScenario?.id,
  ]);
  const activePathName = useMemo(() => {
    return toText(scenarioPresentation?.scenarioDisplayTitle?.(activeScenario))
      || toText(activeScenario?.label)
      || toText(interviewData?.path_spec?.name || interviewData?.pathSpec?.name)
      || activePathId;
  }, [scenarioPresentation, activeScenario, interviewData?.path_spec, interviewData?.pathSpec, activePathId]);

  useEffect(() => {
    setSelectedRouteKey("");
  }, [selectedScenarioId]);

  useEffect(() => {
    if (selectedRouteKey) return;
    const selectedNode = Array.from(selectedNodeIds)[0] || "";
    if (!selectedNode) return;
    const row = routeStepRows.find((item) => toText(item?.node_id) === selectedNode);
    if (row) {
      setSelectedRouteKey(`route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key)}`);
    }
  }, [selectedRouteKey, selectedNodeIds, routeStepRows]);

  const activeRouteRow = useMemo(() => {
    if (!selectedRouteKey) return null;
    return routeStepRows.find((row) => `route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key)}` === selectedRouteKey) || null;
  }, [selectedRouteKey, routeStepRows]);
  const activeRouteIndex = useMemo(() => {
    if (!selectedRouteKey) return -1;
    return routeStepRows.findIndex((row) => `route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key)}` === selectedRouteKey);
  }, [selectedRouteKey, routeStepRows]);

  const matrixRowsForValidation = useMemo(() => {
    if (!import.meta.env.DEV || !active || !pathsCalcReady) return [];
    return buildScenarioMatrixRows({
      scenario: activeScenario,
      vmSteps: vm?.steps,
      collapseById: {},
      p0Mode: selectedTier === "P0",
    });
  }, [active, pathsCalcReady, activeScenario, vm?.steps, selectedTier]);
  const orderValidation = useMemo(() => {
    if (!import.meta.env.DEV) return { ok: true, firstNotStart: false };
    return validateScenarioRowOrder(matrixRowsForValidation);
  }, [matrixRowsForValidation]);
  const showDevOrderWarning = !!import.meta.env.DEV && !orderValidation.ok;
  const diffDecisionGatewayIds = useMemo(() => {
    return new Set(
      toArray(activeScenario?.diff_from_ideal?.differing_gateway_decisions)
        .map((item) => toText(item?.gateway_id))
        .filter(Boolean),
    );
  }, [activeScenario]);
  const activeScenarioMetrics = useMemo(
    () => buildScenarioMetrics(activeScenario, stepTimeByNodeId),
    [activeScenario, stepTimeByNodeId],
  );
  const activePathMetrics = useMemo(() => {
    if (!Number(activeScenarioMetrics?.steps_count || 0)) {
      const fallback = pathMetrics && typeof pathMetrics === "object" ? pathMetrics : {};
      const stepsCount = Number(fallback?.steps_count || 0);
      const workTotal = Number(fallback?.work_time_total_sec || 0);
      const waitTotal = Number(fallback?.wait_time_total_sec || 0);
      const total = Number(fallback?.total_time_sec || workTotal + waitTotal);
      return {
        steps_count: stepsCount,
        work_time_total_sec: workTotal,
        wait_time_total_sec: waitTotal,
        total_time_sec: total,
      };
    }
    return activeScenarioMetrics;
  }, [activeScenarioMetrics, pathMetrics]);
  const reportScenarioSequence = useMemo(
    () => buildScenarioSequenceForReport(activeScenario),
    [activeScenario],
  );
  const reportScenarioSequenceBuild = useMemo(() => {
    return stitchScenarioSequenceByLinkEvents({
      scenarioSequence: reportScenarioSequence,
      graphModel: interviewGraph,
      dodSnapshot,
    });
  }, [reportScenarioSequence, interviewGraph, dodSnapshot]);
  const reportScenarioSequenceForReport = useMemo(
    () => toArray(reportScenarioSequenceBuild?.sequence),
    [reportScenarioSequenceBuild],
  );
  const reportScenarioLabel = useMemo(() => {
    return toText(scenarioPresentation?.scenarioDisplayTitle?.(activeScenario))
      || toText(activeScenario?.label)
      || "Scenario";
  }, [scenarioPresentation, activeScenario]);
  const reportApiAvailable = !!toText(sessionId) && !isLocalSessionId(toText(sessionId));
  const canGenerateReport = reportApiAvailable
    && !!toText(activePathId)
    && pathsCalcReady
    && Number(reportScenarioSequenceForReport.length || activePathMetrics?.steps_count || 0) >= 1;
  const reportBuildPreviewSteps = useMemo(() => {
    return buildManualPathReportSteps(interviewData, {
      decisionByNodeId,
      decisionByOrderIndex,
      scenarioSequence: reportScenarioSequenceForReport,
    });
  }, [
    interviewData?.steps,
    interviewData?.path_spec,
    interviewData?.pathSpec,
    decisionByNodeId,
    decisionByOrderIndex,
    reportScenarioSequenceForReport,
  ]);
  const reportBuildDebugRouteSteps = useMemo(
    () => normalizeDebugRouteSteps(reportBuildPreviewSteps),
    [reportBuildPreviewSteps],
  );
  const reportBuildDebugPreview = useMemo(() => {
    return {
      ...buildReportBuildDebug({
        sessionId,
        selectedScenarioLabel: reportScenarioLabel,
        pathIdUsed: activePathId,
        scenarioRaw: activeScenario,
        scenarioSequence: reportScenarioSequenceForReport,
        steps: reportBuildPreviewSteps,
        graphModel: interviewGraph,
        dodSnapshot,
      }),
      selected_scenario_id: toText(activeScenario?.id),
      scenario_tier: normalizeTier(activeScenario?.tier),
      sequence_key: toText(activeScenario?.sequence_key || activeScenario?.sequenceKey),
      route_steps: reportBuildDebugRouteSteps,
      source: "scenario_selection",
    };
  }, [
    sessionId,
    reportScenarioLabel,
    activePathId,
    activeScenario?.id,
    activeScenario?.tier,
    activeScenario?.sequence_key,
    activeScenario?.sequenceKey,
    activeScenario,
    reportScenarioSequenceForReport,
    reportBuildPreviewSteps,
    reportBuildDebugRouteSteps,
    interviewGraph,
    dodSnapshot,
  ]);
  useEffect(() => {
    if (!active || !pathsCalcReady) return;
    if (typeof onReportBuildDebug !== "function") return;
    const nextDebug = asObject(reportBuildDebugPreview);
    if (!toText(nextDebug?.path_id_used) || !toArray(nextDebug?.route_steps).length) return;
    const currentComparable = buildReportBuildDebugComparable(asObject(interviewData?.report_build_debug));
    const nextComparable = buildReportBuildDebugComparable(nextDebug);
    if (JSON.stringify(currentComparable) === JSON.stringify(nextComparable)) return;
    onReportBuildDebug(nextDebug);
  }, [
    active,
    pathsCalcReady,
    onReportBuildDebug,
    reportBuildDebugPreview,
    interviewData?.report_build_debug,
  ]);
  const activeReportBuildDebug = useMemo(() => {
    const byPath = asObject(latestReportBuildDebugByPath);
    const pid = toText(activePathId);
    return asObject(byPath[pid] || reportBuildDebugPreview);
  }, [latestReportBuildDebugByPath, activePathId, reportBuildDebugPreview]);
  const reportsEndpoint = useMemo(() => {
    const sid = encodeURIComponent(toText(sessionId));
    const pid = encodeURIComponent(toText(activePathId));
    if (!sid || !pid) return "/api/sessions/:sessionId/paths/:pathId/reports";
    return `/api/sessions/${sid}/paths/${pid}/reports`;
  }, [sessionId, activePathId]);
  const reportRequestScope = useMemo(
    () => `${toText(sessionId)}|${toText(activePathId)}|${toText(currentStepsHash)}`,
    [sessionId, activePathId, currentStepsHash],
  );
  useEffect(() => {
    reportScopeRef.current = reportRequestScope;
  }, [reportRequestScope]);
  const reportVersionsView = useMemo(
    () => decorateReportVersionsWithActuality(
      applyReportTerminalOverrides(reportVersions, reportTerminalOverrides),
      currentStepsHash,
    ),
    [reportVersions, reportTerminalOverrides, currentStepsHash],
  );
  const visibleReportVersions = useMemo(() => {
    const sorted = [...toArray(reportVersionsView)].sort(
      (a, b) => Number(b?.version || 0) - Number(a?.version || 0),
    );
    return sorted.filter((row) => {
      if (reportFilterActualOnly && !row?.is_actual) return false;
      if (reportFilterErrorsOnly && toText(row?.status) !== "error") return false;
      return true;
    });
  }, [reportVersionsView, reportFilterActualOnly, reportFilterErrorsOnly]);
  const latestActualReportId = useMemo(() => {
    const latest = reportVersionsView.find((row) => !!row?.is_latest_actual);
    return toText(latest?.id);
  }, [reportVersionsView]);
  const selectedReportSummary = useMemo(() => {
    return asObject(reportVersionsView.find((item) => toText(item?.id) === toText(selectedReportId)));
  }, [reportVersionsView, selectedReportId]);
  const selectedReportDetails = useMemo(() => {
    return asObject(reportDetailsById[toText(selectedReportId)]);
  }, [reportDetailsById, selectedReportId]);
  const selectedReportView = useMemo(() => {
    const selectedId = toText(selectedReportSummary?.id || selectedReportDetails?.id);
    const localOverride = asObject(reportTerminalOverrides[selectedId]);
    const normalizedPayload = asObject(
      selectedReportDetails?.payload_normalized
      || selectedReportDetails?.report_json
      || selectedReportSummary?.payload_normalized
      || selectedReportSummary?.report_json,
    );
    const payloadRaw = (
      selectedReportDetails?.payload_raw
      ?? selectedReportSummary?.payload_raw
      ?? selectedReportDetails?.raw_json
      ?? selectedReportSummary?.raw_json
      ?? {}
    );
    const rawText = toText(selectedReportDetails?.raw_text || normalizedPayload?.raw_text);
    return {
      id: selectedId,
      version: Number(selectedReportSummary?.version || selectedReportDetails?.version || 0),
      created_at: Number(selectedReportSummary?.created_at || selectedReportDetails?.created_at || 0),
      status: toText(localOverride?.status || selectedReportSummary?.status || selectedReportDetails?.status || "running"),
      steps_hash: toText(selectedReportSummary?.steps_hash || selectedReportDetails?.steps_hash),
      model: toText(selectedReportSummary?.model || selectedReportDetails?.model),
      prompt_template_version: toText(selectedReportSummary?.prompt_template_version || selectedReportDetails?.prompt_template_version),
      payload_normalized: normalizedPayload,
      payload_raw: payloadRaw,
      report_json: normalizedPayload,
      raw_json: asObject(selectedReportDetails?.raw_json || selectedReportSummary?.raw_json || (payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {})),
      report_markdown: normalizeReportMarkdown(
        selectedReportDetails?.report_markdown,
        rawText,
        normalizedPayload,
      ),
      raw_text: rawText,
      recommendations: toArray(selectedReportDetails?.recommendations_json || normalizedPayload?.recommendations || selectedReportDetails?.recommendations),
      missing_data: toArray(selectedReportDetails?.missing_data_json || normalizedPayload?.missing_data || selectedReportDetails?.missing_data),
      risks: toArray(selectedReportDetails?.risks_json || normalizedPayload?.risks || selectedReportDetails?.risks),
      request_payload_json: asObject(selectedReportDetails?.request_payload_json),
      steps: toArray(
        selectedReportDetails?.steps_json
        || selectedReportDetails?.steps
        || asObject(selectedReportDetails?.request_payload_json)?.steps,
      ),
      warnings: toArray(selectedReportDetails?.warnings_json || selectedReportDetails?.warnings),
      error_message: toText(localOverride?.error_message || selectedReportDetails?.error_message || selectedReportSummary?.error),
      is_actual: !!selectedReportSummary?.is_actual,
    };
  }, [selectedReportSummary, selectedReportDetails, reportTerminalOverrides]);
  const appendReportTrace = useCallback((eventRaw = {}) => {
    reportTraceSeqRef.current += 1;
    const entry = makeReportTraceEntry(reportTraceSeqRef.current, eventRaw, reportRequestScope);
    setReportGenerationTrace((prev) => [...toArray(prev), entry].slice(-80));
  }, [reportRequestScope]);
  const appendReportStatusTrace = useCallback((reportIdRaw, statusRaw, reportRaw = {}) => {
    const reportId = toText(reportIdRaw);
    const reportStatus = toText(statusRaw).toLowerCase();
    if (!reportId || !reportStatus) return;
    if (toText(reportTraceStatusByReportRef.current?.[reportId]).toLowerCase() === reportStatus) return;
    reportTraceStatusByReportRef.current = {
      ...asObject(reportTraceStatusByReportRef.current),
      [reportId]: reportStatus,
    };
    appendReportTrace({
      phase: "status",
      title: `Статус версии v${Number(asObject(reportRaw)?.version || 0)}: ${reportStatus}`,
      report_id: reportId,
      report_status: reportStatus,
      detail: reportStatus === "error" ? toText(asObject(reportRaw)?.error_message) : "",
    });
  }, [appendReportTrace]);
  const appendReportPersistTrace = useCallback((reportRaw = {}) => {
    const report = asObject(reportRaw);
    const reportId = toText(report?.id);
    const reportStatus = toText(report?.status).toLowerCase();
    if (!reportId || (reportStatus !== "ok" && reportStatus !== "error")) return;
    if (toText(reportTracePersistByReportRef.current?.[reportId]).toLowerCase() === reportStatus) return;
    reportTracePersistByReportRef.current = {
      ...asObject(reportTracePersistByReportRef.current),
      [reportId]: reportStatus,
    };
    appendReportTrace({
      phase: "save_status",
      title: `Сохранение версии v${Number(report?.version || 0)}: ${reportStatus === "ok" ? "успешно" : "с ошибкой"}`,
      report_id: reportId,
      report_status: reportStatus,
      detail: reportStatus === "ok"
        ? "Версия сохранена в session storage."
        : (toText(report?.error_message) || "Версия сохранена со статусом ошибки."),
    });
  }, [appendReportTrace]);
  const markReportAsInterrupted = useCallback((reportIdRaw, sourceRaw = {}, options = {}) => {
    const reportId = toText(reportIdRaw);
    if (!reportId) return;
    const source = asObject(sourceRaw);
    const status = Number(source?.status || 0);
    const fallbackReportId = toText(options?.fallbackReportId);
    const message = toText(options?.message)
      || (status === 404
        ? "Не удалось загрузить данные отчёта"
        : (status === 401 || status === 403)
          ? "Нет доступа к данным отчёта"
          : "Генерация отчёта прервана");

    setReportTerminalOverrides((prev) => {
      const current = asObject(prev);
      const prevEntry = asObject(current[reportId]);
      if (
        toText(prevEntry?.status) === "error"
        && toText(prevEntry?.error_message) === message
      ) {
        return current;
      }
      return {
        ...current,
        [reportId]: {
          status: "error",
          error_message: message,
          http_status: status || 0,
        },
      };
    });
    setReportVersions((prev) => toArray(prev).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (toText(row?.id) !== reportId) return row;
      return {
        ...row,
        status: "error",
        error: message,
      };
    }));
    setReportDetailsById((prev) => ({
      ...asObject(prev),
      [reportId]: {
        ...asObject(asObject(prev)[reportId]),
        id: reportId,
        status: "error",
        error_message: message,
      },
    }));
    if (toText(selectedReportId) === reportId) {
      setSelectedReportId((prev) => {
        if (toText(prev) !== reportId) return prev;
        if (fallbackReportId && fallbackReportId !== reportId) return fallbackReportId;
        const nextFromList = toText(
          toArray(reportVersions)
            .map((rowRaw) => toText(asObject(rowRaw)?.id))
            .find((id) => id && id !== reportId),
        );
        return nextFromList || "";
      });
      setReportDetailsError(message);
      setReportDetailsErrorMeta(buildApiErrorMeta(source, {
        method: "GET",
        endpoint: toText(options?.endpoint || source?.endpoint || `/api/reports/${encodeURIComponent(reportId)}`),
      }));
    }
    if (!reportTraceInterruptedByReportRef.current[reportId]) {
      reportTraceInterruptedByReportRef.current = {
        ...asObject(reportTraceInterruptedByReportRef.current),
        [reportId]: true,
      };
      appendReportTrace({
        phase: "status",
        title: `Статус версии: error`,
        report_id: reportId,
        report_status: "error",
        status: status > 0 ? status : 0,
        detail: message,
      });
    }
  }, [appendReportTrace, selectedReportId, reportVersions]);

  async function buildRequestForActivePath() {
    if (!toText(activePathId)) {
      throw new Error("active_path_id_required");
    }
    const request = await buildPathReportRequest({
      sessionId,
      pathId: activePathId,
      pathName: activePathName,
      interviewData,
      dodSnapshot,
      qualitySummary: asObject(interviewVM?.quality),
      totals: activePathMetrics,
      generatedAt: new Date().toISOString(),
      decisionByNodeId,
      decisionByOrderIndex,
      scenarioSequence: reportScenarioSequenceForReport,
    });
    const reportBuildDebug = buildReportBuildDebug({
      sessionId,
      selectedScenarioLabel: reportScenarioLabel,
      pathIdUsed: activePathId,
      scenarioRaw: activeScenario,
      scenarioSequence: reportScenarioSequenceForReport,
      steps: request?.steps,
      graphModel: interviewGraph,
      dodSnapshot,
    });
    return {
      ...request,
      reportBuildDebug,
    };
  }

  useEffect(() => {
    let cancelled = false;
    const cancelIdle = scheduleInterviewIdle(async () => {
      if (cancelled) return;
      if (!active || !pathsCalcReady || !canGenerateReport) {
        if (!cancelled) setCurrentStepsHash("");
        return;
      }
      try {
        const request = await buildRequestForActivePath();
        if (!cancelled) setCurrentStepsHash(toText(request?.steps_hash));
      } catch {
        if (!cancelled) setCurrentStepsHash("");
      }
    }, { timeout: 320 });
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [
    active,
    pathsCalcReady,
    canGenerateReport,
    sessionId,
    activePathId,
    activePathName,
    interviewData,
    activePathMetrics,
    activeScenario,
    decisionByNodeId,
    decisionByOrderIndex,
    dodSnapshot,
    interviewGraph,
    interviewVM?.quality,
    reportScenarioLabel,
    reportScenarioSequenceForReport,
  ]);

  useEffect(() => {
    try {
      reportListAbortRef.current?.abort();
    } catch {
      // ignore abort errors
    }
    try {
      reportDetailsAbortRef.current?.abort();
    } catch {
      // ignore abort errors
    }
    setReportError("");
    setReportErrorMeta(null);
    setReportDetailsError("");
    setReportDetailsErrorMeta(null);
    setActiveRecommendationOrderIndex(0);
    setReportVersions([]);
    setReportDetailsById({});
    setSelectedReportId("");
    setPendingGenerationVersions([]);
    setReportLoadingCount(0);
    setReportDeleteInFlightId("");
    setReportGenerationTrace([]);
    reportTraceSeqRef.current = 0;
    reportTraceStatusByReportRef.current = {};
    reportTracePersistByReportRef.current = {};
    reportTraceInterruptedByReportRef.current = {};
    setReportTerminalOverrides({});
    if (reportTraceHideTimerRef.current) {
      window.clearTimeout(reportTraceHideTimerRef.current);
      reportTraceHideTimerRef.current = 0;
    }
  }, [activePathId]);

  useEffect(() => {
    return () => {
      if (recommendationHighlightTimerRef.current) {
        window.clearTimeout(recommendationHighlightTimerRef.current);
      }
    };
  }, []);

  async function reloadReportVersions(preferReportId = "", options = {}) {
    const force = !!options?.force;
    if (!active || (!isReportsDrawerOpen && !force)) return { skipped: true };
    if (!reportApiAvailable || !toText(activePathId)) {
      setReportVersions([]);
      setSelectedReportId("");
      setReportError("");
      setReportErrorMeta(null);
      return { ok: false, status: 0, error: "reports api unavailable" };
    }
    const requestScope = String(options?.requestScope || reportRequestScope);
    const requestId = Number(reportListReqIdRef.current || 0) + 1;
    reportListReqIdRef.current = requestId;
    try {
      reportListAbortRef.current?.abort();
    } catch {
      // ignore abort errors
    }
    const controller = new AbortController();
    reportListAbortRef.current = controller;
    setReportVersionsLoading(true);
    setReportError("");
    setReportErrorMeta(null);
    try {
      const response = await apiListPathReportVersions(sessionId, activePathId, { signal: controller.signal });
      if (controller.signal.aborted || requestId !== reportListReqIdRef.current || requestScope !== reportScopeRef.current) return;
      if (response?.aborted) return;
      if (!response?.ok) {
        setReportVersions([]);
        setReportError(buildApiErrorTitle(response, "Не удалось загрузить список отчётов."));
        setReportErrorMeta(buildApiErrorMeta(response, { method: "GET", endpoint: reportsEndpoint }));
        return response;
      }
      const items = toArray(response?.items);
      setReportVersions(items);
      const preferred = toText(preferReportId);
      setSelectedReportId((prev) => {
        if (preferred && items.some((item) => toText(item?.id) === preferred)) return preferred;
        if (prev && items.some((item) => toText(item?.id) === prev)) return prev;
        return toText(items[0]?.id);
      });
      return response;
    } catch (error) {
      if (isAbortLikeError(error)) return;
      setReportVersions([]);
      setReportError(buildApiErrorTitle(error, "Не удалось загрузить список отчётов."));
      setReportErrorMeta(buildApiErrorMeta(error, { method: "GET", endpoint: reportsEndpoint }));
      return { ok: false, status: Number(error?.status || 0), error: buildApiErrorTitle(error, "Не удалось загрузить список отчётов.") };
    } finally {
      if (requestId === reportListReqIdRef.current) setReportVersionsLoading(false);
    }
    return { ok: false, status: 0, error: "unknown list reload error" };
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!active || !isReportsDrawerOpen) return;
      if (!toText(sessionId) || !toText(activePathId)) {
        if (!cancelled) {
          setReportVersions([]);
          setSelectedReportId("");
        }
        return;
      }
      if (cancelled) return;
      await reloadReportVersions("", { requestScope: reportRequestScope });
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [active, isReportsDrawerOpen, sessionId, activePathId, reportApiAvailable, reportRequestScope]);

  useEffect(() => {
    let cancelled = false;
    const reportId = toText(selectedReportId);
    if (!active || !isReportsDrawerOpen || !reportApiAvailable) return () => {
      cancelled = true;
    };
    if (!reportId) {
      setReportDetailsLoadingId("");
      setReportDetailsError("");
      setReportDetailsErrorMeta(null);
      return () => {
        cancelled = true;
      };
    }
    const cached = asObject(reportDetailsById[reportId]);
    const summaryStatus = toText(selectedReportSummary?.status).toLowerCase();
    const cachedStatus = toText(cached?.status).toLowerCase();
    const cachedMarkdown = toText(cached?.report_markdown || cached?.raw_text);
    const shouldRefetchStaleDetail = !!toText(cached?.id) && (
      (summaryStatus === "ok" && !cachedMarkdown)
      || (summaryStatus && cachedStatus && summaryStatus !== cachedStatus)
    );
    if (toText(cached?.id) && !shouldRefetchStaleDetail) return () => {
      cancelled = true;
    };

    async function run() {
      const requestScope = reportRequestScope;
      const requestId = Number(reportDetailsReqIdRef.current || 0) + 1;
      reportDetailsReqIdRef.current = requestId;
      try {
        reportDetailsAbortRef.current?.abort();
      } catch {
        // ignore abort errors
      }
      const controller = new AbortController();
      reportDetailsAbortRef.current = controller;
      setReportDetailsLoadingId(reportId);
      setReportDetailsError("");
      setReportDetailsErrorMeta(null);
      try {
        const response = await apiGetReportVersion(reportId, {
          signal: controller.signal,
          sessionId,
          pathId: activePathId,
        });
        if (cancelled) return;
        if (controller.signal.aborted || requestId !== reportDetailsReqIdRef.current || requestScope !== reportScopeRef.current) return;
        if (response?.aborted) return;
        if (!response?.ok) {
          const status = Number(response?.status || 0);
          if (status === 404 || status === 401 || status === 403) {
            const fallbackReportId = toText(
              toArray(reportVersionsView).find((row) => {
                const id = toText(asObject(row)?.id);
                return id && id !== reportId;
              })?.id,
            );
            markReportAsInterrupted(reportId, response, {
              endpoint: toText(response?.endpoint || `/api/reports/${encodeURIComponent(reportId)}`),
              fallbackReportId,
            });
            return;
          }
          setReportDetailsError(buildApiErrorTitle(response, "Не удалось загрузить отчёт."));
          setReportDetailsErrorMeta(buildApiErrorMeta(response, {
            method: "GET",
            endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
          }));
          return;
        }
        const report = asObject(response?.report);
        setReportDetailsById((prev) => ({ ...prev, [reportId]: report }));
        appendReportStatusTrace(reportId, report?.status, report);
      } catch (error) {
        if (isAbortLikeError(error)) return;
        if (!cancelled) {
          setReportDetailsError(buildApiErrorTitle(error, "Не удалось загрузить отчёт."));
          setReportDetailsErrorMeta(buildApiErrorMeta(error, {
            method: "GET",
            endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
          }));
          appendReportTrace({
            phase: "details_error",
            title: "Ошибка загрузки деталей отчёта",
            detail: buildApiErrorTitle(error, "Не удалось загрузить отчёт."),
            method: "GET",
            endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
          });
        }
      } finally {
        if (!cancelled && requestId === reportDetailsReqIdRef.current) setReportDetailsLoadingId("");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    active,
    isReportsDrawerOpen,
    sessionId,
    activePathId,
    selectedReportId,
    selectedReportSummary?.status,
    reportDetailsById,
    reportVersionsView,
    reportApiAvailable,
    reportRequestScope,
    appendReportStatusTrace,
    appendReportTrace,
    markReportAsInterrupted,
  ]);

  const hasRunningReports = useMemo(() => {
    if (toArray(pendingGenerationVersions).length > 0) return true;
    if (toText(selectedReportView?.status) === "running") return true;
    return toArray(reportVersionsView).some((row) => toText(row?.status) === "running");
  }, [pendingGenerationVersions, selectedReportView?.status, reportVersionsView]);
  const hasRecentSaveStatusTrace = useMemo(() => {
    const items = toArray(reportGenerationTrace);
    if (!items.length) return false;
    const last = asObject(items[items.length - 1]);
    if (toText(last?.phase).toLowerCase() !== "save_status") return false;
    const ts = Date.parse(toText(last?.at_iso));
    if (!Number.isFinite(ts) || ts <= 0) return true;
    return (Date.now() - ts) <= 15000;
  }, [reportGenerationTrace]);
  const showReportGenerationTrace = useMemo(() => {
    if (!toArray(reportGenerationTrace).length) return false;
    if (reportLoading) return true;
    if (hasRunningReports) return true;
    if (toText(reportError) || toText(reportDetailsError)) return true;
    if (hasRecentSaveStatusTrace) return true;
    return toText(selectedReportView?.status).toLowerCase() !== "ok";
  }, [reportGenerationTrace, reportLoading, hasRunningReports, reportError, reportDetailsError, selectedReportView?.status, hasRecentSaveStatusTrace]);

  useEffect(() => {
    const reportId = toText(selectedReportView?.id || selectedReportId);
    const status = toText(selectedReportView?.status).toLowerCase();
    if (!reportId || (status !== "ok" && status !== "error")) return;
    const listed = toArray(reportVersionsView).find((row) => toText(row?.id) === reportId);
    if (!listed) return;
    if (toText(listed?.status).toLowerCase() !== status) return;
    const detail = asObject(reportDetailsById[reportId]);
    const snapshot = {
      ...asObject(listed),
      ...detail,
      id: reportId,
      status,
      version: Number(selectedReportView?.version || listed?.version || detail?.version || 0),
      error_message: toText(detail?.error_message || selectedReportView?.error_message || listed?.error),
    };
    appendReportPersistTrace(snapshot);
  }, [
    selectedReportView?.id,
    selectedReportView?.status,
    selectedReportView?.version,
    selectedReportView?.error_message,
    selectedReportId,
    reportVersionsView,
    reportDetailsById,
    appendReportPersistTrace,
  ]);

  useEffect(() => {
    if (!active || !isReportsDrawerOpen || !reportApiAvailable || !hasRunningReports || !toText(sessionId) || !toText(activePathId)) return undefined;
    let cancelled = false;
    let tickInFlight = false;
    let timerId = 0;
    let attempts = 0;
    const startedAt = Date.now();

    function stopPolling(reasonRaw) {
      const reason = toText(reasonRaw || "unknown");
      if (cancelled) return;
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
        timerId = 0;
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(`[REPORT_POLL] stop reason=${reason}`);
      }
    }

    function scheduleNext() {
      if (cancelled) return;
      if (attempts >= REPORT_POLL_MAX_ATTEMPTS || (Date.now() - startedAt) > REPORT_POLL_MAX_MS) {
        setReportDetailsError("Не удалось загрузить данные отчёта");
        setReportDetailsErrorMeta({
          status: 0,
          method: "GET",
          endpoint: `/api/reports/${encodeURIComponent(toText(selectedReportId) || ":reportId")}`,
          detail: "Polling timeout",
        });
        stopPolling("timeout");
        return;
      }
      const delayMs = reportPollDelayMs(attempts + 1);
      timerId = window.setTimeout(tick, delayMs);
    }

    async function tick() {
      if (cancelled || tickInFlight) return;
      tickInFlight = true;
      attempts += 1;
      const requestScope = reportRequestScope;
      try {
        const listResponse = await reloadReportVersions(toText(selectedReportId), { requestScope });
        if (cancelled || requestScope !== reportScopeRef.current) return;

        const listStatus = Number(listResponse?.status || 0);
        if (listResponse && listResponse.ok === false) {
          if (listStatus === 401 || listStatus === 403 || listStatus === 404) {
            stopPolling(String(listStatus));
            return;
          }
          if (listStatus >= 500) {
            scheduleNext();
            return;
          }
          stopPolling(`list_error_${listStatus || "unknown"}`);
          return;
        }

        const reportId = toText(selectedReportId);
        if (!reportId) {
          scheduleNext();
          return;
        }

        const response = await apiGetReportVersion(reportId, {
          sessionId,
          pathId: activePathId,
        });
        if (cancelled || requestScope !== reportScopeRef.current || response?.aborted) return;
        if (!response?.ok) {
          const status = Number(response?.status || 0);
          if (status === 404 || status === 401 || status === 403) {
            const fallbackReportId = toText(
              toArray(reportVersionsView).find((row) => {
                const id = toText(asObject(row)?.id);
                return id && id !== reportId;
              })?.id,
            );
            markReportAsInterrupted(reportId, response, {
              endpoint: toText(response?.endpoint || `/api/reports/${encodeURIComponent(reportId)}`),
              fallbackReportId,
            });
            stopPolling(String(status));
            return;
          }
          if (status >= 500) {
            scheduleNext();
            return;
          }
          stopPolling(`detail_error_${status || "unknown"}`);
          return;
        }
        const report = asObject(response?.report);
        setReportDetailsById((prev) => ({ ...prev, [reportId]: report }));
        appendReportStatusTrace(reportId, report?.status, report);
        const reportStatus = toText(report?.status).toLowerCase();
        if (reportStatus === "ok" || reportStatus === "error") {
          stopPolling(reportStatus === "ok" ? "ok_done" : "error_done");
          return;
        }
        scheduleNext();
      } catch (error) {
        const status = Number(error?.status || 0);
        if (status >= 500 || status === 0) {
          scheduleNext();
        } else {
          stopPolling(`exception_${status || "unknown"}`);
        }
      } finally {
        tickInFlight = false;
      }
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(
        `[REPORT_POLL] start sid=${toText(sessionId)} path=${toText(activePathId)} interval=${reportPollDelayMs(1)}..5000`,
      );
    }
    tick();
    return () => {
      stopPolling("cleanup");
    };
  }, [active, isReportsDrawerOpen, hasRunningReports, sessionId, activePathId, selectedReportId, reportApiAvailable, reportRequestScope, appendReportStatusTrace, markReportAsInterrupted, reportVersionsView]);

  useEffect(() => {
    const selectedStatus = toText(selectedReportView?.status).toLowerCase();
    const hasMarkdown = !!toText(selectedReportView?.report_markdown);
    if (!toArray(reportGenerationTrace).length) return;
    if (selectedStatus === "ok" && hasMarkdown && !reportLoading && !hasRunningReports) {
      if (reportTraceHideTimerRef.current) {
        window.clearTimeout(reportTraceHideTimerRef.current);
      }
      reportTraceHideTimerRef.current = window.setTimeout(() => {
        setReportGenerationTrace([]);
        reportTraceSeqRef.current = 0;
        reportTraceStatusByReportRef.current = {};
        reportTracePersistByReportRef.current = {};
        reportTraceHideTimerRef.current = 0;
      }, 7000);
      return () => {
        if (reportTraceHideTimerRef.current) {
          window.clearTimeout(reportTraceHideTimerRef.current);
          reportTraceHideTimerRef.current = 0;
        }
      };
    }
    return undefined;
  }, [selectedReportView?.status, selectedReportView?.report_markdown, reportGenerationTrace, reportLoading, hasRunningReports]);

  async function handleGenerateReport() {
    if (reportLoading) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[REPORT_GEN] request_skip reason=in_flight");
      }
      return;
    }
    if (!reportApiAvailable) {
      setReportError("Отчёты недоступны в локальной сессии. Сохраните/откройте серверную сессию.");
      setReportErrorMeta(null);
      setReportGenerationTrace([]);
      reportTraceSeqRef.current = 0;
      reportTraceStatusByReportRef.current = {};
      return;
    }
    if (!canGenerateReport) return;
    if (!toText(activePathId)) {
      setReportError("Не выбран активный сценарий для генерации отчёта.");
      return;
    }
    setReportError("");
    setReportErrorMeta(null);
    setReportGenerationTrace([]);
    reportTraceSeqRef.current = 0;
    reportTraceStatusByReportRef.current = {};
    reportTracePersistByReportRef.current = {};
    if (reportTraceHideTimerRef.current) {
      window.clearTimeout(reportTraceHideTimerRef.current);
      reportTraceHideTimerRef.current = 0;
    }
    appendReportTrace({
      phase: "start",
      title: "Старт генерации отчёта",
      method: "POST",
      endpoint: reportsEndpoint,
    });
    const expectedVersion = Math.max(
      0,
      ...toArray(reportVersions).map((row) => Number(row?.version || 0)).filter((x) => Number.isFinite(x)),
      ...toArray(pendingGenerationVersions).map((row) => Number(row?.version || 0)).filter((x) => Number.isFinite(x)),
    ) + 1;
    const requestId = `gen_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    setPendingGenerationVersions((prev) => [...toArray(prev), { id: requestId, version: expectedVersion }]);
    setReportLoadingCount((prev) => prev + 1);
    try {
      appendReportTrace({ phase: "request_build", title: "Сбор payload для генерации" });
      const request = await buildRequestForActivePath();
      setCurrentStepsHash(toText(request?.steps_hash));
      const reportBuildDebug = asObject(request?.reportBuildDebug);
      const stopReason = toText(reportBuildDebug?.stop_reason || "UNKNOWN");
      const lastStep = asObject(reportBuildDebug?.last_step);
      const lastNo = Number(lastStep?.order_index || 0);
      const lastTitle = toText(lastStep?.title || "—");
      const lastBpmn = toText(lastStep?.bpmn_ref || reportBuildDebug?.stop_at_bpmn_id || "—");
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(
          `[REPORT_GEN] request_build scenario=${toText(reportBuildDebug?.selectedScenarioLabel || reportScenarioLabel)} `
          + `path=${toText(reportBuildDebug?.path_id_used || activePathId)} steps=${Number(reportBuildDebug?.steps_count || 0)} `
          + `hash=${toText(request?.steps_hash) || "—"} reason=${stopReason} last=#${lastNo || "?"} ${lastTitle} bpmn=${lastBpmn}`,
        );
      }
      setLatestReportBuildDebugByPath((prev) => ({
        ...asObject(prev),
        [toText(activePathId)]: reportBuildDebug,
      }));
      onReportBuildDebug?.(reportBuildDebug);
      appendReportTrace({
        phase: "request_ready",
        title: "Payload подготовлен",
        detail: `steps_hash=${toText(request?.steps_hash) || "—"}`,
      });
      appendReportTrace({
        phase: "request_send",
        title: "Отправка запроса генерации",
        method: "POST",
        endpoint: reportsEndpoint,
      });
      const response = await apiCreatePathReportVersion(sessionId, activePathId, {
        steps_hash: request?.steps_hash,
        request_payload_json: import.meta.env.DEV
          ? {
            ...asObject(request?.payload),
            report_build_debug: asObject(request?.reportBuildDebug),
          }
          : (request?.payload || {}),
        prompt_template_version: "v2",
        ...(import.meta.env.DEV ? { report_build_debug: asObject(request?.reportBuildDebug) } : {}),
      });
      if (!response?.ok) {
        const title = buildApiErrorTitle(response, "Не удалось сгенерировать отчёт.");
        const meta = buildApiErrorMeta(response, { method: "POST", endpoint: reportsEndpoint });
        setReportError(title);
        setReportErrorMeta(meta);
        appendReportTrace({
          phase: "request_error",
          title,
          detail: toText(meta?.detail),
          method: toText(meta?.method || "POST"),
          endpoint: toText(meta?.endpoint || reportsEndpoint),
          status: Number(meta?.status || 0),
        });
        return;
      }
      const reportEntry = asObject(response?.report);
      const reportId = toText(reportEntry?.id);
      appendReportTrace({
        phase: "request_ok",
        title: `Версия принята сервером: v${Number(reportEntry?.version || expectedVersion)}`,
        report_id: reportId,
        report_status: toText(reportEntry?.status || "running"),
        status: Number(response?.status || 0),
      });
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(
          `[REPORT_GEN] post_ok version_id=${reportId || "—"} status=${toText(reportEntry?.status || "running")} `
          + `steps_hash=${toText(request?.steps_hash) || "—"}`,
        );
      }
      appendReportStatusTrace(reportId, reportEntry?.status, reportEntry);
      if (reportId) {
        setReportDetailsById((prev) => ({ ...prev, [reportId]: reportEntry }));
        setSelectedReportId(reportId);
      }
      if (toText(response?.result?.deepseek_error)) {
        setReportError(`DeepSeek: ${toText(response?.result?.deepseek_error)}`);
        appendReportTrace({
          phase: "provider_error",
          title: "Ошибка провайдера DeepSeek",
          detail: toText(response?.result?.deepseek_error),
        });
      }
      await reloadReportVersions(reportId, { force: true });
      appendReportTrace({ phase: "versions_reload", title: "Список версий обновлён" });
    } catch (error) {
      const title = buildApiErrorTitle(error, "Не удалось сгенерировать отчёт.");
      const meta = buildApiErrorMeta(error, { method: "POST", endpoint: reportsEndpoint });
      setReportError(title);
      setReportErrorMeta(meta);
      appendReportTrace({
        phase: "request_error",
        title,
        detail: toText(meta?.detail),
        method: toText(meta?.method || "POST"),
        endpoint: toText(meta?.endpoint || reportsEndpoint),
        status: Number(meta?.status || 0),
      });
    } finally {
      setPendingGenerationVersions((prev) => toArray(prev).filter((item) => toText(item?.id) !== requestId));
      setReportLoadingCount((prev) => Math.max(0, Number(prev || 0) - 1));
    }
  }

  async function handleCopyMarkdown(reportIdRaw) {
    const reportId = toText(reportIdRaw);
    if (!reportId) return;
    const detail = asObject(reportDetailsById[reportId]);
    const markdown = normalizeReportMarkdown(
      detail?.report_markdown,
      detail?.raw_text,
      detail?.payload_normalized || detail?.report_json || {},
    );
    if (!markdown) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      }
    } catch {
      setReportDetailsError("Не удалось скопировать markdown.");
    }
  }

  async function handleDeleteReportVersion(reportRaw) {
    if (!canDeleteReports) {
      setReportDetailsError("Недостаточно прав для удаления версии отчёта.");
      setReportDetailsErrorMeta({ status: 403, detail: "insufficient_permissions" });
      return;
    }
    const report = asObject(reportRaw);
    const reportId = toText(report?.id);
    if (!reportId || reportDeleteInFlightId) return;
    if (!reportApiAvailable) {
      setReportError("Удаление недоступно в локальной сессии. Откройте серверную сессию.");
      setReportErrorMeta(null);
      return;
    }
    const fallbackReportId = toText(
      [...toArray(reportVersions)]
        .filter((item) => toText(item?.id) && toText(item?.id) !== reportId)
        .sort((a, b) => Number(b?.version || 0) - Number(a?.version || 0))[0]?.id,
    );

    setReportDeleteInFlightId(reportId);
    setReportError("");
    setReportErrorMeta(null);
    setReportDetailsError("");
    setReportDetailsErrorMeta(null);
    appendReportTrace({
      phase: "delete_request",
      title: `Удаление версии v${Number(report?.version || 0)}`,
      report_id: reportId,
      method: "DELETE",
      endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
    });
    try {
      const response = await apiDeleteReportVersion(reportId, { sessionId, pathId: activePathId });
      if (!response?.ok) {
        const title = buildApiErrorTitle(response, "Не удалось удалить версию отчёта.");
        const meta = buildApiErrorMeta(response, {
          method: "DELETE",
          endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
        });
        setReportDetailsError(title);
        setReportDetailsErrorMeta(meta);
        appendReportTrace({
          phase: "delete_error",
          title,
          report_id: reportId,
          status: Number(meta?.status || 0),
          detail: toText(meta?.detail),
        });
        return;
      }

      setReportVersions((prev) => toArray(prev).filter((item) => toText(item?.id) !== reportId));
      setReportDetailsById((prev) => {
        const next = { ...asObject(prev) };
        delete next[reportId];
        return next;
      });
      setReportTerminalOverrides((prev) => {
        const next = { ...asObject(prev) };
        delete next[reportId];
        return next;
      });
      setSelectedReportId((prev) => {
        if (toText(prev) !== reportId) return prev;
        return fallbackReportId || "";
      });

      appendReportTrace({
        phase: "delete_ok",
        title: `Версия удалена: v${Number(report?.version || 0)}`,
        report_id: reportId,
        status: Number(response?.status || 204),
      });

      await reloadReportVersions(fallbackReportId, { force: true });
    } catch (error) {
      const title = buildApiErrorTitle(error, "Не удалось удалить версию отчёта.");
      const meta = buildApiErrorMeta(error, {
        method: "DELETE",
        endpoint: `/api/reports/${encodeURIComponent(reportId)}`,
      });
      setReportDetailsError(title);
      setReportDetailsErrorMeta(meta);
      appendReportTrace({
        phase: "delete_error",
        title,
        report_id: reportId,
        status: Number(meta?.status || 0),
        detail: toText(meta?.detail),
      });
    } finally {
      setReportDeleteInFlightId("");
    }
  }

  async function handleCopyErrorDetails(metaRaw) {
    const text = formatErrorClipboard(metaRaw);
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
    }
  }

  function handleRecommendationClick(recommendation) {
    const orderIndex = Number(recommendation?.order_index || recommendation?._orderIndex || 0);
    if (!Number.isFinite(orderIndex) || orderIndex <= 0) return;
    const matchedRow = routeStepRows.find((row) => Number(row?.order_index || 0) === Math.floor(orderIndex));
    let stepId = "";
    if (matchedRow) {
      const nodeId = toText(matchedRow?.node_id);
      stepId = toText(firstStepIdByNodeId[nodeId]);
    }
    if (!stepId) {
      stepId = resolveStepIdForRecommendation(
        { ...asObject(recommendation), order_index: orderIndex },
        vm?.steps,
      );
    }
    if (matchedRow) {
      const key = `route_${Number(matchedRow?.order_index || 0)}_${toText(matchedRow?.node_id || matchedRow?.id || matchedRow?.key)}`;
      setSelectedRouteKey(key);
      setDetailsCollapsed(false);
    }
    if (recommendationHighlightTimerRef.current) {
      window.clearTimeout(recommendationHighlightTimerRef.current);
      recommendationHighlightTimerRef.current = 0;
    }
    setActiveRecommendationOrderIndex(Number.isFinite(orderIndex) ? orderIndex : 0);
    if (typeof document !== "undefined") {
      const routeStack = document.querySelector('[data-testid="interview-paths-route-stack"]');
      if (routeStack && typeof routeStack.scrollTo === "function") {
        const targetTop = Math.max(0, (Math.floor(orderIndex) - 1) * 76 - 120);
        routeStack.scrollTo({ top: targetTop, behavior: "smooth" });
      }
      const el = document.querySelector(`[data-testid="interview-paths-node-${Math.floor(orderIndex)}"]`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    recommendationHighlightTimerRef.current = window.setTimeout(() => {
      setActiveRecommendationOrderIndex(0);
      recommendationHighlightTimerRef.current = 0;
    }, STEP_HIGHLIGHT_MS);
    if (stepId) onSelectStep?.(stepId, true);
  }

  function pickRow(row) {
    const key = `route_${Number(row?.order_index || 0)}_${toText(row?.node_id || row?.id || row?.key)}`;
    setSelectedRouteKey(key);
    setDetailsCollapsed(false);
    const nodeId = toText(row?.node_id);
    if (!nodeId) return;
    const stepId = toText(firstStepIdByNodeId[nodeId]);
    if (stepId) onSelectStep?.(stepId, true);
  }

  function jumpToMode(nextMode) {
    const row = activeRouteRow;
    if (row) {
      const nodeId = toText(row?.node_id);
      const stepId = toText(firstStepIdByNodeId[nodeId]);
      if (stepId) onSelectStep?.(stepId, true);
    }
    onSetTimelineViewMode?.(nextMode);
  }

  function renderRouteStepRow(row, idx) {
    const orderIndex = Number(row?.order_index || idx + 1);
    const key = `route_${orderIndex}_${toText(row?.node_id || row?.id || row?.key || idx)}`;
    const nodeId = toText(row?.node_id);
    const linkedStepId = toText(firstStepIdByNodeId[nodeId]);
    const linkedStep = asObject(stepById[linkedStepId]);
    const workSec = Math.max(0, Number(linkedStep?.work_duration_sec || linkedStep?.duration_sec || 0));
    const waitSec = Math.max(0, Number(linkedStep?.wait_duration_sec || 0));
    const selected = selectedRouteKey === key;
    const rowType = toText(row?.row_type).toLowerCase();
    const isDecisionDiff = rowType === "decision" && diffDecisionGatewayIds.has(nodeId);
    const recommendationActive = orderIndex === Number(activeRecommendationOrderIndex || 0);
    const rowTitle = sanitizeDisplayText(row?.title, "—");
    const prevTitle = sanitizeDisplayText(routeStepRows[idx - 1]?.title, "—");
    const nextTitle = sanitizeDisplayText(routeStepRows[idx + 1]?.title, "—");
    const laneName = toText(row?.lane_name || "—");
    return (
      <div
        key={key}
        className={[
          "interviewRouteNode",
          "interviewRouteNodeTable",
          selected ? "isSelected" : "",
          recommendationActive ? "isRecommendationActive" : "",
          rowType === "decision" ? "isDecision" : "",
          isDecisionDiff ? "isDecisionDiff" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => pickRow(row)}
        role="button"
        tabIndex={0}
        data-testid={`interview-paths-node-${orderIndex}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") pickRow(row);
        }}
      >
        <div className="interviewRouteColStep">
          <div className="interviewRouteNodeHead">
            <span className="interviewRouteNodeNo">#{orderIndex}</span>
            <span className="interviewRouteNodeTitle" title={rowTitle}>{rowTitle}</span>
            {rowType === "decision" ? <span className="badge warn">Decision</span> : null}
            {isDecisionDiff ? <span className="badge warn">Δ</span> : null}
          </div>
          <div className="interviewRouteNodeMeta">
            <span className="muted small interviewRouteNodeSubtitle" title={`${prevTitle} → ${nextTitle}`}>
              {prevTitle} → {nextTitle}
            </span>
          </div>
        </div>

        <div className="interviewRouteColLane" title={laneName}>
          {laneName && laneName !== "—" ? (
            <span className="interviewRouteLaneChip">
              <span className="interviewRouteLaneDot" />
              <span>{laneName}</span>
            </span>
          ) : (
            <span className="muted small">—</span>
          )}
        </div>

        {linkedStepId ? (
          <StepDurationEditor
            stepId={linkedStepId}
            workSec={workSec}
            waitSec={waitSec}
            onCommitSeconds={commitDurationSeconds}
            variant="row"
          />
        ) : (
          <>
            <div className="interviewRouteTimeCell muted small">—</div>
            <div className="interviewRouteTimeCell muted small">—</div>
            <div className="interviewRoutePresetCell muted small">—</div>
          </>
        )}
      </div>
    );
  }

  const activeLinkGroup = useMemo(() => {
    const row = activeRouteRow;
    const nodeId = toText(row?.node_id);
    return linkGroupForNode(dodSnapshot?.link_groups, nodeId);
  }, [activeRouteRow, dodSnapshot]);

  const activeCounterparts = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return counterpartIdsForNode(activeLinkGroup, nodeId);
  }, [activeRouteRow, activeLinkGroup]);

  const activeNodeSeqMeta = useMemo(() => {
    if (!activeRouteRow || activeRouteIndex < 0) return {};
    return {
      prev: routeStepRows[activeRouteIndex - 1] || null,
      next: routeStepRows[activeRouteIndex + 1] || null,
    };
  }, [activeRouteRow, activeRouteIndex, routeStepRows]);

  const flowMaps = useMemo(() => buildFlowMaps(dodSnapshot), [dodSnapshot]);
  const dodMissingByNodeId = useMemo(() => buildDodByNodeId(dodSnapshot), [dodSnapshot]);

  const activeIncomingFlows = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return toArray(flowMaps?.incomingByNodeId?.[nodeId]);
  }, [activeRouteRow, flowMaps]);

  const activeOutgoingFlows = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return toArray(flowMaps?.outgoingByNodeId?.[nodeId]);
  }, [activeRouteRow, flowMaps]);

  const activeDodMissing = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    return toArray(dodMissingByNodeId?.[nodeId]);
  }, [activeRouteRow, dodMissingByNodeId]);

  const activeStepDetails = useMemo(() => {
    if (!activeRouteRow) return null;
    return {
      type: toText(activeRouteRow?.node_type || activeRouteRow?.row_type || "—"),
      lane: sanitizeDisplayText(activeRouteRow?.lane_name || stepMetaByNodeId[toText(activeRouteRow?.node_id)]?.lane_name, "—"),
      inTitle: sanitizeDisplayText(activeNodeSeqMeta?.prev?.title, "—"),
      outTitle: sanitizeDisplayText(activeNodeSeqMeta?.next?.title, "—"),
      selected: sanitizeDisplayText(activeRouteRow?.decision?.selected_label, "—"),
      aiCount: Number(stepMetaByNodeId[toText(activeRouteRow?.node_id)]?.ai_count || 0),
      notesCount: Number(stepMetaByNodeId[toText(activeRouteRow?.node_id)]?.notes_count || 0),
      dodMissing: activeDodMissing.length ? activeDodMissing.join(", ") : "—",
      inputs: activeIncomingFlows.length
        ? activeIncomingFlows.map((flow) => `${flow.id}${flow.label ? ` (${flow.label})` : ""}`).join("; ")
        : "—",
      outputs: activeOutgoingFlows.length
        ? activeOutgoingFlows.map((flow) => `${flow.id}${flow.label ? ` (${flow.label})` : ""}`).join("; ")
        : "—",
      linkGroup: toText(activeLinkGroup?.link_key || ""),
      counterparts: activeCounterparts,
    };
  }, [
    activeRouteRow,
    stepMetaByNodeId,
    activeNodeSeqMeta,
    activeDodMissing,
    activeIncomingFlows,
    activeOutgoingFlows,
    activeLinkGroup,
    activeCounterparts,
  ]);
  const activeStepTiming = useMemo(() => {
    const nodeId = toText(activeRouteRow?.node_id);
    if (!nodeId) return null;
    const linkedStepId = toText(firstStepIdByNodeId[nodeId]);
    if (!linkedStepId) return null;
    const linkedStep = asObject(stepById[linkedStepId]);
    return {
      stepId: linkedStepId,
      workSec: Math.max(0, Number(linkedStep?.work_duration_sec || linkedStep?.duration_sec || 0)),
      waitSec: Math.max(0, Number(linkedStep?.wait_duration_sec || 0)),
    };
  }, [activeRouteRow, firstStepIdByNodeId, stepById]);

  const hasSelectedMarkdown = useMemo(() => {
    const selectedId = toText(selectedReportId || visibleReportVersions?.[0]?.id);
    if (!selectedId) return false;
    const detail = asObject(reportDetailsById[selectedId]);
    return !!normalizeReportMarkdown(
      detail?.report_markdown,
      detail?.raw_text,
      detail?.payload_normalized || detail?.report_json || {},
    );
  }, [selectedReportId, visibleReportVersions, reportDetailsById]);

  async function handleCopyActiveMarkdown() {
    const selectedId = toText(selectedReportId || visibleReportVersions?.[0]?.id);
    if (!selectedId) return;
    await handleCopyMarkdown(selectedId);
  }

  async function handleCopyStepLink() {
    const nodeId = toText(activeRouteRow?.node_id);
    const orderIndex = Number(activeRouteRow?.order_index || 0);
    const link = [
      toText(sessionId || "local"),
      toText(activePathId || "path"),
      Number.isFinite(orderIndex) && orderIndex > 0 ? `#${Math.floor(orderIndex)}` : "",
      nodeId,
    ].filter(Boolean).join(":");
    if (!link) return;
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(link);
    } catch {
      // no-op
    }
  }

  function toggleScenarioGroup(groupKeyRaw) {
    const groupKey = toText(groupKeyRaw);
    if (!groupKey) return;
    setCollapsedScenarioGroups((prev) => ({ ...asObject(prev), [groupKey]: !prev?.[groupKey] }));
  }

  return (
    <div className="interviewPathsMode interviewPathsRouteMode" data-testid="interview-paths-mode">
      <div className="interviewPathsHead">
        <div className="interviewPathsTitle">Paths View</div>
        {isPendingTransition ? <span className="muted small">Обновляю…</span> : null}
      </div>

      {!pathsCalcReady ? (
        <div className="interviewAnnotationNotice pending">
          Подготавливаю расчёты paths/diff/aggregation в фоне…
        </div>
      ) : null}
      {pathsCalcReady && legacyColorSource ? (
        <div className="interviewAnnotationNotice warn">
          Legacy source: Paths построены из flow tier/цветов. Для стабильной модели выполните «Импорт из цветов» в панели выбранного BPMN-узла.
        </div>
      ) : null}

      {showDevOrderWarning ? (
        <div className="interviewAnnotationNotice warn interviewScenarioOrderWarning">
          <div className="interviewScenarioOrderWarningHead">
            <span className="interviewScenarioOrderWarningTitle">Порядок сценария: найдено нарушение order_index</span>
            <span className="badge warn">issues {Number(toArray(orderValidation?.violations).length || 0)}</span>
          </div>
          <div className="interviewScenarioOrderWarningMeta muted small">
            Проверено пар: {Number(orderValidation?.checked_pairs || 0)}
            {" · "}
            Пропущено между ветками: {Number(orderValidation?.skipped_scope_pairs || 0)}
            {orderValidation.firstNotStart ? " · первый шаг не StartEvent" : ""}
          </div>
          <details className="interviewScenarioOrderWarningDetails">
            <summary>Показать проблемные переходы</summary>
            <div className="interviewScenarioOrderWarningList">
              {toArray(orderValidation?.violations).slice(0, 10).map((issue, idx) => (
                <div key={`order_issue_${idx + 1}`} className="interviewScenarioOrderWarningItem">
                  <span className="badge muted">#{idx + 1}</span>
                  <span className="interviewScenarioOrderWarningItemText">
                    {`prev #${Number(issue?.prev_order_index || 0)} → cur #${Number(issue?.current_order_index || 0)} · `}
                    {toText(issue?.node_id || issue?.title || "step")}
                    {toText(issue?.scope) ? ` · scope: ${toText(issue?.scope)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}

      <PathsLayout
        detailsCollapsed={detailsCollapsed}
        onToggleDetails={(nextCollapsedRaw) => {
          const nextCollapsed = !!nextCollapsedRaw;
          setDetailsCollapsed(nextCollapsed);
          if (nextCollapsed) {
            setSelectedRouteKey("");
          }
        }}
        hasActiveStep={!!activeRouteRow}
        left={(
          <ScenarioNav
            selectedTier={selectedTier}
            onSelectTier={(tier) => startTransition(() => setSelectedTier(tier))}
            search={scenarioSearch}
            onSearch={setScenarioSearch}
            sortMode={scenarioSortMode}
            onSortMode={setScenarioSortMode}
            sections={visibleSections}
            collapsedGroups={collapsedScenarioGroups}
            onToggleGroup={toggleScenarioGroup}
            selectedScenarioId={selectedScenarioId}
            onSelectScenario={(scenarioId) => startTransition(() => setSelectedScenarioId(scenarioId))}
            scenarioTitle={scenarioPresentation.scenarioDisplayTitle}
            scenarioStatusClass={scenarioStatusClass}
            scenarioStatusLabel={scenarioStatusLabel}
            scenarioStatusIcon={scenarioOutcomeIcon}
            scenarioDurationLabel={(scenario) => formatSeconds(scenarioDurationSec(scenario, stepTimeByNodeId))}
            scenarioMetrics={scenarioMetricsById}
          />
        )}
        center={(
          <div className="interviewPathsMainColumn">
            <PathHeader
              scenario={activeScenario}
              scenarioTitle={scenarioPresentation.scenarioDisplayTitle}
              scenarioStatusClass={scenarioStatusClass}
              scenarioStatusLabel={scenarioStatusLabel}
              tier={normalizeTier(activeScenario?.tier) !== "None" ? normalizeTier(activeScenario?.tier) : ""}
              sequenceKey={toText(activeScenario?.sequence_key || activeScenario?.sequenceKey)}
              pathIdUsed={toText(activePathId)}
              reportBuildDebug={activeReportBuildDebug}
              stepsHash={currentStepsHash}
              metrics={activePathMetrics}
              canGenerateReport={canGenerateReport}
              reportApiAvailable={reportApiAvailable}
              reportLoading={reportLoading}
              onGenerateReport={handleGenerateReport}
              onOpenReports={() => setIsReportsDrawerOpen(true)}
              onCopyMarkdown={handleCopyActiveMarkdown}
              hasMarkdown={hasSelectedMarkdown}
            />

            <ReportApiErrorNotice
              title={reportError}
              meta={reportErrorMeta}
              tone="err"
              onCopyDetails={handleCopyErrorDetails}
            />
            <ReportApiErrorNotice
              title={reportDetailsError}
              meta={reportDetailsErrorMeta}
              tone="err"
              onCopyDetails={handleCopyErrorDetails}
            />
            {!reportApiAvailable ? (
              <div className="interviewAnnotationNotice warn">
                Отчёты версии DeepSeek доступны только для серверной сессии (не local).
              </div>
            ) : null}
            {toArray(pendingGenerationVersions).length ? (
              <div className="interviewAnnotationNotice pending">
                Уже идёт генерация: {toArray(pendingGenerationVersions).map((row) => `v${Number(row?.version || 0)}`).join(", ")}
              </div>
            ) : null}
            {activeScenario?.diff_from_ideal ? (
              <div className="interviewScenarioDiff muted small">
                Отличия от Ideal:
                {" "}
                {Number(toArray(activeScenario?.diff_from_ideal?.differing_gateway_decisions).length || 0)} решений,
                {" +"}
                {Number(toArray(activeScenario?.diff_from_ideal?.additional_steps).length || 0)} шагов,
                {" +"}
                {formatSeconds(activeScenario?.diff_from_ideal?.additional_time_sec)}
              </div>
            ) : null}

            <PathStepList
              title="Маршрут выбранного сценария"
              rows={routeStepRows}
              renderRow={renderRouteStepRow}
            />
          </div>
        )}
        right={(
          <StepDetailsPanel
            active={activeRouteRow ? { title: sanitizeDisplayText(activeRouteRow?.title, "—") } : null}
            details={activeStepDetails}
            timeEditor={activeStepTiming ? (
              <StepDurationEditor
                stepId={activeStepTiming.stepId}
                workSec={activeStepTiming.workSec}
                waitSec={activeStepTiming.waitSec}
                onCommitSeconds={commitDurationSeconds}
                variant="detailed"
              />
            ) : null}
            onJumpDiagram={() => jumpToMode("diagram")}
            onJumpMatrix={() => jumpToMode("matrix")}
            onCopyStepLink={handleCopyStepLink}
          />
        )}
      />

      <ReportsDrawer
        open={isReportsDrawerOpen}
        onClose={() => setIsReportsDrawerOpen(false)}
        reportVersionsLoading={reportVersionsLoading}
        reportLoading={reportLoading}
        reportFilterActualOnly={reportFilterActualOnly}
        onToggleActualOnly={setReportFilterActualOnly}
        reportFilterErrorsOnly={reportFilterErrorsOnly}
        onToggleErrorsOnly={setReportFilterErrorsOnly}
        visibleReportVersions={visibleReportVersions}
        selectedReportId={selectedReportId}
        onSelectReport={setSelectedReportId}
        onRetryGenerate={handleGenerateReport}
        canGenerateReport={canGenerateReport}
        onCopyMarkdown={handleCopyMarkdown}
        onDeleteReport={handleDeleteReportVersion}
        canDeleteReport={canDeleteReports}
        deletingReportId={reportDeleteInFlightId}
        selectedReportView={selectedReportView}
        reportDetailsById={reportDetailsById}
        reportDetailsLoadingId={reportDetailsLoadingId}
        latestActualReportId={latestActualReportId}
        onRecommendationClick={handleRecommendationClick}
        activeRecommendationOrderIndex={activeRecommendationOrderIndex}
        reportGenerationTrace={reportGenerationTrace}
        showReportGenerationTrace={showReportGenerationTrace}
        reportErrorNotice={(
          <ReportApiErrorNotice
            title={reportError}
            meta={reportErrorMeta}
            tone="err"
            onCopyDetails={handleCopyErrorDetails}
          />
        )}
        reportDetailsErrorNotice={(
          <ReportApiErrorNotice
            title={reportDetailsError}
            meta={reportDetailsErrorMeta}
            tone="err"
            onCopyDetails={handleCopyErrorDetails}
          />
        )}
      />
    </div>
  );
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
