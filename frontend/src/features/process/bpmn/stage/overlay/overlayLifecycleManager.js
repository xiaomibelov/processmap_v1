import { createV2OverlayCoordinator } from "./v2OverlayCoordinator.js";
import { mergeV2OverlaysWithPropertyPreview } from "./v2OverlayContentResolver.js";

let overlayBadgeTooltipListenerInstalled = false;
let overlayBadgeTooltipHandler = null;

let v2OverlayClickListenerInstalled = false;
let v2OverlayClickHandler = null;
let tobeDocumentClickHandler = null;
let tobeDocumentDoubleClickHandler = null;

const V2_OVERLAY_HOST_SELECTOR = ".fpc-overlay-v2-host[data-fpc-element-id]";
const TOBE_DOC_HOST_SELECTOR = ".fpc-tobe-doc[data-fpc-tobe-doc-id]";

function findV2OverlayHostFromEvent(event) {
  const host = event?.target?.closest?.(V2_OVERLAY_HOST_SELECTOR) || null;
  const elementId = String(host?.dataset?.fpcElementId || "").trim();
  return elementId ? { host, elementId } : null;
}

function findTobeDocHostFromEvent(event) {
  const host = event?.target?.closest?.(TOBE_DOC_HOST_SELECTOR) || null;
  const docId = String(host?.dataset?.fpcTobeDocId || "").trim();
  return docId ? { host, docId } : null;
}

function hostAnchorRect(host) {
  try {
    return typeof host?.getBoundingClientRect === "function" ? host.getBoundingClientRect() : null;
  } catch {
    return null;
  }
}

// Pressing on a V2 card must not start a canvas pan / rubber-band selection.
// Capture phase: the canvas container listens in bubble phase, so stopping
// here keeps the gesture owned by the overlay.
function handleV2OverlayMouseDownCapture(event) {
  if (findV2OverlayHostFromEvent(event) || findTobeDocHostFromEvent(event)) {
    event.stopPropagation();
  }
}

function handleV2OverlayClick(event) {
  const tobeHit = findTobeDocHostFromEvent(event);
  if (tobeHit) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof tobeDocumentClickHandler === "function") {
      try {
        tobeDocumentClickHandler({ docId: tobeHit.docId, anchorRect: hostAnchorRect(tobeHit.host), event });
      } catch {
        // Overlay click handler failures are non-critical.
      }
    }
    return;
  }
  const hit = findV2OverlayHostFromEvent(event);
  if (!hit) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof v2OverlayClickHandler !== "function") return;
  try {
    v2OverlayClickHandler({ elementId: hit.elementId, event });
  } catch {
    // Overlay click handler failures are non-critical.
  }
}

// Double-click on a To-Be document card skips the popover and opens the
// expanded modal directly.
function handleTobeDocumentDoubleClick(event) {
  const hit = findTobeDocHostFromEvent(event);
  if (!hit) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof tobeDocumentDoubleClickHandler !== "function") return;
  try {
    tobeDocumentDoubleClickHandler({ docId: hit.docId, anchorRect: hostAnchorRect(hit.host), event });
  } catch {
    // Overlay click handler failures are non-critical.
  }
}

function installV2OverlayClickListener() {
  if (v2OverlayClickListenerInstalled || typeof document === "undefined") return;
  document.addEventListener("mousedown", handleV2OverlayMouseDownCapture, true);
  document.addEventListener("click", handleV2OverlayClick);
  document.addEventListener("dblclick", handleTobeDocumentDoubleClick);
  v2OverlayClickListenerInstalled = true;
}

function uninstallV2OverlayClickListener() {
  if (!v2OverlayClickListenerInstalled || typeof document === "undefined") return;
  document.removeEventListener("mousedown", handleV2OverlayMouseDownCapture, true);
  document.removeEventListener("click", handleV2OverlayClick);
  document.removeEventListener("dblclick", handleTobeDocumentDoubleClick);
  v2OverlayClickListenerInstalled = false;
}

// Registers the handler invoked with { elementId } when a V2 overlay card is
// clicked. Installs the delegated document listeners on first registration.
export function setV2OverlayClickHandler(handler) {
  v2OverlayClickHandler = typeof handler === "function" ? handler : null;
  if (v2OverlayClickHandler) {
    installV2OverlayClickListener();
  }
}

