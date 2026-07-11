import { createV2OverlayCoordinator } from "./v2OverlayCoordinator.js";
import { mergeV2OverlaysWithPropertyPreview } from "./v2OverlayContentResolver.js";

let overlayBadgeTooltipListenerInstalled = false;
let overlayBadgeTooltipHandler = null;

let v2OverlayClickListenerInstalled = false;
let v2OverlayClickHandler = null;

const V2_OVERLAY_HOST_SELECTOR = ".fpc-overlay-v2-host[data-fpc-element-id]";

function findV2OverlayHostFromEvent(event) {
  const host = event?.target?.closest?.(V2_OVERLAY_HOST_SELECTOR) || null;
  const elementId = String(host?.dataset?.fpcElementId || "").trim();
  return elementId ? { host, elementId } : null;
}

// Pressing on a V2 card must not start a canvas pan / rubber-band selection.
// Capture phase: the canvas container listens in bubble phase, so stopping
// here keeps the gesture owned by the overlay.
function handleV2OverlayMouseDownCapture(event) {
  if (findV2OverlayHostFromEvent(event)) event.stopPropagation();
}

function handleV2OverlayClick(event) {
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

function installV2OverlayClickListener() {
  if (v2OverlayClickListenerInstalled || typeof document === "undefined") return;
  document.addEventListener("mousedown", handleV2OverlayMouseDownCapture, true);
  document.addEventListener("click", handleV2OverlayClick);
  v2OverlayClickListenerInstalled = true;
}

function uninstallV2OverlayClickListener() {
  if (!v2OverlayClickListenerInstalled || typeof document === "undefined") return;
  document.removeEventListener("mousedown", handleV2OverlayMouseDownCapture, true);
  document.removeEventListener("click", handleV2OverlayClick);
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

export function createOverlayLifecycleManager({ enabledRef, expandedRef, useExtensionOverlaysRef, propertyPreviewMapRef }) {
  // Backward-compatible facade over the decomposed coordinator.
  return createV2OverlayCoordinator({
    enabledRef,
    expandedRef,
    useExtensionOverlaysRef,
    previewMapRef: propertyPreviewMapRef,
  });
}

export {
  mergeV2OverlaysWithPropertyPreview,
  installOverlayBadgeTooltipListener,
  uninstallOverlayBadgeTooltipListener,
  uninstallV2OverlayClickListener,
};
