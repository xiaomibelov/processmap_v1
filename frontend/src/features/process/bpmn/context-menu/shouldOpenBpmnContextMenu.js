function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function isElementNode(value) {
  return typeof Element !== "undefined" && value instanceof Element;
}

function isEditableDomTarget(targetRaw) {
  if (!isElementNode(targetRaw)) return false;
  if (targetRaw.closest("input, textarea, select, [contenteditable='true']")) return true;
  if (targetRaw.closest(".djs-direct-editing-parent, .djs-direct-editing-content")) return true;
  return false;
}

function isBpmnDirectEditingTarget(targetRaw) {
  if (!isElementNode(targetRaw)) return false;
  return !!targetRaw.closest?.(".djs-direct-editing-parent, .djs-direct-editing-content");
}

function isWithinCanvasContainer(targetRaw, inst) {
  if (!isElementNode(targetRaw)) return false;
  const canvasContainer = inst?.get?.("canvas")?._container;
  return isElementNode(canvasContainer) && canvasContainer.contains(targetRaw);
}

function isBpmnOwnedEditableDomTarget(targetRaw, inst) {
  if (!isEditableDomTarget(targetRaw)) return false;
  if (isBpmnDirectEditingTarget(targetRaw)) return true;
  if (!isWithinCanvasContainer(targetRaw, inst)) return false;
  return !!targetRaw.closest?.(".djs-popup, .djs-palette");
}

function isExcludedModeOwnerTarget(targetRaw) {
  if (!isElementNode(targetRaw)) return false;
  return !!targetRaw.closest?.([
    ".djs-palette",
    ".djs-popup",
    ".bjs-powered-by",
    ".drawioInteractionLayer",
    "[data-testid='drawio-interaction-layer']",
    "[data-testid='drawio-interaction-layer-root']",
    "[data-drawio-el-id]",
  ].join(", "));
}

export function shouldOpenBpmnContextMenu({
  nativeEvent,
  inst,
  interactionState,
  activeElementOverride,
} = {}) {
  const state = asObject(interactionState);
  if (
    state.directEditingActive
    || state.dragInProgress
    || state.connectInProgress
    || state.resizeInProgress
    || state.createInProgress
  ) {
    return { ok: false, reason: "interaction_in_progress" };
  }

  const eventTarget = isElementNode(nativeEvent?.target) ? nativeEvent.target : null;
  if (isExcludedModeOwnerTarget(eventTarget)) {
    return { ok: false, reason: "ownership_excluded" };
  }

  if (isBpmnOwnedEditableDomTarget(eventTarget, inst)) {
    return { ok: false, reason: "bpmn_editable_target" };
  }

  const activeElement = activeElementOverride !== undefined
    ? activeElementOverride
    : (typeof document !== "undefined" ? document.activeElement : null);
  if (isBpmnDirectEditingTarget(activeElement)) {
    return { ok: false, reason: "bpmn_editable_active_element" };
  }

  return { ok: true, reason: "ok" };
}
