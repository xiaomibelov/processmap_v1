import { toArray, toText, buildTimelineBetweenBranchesItem } from "../utils.js";
import {
  buildNodeTimeModelByNodeId,
  formatTimeModelLabel,
  summarizeTimeModels,
  summarizeBranchNodesTime,
  summarizeBranchesTime,
} from "../../../../features/process/lib/timeModel.js";

const TERMINAL_KINDS = new Set(["endevent", "terminateeventdefinition"]);

function safeRank(rankByNodeId, nodeIdRaw) {
  const rank = Number(rankByNodeId?.[toText(nodeIdRaw)]);
  return Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER;
}

function normalizeBranchLabel(raw, index = 0) {
  const txt = toText(raw);
  if (!txt) return index === 0 ? "Да" : (index === 1 ? "Нет" : `Ветка ${index + 1}`);
  const low = txt.toLowerCase();
  if (low === "да" || low.startsWith("да ")) return "Да";
  if (low === "нет" || low.startsWith("нет ")) return "Нет";
  return txt;
}

function normalizeFlowTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function primaryReasonLabel(reasonCode) {
  const code = toText(reasonCode).toLowerCase();
  if (code === "tier_p0") return "Primary: P0";
  if (code === "tier_p1") return "Primary: P1";
  if (code === "default_flow") return "Primary: default";
  if (code === "shortest_path") return "Primary: heuristic";
  if (code === "parallel_join") return "Primary: parallel join";
  if (code === "single_outgoing") return "Primary: single outgoing";
  return "Primary: heuristic";
}

function nonPrimaryReasonLabel(primaryReasonCode) {
  const code = toText(primaryReasonCode).toLowerCase();
  if (code === "tier_p0") return "P0 already set";
  if (code === "tier_p1") return "P1 already set";
  if (code === "default_flow") return "Default flow chosen";
  if (code === "shortest_path") return "Heuristic chosen";
  if (code === "parallel_join") return "Parallel join continuation";
  if (code === "single_outgoing") return "Primary branch selected";
  return "Primary branch selected";
}

function nodeKindFor(nodeId, rowByNodeId, nodeMetaById, graphRef) {
  return toText(
    rowByNodeId?.[nodeId]?.node_bind_kind
      || rowByNodeId?.[nodeId]?.node_kind
      || nodeMetaById?.[nodeId]?.kind
      || graphRef?.nodesById?.[nodeId]?.type,
  ).toLowerCase();
}

function branchNodesToSummary(nodesRaw) {
  const summary = {
    continuesToNodeId: "",
    continuesToGraphNo: "",
    continuesToTitle: "",
    loopTargetNodeId: "",
    loopTargetGraphNo: "",
    loopTargetTitle: "",
    previewSteps: [],
  };

  function visit(list) {
    toArray(list).forEach((node) => {
      const kind = toText(node?.kind).toLowerCase();
      if (kind === "step") {
        summary.previewSteps.push({
          nodeId: toText(node?.nodeId),
          graphNo: toText(node?.graphNo),
          title: toText(node?.title),
          lane: toText(node?.lane),
          kind: toText(node?.nodeKind),
        });
      }
      if (!summary.continuesToNodeId && kind === "continue") {
        summary.continuesToNodeId = toText(node?.targetNodeId);
        summary.continuesToGraphNo = toText(node?.targetGraphNo);
        summary.continuesToTitle = toText(node?.targetTitle) || summary.continuesToNodeId;
      }
      if (!summary.loopTargetNodeId && kind === "loop") {
        summary.loopTargetNodeId = toText(node?.targetNodeId);
        summary.loopTargetGraphNo = toText(node?.targetGraphNo);
        summary.loopTargetTitle = toText(node?.targetTitle) || summary.loopTargetNodeId;
      }
      if (kind === "decision" || kind === "parallel") {
        toArray(node?.branches).forEach((branch) => visit(branch?.children));
      }
    });
  }
  visit(nodesRaw);
  return summary;
}

function sanitizeBranchNodes(nodesRaw, nextMainlineNodeId) {
  const allowed = new Set([toText(nextMainlineNodeId)].filter(Boolean));
  return sanitizeBranchNodesWithAllowed(nodesRaw, allowed);
}

function sanitizeBranchNodesWithAllowed(nodesRaw, allowedContinueNodeIds) {
  const allowed = allowedContinueNodeIds instanceof Set
    ? allowedContinueNodeIds
    : new Set(toArray(allowedContinueNodeIds).map((id) => toText(id)).filter(Boolean));
  return toArray(nodesRaw)
    .map((node) => {
      const kind = toText(node?.kind).toLowerCase();
      if (kind === "continue") {
        const targetNodeId = toText(node?.targetNodeId);
        if (!targetNodeId || !allowed.has(targetNodeId)) return null;
        return node;
      }
      if (kind === "decision" || kind === "parallel") {
        const branches = toArray(node?.branches).map((branch, idx) => ({
          key: toText(branch?.key) || String.fromCharCode(65 + idx),
          label: toText(branch?.label) || `Ветка ${idx + 1}`,
          children: sanitizeBranchNodesWithAllowed(branch?.children, allowed),
        }));
        return { ...node, branches };
      }
      return node;
    })
    .filter(Boolean);
}

