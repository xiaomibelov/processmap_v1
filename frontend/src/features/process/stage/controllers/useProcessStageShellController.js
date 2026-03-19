import { useMemo } from "react";
import buildProcessVersioningInterpretation from "../versioning/processVersioningInterpretation.js";
import buildProcessSaveVisibilityState, { deriveSaveOutcomeHint } from "../visibility/processSaveVisibility.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useProcessStageShellController({
  hasSession,
  isBpmnTab,
  isSwitchingTab,
  isFlushingTab,
  isManualSaveBusy,
  workbench,
  genErr,
  infoMsg,
  selectedElementContext,
  selectedBpmnElementIds,
  selectedHybridTemplateCount = 0,
  templatesBusy,
  tab,
  availablePathTiers,
  sessionSaveReadSnapshot,
  sessionVersionReadSnapshot,
  sessionRevisionHistorySnapshot,
  saveVisibilityActionState,
  topPanelsView,
  attentionPanelsView,
  dialogsView,
}) {
  const shellProps = useMemo(() => {
    const saveSnapshot = asObject(sessionSaveReadSnapshot);
    const versionSnapshot = asObject(sessionVersionReadSnapshot);
    const revisionSnapshot = asObject(sessionRevisionHistorySnapshot);
    const outcomeHint = deriveSaveOutcomeHint(saveVisibilityActionState);
    const versioningInterpretation = buildProcessVersioningInterpretation({
      saveSnapshotRaw: saveSnapshot,
      versionSnapshotRaw: versionSnapshot,
      revisionSnapshotRaw: revisionSnapshot,
      fallbackSaveLabel: workbench.labels.save,
      lastOutcomeHint: outcomeHint,
    });
    const saveUi = asObject(versioningInterpretation.displayModelForHeader);
    const saveVisibility = buildProcessSaveVisibilityState({
      actionStateRaw: saveVisibilityActionState,
      saveSnapshotRaw: saveSnapshot,
      versioningInterpretationRaw: versioningInterpretation,
    });
    const visibilityInlineMessage = String(saveVisibility.inlineMessage || "").trim();
    const visibilityInlineTone = String(saveVisibility.inlineTone || "").trim();
    const defaultInlineMessage = String(genErr || infoMsg || "").trim();
    const canSaveNow = (
      !!hasSession
      && !!isBpmnTab
      && !isSwitchingTab
      && !isFlushingTab
      && !isManualSaveBusy
      && saveSnapshot.isSaving !== true
    );
    return {
      canSaveNow,
      saveSmartText: canSaveNow ? saveUi.saveSmartText : workbench.labels.save,
      saveDirtyHint: saveSnapshot.isDirty === true,
      publishActionRequired: saveUi.publishActionRequired === true,
      showSaveActionButton: saveUi.showSaveActionButton === true,
      saveActionText: canSaveNow ? saveUi.saveActionText : workbench.labels.save,
      toolbarInlineMessage: visibilityInlineMessage || defaultInlineMessage,
      toolbarInlineTone: visibilityInlineMessage ? visibilityInlineTone : (genErr ? "err" : ""),
      canUseElementContextActions: !!selectedElementContext,
      templateSelectionCount: Math.max(Number(selectedBpmnElementIds.length || 0), Number(selectedHybridTemplateCount || 0)),
      canCreateTemplateFromSelection: hasSession
        && tab === "diagram"
        && (selectedBpmnElementIds.length > 0 || Number(selectedHybridTemplateCount || 0) > 0),
      canOpenTemplatesList: hasSession && !templatesBusy,
      hasPathHighlightData: availablePathTiers.length > 0,
      sessionSaveReadSnapshot: saveSnapshot,
      sessionVersionReadSnapshot: versionSnapshot,
      sessionRevisionHistorySnapshot: revisionSnapshot,
      sessionVersioningInterpretation: versioningInterpretation,
      sessionSaveVisibility: saveVisibility,
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
    saveVisibilityActionState,
    sessionRevisionHistorySnapshot,
    sessionSaveReadSnapshot,
    sessionVersionReadSnapshot,
    selectedBpmnElementIds.length,
    selectedHybridTemplateCount,
    selectedElementContext,
    tab,
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
