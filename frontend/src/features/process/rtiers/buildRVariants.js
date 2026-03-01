function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeRtier(value) {
  const tier = toText(value).toUpperCase();
  if (tier === "R0" || tier === "R1" || tier === "R2") return tier;
  return "";
}

function normalizeFlowMetaMap(rawFlowMeta) {
  const src = asObject(rawFlowMeta);
  const out = {};
  Object.keys(src).forEach((rawFlowId) => {
    const flowId = toText(rawFlowId);
    if (!flowId) return;
    const row = asObject(src[rawFlowId]);
    const rtier = normalizeRtier(row?.rtier);
    if (!rtier) return;
    out[flowId] = {
      rtier,
      source: toText(row?.source).toLowerCase(),
      reason: toText(row?.reason),
    };
  });
  return out;
}

function isXorGateway(node) {
  const type = toText(node?.type).toLowerCase();
  return type === "exclusivegateway";
}

function sortedOutgoing(outgoingRaw = []) {
  return toArray(outgoingRaw)
    .map((flow) => ({
      ...flow,
      id: toText(flow?.id),
      sourceId: toText(flow?.sourceId),
      targetId: toText(flow?.targetId),
      condition: toText(flow?.condition || flow?.name),
    }))
    .filter((flow) => flow.id && flow.targetId)
    .sort((a, b) => toText(a?.id).localeCompare(toText(b?.id), "ru"));
}

function collectScopeFromStart(graph, startNodeId) {
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const visitedNodes = new Set();
  const visitedFlows = new Set();
  const startId = toText(startNodeId);
  if (!startId) return { nodeIds: visitedNodes, flowIds: visitedFlows };
  const queue = [startId];
  while (queue.length) {
    const nodeId = toText(queue.shift());
    if (!nodeId || visitedNodes.has(nodeId)) continue;
    visitedNodes.add(nodeId);
    sortedOutgoing(outgoingByNode[nodeId]).forEach((flow) => {
      visitedFlows.add(toText(flow?.id));
      const targetId = toText(flow?.targetId);
      if (targetId && !visitedNodes.has(targetId)) queue.push(targetId);
    });
  }
  return { nodeIds: visitedNodes, flowIds: visitedFlows };
}

function inferFallbackEndIds(graph, scopeNodeIds) {
  const nodesById = asObject(graph?.nodesById);
  const endNodeIds = toArray(graph?.endNodeIds)
    .map((nodeId) => toText(nodeId))
    .filter((nodeId) => nodeId && (!scopeNodeIds || scopeNodeIds.has(nodeId)));
  const failTokens = ["fail", "error", "escalat", "cancel", "abort", "stop", "ошиб", "неусп", "эскал", "стоп"];
  const successTokens = ["success", "done", "complete", "finish", "усп", "готов", "заверш"];
  const failCandidates = [];
  const successCandidates = [];
  endNodeIds.forEach((nodeId) => {
    const node = asObject(nodesById[nodeId]);
    const name = toText(node?.name || node?.title || nodeId).toLowerCase();
    const outcome = toText(node?.outcomeHint || "").toLowerCase();
    const isFail = failTokens.some((token) => name.includes(token) || outcome.includes(token));
    const isSuccess = successTokens.some((token) => name.includes(token) || outcome.includes(token));
    if (isFail && !isSuccess) failCandidates.push(nodeId);
    else successCandidates.push(nodeId);
  });
  const successEndId = successCandidates[0] || endNodeIds[0] || "";
  const failEndId = failCandidates[0] || endNodeIds.find((id) => id !== successEndId) || "";
  return { successEndId, failEndId };
}