function deriveBranchStopReason(nodesRaw, nextMainlineNodeId, joinNodeId) {
  const nextId = toText(nextMainlineNodeId);
  const joinId = toText(joinNodeId);
  const nodes = toArray(nodesRaw);
  if (!nodes.length) return joinId ? "join" : "unknown";

  function walk(list) {
    const items = toArray(list);
    for (let i = 0; i < items.length; i += 1) {
      const node = items[i];
      const kind = toText(node?.kind).toLowerCase();
      if (kind === "continue") {
        const target = toText(node?.targetNodeId);
        if (nextId && target === nextId) return "nextMainline";
        return "continue";
      }
      if (kind === "loop") return "loop";
      if (kind === "terminal") return "end";
      if (kind === "decision" || kind === "parallel") {
        const branches = toArray(node?.branches);
        for (let b = 0; b < branches.length; b += 1) {
          const nested = walk(branches[b]?.children);
          if (nested) return nested;
        }
      }
    }
    return "";
  }

  const walked = walk(nodes);
  if (walked) return walked;
  return joinId ? "join" : "unknown";
}

function shortestPathLengthToTargets(startNodeId, targetNodeIds, outgoingByNodeView, maxNodes = 240) {
  const startId = toText(startNodeId);
  const targets = new Set(toArray(targetNodeIds).map((id) => toText(id)).filter(Boolean));
  if (!startId || !targets.size) return Number.POSITIVE_INFINITY;
  if (targets.has(startId)) return 0;

  const visited = new Set();
  const queue = [{ nodeId: startId, dist: 0 }];
  while (queue.length && visited.size < maxNodes) {
    const current = queue.shift() || {};
    const nodeId = toText(current?.nodeId);
    const dist = Number(current?.dist || 0);
    if (!nodeId || visited.has(nodeId)) continue;
    if (targets.has(nodeId)) return dist;
    visited.add(nodeId);
    toArray(outgoingByNodeView?.[nodeId]).forEach((edge) => {
      const nextId = toText(edge?.toId);
      if (!nextId || visited.has(nextId)) return;
      queue.push({ nodeId: nextId, dist: dist + 1 });
    });
  }
  return Number.POSITIVE_INFINITY;
}

function pickStableOutgoingEdge(outgoing, sourceNodeIdSet, graphNodeRank) {
  const list = toArray(outgoing).filter((edge) => {
    const toNodeId = toText(edge?.toId);
    return !!toNodeId && sourceNodeIdSet.has(toNodeId);
  });
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => {
    const ar = safeRank(graphNodeRank, a?.toId);
    const br = safeRank(graphNodeRank, b?.toId);
    if (ar !== br) return ar - br;
    const af = toText(a?.edgeKey || a?.flowId || a?.id);
    const bf = toText(b?.edgeKey || b?.flowId || b?.id);
    return af.localeCompare(bf, "ru");
  });
  return sorted[0] || null;
}

function selectPrimaryGatewayBranch({
  gatewayInfo,
  splitBranches,
  outgoingEdges,
  nextMainlineNodeId,
  endNodeIds,
  outgoingByNodeView,
}) {
  const branches = toArray(splitBranches).filter((branch) => toText(branch?.targetId));
  if (!branches.length) return null;
  const edgeByFlowId = {};
  toArray(outgoingEdges).forEach((edge) => {
    const flowId = toText(edge?.edgeKey || edge?.flowId || edge?.id);
    if (!flowId || edgeByFlowId[flowId]) return;
    edgeByFlowId[flowId] = edge;
  });

  const p0Candidates = branches
    .filter((branch) => normalizeFlowTier(branch?.tier || (branch?.isHappy ? "P0" : "")) === "P0" && edgeByFlowId[toText(branch?.flowId)])
    .sort((a, b) => toText(a?.flowId).localeCompare(toText(b?.flowId), "ru"));
  if (p0Candidates.length) {
    const flowId = toText(p0Candidates[0]?.flowId);
    return {
      ...edgeByFlowId[flowId],
      reason: "tier_p0",
    };
  }

  const p1Candidates = branches
    .filter((branch) => normalizeFlowTier(branch?.tier) === "P1" && edgeByFlowId[toText(branch?.flowId)])
    .sort((a, b) => toText(a?.flowId).localeCompare(toText(b?.flowId), "ru"));
  if (p1Candidates.length) {
    const flowId = toText(p1Candidates[0]?.flowId);
    return {
      ...edgeByFlowId[flowId],
      reason: "tier_p1",
    };
  }

  const defaultFlowId = toText(gatewayInfo?.defaultFlowId);
  if (defaultFlowId && edgeByFlowId[defaultFlowId]) {
    return {
      ...edgeByFlowId[defaultFlowId],
      reason: "default_flow",
    };
  }

  const joinNodeId = toText(gatewayInfo?.joinNodeId);
  const endSet = new Set(toArray(endNodeIds).map((id) => toText(id)).filter(Boolean));
  const nextMainlineId = toText(nextMainlineNodeId);
  const ranked = branches.map((branch) => {
    const flowId = toText(branch?.flowId);
    const targetId = toText(branch?.targetId);
    const edge = edgeByFlowId[flowId] || null;
    const toJoin = joinNodeId
      ? shortestPathLengthToTargets(targetId, [joinNodeId], outgoingByNodeView)
      : Number.POSITIVE_INFINITY;
    const toEnd = endSet.size
      ? shortestPathLengthToTargets(targetId, Array.from(endSet), outgoingByNodeView)
      : Number.POSITIVE_INFINITY;
    const toNextMainline = nextMainlineId
      ? shortestPathLengthToTargets(targetId, [nextMainlineId], outgoingByNodeView)
      : Number.POSITIVE_INFINITY;
    let score = Number.POSITIVE_INFINITY;
    if (Number.isFinite(toJoin)) score = toJoin;
    else if (Number.isFinite(toEnd)) score = toEnd;
    else if (Number.isFinite(toNextMainline)) score = toNextMainline;
    return {
      branch,
      edge,
      score,
      toJoin,
      toEnd,
      toNextMainline,
      flowId,
    };
  });

  ranked.sort((a, b) => {
    const as = Number.isFinite(a.score) ? a.score : Number.MAX_SAFE_INTEGER;
    const bs = Number.isFinite(b.score) ? b.score : Number.MAX_SAFE_INTEGER;
    if (as !== bs) return as - bs;
    const af = toText(a.flowId || a.edge?.edgeKey || a.edge?.id || "");
    const bf = toText(b.flowId || b.edge?.edgeKey || b.edge?.id || "");
    return af.localeCompare(bf, "ru");
  });

  const picked = ranked[0] || null;
  if (!picked) return null;
  return {
    ...(picked.edge || {}),
    toId: toText(picked?.edge?.toId || picked?.branch?.targetId),
    edgeKey: toText(picked?.edge?.edgeKey || picked?.flowId),
    reason: "shortest_path",
  };
}

