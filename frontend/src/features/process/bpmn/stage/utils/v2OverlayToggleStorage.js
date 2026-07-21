const STORAGE_KEY = "processmap_v2_overlays_enabled";

export function readV2OverlayEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeV2OverlayEnabled(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value === true));
  } catch {
    // Quota/security errors must not break the toggle itself.
  }
}
