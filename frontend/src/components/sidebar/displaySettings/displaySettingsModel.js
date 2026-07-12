// Pure model for the display-mode segmented control (property panel UX
// redesign, P1). Maps the two legacy per-session booleans
// (showOnSelect / showAlways) to a single mutually exclusive mode and back.
// No new data is introduced — the two App.jsx states stay the source of truth.

export const DISPLAY_MODES = ["hover", "always", "hidden"];

export function sanitizeDisplayMode(modeRaw) {
  const mode = String(modeRaw || "").trim().toLowerCase();
  return DISPLAY_MODES.includes(mode) ? mode : "hover";
}

// always wins over hover (matches the As-Is behavior where the "always"
// checkbox renders cards regardless of selection).
export function deriveDisplayMode({ showOnSelect, showAlways } = {}) {
  if (showAlways === true) return "always";
  if (showOnSelect === true) return "hover";
  return "hidden";
}

// Inverse mapping. "always" preserves the current on-select value so toggling
// back to "hover" restores the user's previous choice instead of resetting it.
export function applyDisplayMode(modeRaw, { showOnSelect = false } = {}) {
  const mode = sanitizeDisplayMode(modeRaw);
  if (mode === "always") return { showOnSelect: showOnSelect === true, showAlways: true };
  if (mode === "hidden") return { showOnSelect: false, showAlways: false };
  return { showOnSelect: true, showAlways: false };
}

// V2 → display mode coupling (B3): while V2 overlays are enabled, the legacy
// display mode is forced to "hidden" (legacy cards would duplicate the V2
// cards). The caller captures the current mode BEFORE enabling V2 and
// restores it when V2 is turned off. Pure: no persistence, no side effects.

// Captures the mode to restore after V2 is turned off.
export function captureModeBeforeV2(prev = {}) {
  return deriveDisplayMode(prev);
}

// Restores the captured mode (default "hover") onto the current flags.
export function restoreModeAfterV2(beforeV2, prev = {}) {
  const mode = DISPLAY_MODES.includes(beforeV2) ? beforeV2 : "hover";
  return applyDisplayMode(mode, prev);
}
