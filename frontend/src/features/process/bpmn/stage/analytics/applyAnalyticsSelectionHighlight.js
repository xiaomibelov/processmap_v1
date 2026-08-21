const ANALYTICS_SELECTED_CLASS = "fpcAnalyticsSelected";

export function applyAnalyticsHighlight(inst, kind, elementId, { analyticsSelectedMarkerStateRef }) {
  if (!inst) return;
  clearAnalyticsHighlight(inst, kind, { analyticsSelectedMarkerStateRef });
  const eid = String(elementId || "").trim();
  if (!eid) return;
  try {
    const canvas = inst.get("canvas");
    canvas.addMarker(eid, ANALYTICS_SELECTED_CLASS);
    analyticsSelectedMarkerStateRef.current[kind] = eid;
  } catch {
    // intentionally ignore
  }
}

export function clearAnalyticsHighlight(inst, kind, { analyticsSelectedMarkerStateRef }) {
  if (!inst) return;
  const prevId = String(analyticsSelectedMarkerStateRef.current[kind] || "").trim();
  if (!prevId) return;
  try {
    const canvas = inst.get("canvas");
    canvas.removeMarker(prevId, ANALYTICS_SELECTED_CLASS);
  } catch {
    // intentionally ignore
  }
  analyticsSelectedMarkerStateRef.current[kind] = "";
}
