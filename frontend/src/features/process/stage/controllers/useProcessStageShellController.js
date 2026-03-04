import { useMemo } from "react";

export default function useProcessStageShellController({
  hasSession,
  isBpmnTab,
  isSwitchingTab,
  isFlushingTab,
  isManualSaveBusy,
  saveDirtyHint,
  workbench,
  genErr,
  infoMsg,
  selectedElementContext,
  selectedBpmnElementIds,
  templatesBusy,
  tab,
  availablePathTiers,
  topPanelsView,
  attentionPanelsView,
  dialogsView,
}) {
  const shellProps = useMemo(() => {
    const canSaveNow = !!hasSession && !!isBpmnTab && !isSwitchingTab && !isFlushingTab && !isManualSaveBusy;
    return {
      canSaveNow,
      saveSmartText: canSaveNow
        ? (saveDirtyHint ? "Сохранить" : "Сохранено ✓")
        : workbench.labels.save,
      toolbarInlineMessage: String(genErr || infoMsg || "").trim(),
      toolbarInlineTone: genErr ? "err" : "",
      canUseElementContextActions: !!selectedElementContext,
      templateSelectionCount: selectedBpmnElementIds.length,
      canCreateTemplateFromSelection: hasSession && tab === "diagram" && !templatesBusy && selectedBpmnElementIds.length > 0,
      canOpenTemplatesList: hasSession && !templatesBusy,
      hasPathHighlightData: availablePathTiers.length > 0,
    };
  }, [
    availablePathTiers.length,
    genErr,
    hasSession,
    infoMsg,
    isBpmnTab,
    isFlushingTab,
    isManualSaveBusy,
    isSwitchingTab,
    saveDirtyHint,
    selectedBpmnElementIds.length,
    selectedElementContext,
    tab,
    templatesBusy,
    workbench.labels.save,
  ]);

  const panelsProps = useMemo(
    () => ({
      top: topPanelsView,
      attention: attentionPanelsView,
    }),
    [attentionPanelsView, topPanelsView],
  );

  const stableDialogsProps = useMemo(() => dialogsView, [dialogsView]);

  return {
    shellProps,
    panelsProps,
    dialogsProps: stableDialogsProps,
  };
}
