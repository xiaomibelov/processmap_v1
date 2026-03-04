import { normalizeHybridV2Doc } from "../hybridLayerV2.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function normalizeIdList(idsRaw) {
  return Array.from(new Set(asArray(idsRaw).map((row) => toText(row)).filter(Boolean)));
}

export function deleteHybridIds(hybridV2Raw, idsToDeleteRaw) {
  const hybridV2 = normalizeHybridV2Doc(hybridV2Raw);
  const idsToDelete = new Set(normalizeIdList(idsToDeleteRaw));
  if (!idsToDelete.size) {
    return {
      nextHybridV2: hybridV2,
      deleted: { elements: [], edges: [] },
      cleanedBindingsCount: 0,
    };
  }

  const deletedElementIds = [];
  const deletedElementIdSet = new Set();
  const nextElements = asArray(hybridV2.elements).filter((rowRaw) => {
    const id = toText(asObject(rowRaw).id);
    if (!id || !idsToDelete.has(id)) return true;
    deletedElementIds.push(id);
    deletedElementIdSet.add(id);
    return false;
  });

  const deletedEdgeIds = [];
  const deletedEdgeIdSet = new Set();
  const nextEdges = asArray(hybridV2.edges).filter((rowRaw) => {
    const row = asObject(rowRaw);
    const edgeId = toText(row.id);
    if (!edgeId) return false;
    const fromId = toText(asObject(row.from).element_id);
    const toId = toText(asObject(row.to).element_id);
    const shouldDelete = idsToDelete.has(edgeId)
      || deletedElementIdSet.has(fromId)
      || deletedElementIdSet.has(toId);
    if (!shouldDelete) return true;
    deletedEdgeIds.push(edgeId);
    deletedEdgeIdSet.add(edgeId);
    return false;
  });

  const nextBindings = asArray(hybridV2.bindings).filter((rowRaw) => {
    const hybridId = toText(asObject(rowRaw).hybrid_id);
    if (!hybridId) return false;
    return !deletedElementIdSet.has(hybridId) && !deletedEdgeIdSet.has(hybridId);
  });

  const nextHybridV2 = normalizeHybridV2Doc({
    ...hybridV2,
    elements: nextElements,
    edges: nextEdges,
    bindings: nextBindings,
  });

  return {
    nextHybridV2,
    deleted: {
      elements: deletedElementIds,
      edges: deletedEdgeIds,
    },
    cleanedBindingsCount: Math.max(0, Number(asArray(hybridV2.bindings).length || 0) - Number(nextBindings.length || 0)),
  };
}
