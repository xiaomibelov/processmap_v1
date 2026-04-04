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

function readElementType(element) {
  return toText(element?.businessObject?.$type || element?.type).toLowerCase();
}

function isPoolLaneContainerType(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  return type.includes("lane") || type.includes("participant");
}

function isPoolLaneContainerElement(element) {
  return isPoolLaneContainerType(readElementType(element));
}

function readDiagramPointFromClient(inst, nativeEvent) {
  if (!inst || !nativeEvent) return null;
  const canvas = inst.get?.("canvas");
  const container = canvas?._container;
  const rect = container?.getBoundingClientRect?.();
  if (!rect) return null;
  const vb = canvas?.viewbox?.() || {};
  const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
  const clientX = Number(nativeEvent?.clientX || 0);
  const clientY = Number(nativeEvent?.clientY || 0);
  return {
    x: Number(vb?.x || 0) + (clientX - Number(rect?.left || 0)) / scale,
    y: Number(vb?.y || 0) + (clientY - Number(rect?.top || 0)) / scale,
    scale,
  };
}

function isPointInsideShape(point, shape) {
  if (!point || !isShapeElement(shape)) return false;
  const x = Number(point?.x || 0);
  const y = Number(point?.y || 0);
  const sx = Number(shape?.x || 0);
  const sy = Number(shape?.y || 0);
  const sw = Number(shape?.width || 0);
  const sh = Number(shape?.height || 0);
  return x >= sx && x <= sx + sw && y >= sy && y <= sy + sh;
}

function hasPoolLaneCanvasOwnershipAtPoint(inst, nativeEvent) {
  if (!inst) return true;
  const domOwned = hasPoolLaneCanvasOwnershipByDomHit(inst, nativeEvent);
  if (domOwned) return true;
  const graphicsOwned = hasPoolLaneCanvasOwnershipByGraphicsRect(inst, nativeEvent);
  if (graphicsOwned) return true;
  const point = readDiagramPointFromClient(inst, nativeEvent);
  if (!point) return true;
  const all = inst.get?.("elementRegistry")?.getAll?.() || [];
  return all.some((item) => isPoolLaneContainerElement(item) && isPointInsideShape(point, item));
}

