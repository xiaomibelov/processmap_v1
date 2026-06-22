function getElementType(el) {
  return String(el?.type || el?.businessObject?.$type || "").trim();
}

function isSubprocessNavigable(el) {
  const type = getElementType(el);
  return type === "bpmn:CallActivity" || type === "bpmn:SubProcess";
}

function findDrilldownOverlayForButton(inst, button) {
  try {
    const overlays = inst.get("overlays");
    if (!overlays) return null;
    const candidates = overlays.get({ type: "drilldown" });
    if (!Array.isArray(candidates)) return null;
    return candidates.find((overlay) => {
      const html = overlay?.html;
      if (!html) return false;
      return html === button || (typeof html.contains === "function" && html.contains(button));
    }) || null;
  } catch {
    return null;
  }
}

export function bindSubprocessNavigationEvents(inst, onNavigateToSubprocessRef) {
  if (!inst || typeof inst.get !== "function") return () => {};

  // Use the bpmn-js top-level container (.bjs-container) so the delegated
  // listener catches clicks on the default drilldown overlay button.
  const container = inst._container;
  if (!(container instanceof Element)) return () => {};

  const handler = (event) => {
    const button = event?.target?.closest?.(".bjs-drilldown");
    if (!button) return;

    const overlay = findDrilldownOverlayForButton(inst, button);
    if (!overlay) return;

    const element = overlay.element;
    if (!element || !isSubprocessNavigable(element)) return;

    event.stopPropagation();
    event.preventDefault();

    const cb = onNavigateToSubprocessRef?.current;
    if (typeof cb === "function") {
      cb(element.id);
    }
  };

  container.addEventListener("click", handler, true);

  return () => {
    try {
      container.removeEventListener("click", handler, true);
    } catch {
      // ignore
    }
  };
}
