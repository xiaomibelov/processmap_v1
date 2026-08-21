// React binding for the To-Be builder state (property-panel-redesign, Phase 2).
//
// Per-session localStorage persistence (`fpc_tobe_v1:{sid}`). The hook is
// intentionally thin — all logic lives in the pure model module.

import { useCallback, useEffect, useState } from "react";

import {
  loadToBeState,
  markPropertyRemoved,
  saveToBeState,
  toggleToBeName,
} from "./toBeBuilderModel.js";

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function useToBeState(sessionId) {
  const [toBeState, setToBeState] = useState(() => loadToBeState(getLocalStorage(), sessionId));

  // Reload when the session changes (per-session persistence).
  useEffect(() => {
    setToBeState(loadToBeState(getLocalStorage(), sessionId));
  }, [sessionId]);

  const persist = useCallback((updater) => {
    setToBeState((prev) => {
      const next = updater(prev);
      saveToBeState(getLocalStorage(), sessionId, next);
      return next;
    });
  }, [sessionId]);

  const toggleToBe = useCallback((name) => {
    persist((prev) => toggleToBeName(prev, name));
  }, [persist]);

  const markRemoved = useCallback((name) => {
    persist((prev) => markPropertyRemoved(prev, name));
  }, [persist]);

  return { toBeState, toggleToBe, markRemoved };
}
