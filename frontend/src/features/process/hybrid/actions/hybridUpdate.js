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

export function updateHybridText(hybridRaw, idRaw, textRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  if (!id) return doc;
  return normalizeHybridV2Doc({
    ...doc,
    elements: asArray(doc.elements).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (toText(row.id) !== id) return row;
      return { ...row, text: String(textRaw ?? "") };
    }),
  });
}

export function updateHybridElementRect(hybridRaw, idRaw, rectRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  const rect = asObject(rectRaw);
  if (!id) return doc;
  return normalizeHybridV2Doc({
    ...doc,
    elements: asArray(doc.elements).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (toText(row.id) !== id) return row;
      return {
        ...row,
        x: Number(rect.x ?? row.x ?? 0),
        y: Number(rect.y ?? row.y ?? 0),
        w: Number(rect.w ?? row.w ?? 0),
        h: Number(rect.h ?? row.h ?? 0),
      };
    }),
  });
}

export function setHybridItemVisible(hybridRaw, idRaw, visibleRaw) {
  const doc = normalizeHybridV2Doc(hybridRaw);
  const id = toText(idRaw);
  if (!id) return doc;
  const visible = !!visibleRaw;
  return normalizeHybridV2Doc({
    ...doc,
    elements: asArray(doc.elements).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (toText(row.id) !== id) return row;
      return { ...row, visible };
    }),
    edges: asArray(doc.edges).map((rowRaw) => {
      const row = asObject(rowRaw);
      if (toText(row.id) !== id) return row;
      return { ...row, visible };
    }),
  });
}