function computeDistancesToTargetNodes(graph, scope, targetNodeIdsRaw) {
  const targets = new Set(
    toArray(targetNodeIdsRaw)
      .map((nodeId) => toText(nodeId))
      .filter((nodeId) => nodeId && scope.nodeIds.has(nodeId)),
  );
  if (!targets.size) return {};

  const flowById = asObject(graph?.flowsById);
  const incomingByNode = asObject(graph?.incomingByNode);
  const dist = {};
  const queue = [];
  targets.forEach((nodeId) => {
    dist[nodeId] = 0;
    queue.push(nodeId);
  });

  while (queue.length) {
    const nodeId = toText(queue.shift());
    const base = Number(dist[nodeId] || 0);
    toArray(incomingByNode[nodeId]).forEach((flowRaw) => {
      const flow = asObject(flowRaw);
      const flowId = toText(flow?.id);
      if (!flowId || !scope.flowIds.has(flowId)) return;
      const sourceId = toText(asObject(flowById[flowId]).sourceId || flow?.sourceId);
      if (!sourceId || !scope.nodeIds.has(sourceId)) return;
      const cand = base + 1;
      if (!Number.isFinite(dist[sourceId]) || cand < Number(dist[sourceId])) {
        dist[sourceId] = cand;
        queue.push(sourceId);
      }
    });
  }
  return dist;
}

function classifyGatewayOutgoing({
  graph,
  gatewayId,
  outgoing,
  flowMeta,
  distToSuccess,
  distToFail,
}) {
  const nodesById = asObject(graph?.nodesById);
  const defaultFlowId = toText(
    asObject(graph?.gatewayById)?.[gatewayId]?.defaultFlowId
      || asObject(nodesById[gatewayId])?.defaultFlowId,
  );
  const rows = outgoing.map((flow) => {
    const flowId = toText(flow?.id);
    const targetId = toText(flow?.targetId);
    const explicit = normalizeRtier(asObject(flowMeta[flowId])?.rtier || flow?.rtier);
    return {
      flowId,
      targetId,
      explicitRtier: explicit,
      canReachSuccess: Number.isFinite(distToSuccess?.[targetId]),
      distSuccess: Number.isFinite(distToSuccess?.[targetId]) ? Number(distToSuccess[targetId]) : null,
      canReachFail: Number.isFinite(distToFail?.[targetId]),
      distFail: Number.isFinite(distToFail?.[targetId]) ? Number(distToFail[targetId]) : null,
      isDefault: flowId === defaultFlowId,
    };
  });

  const out = {};
  rows.forEach((row) => {
    if (!row.explicitRtier) return;
    out[row.flowId] = {
      rtier: row.explicitRtier,
      source: "meta",
      reason: "flow_meta",
    };
  });
  const unresolved = rows.filter((row) => !out[row.flowId]);
  if (!unresolved.length) return out;

  const successRows = unresolved
    .filter((row) => row.canReachSuccess)
    .sort((a, b) => {
      const ad = Number.isFinite(a.distSuccess) ? Number(a.distSuccess) : Number.MAX_SAFE_INTEGER;
      const bd = Number.isFinite(b.distSuccess) ? Number(b.distSuccess) : Number.MAX_SAFE_INTEGER;
      if (ad !== bd) return ad - bd;
      const ao = a.isDefault ? 0 : 1;
      const bo = b.isDefault ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return toText(a.flowId).localeCompare(toText(b.flowId), "ru");
    });

  successRows.forEach((row, idx) => {
    out[row.flowId] = {
      rtier: idx === 0 ? "R0" : "R1",
      source: "inferred",
      reason: idx === 0 ? `distToSuccess=${row.distSuccess ?? "∞"}` : `altDistToSuccess=${row.distSuccess ?? "∞"}`,
    };
  });
  unresolved.forEach((row) => {
    if (out[row.flowId]) return;
    const reason = row.canReachFail
      ? `distToFail=${row.distFail ?? "∞"}, leadsToFail`
      : "noSuccessReachability";
    out[row.flowId] = {
      rtier: "R2",
      source: "inferred",
      reason,
    };
  });
  return out;
}

