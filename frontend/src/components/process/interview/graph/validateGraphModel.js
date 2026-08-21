import { toArray, toText } from "../utils.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeRank(rankByNodeId, nodeIdRaw) {
  const rank = Number(rankByNodeId?.[toText(nodeIdRaw)]);
  return Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER;
}

function isEndLike(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  return type === "endevent" || type === "terminateeventdefinition";
}

function buildReachableToEndSet(graph) {
  const nodesById = asObject(graph?.nodesById);
  const incomingByNode = asObject(graph?.incomingByNode);
  const endNodeIds = toArray(graph?.endNodeIds).map((id) => toText(id)).filter(Boolean);
  const visited = new Set();
  const queue = [...endNodeIds];
  while (queue.length) {
    const nodeId = toText(queue.shift());
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    toArray(incomingByNode[nodeId]).forEach((flow) => {
      const prevId = toText(flow?.sourceId);
      if (!prevId || visited.has(prevId) || !nodesById[prevId]) return;
      queue.push(prevId);
    });
  }
  return visited;
}

function canReachTarget(fromNodeIdRaw, toNodeIdRaw, outgoingByNode, maxNodes = 240) {
  const fromNodeId = toText(fromNodeIdRaw);
  const toNodeId = toText(toNodeIdRaw);
  if (!fromNodeId || !toNodeId) return false;
  if (fromNodeId === toNodeId) return true;
  const visited = new Set();
  const queue = [fromNodeId];
  while (queue.length && visited.size < maxNodes) {
    const nodeId = toText(queue.shift());
    if (!nodeId || visited.has(nodeId)) continue;
    if (nodeId === toNodeId) return true;
    visited.add(nodeId);
    toArray(outgoingByNode?.[nodeId]).forEach((flow) => {
      const nextId = toText(flow?.targetId);
      if (!nextId || visited.has(nextId)) return;
      queue.push(nextId);
    });
  }
  return false;
}

function tarjanScc(graph) {
  const nodesById = asObject(graph?.nodesById);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const nodeIds = Object.keys(nodesById);
  const indexById = {};
  const lowById = {};
  const stack = [];
  const onStack = {};
  let index = 0;
  const scc = [];

  function strongConnect(nodeId) {
    indexById[nodeId] = index;
    lowById[nodeId] = index;
    index += 1;
    stack.push(nodeId);
    onStack[nodeId] = true;

    toArray(outgoingByNode[nodeId]).forEach((flow) => {
      const nextId = toText(flow?.targetId);
      if (!nextId || !nodesById[nextId]) return;
      if (!Object.prototype.hasOwnProperty.call(indexById, nextId)) {
        strongConnect(nextId);
        lowById[nodeId] = Math.min(lowById[nodeId], lowById[nextId]);
      } else if (onStack[nextId]) {
        lowById[nodeId] = Math.min(lowById[nodeId], indexById[nextId]);
      }
    });

    if (lowById[nodeId] === indexById[nodeId]) {
      const component = [];
      while (stack.length) {
        const current = stack.pop();
        onStack[current] = false;
        component.push(current);
        if (current === nodeId) break;
      }
      scc.push(component);
    }
  }

  nodeIds.forEach((nodeId) => {
    if (!Object.prototype.hasOwnProperty.call(indexById, nodeId)) strongConnect(nodeId);
  });

  return scc;
}

function pickNodeCandidates({
  graph,
  graphNodeRank,
  preferredLaneId,
  targetRank,
  filterFn,
  limit = 3,
}) {
  const nodesById = asObject(graph?.nodesById);
  const candidates = Object.keys(nodesById)
    .filter((nodeId) => filterFn(nodeId, nodesById[nodeId]))
    .map((nodeId) => {
      const node = nodesById[nodeId];
      const rank = safeRank(graphNodeRank, nodeId);
      const laneId = toText(node?.laneId);
      const laneScore = preferredLaneId && laneId && preferredLaneId === laneId ? 0 : 1;
      return {
        nodeId,
        nodeName: toText(node?.name) || nodeId,
        nodeType: toText(node?.type),
        laneId,
        rank,
        rankDistance: Number.isFinite(rank) && Number.isFinite(targetRank)
          ? Math.abs(rank - targetRank)
          : Number.MAX_SAFE_INTEGER,
        laneScore,
      };
    })
    .sort((a, b) => {
      if (a.laneScore !== b.laneScore) return a.laneScore - b.laneScore;
      if (a.rankDistance !== b.rankDistance) return a.rankDistance - b.rankDistance;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return String(a.nodeId).localeCompare(String(b.nodeId), "ru");
    });
  return candidates.slice(0, Math.max(1, limit));
}

