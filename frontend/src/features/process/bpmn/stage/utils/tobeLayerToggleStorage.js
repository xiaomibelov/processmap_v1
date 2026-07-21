const STORAGE_KEY = "processmap_tobe_layer_enabled";

export function readTobeLayerEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeTobeLayerEnabled(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value === true));
  } catch {
    // Quota/security errors must not break the toggle itself.
  }
}
