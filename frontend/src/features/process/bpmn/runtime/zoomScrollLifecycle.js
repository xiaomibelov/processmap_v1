export function disableBpmnZoomScroll(instance) {
  if (!instance || typeof instance.get !== "function") return false;
  try {
    const zoomScroll = instance.get("zoomScroll");
    if (!zoomScroll || typeof zoomScroll.toggle !== "function") return false;
    zoomScroll.toggle(false);
    return true;
  } catch {
    return false;
  }
}
