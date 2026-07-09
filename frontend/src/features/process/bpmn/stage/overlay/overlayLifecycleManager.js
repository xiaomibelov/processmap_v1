import { createV2OverlayCoordinator } from "./v2OverlayCoordinator.js";
import { mergeV2OverlaysWithPropertyPreview } from "./v2OverlayContentResolver.js";

let overlayBadgeTooltipListenerInstalled = false;
let overlayBadgeTooltipHandler = null;

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

export { mergeV2OverlaysWithPropertyPreview, installOverlayBadgeTooltipListener, uninstallOverlayBadgeTooltipListener };
