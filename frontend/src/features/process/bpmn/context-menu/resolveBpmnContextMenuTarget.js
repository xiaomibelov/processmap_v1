function toText(value) {
  return String(value || "").trim();
}

function isElementNode(value) {
  return typeof Element !== "undefined" && value instanceof Element;
}

function isConnectionElement(el) {
  return !!el && Array.isArray(el?.waypoints);
}

function isShapeElement(el) {
  if (!el || typeof el !== "object") return false;
  if (isConnectionElement(el)) return false;
  const x = Number(el?.x);
  const y = Number(el?.y);
  const width = Number(el?.width);
  const height = Number(el?.height);
  return [x, y, width, height].every(Number.isFinite);
}

function normalizeTargetElement(rawElement) {
  if (!rawElement || typeof rawElement !== "object") return null;
  if (rawElement?.labelTarget && typeof rawElement.labelTarget === "object") {
    return rawElement.labelTarget;
  }
  return rawElement;
}

function isProcessRootElement(element, inst) {
  const typeLower = toText(element?.businessObject?.$type || element?.type).toLowerCase();
  if (typeLower === "bpmn:process" || typeLower.endsWith(":process")) return true;
  const canvasRoot = inst?.get?.("canvas")?.getRootElement?.();
  const elementId = toText(element?.id);
  return !!elementId && elementId === toText(canvasRoot?.id);
}

function isExcludedDiagramUiTarget(targetNode) {
  if (!isElementNode(targetNode)) return false;
  return !!targetNode.closest?.([
    ".djs-palette",
    ".djs-context-pad",
    ".djs-popup",
    ".bjs-powered-by",
    ".drawioInteractionLayer",
    "[data-testid='drawio-interaction-layer']",
    "[data-testid='drawio-interaction-layer-root']",
    "[data-drawio-el-id]",
  ].join(", "));
}

export function readContextMenuNativeEvent(runtimeEvent) {
  if (!runtimeEvent || typeof runtimeEvent !== "object") return null;
  return runtimeEvent?.originalEvent || runtimeEvent?.srcEvent || runtimeEvent;
}

export function resolveBpmnContextMenuTarget({ runtimeEvent, scope = "canvas", inst } = {}) {
  const nativeEvent = readContextMenuNativeEvent(runtimeEvent);
  const canvasContainer = inst?.get?.("canvas")?._container;
  const eventTargetNode = isElementNode(nativeEvent?.target) ? nativeEvent.target : null;

  if (isElementNode(eventTargetNode) && isElementNode(canvasContainer) && !canvasContainer.contains(eventTargetNode)) {
    return { kind: "unsupported", reason: "outside_canvas" };
  }

  if (isExcludedDiagramUiTarget(eventTargetNode)) {
    return { kind: "unsupported", reason: "excluded_ui_surface" };
  }

  const registry = inst?.get?.("elementRegistry");
  const hintedElementId = toText(eventTargetNode?.closest?.("[data-element-id]")?.getAttribute?.("data-element-id"));
  const hintedElement = hintedElementId ? registry?.get?.(hintedElementId) : null;
  const rawElement = runtimeEvent?.element || runtimeEvent?.shape || runtimeEvent?.connection || hintedElement || null;
  const element = normalizeTargetElement(rawElement);

  if (!element) return { kind: "canvas" };
  if (isProcessRootElement(element, inst)) return { kind: "canvas" };

  const bpmnType = toText(element?.businessObject?.$type || element?.type);
  const isConnection = isConnectionElement(element);
  return {
    kind: isConnection ? "connection" : (toText(scope).toLowerCase() === "canvas" ? "canvas" : "element"),
    id: toText(element?.id),
    name: toText(element?.businessObject?.name),
    bpmnType,
    type: bpmnType,
    isConnection,
    isShape: isShapeElement(element),
  };
}
