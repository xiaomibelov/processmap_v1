function asText(value) {
  return String(value || "").trim();
}

export function getStableCamundaEntryBySemanticCache({
  cacheRef,
  elementId,
  canonical,
  entry,
} = {}) {
  const cache = cacheRef && typeof cacheRef === "object" ? cacheRef : null;
  const nextElementId = asText(elementId);
  const nextCanonical = asText(canonical);
  const nextEntry = entry && typeof entry === "object" ? entry : {};

  const prev = cache?.current && typeof cache.current === "object" ? cache.current : null;
  if (
    prev
    && asText(prev.elementId) === nextElementId
    && asText(prev.canonical) === nextCanonical
    && prev.value
    && typeof prev.value === "object"
  ) {
    return prev.value;
  }

  if (cache) {
    cache.current = {
      elementId: nextElementId,
      canonical: nextCanonical,
      value: nextEntry,
    };
  }
  return nextEntry;
}
