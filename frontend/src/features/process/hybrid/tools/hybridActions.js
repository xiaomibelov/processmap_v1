import { normalizeHybridV2Doc } from "../hybridLayerV2.js";
import { deleteHybridIds as deleteHybridIdsDetailed } from "../actions/hybridDelete.js";

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

export function deleteHybridIds(hybridRaw, idsRaw) {
  return deleteHybridIdsDetailed(hybridRaw, idsRaw).nextHybridV2;
}

export function renameHybridText(hybridRaw, idRaw, nextTextRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  if (!id) return doc;
  const nextText = String(nextTextRaw ?? "");
  return normalizeHybridV2Doc({
    ...doc,
    elements: asArray(doc.elements).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (toText(row.id) !== id) return row;
      return {
        ...row,
        text: nextText,
      };
    }),
  });
}

export function setHybridIdsVisible(hybridRaw, idsRaw, visibleRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const ids = new Set(normalizeIdList(idsRaw));
  if (!ids.size) return doc;
  const visible = !!visibleRaw;
  return normalizeHybridV2Doc({
    ...doc,
    elements: asArray(doc.elements).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (!ids.has(toText(row.id))) return row;
      return { ...row, visible };
    }),
    edges: asArray(doc.edges).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (!ids.has(toText(row.id))) return row;
      return { ...row, visible };
    }),
  });
}

export function collectHybridLayerIdsForIds(hybridRaw, idsRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const ids = new Set(normalizeIdList(idsRaw));
  if (!ids.size) return [];
  return Array.from(new Set(
    [
      ...asArray(doc.elements)
        .filter((rowRaw) => ids.has(toText(asObject(rowRaw).id)))
        .map((rowRaw) => toText(asObject(rowRaw).layer_id)),
      ...asArray(doc.edges)
        .filter((rowRaw) => ids.has(toText(asObject(rowRaw).id)))
        .map((rowRaw) => toText(asObject(rowRaw).layer_id)),
    ].filter(Boolean),
  ));
}

export function setHybridLayerLocked(hybridRaw, layerIdsRaw, lockedRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const layerIds = new Set(normalizeIdList(layerIdsRaw));
  if (!layerIds.size) return doc;
  const locked = !!lockedRaw;
  return normalizeHybridV2Doc({
    ...doc,
    layers: asArray(doc.layers).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (!layerIds.has(toText(row.id))) return row;
      return {
        ...row,
        locked,
      };
    }),
  });
}
