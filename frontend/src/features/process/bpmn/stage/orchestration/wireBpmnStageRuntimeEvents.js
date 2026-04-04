function setInteractionFlag(ref, key, active) {
  if (!ref || !ref.current || typeof ref.current !== "object") return;
  ref.current[key] = active === true;
}

function markContextMenuOpen(ref) {
  if (!ref || !ref.current || typeof ref.current !== "object") return;
  ref.current.contextMenuOpenedAtMs = Date.now();
}

function consumeContextMenuSelectionDismissGuard(ref, maxAgeMs = 220) {
  if (!ref || !ref.current || typeof ref.current !== "object") return false;
  const openedAt = Number(ref.current.contextMenuOpenedAtMs || 0);
  if (!Number.isFinite(openedAt) || openedAt <= 0) return false;
  const age = Date.now() - openedAt;
  if (age <= Number(maxAgeMs || 0)) {
    return true;
  }
  ref.current.contextMenuOpenedAtMs = 0;
  return false;
}

const CONTEXT_MENU_EXCLUDED_SELECTOR = [
  ".djs-palette",
  ".djs-popup",
  ".bjs-powered-by",
  ".drawioInteractionLayer",
  "[data-testid='drawio-interaction-layer']",
  "[data-testid='drawio-interaction-layer-root']",
  "[data-drawio-el-id]",
  ".bpmnCanvasTools",
  ".diagramActionBar",
  ".diagramActionToolbarGroup",
  ".diagramToolbarOverlay",
  "[data-testid='diagram-toolbar-overlay']",
  "[data-testid='bpmn-context-menu']",
].join(", ");

function isContextMenuExcludedTarget(targetNode) {
  if (!(targetNode instanceof Element)) return false;
  return !!targetNode.closest?.(CONTEXT_MENU_EXCLUDED_SELECTOR);
}

function writeNativeContextDebugSnapshot(snapshot) {
  if (typeof window === "undefined") return;
  try {
    window.__FPC_CTX_DEBUG_LAST_NATIVE__ = snapshot;
  } catch {
    // no-op
  }
}

