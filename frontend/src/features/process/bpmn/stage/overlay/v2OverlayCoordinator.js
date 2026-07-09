import { extractOverlaysFromBpmn } from "../../../../../components/process/utils/bpmnOverlayParser.js";
import { asArray, asObject, asText } from "./overlayUtils.js";
import { resolveV2OverlayContent, mergeV2OverlaysWithPropertyPreview } from "./v2OverlayContentResolver.js";
import { hasLegacyPropertyOverlay, shouldRenderV2Overlay } from "./v2OverlayVisibilityController.js";
import { computeSequenceFlowMidpoint, createV2OverlayHost, setV2OverlayExpandedForElement } from "./v2OverlayRenderer.js";

function setLegacyPropertyOverlayExpandedForElement(elementId, expanded) {
  if (typeof document === "undefined" || !elementId) return;
  const selector = `.fpcPropertyOverlay[data-node-id="${CSS.escape(elementId)}"]`;
  document.querySelectorAll(selector).forEach((overlay) => {
    overlay.classList.toggle("fpcPropertyOverlay--expanded", expanded);
  });
}

const coordinatorHoverInstalled = new WeakSet();
const coordinatorHoverHandlers = new WeakMap();

function installCoordinatorHoverListeners(inst, expandedRef) {
  if (!inst || coordinatorHoverInstalled.has(inst)) return;
  const eventBus = inst.get?.("eventBus");
  if (!eventBus) return;

  const onHover = (event) => {
    setV2OverlayExpandedForElement(event?.element?.id, true);
    setLegacyPropertyOverlayExpandedForElement(event?.element?.id, true);
  };
  const onOut = (event) => {
    setLegacyPropertyOverlayExpandedForElement(event?.element?.id, false);
    if (!expandedRef?.current) {
      setV2OverlayExpandedForElement(event?.element?.id, false);
    }
  };

  eventBus.on("element.hover", onHover);
  eventBus.on("element.out", onOut);
  coordinatorHoverInstalled.add(inst);
  coordinatorHoverHandlers.set(inst, { onHover, onOut, expandedRef });
}

function uninstallCoordinatorHoverListeners(inst) {
  if (!inst || !coordinatorHoverInstalled.has(inst)) return;
  const eventBus = inst.get?.("eventBus");
  const handlers = coordinatorHoverHandlers.get(inst);
  if (eventBus && handlers) {
    eventBus.off("element.hover", handlers.onHover);
    eventBus.off("element.out", handlers.onOut);
  }
  coordinatorHoverInstalled.delete(inst);
  coordinatorHoverHandlers.delete(inst);
}

function computeContentSig(ovl, el) {
  const isSequenceFlow = Array.isArray(el?.waypoints) && String(el?.type).toLowerCase() === "bpmn:sequenceflow";
  const geo = isSequenceFlow ? el.waypoints : { x: el.x, y: el.y, width: el.width, height: el.height };
  return JSON.stringify({ ovl, geo });
}

