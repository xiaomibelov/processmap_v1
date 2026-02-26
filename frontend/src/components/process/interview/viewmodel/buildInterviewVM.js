import { sanitizeDisplayText, toArray, toText } from "../utils.js";
import { buildScenarios } from "../services/scenarios/buildScenarios.js";
import { buildScenarioRows } from "../services/scenarios/buildScenarioRows.js";
import { measureInterviewPerf } from "../perf.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function toNumOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseOrderIndex(step, idx) {
  const explicitOrder = Number(step?.order_index ?? step?.order);
  if (Number.isFinite(explicitOrder) && explicitOrder > 0) return Math.floor(explicitOrder);
  const seq = Number(step?.seq);
  if (Number.isFinite(seq) && seq > 0) return Math.round(seq);
  const label = toText(step?.seq_label);
  const first = Number(label.split(".")[0]);
  if (Number.isFinite(first) && first > 0) return Math.round(first);
  return idx + 1;
}

function parseWorkDurationSec(step) {
  const candidates = [
    step?.work_duration_sec,
    step?.workDurationSec,
    step?.duration_sec,
    step?.durationSec,
    step?.step_time_sec,
    step?.stepTimeSec,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const n = Number(candidates[i]);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  const mins = Number(step?.duration_min ?? step?.durationMin ?? step?.step_time_min ?? step?.stepTimeMin);
  if (Number.isFinite(mins) && mins >= 0) return Math.round(mins * 60);
  return 0;
}

function parseWaitDurationSec(step) {
  const candidates = [
    step?.wait_duration_sec,
    step?.waitDurationSec,
    step?.wait_sec,
    step?.waitSec,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const n = Number(candidates[i]);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  const mins = Number(step?.wait_min ?? step?.waitMin);
  if (Number.isFinite(mins) && mins >= 0) return Math.round(mins * 60);
  return 0;
}

function buildQuality(dodSnapshot) {
  const quality = asObject(asObject(dodSnapshot)?.quality);
  return {
    errors_total: toNumOr(quality?.errorsTotal, 0),
    warnings_total: toNumOr(quality?.warningsTotal, 0),
    items: toArray(quality?.items),
  };
}

function buildMetrics(dodSnapshot, steps, groups) {
  const snap = asObject(dodSnapshot);
  const counts = asObject(snap?.counts);
  const interview = asObject(counts?.interview);
  const tiers = asObject(counts?.tiers);
  const time = asObject(snap?.time);
  return {
    counts: {
      steps_total: toNumOr(interview?.stepsTotal, steps.length),
      groups_total: groups.length,
      ai_total: toNumOr(interview?.aiQuestionsTotal, 0),
      notes_total: toNumOr(interview?.notesGlobalTotal, 0) + toNumOr(interview?.notesByElementTotal, 0),
      coverage_bound_steps: toNumOr(interview?.stepsBoundToBpmn, 0),
      tiers: {
        P0: toNumOr(tiers?.P0, 0),
        P1: toNumOr(tiers?.P1, 0),
        P2: toNumOr(tiers?.P2, 0),
        None: toNumOr(tiers?.None, 0),
      },
    },
    time: {
      process_total_sec: toNumOr(time?.processTotalSec, 0),
      mainline_total_sec: toNumOr(time?.mainlineTotalSec, 0),
      by_lane_sec: toArray(time?.byLaneSec),
      by_tier_sec: toArray(time?.byTierSec),
    },
  };
}

function buildLinearGraph(steps) {
  const edges = [];
  const nodeSeen = new Set();
  let hasCycle = false;
  for (let i = 0; i < steps.length; i += 1) {
    const cur = asObject(steps[i]);
    const next = asObject(steps[i + 1]);
    const curNodeId = toText(cur?.node_id);
    if (curNodeId) {
      if (nodeSeen.has(curNodeId)) hasCycle = true;
      nodeSeen.add(curNodeId);
    }
    if (!Object.keys(next).length) continue;
    edges.push({
      from_step_id: toText(cur?.id),
      to_step_id: toText(next?.id),
    });
  }
  return {
    has_cycle: hasCycle,
    edges,
  };
}

function buildNodeMetaById(nodeMetaById, timelineView) {
  const out = { ...asObject(nodeMetaById) };
  toArray(timelineView).forEach((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    if (!nodeId) return;
    const prev = asObject(out[nodeId]);
    out[nodeId] = {
      ...prev,
      title: sanitizeDisplayText(prev?.title || step?.action || step?.node_bind_title || nodeId, nodeId),
      lane: toText(prev?.lane || step?.lane_name),
      lane_id: toText(prev?.lane_id || step?.lane_key),
      kind: toText(prev?.kind || step?.node_bind_kind || step?.node_kind),
    };
  });
  return out;
}

function buildScenarioDefs() {
  return [
    { id: "primary", label: "P0 (Ideal)", tier: "P0", rank_class: "ideal", priority: ["P0", "P1", "None", "P2"] },
    { id: "p1_mitigated", label: "P1 (Mitigated)", tier: "P1", rank_class: "mitigated", priority: ["P1", "P0", "None", "P2"] },
    { id: "p2_fail", label: "P2 (Fail)", tier: "P2", rank_class: "fail", priority: ["P2", "None", "P1", "P0"] },
  ];
}

function buildDurationSecByNodeId(timelineView) {
  const out = {};
  toArray(timelineView).forEach((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    if (!nodeId) return;
    const n = parseWorkDurationSec(step);
    if (!Number.isFinite(n) || n <= 0) return;
    const prev = Number(out[nodeId] || 0);
    if (n > prev) out[nodeId] = n;
  });
  return out;
}

function buildStepsFromTimeline(timelineView) {
  const rawSteps = toArray(timelineView).map((step, idx) => ({
    ...step,
    _stable_idx: idx,
    _order_index: parseOrderIndex(step, idx),
  }));
  const sortedSteps = [...rawSteps].sort((a, b) => {
    const ao = Number(a?._order_index || 0);
    const bo = Number(b?._order_index || 0);
    if (ao !== bo) return ao - bo;
    return Number(a?._stable_idx || 0) - Number(b?._stable_idx || 0);
  });
  return sortedSteps.map((step, idx) => ({
    work_duration_sec: parseWorkDurationSec(step),
    wait_duration_sec: parseWaitDurationSec(step),
    id: toText(step?.id) || `step_${idx + 1}`,
    order_index: Number(step?._order_index || idx + 1),
    graph_no: toText(step?.seq_label || step?.seq || idx + 1),
    title: sanitizeDisplayText(step?.action || step?.node_bind_title || step?.node_bind_id || `Шаг ${idx + 1}`, `Шаг ${idx + 1}`),
    lane_id: toText(step?.lane_key),
    lane_name: toText(step?.lane_name),
    bpmn_ref: toText(step?.bpmn_ref || step?.node_bind_id || step?.node_id) || null,
    node_id: toText(step?.node_bind_id || step?.node_id),
    node_kind: toText(step?.node_bind_kind || step?.node_kind),
    tier: normalizeTier(step?.tier),
    duration_sec: parseWorkDurationSec(step),
    cumulative_sec: toNumOr(step?.mainline_time_cumulative_sec, 0),
    ai_count: toNumOr(step?.ai_count, 0),
    notes_count: toNumOr(step?.notes_count, 0),
    between_branches_item: step?.between_branches_item || null,
  }));
}

function buildPathMetrics(stepsRaw) {
  const steps = toArray(stepsRaw);
  const steps_count = steps.length;
  const work_time_total_sec = steps.reduce((acc, step) => acc + Math.max(0, Number(step?.work_duration_sec || step?.duration_sec || 0)), 0);
  const wait_time_total_sec = steps.reduce((acc, step) => acc + Math.max(0, Number(step?.wait_duration_sec || 0)), 0);
  const total_time_sec = work_time_total_sec + wait_time_total_sec;
  return {
    steps_count,
    work_time_total_sec,
    wait_time_total_sec,
    total_time_sec,
  };
}

function extractGroupsFromPrimaryScenario(primaryScenario) {
  return toArray(asObject(primaryScenario)?.groups).map((group) => ({
    kind: toText(group?.kind).toLowerCase(),
    id: toText(group?.id),
    anchor_node_id: toText(group?.anchor_node_id),
    anchor_order_index: toNumOr(group?.anchor_order_index, 0),
    title: toText(group?.title),
    branches: toArray(group?.branches).map((branch, idx) => ({
      key: toText(branch?.key) || String.fromCharCode(65 + (idx % 26)),
      label: toText(branch?.label) || `Ветка ${idx + 1}`,
      tier: normalizeTier(branch?.tier),
      is_primary: !!branch?.is_primary,
      stop_reason: toText(branch?.stop_reason),
      children: toArray(branch?.children),
    })),
  }));
}

function enrichScenariosWithRows(scenarios) {
  return toArray(scenarios).map((scenario) => ({
    ...scenario,
    rows: buildScenarioRows(scenario),
  }));
}

export function buildInterviewVM({
  timelineView,
  dodSnapshot,
  graphModel,
  graphNodeRank,
  nodeMetaById,
}) {
  return measureInterviewPerf("buildInterviewVM", () => {
    const steps = buildStepsFromTimeline(timelineView);
    const quality = buildQuality(dodSnapshot);
    const normalizedNodeMetaById = buildNodeMetaById(nodeMetaById, timelineView);
    const durationSecByNodeId = buildDurationSecByNodeId(timelineView);
    const scenarios = enrichScenariosWithRows(buildScenarios(graphModel, {
      rankByNodeId: asObject(graphNodeRank),
      nodeMetaById: normalizedNodeMetaById,
      durationSecByNodeId,
      scenarioDefs: buildScenarioDefs(),
    }));
    const primaryScenario = scenarios.find((scenario) => toText(scenario?.id) === "primary") || null;
    const groups = extractGroupsFromPrimaryScenario(primaryScenario);
    const metrics = measureInterviewPerf(
      "computeMetrics",
      () => buildMetrics(dodSnapshot, steps, groups),
      () => ({ steps: steps.length, groups: groups.length }),
    );
    const linear = buildLinearGraph(steps);
    const path_metrics = buildPathMetrics(steps);

    const warnings = [];
    if (steps.some((step) => !Number.isFinite(Number(step?.order_index)) || Number(step?.order_index) <= 0)) {
      warnings.push("missing_order_index");
    }
    const hasStartNode = steps.some((step) => toText(step?.node_kind).toLowerCase() === "startevent");
    const firstIsStart = toText(steps[0]?.node_kind).toLowerCase() === "startevent";
    if (hasStartNode && !firstIsStart) warnings.push("first_step_not_start_event");
    if (linear.has_cycle) warnings.push("linear_cycle_detected");
    if (!toText(asObject(primaryScenario)?.start_node_id)) warnings.push("missing_start_node");

    return {
      version: "InterviewVM.v1",
      scenarios,
      steps,
      groups,
      metrics,
      path_metrics,
      quality,
      linear,
      display_policy: {
        rows_sort: "order_index",
        ui_sort_by_time_or_title: false,
      },
      warnings,
    };
  }, () => ({
    timelineSteps: toArray(timelineView).length,
    graphNodes: Object.keys(asObject(graphModel?.nodesById)).length,
  }));
}

export function assertInterviewVMInvariants(vm, { devMode = false } = {}) {
  const viewModel = asObject(vm);
  const warnings = [];
  const steps = toArray(viewModel?.steps);
  if (steps.some((step) => !Number.isFinite(Number(step?.order_index)) || Number(step?.order_index) <= 0)) {
    warnings.push("InterviewVM invariant: order_index is required for rendered steps.");
  }
  const nonMonotonic = steps.some((step, idx) => idx > 0 && Number(step?.order_index) <= Number(steps[idx - 1]?.order_index));
  if (nonMonotonic) warnings.push("InterviewVM invariant: order_index must be strictly increasing.");
  const rowsSort = toText(asObject(viewModel?.display_policy)?.rows_sort);
  if (rowsSort !== "order_index") {
    warnings.push("InterviewVM invariant: UI default sort must be order_index.");
  }
  if (asObject(viewModel?.display_policy)?.ui_sort_by_time_or_title !== false) {
    warnings.push("InterviewVM invariant: UI must not sort rows by time/title by default.");
  }
  const scenarios = toArray(viewModel?.scenarios);
  const missingOrderInScenarioRows = scenarios.some((scenario) =>
    toArray(scenario?.rows).some((row) => !Number.isFinite(Number(row?.order_index)) || Number(row?.order_index) <= 0));
  if (missingOrderInScenarioRows) {
    warnings.push("InterviewVM invariant: scenario rows must contain order_index.");
  }
  const hasStartNode = steps.some((step) => toText(step?.node_kind).toLowerCase() === "startevent");
  const firstIsStart = toText(steps[0]?.node_kind).toLowerCase() === "startevent";
  if (hasStartNode && !firstIsStart) {
    warnings.push("InterviewVM invariant: first ordered step must be StartEvent when StartEvent exists.");
  }
  if (devMode && warnings.length && typeof console !== "undefined") {
    warnings.forEach((item) => {
      // eslint-disable-next-line no-console
      console.warn(`[INTERVIEW_VM_WARN] ${item}`);
    });
  }
  return warnings;
}
