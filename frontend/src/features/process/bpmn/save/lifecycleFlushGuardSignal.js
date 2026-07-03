function toText(value) {
  return String(value || "");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeXmlForLifecycleGuard(xmlText) {
  const raw = toText(xmlText).trim();
  if (!raw) return "";
  return raw
    .replace(/>\s+</g, "><")
    .replace(/\s+\/>/g, "/>")
    .replace(/\s+/g, " ")
    .trim();
}

function saveAttemptKindBySource(sourceText) {
  const source = toText(sourceText).toLowerCase();
  if (source.includes("tab_switch")) return "tab_switch";
  if (source.includes("beforeunload") || source.includes("pagehide") || source.includes("visibility_hidden")) {
    return "lifecycle_flush";
  }
  return "manual";
}

export function isLifecycleFlushSource(sourceText) {
  return saveAttemptKindBySource(sourceText) === "lifecycle_flush";
}

export function resolveLifecycleFlushGuardSignal({
  source = "",
  saveDebugState = null,
  liveRuntimeXml = "",
  fallbackXml = "",
} = {}) {
  if (!isLifecycleFlushSource(source)) {
    return {
      skip: false,
      reason: "not_lifecycle_flush",
      dirty: false,
      rev: 0,
      lastSavedRev: 0,
      hasFreshDirtyDelta: false,
    };
  }
  const debugState = asObject(saveDebugState);
  const storeState = asObject(debugState.store);
  if (!Object.keys(storeState).length) {
    return {
      skip: false,
      reason: "missing_store_state",
      dirty: false,
      rev: 0,
      lastSavedRev: 0,
      hasFreshDirtyDelta: false,
    };
  }
  const dirty = storeState.dirty === true;
  const rev = asNumber(storeState.rev, 0);
  const lastSavedRev = asNumber(storeState.lastSavedRev, 0);
  const baselineXml = toText(storeState.xml || fallbackXml);
  const baselineNormalized = normalizeXmlForLifecycleGuard(baselineXml);
  const liveNormalized = normalizeXmlForLifecycleGuard(liveRuntimeXml);
  const hasFreshDirtyDelta = !!liveNormalized && !!baselineNormalized && liveNormalized !== baselineNormalized;
  return {
    skip: !dirty && !hasFreshDirtyDelta && rev <= lastSavedRev,
    reason: !dirty && !hasFreshDirtyDelta && rev <= lastSavedRev
      ? "lifecycle_no_dirty_delta"
      : "lifecycle_dirty_delta_present",
    dirty,
    rev,
    lastSavedRev,
    hasFreshDirtyDelta,
    baselineXml,
    liveRuntimeXml: toText(liveRuntimeXml),
  };
}