// Registers the handler invoked with { docId, anchorRect } when a To-Be
// document card is clicked. Shares the delegated document listeners with the
// V2 cards.
export function setTobeDocumentClickHandler(handler) {
  tobeDocumentClickHandler = typeof handler === "function" ? handler : null;
  if (tobeDocumentClickHandler) {
    installV2OverlayClickListener();
  }
}

// Registers the handler invoked with { docId, anchorRect } when a To-Be
// document card is double-clicked.
export function setTobeDocumentDoubleClickHandler(handler) {
  tobeDocumentDoubleClickHandler = typeof handler === "function" ? handler : null;
  if (tobeDocumentDoubleClickHandler) {
    installV2OverlayClickListener();
  }
}

function fillOverlayTooltip(tooltip, payload) {
  if (!tooltip) return;
  tooltip.innerHTML = "";
  const titleText = String(payload?.title || "").trim();
  if (titleText) {
    const titleEl = document.createElement("div");
    titleEl.className = "fpc-overlay-tooltip__title";
    titleEl.textContent = titleText;
    tooltip.appendChild(titleEl);
  }
  const listEl = document.createElement("ul");
  listEl.className = "fpc-overlay-tooltip__properties";
  const props = Array.isArray(payload?.properties) ? payload.properties : [];
  props.forEach((prop) => {
    const name = String(prop?.name ?? "").trim();
    if (!name) return;
    let displayValue = String(prop?.value ?? "");
    if (displayValue.length > 80) {
      displayValue = `${displayValue.slice(0, 80)}...`;
    }
    const itemEl = document.createElement("li");
    itemEl.className = "fpc-overlay-tooltip__property";
    const nameEl = document.createElement("span");
    nameEl.className = "fpc-overlay-tooltip__property-name";
    nameEl.textContent = `${name}:`;
    const valueEl = document.createElement("span");
    valueEl.className = "fpc-overlay-tooltip__property-value";
    valueEl.textContent = displayValue;
    itemEl.appendChild(nameEl);
    itemEl.appendChild(valueEl);
    listEl.appendChild(itemEl);
  });
  if (listEl.childNodes.length > 0) {
    tooltip.appendChild(listEl);
  }
}

function installOverlayBadgeTooltipListener() {
  if (overlayBadgeTooltipListenerInstalled || typeof document === "undefined") return;
  overlayBadgeTooltipHandler = (event) => {
    const wrapper = event?.target?.closest?.(".fpc-overlay-badge-wrapper");
    if (!wrapper) return;
    const tooltip = wrapper.querySelector(".fpc-overlay-tooltip");
    if (!tooltip || tooltip.dataset.filled === "1") return;
    try {
      const payload = JSON.parse(wrapper.dataset.fpcOverlayProps || "{}");
      fillOverlayTooltip(tooltip, payload);
      tooltip.dataset.filled = "1";
    } catch {
      // Tooltip population failures are non-critical.
    }
  };
  document.addEventListener("mouseover", overlayBadgeTooltipHandler, { passive: true });
  overlayBadgeTooltipListenerInstalled = true;
}

function uninstallOverlayBadgeTooltipListener() {
  if (!overlayBadgeTooltipListenerInstalled || !overlayBadgeTooltipHandler || typeof document === "undefined") {
    return;
  }
  document.removeEventListener("mouseover", overlayBadgeTooltipHandler, { passive: true });
  overlayBadgeTooltipListenerInstalled = false;
  overlayBadgeTooltipHandler = null;
}

export function createOverlayLifecycleManager({ enabledRef, expandedRef, useExtensionOverlaysRef, propertyPreviewMapRef, hiddenFieldsRef }) {
  // Backward-compatible facade over the decomposed coordinator.
  return createV2OverlayCoordinator({
    enabledRef,
    expandedRef,
    useExtensionOverlaysRef,
    previewMapRef: propertyPreviewMapRef,
    hiddenFieldsRef,
  });
}

export {
  mergeV2OverlaysWithPropertyPreview,
  installOverlayBadgeTooltipListener,
  uninstallOverlayBadgeTooltipListener,
  uninstallV2OverlayClickListener,
};