function readDomHitElementIds(inst, nativeEvent) {
  const event = nativeEvent && typeof nativeEvent === "object" ? nativeEvent : {};
  const clientX = Number(event?.clientX);
  const clientY = Number(event?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return [];
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return [];
  const canvasContainer = inst?.get?.("canvas")?._container;
  if (!isElementNode(canvasContainer)) return [];
  const nodes = document.elementsFromPoint(clientX, clientY);
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const ids = [];
  nodes.forEach((node) => {
    if (!isElementNode(node) || !canvasContainer.contains(node)) return;
    const id = toText(node.closest?.("[data-element-id]")?.getAttribute?.("data-element-id"));
    if (!id || ids.includes(id)) return;
    ids.push(id);
  });
  return ids;
}

function hasPoolLaneCanvasOwnershipByDomHit(inst, nativeEvent) {
  if (!inst) return false;
  const registry = inst.get?.("elementRegistry");
  if (!registry || typeof registry?.get !== "function") return false;
  const hitElementIds = readDomHitElementIds(inst, nativeEvent);
  if (!hitElementIds.length) return false;
  return hitElementIds.some((elementId) => isPoolLaneContainerElement(registry.get(elementId)));
}

function isClientPointInsideRect(nativeEvent, rect) {
  if (!rect || typeof rect !== "object") return false;
  const x = Number(nativeEvent?.clientX);
  const y = Number(nativeEvent?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= Number(rect.left || 0)
    && x <= Number(rect.right || 0)
    && y >= Number(rect.top || 0)
    && y <= Number(rect.bottom || 0);
}

function hasPoolLaneCanvasOwnershipByGraphicsRect(inst, nativeEvent) {
  if (!inst) return false;
  const registry = inst.get?.("elementRegistry");
  if (!registry || typeof registry?.getAll !== "function" || typeof registry?.getGraphics !== "function") {
    return false;
  }
  const all = registry.getAll?.() || [];
  return all.some((item) => {
    if (!isPoolLaneContainerElement(item)) return false;
    const gfx = registry.getGraphics(item);
    if (!isElementNode(gfx)) return false;
    const rect = gfx.getBoundingClientRect?.();
    return isClientPointInsideRect(nativeEvent, rect);
  });
}

function isPointInsideRectByEventTarget(nativeEvent, containerNode) {
  if (!isElementNode(containerNode)) return false;
  const rect = containerNode.getBoundingClientRect?.();
  if (!rect) return false;
  const x = Number(nativeEvent?.clientX);
  const y = Number(nativeEvent?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= Number(rect.left || 0)
    && x <= Number(rect.right || 0)
    && y >= Number(rect.top || 0)
    && y <= Number(rect.bottom || 0);
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

function isCanvasContainerElement(element, inst) {
  if (!element || typeof element !== "object") return false;
  return isPoolLaneContainerElement(element) || isProcessRootElement(element, inst);
}

function readDomHitElements(inst, nativeEvent) {
  const registry = inst?.get?.("elementRegistry");
  if (!registry || typeof registry?.get !== "function") return [];
  const ids = readDomHitElementIds(inst, nativeEvent);
  if (!ids.length) return [];
  const elements = [];
  ids.forEach((id) => {
    const element = normalizeTargetElement(registry.get(id));
    if (!element) return;
    elements.push(element);
  });
  return elements;
}

function resolveTopSemanticDomHitElement(inst, nativeEvent) {
  const elements = readDomHitElements(inst, nativeEvent);
  for (let i = 0; i < elements.length; i += 1) {
    const item = normalizeTargetElement(elements[i]);
    if (!item || isCanvasContainerElement(item, inst)) continue;
    return item;
  }
  return null;
}

function distanceToRect(point, shape) {
  if (!point || !isShapeElement(shape)) return Number.POSITIVE_INFINITY;
  const px = Number(point?.x || 0);
  const py = Number(point?.y || 0);
  const x = Number(shape?.x || 0);
  const y = Number(shape?.y || 0);
  const width = Number(shape?.width || 0);
  const height = Number(shape?.height || 0);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const dx = Math.max(x - px, 0, px - (x + width));
  const dy = Math.max(y - py, 0, py - (y + height));
  return Math.hypot(dx, dy);
}

function distanceToConnection(point, connection) {
  if (!point || !isConnectionElement(connection)) return Number.POSITIVE_INFINITY;
  const waypoints = Array.isArray(connection?.waypoints) ? connection.waypoints : [];
  if (waypoints.length < 2) return Number.POSITIVE_INFINITY;
  const px = Number(point?.x || 0);
  const py = Number(point?.y || 0);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const ax = Number(a?.x || 0);
    const ay = Number(a?.y || 0);
    const bx = Number(b?.x || 0);
    const by = Number(b?.y || 0);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let dist = Number.POSITIVE_INFINITY;
    if (len2 <= 0.0001) {
      dist = Math.hypot(px - ax, py - ay);
    } else {
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const nx = ax + t * dx;
      const ny = ay + t * dy;
      dist = Math.hypot(px - nx, py - ny);
    }
    if (dist < best) best = dist;
  }
  return best;
}

function resolveNearestSemanticElementAtPoint(
  inst,
  nativeEvent,
  {
    preferConnection = false,
    strictHitOnly = false,
    allowConnections = true,
  } = {},
) {
  const point = readDiagramPointFromClient(inst, nativeEvent);
  if (!point) return null;
  const registry = inst?.get?.("elementRegistry");
  if (!registry || typeof registry?.getAll !== "function") return null;
  const all = registry.getAll?.() || [];
  const scale = Math.max(Number(point?.scale || 1), 0.1);
  const threshold = Math.max(6, 18 / scale);
  const strictShapeThreshold = 0.5;
  const strictConnectionThreshold = Math.max(6, 14 / scale);
  let best = null;
  let bestConnection = null;
  all.forEach((itemRaw) => {
    const item = normalizeTargetElement(itemRaw);
    if (!item || isCanvasContainerElement(item, inst)) return;
    const isConnection = isConnectionElement(item);
    if (!allowConnections && isConnection) return;
    const dist = isConnection
      ? distanceToConnection(point, item)
      : distanceToRect(point, item);
    if (!Number.isFinite(dist)) return;
    if (!best || dist < best.dist) best = { item, dist, isConnection };
    if (isConnection && (!bestConnection || dist < bestConnection.dist)) {
      bestConnection = { item, dist };
    }
  });

  if (strictHitOnly === true) {
    if (preferConnection === true && bestConnection && bestConnection.dist <= strictConnectionThreshold) {
      return bestConnection.item || null;
    }
    if (!best) return null;
    const strictThreshold = best.isConnection ? strictConnectionThreshold : strictShapeThreshold;
    if (best.dist > strictThreshold) return null;
    return best.item || null;
  }

  if (preferConnection === true && bestConnection && bestConnection.dist <= threshold) {
    return bestConnection.item || null;
  }
  if (!best || best.dist > threshold) return null;
  return best.item || null;
}

function isExcludedDiagramUiTarget(targetNode) {
  if (!isElementNode(targetNode)) return false;
  return !!targetNode.closest?.([
    ".djs-palette",
    ".djs-popup",
    ".bjs-powered-by",
    ".drawioInteractionLayer",
    "[data-testid='drawio-interaction-layer']",
    "[data-testid='drawio-interaction-layer-root']",
    "[data-drawio-el-id]",
  ].join(", "));
}

function writeContextDebugSnapshot(snapshot) {
  if (typeof window === "undefined") return;
  try {
    window.__FPC_CTX_DEBUG_LAST_RESOLVE__ = snapshot;
  } catch {
    // no-op
  }
}

export function readContextMenuNativeEvent(runtimeEvent) {
  if (!runtimeEvent || typeof runtimeEvent !== "object") return null;
  return runtimeEvent?.originalEvent || runtimeEvent?.srcEvent || runtimeEvent;
}

export function resolveBpmnContextMenuTarget({ runtimeEvent, scope = "canvas", inst } = {}) {
  const nativeEvent = readContextMenuNativeEvent(runtimeEvent);
  const canvasContainer = inst?.get?.("canvas")?._container;
  const stageHost = canvasContainer?.closest?.(".bpmnStageHost") || canvasContainer;
  const eventTargetNode = isElementNode(nativeEvent?.target) ? nativeEvent.target : null;
  const runtimeType = toText(runtimeEvent?.type).toLowerCase();
  const isNativeContextMenu = runtimeType === "native.contextmenu";

  if (isElementNode(eventTargetNode) && isElementNode(stageHost) && !stageHost.contains(eventTargetNode)) {
    const target = { kind: "unsupported", reason: "outside_canvas" };
    writeContextDebugSnapshot({ source: "resolve", runtimeType, scope, target });
    return target;
  }

  if (isElementNode(eventTargetNode) && isElementNode(canvasContainer) && !canvasContainer.contains(eventTargetNode)) {
    const insideCanvasRect = isPointInsideRectByEventTarget(nativeEvent, canvasContainer);
    const insideStageRect = isPointInsideRectByEventTarget(nativeEvent, stageHost);
    if (!insideCanvasRect && !insideStageRect) {
      const target = { kind: "unsupported", reason: "outside_canvas" };
      writeContextDebugSnapshot({ source: "resolve", runtimeType, scope, target });
      return target;
    }
  }

  if (isExcludedDiagramUiTarget(eventTargetNode)) {
    const target = { kind: "unsupported", reason: "excluded_ui_surface" };
    writeContextDebugSnapshot({ source: "resolve", runtimeType, scope, target });
    return target;
  }

  const registry = inst?.get?.("elementRegistry");
  const hintedElementId = toText(eventTargetNode?.closest?.("[data-element-id]")?.getAttribute?.("data-element-id"));
  const hintedElement = hintedElementId ? registry?.get?.(hintedElementId) : null;
  const runtimeElement = runtimeEvent?.element || runtimeEvent?.shape || runtimeEvent?.connection || null;
  const topSemanticDomHit = resolveTopSemanticDomHitElement(inst, nativeEvent);
  const nearestSemanticByPoint = resolveNearestSemanticElementAtPoint(inst, nativeEvent);
  const strictConnectionByPoint = resolveNearestSemanticElementAtPoint(inst, nativeEvent, {
    preferConnection: true,
    strictHitOnly: true,
  });
  const strictShapeByPoint = resolveNearestSemanticElementAtPoint(inst, nativeEvent, {
    strictHitOnly: true,
    allowConnections: false,
  });
  const domHitElementIds = readDomHitElementIds(inst, nativeEvent);
  let strictNativeSemanticHit = null;
  let strictNativeSemanticHitAccepted = null;
  const hintedOrRuntime = normalizeTargetElement(hintedElement || runtimeElement || null);
  const hintedIsContainer = isCanvasContainerElement(hintedOrRuntime, inst);
  let element = null;
  if (isNativeContextMenu) {
    strictNativeSemanticHit = normalizeTargetElement(
      hintedIsContainer
        ? strictShapeByPoint
        : (strictConnectionByPoint || strictShapeByPoint),
    );
    const strictNativeSemanticHitId = toText(strictNativeSemanticHit?.id);
    const hasDomCorroboration = !strictNativeSemanticHitId
      || domHitElementIds.length === 0
      || domHitElementIds.includes(strictNativeSemanticHitId);
    strictNativeSemanticHitAccepted = hasDomCorroboration ? strictNativeSemanticHit : null;
    const strictHitId = toText(strictNativeSemanticHit?.id);
    const domHitId = toText(topSemanticDomHit?.id);
    const strictMatchesDomHit = !!strictHitId && !!domHitId && strictHitId === domHitId;
    if (hintedIsContainer || !hintedOrRuntime) {
      // Native host/container hits must be promoted only by strict point proof.
      element = normalizeTargetElement(strictNativeSemanticHitAccepted || (strictMatchesDomHit ? topSemanticDomHit : null));
    } else {
      const hintedId = toText(hintedOrRuntime?.id);
      const strictId = toText(strictNativeSemanticHitAccepted?.id);
      const strictOverridesHint = !hintedElement && !!strictId && strictId !== hintedId;
      element = normalizeTargetElement(strictOverridesHint ? strictNativeSemanticHitAccepted : hintedOrRuntime);
    }
  } else {
    element = normalizeTargetElement(topSemanticDomHit || runtimeElement || hintedElement || null);
    const allowNearestRecovery = toText(scope).toLowerCase() !== "canvas"
      && runtimeType !== "canvas.contextmenu";
    if (
      allowNearestRecovery
      && (!element || isCanvasContainerElement(element, inst))
      && nearestSemanticByPoint
    ) {
      element = normalizeTargetElement(nearestSemanticByPoint);
    }
  }

  if (isCanvasContainerElement(element, inst)) {
    const target = { kind: "canvas" };
    writeContextDebugSnapshot({
      source: "resolve",
      runtimeType,
      scope,
      hintedElementId: toText(hintedElement?.id),
      runtimeElementId: toText(runtimeElement?.id),
      strictNativeSemanticHitId: toText(strictNativeSemanticHit?.id),
      strictNativeSemanticHitAcceptedId: toText(strictNativeSemanticHitAccepted?.id),
      target,
    });
    return target;
  }

  if (!element) {
    const target = { kind: "canvas" };
    writeContextDebugSnapshot({
      source: "resolve",
      runtimeType,
      scope,
      hintedElementId: toText(hintedElement?.id),
      runtimeElementId: toText(runtimeElement?.id),
      strictNativeSemanticHitId: toText(strictNativeSemanticHit?.id),
      strictNativeSemanticHitAcceptedId: toText(strictNativeSemanticHitAccepted?.id),
      target,
    });
    return target;
  }

  const bpmnType = toText(element?.businessObject?.$type || element?.type);
  const isConnection = isConnectionElement(element);
  const target = {
    kind: isConnection ? "connection" : "element",
    id: toText(element?.id),
    name: toText(element?.businessObject?.name),
    bpmnType,
    type: bpmnType,
    isConnection,
    isShape: isShapeElement(element),
  };
  writeContextDebugSnapshot({
    source: "resolve",
    runtimeType,
    scope,
    hintedElementId: toText(hintedElement?.id),
    runtimeElementId: toText(runtimeElement?.id),
    strictNativeSemanticHitId: toText(strictNativeSemanticHit?.id),
    strictNativeSemanticHitAcceptedId: toText(strictNativeSemanticHitAccepted?.id),
    target,
  });
  return target;
}
