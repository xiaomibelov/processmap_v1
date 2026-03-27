import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { isLocalSessionId, sanitizeDisplayText, toArray, toText } from "./utils";
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
} from "./services/pathReport.js";
import { markInterviewPerf, measureInterviewSpan, scheduleInterviewIdle } from "./perf";
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

function getInitialTierFilter(tierFilters) {
  const selected = toArray(tierFilters)
    .map((tier) => normalizeTier(tier === "NONE" ? "None" : tier))
    .filter((tier) => tier === "P0" || tier === "P1" || tier === "P2");
  return selected.length === 1 ? selected[0] : "ALL";
}

function normalizePathSource(pathSourceRaw) {
  const source = toText(pathSourceRaw).toLowerCase();
  if (source === "node_path_meta" || source === "flow_tier") return source;
  return "unknown";
}

function pathSourcePillLabel(pathSourceRaw) {
  const source = normalizePathSource(pathSourceRaw);
  if (source === "node_path_meta") return "стабильная модель · node_path_meta";
  if (source === "flow_tier") return "устаревший источник · flow_tier";
  return `источник · ${source}`;
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
    const jumpNode = asObject(nodesById[jumpNodeId]);
    next.push({
      ...buildReportNodeStub(graph, jumpNodeId),
      order_index: next.length + 1,
      row_type: toText(jumpNode?.kind || jumpNode?.type || "task"),
      node_type: toText(jumpNode?.kind || jumpNode?.type || "task"),
      title: toText(jumpNode?.name || jumpNodeId) || jumpNodeId,
      lane_name: "",
      lane_id: toText(jumpNode?.laneId || ""),
      decision: {},
      report_hint: "link_jump",
    });
    stitched = true;
    seenNodeIds.add(jumpNodeId);
    tailNodeId = jumpNodeId;
    appendBudget -= 1;
  }
  if (!stitched) return { sequence: base, stitched: false };

  const withReachability = [];
  const emitted = new Set();
  next.forEach((stepRaw, idx) => {
    const step = asObject(stepRaw);
    const nodeId = toText(step?.node_id || step?.bpmn_ref);
    if (!nodeId) return;
    const key = `${idx}:${nodeId}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const outgoing = toArray(outgoingByNode[nodeId]).sort((a, b) => flowPriorityForReport(a) - flowPriorityForReport(b));
    const selectedFlowId = toText(step?.decision?.selected_flow_id);
    let effectiveSelected = selectedFlowId;
    if (!effectiveSelected && outgoing.length === 1) effectiveSelected = toText(outgoing[0]?.id);
    withReachability.push({
      ...step,
      order_index: idx + 1,
      decision: {
        ...asObject(step?.decision),
        selected_flow_id: effectiveSelected || "",
      },
    });
  });
  return { sequence: withReachability, stitched: true };
}

function scenarioBucket(scenarioRaw) {
  const scenario = asObject(scenarioRaw);
  const rankClass = toText(scenario?.rank_class).toLowerCase();
  if (rankClass === "ideal") return "P0_IDEAL";
  if (rankClass === "alt_happy") return "P0_ALT";
  if (rankClass === "mitigated") return "P1_MITIGATED";
  return "P2_FAIL";
}

function buildScenarioPresentation(scenariosRaw) {
  const list = sortScenarios(scenariosRaw);
  const labels = {};
  const counters = {
    p0Ideal: 0,
    p0Alt: 0,
    p1Mitigated: 0,
    p2Fail: 0,
  };
  list.forEach((scenarioRaw) => {
    const scenario = asObject(scenarioRaw);
    const id = toText(scenario?.id);
    if (!id) return;
    const rankClass = toText(scenario?.rank_class).toLowerCase();
    let bucket = "Сценарий";
    let index = 1;
    if (rankClass === "ideal") {
      counters.p0Ideal += 1;
      bucket = "P0";
      index = counters.p0Ideal;
      labels[id] = `P0 · идеальный маршрут`;
      return;
    }
    if (rankClass === "alt_happy") {
      counters.p0Alt += 1;
      bucket = "P0-alt";
      index = counters.p0Alt;
      labels[id] = `${bucket} · вариант #${index}`;
      return;
    }
    if (rankClass === "mitigated") {
      counters.p1Mitigated += 1;
      bucket = "P1";
      index = counters.p1Mitigated;
      labels[id] = `${bucket} · сценарий #${index}`;
      return;
    }
    counters.p2Fail += 1;
    bucket = "P2";
    index = counters.p2Fail;
    labels[id] = `${bucket} · сценарий #${index}`;
  });
  return {
    all: list,
    labels,
    scenarioDisplayTitle(scenarioRaw) {
      const scenario = asObject(scenarioRaw);
      const id = toText(scenario?.id);
      if (!id) return "Сценарий";
      return toText(labels[id]) || toText(scenario?.label) || id;
    },
  };
}