export function createV2OverlayCoordinator({
  enabledRef,
  expandedRef,
  useExtensionOverlaysRef,
  previewMapRef,
  selectedElementRef,
}) {
  const elementOverlayMapRef = { current: { viewer: new Map(), editor: new Map() } };

  function isElementInViewportWithMidpoint(el, viewbox) {
    if (!viewbox || !Number.isFinite(viewbox.x)) return true;
    const vx = viewbox.x;
    const vy = viewbox.y;
    const vw = viewbox.width;
    const vh = viewbox.height;
    const isSequenceFlow = Array.isArray(el?.waypoints) && String(el?.type).toLowerCase() === "bpmn:sequenceflow";
    if (isSequenceFlow) {
      const mid = computeSequenceFlowMidpoint(el.waypoints);
      const px = mid ? mid.x : Number(el?.x || 0);
      const py = mid ? mid.y : Number(el?.y || 0);
      return px >= vx && px <= vx + vw && py >= vy && py <= vy + vh;
    }
    const ex = Number(el?.x || 0);
    const ey = Number(el?.y || 0);
    const ew = Number(el?.width || 0);
    const eh = Number(el?.height || 0);
    return ex + ew >= vx && ex <= vx + vw && ey + eh >= vy && ey <= vy + vh;
  }

  function buildDesiredMap(inst, overlayList) {
    const registry = inst.get("elementRegistry");
    const desired = new Map();

    if (Array.isArray(overlayList)) {
      overlayList.forEach((ovl) => {
        const nodeId = asText(ovl?.node_id || ovl?.nodeId);
        const el = nodeId ? registry.get(nodeId) : null;
        if (el) desired.set(nodeId, { ovl, el });
      });
      return desired;
    }

    const previewMap = asObject(previewMapRef?.current);
    const globalEnabled = !!enabledRef?.current;
    const elements = registry.getAll().filter((el) => {
      const type = String(el?.type || "").toLowerCase();
      return type !== "label";
    });

    elements.forEach((el) => {
      const elementId = el.id;
      const content = resolveV2OverlayContent({ elementId, inst, previewMap, forceShow: globalEnabled });
      if (!content) return;

      const elementState = {
        isSequenceFlow: Array.isArray(el.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow",
        width: Number(el.width || 0),
        height: Number(el.height || 0),
        hasLegacyOverlay: hasLegacyPropertyOverlay(inst, elementId),
      };

      if (!shouldRenderV2Overlay({ elementId, globalEnabled, elementState, content })) return;

      desired.set(elementId, { ovl: content, el });
    });

    return desired;
  }

  function applyViewportCulling(desired, viewbox) {
    if (!viewbox || !Number.isFinite(viewbox.x) || desired.size === 0) return desired;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    desired.forEach(({ el }) => {
      const isSequenceFlow = Array.isArray(el?.waypoints) && String(el?.type).toLowerCase() === "bpmn:sequenceflow";
      if (isSequenceFlow) {
        const mid = computeSequenceFlowMidpoint(el.waypoints);
        const px = mid ? mid.x : Number(el?.x || 0);
        const py = mid ? mid.y : Number(el?.y || 0);
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      } else {
        const ex = Number(el?.x || 0);
        const ey = Number(el?.y || 0);
        const ew = Number(el?.width || 0);
        const eh = Number(el?.height || 0);
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

    if (bboxContained) return desired;

    const culled = new Map();
    for (const [elementId, { ovl, el }] of desired.entries()) {
      if (isElementInViewportWithMidpoint(el, viewbox)) {
        culled.set(elementId, { ovl, el });
      }
    }
    return culled;
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

  function renderForElement(inst, el, ovl, expanded) {
    removeExistingV2OverlaysForElement(inst, el.id);
    const created = createV2OverlayHost(el, ovl, expanded);
    if (!created) return null;
    const overlays = inst.get("overlays");
    const overlayId = overlays.add(el.id, { position: created.position, html: created.host });
    return { overlayId, host: created.host };
  }

  function mount(inst, kind, overlayList) {
    if (!inst || typeof document === "undefined") return;
    if (!useExtensionOverlaysRef?.current) return;

    const map = elementOverlayMapRef.current[kind];
    let removedCount = 0;
    let addedCount = 0;
    let updatedCount = 0;
    let keptCount = 0;

    try {
      const overlays = inst.get("overlays");
      const canvas = inst.get("canvas");
      const viewbox = canvas?.viewbox ? canvas.viewbox() : null;

      let desired = buildDesiredMap(inst, overlayList);
      desired = applyViewportCulling(desired, viewbox);

      if (desired.size > 0) {
        installCoordinatorHoverListeners(inst, expandedRef);
      }

      // Remove stale overlays.
      for (const [elementId] of map.entries()) {
        if (!desired.has(elementId)) {
          const entry = map.get(elementId);
          if (entry) {
            try { overlays.remove(entry.overlayId); } catch {}
            map.delete(elementId);
            removedCount += 1;
          }
        }
      }

      const v2Expanded = expandedRef?.current ?? false;
      const globalEnabled = enabledRef?.current ?? false;

      for (const [elementId, { ovl, el }] of desired.entries()) {
        const contentSig = computeContentSig(ovl, el);
        const existing = map.get(elementId);

        const elementState = {
          isSequenceFlow: Array.isArray(el.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow",
          width: Number(el.width || 0),
          height: Number(el.height || 0),
          hasLegacyOverlay: hasLegacyPropertyOverlay(inst, elementId),
        };
        const canShow = shouldRenderV2Overlay({ elementId, globalEnabled, elementState, content: ovl });

        if (!canShow) {
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
            const result = renderForElement(inst, el, ovl, v2Expanded);
            if (result) {
              map.set(elementId, { overlayId: result.overlayId, contentSig, host: result.host, expanded: v2Expanded });
              updatedCount += 1;
            }
          } else if (existing.expanded !== v2Expanded) {
            existing.host.classList.toggle("fpc-overlay-v2-host--expanded", v2Expanded);
            existing.expanded = v2Expanded;
            keptCount += 1;
          } else {
            keptCount += 1;
          }
        } else {
          const result = renderForElement(inst, el, ovl, v2Expanded);
          if (result) {
            map.set(elementId, { overlayId: result.overlayId, contentSig, host: result.host, expanded: v2Expanded });
            addedCount += 1;
          }
        }
      }
    } catch {
      // Overlay mount failures are non-critical; keep the diagram usable.
    }
  }

  function mountFromBpmn(inst, kind) {
    if (!inst) return;
    const overlayList = extractOverlaysFromBpmn(inst, enabledRef?.current) || [];
    const previewMap = asObject(previewMapRef?.current);
    const merged = mergeV2OverlaysWithPropertyPreview(inst, overlayList, previewMap, { forceShow: enabledRef?.current });
    mount(inst, kind, merged);
  }

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

  function clearAll(inst) {
    if (!inst) return;
    clear(inst, "viewer");
    clear(inst, "editor");
  }

  function uninstall(inst) {
    if (!inst) return;
    clear(inst, "viewer");
    clear(inst, "editor");
    uninstallCoordinatorHoverListeners(inst);
  }

  return {
    mount,
    mountFromBpmn,
    clear,
    clearAll,
    uninstall,
  };
}
