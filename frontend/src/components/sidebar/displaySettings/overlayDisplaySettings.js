// Overlay display settings model (property-panel-redesign).
//
// Single source of truth for how property overlays are shown on the canvas:
//   displayMode — legacy overlay pipeline ("hover" | "always" | "hidden")
//   v2Mode      — V2 overlay pipeline ("none" | "all" | "expanded")
//   visibleFields — per-field chip filter (property names; [] = nothing shown)
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
// can apply the default (all known fields). An empty array is preserved: it
// means "all fields hidden", not "missing".
export function sanitizeVisibleFields(value) {
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

function defaultVisibleFields(knownFields) {
  const sanitized = sanitizeVisibleFields(knownFields);
  return sanitized ? [...sanitized] : [];
}

export function createDefaultDisplaySettings(knownFields) {
  return {
    displayMode: DEFAULT_DISPLAY_MODE,
    v2Mode: DEFAULT_V2_MODE,
    visibleFields: defaultVisibleFields(knownFields),
  };
}

// Validates untrusted persisted state (localStorage). Non-object input or a
// field that fails validation is repaired independently; visibleFields=[] is
// respected (all fields hidden), while a missing/non-array visibleFields falls
// back to the default (all known fields).
export function readOverlayDisplaySettings(rawValue, knownFields) {
  const raw = asObject(rawValue);
  if (!raw) return createDefaultDisplaySettings(knownFields);
  const visibleFields = sanitizeVisibleFields(raw.visibleFields);
  return {
    displayMode: sanitizeDisplayMode(raw.displayMode),
    v2Mode: sanitizeV2Mode(raw.v2Mode),
    visibleFields: visibleFields === null ? defaultVisibleFields(knownFields) : visibleFields,
  };
}

// Migration from the As-Is checkbox #2 localStorage flag
// (`fpc_properties_overlay_always_v1:{sid}`) into the new displayMode axis.
export function migrateLegacyAlwaysFlag(value) {
  if (value === true || value === 1) return "always";
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" ? "always" : DEFAULT_DISPLAY_MODE;
}
