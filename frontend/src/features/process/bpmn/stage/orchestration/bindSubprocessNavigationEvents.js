const CLICKABLE_CLASS = "fpc-call-activity-clickable";

function getElementType(el) {
  return String(el?.type || el?.businessObject?.$type || "").trim();
}

function isSubprocessNavigable(el) {
  const type = getElementType(el);
  return type === "bpmn:CallActivity" || type === "bpmn:SubProcess";
}

function markClickableSubprocessElements(inst) {
  if (!inst || typeof inst.get !== "function") return;
  try {
    const elementRegistry = inst.get("elementRegistry");
    if (!elementRegistry) return;
    const elements = elementRegistry.getAll();
    elements.forEach((el) => {
      if (!isSubprocessNavigable(el)) return;
      const gfx = elementRegistry.getGraphics(el);
      if (!gfx) return;
      const cls = String(gfx.getAttribute("class") || "");
      if (!cls.includes(CLICKABLE_CLASS)) {
        gfx.setAttribute("class", `${cls} ${CLICKABLE_CLASS}`.trim());
      }
    });
  } catch {
    // ignore
  }
}

function tryNativeResolveElement(inst, nativeEvent) {
  try {
    const elementRegistry = inst.get("elementRegistry");
    const canvas = inst.get("canvas");
    if (!elementRegistry || !canvas) return null;
    const container = canvas?._container || canvas?.getContainer?.();
    if (!container) return null;

    const target = nativeEvent?.target;
    if (!target || !(target instanceof Element)) return null;
    if (!container.contains(target)) return null;

    // Try to find closest SVG group with data-element-id.
    const gfx = target.closest?.(".djs-element");
    if (!gfx) return null;

    let element = elementRegistry.get(gfx);
    if (element && isSubprocessNavigable(element)) return element;

    // Fallback: try data-element-id attribute.
    const id = gfx.getAttribute?.("data-element-id");
    if (id) {
      element = elementRegistry.get(id);
      if (element && isSubprocessNavigable(element)) return element;
    }
    return null;
  } catch {
    return null;
  }
}

function shouldLogSubprocessDebug() {
  if (typeof window === "undefined") return false;
  try {
    return window.__FPC_DEBUG_SUBPROCESS__ === true
      || String(window.localStorage?.getItem("fpc_debug_subprocess") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logSubprocess(tag, payload = {}) {
  if (!shouldLogSubprocessDebug()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[SUBPROCESS_NAV] ${String(tag || "trace")} ${suffix}`.trim());
}

export function bindSubprocessNavigationEvents(inst, onNavigateToSubprocessRef) {
  if (!inst || typeof inst.get !== "function") return () => {};
  const eventBus = inst.get("eventBus");
  const canvas = inst.get("canvas");
  if (!eventBus || !canvas) return () => {};

  const eventBusHandler = (event) => {
    const el = event?.element;
    const type = getElementType(el);
    logSubprocess("element.click", { id: el?.id, type, source: "eventBus" });
    if (!isSubprocessNavigable(el)) return;
    const cb = onNavigateToSubprocessRef?.current;
    if (typeof cb === "function") {
      logSubprocess("navigate", { id: el.id, source: "eventBus" });
      cb(el.id);
    }
  };

  // High priority so we run before default selection behavior.
  eventBus.on("element.click", 3000, eventBusHandler);

  // Native DOM fallback: some environments / overlays may not propagate to eventBus.
  const container = canvas?._container || canvas?.getContainer?.();
  let nativeHandler = null;
  if (container instanceof Element) {
    nativeHandler = (nativeEvent) => {
      const element = tryNativeResolveElement(inst, nativeEvent);
      logSubprocess("native.click", {
        id: element?.id,
        type: getElementType(element),
        targetTag: nativeEvent?.target?.tagName,
      });
      if (!element) return;
      nativeEvent.stopPropagation();
      nativeEvent.preventDefault();
      const cb = onNavigateToSubprocessRef?.current;
      if (typeof cb === "function") {
        logSubprocess("navigate", { id: element.id, source: "native" });
        cb(element.id);
      }
    };
    container.addEventListener("click", nativeHandler, true);
  }

  const renderHandler = () => {
    markClickableSubprocessElements(inst);
  };

  eventBus.on("diagram.render", renderHandler);
  eventBus.on("shape.added", renderHandler);
  eventBus.on("shape.changed", renderHandler);
  markClickableSubprocessElements(inst);

  return () => {
    try {
      eventBus.off("element.click", eventBusHandler);
      eventBus.off("diagram.render", renderHandler);
      eventBus.off("shape.added", renderHandler);
      eventBus.off("shape.changed", renderHandler);
    } catch {
      // ignore
    }
    if (nativeHandler && container instanceof Element) {
      try {
        container.removeEventListener("click", nativeHandler, true);
      } catch {
        // ignore
      }
    }
  };
}
