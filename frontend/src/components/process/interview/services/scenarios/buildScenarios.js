import { sanitizeDisplayText, toArray, toText } from "../../utils.js";
import { measureInterviewPerf } from "../../perf.js";

const FAIL_TOKENS = [
  "fail",
  "error",
  "cancel",
  "terminate",
  "stop",
  "escalat",
  "ошиб",
  "отмен",
  "неусп",
  "авар",
];

const SUCCESS_TOKENS = [
  "success",
  "done",
  "complete",
  "finish",
  "успех",
  "готово",
  "готов",
  "успеш",
  "заказ готов",
];

const AMBIGUOUS_END_TOKENS = [
  "процесс заверш",
  "завершен",
  "завершён",
  "completed",
  "complete",
];

const MITIGATION_TOKENS = [
  "повтор",
  "исправ",
  "перепечат",
  "позвать",
  "уборк",
  "замен",
  "переукупор",
  "переразогр",
  "утилиз",
  "дефект",
  "бумага конч",
  "пролив",
  "капл",
  "перекос",
];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function normalizeOutcome(raw) {
  const value = toText(raw).toLowerCase();
  if (!value) return "unknown";
  if (value === "success" || value === "ok" || value === "done" || value === "pass") return "success";
  if (value === "fail" || value === "failed" || value === "error" || value === "abort" || value === "stop") return "fail";
  if (value === "true") return "success";
  if (value === "false") return "fail";
  return "unknown";
}

function normalizeLooseText(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasMitigationToken(raw) {
  const text = normalizeLooseText(raw);
  if (!text) return false;
  return MITIGATION_TOKENS.some((token) => text.includes(token));
}

function isParallelGateway(typeRaw, modeRaw) {
  return toText(typeRaw).toLowerCase() === "parallelgateway" || toText(modeRaw).toLowerCase() === "parallel";
}

function makeRankAccessor(rankByNodeId = {}) {
  return (nodeIdRaw) => {
    const n = Number(asObject(rankByNodeId)[toText(nodeIdRaw)]);
    if (Number.isFinite(n)) return n;
    return Number.MAX_SAFE_INTEGER;
  };
}

function sortedNodeIds(nodeIdsRaw, rankOf) {
  return toArray(nodeIdsRaw)
    .map((nodeId) => toText(nodeId))
    .filter(Boolean)
    .sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b, "ru"));
}

function nodeTitle(nodeById, nodeMetaById, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  return sanitizeDisplayText(
    asObject(nodeMetaById)[nodeId]?.title
    || asObject(nodeById)[nodeId]?.name
    || nodeId,
    nodeId,
  );
}

function nodeLane(nodeById, nodeMetaById, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  return {
    lane_id: toText(asObject(nodeById)[nodeId]?.laneId || asObject(nodeMetaById)[nodeId]?.lane_id || asObject(nodeMetaById)[nodeId]?.laneId),
    lane_name: toText(asObject(nodeMetaById)[nodeId]?.lane || asObject(nodeMetaById)[nodeId]?.lane_name),
  };
}

function sortedOutgoingEdges(graph, rankOf, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  return toArray(asObject(graph?.outgoingByNode)[nodeId])
    .map((flow) => ({
      ...flow,
      sourceId: toText(flow?.sourceId),
      targetId: toText(flow?.targetId),
      id: toText(flow?.id),
      tier: normalizeTier(flow?.tier || (flow?.happy ? "P0" : "")),
    }))
    .filter((flow) => !!flow?.targetId)
    .sort((a, b) => rankOf(a?.targetId) - rankOf(b?.targetId) || toText(a?.id).localeCompare(toText(b?.id), "ru"));
}

function resolveStartNodeId(graph, rankOf) {
  const startIds = sortedNodeIds(asObject(graph).startNodeIds, rankOf);
  if (startIds.length) return startIds[0];
  const nodesById = asObject(graph?.nodesById);
  const fallback = Object.keys(nodesById)
    .filter((nodeId) => toArray(asObject(graph?.incomingByNode)[nodeId]).length === 0)
    .sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b, "ru"));
  return fallback[0] || "";
}

function flowTierPriority(flow, scenarioTier, primaryPriority) {
  const tier = normalizeTier(flow?.tier);
  const idx = primaryPriority.indexOf(tier);
  if (idx >= 0) return idx;
  if (scenarioTier === "P1" && tier === "P0") return 1;
  if (scenarioTier === "P2" && tier === "P0") return primaryPriority.length + 1;
  return primaryPriority.length + 2;
}

