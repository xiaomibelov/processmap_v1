import { extractDrawioElementIdsFromSvg } from "../drawioSvg.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function toNumber(valueRaw, fallback = 0) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : fallback;
}

export function buildDrawioNormalizationSnapshot({
  sessionId,
  drawioMeta,
  source = "unknown",
} = {}) {
  const sid = toText(sessionId);
  const meta = asObject(drawioMeta);
  const rows = asArray(meta.drawio_elements_v1).map((rowRaw) => asObject(rowRaw));
  const svgIds = new Set(extractDrawioElementIdsFromSvg(meta.svg_cache, { includeTechnical: true }));
  let invalidRows = 0;
  let ghostRows = 0;
  let deletedRows = 0;
  rows.forEach((row) => {
    const id = toText(row.id);
    if (!id) {
      invalidRows += 1;
      return;
    }
    if (row.deleted === true) deletedRows += 1;
    if (svgIds.size > 0 && !svgIds.has(id) && row.deleted !== true) {
      ghostRows += 1;
    }
  });
  return {
    key: sid ? `overlay_norm:${sid}` : "",
    source: toText(source) || "unknown",
    captured_at: new Date().toISOString(),
    enabled: meta.enabled === true,
    has_preview: toText(meta.svg_cache).length > 0,
    element_count: rows.length,
    deleted_count: deletedRows,
    invalid_count: invalidRows,
    ghost_count: ghostRows,
    opacity: Math.max(0.05, Math.min(1, toNumber(meta.opacity, 1))),
    interaction_mode: toText(meta.interaction_mode || "view").toLowerCase() || "view",
  };
}

export function publishDrawioNormalizationSnapshot(input = {}) {
  const snapshot = buildDrawioNormalizationSnapshot(input);
  if (typeof window === "undefined" || !window || typeof window !== "object") return snapshot;
  const historyStore = Array.isArray(window.__FPC_OVERLAY_NORM_HISTORY__)
    ? window.__FPC_OVERLAY_NORM_HISTORY__
    : [];
  historyStore.push(snapshot);
  while (historyStore.length > 50) historyStore.shift();
  window.__FPC_OVERLAY_NORM_HISTORY__ = historyStore;
  window.__FPC_OVERLAY_NORM_LAST__ = snapshot;
  if (typeof window.__FPC_REDIS_NORM_PUT__ === "function" && snapshot.key) {
    try {
      window.__FPC_REDIS_NORM_PUT__(snapshot.key, snapshot);
    } catch {
    }
  }
  return snapshot;
}