function isPointInsideCanvasRect(nativeEvent, canvasContainer) {
  if (!(canvasContainer instanceof Element)) return false;
  const rect = canvasContainer.getBoundingClientRect?.();
  if (!rect) return false;
  const clientX = Number(nativeEvent?.clientX);
  const clientY = Number(nativeEvent?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
  return clientX >= Number(rect.left || 0)
    && clientX <= Number(rect.right || 0)
    && clientY >= Number(rect.top || 0)
    && clientY <= Number(rect.bottom || 0);
}

function readElementTypeLower(elementRaw) {
  const element = normalizeTargetElement(elementRaw);
  return String(element?.businessObject?.$type || element?.type || "").trim().toLowerCase();
}

function normalizeTargetElement(elementRaw) {
  const element = elementRaw && typeof elementRaw === "object" ? elementRaw : null;
  if (!element) return null;
  if (element?.labelTarget && typeof element.labelTarget === "object") {
    return element.labelTarget;
  }
  return element;
}

function rankContextMenuCandidate(elementRaw) {
  const element = normalizeTargetElement(elementRaw);
  if (!element) return -1;
  const type = readElementTypeLower(element);
  const isConnection = Array.isArray(element?.waypoints);
  if (type.includes("task") || type.includes("activity")) return 400;
  if (type.includes("gateway")) return 390;
  if (type.includes("event")) return 380;
  if (isConnection || type.includes("sequenceflow")) return 370;
  if (type.includes("subprocess")) return 360;
  if (type.includes("annotation")) return 350;
  if (type.includes("lane") || type.includes("participant")) return 100;
  if (type.includes("process") || type.includes("collaboration")) return 50;
  return 300;
}

function isContainerLikeBpmnElement(elementRaw) {
  const type = readElementTypeLower(elementRaw);
  return type.includes("lane")
    || type.includes("participant")
    || type.includes("process")
    || type.includes("collaboration");
}

function readDiagramPointFromClient(nativeEvent, canvas) {
  const rect = canvas?._container?.getBoundingClientRect?.();
  if (!rect) return null;
  const clientX = Number(nativeEvent?.clientX);
  const clientY = Number(nativeEvent?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const vb = canvas?.viewbox?.() || {};
  const scale = Number(vb?.scale || canvas?.zoom?.() || 1) || 1;
  return {
    x: Number(vb?.x || 0) + (clientX - Number(rect.left || 0)) / scale,
    y: Number(vb?.y || 0) + (clientY - Number(rect.top || 0)) / scale,
    scale,
  };
}

function distanceToRect(point, elementRaw) {
  const el = elementRaw && typeof elementRaw === "object" ? elementRaw : {};
  const px = Number(point?.x || 0);
  const py = Number(point?.y || 0);
  const x = Number(el?.x || 0);
  const y = Number(el?.y || 0);
  const w = Number(el?.width || 0);
  const h = Number(el?.height || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const dx = Math.max(x - px, 0, px - (x + w));
  const dy = Math.max(y - py, 0, py - (y + h));
  return Math.hypot(dx, dy);
}

function distanceToConnection(point, elementRaw) {
  const waypoints = Array.isArray(elementRaw?.waypoints) ? elementRaw.waypoints : [];
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

function resolveNearestElementFromDiagramPoint({
  nativeEvent,
  canvas,
  elementRegistry,
  preferConnection = false,
  strictHitOnly = false,
}) {
  if (!canvas || !elementRegistry || typeof elementRegistry?.getAll !== "function") return null;
  const point = readDiagramPointFromClient(nativeEvent, canvas);
  if (!point) return null;
  const all = elementRegistry.getAll?.() || [];
  const seen = new Set();
  const eligible = all
    .map((itemRaw) => normalizeTargetElement(itemRaw))
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      const itemId = String(item?.id || "").trim();
      if (!itemId || seen.has(itemId)) return false;
      seen.add(itemId);
      if (isContainerLikeBpmnElement(item)) return false;
      return true;
    });
  if (!eligible.length) return null;
  const scale = Math.max(Number(point.scale || 1), 0.1);
  const threshold = Math.max(6, 18 / scale);
  const strictShapeThreshold = 0.5;
  const strictConnectionThreshold = Math.max(4, 10 / scale);
  let best = null;
  let bestConnection = null;
  for (let i = 0; i < eligible.length; i += 1) {
    const item = eligible[i];
    const isConnection = Array.isArray(item?.waypoints);
    const dist = isConnection ? distanceToConnection(point, item) : distanceToRect(point, item);
    if (!Number.isFinite(dist)) continue;
    if (!best || dist < best.dist) best = { item, dist };
    if (isConnection && (!bestConnection || dist < bestConnection.dist)) {
      bestConnection = { item, dist };
    }
  }
  if (strictHitOnly === true) {
    if (preferConnection === true && bestConnection && bestConnection.dist <= strictConnectionThreshold) {
      return bestConnection.item || null;
    }
    if (!best) return null;
    const bestIsConnection = Array.isArray(best?.item?.waypoints);
    const strictThreshold = bestIsConnection ? strictConnectionThreshold : strictShapeThreshold;
    if (best.dist > strictThreshold) return null;
    return best.item || null;
  }

  if (preferConnection === true && bestConnection && bestConnection.dist <= threshold) {
    return bestConnection.item || null;
  }
  if (!best || best.dist > threshold) return null;
  return best.item || null;
}

function resolveElementFromClientPoint({
  nativeEvent,
  ownerContainer,
  canvasContainer,
  canvas,
  elementRegistry,
}) {
  if (!(ownerContainer instanceof Element)) return null;
  if (!(canvasContainer instanceof Element)) return null;
  if (!elementRegistry || typeof elementRegistry?.get !== "function") return null;
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return null;
  const clientX = Number(nativeEvent?.clientX);
  const clientY = Number(nativeEvent?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const nodes = document.elementsFromPoint(clientX, clientY);
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const candidates = [];
  const seen = new Set();
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!(node instanceof Element)) continue;
    if (!ownerContainer.contains(node) && !canvasContainer.contains(node)) continue;
    const elementId = String(node.closest?.("[data-element-id]")?.getAttribute?.("data-element-id") || "").trim();
    if (!elementId) continue;
    if (seen.has(elementId)) continue;
    seen.add(elementId);
    const element = normalizeTargetElement(elementRegistry.get(elementId));
    if (!element) continue;
    candidates.push({
      element,
      stackIndex: i,
      rank: rankContextMenuCandidate(element),
    });
  }
  if (!candidates.length) return null;
  const semanticByStackOrder = candidates
    .filter((candidate) => !isContainerLikeBpmnElement(candidate.element))
    .sort((a, b) => a.stackIndex - b.stackIndex);
  if (semanticByStackOrder.length) {
    return semanticByStackOrder[0].element || null;
  }
  candidates.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.stackIndex - b.stackIndex;
  });
  return candidates[0]?.element || null;
}

