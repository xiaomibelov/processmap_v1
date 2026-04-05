import { resolveBpmnContextMenuRuntimeResolution } from "../../context-menu/resolveBpmnContextMenuTarget.js";

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
      const hintedElement = elementId ? elementRegistry?.get?.(elementId) : null;
      const resolution = resolveBpmnContextMenuRuntimeResolution({
        runtimeEvent: {
          type: "native.contextmenu",
          element: hintedElement,
          originalEvent: nativeEvent,
        },
        scope: hintedElement ? "element" : "canvas",
        inst,
      });
      if (resolution?.target?.kind === "unsupported") return;
      writeNativeContextDebugSnapshot({
        source: "wire.native.contextmenu",
        clientX: Number(nativeEvent?.clientX || 0),
        clientY: Number(nativeEvent?.clientY || 0),
        hasOwnedTargetNode,
        hostElementId: elementId,
        hostElementType: String(resolution?.meta?.hintedElementType || ""),
        nearestByPointId: String(resolution?.meta?.nearestSemanticByPointId || ""),
        nearestByPointType: String(resolution?.meta?.nearestSemanticByPointType || ""),
        nearestConnectionByPointId: String(resolution?.meta?.strictConnectionByPointId || ""),
        nearestConnectionByPointType: String(resolution?.meta?.strictConnectionByPointType || ""),
        finalElementId: String(resolution?.meta?.finalElementId || ""),
        finalElementType: String(resolution?.meta?.finalElementType || ""),
        finalElementIsContainer: resolution?.meta?.finalElementIsCanvasContainer === true,
      });
      markContextMenuOpen(contextMenuInteractionRef);
      onDiagramContextMenuEvent({
        mode,
        scope: resolution?.target?.kind === "canvas" ? "canvas" : "element",
        event: {
          originalEvent: nativeEvent,
          element: resolution?.element || null,
          contextMenuResolution: resolution,
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
  onDiagramContextMenuEvent,
  onDiagramContextMenuDismiss,
  contextMenuInteractionRef,
  invalidateShapeTitleLookup,
  runImmediateEditorFanout,
  applyTaskTypeDecor,
  applyLinkEventDecor,
  applyHappyFlowDecor,
  applyRobotMetaDecor,
  captureShapeReplacePre,
  applyShapeReplacePost,
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
