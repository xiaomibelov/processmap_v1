import { toArray, toText } from "../utils.js";

const BPMN_FLOW_NODE_TAGS = new Set([
  "startevent",
  "endevent",
  "boundaryevent",
  "task",
  "usertask",
  "servicetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "sendtask",
  "receivetask",
  "callactivity",
  "subprocess",
  "adhocsubprocess",
  "exclusivegateway",
  "inclusivegateway",
  "eventbasedgateway",
  "parallelgateway",
  "intermediatecatchevent",
  "intermediatethrowevent",
  "intermediateevent",
]);

function safeRank(rankByNodeId, nodeId) {
  const n = Number(rankByNodeId?.[nodeId]);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function byTargetRank(rankByNodeId) {
  return (a, b) => {
    const ar = safeRank(rankByNodeId, toText(a?.targetId || a?.toId));
    const br = safeRank(rankByNodeId, toText(b?.targetId || b?.toId));
    if (ar !== br) return ar - br;
    return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
  };
}

function gatewayModeFromType(typeRaw) {
  const type = String(typeRaw || "").toLowerCase();
  if (type === "exclusivegateway") return "xor";
  if (type === "inclusivegateway") return "inclusive";
  if (type === "parallelgateway") return "parallel";
  if (type === "eventbasedgateway") return "event";
  return "unknown";
}

function isGatewayType(typeRaw) {
  return gatewayModeFromType(typeRaw) !== "unknown";
}

function normalizeFlowTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function normalizeRFlowTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "R0" || tier === "R1" || tier === "R2") return tier;
  return "";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeOutcome(raw) {
  const value = toText(raw).toLowerCase();
  if (!value) return "";
  if (value === "success" || value === "ok" || value === "done" || value === "pass") return "success";
  if (value === "fail" || value === "failed" || value === "error" || value === "abort" || value === "stop") return "fail";
  if (value === "true") return "success";
  if (value === "false") return "fail";
  return "";
}

function normalizeAttrKey(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function truthyText(raw) {
  const value = toText(raw).toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "y";
}

function outcomeFromKeyValue(keyRaw, valueRaw) {
  const key = normalizeAttrKey(keyRaw);
  const value = toText(valueRaw);
  if (!key) return "";

  if (key.endsWith("issuccessend")) {
    return truthyText(value) ? "success" : "";
  }
  if (key.endsWith("isfailend")) {
    return truthyText(value) ? "fail" : "";
  }
  if (key.endsWith("outcome") || key.endsWith("result")) {
    return normalizeOutcome(value);
  }
  return "";
}

function extractOutcomeHintFromXmlElement(el) {
  if (!el) return "";

  const directAttrs = Array.from(el.attributes || []);
  for (let i = 0; i < directAttrs.length; i += 1) {
    const attr = directAttrs[i];
    const out = outcomeFromKeyValue(attr?.name, attr?.value);
    if (out) return out;
  }

  const directLocal = toText(el.localName).toLowerCase();
  if (directLocal === "outcome" || directLocal === "result") {
    const out = normalizeOutcome(el.textContent);
    if (out) return out;
  }

  const extensionEl = Array.from(el.children || []).find(
    (child) => toText(child?.localName).toLowerCase() === "extensionelements",
  );
  if (!extensionEl) return "";

  const stack = [extensionEl];
  while (stack.length) {
    const current = stack.shift();
    if (!current) continue;
    const local = toText(current.localName).toLowerCase();

    if (local === "outcome" || local === "result") {
      const out = normalizeOutcome(current.textContent || current.getAttribute?.("value"));
      if (out) return out;
    }

    const attrs = Array.from(current.attributes || []);
    for (let i = 0; i < attrs.length; i += 1) {
      const attr = attrs[i];
      const out = outcomeFromKeyValue(attr?.name, attr?.value);
      if (out) return out;
    }

    const nameAttr = toText(current.getAttribute?.("name"));
    const valueAttr = toText(current.getAttribute?.("value") || current.textContent);
    if (nameAttr) {
      const out = outcomeFromKeyValue(nameAttr, valueAttr);
      if (out) return out;
    }

    Array.from(current.children || []).forEach((child) => stack.push(child));
  }

  return "";
}

function extractOutcomeHintFromBackendNode(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node?.parameters);
  const directCandidates = [
    ["outcome", node?.outcome],
    ["result", node?.result],
    ["isSuccessEnd", node?.isSuccessEnd],
    ["isFailEnd", node?.isFailEnd],
    ["outcome", params?.outcome],
    ["result", params?.result],
    ["isSuccessEnd", params?.isSuccessEnd],
    ["isFailEnd", params?.isFailEnd],
  ];
  for (let i = 0; i < directCandidates.length; i += 1) {
    const [key, value] = directCandidates[i];
    const out = outcomeFromKeyValue(key, value);
    if (out) return out;
  }
  return "";
}

