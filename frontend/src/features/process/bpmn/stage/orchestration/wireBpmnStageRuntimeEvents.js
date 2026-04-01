function setInteractionFlag(ref, key, active) {
  if (!ref || !ref.current || typeof ref.current !== "object") return;
  ref.current[key] = active === true;
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
  if (canvasContainer instanceof Element) {
    const onNativeContextMenu = (nativeEvent) => {
      if (typeof onDiagramContextMenuEvent !== "function") return;
      const targetNode = nativeEvent?.target instanceof Element ? nativeEvent.target : null;
      if (!(targetNode instanceof Element) || !canvasContainer.contains(targetNode)) return;
      if (targetNode.closest?.(".djs-palette, .djs-context-pad, .djs-popup, .bjs-powered-by")) return;
      const onDiagramSurface = targetNode.closest?.("svg, [data-element-id], .djs-element, .djs-visual");
      if (!(onDiagramSurface instanceof Element) && targetNode !== canvasContainer) return;
      const host = targetNode.closest?.("[data-element-id]");
      const elementId = String(host?.getAttribute?.("data-element-id") || "").trim();
      const element = elementId ? elementRegistry?.get?.(elementId) : null;
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
    canvasContainer.addEventListener("contextmenu", onNativeContextMenu, true);
    eventBus.on("canvas.destroy", 2200, () => {
      canvasContainer.removeEventListener("contextmenu", onNativeContextMenu, true);
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
    if (typeof onDiagramContextMenuDismiss === "function") {
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
    if (typeof onDiagramContextMenuDismiss === "function") {
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
