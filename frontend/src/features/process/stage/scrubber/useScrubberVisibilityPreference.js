import { useCallback, useEffect, useState } from "react";

const SCRUBBER_VISIBILITY_STORAGE_KEY = "ui.bpmn.viewport_scrubber.hidden.v1";

function toBoolean(valueRaw, fallback = false) {
  if (typeof valueRaw === "boolean") return valueRaw;
  if (typeof valueRaw === "string") {
    const value = valueRaw.trim().toLowerCase();
    if (value === "1" || value === "true") return true;
    if (value === "0" || value === "false") return false;
  }
  return fallback;
}

function readStoredHidden(storageKey, fallbackHidden) {
  if (typeof window === "undefined") return fallbackHidden;
  try {
    const raw = window.localStorage?.getItem?.(storageKey);
    if (raw == null) return fallbackHidden;
    return toBoolean(raw, fallbackHidden);
  } catch {
    return fallbackHidden;
  }
}

function writeStoredHidden(storageKey, hidden) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem?.(storageKey, hidden ? "1" : "0");
  } catch {
  }
}

export default function useScrubberVisibilityPreference({
  storageKey = SCRUBBER_VISIBILITY_STORAGE_KEY,
  defaultHidden = false,
  persist = true,
} = {}) {
  const [hidden, setHidden] = useState(() => readStoredHidden(storageKey, defaultHidden));

  useEffect(() => {
    if (!persist) return;
    writeStoredHidden(storageKey, hidden);
  }, [hidden, persist, storageKey]);

  const show = useCallback(() => setHidden(false), []);
  const hide = useCallback(() => setHidden(true), []);
  const toggle = useCallback(() => setHidden((prev) => !prev), []);

  return {
    hidden,
    visible: !hidden,
    show,
    hide,
    toggle,
    setHidden,
  };
}

export {
  SCRUBBER_VISIBILITY_STORAGE_KEY,
  readStoredHidden,
};