function bindContextMenuRuntimeEvents({
  eventBus,
  inst,
  mode,
  onDiagramContextMenuEvent,
  onDiagramContextMenuDismiss,
  contextMenuInteractionRef,
}) {
  if (!eventBus) return;
  const emitDismiss = (reason) => {
    if (typeof onDiagramContextMenuDismiss !== "function") return;
    onDiagramContextMenuDismiss({
      mode,
      reason: String(reason || "").trim() || "runtime_event",
    });
  };
  const setFlag = (key, active) => setInteractionFlag(contextMenuInteractionRef, key, active);

  const canvas = inst?.get?.("canvas");
  const elementRegistry = inst?.get?.("elementRegistry");
  const canvasContainer = canvas?._container;
  const contextMenuOwner = canvasContainer?.closest?.(".bpmnStageHost") || canvasContainer;
  if (contextMenuOwner instanceof Element && canvasContainer instanceof Element) {
    const onNativeContextMenu = (nativeEvent) => {
      if (typeof onDiagramContextMenuEvent !== "function") return;
      const targetNode = nativeEvent?.target instanceof Element ? nativeEvent.target : null;
      const insideCanvasRect = isPointInsideCanvasRect(nativeEvent, canvasContainer);
      const insideOwnerRect = isPointInsideCanvasRect(nativeEvent, contextMenuOwner);
      if (!insideCanvasRect && !insideOwnerRect) return;
      if (targetNode instanceof Element && isContextMenuExcludedTarget(targetNode)) return;

      const clientX = Number(nativeEvent?.clientX);
      const clientY = Number(nativeEvent?.clientY);
      const stackNodes = Number.isFinite(clientX)
        && Number.isFinite(clientY)
        && typeof document !== "undefined"
        && typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(clientX, clientY)
        : [];
      const ownedStackNode = Array.isArray(stackNodes)
        ? stackNodes.find((node) => node instanceof Element
          && (contextMenuOwner.contains(node) || canvasContainer.contains(node)))
        : null;
      const effectiveTargetNode = ownedStackNode instanceof Element
        ? ownedStackNode
        : (targetNode instanceof Element
          && (contextMenuOwner.contains(targetNode) || canvasContainer.contains(targetNode))
          ? targetNode
          : null);

      if (effectiveTargetNode instanceof Element && isContextMenuExcludedTarget(effectiveTargetNode)) return;
      const hasOwnedTargetNode = effectiveTargetNode instanceof Element;
      const host = hasOwnedTargetNode && canvasContainer.contains(effectiveTargetNode)
        ? effectiveTargetNode.closest?.("[data-element-id]")
        : null;
      const elementId = canvasContainer.contains(host) ? String(host?.getAttribute?.("data-element-id") || "").trim() : "";
      let element = elementId ? elementRegistry?.get?.(elementId) : null;
      const nearestByPoint = resolveNearestElementFromDiagramPoint({
        nativeEvent,
        canvas,
        elementRegistry,
        strictHitOnly: true,
      });
      const nearestConnectionByPoint = resolveNearestElementFromDiagramPoint({
        nativeEvent,
        canvas,
        elementRegistry,
        preferConnection: true,
        strictHitOnly: true,
      });
      if (!element || isContainerLikeBpmnElement(element)) {
        const recoveredFromStack = resolveElementFromClientPoint({
          nativeEvent,
          ownerContainer: contextMenuOwner,
          canvasContainer,
          canvas,
          elementRegistry,
        });
        if (recoveredFromStack) {
          element = recoveredFromStack;
        } else if (hasOwnedTargetNode && nearestConnectionByPoint) {
          element = nearestConnectionByPoint;
        } else if (hasOwnedTargetNode && nearestByPoint) {
          element = nearestByPoint;
        }
      }
      writeNativeContextDebugSnapshot({
        source: "wire.native.contextmenu",
        clientX: Number(nativeEvent?.clientX || 0),
        clientY: Number(nativeEvent?.clientY || 0),
        hasOwnedTargetNode,
        hostElementId: elementId,
        hostElementType: readElementTypeLower(elementId ? elementRegistry?.get?.(elementId) : null),
        nearestByPointId: String(nearestByPoint?.id || ""),
        nearestByPointType: readElementTypeLower(nearestByPoint),
        nearestConnectionByPointId: String(nearestConnectionByPoint?.id || ""),
        nearestConnectionByPointType: readElementTypeLower(nearestConnectionByPoint),
        finalElementId: String(element?.id || ""),
        finalElementType: readElementTypeLower(element),
        finalElementIsContainer: isContainerLikeBpmnElement(element),
      });
      markContextMenuOpen(contextMenuInteractionRef);
      onDiagramContextMenuEvent({
        mode,
        scope: element ? "element" : "canvas",
        event: {
          originalEvent: nativeEvent,
          element,
          type: "native.contextmenu",
        },
        inst,
        source: "native.contextmenu",
      });
    };
    contextMenuOwner.addEventListener("contextmenu", onNativeContextMenu, true);
    eventBus.on("canvas.destroy", 2200, () => {
      contextMenuOwner.removeEventListener("contextmenu", onNativeContextMenu, true);
    });
  }

  eventBus.on("element.contextmenu", 2400, (ev) => {
    if (typeof onDiagramContextMenuEvent !== "function") return;
    onDiagramContextMenuEvent({
      mode,
      scope: "element",
      event: ev,
      inst,
      source: "element.contextmenu",
    });
  });

  eventBus.on("canvas.contextmenu", 2400, (ev) => {
    if (typeof onDiagramContextMenuEvent !== "function") return;
    onDiagramContextMenuEvent({
      mode,
      scope: "canvas",
      event: ev,
      inst,
      source: "canvas.contextmenu",
    });
  });

  eventBus.on("directEditing.activate", 2300, () => setFlag("directEditingActive", true));
  eventBus.on("directEditing.complete", 2300, () => setFlag("directEditingActive", false));
  eventBus.on("directEditing.cancel", 2300, () => setFlag("directEditingActive", false));

  eventBus.on("drag.start", 2300, () => {
    setFlag("dragInProgress", true);
    emitDismiss("drag_start");
  });
  eventBus.on("drag.cleanup", 2300, () => setFlag("dragInProgress", false));

  eventBus.on("create.start", 2300, () => {
    setFlag("createInProgress", true);
    emitDismiss("create_start");
  });
  eventBus.on("create.cleanup", 2300, () => setFlag("createInProgress", false));

  eventBus.on("connect.start", 2300, () => {
    setFlag("connectInProgress", true);
    emitDismiss("connect_start");
  });
  eventBus.on("connect.cleanup", 2300, () => setFlag("connectInProgress", false));

  eventBus.on("resize.start", 2300, () => {
    setFlag("resizeInProgress", true);
    emitDismiss("resize_start");
  });
  eventBus.on("resize.cleanup", 2300, () => setFlag("resizeInProgress", false));
}