function computeNextMainline({
  nodeId,
  outgoingByNode,
  gatewayById,
  sourceNodeIdSet,
  graphNodeRank,
  nextMainlineNodeId,
  endNodeIds,
}) {
  const currentNodeId = toText(nodeId);
  if (!currentNodeId || !sourceNodeIdSet.has(currentNodeId)) return null;
  const outgoing = toArray(outgoingByNode?.[currentNodeId]).filter((edge) => {
    const toNodeId = toText(edge?.toId);
    return !!toNodeId && sourceNodeIdSet.has(toNodeId);
  });
  if (!outgoing.length) return null;
  if (outgoing.length === 1) {
    return {
      ...outgoing[0],
      reason: "single_outgoing",
    };
  }

  const gatewayInfo = gatewayById?.[currentNodeId];
  if (gatewayInfo?.isSplit) {
    const mode = toText(gatewayInfo?.mode).toLowerCase();
    const joinNodeId = toText(gatewayInfo?.joinNodeId);
    if (mode === "parallel" && joinNodeId && sourceNodeIdSet.has(joinNodeId)) {
      return {
        edgeKey: `join::${currentNodeId}::${joinNodeId}`,
        fromId: currentNodeId,
        toId: joinNodeId,
        when: "",
        isLoop: false,
        graphRank: safeRank(graphNodeRank, joinNodeId),
        reason: "parallel_join",
      };
    }
    const primary = selectPrimaryGatewayBranch({
      gatewayInfo,
      splitBranches: gatewayInfo?.splitBranches,
      outgoingEdges: outgoing,
      nextMainlineNodeId,
      endNodeIds,
      outgoingByNodeView: outgoingByNode,
    });
    if (primary) return primary;
  }

  return pickStableOutgoingEdge(outgoing, sourceNodeIdSet, graphNodeRank);
}

