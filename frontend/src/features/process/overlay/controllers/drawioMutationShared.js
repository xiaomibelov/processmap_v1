function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function escapeRegExp(valueRaw) {
  return String(valueRaw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeIdList(idsRaw) {
  return Array.from(new Set(asArray(idsRaw).map((row) => toText(row)).filter(Boolean)));
}

function patchElementById(elementsRaw, elementId, patchFn) {
  const elements = asArray(elementsRaw);
  const idx = elements.findIndex((rowRaw) => toText(asObject(rowRaw).id) === elementId);
  if (idx === -1) return { elements, changed: false };
  const row = asObject(elements[idx]);
  const next = patchFn(row);
  if (next === row) return { elements, changed: false };
  const nextElements = elements.slice();
  nextElements[idx] = next;
  return { elements: nextElements, changed: true };
}

export {
  asArray,
  asObject,
  escapeRegExp,
  normalizeIdList,
  patchElementById,
  toText,
};