function pickPrimaryEdge({
  outgoingEdges,
  scenarioTier,
  gatewayInfo,
  rankOf,
  primaryPriority,
  forcedFlowId = "",
}) {
  const list = toArray(outgoingEdges);
  if (!list.length) return null;
  if (list.length === 1) return { ...list[0], reason: "single_outgoing" };

  const forceId = toText(forcedFlowId);
  if (forceId) {
    const forced = list.find((flow) => toText(flow?.id) === forceId);
    if (forced) return { ...forced, reason: "forced_override" };
  }

  const defaultFlowId = toText(gatewayInfo?.defaultFlowId);
  const ranked = [...list].sort((a, b) => {
    const ap = flowTierPriority(a, scenarioTier, primaryPriority);
    const bp = flowTierPriority(b, scenarioTier, primaryPriority);
    if (ap !== bp) return ap - bp;
    const ad = toText(a?.id) === defaultFlowId ? 0 : 1;
    const bd = toText(b?.id) === defaultFlowId ? 0 : 1;
    if (ad !== bd) return ad - bd;
    const ar = rankOf(a?.targetId);
    const br = rankOf(b?.targetId);
    if (ar !== br) return ar - br;
    return toText(a?.id).localeCompare(toText(b?.id), "ru");
  });
  const picked = ranked[0] || null;
  if (!picked) return null;
  const tier = normalizeTier(picked?.tier);
  if (tier === "P0") return { ...picked, reason: "tier_p0" };
  if (tier === "P1") return { ...picked, reason: "tier_p1" };
  if (toText(picked?.id) === defaultFlowId) return { ...picked, reason: "default_flow" };
  return { ...picked, reason: "shortest_path" };
}

function inferStopReasonFromBranchChildren(children = []) {
  const last = children[children.length - 1];
  if (!last) return "end";
  if (toText(last?.kind) === "loop") return "loop";
  if (toText(last?.kind) === "continue") return "continue";
  if (toText(last?.kind) === "terminal") return "end";
  return "next";
}

function makeLoopGroup({
  entryNodeId,
  backToNodeId,
  reason,
  nodeById,
  nodeMetaById,
  anchorOrderIndex = 0,
  expectedIterations = 1,
}) {
  const entryId = toText(entryNodeId);
  const backId = toText(backToNodeId);
  const loopReason = toText(reason || "cycle_detected") || "cycle_detected";
  return {
    kind: "loop",
    id: `loop_${entryId}_${backId || "unknown"}`,
    anchor_node_id: entryId,
    entry_node_id: entryId,
    back_to_node_id: backId,
    target_node_id: backId,
    title: nodeTitle(nodeById, nodeMetaById, backId || entryId),
    reason: loopReason,
    expected_iterations: Math.max(1, Number(expectedIterations || 1)),
    branches: [],
    anchor_order_index: Math.max(1, Number(anchorOrderIndex || 1)),
  };
}