export function buildInterviewModel({
  timelineBaseView,
  graph,
  nodeMetaById,
  graphOrderLocked,
  graphNodeRank,
  annotationTextsByNode,
  stepsByNodeId,
  includeBetweenBranches = true,
  enableTimeModel = true,
}) {
  const graphRef = graph && typeof graph === "object" ? graph : {};
  const reachableNodeSet = new Set(toArray(graphRef?.reachableNodeIds).map((id) => toText(id)).filter(Boolean));

  const rows = toArray(timelineBaseView).map((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    const isDetached = !!nodeId && !reachableNodeSet.has(nodeId);
    return {
      ...step,
      anchor_node_id: nodeId,
      is_detached: isDetached,
    };
  });

  const sourceRows = graphOrderLocked ? rows.filter((row) => !row.is_detached) : rows;
  const sourceNodeIds = sourceRows
    .map((row) => toText(row?.node_bind_id || row?.node_id))
    .filter(Boolean);
  const sourceNodeIdSet = new Set(sourceNodeIds);

  const rowByNodeId = {};
  const rowsByNodeId = {};
  sourceRows.forEach((row) => {
    const nodeId = toText(row?.node_bind_id || row?.node_id);
    if (!nodeId) return;
    if (!rowsByNodeId[nodeId]) rowsByNodeId[nodeId] = [];
    rowsByNodeId[nodeId].push(row);
    if (rowByNodeId[nodeId]) return;
    rowByNodeId[nodeId] = row;
  });
  Object.keys(stepsByNodeId && typeof stepsByNodeId === "object" ? stepsByNodeId : {}).forEach((nodeIdRaw) => {
    const nodeId = toText(nodeIdRaw);
    if (!nodeId) return;
    const external = toArray(stepsByNodeId[nodeId]);
    if (!external.length) return;
    rowsByNodeId[nodeId] = [...external, ...toArray(rowsByNodeId[nodeId])];
  });

  const nodeIdsForTime = Object.keys(graphRef?.nodesById || {}).length
    ? Object.keys(graphRef?.nodesById || {})
    : sourceNodeIds;
  const nodeTimeByNodeId = enableTimeModel
    ? buildNodeTimeModelByNodeId({
      nodeIds: nodeIdsForTime,
      stepsByNodeId: rowsByNodeId,
      annotationTextsByNode,
    })
    : {};

  const outgoingByNodeView = {};
  Object.keys(graphRef?.outgoingByNode || {}).forEach((nodeIdRaw) => {
    const nodeId = toText(nodeIdRaw);
    if (!nodeId) return;
    const sourceRank = safeRank(graphNodeRank, nodeId);
    const outgoing = toArray(graphRef?.outgoingByNode?.[nodeId]).map((flow) => {
      const toId = toText(flow?.targetId);
      const meta = nodeMetaById?.[toId] || {};
      const toRank = safeRank(graphNodeRank, toId);
      return {
        edgeKey: toText(flow?.id) || `${nodeId}__${toId}`,
        fromId: nodeId,
        toId,
        toTitle: toText(meta?.title) || toId,
        toLane: toText(meta?.lane),
        toKind: toText(meta?.kind).toLowerCase(),
        when: toText(flow?.condition || flow?.name || ""),
        isLoop: toRank <= sourceRank,
        graphRank: toRank,
      };
    });
    if (!outgoing.length) return;
    outgoingByNodeView[nodeId] = outgoing.sort((a, b) => {
      const ar = Number.isFinite(Number(a?.graphRank)) ? Number(a.graphRank) : Number.MAX_SAFE_INTEGER;
      const br = Number.isFinite(Number(b?.graphRank)) ? Number(b.graphRank) : Number.MAX_SAFE_INTEGER;
      if (ar !== br) return ar - br;
      return String(a?.toTitle || a?.toId || "").localeCompare(String(b?.toTitle || b?.toId || ""), "ru");
    });
  });

  const outgoingByNode = {};
  Object.keys(outgoingByNodeView).forEach((nodeIdRaw) => {
    const nodeId = toText(nodeIdRaw);
    if (!nodeId || !sourceNodeIdSet.has(nodeId)) return;
    const outgoing = toArray(outgoingByNodeView[nodeId]).filter((edge) => sourceNodeIdSet.has(toText(edge?.toId)));
    if (!outgoing.length) return;
    outgoingByNode[nodeId] = outgoing;
  });

  const indegreeByNode = {};
  sourceNodeIds.forEach((nodeId) => {
    indegreeByNode[nodeId] = 0;
  });
  Object.keys(outgoingByNode).forEach((fromNodeId) => {
    toArray(outgoingByNode[fromNodeId]).forEach((edge) => {
      const toNodeId = toText(edge?.toId);
      if (!toNodeId || !Object.prototype.hasOwnProperty.call(indegreeByNode, toNodeId)) return;
      indegreeByNode[toNodeId] = Number(indegreeByNode[toNodeId] || 0) + 1;
    });
  });

  const startCandidates = sourceRows
    .filter((row) => {
      const kind = toText(row?.node_bind_kind || row?.node_kind).toLowerCase();
      const parentSub = toText(row?.parent_subprocess_id);
      return kind === "startevent" && !parentSub;
    })
    .map((row) => toText(row?.node_bind_id || row?.node_id))
    .filter(Boolean)
    .sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));

  const indegreeRoots = sourceNodeIds
    .filter((nodeId) => Number(indegreeByNode[nodeId] || 0) === 0)
    .sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));

  const mainlineStartNodeId = startCandidates[0] || indegreeRoots[0] || sourceNodeIds[0] || "";
  const strictMainlineNodeIds = [];
  const mainlineVisited = new Set();
  const mainlineWarnings = [];
  let mainlineLoopMarker = null;
  let cursor = mainlineStartNodeId;
  const maxMainlineDepth = Math.max(48, sourceNodeIds.length * 2 + 4);
  for (let depth = 0; depth < maxMainlineDepth; depth += 1) {
    const nodeId = toText(cursor);
    if (!nodeId || mainlineVisited.has(nodeId) || !sourceNodeIdSet.has(nodeId)) break;
    strictMainlineNodeIds.push(nodeId);
    mainlineVisited.add(nodeId);
    const nextEdge = computeNextMainline({
      nodeId,
      outgoingByNode,
      gatewayById: graphRef?.gatewayById,
      sourceNodeIdSet,
      graphNodeRank,
      nextMainlineNodeId: "",
      endNodeIds: graphRef?.endNodeIds,
    });
    if (!nextEdge) break;
    const nextNodeId = toText(nextEdge?.toId);
    if (!nextNodeId || !sourceNodeIdSet.has(nextNodeId)) break;
    if (mainlineVisited.has(nextNodeId)) {
      mainlineLoopMarker = {
        kind: "loop",
        fromNodeId: nodeId,
        targetNodeId: nextNodeId,
      };
      mainlineWarnings.push(`Mainline loop detected: ${nodeId} -> ${nextNodeId}`);
      break;
    }
    cursor = nextNodeId;
  }
  if (strictMainlineNodeIds.length >= maxMainlineDepth) {
    mainlineWarnings.push(`Mainline depth limit reached (${maxMainlineDepth}).`);
  }
  const mainlineNodeIds = strictMainlineNodeIds.length >= 3 ? strictMainlineNodeIds : sourceNodeIds;

  const graphNoByNodeId = {};
  mainlineNodeIds.forEach((nodeId, idx) => {
    graphNoByNodeId[nodeId] = String(idx + 1);
  });
  const resolvedMainlineLoopMarker = mainlineLoopMarker
    ? {
      ...mainlineLoopMarker,
      fromGraphNo: toText(graphNoByNodeId[toText(mainlineLoopMarker?.fromNodeId)]),
      targetGraphNo: toText(graphNoByNodeId[toText(mainlineLoopMarker?.targetNodeId)]),
      targetTitle: nodeTitle(toText(mainlineLoopMarker?.targetNodeId)),
    }
    : null;

  const mainlineIndexByNodeId = {};
  mainlineNodeIds.forEach((nodeId, idx) => {
    mainlineIndexByNodeId[nodeId] = idx;
  });

  function nodeTitle(nodeIdRaw) {
    const nodeId = toText(nodeIdRaw);
    return toText(
      rowByNodeId?.[nodeId]?.action
        || rowByNodeId?.[nodeId]?.node_bind_title
        || nodeMetaById?.[nodeId]?.title
        || graphRef?.nodesById?.[nodeId]?.name
        || nodeId,
    );
  }

  function nodeLane(nodeIdRaw) {
    const nodeId = toText(nodeIdRaw);
    return toText(
      rowByNodeId?.[nodeId]?.lane_name
        || nodeMetaById?.[nodeId]?.lane
        || "",
    );
  }

  function makeContinueNode(targetNodeId) {
    const nodeId = toText(targetNodeId);
    return {
      kind: "continue",
      targetNodeId: nodeId,
      targetGraphNo: toText(graphNoByNodeId[nodeId]),
      targetTitle: nodeTitle(nodeId),
    };
  }

  function makeLoopNode(targetNodeId) {
    const nodeId = toText(targetNodeId);
    return {
      kind: "loop",
      targetNodeId: nodeId,
      targetGraphNo: toText(graphNoByNodeId[nodeId]),
      targetTitle: nodeTitle(nodeId),
    };
  }

  function buildBranchNodeSequence({
    startNodeId,
    anchorGatewayId,
    anchorMainlineIndex,
    nextMainlineNodeId,
    joinNodeId,
    visitedPath,
    depth,
    maxDepth = 30,
  }) {
    const nodeId = toText(startNodeId);
    const anchorId = toText(anchorGatewayId);
    const joinId = toText(joinNodeId);
    const nextMainlineId = toText(nextMainlineNodeId);
    const visited = visitedPath instanceof Set ? visitedPath : new Set();
    if (!nodeId || depth >= maxDepth) return [];

    if (visited.has(nodeId)) return [makeLoopNode(nodeId)];
    if (joinId && nodeId === joinId) return [];

    const nodeMainlineIndex = Number(mainlineIndexByNodeId[nodeId]);
    if (Number.isFinite(nodeMainlineIndex)) {
      if (nodeMainlineIndex <= Number(anchorMainlineIndex)) return [makeLoopNode(nodeId)];
      return [makeContinueNode(nodeId)];
    }

    const kind = nodeKindFor(nodeId, rowByNodeId, nodeMetaById, graphRef);
    if (TERMINAL_KINDS.has(kind)) {
      return [{
        kind: "terminal",
        nodeId,
        graphNo: toText(graphNoByNodeId[nodeId]),
        title: nodeTitle(nodeId),
        lane: nodeLane(nodeId),
        nodeKind: kind,
      }];
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);

    const gatewayInfo = graphRef?.gatewayById?.[nodeId];
    const gatewayMode = toText(gatewayInfo?.mode).toLowerCase();
    if (gatewayInfo?.isSplit && gatewayInfo?.splitBranches?.length > 1) {
      const nestedBranches = toArray(gatewayInfo?.splitBranches).map((branch, idx) => ({
        key: String.fromCharCode(65 + (idx % 26)),
        label: normalizeBranchLabel(branch?.condition || branch?.name, idx),
        children: buildBranchNodeSequence({
          startNodeId: branch?.targetId,
          anchorGatewayId: anchorId,
          anchorMainlineIndex,
          nextMainlineNodeId: nextMainlineId,
          joinNodeId: joinId,
          visitedPath: new Set(nextVisited),
          depth: depth + 1,
          maxDepth,
        }),
      }));
      return [{
        kind: gatewayMode === "parallel" ? "parallel" : "decision",
        nodeId,
        graphNo: toText(graphNoByNodeId[nodeId]),
        title: nodeTitle(nodeId),
        lane: nodeLane(nodeId),
        nodeKind: kind,
        branches: nestedBranches,
      }];
    }

    const currentNode = {
      kind: "step",
      nodeId,
      graphNo: toText(graphNoByNodeId[nodeId]),
      title: nodeTitle(nodeId),
      lane: nodeLane(nodeId),
      nodeKind: kind,
      time: nodeTimeByNodeId[nodeId] || null,
    };

    const outgoingEdges = toArray(outgoingByNodeView?.[nodeId]);
    if (!outgoingEdges.length) return [currentNode];

    let nextEdge = null;
    if (nextMainlineId) {
      nextEdge = outgoingEdges.find((edge) => toText(edge?.toId) === nextMainlineId) || null;
    }
    if (!nextEdge) {
      nextEdge = outgoingEdges.find((edge) => {
        const toId = toText(edge?.toId);
        if (!toId) return false;
        if (visited.has(toId)) return false;
        const toMainlineIdx = Number(mainlineIndexByNodeId[toId]);
        if (Number.isFinite(toMainlineIdx) && toMainlineIdx <= Number(anchorMainlineIndex)) return false;
        return true;
      }) || null;
    }
    if (!nextEdge) nextEdge = outgoingEdges[0] || null;
    if (!nextEdge) return [currentNode];

    const tailNodes = buildBranchNodeSequence({
      startNodeId: nextEdge?.toId,
      anchorGatewayId: anchorId,
      anchorMainlineIndex,
      nextMainlineNodeId: nextMainlineId,
      joinNodeId: joinId,
      visitedPath: nextVisited,
      depth: depth + 1,
      maxDepth,
    });
    return [currentNode, ...tailNodes];
  }

  function buildSplitBranchPreviews(gatewayNodeIdRaw) {
    const gatewayNodeId = toText(gatewayNodeIdRaw);
    const gatewayInfo = graphRef?.gatewayById?.[gatewayNodeId];
    if (!gatewayInfo?.isSplit) return [];
    const splitBranches = toArray(gatewayInfo?.splitBranches).filter((branch) => toText(branch?.targetId));
    if (splitBranches.length < 2) return [];

    const gatewayMainlineIndex = Number(mainlineIndexByNodeId[gatewayNodeId]);
    const nextMainlineNodeId = Number.isFinite(gatewayMainlineIndex)
      ? toText(mainlineNodeIds[gatewayMainlineIndex + 1])
      : "";
    const joinNodeId = toText(gatewayInfo?.joinNodeId);
    const allowedContinueNodeIds = Number.isFinite(gatewayMainlineIndex)
      ? mainlineNodeIds.slice(gatewayMainlineIndex + 1).map((id) => toText(id)).filter(Boolean)
      : [];
    const allowedContinueSet = new Set(allowedContinueNodeIds);
    const primaryEdge = selectPrimaryGatewayBranch({
      gatewayInfo,
      splitBranches,
      outgoingEdges: outgoingByNodeView[gatewayNodeId],
      nextMainlineNodeId,
      endNodeIds: graphRef?.endNodeIds,
      outgoingByNodeView,
    });
    const primaryFlowId = toText(primaryEdge?.edgeKey || primaryEdge?.flowId);
    const primaryReasonCode = toText(primaryEdge?.reason || "shortest_path").toLowerCase() || "shortest_path";
    const primaryReasonText = primaryReasonLabel(primaryReasonCode);
    const fallbackPrimaryFlowId = toText(splitBranches[0]?.flowId);

    return splitBranches.map((branch, idx) => {
      const label = normalizeBranchLabel(branch?.condition || branch?.name, idx);
      const branchFlowId = toText(branch?.flowId);
      const targetPrimaryFlowId = primaryFlowId || fallbackPrimaryFlowId;
      const isPrimary = !!targetPrimaryFlowId && branchFlowId === targetPrimaryFlowId;
      const nodes = buildBranchNodeSequence({
        startNodeId: branch?.targetId,
        anchorGatewayId: gatewayNodeId,
        anchorMainlineIndex: Number.isFinite(gatewayMainlineIndex) ? gatewayMainlineIndex : -1,
        nextMainlineNodeId,
        joinNodeId,
        visitedPath: new Set([gatewayNodeId]),
        depth: 0,
      });
      const sanitizedNodes = sanitizeBranchNodesWithAllowed(nodes, allowedContinueSet);
      const summary = branchNodesToSummary(sanitizedNodes);
      const timeSummary = enableTimeModel ? summarizeBranchNodesTime(sanitizedNodes, nodeTimeByNodeId) : null;
      const stopReason = deriveBranchStopReason(sanitizedNodes, nextMainlineNodeId, joinNodeId) || "unknown";
      return {
        id: `${gatewayNodeId}_branch_${idx + 1}`,
        key: String.fromCharCode(65 + (idx % 26)),
        label,
        condition: toText(branch?.condition || branch?.name),
        flowId: toText(branch?.flowId),
        tier: normalizeFlowTier(branch?.tier || (branch?.isHappy ? "P0" : "")),
        isHappy: !!branch?.isHappy,
        firstNodeId: toText(branch?.targetId),
        isPrimary,
        primaryReasonCode: isPrimary ? primaryReasonCode : "",
        primaryReasonLabel: isPrimary ? primaryReasonText : "",
        nonPrimaryReasonCode: isPrimary ? "" : `not_primary_${primaryReasonCode}`,
        nonPrimaryReasonLabel: isPrimary ? "" : nonPrimaryReasonLabel(primaryReasonCode),
        edgeKey: toText(branch?.flowId),
        stopReason,
        nodes: sanitizedNodes,
        continuesToMainline: !!toText(summary?.continuesToNodeId) && allowedContinueSet.has(toText(summary?.continuesToNodeId)),
        continuesToNextMainline: !!nextMainlineNodeId && summary.continuesToNodeId === nextMainlineNodeId,
        continuesToNodeId: toText(summary?.continuesToNodeId),
        continuesToGraphNo: toText(summary?.continuesToGraphNo),
        continuesToTitle: toText(summary?.continuesToTitle),
        loop: !!summary?.loopTargetNodeId,
        loopTargetNodeId: toText(summary?.loopTargetNodeId),
        loopTargetGraphNo: toText(summary?.loopTargetGraphNo),
        loopTargetTitle: toText(summary?.loopTargetTitle),
        previewSteps: toArray(summary?.previewSteps),
        time_summary: timeSummary,
        allowedContinueNodeIds,
      };
    });
  }

  const timelineRows = [];
  const mainlineTimeSummary = enableTimeModel
    ? summarizeTimeModels(mainlineNodeIds.map((nodeId) => nodeTimeByNodeId[nodeId]).filter(Boolean))
    : null;
  let cumulativeMainlineSec = 0;
  let cumulativeUnknown = false;
  sourceRows.forEach((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    const kind = nodeKindFor(nodeId, rowByNodeId, nodeMetaById, graphRef);
    const stepTimeModel = enableTimeModel ? (nodeTimeByNodeId[nodeId] || null) : null;
    const stepExpectedSec = Number(stepTimeModel?.expected_sec || stepTimeModel?.duration_sec || 0);
    if (stepExpectedSec > 0) cumulativeMainlineSec += stepExpectedSec;
    else cumulativeUnknown = true;
    const cumulativeLabel = enableTimeModel && cumulativeMainlineSec > 0
      ? `${formatTimeModelLabel({ time_kind: "fixed", expected_sec: cumulativeMainlineSec, min_sec: cumulativeMainlineSec, max_sec: cumulativeMainlineSec })}${cumulativeUnknown ? " + ?" : ""}`
      : "—";
    const gatewayInfo = graphRef?.gatewayById?.[nodeId];
    if (!(gatewayInfo?.isSplit && gatewayInfo?.splitBranches?.length > 1)) {
      timelineRows.push({
        ...step,
        step_time_model: stepTimeModel,
        step_time_label: enableTimeModel ? formatTimeModelLabel(stepTimeModel) : "—",
        step_time_sec: stepExpectedSec > 0 ? Math.round(stepExpectedSec) : null,
        mainline_time_cumulative_sec: enableTimeModel && cumulativeMainlineSec > 0 ? Math.round(cumulativeMainlineSec) : null,
        mainline_time_cumulative_label: cumulativeLabel,
        mainline_time_total_sec: enableTimeModel && Number(mainlineTimeSummary?.expected_sec) > 0 ? Number(mainlineTimeSummary.expected_sec) : null,
        mainline_time_total_label: enableTimeModel ? (toText(mainlineTimeSummary?.label) || "—") : "—",
      });
      return;
    }

    const gatewayMode = toText(gatewayInfo?.mode).toLowerCase();
    const gatewayBranches = toArray(gatewayInfo?.splitBranches).map((branch, idx) => ({
      id: `${nodeId || step.id || "step"}_branch_${idx + 1}`,
      key: String.fromCharCode(65 + (idx % 26)),
      label: normalizeBranchLabel(branch?.condition || branch?.name, idx),
      tier: normalizeFlowTier(branch?.tier || (branch?.isHappy ? "P0" : "")),
      toTitle: nodeTitle(branch?.targetId),
      toLane: nodeLane(branch?.targetId),
      toKind: nodeKindFor(branch?.targetId, rowByNodeId, nodeMetaById, graphRef),
      isLoop: false,
    }));
    const branchPreviews = buildSplitBranchPreviews(nodeId);
    const branchTimeSummary = enableTimeModel ? summarizeBranchesTime(
      branchPreviews.map((branch) => ({
        key: branch?.key,
        label: branch?.label,
        isPrimary: branch?.isPrimary,
        children: branch?.nodes,
      })),
      nodeTimeByNodeId,
    ) : null;
    timelineRows.push({
      ...step,
      step_time_model: stepTimeModel,
      step_time_label: enableTimeModel ? formatTimeModelLabel(stepTimeModel) : "—",
      step_time_sec: stepExpectedSec > 0 ? Math.round(stepExpectedSec) : null,
      mainline_time_cumulative_sec: enableTimeModel && cumulativeMainlineSec > 0 ? Math.round(cumulativeMainlineSec) : null,
      mainline_time_cumulative_label: cumulativeLabel,
      mainline_time_total_sec: enableTimeModel && Number(mainlineTimeSummary?.expected_sec) > 0 ? Number(mainlineTimeSummary.expected_sec) : null,
      mainline_time_total_label: enableTimeModel ? (toText(mainlineTimeSummary?.label) || "—") : "—",
      node_bind_kind: kind || step?.node_bind_kind,
      gateway_mode: gatewayMode === "parallel" ? "parallel" : "decision",
      gateway_branches: gatewayBranches,
      gateway_branch_previews: branchPreviews,
      gateway_time_summary: branchTimeSummary,
      has_loop_branch: branchPreviews.some((branch) => !!branch?.loop),
      is_parallel_structural: gatewayMode === "parallel",
      gateway_join_node_id: toText(gatewayInfo?.joinNodeId),
    });
  });

  const timelineView = timelineRows.map((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    const gatewayInfo = graphRef?.gatewayById?.[nodeId];
    if (!(gatewayInfo?.isSplit && gatewayInfo?.splitBranches?.length > 1)) return step;

    const mainlineIdx = Number(mainlineIndexByNodeId[nodeId]);
    if (!Number.isFinite(mainlineIdx)) return step;
    const nextMainlineNodeId = toText(mainlineNodeIds[mainlineIdx + 1]);
    if (!nextMainlineNodeId) return step;
    const nextMainlineStep = sourceRows.find((row) => toText(row?.node_bind_id || row?.node_id) === nextMainlineNodeId);
    if (!nextMainlineStep) return step;
    if (!includeBetweenBranches) return step;
    const betweenBranchesItem = buildTimelineBetweenBranchesItem({
      anchorStep: step,
      nextMainlineStep,
      branchPreviews: step?.gateway_branch_previews,
      allowedContinueNodeIds: Number.isFinite(mainlineIdx)
        ? mainlineNodeIds.slice(mainlineIdx + 1).map((id) => toText(id)).filter(Boolean)
        : [],
    });
    if (!betweenBranchesItem) return step;
    const branchByKey = {};
    toArray(step?.gateway_branch_previews).forEach((branch) => {
      const key = toText(branch?.key);
      if (!key) return;
      branchByKey[key] = branch;
    });
    const betweenBranches = toArray(betweenBranchesItem?.branches).map((branch, idx) => {
      const key = toText(branch?.key) || String.fromCharCode(65 + idx);
      const source = branchByKey[key] || {};
      const fallbackSummary = enableTimeModel ? summarizeBranchNodesTime(branch?.children, nodeTimeByNodeId) : null;
      const timeSummary = source?.time_summary || fallbackSummary || null;
      return {
        ...branch,
        time_summary: timeSummary,
      };
    });
    const betweenTimeSummary = enableTimeModel ? summarizeBranchesTime(betweenBranches, nodeTimeByNodeId) : null;
    return {
      ...step,
      between_branches_item: {
        ...betweenBranchesItem,
        branches: betweenBranches,
        time_summary: betweenTimeSummary,
      },
    };
  });

  const canonicalNodes = [];
  timelineView.forEach((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    const seq = toText(step?.seq_label || step?.seq);
    const title = toText(step?.action) || toText(step?.node_bind_title) || nodeId;
    const lane = toText(step?.lane_name);
    const kind = nodeKindFor(nodeId, rowByNodeId, nodeMetaById, graphRef);
    const between = step?.between_branches_item;
    if (between?.kind === "between_branches") {
      const blockKind = toText(step?.gateway_mode).toLowerCase() === "parallel" ? "parallel" : "decision";
      canonicalNodes.push({
        kind: blockKind,
        id: `${blockKind}_${nodeId || step.id}`,
        anchorNodeId: nodeId,
        graphNo: seq,
        branches: toArray(between?.branches).map((branch) => ({
          key: toText(branch?.key),
          label: toText(branch?.label),
          children: toArray(branch?.children),
        })),
        primaryBranchKey: toText(toArray(between?.branches).find((x) => !!x?.isPrimary)?.key),
      });
    }
    if (toText(step?.gateway_mode).toLowerCase() === "parallel") {
      canonicalNodes.push({
        kind: "parallel",
        id: `parallel_${nodeId || step.id}`,
        anchorNodeId: nodeId,
        graphNo: seq,
        branches: toArray(step?.gateway_branch_previews).map((branch, idx) => ({
          key: toText(branch?.key) || String.fromCharCode(65 + idx),
          label: toText(branch?.label),
          children: toArray(branch?.nodes),
        })),
      });
      return;
    }
    if (step?.isSubprocessContainer || step?.is_subprocess_container) {
      canonicalNodes.push({
        kind: "subprocess",
        id: `sub_${nodeId || step.id}`,
        bpmnId: nodeId,
        title,
        graphNo: seq,
        collapsed: false,
        children: [],
      });
      return;
    }
    canonicalNodes.push({
      kind: "step",
      id: toText(step?.id),
      bpmnId: nodeId,
      title,
      graphNo: seq,
      lane,
      nodeKind: kind,
      time: enableTimeModel ? (nodeTimeByNodeId[nodeId] || null) : null,
    });
  });
  if (resolvedMainlineLoopMarker?.targetNodeId) {
    canonicalNodes.push({
      kind: "loop",
      id: `mainline_loop_${toText(resolvedMainlineLoopMarker?.fromNodeId)}_${toText(resolvedMainlineLoopMarker?.targetNodeId)}`,
      targetNodeId: toText(resolvedMainlineLoopMarker?.targetNodeId),
      targetGraphNo: toText(resolvedMainlineLoopMarker?.targetGraphNo),
      targetTitle: toText(resolvedMainlineLoopMarker?.targetTitle),
      fromNodeId: toText(resolvedMainlineLoopMarker?.fromNodeId),
      fromGraphNo: toText(resolvedMainlineLoopMarker?.fromGraphNo),
    });
  }

  return {
    sourceRows,
    timelineView,
    mainlineNodeIds,
    graphNoByNodeId,
    canonicalNodes,
    nodeTimeByNodeId,
    mainlineTimeSummary: mainlineTimeSummary || summarizeTimeModels([]),
    warnings: mainlineWarnings,
    mainlineLoopMarker: resolvedMainlineLoopMarker,
  };
}
