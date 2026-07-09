import {
  extractOverlaysFromBpmn,
  isOverlayMetaProperty,
  parseOverlayFromProperties,
} from "../../../../../components/process/utils/bpmnOverlayParser.js";
import { overlayPropertyColorByKey } from "../decor/overlayColorModel.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return String(value ?? "").trim();
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  return x ? [x] : [];
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
  asArray(payload?.properties).forEach((prop) => {
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

let overlayBadgeTooltipListenerInstalled = false;
let overlayBadgeTooltipHandler = null;
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

const overlayCardHoverInstalled = new WeakSet();
const overlayCardHoverHandlers = new WeakMap();

function setPropertyCardExpandedForElement(elementId, expanded) {
  if (typeof document === "undefined" || !elementId) return;
  const selector = `.fpc-overlay-property-card-host[data-fpc-element-id="${CSS.escape(elementId)}"]`;
  document.querySelectorAll(selector).forEach((host) => {
    const card = host.querySelector(".fpc-overlay-property-card");
    if (!card) return;
    if (expanded) {
      expandPropertyCard(card);
    } else if (!card.classList.contains("fpc-overlay-property-card--hovered")) {
      collapsePropertyCard(card);
    }
  });
}

function installOverlayCardHoverListeners(inst, v2ExpandedRef) {
  if (!inst || overlayCardHoverInstalled.has(inst)) return;
  const eventBus = inst.get?.("eventBus");
  if (!eventBus) return;
  const onHover = (event) => {
    setPropertyCardExpandedForElement(event?.element?.id, true);
    setV2OverlayExpandedForElement(event?.element?.id, true);
    setLegacyPropertyOverlayExpandedForElement(event?.element?.id, true);
  };
  const onOut = (event) => {
    setPropertyCardExpandedForElement(event?.element?.id, false);
    setLegacyPropertyOverlayExpandedForElement(event?.element?.id, false);
    if (!v2ExpandedRef?.current) {
      setV2OverlayExpandedForElement(event?.element?.id, false);
    }
  };
  eventBus.on("element.hover", onHover);
  eventBus.on("element.out", onOut);
  overlayCardHoverInstalled.add(inst);
  overlayCardHoverHandlers.set(inst, { onHover, onOut, v2ExpandedRef });
}
function uninstallOverlayCardHoverListeners(inst) {
  if (!inst || !overlayCardHoverInstalled.has(inst)) return;
  const eventBus = inst.get?.("eventBus");
  const handlers = overlayCardHoverHandlers.get(inst);
  if (eventBus && handlers) {
    eventBus.off("element.hover", handlers.onHover);
    eventBus.off("element.out", handlers.onOut);
  }
  overlayCardHoverInstalled.delete(inst);
  overlayCardHoverHandlers.delete(inst);
}

const CARD_IDLE_MAX_PROPS = 4;
const CARD_IDLE_MAX_HEIGHT = 80;
const V2_OVERLAY_IDLE_MAX_PROPS = 5;

function makePropertyRow(prop, accent) {
  const name = String(prop.name ?? "").trim();
  let value = String(prop.value ?? "");
  if (value.length > 80) value = `${value.slice(0, 80)}...`;

  const rowEl = document.createElement("li");
  rowEl.className = "fpc-overlay-property-card__row";
  rowEl.style.setProperty("--fpc-overlay-accent", accent);
  rowEl.dataset.name = name;
  rowEl.textContent = value;
  return rowEl;
}

function expandPropertyCard(card) {
  if (card.classList.contains("fpc-overlay-property-card--expanded")) return;
  card.classList.add("fpc-overlay-property-card--expanded");
  const hiddenPropsRaw = card.dataset.fpcHiddenProps;
  if (!hiddenPropsRaw) return;
  let hiddenProps = [];
  try {
    hiddenProps = JSON.parse(hiddenPropsRaw);
  } catch {
    hiddenProps = [];
  }
  if (!hiddenProps.length) return;
  const list = card.querySelector(".fpc-overlay-property-card__list");
  if (!list) return;
  const accent = card.dataset.fpcAccent || "#888888";
  const fragment = document.createDocumentFragment();
  hiddenProps.forEach((prop) => fragment.appendChild(makePropertyRow(prop, accent)));
  list.appendChild(fragment);
  const footer = card.querySelector(".fpc-overlay-property-card__footer");
  if (footer) footer.style.display = "none";
}

function collapsePropertyCard(card) {
  card.classList.remove("fpc-overlay-property-card--expanded");
  const list = card.querySelector(".fpc-overlay-property-card__list");
  if (list) {
    const rows = list.querySelectorAll(".fpc-overlay-property-card__row");
    rows.forEach((row, idx) => {
      if (idx >= CARD_IDLE_MAX_PROPS) row.remove();
    });
  }
  const footer = card.querySelector(".fpc-overlay-property-card__footer");
  if (footer) footer.style.display = "";
}

function createPropertyCard(ovl, realProps, elementWidth, elementHeight, accent, elementId) {
  const host = document.createElement("div");
  host.className = "fpc-overlay-property-card-host";
  host.dataset.fpcElementId = elementId;
  host.style.width = `${elementWidth}px`;
  host.style.height = `${elementHeight}px`;

  const card = document.createElement("div");
  card.className = "fpc-overlay-property-card";
  card.dataset.fpcElementId = elementId;
  card.style.setProperty("--fpc-overlay-accent", accent);

  const titleText = String(ovl.text || ovl.meta?.title || "").trim();
  if (titleText) {
    const header = document.createElement("div");
    header.className = "fpc-overlay-property-card__header";
    header.textContent = titleText;
    header.title = titleText;
    card.appendChild(header);
  }

  const list = document.createElement("ul");
  list.className = "fpc-overlay-property-card__list";
  card.appendChild(list);

  const visibleProps = realProps.slice(0, CARD_IDLE_MAX_PROPS);
  const hiddenProps = realProps.slice(CARD_IDLE_MAX_PROPS);
  visibleProps.forEach((prop) => list.appendChild(makePropertyRow(prop, accent)));

  if (hiddenProps.length > 0) {
    const footer = document.createElement("div");
    footer.className = "fpc-overlay-property-card__footer";
    footer.textContent = `+${hiddenProps.length}`;
    card.appendChild(footer);
    card.dataset.fpcHiddenProps = JSON.stringify(hiddenProps);
  }

  card.dataset.fpcAccent = accent;

  card.addEventListener("mouseenter", () => {
    card.classList.add("fpc-overlay-property-card--hovered");
    expandPropertyCard(card);
  });
  card.addEventListener("mouseleave", () => {
    card.classList.remove("fpc-overlay-property-card--hovered");
    collapsePropertyCard(card);
  });

  host.appendChild(card);
  return host;
}

function makeV2PropertyRow(prop) {
  const name = String(prop.name ?? "").trim();
  if (!name) return null;
  let value = String(prop.value ?? "");
  if (value.length > 80) value = `${value.slice(0, 80)}...`;

  const colorModel = overlayPropertyColorByKey(name || "property");

  const itemEl = document.createElement("li");
  itemEl.className = "fpc-overlay-v2-item";
  itemEl.style.setProperty("--fpc-property-accent", colorModel.accent);

  const nameEl = document.createElement("span");
  nameEl.className = "fpc-overlay-v2-name";
  nameEl.textContent = `${name}:`;

  const valueEl = document.createElement("span");
  valueEl.className = "fpc-overlay-v2-value";
  valueEl.textContent = value;

  itemEl.appendChild(nameEl);
  itemEl.appendChild(valueEl);
  return itemEl;
}

function createV2Overlay(ovl, realProps, colorModel, titleText, elementId, elementWidth, expanded = false, options = {}) {
  const { isSequenceFlow = false } = options;
  const host = document.createElement("div");
  host.className = "fpc-overlay-v2-host";
  if (isSequenceFlow) {
    host.classList.add("fpc-overlay-v2-host--sequence");
  }
  if (expanded) {
    host.classList.add("fpc-overlay-v2-host--expanded");
  }
  host.dataset.fpcElementId = elementId;
  host.style.width = `${elementWidth}px`;
  host.style.setProperty("--fpc-overlay-accent", colorModel.accent);

  const badge = document.createElement("div");
  badge.className = "fpc-overlay-v2-badge";
  badge.title = String(ovl.meta?.title || ovl.text || titleText || "").trim();

  const hiddenCount = realProps.length > V2_OVERLAY_IDLE_MAX_PROPS
    ? realProps.length - V2_OVERLAY_IDLE_MAX_PROPS
    : 0;

  const footer = document.createElement("span");
  footer.className = "fpc-overlay-v2-footer";
  if (hiddenCount > 0) {
    footer.textContent = `+${hiddenCount}`;
    footer.dataset.hiddenCount = String(hiddenCount);
  }

  const list = document.createElement("ul");
  list.className = "fpc-overlay-v2-list";
  realProps.forEach((prop) => {
    const row = makeV2PropertyRow(prop);
    if (row) list.appendChild(row);
  });

  if (hiddenCount > 0) {
    badge.appendChild(footer);
  }
  badge.appendChild(list);

  host.appendChild(badge);
  return host;
}

function setV2OverlayExpandedForElement(elementId, expanded) {
  if (typeof document === "undefined" || !elementId) return;
  const selector = `.fpc-overlay-v2-host[data-fpc-element-id="${CSS.escape(elementId)}"]`;
  document.querySelectorAll(selector).forEach((host) => {
    host.classList.toggle("fpc-overlay-v2-host--expanded", expanded);
  });
}

function setLegacyPropertyOverlayExpandedForElement(elementId, expanded) {
  if (typeof document === "undefined" || !elementId) return;
  const selector = `.fpcPropertyOverlay[data-node-id="${CSS.escape(elementId)}"]`;
  document.querySelectorAll(selector).forEach((overlay) => {
    overlay.classList.toggle("fpcPropertyOverlay--expanded", expanded);
  });
}

function computeSequenceFlowMidpoint(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
  let totalLength = 0;
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const dx = Number(end?.x || 0) - Number(start?.x || 0);
    const dy = Number(end?.y || 0) - Number(start?.y || 0);
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push({ dx, dy, len, start });
    totalLength += len;
  }
  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    const first = waypoints[0];
    return { x: Number(first?.x || 0), y: Number(first?.y || 0) };
  }
  const target = totalLength / 2;
  let accumulated = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (accumulated + seg.len >= target) {
      const t = seg.len > 0 ? (target - accumulated) / seg.len : 0;
      return {
        x: seg.start.x + seg.dx * t,
        y: seg.start.y + seg.dy * t,
      };
    }
    accumulated += seg.len;
  }
  const last = waypoints[waypoints.length - 1];
  return { x: Number(last?.x || 0), y: Number(last?.y || 0) };
}

