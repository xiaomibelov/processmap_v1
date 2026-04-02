function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNodePathTag(value) {
  const tag = String(value || "").trim().toUpperCase();
  if (tag === "P0" || tag === "P1" || tag === "P2") return tag;
  return "";
}

function normalizeNodePathTagList(value) {
  return Array.from(new Set(
    asArray(value)
      .map((item) => normalizeNodePathTag(item))
      .filter(Boolean),
  )).sort((left, right) => {
    const order = ["P0", "P1", "P2"];
    return order.indexOf(left) - order.indexOf(right);
  });
}

function normalizeSequenceKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function deriveNodePathCompareSummary({
  localPaths = [],
  sharedPaths = [],
  localSequenceKey = "",
  sharedSequenceKey = "",
} = {}) {
  const normalizedLocalPaths = normalizeNodePathTagList(localPaths);
  const normalizedSharedPaths = normalizeNodePathTagList(sharedPaths);
  const sharedSet = new Set(normalizedSharedPaths);
  const localSet = new Set(normalizedLocalPaths);
  const commonPaths = normalizedLocalPaths.filter((tag) => sharedSet.has(tag));
  const localOnlyPaths = normalizedLocalPaths.filter((tag) => !sharedSet.has(tag));
  const sharedOnlyPaths = normalizedSharedPaths.filter((tag) => !localSet.has(tag));
  const normalizedLocalSequence = normalizeSequenceKey(localSequenceKey);
  const normalizedSharedSequence = normalizeSequenceKey(sharedSequenceKey);
  const sequenceDiffers = normalizedLocalSequence !== normalizedSharedSequence;
  return {
    localPaths: normalizedLocalPaths,
    sharedPaths: normalizedSharedPaths,
    commonPaths,
    localOnlyPaths,
    sharedOnlyPaths,
    localSequenceKey: normalizedLocalSequence,
    sharedSequenceKey: normalizedSharedSequence,
    sequenceDiffers,
    hasDifferences: localOnlyPaths.length > 0 || sharedOnlyPaths.length > 0 || sequenceDiffers,
  };
}