function filterScenariosByTierView(scenariosRaw, selectedTier) {
  const tier = normalizeTier(selectedTier);
  const list = toArray(scenariosRaw);
  if (tier === "ALL" || tier === "None") return list;
  return list.filter((scenario) => normalizeTier(scenario?.tier) === tier);
}

function makeStepIdMaps(vmStepsRaw) {
  const stepById = {};
  const firstStepIdByNodeId = {};
  toArray(vmStepsRaw).forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const sid = toText(step?.id);
    const nodeId = toText(step?.node_id);
    if (sid) stepById[sid] = step;
    if (nodeId && sid && !firstStepIdByNodeId[nodeId]) firstStepIdByNodeId[nodeId] = sid;
  });
  return { stepById, firstStepIdByNodeId };
}

function makeSelectedNodeIdSet(selectedStepIds, stepById) {
  const set = new Set();
  toArray(selectedStepIds).forEach((sidRaw) => {
    const sid = toText(sidRaw);
    const step = asObject(stepById[sid]);
    const nodeId = toText(step?.node_id);
    if (nodeId) set.add(nodeId);
  });
  return set;
}

function buildDecisionHintsByOrderIndexFromScenarioRows(rowsRaw) {
  const byOrderIndex = {};
  toArray(rowsRaw).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const rowType = toText(row?.row_type).toLowerCase();
    if (rowType !== "decision") return;
    const orderIndex = Number(row?.order_index || 0);
    if (!Number.isFinite(orderIndex) || orderIndex <= 0) return;
    const selectedFlowId = toText(row?.decision?.selected_flow_id || row?.selected_flow_id);
    if (!selectedFlowId) return;
    byOrderIndex[String(orderIndex)] = {
      selected_flow_id: selectedFlowId,
      selected_flow_label: toText(row?.decision?.selected_flow_label || row?.selected_flow_label),
      selected_label: toText(row?.decision?.selected_label || row?.selected_label),
      path_key: toText(row?.decision?.path_key || row?.path_key),
      scope: toText(row?.decision?.scope || row?.scope),
      source: "scenario_rows_order",
    };
  });
  return byOrderIndex;
}

function buildFlowMaps(dodSnapshot) {
  const incomingByNodeId = {};
  const outgoingByNodeId = {};
  toArray(dodSnapshot?.flows).forEach((flowRaw) => {
    const flow = asObject(flowRaw);
    const sourceId = toText(flow?.source_id || flow?.sourceId);
    const targetId = toText(flow?.target_id || flow?.targetId);
    if (targetId) {
      if (!incomingByNodeId[targetId]) incomingByNodeId[targetId] = [];
      incomingByNodeId[targetId].push(flow);
    }
    if (sourceId) {
      if (!outgoingByNodeId[sourceId]) outgoingByNodeId[sourceId] = [];
      outgoingByNodeId[sourceId].push(flow);
    }
  });
  return { incomingByNodeId, outgoingByNodeId };
}

function buildDodByNodeId(dodSnapshot) {
  const out = {};
  toArray(dodSnapshot?.missing).forEach((itemRaw) => {
    const item = asObject(itemRaw);
    const nodeId = toText(item?.node_id || item?.nodeId);
    if (!nodeId) return;
    if (!out[nodeId]) out[nodeId] = [];
    out[nodeId].push(toText(item?.kind || item?.type || "missing"));
  });
  return out;
}

function linkGroupForNode(linkGroupsRaw, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  if (!nodeId) return null;
  return toArray(linkGroupsRaw).find((groupRaw) => {
    const group = asObject(groupRaw);
    const throws = toArray(group?.throw_ids).map((id) => toText(id));
    const catches = toArray(group?.catch_ids).map((id) => toText(id));
    return throws.includes(nodeId) || catches.includes(nodeId);
  }) || null;
}

function counterpartIdsForNode(group, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  const item = asObject(group);
  if (!nodeId || !item || !Object.keys(item).length) return [];
  const throws = toArray(item?.throw_ids).map((id) => toText(id)).filter(Boolean);
  const catches = toArray(item?.catch_ids).map((id) => toText(id)).filter(Boolean);
  if (throws.includes(nodeId)) return catches;
  if (catches.includes(nodeId)) return throws;
  return [];
}

function buildStepTimeByNodeId(stepsRaw) {
  const out = {};
  toArray(stepsRaw).forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const nodeId = toText(step?.node_id);
    if (!nodeId) return;
    const workSec = Math.max(0, Number(step?.work_duration_sec || step?.duration_sec || 0));
    const waitSec = Math.max(0, Number(step?.wait_duration_sec || 0));
    out[nodeId] = {
      work_duration_sec: workSec,
      wait_duration_sec: waitSec,
      total_time_sec: workSec + waitSec,
    };
  });
  return out;
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