function chooseFlowForPolicy({
  key,
  gatewayId,
  outgoing,
  gatewayClassMap,
  defaultFlowId,
  state,
  forcedR2FlowId = "",
}) {
  const flowById = {};
  outgoing.forEach((flow) => {
    flowById[toText(flow?.id)] = flow;
  });
  const byTier = { R0: [], R1: [], R2: [] };
  outgoing.forEach((flow) => {
    const flowId = toText(flow?.id);
    const rtier = normalizeRtier(asObject(gatewayClassMap[flowId])?.rtier);
    if (rtier) byTier[rtier].push(flowId);
  });
  Object.keys(byTier).forEach((tier) => {
    byTier[tier].sort((a, b) => a.localeCompare(b, "ru"));
  });

  const chooseByIds = (ids) => {
    for (let i = 0; i < ids.length; i += 1) {
      const hit = flowById[toText(ids[i])];
      if (hit) return hit;
    }
    return null;
  };
  const pickFallback = () => {
    const byDefault = chooseByIds([defaultFlowId]);
    if (byDefault) return byDefault;
    return outgoing[0] || null;
  };
  const pickR0Policy = () => chooseByIds(byTier.R0) || chooseByIds(byTier.R1) || pickFallback();

  if (key === "R1") {
    if (!state.usedR1 && byTier.R1.length) {
      state.usedR1 = true;
      state.usedGatewayId = gatewayId;
      return chooseByIds(byTier.R1) || pickR0Policy();
    }
    return pickR0Policy();
  }
  if (key.startsWith("R2")) {
    if (!state.usedR2) {
      if (forcedR2FlowId) {
        const forced = flowById[forcedR2FlowId];
        if (forced) {
          state.usedR2 = true;
          state.usedGatewayId = gatewayId;
          return forced;
        }
      }
      if (byTier.R2.length) {
        state.usedR2 = true;
        state.usedGatewayId = gatewayId;
        return chooseByIds(byTier.R2) || pickR0Policy();
      }
    }
    return pickR0Policy();
  }
  return pickR0Policy();
}