function parseSequenceFlowGraphFromXml(xmlText, transitionLabelByKey) {
  const raw = String(xmlText || "").trim();
  if (!raw || typeof DOMParser === "undefined") {
    return { nodesById: {}, flows: [], hasXml: false };
  }

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return { nodesById: {}, flows: [], hasXml: false };
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) {
    return { nodesById: {}, flows: [], hasXml: false };
  }

  const nodesById = {};
  Array.from(doc.getElementsByTagName("*")).forEach((el) => {
    const local = String(el.localName || "").toLowerCase();
    if (!BPMN_FLOW_NODE_TAGS.has(local)) return;
    const id = toText(el.getAttribute("id"));
    if (!id || nodesById[id]) return;
    nodesById[id] = {
      id,
      type: local,
      name: toText(el.getAttribute("name")) || id,
      defaultFlowId: toText(el.getAttribute("default")),
      outcomeHint: extractOutcomeHintFromXmlElement(el),
    };
  });

  const flows = [];
  const seenFlowId = new Set();
  let flowCursor = 1;
  Array.from(doc.getElementsByTagName("*")).forEach((el) => {
    const local = String(el.localName || "").toLowerCase();
    if (local !== "sequenceflow") return;
    const sourceId = toText(el.getAttribute("sourceRef"));
    const targetId = toText(el.getAttribute("targetRef"));
    if (!sourceId || !targetId || sourceId === targetId) return;
    const defaultId = `xml_flow_${flowCursor++}`;
    const rawId = toText(el.getAttribute("id")) || defaultId;
    const flowId = seenFlowId.has(rawId) ? `${rawId}_${flowCursor}` : rawId;
    seenFlowId.add(flowId);
    const transitionKey = `${sourceId}__${targetId}`;
    const name = toText(el.getAttribute("name"));
    const conditionExpression = toText(
      Array.from(el.children || []).find((child) => String(child.localName || "").toLowerCase() === "conditionexpression")?.textContent,
    );
    const condition = conditionExpression || name || toText(transitionLabelByKey?.[transitionKey]);
    flows.push({
      id: flowId,
      sourceId,
      targetId,
      name: condition || name,
      condition,
      source: "xml",
    });
  });

  return {
    nodesById,
    flows,
    hasXml: true,
  };
}

function mapRuntimeEdgesToFlows(backendEdges, transitionLabelByKey) {
  const flows = [];
  const seenFlowId = new Set();
  let flowCursor = 1;
  toArray(backendEdges).forEach((edge) => {
    const sourceId = toText(edge?.from_id || edge?.sourceId || edge?.from);
    const targetId = toText(edge?.to_id || edge?.targetId || edge?.to);
    if (!sourceId || !targetId || sourceId === targetId) return;
    const transitionKey = `${sourceId}__${targetId}`;
    const flowCondition = toText(transitionLabelByKey?.[transitionKey]) || toText(edge?.when || edge?.label);
    const rawId = toText(edge?.id || edge?.edgeKey) || `runtime_flow_${flowCursor++}`;
    const flowId = seenFlowId.has(rawId) ? `${rawId}_${flowCursor}` : rawId;
    seenFlowId.add(flowId);
    flows.push({
      id: flowId,
      sourceId,
      targetId,
      name: flowCondition,
      condition: flowCondition,
      source: "runtime",
    });
  });
  return flows;
}

