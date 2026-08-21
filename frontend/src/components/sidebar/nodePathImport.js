const NODE_PATH_TAG_ORDER = ["P0", "P1", "P2"];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function normalizeTier(value) {
  const tier = toText(value).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function defaultSequenceKeyForTier(tier) {
  if (tier === "P0") return "primary";
  if (tier === "P1") return "mitigated_1";
  if (tier === "P2") return "fail_1";
  return "";
}

function sequenceKeyForTierAndComponent(tier, componentIndex) {
  const idx = Math.max(0, Number(componentIndex || 0));
  if (tier === "P0") return idx === 0 ? "primary" : `primary_alt_${idx + 1}`;
  if (tier === "P1") return `mitigated_${idx + 1}`;
  if (tier === "P2") return `fail_${idx + 1}`;
  return "";
}

function compareNodeIds(aRaw, bRaw, rankByNodeId) {
  const a = toText(aRaw);
  const b = toText(bRaw);
  const ar = Number(asObject(rankByNodeId)[a]);
  const br = Number(asObject(rankByNodeId)[b]);
  const av = Number.isFinite(ar) ? ar : Number.MAX_SAFE_INTEGER;
  const bv = Number.isFinite(br) ? br : Number.MAX_SAFE_INTEGER;
  if (av !== bv) return av - bv;
  return a.localeCompare(b, "ru");
}

function collectTierEdges(flowMetaByIdRaw, flowEndpointsByIdRaw) {
  const flowMetaById = asObject(flowMetaByIdRaw);
  const flowEndpointsById = asObject(flowEndpointsByIdRaw);
  const edgesByTier = { P0: [], P1: [], P2: [] };
  Object.keys(flowMetaById).forEach((flowIdRaw) => {
    const flowId = toText(flowIdRaw);
    const tier = normalizeTier(asObject(flowMetaById[flowId])?.tier);
    if (!flowId || !tier) return;
    const edge = asObject(flowEndpointsById[flowId]);
    const sourceId = toText(edge?.sourceId);
    const targetId = toText(edge?.targetId);
    if (!sourceId || !targetId || sourceId === targetId) return;
    edgesByTier[tier].push({ flow_id: flowId, source_id: sourceId, target_id: targetId });
  });
  return edgesByTier;
}

function buildComponentsForTier(edgesRaw, rankByNodeId) {
  const edges = Array.isArray(edgesRaw) ? edgesRaw : [];
  const adjacency = {};
  const nodeSet = new Set();
  function addEdge(fromRaw, toRaw) {
    const from = toText(fromRaw);
    const to = toText(toRaw);
    if (!from || !to || from === to) return;
    nodeSet.add(from);
    nodeSet.add(to);
    if (!adjacency[from]) adjacency[from] = new Set();
    if (!adjacency[to]) adjacency[to] = new Set();
    adjacency[from].add(to);
    adjacency[to].add(from);
  }
  edges.forEach((edge) => addEdge(edge?.source_id, edge?.target_id));
  const orderedNodes = Array.from(nodeSet).sort((a, b) => compareNodeIds(a, b, rankByNodeId));
  const visited = new Set();
  const components = [];
  orderedNodes.forEach((nodeId) => {
    if (visited.has(nodeId)) return;
    const stack = [nodeId];
    const component = [];
    visited.add(nodeId);
    while (stack.length) {
      const current = toText(stack.pop());
      if (!current) continue;
      component.push(current);
      const neighbors = Array.from(adjacency[current] || []).sort((a, b) => compareNodeIds(a, b, rankByNodeId));
      neighbors.forEach((nextId) => {
        if (visited.has(nextId)) return;
        visited.add(nextId);
        stack.push(nextId);
      });
    }
    component.sort((a, b) => compareNodeIds(a, b, rankByNodeId));
    components.push(component);
  });
  components.sort((a, b) => compareNodeIds(a?.[0], b?.[0], rankByNodeId));
  return components;
}

export function buildNodePathUpdatesFromFlowMeta({
  flowMetaById,
  graphContext,
} = {}) {
  const rankByNodeId = asObject(asObject(graphContext).rankByNodeId);
  const flowEndpointsById = asObject(asObject(graphContext).flowEndpointsById);
  const edgesByTier = collectTierEdges(flowMetaById, flowEndpointsById);
  const nodeTierSet = {};
  const nodeTierSequence = {};
  const tierStats = { P0: 0, P1: 0, P2: 0 };

  ["P0", "P1", "P2"].forEach((tier) => {
    const components = buildComponentsForTier(edgesByTier[tier], rankByNodeId);
    tierStats[tier] = components.length;
    components.forEach((component, index) => {
      const sequenceKey = sequenceKeyForTierAndComponent(tier, index) || defaultSequenceKeyForTier(tier);
      component.forEach((nodeIdRaw) => {
        const nodeId = toText(nodeIdRaw);
        if (!nodeId) return;
        if (!nodeTierSet[nodeId]) nodeTierSet[nodeId] = new Set();
        nodeTierSet[nodeId].add(tier);
        if (!nodeTierSequence[nodeId]) nodeTierSequence[nodeId] = {};
        if (!toText(nodeTierSequence[nodeId][tier])) {
          nodeTierSequence[nodeId][tier] = sequenceKey;
        }
      });
    });
  });

  const orderedNodeIds = Object.keys(nodeTierSet).sort((a, b) => compareNodeIds(a, b, rankByNodeId));
  const updates = orderedNodeIds.map((nodeId) => {
    const paths = NODE_PATH_TAG_ORDER.filter((tag) => nodeTierSet[nodeId]?.has(tag));
    const primaryTier = paths[0] || "";
    const sequenceKey = toText(nodeTierSequence[nodeId]?.[primaryTier]) || defaultSequenceKeyForTier(primaryTier);
    return {
      node_id: nodeId,
      paths,
      sequence_key: sequenceKey,
      source: "color_auto",
    };
  });

  return {
    updates,
    stats: {
      nodes_total: updates.length,
      components_by_tier: tierStats,
    },
  };
}