function buildSingleVariant({
  key,
  graph,
  flowMeta,
  scopeStartId,
  successEndId,
  failEndId,
  maxLoopIters,
  gatewayClassByGatewayId,
  forcedR2GatewayId = "",
  forcedR2FlowId = "",
}) {
  const nodesById = asObject(graph?.nodesById);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const flowById = asObject(graph?.flowsById);
  const startNodeId = toText(scopeStartId);
  const safeMaxLoopIters = Math.max(0, Number(maxLoopIters || 0));
  const maxDepth = Math.max(20, Object.keys(nodesById).length * 3);

  const steps = [];
  const edges = [];
  const state = { usedR1: false, usedR2: false, usedGatewayId: "" };
  const visitCountByNode = {};

  let cursor = startNodeId;
  let depth = 0;
  let stopReason = "loop_cutoff";
  while (cursor && depth < maxDepth) {
    depth += 1;
    const nodeId = toText(cursor);
    const node = asObject(nodesById[nodeId]);
    const nextVisitCount = Number(visitCountByNode[nodeId] || 0) + 1;
    visitCountByNode[nodeId] = nextVisitCount;
    const isLoopVisit = nextVisitCount > 1;

    steps.push({
      nodeId,
      title: toText(node?.name || nodeId) || nodeId,
      lane: toText(node?.laneId),
      loop: isLoopVisit,
    });

    if ((key === "R0" || key === "R1") && nodeId && nodeId === toText(successEndId)) {
      stopReason = "success";
      break;
    }
    if (key.startsWith("R2") && nodeId && nodeId === toText(failEndId)) {
      stopReason = "escalation";
      break;
    }

    const outgoing = sortedOutgoing(outgoingByNode[nodeId]);
    if (!outgoing.length) {
      if ((key === "R0" || key === "R1") && nodeId === toText(successEndId)) stopReason = "success";
      else if (key.startsWith("R2") && nodeId === toText(failEndId)) stopReason = "escalation";
      else stopReason = "loop_cutoff";
      break;
    }

    const xor = isXorGateway(node) && outgoing.length > 1;
    const defaultFlowId = toText(asObject(graph?.gatewayById)?.[nodeId]?.defaultFlowId || node?.defaultFlowId);
    const gatewayClassMap = xor ? asObject(gatewayClassByGatewayId[nodeId]) : {};
    const picked = xor
      ? chooseFlowForPolicy({
          key,
          gatewayId: nodeId,
          outgoing,
          gatewayClassMap,
          defaultFlowId,
          state,
          forcedR2FlowId: nodeId === toText(forcedR2GatewayId) ? toText(forcedR2FlowId) : "",
        })
      : outgoing[0];
    if (!picked) {
      stopReason = "loop_cutoff";
      break;
    }

    const flowId = toText(picked?.id);
    const flow = asObject(flowById[flowId] || picked);
    const targetId = toText(flow?.targetId || picked?.targetId);
    const resolvedRtier = normalizeRtier(
      asObject(flowMeta[flowId])?.rtier
        || asObject(gatewayClassMap[flowId])?.rtier
        || flow?.rtier,
    );
    edges.push({
      flowId,
      from: toText(flow?.sourceId || nodeId),
      to: targetId,
      label: toText(flow?.condition || flow?.name),
      rtier: resolvedRtier || "",
    });
    if (!targetId) {
      stopReason = "loop_cutoff";
      break;
    }
    if (Number(visitCountByNode[targetId] || 0) > safeMaxLoopIters) {
      const targetNode = asObject(nodesById[targetId]);
      steps.push({
        nodeId: targetId,
        title: toText(targetNode?.name || targetId) || targetId,
        lane: toText(targetNode?.laneId),
        loop: true,
      });
      stopReason = "loop_cutoff";
      break;
    }
    cursor = targetId;
  }

  return {
    key,
    stopReason,
    steps,
    edges,
  };
}

function findFirstR2Candidates({
  graph,
  scopeStartId,
  gatewayClassByGatewayId,
}) {
  const nodesById = asObject(graph?.nodesById);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const visited = new Set();
  let cursor = toText(scopeStartId);
  let depth = 0;
  const maxDepth = Math.max(20, Object.keys(nodesById).length * 3);
  while (cursor && depth < maxDepth) {
    depth += 1;
    if (visited.has(cursor)) return null;
    visited.add(cursor);
    const node = asObject(nodesById[cursor]);
    const outgoing = sortedOutgoing(outgoingByNode[cursor]);
    if (!outgoing.length) return null;
    if (isXorGateway(node) && outgoing.length > 1) {
      const classMap = asObject(gatewayClassByGatewayId[cursor]);
      const r2FlowIds = outgoing
        .map((flow) => toText(flow?.id))
        .filter((flowId) => normalizeRtier(asObject(classMap[flowId])?.rtier) === "R2")
        .sort((a, b) => a.localeCompare(b, "ru"));
      if (r2FlowIds.length) {
        return {
          gatewayId: cursor,
          flowIds: r2FlowIds,
        };
      }
      const preferredFlowId = outgoing
        .map((flow) => toText(flow?.id))
        .find((flowId) => normalizeRtier(asObject(classMap[flowId])?.rtier) === "R0")
        || toText(outgoing[0]?.id);
      const nextFlow = outgoing.find((flow) => toText(flow?.id) === preferredFlowId) || outgoing[0];
      cursor = toText(nextFlow?.targetId);
      continue;
    }
    cursor = toText(outgoing[0]?.targetId);
  }
  return null;
}

