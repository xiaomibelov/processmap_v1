function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return String(value || "").trim();
}

function normalizeTier(raw) {
  const tier = asText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function typeLower(raw) {
  return asText(raw).toLowerCase();
}

function isEndNode(nodeRaw) {
  return typeLower(asObject(nodeRaw)?.type).includes("endevent");
}

function isParallelGateway(nodeRaw) {
  return typeLower(asObject(nodeRaw)?.type).includes("parallelgateway");
}

function isExclusiveGateway(nodeRaw) {
  return typeLower(asObject(nodeRaw)?.type).includes("exclusivegateway");
}

function isSubprocess(nodeRaw) {
  return typeLower(asObject(nodeRaw)?.type).includes("subprocess");
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number(fallback || 0);
  return n;
}

function normalizeScenarioSpec(rawScenario) {
  const scenario = asObject(rawScenario);
  return {
    tier: normalizeTier(scenario?.tier || scenario?.pathTier),
    sequenceKey: asText(scenario?.sequenceKey || scenario?.sequence_key),
    label: asText(scenario?.label),
  };
}

function normalizeRouteDecisionMap(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((nodeIdRaw) => {
    const nodeId = asText(nodeIdRaw);
    const flowId = asText(source[nodeIdRaw]);
    if (!nodeId || !flowId) return;
    out[nodeId] = flowId;
  });
  return out;
}

function normalizeFlowMeta(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((flowIdRaw) => {
    const flowId = asText(flowIdRaw);
    if (!flowId) return;
    const row = asObject(source[flowIdRaw]);
    const tier = normalizeTier(row?.tier || row?.path);
    if (!tier) return;
    out[flowId] = { tier };
  });
  return out;
}

function normalizeNodePathMeta(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((nodeIdRaw) => {
    const nodeId = asText(nodeIdRaw);
    if (!nodeId) return;
    const row = asObject(source[nodeIdRaw]);
    const paths = asArray(row?.paths).map((value) => normalizeTier(value)).filter(Boolean);
    if (!paths.length) return;
    out[nodeId] = {
      paths: Array.from(new Set(paths)),
      sequenceKey: asText(row?.sequence_key || row?.sequenceKey),
    };
  });
  return out;
}

function asSortedIds(idsRaw) {
  return asArray(idsRaw)
    .map((value) => asText(value))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), "ru"));
}

function buildGatewayOptions(node, flowsById, nodesById) {
  return asArray(node?.outgoingFlowIds)
    .map((flowIdRaw) => {
      const flowId = asText(flowIdRaw);
      const flow = asObject(flowsById[flowId]);
      if (!flowId || !Object.keys(flow).length) return null;
      const targetId = asText(flow?.targetId);
      const target = asObject(nodesById[targetId]);
      return {
        flowId,
        label: asText(flow?.label || flow?.conditionText),
        targetId,
        targetName: asText(target?.name || targetId),
        condition: asText(flow?.conditionText),
      };
    })
    .filter(Boolean);
}

function buildScenarioFlowScore({
  flowId,
  flow,
  scenario,
  flowMetaById,
  nodePathMetaById,
}) {
  const tier = normalizeTier(scenario?.tier);
  const sequenceKey = asText(scenario?.sequenceKey);
  if (!tier) return 0;
  let score = 0;
  const flowTier = normalizeTier(asObject(flowMetaById[flowId])?.tier);
  if (flowTier && flowTier === tier) score += 6;
  const targetNodeId = asText(flow?.targetId);
  const targetMeta = asObject(nodePathMetaById[targetNodeId]);
  const targetPaths = asArray(targetMeta?.paths).map((value) => normalizeTier(value)).filter(Boolean);
  if (targetPaths.includes(tier)) score += 4;
  const targetSequence = asText(targetMeta?.sequenceKey || targetMeta?.sequence_key);
  if (sequenceKey) {
    if (targetSequence && targetSequence === sequenceKey) {
      score += 5;
    } else if (targetSequence && targetSequence !== sequenceKey) {
      score -= 2;
    }
  }
  if (asText(flow?.conditionText)) score += 1;
  return score;
}

export function buildRouteDecisionByNodeId(stepsRaw) {
  const out = {};
  asArray(stepsRaw).forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const nodeId = asText(
      step?.bpmn_ref
      || step?.bpmnRef
      || step?.node_id
      || step?.nodeId
      || step?.bpmn_id
      || step?.id,
    );
    if (!nodeId) return;
    const decision = asObject(step?.decision);
    const selectedFlowId = asText(
      step?.selected_outgoing_flow_id
      || step?.selectedOutgoingFlowId
      || step?.selected_flow_id
      || step?.selectedFlowId
      || step?.outgoing_flow_id
      || step?.outgoingFlowId
      || decision?.selected_flow_id
      || decision?.selectedFlowId
      || decision?.outgoing_flow_id
      || decision?.outgoingFlowId,
    );
    if (!selectedFlowId) return;
    out[nodeId] = selectedFlowId;
  });
  return out;
}