export function mergeV2OverlaysWithPropertyPreview(inst, overlayList, previewMap, { forceShow = false } = {}) {
  const normalizedPreviewMap = asObject(previewMap);
  const previewKeys = Object.keys(normalizedPreviewMap);
  if (!previewKeys.length) return overlayList;

  const registry = inst?.get?.("elementRegistry");
  const extractedByNodeId = new Map(
    overlayList.map((ovl) => [String(ovl.node_id || ovl.nodeId || "").trim(), ovl])
  );
  const merged = [];

  previewKeys.forEach((elementId) => {
    const preview = normalizedPreviewMap[elementId];
    if (!preview?.enabled) return;
    const props = asArray(preview?.items)
      .filter((item) => asText(item?.key) && asText(item?.value))
      .map((item) => ({ name: asText(item.key), value: asText(item.value) }));
    if (!props.length) return;

    let ovl = extractedByNodeId.get(elementId);
    if (ovl) {
      ovl = { ...ovl, properties: props };
    } else {
      const el = typeof registry?.get === "function" ? registry.get(elementId) : null;
      if (el) {
        const bo = asObject(el.businessObject);
        ovl = parseOverlayFromProperties(
          props,
          elementId,
          String(bo.name || ""),
          String(bo.$type || el.type || ""),
          forceShow
        );
        if (ovl) {
          ovl.properties = props;
        }
      }
    }
    if (ovl) merged.push(ovl);
  });

  overlayList.forEach((ovl) => {
    const nodeId = String(ovl.node_id || ovl.nodeId || "").trim();
    if (!normalizedPreviewMap[nodeId]) {
      merged.push(ovl);
    }
  });

  return merged;
}

