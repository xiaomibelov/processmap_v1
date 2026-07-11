// React binding for the collapsible panel-group state
// (property-panel-redesign, UI refresh). Global localStorage persistence
// (not per-session — this is screen real estate, not diagram data).
// The hook is intentionally thin — all logic lives in the pure model module.

import { useCallback, useState } from "react";

import {
  loadPanelGroupsState,
  savePanelGroupsState,
  togglePanelGroup,
} from "./panelGroupsModel.js";

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function usePanelGroupsState() {
  const [groups, setGroups] = useState(() => loadPanelGroupsState(getLocalStorage()));

  const toggleGroup = useCallback((groupId) => {
    setGroups((prev) => {
      const next = togglePanelGroup(prev, groupId);
      savePanelGroupsState(getLocalStorage(), next);
      return next;
    });
  }, []);

  return { groups, toggleGroup };
}