export function createPlaybackEngine(optionsRaw = {}) {
  const options = asObject(optionsRaw);
  const graph = asObject(options?.graph);
  const nodesById = asObject(graph?.nodesById);
  const flowsById = asObject(graph?.flowsById);
  const loopLimit = Math.max(1, Math.floor(toNum(options?.loopLimit, 3)));
  const maxEvents = Math.max(100, Math.floor(toNum(options?.maxEvents, 1600)));
  const spawnAllStarts = options?.spawnAllStarts === true;
  const flowMetaById = normalizeFlowMeta(options?.flowMetaById);
  const nodePathMetaById = normalizeNodePathMeta(options?.nodePathMetaById);
  const routeDecisionByNodeId = normalizeRouteDecisionMap(options?.routeDecisionByNodeId);
  const scenario = normalizeScenarioSpec(options?.scenario);
  const preferredStartNodeId = asText(options?.startNodeId);

  let manualAtGateway = options?.manualAtGateway === true;
  let tokenSeq = 0;
  let eventSeq = 0;
  let activeTokens = [];
  let joinArrivalsByNodeId = {};
  let visitedByNodeId = {};
  let eventQueue = [];
  let waitingDecision = null;
  let finished = false;
  let stopReason = "";
  let completedTokens = 0;
  let deadEndTokens = 0;
  let emittedStop = false;

  function makeToken(nodeIdRaw, fromFlowIdRaw = "", extra = {}) {
    tokenSeq += 1;
    return {
      id: tokenSeq,
      nodeId: asText(nodeIdRaw),
      fromFlowId: asText(fromFlowIdRaw),
      orderKey: tokenSeq,
      ...asObject(extra),
    };
  }

  function markVisited(nodeIdRaw) {
    const nodeId = asText(nodeIdRaw);
    if (!nodeId) return 0;
    const prev = Number(visitedByNodeId[nodeId] || 0);
    const next = prev + 1;
    visitedByNodeId = {
      ...visitedByNodeId,
      [nodeId]: next,
    };
    return next;
  }

  function enqueueEvent(typeRaw, payloadRaw = {}) {
    const type = asText(typeRaw);
    if (!type) return;
    eventSeq += 1;
    eventQueue.push({
      id: `evt_${eventSeq}`,
      index: eventSeq,
      type,
      ...asObject(payloadRaw),
    });
  }

  function enqueueStop(reasonRaw = "finished") {
    if (emittedStop) return;
    emittedStop = true;
    stopReason = asText(reasonRaw || stopReason || "finished");
    enqueueEvent("stop", {
      reason: stopReason,
      activeTokenCount: activeTokens.length,
      visitedCount: Object.keys(visitedByNodeId).length,
    });
  }

  function pickNextToken() {
    if (!activeTokens.length) return null;
    activeTokens = [...activeTokens].sort((a, b) => Number(a?.orderKey || 0) - Number(b?.orderKey || 0));
    const token = activeTokens[0] || null;
    activeTokens = activeTokens.slice(1);
    return token;
  }

  function maybeFinish() {
    if (finished) return;
    if (waitingDecision) return;
    if (activeTokens.length > 0) return;
    finished = true;
    if (!stopReason) {
      if (completedTokens > 0 && deadEndTokens === 0) stopReason = "ok_complete";
      else if (completedTokens > 0 && deadEndTokens > 0) stopReason = "partial_complete";
      else stopReason = "dead_end";
    }
    enqueueStop(stopReason);
  }

  function buildFlowChoice(nodeRaw) {
    const node = asObject(nodeRaw);
    const outgoingIds = asArray(node?.outgoingFlowIds).filter((flowId) => !!flowsById[flowId]);
    if (!outgoingIds.length) return { type: "none", flowId: "" };
    if (outgoingIds.length === 1) {
      return { type: "single", flowId: asText(outgoingIds[0]) };
    }

    const nodeId = asText(node?.id);
    const routeFlowId = asText(routeDecisionByNodeId[nodeId]);
    if (routeFlowId && outgoingIds.includes(routeFlowId)) {
      return { type: "route", flowId: routeFlowId };
    }

    if (manualAtGateway) {
      return {
        type: "wait_manual",
        flowId: "",
        options: buildGatewayOptions(node, flowsById, nodesById),
      };
    }

    const scored = outgoingIds.map((flowId) => {
      const flow = asObject(flowsById[flowId]);
      const score = buildScenarioFlowScore({
        flowId,
        flow,
        scenario,
        flowMetaById,
        nodePathMetaById,
      });
      return { flowId, score };
    });
    const maxScore = scored.reduce((acc, row) => Math.max(acc, Number(row?.score || 0)), -1000);
    if (Number.isFinite(maxScore) && maxScore > 0) {
      const selected = scored.find((row) => Number(row?.score || 0) === maxScore);
      if (selected?.flowId) return { type: "scenario", flowId: asText(selected.flowId) };
    }
    return { type: "stable", flowId: asText(outgoingIds[0]) };
  }

  function transitionTokenViaFlow(tokenRaw, flowIdRaw, extra = {}) {
    const token = asObject(tokenRaw);
    const flowId = asText(flowIdRaw);
    const flow = asObject(flowsById[flowId]);
    if (!flowId || !Object.keys(flow).length) return;
    const fromId = asText(flow?.sourceId || token?.nodeId);
    const toId = asText(flow?.targetId);
    enqueueEvent("take_flow", {
      flowId,
      fromId,
      toId,
      label: asText(flow?.label),
      condition: asText(flow?.conditionText),
      tokenId: Number(token?.id || 0),
      batchId: asText(extra?.batchId),
      parallel: extra?.parallel === true,
    });
    const targetNode = asObject(nodesById[toId]);
    if (!Object.keys(targetNode).length) return;

    enqueueEvent("enter_node", {
      nodeId: asText(targetNode?.id),
      nodeType: asText(targetNode?.type),
      nodeName: asText(targetNode?.name || targetNode?.id),
      fromFlowId: flowId,
      tokenId: Number(token?.id || 0),
      batchId: asText(extra?.batchId),
      parallel: extra?.parallel === true,
    });
    const visitCount = markVisited(toId);
    if (visitCount > loopLimit) {
      finished = true;
      stopReason = "loop_limit_reached";
      enqueueStop(stopReason);
      return;
    }

    if (isParallelGateway(targetNode) && asArray(targetNode?.incomingFlowIds).length > 1) {
      const incoming = asSortedIds(targetNode?.incomingFlowIds);
      const arrivals = new Set(asArray(joinArrivalsByNodeId[toId]));
      arrivals.add(flowId);
      joinArrivalsByNodeId = {
        ...joinArrivalsByNodeId,
        [toId]: Array.from(arrivals),
      };
      const allArrived = incoming.every((expectedFlowId) => arrivals.has(expectedFlowId));
      if (!allArrived) return;
      const nextJoinArrivals = { ...joinArrivalsByNodeId };
      delete nextJoinArrivals[toId];
      joinArrivalsByNodeId = nextJoinArrivals;
      activeTokens = [...activeTokens, makeToken(toId, flowId, { joinReady: true })];
      return;
    }
    activeTokens = [...activeTokens, makeToken(toId, flowId)];
  }

  function processTokenAtNode(tokenRaw, options = {}) {
    const token = asObject(tokenRaw);
    const nodeId = asText(token?.nodeId);
    const node = asObject(nodesById[nodeId]);
    if (!nodeId || !Object.keys(node).length) {
      deadEndTokens += 1;
      return;
    }
    const outgoingIds = asArray(node?.outgoingFlowIds).filter((flowId) => !!flowsById[flowId]);
    if (isEndNode(node)) {
      completedTokens += 1;
      maybeFinish();
      return;
    }
    if (!outgoingIds.length) {
      deadEndTokens += 1;
      maybeFinish();
      return;
    }

    const nodeType = typeLower(node?.type);
    const forceFlowId = asText(options?.forceFlowId);
    const flowChoice = forceFlowId
      ? { type: "manual", flowId: forceFlowId }
      : buildFlowChoice(node);

    if (flowChoice.type === "wait_manual") {
      waitingDecision = {
        nodeId,
        token,
        options: asArray(flowChoice?.options),
      };
      enqueueEvent("wait_for_gateway_decision", {
        gatewayId: nodeId,
        gatewayName: asText(node?.name || nodeId),
        outgoingOptions: asArray(flowChoice?.options),
      });
      return;
    }

    const selectedFlowId = asText(flowChoice?.flowId);
    if (!selectedFlowId) {
      deadEndTokens += 1;
      maybeFinish();
      return;
    }

    if (nodeType.includes("parallelgateway") && outgoingIds.length > 1) {
      const batchId = `batch_${nodeId}_${eventSeq + 1}`;
      enqueueEvent("parallel_batch_begin", {
        batchId,
        gatewayId: nodeId,
        gatewayName: asText(node?.name || nodeId),
        flowIds: outgoingIds,
      });
      outgoingIds.forEach((flowId) => {
        transitionTokenViaFlow(token, flowId, {
          batchId,
          parallel: true,
        });
      });
      enqueueEvent("parallel_batch_end", {
        batchId,
        gatewayId: nodeId,
        count: outgoingIds.length,
      });
      maybeFinish();
      return;
    }

    if (isSubprocess(node)) {
      enqueueEvent("enter_subprocess", {
        subprocessId: nodeId,
        nodeId,
        nodeName: asText(node?.name || nodeId),
      });
    }

    transitionTokenViaFlow(token, selectedFlowId, {
      branchType: asText(flowChoice?.type),
    });

    if (isSubprocess(node)) {
      enqueueEvent("exit_subprocess", {
        subprocessId: nodeId,
        nodeId,
        nodeName: asText(node?.name || nodeId),
      });
    }
    maybeFinish();
  }

  function bootstrap() {
    activeTokens = [];
    joinArrivalsByNodeId = {};
    visitedByNodeId = {};
    eventQueue = [];
    waitingDecision = null;
    finished = false;
    stopReason = "";
    emittedStop = false;
    completedTokens = 0;
    deadEndTokens = 0;
    tokenSeq = 0;
    eventSeq = 0;

    const startNodeIds = asSortedIds(graph?.startNodeIds).filter((id) => !!nodesById[id]);
    const topLevelStartNodeIds = asSortedIds(graph?.topLevelStartNodeIds).filter((id) => !!nodesById[id]);
    const baseStartNodeIds = topLevelStartNodeIds.length ? topLevelStartNodeIds : startNodeIds;

    let initialNodes = baseStartNodeIds.length
      ? baseStartNodeIds
      : asSortedIds(Object.keys(nodesById)).slice(0, 1);

    if (preferredStartNodeId && initialNodes.includes(preferredStartNodeId)) {
      initialNodes = [preferredStartNodeId];
    } else if (!spawnAllStarts && initialNodes.length > 1) {
      initialNodes = [initialNodes[0]];
    }
    if (!initialNodes.length) {
      finished = true;
      stopReason = "empty_graph";
      enqueueStop(stopReason);
      return;
    }

    initialNodes.forEach((nodeId) => {
      const node = asObject(nodesById[nodeId]);
      const token = makeToken(nodeId, "");
      activeTokens = [...activeTokens, token];
      markVisited(nodeId);
      enqueueEvent("enter_node", {
        nodeId,
        nodeType: asText(node?.type),
        nodeName: asText(node?.name || nodeId),
        fromFlowId: "",
        tokenId: token.id,
        initial: true,
      });
    });
  }

  function nextEvent() {
    if (eventQueue.length > 0) {
      return eventQueue.shift();
    }
    if (finished) return null;
    if (waitingDecision) return null;
    if (eventSeq >= maxEvents) {
      finished = true;
      stopReason = "max_events_reached";
      enqueueStop(stopReason);
      return eventQueue.shift() || null;
    }

    let guard = 0;
    while (!eventQueue.length && !finished && !waitingDecision && guard < 64) {
      guard += 1;
      const token = pickNextToken();
      if (!token) {
        maybeFinish();
        break;
      }
      processTokenAtNode(token);
    }

    if (eventQueue.length > 0) return eventQueue.shift();
    return null;
  }

  function chooseGatewayFlow(gatewayIdRaw, flowIdRaw) {
    const gatewayId = asText(gatewayIdRaw);
    const flowId = asText(flowIdRaw);
    const waiting = asObject(waitingDecision);
    if (!gatewayId || !flowId || asText(waiting?.nodeId) !== gatewayId) {
      return { ok: false, reason: "no_waiting_gateway" };
    }
    const waitingNode = asObject(nodesById[gatewayId]);
    const outgoingIds = asArray(waitingNode?.outgoingFlowIds).filter((id) => !!flowsById[id]);
    const selectedFlowId = outgoingIds.includes(flowId)
      ? flowId
      : asText(outgoingIds[0]);
    waitingDecision = null;
    processTokenAtNode(waiting?.token, { forceFlowId: selectedFlowId });
    return {
      ok: true,
      gatewayId,
      flowId: selectedFlowId,
    };
  }

  function getSnapshot() {
    return {
      finished,
      stopReason,
      waitingDecision: waitingDecision
        ? {
          nodeId: asText(waitingDecision?.nodeId),
          options: asArray(waitingDecision?.options),
        }
        : null,
      activeTokenCount: activeTokens.length,
      visitedByNodeId: { ...visitedByNodeId },
      scenario,
      manualAtGateway,
    };
  }

  function setManualAtGateway(nextManual) {
    manualAtGateway = nextManual === true;
  }

  bootstrap();

  return {
    nextEvent,
    chooseGatewayFlow,
    getSnapshot,
    setManualAtGateway,
    reset: bootstrap,
    getGraph: () => graph,
    getScenario: () => scenario,
  };
}

export function normalizePlaybackScenarioSpec(rawScenario) {
  return normalizeScenarioSpec(rawScenario);
}