export function bindViewerStageEvents({
  eventBus,
  inst,
  isSelectableElement,
  asArray,
  selectionImportGuardRef,
  traceSelectionContinuity,
  clearSelectedDecor,
  emitElementSelectionChange,
  clearAiQuestionPanel,
  setSelectedDecor,
  buildInsertBetweenCandidate,
  emitElementSelection,
  syncAiQuestionPanelWithSelection,
  suppressViewboxEventRef,
  userViewportTouchedRef,
  getCanvasSnapshot,
  logViewAction,
  view,
  sessionId,
  runtimeTokenRef,
  emitViewboxChanged,
  applyPropertiesOverlayDecorForZoomChange,
  onDiagramContextMenuEvent,
  onDiagramContextMenuDismiss,
  contextMenuInteractionRef,
}) {
  bindContextMenuRuntimeEvents({
    eventBus,
    inst,
    mode: "viewer",
    onDiagramContextMenuEvent,
    onDiagramContextMenuDismiss,
    contextMenuInteractionRef,
  });

  eventBus.on("selection.changed", 2000, (ev) => {
    const suppressDismiss = consumeContextMenuSelectionDismissGuard(contextMenuInteractionRef);
    if (!suppressDismiss && typeof onDiagramContextMenuDismiss === "function") {
      onDiagramContextMenuDismiss({ mode: "viewer", reason: "selection_changed" });
    }
    const selectedList = asArray(ev?.newSelection).filter((el) => isSelectableElement(el));
    const selected = selectedList[0];
    if (!isSelectableElement(selected)) {
      if (String(selectionImportGuardRef.current.viewer || "").trim()) {
        traceSelectionContinuity("selection_change_suppressed", {
          mode: "viewer",
          source: "viewer.selection_changed",
          guardedSelectedId: String(selectionImportGuardRef.current.viewer || "").trim(),
        });
        return;
      }
      clearSelectedDecor(inst, "viewer");
      emitElementSelectionChange(null);
      clearAiQuestionPanel(inst, "viewer");
      return;
    }
    setSelectedDecor(inst, "viewer", selected.id);
    const candidate = buildInsertBetweenCandidate(inst, selectedList);
    emitElementSelection(selected, "viewer.selection_changed", {
      selectedIds: selectedList.map((item) => String(item?.id || "")),
      insertBetween: candidate,
    });
    syncAiQuestionPanelWithSelection(inst, "viewer", selected, "viewer.selection_changed");
  });

  eventBus.on("canvas.viewbox.changed", 1200, () => {
    if (typeof onDiagramContextMenuDismiss === "function") {
      onDiagramContextMenuDismiss({ mode: "viewer", reason: "viewbox_changed" });
    }
    const suppressed = Number(suppressViewboxEventRef.current || 0) > 0;
    if (!suppressed) userViewportTouchedRef.current = true;
    const snap = getCanvasSnapshot(inst);
    logViewAction(
      "viewbox.changed",
      snap,
      snap,
      {
        reason: suppressed ? "programmatic" : "user",
        tab: view === "xml" ? "xml" : "diagram",
        sid: String(sessionId || "-"),
        token: Number(runtimeTokenRef.current || 0),
      },
    );
    emitViewboxChanged({
      mode: "viewer",
      suppressed,
      snapshot: snap,
    });
    applyPropertiesOverlayDecorForZoomChange(inst, "viewer");
  });
}