export function createOverlayLifecycleManager({ enabledRef, expandedRef, useExtensionOverlaysRef, propertyPreviewMapRef }) {
  const elementOverlayMapRef = { current: { viewer: new Map(), editor: new Map() } };

  function clear(inst, kind) {
    if (!inst) return;
    try {
      const overlays = inst.get("overlays");
      const map = elementOverlayMapRef.current[kind];
      map.forEach((entry) => {
        try { overlays.remove(entry.overlayId); } catch {}
      });
      map.clear();
    } catch {}
  }

  function isElementInViewport(el, viewbox) {
    if (!viewbox || !Number.isFinite(viewbox.x)) return true;
    const vx = viewbox.x;
    const vy = viewbox.y;
    const vw = viewbox.width;
    const vh = viewbox.height;
    const isSequenceFlow = Array.isArray(el.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow";
    if (isSequenceFlow) {
      const mid = computeSequenceFlowMidpoint(el.waypoints);
      if (!mid) return true;
      return mid.x >= vx && mid.x <= vx + vw && mid.y >= vy && mid.y <= vy + vh;
    }
    const ex = Number(el.x || 0);
    const ey = Number(el.y || 0);
    const ew = Number(el.width || 0);
    const eh = Number(el.height || 0);
    return ex + ew >= vx && ex <= vx + vw && ey + eh >= vy && ey <= vy + vh;
  }

  function hasLegacyPropertyOverlay(inst, elementId) {
    if (!inst || !elementId) return false;
    try {
      const overlays = inst.get("overlays");
      const all = overlays.get({ element: elementId });
      for (const entry of all) {
        const html = entry?.html;
        const node = typeof html === "string" ? null : html;
        if (node && node.classList && node.classList.contains("fpcPropertyOverlay")) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  function removeExistingV2OverlaysForElement(inst, elementId) {
    if (!inst || !elementId) return;
    try {
      const overlays = inst.get("overlays");
      const all = overlays.get({ element: elementId });
      for (const entry of all) {
        const html = entry?.html;
        const node = typeof html === "string" ? null : html;
        if (node && node.classList && node.classList.contains("fpc-overlay-v2-host")) {
          try { overlays.remove(entry.id || entry.overlayId || entry); } catch {}
        }
      }
    } catch {}
  }

  function computeContentSig(ovl, el) {
    const isSequenceFlow = Array.isArray(el.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow";
    const geo = isSequenceFlow ? el.waypoints : { x: el.x, y: el.y, width: el.width, height: el.height };
    return JSON.stringify({ ovl, geo });
  }

  function shouldRenderV2HostForElement(ovl, el, inst) {
    const isSequenceFlow = Array.isArray(el.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow";
    const elWidth = Number(el.width || 0);
    const elHeight = Number(el.height || 0);
    const MIN_ELEMENT_SIZE = 20;
    if (!isSequenceFlow && (elWidth < MIN_ELEMENT_SIZE || elHeight < MIN_ELEMENT_SIZE)) return false;

    const properties = Array.isArray(ovl.properties) ? ovl.properties : [];
    const realProps = properties.filter((prop) => {
      const name = String(prop.name ?? "").trim();
      return !!name && !isOverlayMetaProperty(name);
    });

    const titleText = String(ovl.text || ovl.meta?.title || el.businessObject?.name || el.name || "").trim();
    const hasProps = realProps.length > 0;
    const v2Enabled = enabledRef.current;
    if (!hasProps && (!v2Enabled || !titleText)) return false;
    if (!v2Enabled) return false;

    // Avoid duplicating the legacy property overlay that is already rendered
    // for this element by decorManager.
    if (hasLegacyPropertyOverlay(inst, el.id)) {
      return false;
    }

    return true;
  }

  function createV2HostForElement(ovl, el, inst) {
    if (!shouldRenderV2HostForElement(ovl, el, inst)) return null;

    const isSequenceFlow = Array.isArray(el.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow";
    const elWidth = Number(el.width || 0);
    const properties = Array.isArray(ovl.properties) ? ovl.properties : [];
    const realProps = properties.filter((prop) => {
      const name = String(prop.name ?? "").trim();
      return !!name && !isOverlayMetaProperty(name);
    });
    const titleText = String(ovl.text || ovl.meta?.title || el.businessObject?.name || el.name || "").trim();

    const colorKey = String(ovl.colorKey || ovl.meta?.type || ovl.type || "").trim();
    const colorModel = overlayPropertyColorByKey(colorKey || "property");
    const v2Expanded = expandedRef.current;
    const SEQUENCE_OVERLAY_MAX_WIDTH = 160;
    const v2HostWidth = isSequenceFlow
      ? Math.min(Number(el.width || 0) || SEQUENCE_OVERLAY_MAX_WIDTH, SEQUENCE_OVERLAY_MAX_WIDTH)
      : elWidth;
    const v2Host = createV2Overlay(ovl, realProps, colorModel, titleText, el.id, v2HostWidth, v2Expanded, {
      isSequenceFlow,
    });
    let v2Position = { top: -20, left: 0 };
    if (isSequenceFlow) {
      const mid = computeSequenceFlowMidpoint(el.waypoints);
      if (mid) {
        v2Host.style.top = `${mid.y - el.y - 20}px`;
        v2Host.style.left = `${mid.x - el.x - v2HostWidth / 2}px`;
        v2Position = { top: 0, left: 0 };
      }
    }
    return { host: v2Host, position: v2Position };
  }

  function mount(inst, kind, overlayList = []) {
    if (!inst || typeof window === "undefined") return;
    if (!useExtensionOverlaysRef?.current) return;
    const overlaysToRender = Array.isArray(overlayList) ? overlayList : [];
    const map = elementOverlayMapRef.current[kind];

    let removedCount = 0;
    let addedCount = 0;
    let updatedCount = 0;
    let keptCount = 0;

    try {
      // eslint-disable-next-line no-console
      console.log("[FPC-OVERLAY-V2] extension overlays found", { count: overlaysToRender.length });

      const overlays = inst.get("overlays");
      const registry = inst.get("elementRegistry");
      const canvas = inst.get("canvas");
      const viewbox = canvas?.viewbox ? canvas.viewbox() : null;

      if (overlaysToRender.length > 0) {
        installOverlayBadgeTooltipListener();
        installOverlayCardHoverListeners(inst, expandedRef);
      }

      // Build desired set keyed by element id.
      let desired = new Map();
      overlaysToRender.forEach((ovl) => {
        const nodeId = String(ovl.node_id || ovl.nodeId || "").trim();
        const el = nodeId ? registry.get(nodeId) : null;
        if (!el) return;
        desired.set(nodeId, { ovl, el });
      });

      // Apply viewport culling only when the current viewbox does NOT show the
      // whole diagram. This avoids hiding overlays on the initial fit-to-viewport
      // while still reducing DOM count when the user zooms in.
      if (viewbox && Number.isFinite(viewbox.x) && desired.size > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        desired.forEach(({ el }) => {
          const isSequenceFlow = Array.isArray(el.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow";
          if (isSequenceFlow) {
            const mid = computeSequenceFlowMidpoint(el.waypoints);
            const px = mid ? mid.x : Number(el.x || 0);
            const py = mid ? mid.y : Number(el.y || 0);
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          } else {
            const ex = Number(el.x || 0);
            const ey = Number(el.y || 0);
            const ew = Number(el.width || 0);
            const eh = Number(el.height || 0);
            minX = Math.min(minX, ex);
            minY = Math.min(minY, ey);
            maxX = Math.max(maxX, ex + ew);
            maxY = Math.max(maxY, ey + eh);
          }
        });
        const bboxContained =
          minX <= maxX &&
          minY <= maxY &&
          viewbox.x <= minX &&
          viewbox.y <= minY &&
          viewbox.x + viewbox.width >= maxX &&
          viewbox.y + viewbox.height >= maxY;
        if (!bboxContained) {
          const culled = new Map();
          for (const [nodeId, { ovl, el }] of desired.entries()) {
            if (isElementInViewport(el, viewbox)) {
              culled.set(nodeId, { ovl, el });
            }
          }
          desired = culled;
        }
      }

      // Remove overlays for elements that are no longer desired.
      const toRemove = [];
      for (const [elementId] of map.entries()) {
        if (!desired.has(elementId)) {
          toRemove.push(elementId);
        }
      }
      toRemove.forEach((elementId) => {
        const entry = map.get(elementId);
        if (entry) {
          try { overlays.remove(entry.overlayId); } catch {}
          map.delete(elementId);
          removedCount += 1;
        }
      });

      const v2Expanded = expandedRef.current;

      // Add new overlays and update existing ones.
      const v2Enabled = enabledRef.current;
      for (const [elementId, { ovl, el }] of desired.entries()) {
        const contentSig = computeContentSig(ovl, el);
        const existing = map.get(elementId);
        const canShow = v2Enabled && shouldRenderV2HostForElement(ovl, el, inst);

        if (!canShow) {
          // V2 disabled or a legacy property overlay now exists for this element.
          // Remove any tracked or stray V2 host so we never stack redundant overlays.
          if (existing) {
            try { overlays.remove(existing.overlayId); } catch {}
            map.delete(elementId);
            removedCount += 1;
          }
          removeExistingV2OverlaysForElement(inst, elementId);
          continue;
        }

        if (existing) {
          if (existing.contentSig !== contentSig) {
            // Content changed: rebuild the host.
            try { overlays.remove(existing.overlayId); } catch {}
            removeExistingV2OverlaysForElement(inst, elementId);
            const created = createV2HostForElement(ovl, el, inst);
            if (created) {
              const overlayId = overlays.add(el.id, { position: created.position, html: created.host });
              map.set(elementId, { overlayId, contentSig, host: created.host, expanded: v2Expanded });
              updatedCount += 1;
            }
          } else if (existing.expanded !== v2Expanded) {
            // Only expanded state changed: toggle CSS class.
            existing.host.classList.toggle("fpc-overlay-v2-host--expanded", v2Expanded);
            existing.expanded = v2Expanded;
            keptCount += 1;
          } else {
            keptCount += 1;
          }
        } else {
          // New overlay for this element.
          removeExistingV2OverlaysForElement(inst, elementId);
          const created = createV2HostForElement(ovl, el, inst);
          if (created) {
            const overlayId = overlays.add(el.id, { position: created.position, html: created.host });
            map.set(elementId, { overlayId, contentSig, host: created.host, expanded: v2Expanded });
            addedCount += 1;
          }
        }
      }


    } catch {
      // Overlay mount failures are non-critical; keep the diagram usable.
    }
  }

  function clearAll(inst) {
    if (!inst) return;
    clear(inst, "viewer");
    clear(inst, "editor");
  }

  function uninstall(inst) {
    if (!inst) return;
    clear(inst, "viewer");
    clear(inst, "editor");
    uninstallOverlayCardHoverListeners(inst);
  }

  function mountFromBpmn(inst, kind) {
    if (!inst) return;
    const overlayList = extractOverlaysFromBpmn(inst, enabledRef.current) || [];
    mount(inst, kind, mergeV2OverlaysWithPropertyPreview(inst, overlayList, asObject(propertyPreviewMapRef?.current), { forceShow: enabledRef.current }));
  }

  return {
    mount,
    mountFromBpmn,
    clear,
    clearAll,
    uninstall,
  };
}

export { installOverlayBadgeTooltipListener, uninstallOverlayBadgeTooltipListener };
