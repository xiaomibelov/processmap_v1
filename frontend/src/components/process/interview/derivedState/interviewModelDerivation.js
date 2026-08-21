import {
  toArray,
  toText,
  dedupNames,
  computeNodeOrder,
} from "../utils";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildLaneByNodeFromXml(laneMetaByNodeFromXml) {
  const out = {};
  Object.keys(laneMetaByNodeFromXml || {}).forEach((nodeId) => {
    out[nodeId] = toText(laneMetaByNodeFromXml[nodeId]?.name);
  });
  return out;
}

export function buildBackendNodes(nodes, laneByNodeFromXml, nodeKindByIdFromXml, virtualEventNodes) {
  const real = toArray(nodes)
    .map((n) => ({
      id: toText(n?.id),
      title: toText(n?.title || n?.name),
      actorRole: toText(n?.actor_role || n?.role || laneByNodeFromXml[toText(n?.id)]),
      nodeType: toText(n?.type),
      bpmnKind: toText(nodeKindByIdFromXml[toText(n?.id)]),
      parameters: n?.parameters && typeof n.parameters === "object" ? n.parameters : {},
    }))
    .filter((n) => n.id);
  const byId = new Map();
  real.forEach((n) => byId.set(n.id, n));
  toArray(virtualEventNodes).forEach((n) => {
    if (!byId.has(n.id)) byId.set(n.id, n);
  });
  return Array.from(byId.values());
}

export function buildBackendEdges(edges) {
  return toArray(edges).map((e) => ({
    from_id: toText(e?.from_id || e?.from || e?.source_id || e?.sourceId),
    to_id: toText(e?.to_id || e?.to || e?.target_id || e?.targetId),
    when: toText(e?.when || e?.label || ""),
  }));
}

export function buildActorNames(actorsDerived, roles) {
  const names = toArray(actorsDerived)
    .map((x) => toText(x?.name || x?.laneName || x?.label))
    .filter(Boolean);
  if (names.length) return dedupNames(names);
  return dedupNames(
    toArray(roles)
      .map((x) => toText(x))
      .filter(Boolean),
  );
}

export function buildCreationNodeOrder(steps, backendNodes) {
  const seen = new Set();
  const out = [];
  const orderedSteps = toArray(steps)
    .map((step, idx) => ({
      step,
      idx,
      orderIdx: Number(step?.order_index || step?.order || idx + 1),
    }))
    .sort((a, b) => {
      if (a.orderIdx !== b.orderIdx) return a.orderIdx - b.orderIdx;
      return a.idx - b.idx;
    });
  orderedSteps.forEach(({ step }) => {
    const nodeId = toText(step?.bpmn_ref || step?.node_bind_id || step?.node_id || step?.nodeId);
    if (!nodeId || seen.has(nodeId)) return;
    seen.add(nodeId);
    out.push(nodeId);
  });
  toArray(backendNodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId || seen.has(nodeId)) return;
    seen.add(nodeId);
    out.push(nodeId);
  });
  return out;
}

export function buildGraphNodeOrder({
  backendNodes,
  backendEdges,
  xmlNodeOrder,
  creationNodeOrder,
  orderMode,
  bpmnOrderFallback,
}) {
  const out = [];
  const seen = new Set();
  function pushUnique(nodeIdRaw) {
    const nodeId = toText(nodeIdRaw);
    if (!nodeId || seen.has(nodeId)) return;
    seen.add(nodeId);
    out.push(nodeId);
  }

  if (orderMode === "bpmn" && !bpmnOrderFallback && toArray(xmlNodeOrder).length) {
    const known = new Set(toArray(backendNodes).map((n) => toText(n?.id)).filter(Boolean));
    const fromXml = toArray(xmlNodeOrder).filter((id) => known.has(id));
    fromXml.forEach((id) => pushUnique(id));
  } else if (toArray(creationNodeOrder).length) {
    toArray(creationNodeOrder).forEach((id) => pushUnique(id));
  } else {
    computeNodeOrder(backendNodes, backendEdges).forEach((id) => pushUnique(id));
  }
  toArray(backendNodes).forEach((node) => pushUnique(node?.id));
  return out;
}

export function buildGraphNodeRank(graphNodeOrder) {
  const out = {};
  toArray(graphNodeOrder).forEach((id, idx) => {
    out[id] = idx;
  });
  return out;
}

export function buildSubprocessCatalog(steps, subprocesses, backendNodes) {
  const fromSteps = toArray(steps).map((x) => x?.subprocess);
  const fromRoot = toArray(subprocesses);
  const fromBackend = toArray(backendNodes).map((x) => x?.parameters?.interview_subprocess);
  return dedupNames([...fromRoot, ...fromSteps, ...fromBackend]);
}

export function buildTransitionLabelByKey(transitions) {
  const out = {};
  toArray(transitions).forEach((tr) => {
    const fromId = toText(tr?.from_node_id || tr?.from || tr?.source_id || tr?.sourceId);
    const toId = toText(tr?.to_node_id || tr?.to || tr?.target_id || tr?.targetId);
    if (!fromId || !toId) return;
    out[`${fromId}__${toId}`] = toText(tr?.when || tr?.label || "");
  });
  return out;
}

export function buildFlowMetaById(bpmnMetaRaw) {
  const rawMeta = asObject(bpmnMetaRaw);
  const rawFlowMeta = asObject(rawMeta?.flow_meta);
  const out = {};
  Object.keys(rawFlowMeta).forEach((rawFlowId) => {
    const flowId = toText(rawFlowId);
    if (!flowId) return;
    const entry = asObject(rawFlowMeta[rawFlowId]);
    const tier = toText(entry?.tier).toUpperCase();
    const rtier = toText(entry?.rtier).toUpperCase();
    if (tier === "P0" || tier === "P1" || tier === "P2") {
      out[flowId] = { ...(out[flowId] || {}), tier };
    }
    if (rtier === "R0" || rtier === "R1" || rtier === "R2") {
      out[flowId] = { ...(out[flowId] || {}), rtier };
    }
    if (entry?.happy) out[flowId] = { ...(out[flowId] || {}), tier: "P0" };
  });
  return out;
}

export function buildNodePathMetaByNodeId(bpmnMetaRaw) {
  const rawMeta = asObject(bpmnMetaRaw);
  const rawNodeMeta = asObject(rawMeta?.node_path_meta);
  const out = {};
  Object.keys(rawNodeMeta).forEach((rawNodeId) => {
    const nodeId = toText(rawNodeId);
    if (!nodeId) return;
    const entry = asObject(rawNodeMeta[rawNodeId]);
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

export function buildNodeMetaById(backendNodes, timelineBaseView, nodeKindByIdFromXml) {
  const out = {};
  toArray(backendNodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    out[nodeId] = {
      title: toText(node?.title) || nodeId,
      lane: toText(node?.actorRole),
      kind: toText(node?.bpmnKind || nodeKindByIdFromXml[nodeId]).toLowerCase(),
    };
  });
  toArray(timelineBaseView).forEach((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    if (!nodeId) return;
    const prev = out[nodeId] || {};
    out[nodeId] = {
      title: toText(step?.action) || prev.title || nodeId,
      lane: toText(step?.lane_name) || prev.lane || "",
      kind: toText(step?.node_bind_kind || prev.kind || nodeKindByIdFromXml[nodeId]).toLowerCase(),
    };
  });
  return out;
}