function scenarioTotalDurationSec(scenario, durationSecByNodeIdRaw) {
  const map = asObject(durationSecByNodeIdRaw);
  return toArray(scenario?.sequence).reduce((acc, step) => {
    const nodeId = toText(step?.node_id);
    const n = Number(map[nodeId]);
    return acc + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

function buildScenarioDiff(baseScenario, altScenario, durationSecByNodeId) {
  const base = baseScenario && typeof baseScenario === "object" ? baseScenario : {};
  const alt = altScenario && typeof altScenario === "object" ? altScenario : {};
  const baseSteps = toArray(base?.sequence);
  const altSteps = toArray(alt?.sequence);
  const baseNodeSet = new Set(baseSteps.map((step) => toText(step?.node_id)).filter(Boolean));
  const baseDecisionByGateway = {};
  baseSteps.forEach((step) => {
    const gatewayId = toText(step?.node_id);
    const selectedFlowId = toText(step?.decision?.selected_flow_id);
    if (!gatewayId || !selectedFlowId) return;
    baseDecisionByGateway[gatewayId] = selectedFlowId;
  });

  const differingGatewayDecisions = [];
  altSteps.forEach((step) => {
    const gatewayId = toText(step?.node_id);
    const selectedFlowId = toText(step?.decision?.selected_flow_id);
    if (!gatewayId || !selectedFlowId) return;
    const baseFlowId = toText(baseDecisionByGateway[gatewayId]);
    if (!baseFlowId || baseFlowId === selectedFlowId) return;
    differingGatewayDecisions.push({
      gateway_id: gatewayId,
      ideal_flow_id: baseFlowId,
      alt_flow_id: selectedFlowId,
      alt_label: toText(step?.decision?.selected_label),
      alt_tier: normalizeTier(step?.decision?.selected_tier),
    });
  });

  const additionalSteps = altSteps
    .filter((step) => !baseNodeSet.has(toText(step?.node_id)))
    .map((step) => ({
      node_id: toText(step?.node_id),
      title: toText(step?.title),
      node_type: toText(step?.node_type),
    }));

  const baseDuration = scenarioTotalDurationSec(base, durationSecByNodeId);
  const altDuration = scenarioTotalDurationSec(alt, durationSecByNodeId);

  return {
    differing_gateway_decisions: differingGatewayDecisions,
    additional_steps: additionalSteps,
    additional_time_sec: Math.max(0, altDuration - baseDuration),
    ideal_total_time_sec: baseDuration,
    scenario_total_time_sec: altDuration,
  };
}

function buildBranchChildren({
  graph,
  nodeById,
  nodeMetaById,
  rankOf,
  scenarioTier,
  primaryPriority,
  startNodeId,
  stopNodeId,
  anchorVisited,
  maxDepth,
  depth = 0,
}) {
  const nodeId = toText(startNodeId);
  const stopId = toText(stopNodeId);
  if (!nodeId) return [];
  if (depth >= maxDepth) return [];
  if (anchorVisited.has(nodeId)) {
    return [{
      kind: "loop",
      target_node_id: nodeId,
      target_title: nodeTitle(nodeById, nodeMetaById, nodeId),
    }];
  }
  if (stopId && nodeId === stopId) {
    return [{
      kind: "continue",
      target_node_id: nodeId,
      target_title: nodeTitle(nodeById, nodeMetaById, nodeId),
    }];
  }

  const nextVisited = new Set(anchorVisited);
  nextVisited.add(nodeId);

  const node = asObject(nodeById[nodeId]);
  const gatewayInfo = asObject(asObject(graph?.gatewayById)[nodeId]);
  const outgoing = sortedOutgoingEdges(graph, rankOf, nodeId);
  const currentStep = {
    kind: "step",
    node_id: nodeId,
    node_type: toText(node?.type),
    title: nodeTitle(nodeById, nodeMetaById, nodeId),
    ...nodeLane(nodeById, nodeMetaById, nodeId),
  };

  if (!outgoing.length) return [currentStep];

  if (gatewayInfo?.isSplit && outgoing.length > 1) {
    const nestedGroup = buildGroup({
      graph,
      nodeById,
      nodeMetaById,
      rankOf,
      scenarioTier,
      primaryPriority,
      anchorNodeId: nodeId,
      gatewayInfo,
      maxDepth,
      depth: depth + 1,
      inheritedVisited: nextVisited,
    });
    return [currentStep, nestedGroup.group];
  }

  const nextEdge = pickPrimaryEdge({
    outgoingEdges: outgoing,
    scenarioTier,
    gatewayInfo,
    rankOf,
    primaryPriority,
  });
  if (!nextEdge) return [currentStep];
  return [
    currentStep,
    ...buildBranchChildren({
      graph,
      nodeById,
      nodeMetaById,
      rankOf,
      scenarioTier,
      primaryPriority,
      startNodeId: nextEdge?.targetId,
      stopNodeId: stopId,
      anchorVisited: nextVisited,
      maxDepth,
      depth: depth + 1,
    }),
  ];
}

function buildGroup({
  graph,
  nodeById,
  nodeMetaById,
  rankOf,
  scenarioTier,
  primaryPriority,
  anchorNodeId,
  gatewayInfo,
  nextMainlineNodeId = "",
  maxDepth,
  inheritedVisited = new Set(),
  selectedFlowId = "",
}) {
  const anchorId = toText(anchorNodeId);
  const outgoing = sortedOutgoingEdges(graph, rankOf, anchorId);
  const primaryEdge = pickPrimaryEdge({
    outgoingEdges: outgoing,
    scenarioTier,
    gatewayInfo,
    rankOf,
    primaryPriority,
    forcedFlowId: selectedFlowId,
  });
  const primaryFlowId = toText(selectedFlowId || primaryEdge?.id);
  const joinNodeId = toText(gatewayInfo?.joinNodeId);
  const stopNodeId = toText(nextMainlineNodeId || (toText(gatewayInfo?.mode).toLowerCase() === "parallel" ? joinNodeId : ""));
  const branches = outgoing.map((edge, idx) => {
    const branchVisited = new Set(inheritedVisited);
    branchVisited.add(anchorId);
    const children = buildBranchChildren({
      graph,
      nodeById,
      nodeMetaById,
      rankOf,
      scenarioTier,
      primaryPriority,
      startNodeId: edge?.targetId,
      stopNodeId,
      anchorVisited: branchVisited,
      maxDepth,
      depth: 1,
    });
    return {
      key: String.fromCharCode(65 + (idx % 26)),
      label: toText(edge?.condition || edge?.name) || `Ветка ${idx + 1}`,
      flow_id: toText(edge?.id),
      tier: normalizeTier(edge?.tier),
      is_primary: toText(edge?.id) === primaryFlowId,
      stop_reason: inferStopReasonFromBranchChildren(children),
      children,
    };
  });

  return {
    group: {
      kind: isParallelGateway(asObject(nodeById)[anchorId]?.type, gatewayInfo?.mode) ? "parallel" : "gateway",
      id: `${toText(gatewayInfo?.mode).toLowerCase() || "gateway"}_${anchorId}`,
      anchor_node_id: anchorId,
      title: nodeTitle(nodeById, nodeMetaById, anchorId),
      node_type: toText(asObject(nodeById)[anchorId]?.type),
      branches,
    },
    primaryEdge,
  };
}

function classifyOutcome({
  scenario,
  nodeById,
  endOutcomeByNodeId,
}) {
  const last = toArray(scenario?.sequence).slice(-1)[0] || {};
  const nodeId = toText(last?.node_id);
  if (!nodeId) return "unknown";

  const node = asObject(nodeById[nodeId]);
  const explicit = normalizeOutcome(node?.outcomeHint || node?.outcome || node?.result);
  if (explicit !== "unknown") return explicit;

  const mapped = normalizeOutcome(asObject(endOutcomeByNodeId)[nodeId]);
  if (mapped !== "unknown") return mapped;

  return "unknown";
}

function scenarioSignature(scenario) {
  const steps = toArray(scenario?.sequence).map((step) => toText(step?.node_id)).filter(Boolean);
  const decisions = toArray(scenario?.sequence)
    .map((step) => `${toText(step?.node_id)}=${toText(step?.decision?.selected_flow_id)}`)
    .filter((item) => !item.endsWith("="));
  return `${steps.join(">")}::${decisions.join("|")}`;
}

function buildScenario({
  id,
  label,
  tier,
  rankClass,
  graph,
  nodeById,
  nodeMetaById,
  rankOf,
  startNodeId,
  maxDepth,
  primaryPriority,
  overrideByGatewayId = {},
  loopPolicy = "single_iteration",
  endOutcomeByNodeId = {},
}) {
  const sequence = [];
  const groups = [];
  const flowTiersUsed = new Set();
  const visitCountByNode = {};
  const gatewayVisitCountById = {};
  const visitedEdgeIds = new Set();
  let cursor = toText(startNodeId);
  let depth = 0;
  let order = 1;
  const warnings = [];

  while (cursor && depth < maxDepth) {
    depth += 1;
    const currentVisits = Number(visitCountByNode[cursor] || 0) + 1;
    visitCountByNode[cursor] = currentVisits;
    if (currentVisits > 2) {
      groups.push({
        kind: "loop",
        id: `loop_${cursor}`,
        anchor_node_id: cursor,
        title: nodeTitle(nodeById, nodeMetaById, cursor),
        branches: [],
        anchor_order_index: Math.max(1, order - 1),
      });
      warnings.push(`loop:${cursor}`);
      break;
    }

    const node = asObject(nodeById[cursor]);
    const step = {
      kind: "step",
      node_id: cursor,
      node_type: toText(node?.type),
      title: nodeTitle(nodeById, nodeMetaById, cursor),
      ...nodeLane(nodeById, nodeMetaById, cursor),
      order_index: order,
    };
    sequence.push(step);
    order += 1;

    const outgoing = sortedOutgoingEdges(graph, rankOf, cursor);
    if (!outgoing.length) break;
    const gatewayInfo = asObject(asObject(graph?.gatewayById)[cursor]);

    if (gatewayInfo?.isSplit && outgoing.length > 1) {
      const gatewayVisitNo = Number(gatewayVisitCountById[cursor] || 0) + 1;
      gatewayVisitCountById[cursor] = gatewayVisitNo;
      const forcedFlowId = gatewayVisitNo === 1 ? toText(asObject(overrideByGatewayId)[cursor]) : "";
      const picked = pickPrimaryEdge({
        outgoingEdges: outgoing,
        scenarioTier: tier,
        gatewayInfo,
        rankOf,
        primaryPriority,
        forcedFlowId,
      });
      if (!picked) break;
      const edgeId = toText(picked?.id);
      const targetNodeId = toText(picked?.targetId);
      const isBackEdge = (edgeId && visitedEdgeIds.has(edgeId))
        || Number(visitCountByNode[targetNodeId] || 0) >= 1;
      if (isBackEdge) {
        groups.push(makeLoopGroup({
          entryNodeId: cursor,
          backToNodeId: targetNodeId || cursor,
          reason: "visited_edge",
          nodeById,
          nodeMetaById,
          anchorOrderIndex: order - 1,
          expectedIterations: 1,
        }));
        warnings.push(`loop_edge:${cursor}->${targetNodeId}`);
        if (loopPolicy === "single_iteration") {
          const recoveryOutgoing = outgoing.filter((flow) => {
            const flowId = toText(flow?.id);
            const flowTarget = toText(flow?.targetId);
            if (!flowId || !flowTarget || flowId === edgeId) return false;
            if (visitedEdgeIds.has(flowId)) return false;
            return Number(visitCountByNode[flowTarget] || 0) < 2;
          });
          const recovered = pickPrimaryEdge({
            outgoingEdges: recoveryOutgoing,
            scenarioTier: tier,
            gatewayInfo,
            rankOf,
            primaryPriority,
          });
          if (!recovered) break;
          const recoveredEdgeId = toText(recovered?.id);
          const recoveredTargetNodeId = toText(recovered?.targetId);
          if (recoveredEdgeId) visitedEdgeIds.add(recoveredEdgeId);
          const recoveredTier = normalizeTier(recovered?.tier);
          if (recoveredTier === "P0" || recoveredTier === "P1" || recoveredTier === "P2") {
            flowTiersUsed.add(recoveredTier);
          }
          step.decision = {
            gateway_id: cursor,
            selected_flow_id: toText(picked?.id),
            selected_label: toText(picked?.condition || picked?.name),
            selected_tier: normalizeTier(picked?.tier),
            selected_reason: `${toText(picked?.reason) || "selected"}+loop`,
            available_flow_ids: outgoing.map((flow) => toText(flow?.id)).filter(Boolean),
          };
          const groupResult = buildGroup({
            graph,
            nodeById,
            nodeMetaById,
            rankOf,
            scenarioTier: tier,
            primaryPriority,
            anchorNodeId: cursor,
            gatewayInfo,
            nextMainlineNodeId: "",
            maxDepth,
            selectedFlowId: toText(picked?.id),
          });
          groups.push({
            ...groupResult.group,
            anchor_order_index: order - 1,
          });
          cursor = recoveredTargetNodeId;
          continue;
        }
      }
      if (edgeId) visitedEdgeIds.add(edgeId);
      const edgeTier = normalizeTier(picked?.tier);
      if (edgeTier === "P0" || edgeTier === "P1" || edgeTier === "P2") flowTiersUsed.add(edgeTier);

      step.decision = {
        gateway_id: cursor,
        selected_flow_id: toText(picked?.id),
        selected_label: toText(picked?.condition || picked?.name),
        selected_tier: normalizeTier(picked?.tier),
        selected_reason: toText(picked?.reason),
        available_flow_ids: outgoing.map((flow) => toText(flow?.id)).filter(Boolean),
      };

      const groupResult = buildGroup({
        graph,
        nodeById,
        nodeMetaById,
        rankOf,
        scenarioTier: tier,
        primaryPriority,
        anchorNodeId: cursor,
        gatewayInfo,
        nextMainlineNodeId: "",
        maxDepth,
        selectedFlowId: toText(picked?.id),
      });
      groups.push({
        ...groupResult.group,
        anchor_order_index: order - 1,
      });

      if (isParallelGateway(node?.type, gatewayInfo?.mode) && toText(gatewayInfo?.joinNodeId)) {
        cursor = toText(gatewayInfo?.joinNodeId);
        continue;
      }

      cursor = targetNodeId;
      continue;
    }

    const nextEdge = outgoing[0];
    const nextNodeId = toText(nextEdge?.targetId);
    const nextEdgeId = toText(nextEdge?.id);
    const nextEdgeTier = normalizeTier(nextEdge?.tier);
    if (nextEdgeTier === "P0" || nextEdgeTier === "P1" || nextEdgeTier === "P2") flowTiersUsed.add(nextEdgeTier);
    if (!nextNodeId) break;
    const isBackEdge = (nextEdgeId && visitedEdgeIds.has(nextEdgeId))
      || Number(visitCountByNode[nextNodeId] || 0) >= 1;
    if (isBackEdge) {
      groups.push(makeLoopGroup({
        entryNodeId: cursor,
        backToNodeId: nextNodeId,
        reason: "visited_edge",
        nodeById,
        nodeMetaById,
        anchorOrderIndex: order - 1,
        expectedIterations: 1,
      }));
      warnings.push(`loop_edge:${cursor}->${nextNodeId}`);
      if (loopPolicy === "single_iteration") {
        if (nextEdgeId) visitedEdgeIds.add(nextEdgeId);
        cursor = nextNodeId;
        continue;
      }
    }
    if (nextEdgeId) visitedEdgeIds.add(nextEdgeId);
    if (Number(visitCountByNode[nextNodeId] || 0) >= 2) {
      groups.push(makeLoopGroup({
        entryNodeId: cursor,
        backToNodeId: nextNodeId,
        reason: "visited_node",
        nodeById,
        nodeMetaById,
        anchorOrderIndex: order - 1,
        expectedIterations: 1,
      }));
      warnings.push(`loop:${cursor}->${nextNodeId}`);
      break;
    }
    cursor = nextNodeId;
  }

  if (depth >= maxDepth) warnings.push("depth_limit");
  const lastStep = toArray(sequence).slice(-1)[0] || {};
  const out = {
    id,
    label,
    tier: normalizeTier(tier),
    rank_class: toText(rankClass || "ideal"),
    is_positive: rankClass === "ideal" || rankClass === "alt_happy" || rankClass === "mitigated",
    start_node_id: toText(startNodeId),
    end_node_id: toText(lastStep?.node_id),
    loop_groups: toArray(groups).filter((group) => toText(group?.kind).toLowerCase() === "loop"),
    flow_tiers_used: Array.from(flowTiersUsed),
    sequence,
    groups,
    warnings,
  };
  out.outcome = classifyOutcome({
    scenario: out,
    nodeById,
    endOutcomeByNodeId,
  });
  return out;
}

function defaultScenarioDefs() {
  return [
    {
      id: "primary",
      label: "P0 (Ideal)",
      tier: "P0",
      rank_class: "ideal",
      priority: ["P0", "P1", "None", "P2"],
    },
    {
      id: "p1_mitigated",
      label: "P1 (Mitigated)",
      tier: "P1",
      rank_class: "mitigated",
      priority: ["P1", "P0", "None", "P2"],
    },
    {
      id: "p2_fail",
      label: "P2 (Fail)",
      tier: "P2",
      rank_class: "fail",
      priority: ["P2", "None", "P1", "P0"],
    },
  ];
}

function clampInt(raw, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function decisionMapSignature(mapRaw) {
  const map = asObject(mapRaw);
  const keys = Object.keys(map).filter((key) => toText(key)).sort((a, b) => a.localeCompare(b, "ru"));
  if (!keys.length) return "default";
  return keys.map((key) => `${key}:${toText(map[key])}`).join("|");
}

function buildScenarioCandidates({
  graph,
  nodeById,
  nodeMetaById,
  rankOf,
  startNodeId,
  tier,
  rankClass,
  primaryPriority,
  maxDepth,
  maxAlternativesPerGateway,
  maxTotalScenarios,
  loopPolicy,
  endOutcomeByNodeId,
}) {
  const out = [];
  const producedScenarioSignatures = new Set();
  const queuedDecisionMaps = new Set();
  const queue = [{}];
  queuedDecisionMaps.add("default");
  let guard = 0;

  while (queue.length && out.length < maxTotalScenarios && guard < maxTotalScenarios * 24) {
    guard += 1;
    const overrideByGatewayId = asObject(queue.shift());
    const scenario = buildScenario({
      id: "",
      label: "",
      tier,
      rankClass,
      graph,
      nodeById,
      nodeMetaById,
      rankOf,
      startNodeId,
      maxDepth,
      primaryPriority,
      overrideByGatewayId,
      loopPolicy,
      endOutcomeByNodeId,
    });
    const signature = scenarioSignature(scenario);
    if (signature && !producedScenarioSignatures.has(signature)) {
      producedScenarioSignatures.add(signature);
      out.push(scenario);
    }

    const decisions = toArray(scenario?.sequence).filter((step) => toText(step?.decision?.selected_flow_id));
    decisions.forEach((step) => {
      const gatewayId = toText(step?.node_id);
      const selectedFlowId = toText(step?.decision?.selected_flow_id);
      const available = toArray(step?.decision?.available_flow_ids)
        .map((id) => toText(id))
        .filter(Boolean)
        .slice(0, maxAlternativesPerGateway);
      const alternatives = available.filter((flowId) => flowId !== selectedFlowId);
      alternatives.forEach((flowId) => {
        const nextMap = { ...overrideByGatewayId, [gatewayId]: flowId };
        const mapSig = decisionMapSignature(nextMap);
        if (queuedDecisionMaps.has(mapSig)) return;
        if (queue.length + out.length >= maxTotalScenarios) return;
        queuedDecisionMaps.add(mapSig);
        queue.push(nextMap);
      });
    });
  }
  return out;
}

function scenarioUsesTierP1(scenario) {
  const flowTiers = new Set(toArray(scenario?.flow_tiers_used).map((tier) => normalizeTier(tier)));
  if (flowTiers.has("P1")) return true;
  return toArray(scenario?.sequence).some((step) => normalizeTier(step?.decision?.selected_tier) === "P1");
}

function scenarioHasLoop(scenario) {
  const loopGroups = toArray(scenario?.loop_groups);
  if (loopGroups.length > 0) return true;
  return toArray(scenario?.groups).some((group) => toText(group?.kind).toLowerCase() === "loop");
}

function scenarioHasMitigationTokens(scenario) {
  return toArray(scenario?.sequence).some((step) => {
    if (hasMitigationToken(step?.title)) return true;
    if (hasMitigationToken(step?.decision?.selected_label)) return true;
    return false;
  });
}

function scenarioIsMitigated(scenario) {
  return scenarioHasLoop(scenario)
    || scenarioHasMitigationTokens(scenario)
    || scenarioUsesTierP1(scenario);
}

function compareScenarioComplexity(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  const aSteps = toArray(a?.sequence).length;
  const bSteps = toArray(b?.sequence).length;
  if (aSteps !== bSteps) return aSteps - bSteps;
  const aLoops = toArray(a?.loop_groups).length;
  const bLoops = toArray(b?.loop_groups).length;
  if (aLoops !== bLoops) return aLoops - bLoops;
  const aId = toText(a?.id);
  const bId = toText(b?.id);
  if (aId === "primary" && bId !== "primary") return -1;
  if (bId === "primary" && aId !== "primary") return 1;
  return aId.localeCompare(bId, "ru");
}

function assignScenarioRanks(scenariosRaw) {
  const scenarios = toArray(scenariosRaw).map((scenario) => {
    const mitigated = scenarioIsMitigated(scenario);
    const outcome = toText(scenario?.outcome).toLowerCase();
    return {
      ...scenario,
      rank_class: outcome === "fail" ? "fail" : "mitigated",
      is_positive: outcome === "success",
      _mitigated: mitigated,
      _decision_signature: toArray(scenario?.sequence)
        .map((step) => `${toText(step?.node_id)}=${toText(step?.decision?.selected_flow_id)}`)
        .filter((item) => !item.endsWith("="))
        .join("|"),
    };
  });

  const successNonMitigated = scenarios
    .filter((scenario) => toText(scenario?.outcome).toLowerCase() === "success" && !scenario?._mitigated)
    .sort(compareScenarioComplexity);
  const ideal = successNonMitigated[0] || null;
  const idealDecisionSig = toText(ideal?._decision_signature);

  return scenarios.map((scenario) => {
    const outcome = toText(scenario?.outcome).toLowerCase();
    const tier = normalizeTier(scenario?.tier);
    let rankClass = toText(scenario?.rank_class).toLowerCase() || "mitigated";

    if (outcome === "fail") {
      rankClass = "fail";
    } else if (outcome === "success") {
      if (ideal && toText(scenario?.id) === toText(ideal?.id)) {
        rankClass = "ideal";
      } else if (scenario?._mitigated) {
        rankClass = "mitigated";
      } else if (idealDecisionSig && toText(scenario?._decision_signature) === idealDecisionSig) {
        rankClass = "ideal";
      } else {
        rankClass = "alt_happy";
      }
    } else {
      // unknown outcome: keep deterministic non-guessing policy; do not mark as happy.
      rankClass = tier === "P2" ? "fail" : "mitigated";
    }

    const next = { ...scenario, rank_class: rankClass, is_positive: outcome === "success" };
    delete next._mitigated;
    delete next._decision_signature;
    return next;
  });
}

function rankClassOrder(rankClassRaw) {
  const rankClass = toText(rankClassRaw).toLowerCase();
  if (rankClass === "ideal") return 1;
  if (rankClass === "alt_happy") return 2;
  if (rankClass === "mitigated") return 3;
  if (rankClass === "fail") return 4;
  return 9;
}

function classifyOutcomeByName({ nameRaw, typeRaw }) {
  const type = toText(typeRaw).toLowerCase();
  const name = toText(nameRaw).toLowerCase();
  const text = `${type} ${name}`.trim();
  if (!text) return "unknown";

  const hasFailToken = FAIL_TOKENS.some((token) => text.includes(token));
  if (hasFailToken) return "fail";

  const hasSuccessToken = SUCCESS_TOKENS.some((token) => text.includes(token));
  const hasAmbiguous = AMBIGUOUS_END_TOKENS.some((token) => text.includes(token));
  if (hasAmbiguous && !hasSuccessToken && !text.includes("успеш")) return "unknown";
  if (hasSuccessToken) return "success";
  return "unknown";
}

function collectUpstreamFlowTiers(graphRef, endNodeIdRaw, maxEdges = 640) {
  const endNodeId = toText(endNodeIdRaw);
  if (!endNodeId) return new Set();
  const incomingByNode = asObject(graphRef?.incomingByNode);
  const queue = [endNodeId];
  const visitedNodeIds = new Set();
  const visitedFlowIds = new Set();
  const tiers = new Set();
  let hops = 0;

  while (queue.length && hops < maxEdges) {
    hops += 1;
    const nodeId = toText(queue.shift());
    if (!nodeId || visitedNodeIds.has(nodeId)) continue;
    visitedNodeIds.add(nodeId);
    toArray(incomingByNode[nodeId]).forEach((flow) => {
      const flowId = toText(flow?.id);
      if (flowId && visitedFlowIds.has(flowId)) return;
      if (flowId) visitedFlowIds.add(flowId);
      const tier = normalizeTier(flow?.tier || (flow?.happy ? "P0" : ""));
      if (tier === "P0" || tier === "P1" || tier === "P2") tiers.add(tier);
      const src = toText(flow?.sourceId);
      if (src && !visitedNodeIds.has(src)) queue.push(src);
    });
  }
  return tiers;
}

function classifyOutcomeByContext(graphRef, endNodeIdRaw) {
  const tiers = collectUpstreamFlowTiers(graphRef, endNodeIdRaw);
  if (!tiers.size) return "unknown";
  if (tiers.size === 1 && tiers.has("P2")) return "fail";
  if (tiers.has("P0")) return "success";
  if (!tiers.has("P0") && tiers.has("P1") && !tiers.has("P2")) return "success";
  return "unknown";
}

function deriveEndOutcomeSets(graphRef) {
  const nodesById = asObject(graphRef?.nodesById);
  const fromGraph = toArray(graphRef?.endNodeIds).map((id) => toText(id)).filter(Boolean);
  const fromNodes = Object.keys(nodesById).filter((nodeId) => {
    const type = toText(nodesById?.[nodeId]?.type).toLowerCase();
    return type.includes("end");
  });
  const endNodeIds = (fromGraph.length ? fromGraph : fromNodes)
    .filter(Boolean)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  const byNodeId = {};
  const success = [];
  const fail = [];
  const unknown = [];

  endNodeIds.forEach((nodeId) => {
    const node = asObject(nodesById[nodeId]);
    const explicit = normalizeOutcome(node?.outcomeHint || node?.outcome || node?.result);
    if (explicit === "success") {
      byNodeId[nodeId] = "success";
      success.push(nodeId);
      return;
    }
    if (explicit === "fail") {
      byNodeId[nodeId] = "fail";
      fail.push(nodeId);
      return;
    }

    const byName = classifyOutcomeByName({
      nameRaw: node?.name,
      typeRaw: node?.type,
    });
    if (byName === "success") {
      byNodeId[nodeId] = "success";
      success.push(nodeId);
      return;
    }
    if (byName === "fail") {
      byNodeId[nodeId] = "fail";
      fail.push(nodeId);
      return;
    }

    const byContext = classifyOutcomeByContext(graphRef, nodeId);
    if (byContext === "success") {
      byNodeId[nodeId] = "success";
      success.push(nodeId);
      return;
    }
    if (byContext === "fail") {
      byNodeId[nodeId] = "fail";
      fail.push(nodeId);
      return;
    }

    byNodeId[nodeId] = "unknown";
    unknown.push(nodeId);
  });
  return {
    endOutcomeByNodeId: byNodeId,
    successEndNodeIds: success,
    failEndNodeIds: fail,
    unknownEndNodeIds: unknown,
  };
}

export function buildScenarios(graph, rules = {}) {
  return measureInterviewPerf("buildScenarios", () => {
    const graphRef = asObject(graph);
    const nodesById = asObject(graphRef?.nodesById);
    const nodeMetaById = asObject(rules?.nodeMetaById);
    const rankOf = makeRankAccessor(rules?.rankByNodeId || {});
    const maxDepth = clampInt(rules?.maxDepth, 300, 24, 2400);
    const maxAlternativesPerGateway = clampInt(rules?.maxAlternativesPerGateway, 3, 1, 6);
    const maxTotalScenarios = clampInt(rules?.maxTotalScenarios, 20, 1, 200);
    const explicitStartNodeId = toText(rules?.startNodeId);
    const orderedStartNodeIds = explicitStartNodeId
      ? [explicitStartNodeId]
      : (
        sortedNodeIds(graphRef?.startNodeIds, rankOf).length
          ? sortedNodeIds(graphRef?.startNodeIds, rankOf)
          : [resolveStartNodeId(graphRef, rankOf)].filter(Boolean)
      );
    if (!orderedStartNodeIds.length) return [];

    const scenarioDefs = toArray(rules?.scenarioDefs).length
      ? toArray(rules.scenarioDefs)
      : defaultScenarioDefs();
    const endSets = deriveEndOutcomeSets(graphRef);

    const rawScenarios = [];
    for (let startIdx = 0; startIdx < orderedStartNodeIds.length; startIdx += 1) {
      const startNodeId = toText(orderedStartNodeIds[startIdx]);
      if (!startNodeId) continue;

      for (let defIdx = 0; defIdx < scenarioDefs.length; defIdx += 1) {
        if (rawScenarios.length >= maxTotalScenarios) break;
        const def = asObject(scenarioDefs[defIdx]);
        const remaining = Math.max(1, maxTotalScenarios - rawScenarios.length);
        const candidates = buildScenarioCandidates({
          graph: graphRef,
          nodeById: nodesById,
          nodeMetaById,
          rankOf,
          startNodeId,
          tier: normalizeTier(def?.tier),
          rankClass: toText(def?.rank_class || (defIdx === 0 ? "ideal" : "")) || "ideal",
          primaryPriority: toArray(def?.priority).map((tier) => normalizeTier(tier)),
          maxDepth,
          maxAlternativesPerGateway,
          maxTotalScenarios: remaining,
          loopPolicy: toText(def?.loopPolicy || rules?.loopPolicy || "single_iteration"),
          endOutcomeByNodeId: endSets.endOutcomeByNodeId,
        });

        candidates.forEach((scenario, candidateIdx) => {
          if (rawScenarios.length >= maxTotalScenarios) return;
          const idBase = toText(def?.id) || `scenario_${defIdx + 1}`;
          const scenarioId = (startIdx === 0 && candidateIdx === 0)
            ? idBase
            : `${idBase}_s${startIdx + 1}_v${candidateIdx + 1}`;
          let label = toText(def?.label) || toText(def?.id) || `Scenario ${defIdx + 1}`;
          if (orderedStartNodeIds.length > 1) label = `${label} · Start ${startIdx + 1}`;
          if (candidateIdx > 0) label = `${label} · Alt ${candidateIdx}`;
          rawScenarios.push({
            ...scenario,
            id: scenarioId,
            label,
            tier: normalizeTier(def?.tier),
          });
        });
      }
    }

    const classified = assignScenarioRanks(rawScenarios);

    const ranked = [...classified].sort((a, b) => {
      const ao = rankClassOrder(a?.rank_class);
      const bo = rankClassOrder(b?.rank_class);
      if (ao !== bo) return ao - bo;
      const as = toArray(a?.sequence).length;
      const bs = toArray(b?.sequence).length;
      if (as !== bs) return as - bs;
      return toText(a?.label).localeCompare(toText(b?.label), "ru");
    });

    const idealScenario = ranked.find((scenario) => toText(scenario?.rank_class).toLowerCase() === "ideal") || ranked[0] || null;
    const durationSecByNodeId = asObject(rules?.durationSecByNodeId);
    return ranked.map((scenario) => {
      const rankClass = toText(scenario?.rank_class).toLowerCase();
      if (!idealScenario || scenario === idealScenario || (rankClass !== "alt_happy" && rankClass !== "mitigated")) {
        return scenario;
      }
      return {
        ...scenario,
        diff_from_ideal: buildScenarioDiff(idealScenario, scenario, durationSecByNodeId),
      };
    });
  }, () => {
    const graphRef = asObject(graph);
    const nodeCount = Object.keys(asObject(graphRef?.nodesById)).length;
    const flowCount = Object.keys(asObject(graphRef?.flowsById)).length;
    return {
      nodeCount,
      flowCount,
      startCount: toArray(graphRef?.startNodeIds).length,
      scenarioDefs: toArray(rules?.scenarioDefs).length || defaultScenarioDefs().length,
    };
  });
}
