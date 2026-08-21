export function createAnalyticsSelectionState() {
  return {
    selectedIdRef: { current: "" },
    hoveredIdRef: { current: "" },
  };
}

export function setAnalyticsSelected(state, elementId) {
  if (!state || !state.selectedIdRef) return;
  state.selectedIdRef.current = String(elementId || "").trim();
}

export function clearAnalyticsSelected(state) {
  if (!state || !state.selectedIdRef) return;
  state.selectedIdRef.current = "";
}

export function getAnalyticsSelectedId(state) {
  if (!state || !state.selectedIdRef) return "";
  return state.selectedIdRef.current;
}

export function setAnalyticsHovered(state, elementId) {
  if (!state || !state.hoveredIdRef) return;
  state.hoveredIdRef.current = String(elementId || "").trim();
}

export function clearAnalyticsHovered(state) {
  if (!state || !state.hoveredIdRef) return;
  state.hoveredIdRef.current = "";
}

export function getAnalyticsHoveredId(state) {
  if (!state || !state.hoveredIdRef) return "";
  return state.hoveredIdRef.current;
}
