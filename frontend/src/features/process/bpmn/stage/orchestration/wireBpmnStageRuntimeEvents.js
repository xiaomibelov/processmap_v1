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
}) {
  eventBus.on("selection.changed", 2000, (ev) => {
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
}) {
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
