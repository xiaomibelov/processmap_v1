const STORAGE_KEY = "processmap_overlay_pan_visible";

function isQuotaError(error) {
  if (!error) return false;
  return error.name === "QuotaExceededError"
    || error.code === 22
    || error.code === 1014
    || String(error.message || "").toLowerCase().includes("quota");
}

function tryFreeLocalStorageSpace() {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("__FPC_"))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore cleanup errors
  }
}

export function readOverlayPanVisibility() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeOverlayPanVisibility(value) {
  const str = String(value === true);
  try {
    window.localStorage.setItem(STORAGE_KEY, str);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      tryFreeLocalStorageSpace();
      try {
        window.localStorage.setItem(STORAGE_KEY, str);
        return true;
      } catch (retryError) {
        // eslint-disable-next-line no-console
        console.warn("[overlayPanToggle] localStorage quota exceeded; using in-memory fallback", retryError);
      }
    }
    return false;
  }
}
