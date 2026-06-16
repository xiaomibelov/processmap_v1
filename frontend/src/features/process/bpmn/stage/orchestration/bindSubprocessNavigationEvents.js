const CLICKABLE_CLASS = "fpc-call-activity-clickable";

function markClickableCallActivities(inst) {
  if (!inst || typeof inst.get !== "function") return;
  try {
    const elementRegistry = inst.get("elementRegistry");
    const graphicsFactory = inst.get("graphicsFactory");
    if (!elementRegistry || !graphicsFactory) return;
    const elements = elementRegistry.getAll();
    elements.forEach((el) => {
      const type = String(el?.type || el?.businessObject?.$type || "").trim();
      if (type !== "bpmn:CallActivity") return;
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

export function bindSubprocessNavigationEvents(inst, onNavigateToSubprocessRef) {
  if (!inst || typeof inst.get !== "function") return () => {};
  const eventBus = inst.get("eventBus");
  if (!eventBus) return () => {};

  const handler = (event) => {
    const el = event?.element;
    if (!el) return;
    const type = String(el.type || el.businessObject?.$type || "").trim();
    if (type !== "bpmn:CallActivity") return;
    const cb = onNavigateToSubprocessRef?.current;
    if (typeof cb === "function") {
      cb(el.id);
    }
  };

  eventBus.on("element.click", 3000, handler);

  const renderHandler = () => {
    markClickableCallActivities(inst);
  };

  eventBus.on("diagram.render", renderHandler);
  eventBus.on("shape.added", renderHandler);
  eventBus.on("shape.changed", renderHandler);

  // Initial mark in case diagram is already rendered.
  markClickableCallActivities(inst);

  return () => {
    try {
      eventBus.off("element.click", handler);
      eventBus.off("diagram.render", renderHandler);
      eventBus.off("shape.added", renderHandler);
      eventBus.off("shape.changed", renderHandler);
    } catch {
      // ignore
    }
  };
}