export function validateInterviewGraphModel({
  graph,
  graphNodeRank,
}) {
  const graphRef = graph && typeof graph === "object" ? graph : {};
  const nodesById = asObject(graphRef?.nodesById);
  const flowsById = asObject(graphRef?.flowsById);
  const outgoingByNode = asObject(graphRef?.outgoingByNode);
  const incomingByNode = asObject(graphRef?.incomingByNode);
  const reachableSet = new Set(toArray(graphRef?.reachableNodeIds).map((id) => toText(id)).filter(Boolean));
  const nodeIds = Object.keys(nodesById);
  const issues = [];

  function pushIssue(issue) {
    issues.push({
      id: toText(issue?.id) || `issue_${issues.length + 1}`,
      code: toText(issue?.code) || "unknown",
      severity: toText(issue?.severity) || "warn",
      title: toText(issue?.title) || "Graph issue",
      details: toText(issue?.details),
      nodeId: toText(issue?.nodeId),
      suspiciousFlowIds: toArray(issue?.suspiciousFlowIds).map((id) => toText(id)).filter(Boolean),
      repairHints: toArray(issue?.repairHints).map((hint, idx) => ({
        id: toText(hint?.id) || `${toText(issue?.id) || "issue"}_hint_${idx + 1}`,
        action: toText(hint?.action) || "inspect",
        note: toText(hint?.note),
        candidateSources: toArray(hint?.candidateSources),
        candidateTargets: toArray(hint?.candidateTargets),
      })),
    });
  }

  nodeIds.forEach((nodeId) => {
    if (reachableSet.has(nodeId)) return;
    const node = nodesById[nodeId];
    const rank = safeRank(graphNodeRank, nodeId);
    const preferredLaneId = toText(node?.laneId);
    const candidateSources = pickNodeCandidates({
      graph: graphRef,
      graphNodeRank,
      preferredLaneId,
      targetRank: rank,
      filterFn: (candidateId, candidateNode) => {
        if (candidateId === nodeId) return false;
        if (!reachableSet.has(candidateId)) return false;
        const outCount = toArray(outgoingByNode[candidateId]).length;
        if (outCount <= 0) return false;
        if (isEndLike(candidateNode?.type)) return false;
        return safeRank(graphNodeRank, candidateId) <= rank;
      },
    });
    const candidateTargets = pickNodeCandidates({
      graph: graphRef,
      graphNodeRank,
      preferredLaneId,
      targetRank: rank,
      filterFn: (candidateId) => {
        if (candidateId === nodeId) return false;
        if (!reachableSet.has(candidateId)) return false;
        return safeRank(graphNodeRank, candidateId) >= rank;
      },
    });
    pushIssue({
      id: `orphan_${nodeId}`,
      code: "orphan_node",
      severity: "warn",
      nodeId,
      title: "Orphan node (unreachable)",
      details: `Node ${nodeId} is unreachable from StartEvent traversal.`,
      suspiciousFlowIds: [
        ...toArray(nodesById[nodeId]?.incoming),
        ...toArray(nodesById[nodeId]?.outgoing),
      ],
      repairHints: [
        {
          action: "connect_source",
          note: "Connect one reachable upstream node to this orphan node.",
          candidateSources,
        },
        {
          action: "connect_target",
          note: "Connect orphan node to a downstream reachable node or EndEvent.",
          candidateTargets,
        },
      ],
    });
  });

  nodeIds.forEach((nodeId) => {
    const node = nodesById[nodeId];
    const outCount = toArray(outgoingByNode[nodeId]).length;
    if (outCount > 0) return;
    if (isEndLike(node?.type)) return;
    const rank = safeRank(graphNodeRank, nodeId);
    const candidateTargets = pickNodeCandidates({
      graph: graphRef,
      graphNodeRank,
      preferredLaneId: toText(node?.laneId),
      targetRank: rank,
      filterFn: (candidateId, candidateNode) => {
        if (candidateId === nodeId) return false;
        return isEndLike(candidateNode?.type) || safeRank(graphNodeRank, candidateId) > rank;
      },
    });
    pushIssue({
      id: `dead_end_${nodeId}`,
      code: "dead_end_non_end",
      severity: "warn",
      nodeId,
      title: "Dead-end node (non EndEvent)",
      details: `Node ${nodeId} has 0 outgoing flows but is not EndEvent.`,
      suspiciousFlowIds: toArray(nodesById[nodeId]?.incoming),
      repairHints: [
        {
          action: "attach_outgoing",
          note: "Add an outgoing sequenceFlow to EndEvent or next process step.",
          candidateTargets,
        },
      ],
    });
  });

  const gatewayById = asObject(graphRef?.gatewayById);
  Object.keys(gatewayById).forEach((gatewayId) => {
    const gateway = gatewayById[gatewayId];
    if (!gateway?.isSplit) return;
    const mode = toText(gateway?.mode).toLowerCase();
    const splitFlows = toArray(gateway?.splitBranches).map((branch) => toText(branch?.flowId)).filter(Boolean);
    const joinNodeId = toText(gateway?.joinNodeId);
    if (!joinNodeId) {
      const rank = safeRank(graphNodeRank, gatewayId);
      const joinCandidates = Object.keys(gatewayById)
        .filter((candidateId) => {
          if (candidateId === gatewayId) return false;
          const candidate = gatewayById[candidateId];
          if (!candidate?.isJoin) return false;
          if (toText(candidate?.mode).toLowerCase() !== mode) return false;
          return safeRank(graphNodeRank, candidateId) > rank;
        })
        .sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b))
        .slice(0, 3)
        .map((candidateId) => ({
          nodeId: candidateId,
          nodeName: toText(nodesById[candidateId]?.name) || candidateId,
          nodeType: toText(nodesById[candidateId]?.type),
          laneId: toText(nodesById[candidateId]?.laneId),
          rank: safeRank(graphNodeRank, candidateId),
        }));

      pushIssue({
        id: `gateway_missing_join_${gatewayId}`,
        code: mode === "parallel" ? "parallel_split_missing_join" : "gateway_split_missing_join",
        severity: "warn",
        nodeId: gatewayId,
        title: mode === "parallel" ? "Parallel split without join" : "Gateway split without join",
        details: `Gateway ${gatewayId} has split branches without detected join.`,
        suspiciousFlowIds: splitFlows,
        repairHints: [
          {
            action: "attach_join",
            note: "Connect all branch tails to a join gateway of matching type.",
            candidateTargets: joinCandidates,
          },
        ],
      });
      return;
    }

    if (mode === "parallel") {
      const missingBranchTargets = toArray(gateway?.splitBranches)
        .filter((branch) => {
          const targetId = toText(branch?.targetId);
          if (!targetId) return false;
          return !canReachTarget(targetId, joinNodeId, outgoingByNode);
        })
        .map((branch) => ({
          flowId: toText(branch?.flowId),
          targetId: toText(branch?.targetId),
        }))
        .filter((item) => item.flowId || item.targetId);

      if (missingBranchTargets.length) {
        pushIssue({
          id: `parallel_branch_no_join_${gatewayId}`,
          code: "parallel_branch_not_joined",
          severity: "warn",
          nodeId: gatewayId,
          title: "Parallel branch does not reach join",
          details: `At least one parallel branch from ${gatewayId} does not reach join ${joinNodeId}.`,
          suspiciousFlowIds: missingBranchTargets.map((item) => item.flowId),
          repairHints: [
            {
              action: "reconnect_parallel_branch",
              note: `Reconnect missing branch tail to join ${joinNodeId}.`,
              candidateTargets: [{
                nodeId: joinNodeId,
                nodeName: toText(nodesById[joinNodeId]?.name) || joinNodeId,
                nodeType: toText(nodesById[joinNodeId]?.type),
              }],
            },
          ],
        });
      }
    }
  });

  const reachableToEndSet = buildReachableToEndSet(graphRef);
  const scc = tarjanScc(graphRef);
  scc.forEach((component, idx) => {
    const members = toArray(component).map((id) => toText(id)).filter(Boolean);
    if (!members.length) return;
    const memberSet = new Set(members);
    const hasSelfLoop = members.some((nodeId) =>
      toArray(outgoingByNode[nodeId]).some((flow) => toText(flow?.targetId) === nodeId));
    if (members.length < 2 && !hasSelfLoop) return;

    const canReachEnd = members.some((nodeId) => reachableToEndSet.has(nodeId));
    if (canReachEnd) return;

    const suspiciousFlowIds = [];
    members.forEach((nodeId) => {
      toArray(outgoingByNode[nodeId]).forEach((flow) => {
        const targetId = toText(flow?.targetId);
        if (!targetId || !memberSet.has(targetId)) return;
        const flowId = toText(flow?.id);
        if (flowId) suspiciousFlowIds.push(flowId);
      });
    });
    const candidateTargets = pickNodeCandidates({
      graph: graphRef,
      graphNodeRank,
      preferredLaneId: "",
      targetRank: members.reduce((acc, nodeId) => Math.min(acc, safeRank(graphNodeRank, nodeId)), Number.MAX_SAFE_INTEGER),
      filterFn: (candidateId, candidateNode) => !memberSet.has(candidateId) && isEndLike(candidateNode?.type),
    });

    pushIssue({
      id: `cycle_no_stop_${idx + 1}`,
      code: "cycle_without_stop_condition",
      severity: "warn",
      nodeId: members[0],
      title: "Cycle without explicit stop path",
      details: `Cycle component (${members.join(", ")}) has no path to EndEvent.`,
      suspiciousFlowIds,
      repairHints: [
        {
          action: "add_cycle_exit",
          note: "Add conditional exit flow from cycle to EndEvent or downstream terminal path.",
          candidateTargets,
        },
      ],
    });
  });

  const summary = {
    total: issues.length,
    warn: issues.filter((item) => toText(item?.severity) === "warn").length,
    error: issues.filter((item) => toText(item?.severity) === "error").length,
    orphan: issues.filter((item) => toText(item?.code) === "orphan_node").length,
    deadEnd: issues.filter((item) => toText(item?.code) === "dead_end_non_end").length,
    gatewayMissingJoin: issues.filter((item) => toText(item?.code).includes("missing_join")).length,
    parallelJoin: issues.filter((item) => toText(item?.code).includes("parallel")).length,
    cycleNoStop: issues.filter((item) => toText(item?.code) === "cycle_without_stop_condition").length,
  };

  return {
    summary,
    issues,
  };
}

