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

function normalizeNodePathMetaByNodeId(rawMeta) {
  const src = asObject(rawMeta);
  const out = {};
  Object.keys(src).forEach((rawNodeId) => {
    const nodeId = toText(rawNodeId);
    if (!nodeId) return;
    const entry = asObject(src[rawNodeId]);
    const seen = new Set();
    const paths = toArray(entry?.paths)
      .map((tag) => toText(tag).toUpperCase())
      .filter((tag) => {
        if (!(tag === "P0" || tag === "P1" || tag === "P2")) return false;
        if (seen.has(tag)) return false;
        seen.add(tag);
        return true;
      });
    if (!paths.length) return;
    out[nodeId] = {
      paths,
      sequence_key: toText(entry?.sequence_key || entry?.sequenceKey),
      source: toText(entry?.source || "manual").toLowerCase() === "color_auto" ? "color_auto" : "manual",
    };
  });
  return out;
}

function defaultSequenceKeyForTier(tier) {
  if (tier === "P0") return "primary";
  if (tier === "P1") return "mitigated_1";
  if (tier === "P2") return "fail_1";
  return "primary";
}

function scenarioDurationSec(sequence, durationSecByNodeId) {
  return toArray(sequence).reduce((acc, step) => {
    const nodeId = toText(step?.node_id);
    const n = Number(asObject(durationSecByNodeId)[nodeId] || 0);
    return acc + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

function buildScenariosFromNodePathMeta({
  graphModel,
  rankByNodeId,
  nodeMetaById,
  durationSecByNodeId,
  scenarioDefs,
  nodePathMetaByNodeId,
  bpmnTraversalOrder,
}) {
  const normalizedNodeMeta = normalizeNodePathMetaByNodeId(nodePathMetaByNodeId);
  if (!Object.keys(normalizedNodeMeta).length) return [];
  const graph = asObject(graphModel);
  const nodesById = asObject(graph?.nodesById);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const incomingByNode = asObject(graph?.incomingByNode);
  const orderByBpmn = {};
  toArray(bpmnTraversalOrder).forEach((nodeId, idx) => {
    const id = toText(nodeId);
    if (!id) return;
    orderByBpmn[id] = idx;
  });

  function compareNodeIds(aRaw, bRaw) {
    const a = toText(aRaw);
    const b = toText(bRaw);
    const ao = Number(orderByBpmn[a]);
    const bo = Number(orderByBpmn[b]);
    if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
    if (Number.isFinite(ao) !== Number.isFinite(bo)) return Number.isFinite(ao) ? -1 : 1;
    const ar = Number(asObject(rankByNodeId)[a]);
    const br = Number(asObject(rankByNodeId)[b]);
    const av = Number.isFinite(ar) ? ar : Number.MAX_SAFE_INTEGER;
    const bv = Number.isFinite(br) ? br : Number.MAX_SAFE_INTEGER;
    if (av !== bv) return av - bv;
    return a.localeCompare(b, "ru");
  }

  function orderedNodeIdsForSet(nodeIdsRaw) {
    const allowed = new Set(toArray(nodeIdsRaw).map((nodeId) => toText(nodeId)).filter((nodeId) => !!nodesById[nodeId]));
    if (!allowed.size) return [];
    const visited = new Set();
    const ordered = [];

    function walk(nodeIdRaw) {
      const nodeId = toText(nodeIdRaw);
      if (!nodeId || visited.has(nodeId) || !allowed.has(nodeId)) return;
      visited.add(nodeId);
      ordered.push(nodeId);
      const outgoing = toArray(outgoingByNode[nodeId])
        .map((flow) => toText(flow?.targetId))
        .filter((targetId) => allowed.has(targetId))
        .sort((a, b) => compareNodeIds(a, b));
      outgoing.forEach((targetId) => walk(targetId));
    }

    const startCandidates = toArray(graph?.startNodeIds)
      .map((nodeId) => toText(nodeId))
      .filter((nodeId) => allowed.has(nodeId))
      .sort((a, b) => compareNodeIds(a, b));
    startCandidates.forEach((nodeId) => walk(nodeId));

    Array.from(allowed)
      .filter((nodeId) => !visited.has(nodeId) && toArray(incomingByNode[nodeId]).every((flow) => !allowed.has(toText(flow?.sourceId))))
      .sort((a, b) => compareNodeIds(a, b))
      .forEach((nodeId) => walk(nodeId));

    Array.from(allowed)
      .filter((nodeId) => !visited.has(nodeId))
      .sort((a, b) => compareNodeIds(a, b))
      .forEach((nodeId) => walk(nodeId));

    return ordered;
  }

  const groupedByTierAndSeq = {};
  Object.keys(normalizedNodeMeta).forEach((nodeId) => {
    const entry = asObject(normalizedNodeMeta[nodeId]);
    const sequenceKey = toText(entry?.sequence_key) || "";
    toArray(entry?.paths).forEach((tierRaw) => {
      const tier = toText(tierRaw).toUpperCase();
      if (!(tier === "P0" || tier === "P1" || tier === "P2")) return;
      const seq = sequenceKey || defaultSequenceKeyForTier(tier);
      const key = `${tier}::${seq}`;
      if (!groupedByTierAndSeq[key]) groupedByTierAndSeq[key] = { tier, sequence_key: seq, nodeIds: [] };
      groupedByTierAndSeq[key].nodeIds.push(nodeId);
    });
  });

  const defsByTier = {};
  toArray(scenarioDefs).forEach((def) => {
    const tier = toText(def?.tier).toUpperCase();
    if (tier) defsByTier[tier] = def;
  });
  const bucketsByTier = { P0: [], P1: [], P2: [] };
  Object.keys(groupedByTierAndSeq).forEach((key) => {
    const group = asObject(groupedByTierAndSeq[key]);
    const tier = toText(group?.tier).toUpperCase();
    if (!(tier === "P0" || tier === "P1" || tier === "P2")) return;
    bucketsByTier[tier].push(group);
  });
  Object.keys(bucketsByTier).forEach((tier) => {
    bucketsByTier[tier].sort((a, b) => {
      const sa = toText(a?.sequence_key || defaultSequenceKeyForTier(tier));
      const sb = toText(b?.sequence_key || defaultSequenceKeyForTier(tier));
      if (tier === "P0") {
        if (sa === "primary" && sb !== "primary") return -1;
        if (sb === "primary" && sa !== "primary") return 1;
      }
      return sa.localeCompare(sb, "ru");
    });
  });

  const scenarios = [];
  let p0AltCounter = 0;
  let p1Counter = 0;
  let p2Counter = 0;

  ["P0", "P1", "P2"].forEach((tier) => {
    toArray(bucketsByTier[tier]).forEach((group) => {
      const def = asObject(defsByTier[tier]);
      const orderedNodeIds = orderedNodeIdsForSet(group?.nodeIds);
      if (!orderedNodeIds.length) return;
      const sequence = orderedNodeIds.map((nodeId) => {
        const node = asObject(nodesById[nodeId]);
        const meta = asObject(nodeMetaById?.[nodeId]);
        return {
          kind: "step",
          node_id: nodeId,
          node_type: toText(node?.type),
          title: sanitizeDisplayText(meta?.title || node?.name || nodeId, nodeId),
          lane_id: toText(meta?.lane_id || node?.laneId),
          lane_name: toText(meta?.lane || meta?.lane_name),
          tier,
        };
      });
      const sequenceKey = toText(group?.sequence_key || defaultSequenceKeyForTier(tier));
      let id = "";
      let label = "";
      let rankClass = "";
      if (tier === "P0" && sequenceKey === "primary") {
        id = "primary";
        label = toText(def?.label || "P0 (Ideal)");
        rankClass = "ideal";
      } else if (tier === "P0") {
        p0AltCounter += 1;
        id = `p0_alt_${p0AltCounter}`;
        label = `P0 Alt #${p0AltCounter}`;
        rankClass = "alt_happy";
      } else if (tier === "P1") {
        p1Counter += 1;
        id = `p1_mitigated_${p1Counter}`;
        label = `P1 Mitigated #${p1Counter}`;
        rankClass = "mitigated";
      } else {
        p2Counter += 1;
        id = `p2_fail_${p2Counter}`;
        label = `P2 Fail #${p2Counter}`;
        rankClass = "fail";
      }
      scenarios.push({
        id,
        label,
        tier,
        rank_class: rankClass || toText(def?.rank_class || ""),
        outcome: tier === "P2" ? "fail" : "success",
        start_node_id: toText(sequence?.[0]?.node_id),
        sequence,
        groups: [],
        sequence_key: sequenceKey,
        source: "node_path_meta",
      });
    });
  });

  const primary = scenarios.find((scenario) => toText(scenario?.id) === "primary") || null;
  if (primary) {
    const idealSet = new Set(toArray(primary?.sequence).map((step) => toText(step?.node_id)).filter(Boolean));
    const idealTotal = scenarioDurationSec(primary?.sequence, durationSecByNodeId);
    scenarios.forEach((scenario) => {
      if (!scenario || toText(scenario?.id) === "primary") return;
      const additionalSteps = toArray(scenario?.sequence)
        .filter((step) => !idealSet.has(toText(step?.node_id)))
        .map((step) => ({
          node_id: toText(step?.node_id),
          title: toText(step?.title),
          node_type: toText(step?.node_type),
        }));
      const scenarioTotal = scenarioDurationSec(scenario?.sequence, durationSecByNodeId);
      scenario.diff_from_ideal = {
        differing_gateway_decisions: [],
        additional_steps: additionalSteps,
        additional_time_sec: Math.max(0, scenarioTotal - idealTotal),
        ideal_total_time_sec: idealTotal,
        scenario_total_time_sec: scenarioTotal,
      };
    });
  }

  return scenarios;
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
  nodePathMetaByNodeId,
  bpmnTraversalOrder,
}) {
  return measureInterviewPerf("buildInterviewVM", () => {
    const steps = buildStepsFromTimeline(timelineView);
    const quality = buildQuality(dodSnapshot);
    const normalizedNodeMetaById = buildNodeMetaById(nodeMetaById, timelineView);
    const durationSecByNodeId = buildDurationSecByNodeId(timelineView);
    const scenarioDefs = buildScenarioDefs();
    const taggedScenarios = buildScenariosFromNodePathMeta({
      graphModel,
      rankByNodeId: asObject(graphNodeRank),
      nodeMetaById: normalizedNodeMetaById,
      durationSecByNodeId,
      scenarioDefs,
      nodePathMetaByNodeId: asObject(nodePathMetaByNodeId),
      bpmnTraversalOrder: toArray(bpmnTraversalOrder),
    });
    const scenarioSource = taggedScenarios.length ? "node_path_meta" : "flow_tier";
    const baseScenarios = taggedScenarios.length
      ? taggedScenarios
      : buildScenarios(graphModel, {
        rankByNodeId: asObject(graphNodeRank),
        nodeMetaById: normalizedNodeMetaById,
        durationSecByNodeId,
        scenarioDefs,
      });
    const scenarios = enrichScenariosWithRows(baseScenarios);
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
      path_source: scenarioSource,
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
