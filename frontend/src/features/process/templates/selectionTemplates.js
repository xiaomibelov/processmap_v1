function toText(value) {
  return String(value || "").trim();
}

function toToken(value) {
  return toText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeNamesList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const value = toText(list[i]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function toSafeCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function normalizeTemplateScope(raw) {
  const scope = toText(raw).toLowerCase();
  if (scope === "org") return "org";
  return "personal";
}

export function normalizeTemplateElementIds(rawList) {
  const seen = new Set();
  const out = [];
  const list = Array.isArray(rawList) ? rawList : [];
  for (let i = 0; i < list.length; i += 1) {
    const value = toText(list[i]);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function normalizeTemplateElementRefs(rawList, allowedIdsRaw = []) {
  const allowedIds = normalizeTemplateElementIds(allowedIdsRaw);
  const allowed = allowedIds.length ? new Set(allowedIds) : null;
  const seen = new Set();
  const out = [];
  const list = Array.isArray(rawList) ? rawList : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] && typeof list[i] === "object" ? list[i] : {};
    const id = toText(item.id);
    if (!id || seen.has(id)) continue;
    if (allowed && !allowed.has(id)) continue;
    seen.add(id);
    const kindRaw = toText(item.kind).toLowerCase();
    const kind = kindRaw === "edge" ? "edge" : "node";
    const normalized = {
      id,
      kind,
      name: toText(item.name),
      type: toText(item.type),
      lane_name: toText(item.lane_name || item.laneName || item.lane),
    };
    if (kind === "node") {
      const incomingCount = toSafeCount(item.incoming_count ?? item.incomingCount);
      const outgoingCount = toSafeCount(item.outgoing_count ?? item.outgoingCount);
      const incomingNames = normalizeNamesList(item.incoming_names || item.incomingNames);
      const outgoingNames = normalizeNamesList(item.outgoing_names || item.outgoingNames);
      if (incomingCount != null) normalized.incoming_count = incomingCount;
      if (outgoingCount != null) normalized.outgoing_count = outgoingCount;
      if (incomingNames.length) normalized.incoming_names = incomingNames;
      if (outgoingNames.length) normalized.outgoing_names = outgoingNames;
    }
    if (kind === "edge") {
      const sourceId = toText(item.source_id || item.sourceId || item.from_id || item.fromId || item.source || item.from);
      const targetId = toText(item.target_id || item.targetId || item.to_id || item.toId || item.target || item.to);
      const sourceName = toText(item.source_name || item.sourceName || item.from_name || item.fromName);
      const targetName = toText(item.target_name || item.targetName || item.to_name || item.toName);
      if (sourceId) normalized.source_id = sourceId;
      if (targetId) normalized.target_id = targetId;
      if (sourceName) normalized.source_name = sourceName;
      if (targetName) normalized.target_name = targetName;
    }
    out.push(normalized);
  }
  return out;
}

export function buildSelectionTemplatePayload(options = {}) {
  const ids = normalizeTemplateElementIds(options?.selectedElementIds);
  const refs = normalizeTemplateElementRefs(options?.selectedElementRefs, ids);
  return {
    bpmn_element_ids: ids,
    bpmn_element_refs: refs,
    bpmn_fingerprint: toText(options?.bpmnFingerprint),
  };
}

export function readTemplateElementIds(templateRaw) {
  const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
  const payload = template.payload && typeof template.payload === "object" ? template.payload : {};
  return normalizeTemplateElementIds(payload.bpmn_element_ids);
}

export function readTemplateElementRefs(templateRaw) {
  const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
  const payload = template.payload && typeof template.payload === "object" ? template.payload : {};
  const ids = normalizeTemplateElementIds(payload.bpmn_element_ids);
  return normalizeTemplateElementRefs(payload.bpmn_element_refs, ids);
}

export function remapTemplateNodeIdsByRefs(options = {}) {
  const ids = normalizeTemplateElementIds(options?.ids);
  const refs = normalizeTemplateElementRefs(options?.elementRefs, ids);
  const selectedSet = new Set(normalizeTemplateElementIds(options?.selectedIds));
  const refById = new Map(refs.map((ref) => [ref.id, ref]));
  const nodesRaw = options?.currentNodesById && typeof options.currentNodesById === "object"
    ? options.currentNodesById
    : {};
  const nodeEntries = Object.entries(nodesRaw).map(([id, nodeRaw]) => {
    const node = nodeRaw && typeof nodeRaw === "object" ? nodeRaw : {};
    return {
      id: toText(id),
      nameToken: toToken(node.name),
      typeToken: toToken(node.type),
      laneToken: toToken(node.lane_name || node.laneName || node.lane),
    };
  }).filter((entry) => entry.id && entry.nameToken);
  const nodeIdsByNameToken = new Map();
  nodeEntries.forEach((entry) => {
    const key = entry.nameToken;
    if (!key) return;
    if (!nodeIdsByNameToken.has(key)) nodeIdsByNameToken.set(key, []);
    nodeIdsByNameToken.get(key).push(entry.id);
  });
  const nodeIdMap = new Map();
  nodeEntries.forEach((entry) => {
    nodeIdMap.set(entry.id, entry.id);
  });
  const flowsRaw = options?.currentFlowsById && typeof options.currentFlowsById === "object"
    ? options.currentFlowsById
    : {};
  const flowEntries = Object.entries(flowsRaw).map(([id, flowRaw]) => {
    const flow = flowRaw && typeof flowRaw === "object" ? flowRaw : {};
    return {
      id: toText(id),
      sourceId: toText(flow.sourceId || flow.source_id || flow.from_id || flow.from),
      targetId: toText(flow.targetId || flow.target_id || flow.to_id || flow.to),
      nameToken: toToken(flow.name || flow.label || flow.title),
    };
  }).filter((entry) => entry.id && entry.sourceId && entry.targetId);
  const nodeNameTokenById = new Map();
  nodeEntries.forEach((entry) => {
    nodeNameTokenById.set(entry.id, entry.nameToken);
  });
  const incomingCountByNodeId = new Map();
  const outgoingCountByNodeId = new Map();
  const incomingNameTokensByNodeId = new Map();
  const outgoingNameTokensByNodeId = new Map();
  flowEntries.forEach((entry) => {
    incomingCountByNodeId.set(entry.targetId, Number(incomingCountByNodeId.get(entry.targetId) || 0) + 1);
    outgoingCountByNodeId.set(entry.sourceId, Number(outgoingCountByNodeId.get(entry.sourceId) || 0) + 1);

    const sourceNameToken = toToken(nodeNameTokenById.get(entry.sourceId));
    const targetNameToken = toToken(nodeNameTokenById.get(entry.targetId));

    if (!incomingNameTokensByNodeId.has(entry.targetId)) incomingNameTokensByNodeId.set(entry.targetId, new Set());
    if (sourceNameToken) incomingNameTokensByNodeId.get(entry.targetId).add(sourceNameToken);

    if (!outgoingNameTokensByNodeId.has(entry.sourceId)) outgoingNameTokensByNodeId.set(entry.sourceId, new Set());
    if (targetNameToken) outgoingNameTokensByNodeId.get(entry.sourceId).add(targetNameToken);
  });

  const mappedIds = [];
  const missingIds = [];
  let ambiguousCount = 0;
  let noMatchCount = 0;

  const nodeIds = [];
  const edgeIds = [];
  for (let i = 0; i < ids.length; i += 1) {
    const sourceId = ids[i];
    const ref = refById.get(sourceId);
    if (ref?.kind === "edge") edgeIds.push(sourceId);
    else nodeIds.push(sourceId);
  }

  for (let i = 0; i < nodeIds.length; i += 1) {
    const sourceId = nodeIds[i];
    const ref = refById.get(sourceId);
    if (!ref || ref.kind !== "node") {
      missingIds.push(sourceId);
      continue;
    }
    const nameToken = toToken(ref.name);
    if (!nameToken) {
      missingIds.push(sourceId);
      noMatchCount += 1;
      continue;
    }
    let candidates = nodeEntries.filter((entry) => entry.nameToken === nameToken && !selectedSet.has(entry.id));
    if (!candidates.length) {
      missingIds.push(sourceId);
      noMatchCount += 1;
      continue;
    }
    const refType = toToken(ref.type);
    if (refType) {
      const typed = candidates.filter((entry) => entry.typeToken === refType);
      if (typed.length) candidates = typed;
    }
    const refLane = toToken(ref.lane_name);
    if (refLane) {
      const laneScoped = candidates.filter((entry) => entry.laneToken === refLane);
      if (laneScoped.length) candidates = laneScoped;
    }
    if (candidates.length > 1) {
      const refIncomingCount = toSafeCount(ref.incoming_count ?? ref.incomingCount);
      if (refIncomingCount != null) {
        const byIncomingCount = candidates.filter(
          (entry) => Number(incomingCountByNodeId.get(entry.id) || 0) === refIncomingCount,
        );
        if (byIncomingCount.length) candidates = byIncomingCount;
      }
    }
    if (candidates.length > 1) {
      const refOutgoingCount = toSafeCount(ref.outgoing_count ?? ref.outgoingCount);
      if (refOutgoingCount != null) {
        const byOutgoingCount = candidates.filter(
          (entry) => Number(outgoingCountByNodeId.get(entry.id) || 0) === refOutgoingCount,
        );
        if (byOutgoingCount.length) candidates = byOutgoingCount;
      }
    }
    if (candidates.length > 1) {
      const refIncomingNames = normalizeNamesList(ref.incoming_names || ref.incomingNames).map((value) => toToken(value)).filter(Boolean);
      const refOutgoingNames = normalizeNamesList(ref.outgoing_names || ref.outgoingNames).map((value) => toToken(value)).filter(Boolean);
      if (refIncomingNames.length || refOutgoingNames.length) {
        let bestScore = -1;
        const scored = candidates.map((entry) => {
          const incomingSet = incomingNameTokensByNodeId.get(entry.id) || new Set();
          const outgoingSet = outgoingNameTokensByNodeId.get(entry.id) || new Set();
          let score = 0;
          refIncomingNames.forEach((token) => {
            if (incomingSet.has(token)) score += 1;
          });
          refOutgoingNames.forEach((token) => {
            if (outgoingSet.has(token)) score += 1;
          });
          if (score > bestScore) bestScore = score;
          return { entry, score };
        });
        if (bestScore > 0) {
          const best = scored.filter((row) => row.score === bestScore).map((row) => row.entry);
          if (best.length) candidates = best;
        }
      }
    }
    if (candidates.length !== 1) {
      missingIds.push(sourceId);
      ambiguousCount += 1;
      continue;
    }
    const targetId = candidates[0].id;
    nodeIdMap.set(sourceId, targetId);
    selectedSet.add(targetId);
    mappedIds.push(targetId);
  }

  function resolveNodeIdFromRef(idRaw, nameRaw) {
    const fromId = toText(idRaw);
    if (fromId && nodeIdMap.has(fromId)) return toText(nodeIdMap.get(fromId));
    const nameToken = toToken(nameRaw);
    if (!nameToken) return "";
    const candidates = (nodeIdsByNameToken.get(nameToken) || []).filter(Boolean);
    if (candidates.length === 1) return toText(candidates[0]);
    return "";
  }

  for (let i = 0; i < edgeIds.length; i += 1) {
    const sourceId = edgeIds[i];
    const ref = refById.get(sourceId);
    if (!ref || ref.kind !== "edge") {
      missingIds.push(sourceId);
      continue;
    }
    const sourceNodeId = resolveNodeIdFromRef(ref.source_id, ref.source_name);
    const targetNodeId = resolveNodeIdFromRef(ref.target_id, ref.target_name);
    let candidates = [];
    if (sourceNodeId && targetNodeId) {
      candidates = flowEntries.filter((entry) => (
        entry.sourceId === sourceNodeId
        && entry.targetId === targetNodeId
        && !selectedSet.has(entry.id)
      ));
    }
    if (!candidates.length) {
      const edgeName = toToken(ref.name);
      if (edgeName) {
        candidates = flowEntries.filter((entry) => entry.nameToken === edgeName && !selectedSet.has(entry.id));
      }
    }
    if (!candidates.length) {
      missingIds.push(sourceId);
      noMatchCount += 1;
      continue;
    }
    if (candidates.length !== 1) {
      missingIds.push(sourceId);
      ambiguousCount += 1;
      continue;
    }
    const targetFlowId = candidates[0].id;
    selectedSet.add(targetFlowId);
    mappedIds.push(targetFlowId);
  }

  return {
    mappedIds,
    missingIds,
    remappedCount: mappedIds.length,
    ambiguousCount,
    noMatchCount,
  };
}

export function canCreateOrgTemplate(roleRaw, isAdminRaw = false) {
  if (Boolean(isAdminRaw)) return true;
  const role = toText(roleRaw).toLowerCase();
  return role === "org_owner" || role === "org_admin" || role === "project_manager";
}

export function canManageOrgTemplate(roleRaw, isAdminRaw = false) {
  if (Boolean(isAdminRaw)) return true;
  const role = toText(roleRaw).toLowerCase();
  return role === "org_owner" || role === "org_admin";
}
