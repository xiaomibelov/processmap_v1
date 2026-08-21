import {
  normalizePathSequenceKey,
  normalizePathTier,
  normalizePathTierList,
} from "../../features/process/pathClassification.js";

const NODE_PATH_SYNC_PREVIEW_STATES = ["saved", "local", "syncing", "offline", "attention", "error"];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeNodePathTag(value) {
  return normalizePathTier(value);
}

export function normalizeSequenceKey(value) {
  return normalizePathSequenceKey(value);
}

export function buildNodePathComparableSnapshot(rawEntry) {
  const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  return {
    paths: normalizePathTierList(asArray(entry.paths)),
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