export default function useInterviewPathsViewController({
  active = false,
  sessionId,
  interviewData,
  interviewVM,
  interviewGraph,
  tierFilters,
  selectedStepIds,
  pathMetrics,
  patchStep,
  onPerfReady,
  dodSnapshot,
}) {
  const vm = interviewVM && typeof interviewVM === "object" ? interviewVM : {};
  const [pathsCalcReady, setPathsCalcReady] = useState(false);
  const [scenarioPresentation, setScenarioPresentation] = useState(() => buildScenarioPresentation([]));
  const [stepMetaByNodeId, setStepMetaByNodeId] = useState({});
  const [stepIdMaps, setStepIdMaps] = useState({ stepById: {}, firstStepIdByNodeId: {} });
  const calcRunRef = useRef(0);
  const { stepById, firstStepIdByNodeId } = stepIdMaps;
  const selectedNodeIds = useMemo(() => makeSelectedNodeIdSet(selectedStepIds, stepById), [selectedStepIds, stepById]);
  const scenarios = scenarioPresentation.all;
  const pathSource = normalizePathSource(vm?.path_source);
  const pathSourceLabel = pathSourcePillLabel(pathSource);
  const legacyColorSource = pathSource === "flow_tier";

  const [selectedTier, setSelectedTier] = useState(() => getInitialTierFilter(tierFilters));
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [scenarioSortMode, setScenarioSortMode] = useState("bpmn");
  const [collapsedScenarioGroups, setCollapsedScenarioGroups] = useState({});
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [selectedRouteKey, setSelectedRouteKey] = useState("");
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [isPendingTransition, startTransition] = useTransition();

  const deferredSelectedTier = useDeferredValue(selectedTier);
  const stepTimeByNodeId = useMemo(() => buildStepTimeByNodeId(vm?.steps), [vm?.steps]);

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

  const tierTabCounts = useMemo(() => {
    const out = { ALL: 0, P0: 0, P1: 0, P2: 0 };
    toArray(scenarios).forEach((scenario) => {
      out.ALL += 1;
      const bucket = scenarioBucket(scenario);
      if (bucket === "P0_IDEAL" || bucket === "P0_ALT") {
        out.P0 += 1;
      } else if (bucket === "P1_MITIGATED") {
        out.P1 += 1;
      } else if (bucket === "P2_FAIL") {
        out.P2 += 1;
      }
    });
    return out;
  }, [scenarios]);

  const visibleSections = useMemo(() => {
    const byKey = {
      P0_IDEAL: { key: "P0_IDEAL", title: "P0 · идеал", items: [] },
      P0_ALT: { key: "P0_ALT", title: "P0 · альтернативы", items: [] },
      P1_MITIGATED: { key: "P1_MITIGATED", title: "P1 · смягчённые", items: [] },
      P2_FAIL: { key: "P2_FAIL", title: "P2 · ошибки", items: [] },
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
      || "Сценарий";
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

  function toggleScenarioGroup(groupKeyRaw) {
    const groupKey = toText(groupKeyRaw);
    if (!groupKey) return;
    setCollapsedScenarioGroups((prev) => ({ ...asObject(prev), [groupKey]: !prev?.[groupKey] }));
  }

  return {
    vm,
    pathsCalcReady,
    scenarios,
    scenarioPresentation,
    stepMetaByNodeId,
    stepById,
    firstStepIdByNodeId,
    selectedNodeIds,
    pathSource,
    pathSourceLabel,
    legacyColorSource,
    selectedTier,
    setSelectedTier,
    scenarioSearch,
    setScenarioSearch,
    scenarioSortMode,
    setScenarioSortMode,
    collapsedScenarioGroups,
    selectedScenarioId,
    setSelectedScenarioId,
    selectedRouteKey,
    setSelectedRouteKey,
    detailsCollapsed,
    setDetailsCollapsed,
    isPendingTransition,
    startTransition,
    commitDurationSeconds,
    stepTimeByNodeId,
    visibleScenarios,
    scenarioMetricsById,
    tierTabCounts,
    visibleSections,
    activeScenario,
    routeRows,
    routeStepRows,
    decisionByNodeId,
    decisionByOrderIndex,
    activePathId,
    activePathName,
    orderValidation,
    showDevOrderWarning,
    diffDecisionGatewayIds,
    activeScenarioMetrics,
    activePathMetrics,
    reportScenarioSequenceForReport,
    reportScenarioLabel,
    reportBuildDebugPreview,
    reportApiAvailable,
    canGenerateReport,
    activeRouteRow,
    activeRouteIndex,
    activeStepDetails,
    activeStepTiming,
    toggleScenarioGroup,
  };
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