export function bindModelerStageEvents({
  eventBus,
  inst,
  isSelectableElement,
  asArray,
  selectionImportGuardRef,
  traceSelectionContinuity,
  clearSelectedDecor,
  emitElementSelectionChange,
  clearAiQuestionPanel,
  setSelectedDecor,
  buildInsertBetweenCandidate,
  emitElementSelection,
  syncAiQuestionPanelWithSelection,
  suppressViewboxEventRef,
  userViewportTouchedRef,
  getCanvasSnapshot,
  logViewAction,
  view,
  sessionId,
  runtimeTokenRef,
  emitViewboxChanged,
  applyPropertiesOverlayDecorForZoomChange,
  invalidateShapeTitleLookup,
  runImmediateEditorFanout,
  applyTaskTypeDecor,
  applyLinkEventDecor,
  applyHappyFlowDecor,
  applyRobotMetaDecor,
  captureShapeReplacePre,
  applyShapeReplacePost,
  onDiagramContextMenuEvent,
  onDiagramContextMenuDismiss,
  contextMenuInteractionRef,
}) {
  bindContextMenuRuntimeEvents({
    eventBus,
    inst,
    mode: "editor",
    onDiagramContextMenuEvent,
    onDiagramContextMenuDismiss,
    contextMenuInteractionRef,
  });

  eventBus.on("commandStack.shape.replace.preExecute", 2200, (ev) => {
    captureShapeReplacePre(ev, "commandStack.shape.replace.preExecute");
  });
  eventBus.on("commandStack.shape.replace.postExecute", 2200, (ev) => {
    applyShapeReplacePost(inst, ev, "commandStack.shape.replace.postExecute");
  });
  eventBus.on("commandStack.changed", 900, () => {
    invalidateShapeTitleLookup(inst.get("elementRegistry"));
    runImmediateEditorFanout({
      inst,
      applyTaskTypeDecor,
      applyLinkEventDecor,
      applyHappyFlowDecor,
      applyRobotMetaDecor,
    });
  });
  eventBus.on("selection.changed", 2000, (ev) => {
    const suppressDismiss = consumeContextMenuSelectionDismissGuard(contextMenuInteractionRef);
    if (!suppressDismiss && typeof onDiagramContextMenuDismiss === "function") {
      onDiagramContextMenuDismiss({ mode: "editor", reason: "selection_changed" });
    }
    const selectedList = asArray(ev?.newSelection).filter((el) => isSelectableElement(el));
    const selected = selectedList[0];
    if (!isSelectableElement(selected)) {
      if (String(selectionImportGuardRef.current.editor || "").trim()) {
        traceSelectionContinuity("selection_change_suppressed", {
          mode: "editor",
          source: "editor.selection_changed",
          guardedSelectedId: String(selectionImportGuardRef.current.editor || "").trim(),
        });
        return;
      }
      clearSelectedDecor(inst, "editor");
      emitElementSelectionChange(null);
      clearAiQuestionPanel(inst, "editor");
      return;
    }
    setSelectedDecor(inst, "editor", selected.id);
    const candidate = buildInsertBetweenCandidate(inst, selectedList);
    emitElementSelection(selected, "editor.selection_changed", {
      selectedIds: selectedList.map((item) => String(item?.id || "")),
      insertBetween: candidate,
    });
    syncAiQuestionPanelWithSelection(inst, "editor", selected, "editor.selection_changed");
  });
  eventBus.on("canvas.viewbox.changed", 1200, () => {
    if (typeof onDiagramContextMenuDismiss === "function") {
      onDiagramContextMenuDismiss({ mode: "editor", reason: "viewbox_changed" });
    }
    const suppressed = Number(suppressViewboxEventRef.current || 0) > 0;
    if (!suppressed) userViewportTouchedRef.current = true;
    const snap = getCanvasSnapshot(inst);
    logViewAction(
      "viewbox.changed",
      snap,
      snap,
      {
        reason: suppressed ? "programmatic" : "user",
        tab: view === "xml" ? "xml" : "diagram",
        sid: String(sessionId || "-"),
        token: Number(runtimeTokenRef.current || 0),
      },
    );
    emitViewboxChanged({
      mode: "editor",
      suppressed,
      snapshot: snap,
    });
    applyPropertiesOverlayDecorForZoomChange(inst, "editor");
  });
}
