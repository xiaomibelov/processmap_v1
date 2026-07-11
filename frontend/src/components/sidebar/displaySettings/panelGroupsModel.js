// Collapse/expand state of the Properties-tab sub-groups
// (property-panel-redesign, UI refresh).
//
// Pure model: global UI preference (not per-session — collapsing a group is
// about screen real estate, not about the diagram). Defaults to ALL EXPANDED
// so existing flows and e2e selectors keep working without extra clicks.

export const PANEL_GROUPS_STORAGE_KEY = "fpc_prop_panel_groups_v1";

export const PANEL_GROUP_IDS = ["displayMode", "v2Mode", "fields", "toBe"];

export function createDefaultPanelGroupsState() {
  return { displayMode: true, v2Mode: true, fields: true, toBe: true };
}

export function togglePanelGroup(state, groupId) {
  if (!PANEL_GROUP_IDS.includes(groupId)) return state;
  const base = { ...createDefaultPanelGroupsState(), ...(state || {}) };
  return { ...base, [groupId]: !base[groupId] };
}

export function loadPanelGroupsState(storage) {
  const fallback = createDefaultPanelGroupsState();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(PANEL_GROUPS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const next = { ...fallback };
    PANEL_GROUP_IDS.forEach((id) => {
      if (typeof parsed[id] === "boolean") next[id] = parsed[id];
    });
    return next;
  } catch {
    return fallback;
  }
}

export function savePanelGroupsState(storage, state) {
  if (!storage) return;
  const base = { ...createDefaultPanelGroupsState(), ...(state || {}) };
  const next = {};
  PANEL_GROUP_IDS.forEach((id) => { next[id] = !!base[id]; });
  try {
    storage.setItem(PANEL_GROUPS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable (private mode) — stay in-memory.
  }
}
