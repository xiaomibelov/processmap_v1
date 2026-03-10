import { normalizeHybridV2Doc } from "../hybridLayerV2.js";
import { deleteHybridIds as deleteHybridIdsDetailed } from "../actions/hybridDelete.js";
import {
  setHybridItemVisible,
  updateHybridText,
} from "../actions/hybridUpdate.js";

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
  return updateHybridText(hybridRaw, idRaw, nextTextRaw);
}

export function setHybridIdsVisible(hybridRaw, idsRaw, visibleRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const ids = new Set(normalizeIdList(idsRaw));
  if (!ids.size) return doc;
  let next = doc;
  ids.forEach((id) => {
    next = setHybridItemVisible(next, id, visibleRaw);
  });
  return next;
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