export function buildRVariants({
  graph,
  flowMeta,
  scopeStartId,
  successEndId,
  failEndId,
  maxLoopIters = 1,
}) {
  const safeGraph = asObject(graph);
  const nodesById = asObject(safeGraph?.nodesById);
  const startNodeId = toText(scopeStartId)
    || toArray(safeGraph?.startNodeIds).map((id) => toText(id)).filter(Boolean)[0]
    || "";
  if (!startNodeId || !Object.keys(nodesById).length) return [];

  const scope = collectScopeFromStart(safeGraph, startNodeId);
  const fallbackEnds = inferFallbackEndIds(safeGraph, scope.nodeIds);
  const resolvedSuccessEndId = toText(successEndId) || toText(fallbackEnds.successEndId);
  const resolvedFailEndId = toText(failEndId) || toText(fallbackEnds.failEndId);

  const distToSuccess = computeDistancesToTargetNodes(safeGraph, scope, resolvedSuccessEndId ? [resolvedSuccessEndId] : []);
  const distToFail = computeDistancesToTargetNodes(safeGraph, scope, resolvedFailEndId ? [resolvedFailEndId] : []);
  const normalizedFlowMeta = normalizeFlowMetaMap(flowMeta);

  const gatewayClassByGatewayId = {};
  const outgoingByNode = asObject(safeGraph?.outgoingByNode);
  Object.keys(nodesById).forEach((nodeId) => {
    if (!scope.nodeIds.has(nodeId)) return;
    const node = asObject(nodesById[nodeId]);
    const outgoing = sortedOutgoing(outgoingByNode[nodeId]);
    if (!isXorGateway(node) || outgoing.length <= 1) return;
    gatewayClassByGatewayId[nodeId] = classifyGatewayOutgoing({
      graph: safeGraph,
      gatewayId: nodeId,
      outgoing,
      flowMeta: normalizedFlowMeta,
      distToSuccess,
      distToFail,
    });
  });

  const variants = [];
  variants.push(
    buildSingleVariant({
      key: "R0",
      graph: safeGraph,
      flowMeta: normalizedFlowMeta,
      scopeStartId: startNodeId,
      successEndId: resolvedSuccessEndId,
      failEndId: resolvedFailEndId,
      maxLoopIters,
      gatewayClassByGatewayId,
    }),
  );
  variants.push(
    buildSingleVariant({
      key: "R1",
      graph: safeGraph,
      flowMeta: normalizedFlowMeta,
      scopeStartId: startNodeId,
      successEndId: resolvedSuccessEndId,
      failEndId: resolvedFailEndId,
      maxLoopIters,
      gatewayClassByGatewayId,
    }),
  );

  const r2Candidates = findFirstR2Candidates({
    graph: safeGraph,
    scopeStartId: startNodeId,
    gatewayClassByGatewayId,
  });
  if (!r2Candidates || !toArray(r2Candidates.flowIds).length) {
    variants.push(
      buildSingleVariant({
        key: "R2",
        graph: safeGraph,
        flowMeta: normalizedFlowMeta,
        scopeStartId: startNodeId,
        successEndId: resolvedSuccessEndId,
        failEndId: resolvedFailEndId,
        maxLoopIters,
        gatewayClassByGatewayId,
      }),
    );
  } else {
    toArray(r2Candidates.flowIds).forEach((flowId, idx) => {
      variants.push(
        buildSingleVariant({
          key: toArray(r2Candidates.flowIds).length > 1 ? `R2.${idx + 1}` : "R2",
          graph: safeGraph,
          flowMeta: normalizedFlowMeta,
          scopeStartId: startNodeId,
          successEndId: resolvedSuccessEndId,
          failEndId: resolvedFailEndId,
          maxLoopIters,
          gatewayClassByGatewayId,
          forcedR2GatewayId: toText(r2Candidates.gatewayId),
          forcedR2FlowId: toText(flowId),
        }),
      );
    });
  }

  return variants.map((variant) => ({
    ...variant,
    scopeStartId: startNodeId,
    successEndId: resolvedSuccessEndId,
    failEndId: resolvedFailEndId,
  }));
}
