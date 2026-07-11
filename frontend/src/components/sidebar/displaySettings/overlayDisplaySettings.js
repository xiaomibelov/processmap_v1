// Overlay display settings model (property-panel-redesign).
//
// Single source of truth for how property overlays are shown on the canvas:
//   displayMode  — legacy overlay pipeline ("hover" | "always" | "hidden")
//   v2Mode       — V2 overlay pipeline ("none" | "all" | "expanded")
//   hiddenFields — per-field chip filter: property names hidden from overlays.
//                  Fields are ACTIVE BY DEFAULT — a field disappears from
//                  overlays only when explicitly listed here, so newly
//                  discovered fields (a selected element's custom property,
//                  a dictionary update) stay visible until the user hides them.
//
// Mutually exclusive modes are enforced structurally (one dropdown value per
// axis), so the As-Is invalid checkbox combinations are impossible by design.
// Persisted per session in localStorage; all readers validate untrusted input.

export const DISPLAY_MODES = ["hover", "always", "hidden"];
export const V2_MODES = ["none", "all", "expanded"];

const DEFAULT_DISPLAY_MODE = "hover";
const DEFAULT_V2_MODE = "none";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function sanitizeDisplayMode(value) {
  return DISPLAY_MODES.includes(value) ? value : DEFAULT_DISPLAY_MODE;
}

export function sanitizeV2Mode(value) {
  return V2_MODES.includes(value) ? value : DEFAULT_V2_MODE;
}

// Returns a deduped string[] for arrays, or null for non-arrays so the caller
// can apply the default (nothing hidden).
export function sanitizeHiddenFields(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  value.forEach((item) => {
    if (typeof item !== "string") return;
    if (!item) return;
    if (out.includes(item)) return;
    out.push(item);
  });
  return out;
}

export function createDefaultDisplaySettings() {
  return {
    displayMode: DEFAULT_DISPLAY_MODE,
    v2Mode: DEFAULT_V2_MODE,
    hiddenFields: [],
  };
}

// Validates untrusted persisted state (localStorage); every field is repaired
// independently. A missing/non-array hiddenFields means "nothing hidden".
export function readOverlayDisplaySettings(rawValue) {
  const raw = asObject(rawValue);
  if (!raw) return createDefaultDisplaySettings();
  return {
    displayMode: sanitizeDisplayMode(raw.displayMode),
    v2Mode: sanitizeV2Mode(raw.v2Mode),
    hiddenFields: sanitizeHiddenFields(raw.hiddenFields) ?? [],
  };
}

// Migration from the As-Is checkbox #2 localStorage flag
// (`fpc_properties_overlay_always_v1:{sid}`) into the new displayMode axis.
export function migrateLegacyAlwaysFlag(value) {
  if (value === true || value === 1) return "always";
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on" ? "always" : DEFAULT_DISPLAY_MODE;
}

// --- Persistence (per session, localStorage) ---

export const OVERLAY_DISPLAY_STORAGE_PREFIX = "fpc_overlay_display_v1:";
export const LEGACY_ALWAYS_STORAGE_PREFIX = "fpc_properties_overlay_always_v1:";

export function overlayDisplaySettingsStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `${OVERLAY_DISPLAY_STORAGE_PREFIX}${sid}` : "";
}

function legacyAlwaysStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `${LEGACY_ALWAYS_STORAGE_PREFIX}${sid}` : "";
}

function safeGetItem(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

// Loads settings for the session, validating untrusted input. Falls back to
// the legacy always-flag migration when the new key is absent or corrupt.
export function loadOverlayDisplaySettings(storage, sessionId) {
  const key = overlayDisplaySettingsStorageKey(sessionId);
  const raw = key ? safeGetItem(storage, key) : null;
  if (raw !== null && raw !== undefined && raw !== "") {
    try {
      return readOverlayDisplaySettings(JSON.parse(String(raw)));
    } catch {
      // Corrupt value — fall through to legacy migration / defaults.
    }
  }
  const legacyKey = legacyAlwaysStorageKey(sessionId);
  const legacyRaw = legacyKey ? safeGetItem(storage, legacyKey) : null;
  if (legacyRaw !== null && legacyRaw !== undefined && legacyRaw !== "") {
    return {
      ...createDefaultDisplaySettings(),
      displayMode: migrateLegacyAlwaysFlag(legacyRaw),
    };
  }
  return createDefaultDisplaySettings();
}

// Persists settings after validation. Returns false (without throwing) when
// the session id is empty or the storage rejects the write (quota, privacy).
export function saveOverlayDisplaySettings(storage, sessionId, settings) {
  const key = overlayDisplaySettingsStorageKey(sessionId);
  if (!key) return false;
  const safe = {
    displayMode: sanitizeDisplayMode(settings?.displayMode),
    v2Mode: sanitizeV2Mode(settings?.v2Mode),
    hiddenFields: sanitizeHiddenFields(settings?.hiddenFields) ?? [],
  };
  try {
    storage?.setItem?.(key, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}
