// React binding for the overlay display settings model (property-panel-redesign).
//
// One hook replaces the five As-Is App.jsx states (checkboxes #1-#5). Settings
// are loaded per session (with legacy migration) and persisted on every change;
// the hook is intentionally thin — all logic lives in the pure model modules.

import { useCallback, useEffect, useState } from "react";

import {
  applyV2ModeChange,
  loadOverlayDisplaySettings,
  saveOverlayDisplaySettings,
  sanitizeDisplayMode,
} from "./overlayDisplaySettings.js";
import { toggleFieldHidden } from "./fieldChipsModel.js";

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function useOverlayDisplaySettings(sessionId) {
  const [settings, setSettings] = useState(() => loadOverlayDisplaySettings(getLocalStorage(), sessionId));

  // Reload when the session changes (per-session persistence).
  useEffect(() => {
    setSettings(loadOverlayDisplaySettings(getLocalStorage(), sessionId));
  }, [sessionId]);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveOverlayDisplaySettings(getLocalStorage(), sessionId, next);
      return next;
    });
  }, [sessionId]);

  const setDisplayMode = useCallback((mode) => {
    update({ displayMode: sanitizeDisplayMode(mode) });
  }, [update]);

  const setV2Mode = useCallback((mode) => {
    setSettings((prev) => {
      const next = applyV2ModeChange(prev, mode);
      saveOverlayDisplaySettings(getLocalStorage(), sessionId, next);
      return next;
    });
  }, [sessionId]);

  const toggleField = useCallback((name) => {
    setSettings((prev) => {
      const next = { ...prev, hiddenFields: toggleFieldHidden(prev.hiddenFields, name) };
      saveOverlayDisplaySettings(getLocalStorage(), sessionId, next);
      return next;
    });
  }, [sessionId]);

  return { settings, setDisplayMode, setV2Mode, toggleField };
}