function collectReachableNodeIds(startNodeId, outgoingByNode, rankByNodeId, maxNodes = 400) {
  const startId = toText(startNodeId);
  if (!startId) return new Set();
  const visited = new Set();
  const queue = [startId];
  let hops = 0;
  while (queue.length && visited.size < maxNodes && hops < maxNodes * 3) {
    hops += 1;
    const currentNodeId = toText(queue.shift());
    if (!currentNodeId || visited.has(currentNodeId)) continue;
    visited.add(currentNodeId);
    const sortedOutgoing = [...toArray(outgoingByNode?.[currentNodeId])].sort(byTargetRank(rankByNodeId));
    sortedOutgoing.forEach((flow) => {
      const nextNodeId = toText(flow?.targetId);
      if (!nextNodeId || visited.has(nextNodeId)) return;
      queue.push(nextNodeId);
    });
  }
  return visited;
}

export function buildInterviewGraphModel({
  bpmnXml,
  backendNodes,
  backendEdges,
  transitionLabelByKey,
  flowMetaById,
  nodeKindById,
  laneMetaByNode,
  subprocessMetaByNode,
  graphNodeRank,
}) {
  const nodesById = {};
  const flowsById = {};
  const outgoingByNode = {};
  const incomingByNode = {};
  const backendNodeById = {};

  const flowMeta = flowMetaById && typeof flowMetaById === "object" ? flowMetaById : {};

  toArray(backendNodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId || backendNodeById[nodeId]) return;
    backendNodeById[nodeId] = node;
  });

  const xmlGraph = parseSequenceFlowGraphFromXml(bpmnXml, transitionLabelByKey);
  const xmlNodesById = xmlGraph?.nodesById && typeof xmlGraph.nodesById === "object" ? xmlGraph.nodesById : {};
  const xmlFlows = toArray(xmlGraph?.flows);
  const hasXmlSequenceFlows = xmlFlows.length > 0;
  const runtimeFlows = mapRuntimeEdgesToFlows(backendEdges, transitionLabelByKey);
  const primaryFlows = hasXmlSequenceFlows ? xmlFlows : runtimeFlows;

  const knownNodeIds = new Set();
  Object.keys(xmlNodesById).forEach((nodeId) => knownNodeIds.add(nodeId));
  Object.keys(backendNodeById).forEach((nodeId) => knownNodeIds.add(nodeId));
  toArray(primaryFlows).forEach((flow) => {
    const sourceId = toText(flow?.sourceId);
    const targetId = toText(flow?.targetId);
    if (sourceId) knownNodeIds.add(sourceId);
    if (targetId) knownNodeIds.add(targetId);
  });

  Array.from(knownNodeIds).forEach((nodeId) => {
    const node = backendNodeById[nodeId] || {};
    const xmlNode = xmlNodesById[nodeId] || {};
    const laneMeta = laneMetaByNode?.[nodeId];
    const subMeta = subprocessMetaByNode?.[nodeId];
    const kind = toText(xmlNode?.type || nodeKindById?.[nodeId] || node?.bpmnKind || node?.nodeType || "task").toLowerCase();
    const backendOutcomeHint = extractOutcomeHintFromBackendNode(node);
    nodesById[nodeId] = {
      id: nodeId,
      type: kind || "task",
      name: toText(xmlNode?.name || node?.title) || nodeId,
      defaultFlowId: toText(xmlNode?.defaultFlowId),
      outcomeHint: toText(backendOutcomeHint || xmlNode?.outcomeHint),
      laneId: toText(laneMeta?.id || laneMeta?.key || laneMeta?.name),
      incoming: [],
      outgoing: [],
      parentSubprocessId: toText(subMeta?.parentSubprocessId),
      isSubprocessContainer: !!subMeta?.isSubprocessContainer,
    };
    outgoingByNode[nodeId] = [];
    incomingByNode[nodeId] = [];
  });

  toArray(primaryFlows).forEach((flow) => {
    const sourceId = toText(flow?.sourceId);
    const targetId = toText(flow?.targetId);
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!nodesById[sourceId] || !nodesById[targetId]) return;
    const flowId = toText(flow?.id);
    if (flowsById[flowId]) return;
    const flowMetaEntry = flowMeta?.[flowId];
    const tier = normalizeFlowTier(flowMetaEntry?.tier || (flowMetaEntry?.happy ? "P0" : ""));
    const rtier = normalizeRFlowTier(flowMetaEntry?.rtier || flow?.rtier);
    const flowModel = {
      id: flowId,
      sourceId,
      targetId,
      name: toText(flow?.name || flow?.condition),
      condition: toText(flow?.condition || flow?.name),
      tier: tier || "",
      rtier: rtier || "",
      happy: tier === "P0",
      source: toText(flow?.source || (hasXmlSequenceFlows ? "xml" : "runtime")),
    };
    flowsById[flowId] = flowModel;
    outgoingByNode[sourceId].push(flowModel);
    incomingByNode[targetId].push(flowModel);
    nodesById[sourceId].outgoing.push(flowId);
    nodesById[targetId].incoming.push(flowId);
  });

  Object.keys(outgoingByNode).forEach((nodeId) => {
    outgoingByNode[nodeId].sort(byTargetRank(graphNodeRank));
  });
  Object.keys(incomingByNode).forEach((nodeId) => {
    incomingByNode[nodeId].sort((a, b) => {
      const ar = safeRank(graphNodeRank, toText(a?.sourceId));
      const br = safeRank(graphNodeRank, toText(b?.sourceId));
      if (ar !== br) return ar - br;
      return String(a?.id || "").localeCompare(String(b?.id || ""), "ru");
    });
  });

  const startNodeIds = Object.values(nodesById)
    .filter((node) => String(node?.type || "").toLowerCase() === "startevent")
    .map((node) => node.id)
    .sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));

  const endNodeIds = Object.values(nodesById)
    .filter((node) => String(node?.type || "").toLowerCase() === "endevent")
    .map((node) => node.id)
    .sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));

  const gatewayKinds = new Set(["exclusivegateway", "inclusivegateway", "parallelgateway", "eventbasedgateway"]);
  const splitGatewayIds = [];
  const joinGatewayIds = [];
  const gatewayById = {};
  Object.values(nodesById).forEach((node) => {
    const kind = String(node?.type || "").toLowerCase();
    if (!gatewayKinds.has(kind)) return;
    const incomingCount = Number(node?.incoming?.length || 0);
    const outgoingCount = Number(node?.outgoing?.length || 0);
    const isSplit = outgoingCount > 1;
    const isJoin = incomingCount > 1;
    if (isSplit) splitGatewayIds.push(node.id);
    if (isJoin) joinGatewayIds.push(node.id);
    gatewayById[node.id] = {
      id: node.id,
      type: kind,
      mode: gatewayModeFromType(kind),
      defaultFlowId: toText(node?.defaultFlowId),
      incomingCount,
      outgoingCount,
      isSplit,
      isJoin,
      splitBranches: isSplit
        ? toArray(outgoingByNode[node.id]).map((flow) => ({
          flowId: toText(flow?.id),
          targetId: toText(flow?.targetId),
          condition: toText(flow?.condition),
          name: toText(flow?.name),
          tier: normalizeFlowTier(flow?.tier || (flow?.happy ? "P0" : "")),
          rtier: normalizeRFlowTier(flow?.rtier),
          isHappy: !!flow?.happy,
          isDefault: toText(flow?.id) === toText(node?.defaultFlowId),
        }))
        : [],
      joinNodeId: "",
    };
  });
  splitGatewayIds.sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));
  joinGatewayIds.sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));

  splitGatewayIds.forEach((gatewayId) => {
    const gateway = gatewayById[gatewayId];
    if (!gateway?.isSplit) return;
    const splitRank = safeRank(graphNodeRank, gatewayId);
    const branchTargets = toArray(gateway?.splitBranches).map((branch) => toText(branch?.targetId)).filter(Boolean);
    if (branchTargets.length < 2) return;

    const reachableSets = branchTargets.map((targetId) => collectReachableNodeIds(targetId, outgoingByNode, graphNodeRank));
    if (!reachableSets.length) return;
    const baseSet = reachableSets[0];
    const commonCandidates = [];
    baseSet.forEach((nodeId) => {
      const allContain = reachableSets.every((set) => set.has(nodeId));
      if (!allContain) return;
      commonCandidates.push(nodeId);
    });
    if (!commonCandidates.length) return;

    const preferredType = toText(gateway?.type).toLowerCase();
    const ranked = commonCandidates
      .filter((nodeId) => safeRank(graphNodeRank, nodeId) > splitRank)
      .map((nodeId) => {
        const nodeType = toText(nodesById[nodeId]?.type).toLowerCase();
        const incomingCount = Number(incomingByNode[nodeId]?.length || 0);
        const isGateway = isGatewayType(nodeType);
        const sameType = isGateway && nodeType === preferredType;
        return {
          nodeId,
          rank: safeRank(graphNodeRank, nodeId),
          incomingCount,
          isGateway,
          sameType,
        };
      })
      .sort((a, b) => {
        if (a.sameType !== b.sameType) return a.sameType ? -1 : 1;
        if (a.isGateway !== b.isGateway) return a.isGateway ? -1 : 1;
        if ((a.incomingCount > 1) !== (b.incomingCount > 1)) return a.incomingCount > 1 ? -1 : 1;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return String(a.nodeId).localeCompare(String(b.nodeId), "ru");
      });
    if (!ranked.length) return;
    gateway.joinNodeId = ranked[0].nodeId;
  });

  const subprocessBoundaries = {};
  Object.values(nodesById).forEach((node) => {
    const parentId = toText(node?.parentSubprocessId);
    if (!parentId) return;
    if (!subprocessBoundaries[parentId]) subprocessBoundaries[parentId] = [];
    subprocessBoundaries[parentId].push(node.id);
  });
  Object.keys(subprocessBoundaries).forEach((parentId) => {
    subprocessBoundaries[parentId].sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));
  });

  const indegreeByNode = {};
  Object.keys(nodesById).forEach((nodeId) => {
    indegreeByNode[nodeId] = 0;
  });
  Object.values(flowsById).forEach((flow) => {
    const targetId = toText(flow?.targetId);
    if (!targetId || !Object.prototype.hasOwnProperty.call(indegreeByNode, targetId)) return;
    indegreeByNode[targetId] = Number(indegreeByNode[targetId] || 0) + 1;
  });

  const fallbackStartNodeIds = Object.keys(indegreeByNode)
    .filter((nodeId) => Number(indegreeByNode[nodeId] || 0) === 0)
    .sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));
  const bfsSeed = startNodeIds.length ? startNodeIds : fallbackStartNodeIds;
  const reachableSeedMode = startNodeIds.length ? "start_events" : "pseudo_start_incoming_zero";
  const reachableNodeIdSet = new Set();
  const queue = [...bfsSeed];
  while (queue.length) {
    const currentNodeId = toText(queue.shift());
    if (!currentNodeId || reachableNodeIdSet.has(currentNodeId)) continue;
    reachableNodeIdSet.add(currentNodeId);
    toArray(outgoingByNode[currentNodeId]).forEach((flow) => {
      const nextNodeId = toText(flow?.targetId);
      if (!nextNodeId || reachableNodeIdSet.has(nextNodeId)) return;
      queue.push(nextNodeId);
    });
  }
  const reachableNodeIds = Array.from(reachableNodeIdSet).sort((a, b) => safeRank(graphNodeRank, a) - safeRank(graphNodeRank, b));

  return {
    nodesById,
    flowsById,
    outgoingByNode,
    incomingByNode,
    startNodeIds,
    endNodeIds,
    splitGatewayIds,
    joinGatewayIds,
    gatewayById,
    subprocessBoundaries,
    reachableNodeIds,
    fallbackStartNodeIds,
    reachableSeedMode,
    flowSourceMode: hasXmlSequenceFlows ? "xml_sequence_flow" : "runtime_fallback",
    hasXmlSequenceFlows,
  };
}
