import { useMemo } from "react";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function buildSaveSmartTextFromSnapshot(saveSnapshotRaw, fallbackRaw = "") {
  const saveSnapshot = asObject(saveSnapshotRaw);
  if (saveSnapshot.isSaving === true) return "Сохранение...";
  if (saveSnapshot.isDirty === true) return "Сохранить сессию";
  if (saveSnapshot.isFailed === true) return "Ошибка сохранения";
  if (saveSnapshot.isStale === true) return "Требуется синхронизация";
  if (saveSnapshot.isSaved === true) return "Черновик сохранён";
  const status = toText(saveSnapshot.status);
  if (status === "saved") return "Черновик сохранён";
  if (status === "dirty") return "Сохранить сессию";
  if (status === "saving") return "Сохранение...";
  if (status === "failed") return "Ошибка сохранения";
  return toText(fallbackRaw) || "Сохранить сессию";
}

export function buildSaveUiState({
  saveSnapshotRaw = null,
  revisionSnapshotRaw = null,
  fallbackLabel = "Сохранение",
} = {}) {
  const saveSnapshot = asObject(saveSnapshotRaw);
  const revisionSnapshot = asObject(revisionSnapshotRaw);
  const draftState = asObject(revisionSnapshot.draftState);
  const saveSmartText = buildSaveSmartTextFromSnapshot(saveSnapshot, fallbackLabel);
  const saveDirty = saveSnapshot.isDirty === true;
  const latestRevisionNumber = Number(revisionSnapshot.latestRevisionNumber || 0);
  const hasLiveDraft = draftState.hasLiveDraft === true;
  const draftAheadOfLatest = draftState.isDraftAheadOfLatestRevision === true;
  const publishActionRequired = draftAheadOfLatest || (latestRevisionNumber <= 0 && hasLiveDraft);
  const showSaveActionButton = saveDirty;
  const saveActionText = showSaveActionButton ? "Сохранить сессию" : saveSmartText;
  return {
    saveSmartText,
    saveDirty,
    publishActionRequired,
    showSaveActionButton,
    saveActionText,
  };
}

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
  selectedHybridTemplateCount = 0,
  templatesBusy,
  tab,
  availablePathTiers,
  sessionSaveReadSnapshot,
  saveUploadStatus,
  sessionVersionReadSnapshot,
  sessionTemplateProvenanceSnapshot,
  sessionCompanionBridgeSnapshot,
  topPanelsView,
  attentionPanelsView,
  dialogsView,
}) {
  const shellProps = useMemo(() => {
    const saveSnapshot = asObject(sessionSaveReadSnapshot);
    const revisionSnapshot = asObject(asObject(sessionCompanionBridgeSnapshot).revisionHistory);
    const saveUi = buildSaveUiState({
      saveSnapshotRaw: saveSnapshot,
      revisionSnapshotRaw: revisionSnapshot,
      fallbackLabel: workbench.labels.save,
    });
    const canSaveNow = (
      !!hasSession
      && !!isBpmnTab
      && !isSwitchingTab
      && !isFlushingTab
      && !isManualSaveBusy
      && saveSnapshot.isSaving !== true
    );
    const truthSourceMap = asObject(asObject(sessionCompanionBridgeSnapshot).sourceMap);
    return {
      canSaveNow,
      saveSmartText: hasSession ? saveUi.saveSmartText : workbench.labels.save,
      saveDirtyHint: saveUi.saveDirty,
      publishActionRequired: saveUi.publishActionRequired,
      showSaveActionButton: saveUi.showSaveActionButton,
      saveActionText: canSaveNow ? saveUi.saveActionText : workbench.labels.save,
      toolbarInlineMessage: String(genErr || infoMsg || "").trim(),
      toolbarInlineTone: genErr ? "err" : "",
      canUseElementContextActions: !!selectedElementContext,
      templateSelectionCount: Math.max(Number(selectedBpmnElementIds.length || 0), Number(selectedHybridTemplateCount || 0)),
      canCreateTemplateFromSelection: hasSession
        && tab === "diagram"
        && (selectedBpmnElementIds.length > 0 || Number(selectedHybridTemplateCount || 0) > 0),
      canOpenTemplatesList: hasSession && !templatesBusy,
      hasPathHighlightData: availablePathTiers.length > 0,
      saveUploadStatus: asObject(saveUploadStatus),
      sessionSaveReadSnapshot: saveSnapshot,
      sessionVersionReadSnapshot: asObject(sessionVersionReadSnapshot),
      sessionTemplateProvenanceSnapshot: asObject(sessionTemplateProvenanceSnapshot),
      sessionRevisionHistorySnapshot: revisionSnapshot,
      sessionCompanionBridgeSnapshot: asObject(sessionCompanionBridgeSnapshot),
      sessionTruthSourceMap: truthSourceMap,
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
    saveUploadStatus,
    sessionCompanionBridgeSnapshot,
    sessionSaveReadSnapshot,
    sessionTemplateProvenanceSnapshot,
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
