function isFn(value) {
  return typeof value === "function";
}

export function areCamundaPropertiesSectionPropsEqual(prevPropsRaw, nextPropsRaw) {
  const prevProps = prevPropsRaw && typeof prevPropsRaw === "object" ? prevPropsRaw : {};
  const nextProps = nextPropsRaw && typeof nextPropsRaw === "object" ? nextPropsRaw : {};
  const keys = new Set([
    ...Object.keys(prevProps),
    ...Object.keys(nextProps),
  ]);

  for (const key of keys) {
    const prevValue = prevProps[key];
    const nextValue = nextProps[key];

    // Function props must be compared by identity. Many callbacks close over
    // current draft state, so ignoring them causes the memoized panel to use
    // stale handlers (e.g. saving with pre-deletion properties).
    if (isFn(prevValue) || isFn(nextValue)) {
      if (prevValue !== nextValue) {
        return false;
      }
      continue;
    }

    if (!Object.is(prevValue, nextValue)) {
      return false;
    }
  }

  return true;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildPropertiesOverlayPreviewSignature(previewRaw) {
  if (!previewRaw || typeof previewRaw !== "object") return "null";
  const preview = previewRaw;
  const enabled = preview.enabled === true ? "1" : "0";
  const elementId = asText(preview.elementId).trim();
  const hiddenCount = String(asNumber(preview.hiddenCount, 0));
  const visibleCount = String(asNumber(preview.visibleCount, 0));
  const totalCount = String(asNumber(preview.totalCount, 0));
  const itemsSignature = asArray(preview.items)
    .map((itemRaw) => {
      const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
      const key = asText(item.key);
      const label = asText(item.label).replace(/\s+/g, " ").trim();
      const value = asText(item.value).replace(/\s+/g, " ").trim();
      return `${key}\u241f${label}\u241f${value}`;
    })
    .join("\u241e");
  const displayName = asText(preview.displayName).replace(/\s+/g, " ").trim();
  return `${enabled}|${elementId}|${hiddenCount}|${visibleCount}|${totalCount}|${itemsSignature}|${displayName}`;
}
