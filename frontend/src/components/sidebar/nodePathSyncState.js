const NODE_PATH_TAG_ORDER = ["P0", "P1", "P2"];
const NODE_PATH_SYNC_PREVIEW_STATES = ["saved", "local", "syncing", "offline", "attention", "error"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeNodePathTag(value) {
  const tag = String(value || "").trim().toUpperCase();
  if (tag === "P0" || tag === "P1" || tag === "P2") return tag;
  return "";
}

export function normalizeSequenceKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function buildNodePathComparableSnapshot(rawEntry) {
  const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const seen = new Set();
  return {
    paths: asArray(entry.paths)
      .map((item) => normalizeNodePathTag(item))
      .filter((tag) => {
        if (!tag || seen.has(tag)) return false;
        seen.add(tag);
        return true;
      })
      .sort((a, b) => NODE_PATH_TAG_ORDER.indexOf(a) - NODE_PATH_TAG_ORDER.indexOf(b)),
    sequence_key: normalizeSequenceKey(entry.sequence_key || entry.sequenceKey),
  };
}

export function hasNodePathLocalChanges({ draft, saved }) {
  return JSON.stringify(buildNodePathComparableSnapshot(draft)) !== JSON.stringify(buildNodePathComparableSnapshot(saved));
}

export function deriveNodePathSyncState({
  isSyncing = false,
  hasError = false,
  needsAttention = false,
  isOffline = false,
  hasLocalChanges = false,
} = {}) {
  if (isSyncing) return "syncing";
  if (hasError) return "error";
  if (needsAttention) return "attention";
  if (isOffline) return "offline";
  if (hasLocalChanges) return "local";
  return "saved";
}

export function resolveNodePathStatusState({
  runtimeState = "saved",
  previewState = "",
  previewEnabled = false,
  isDevRuntime = false,
} = {}) {
  const normalizedRuntimeStateRaw = String(runtimeState || "").trim().toLowerCase();
  const normalizedRuntimeState = normalizedRuntimeStateRaw === "syncing"
    ? "syncing"
    : (normalizedRuntimeStateRaw === "error"
      ? "error"
      : (normalizedRuntimeStateRaw === "attention"
        ? "attention"
      : (normalizedRuntimeStateRaw === "offline"
        ? "offline"
        : (normalizedRuntimeStateRaw === "local" ? "local" : "saved"))));
  const normalizedPreviewState = String(previewState || "").trim().toLowerCase();
  const hasExplicitPreviewState = NODE_PATH_SYNC_PREVIEW_STATES.includes(normalizedPreviewState);
  const nextPreviewState = hasExplicitPreviewState ? normalizedPreviewState : "saved";
  const isPreviewMode = hasExplicitPreviewState || (isDevRuntime && !!previewEnabled);
  return isPreviewMode ? nextPreviewState : normalizedRuntimeState;
}
