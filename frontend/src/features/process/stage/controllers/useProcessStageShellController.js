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
  if (saveSnapshot.isSaved === true) return "Сохранено внутри версии";
  const status = toText(saveSnapshot.status);
  if (status === "saved") return "Сохранено внутри версии";
  if (status === "dirty") return "Сохранить сессию";
  if (status === "saving") return "Сохранение...";
  if (status === "failed") return "Ошибка сохранения";
  return toText(fallbackRaw) || "Сохранить сессию";
}

export function buildSaveUiState({
  saveSnapshotRaw = null,
  revisionSnapshotRaw = null,
  versionTruthRaw = null,
  fallbackLabel = "Сохранение",
  isManualSaveBusy = false,
  manualSaveIntent = "",
} = {}) {
  const saveSnapshot = asObject(saveSnapshotRaw);
  const revisionSnapshot = asObject(revisionSnapshotRaw);
  const versionTruth = asObject(versionTruthRaw);
  const draftState = asObject(revisionSnapshot.draftState);
  const saveSmartText = buildSaveSmartTextFromSnapshot(saveSnapshot, fallbackLabel);
  const saveDirty = saveSnapshot.isDirty === true;
  const latestRevisionNumber = Number(revisionSnapshot.latestRevisionNumber || 0);
  const hasLiveDraft = draftState.hasLiveDraft === true;
  const draftAheadOfLatest = draftState.isDraftAheadOfLatestRevision === true;
  const sessionChangedSinceLatest = versionTruth.hasSessionChangesSinceLatestBpmnVersion === true
    || versionTruth.has_session_changes_since_latest_bpmn_version === true;
  const publishActionRequired = sessionChangedSinceLatest || draftAheadOfLatest || (latestRevisionNumber <= 0 && hasLiveDraft);
  const createRevisionNoDiff = publishActionRequired !== true;
  const showSaveActionButton = true;
  const normalizedIntent = toText(manualSaveIntent).toLowerCase();
  const saveInProgress = isManualSaveBusy === true || saveSnapshot.isSaving === true;
  const saveActionText = saveInProgress && normalizedIntent !== "create_revision"
    ? "Сохранение..."
    : "Сохранить сессию";
  const createRevisionActionText = saveInProgress && normalizedIntent === "create_revision"
    ? "Сохранение..."
    : "Создать версию BPMN";
  return {
    saveSmartText,
    saveDirty,
    publishActionRequired,
    createRevisionNoDiff,
    showSaveActionButton,
    saveActionText,
    createRevisionActionText,
  };
}

export default function useProcessStageShellController({
  hasSession,
  isBpmnTab,
  isSwitchingTab,
  isFlushingTab,
  isManualSaveBusy,
  manualSaveIntent,
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
  bpmnVersionTruthState,
  sessionTemplateProvenanceSnapshot,
  sessionCompanionBridgeSnapshot,
  topPanelsView,
  attentionPanelsView,
  dialogsView,
}) {
  const shellProps = useMemo(() => {
    const saveSnapshot = asObject(sessionSaveReadSnapshot);
    const revisionSnapshot = asObject(asObject(sessionCompanionBridgeSnapshot).revisionHistory);
    const versionTruth = asObject(bpmnVersionTruthState);
    const saveUi = buildSaveUiState({
      saveSnapshotRaw: saveSnapshot,
      revisionSnapshotRaw: revisionSnapshot,
      versionTruthRaw: versionTruth,
      fallbackLabel: workbench.labels.save,
      isManualSaveBusy: isManualSaveBusy === true,
      manualSaveIntent,
    });
    const canSaveNow = (
      !!hasSession
      && !!isBpmnTab
      && !isSwitchingTab
      && !isFlushingTab
      && !isManualSaveBusy
      && saveSnapshot.isSaving !== true
    );
    const canCreateRevisionNow = (
      !!hasSession
      && !!isBpmnTab
      && !isSwitchingTab
      && !isFlushingTab
      && !isManualSaveBusy
      && saveSnapshot.isSaving !== true
      && saveUi.publishActionRequired === true
    );
    const showCreateRevisionNoDiffHint = (
      !!hasSession
      && !!isBpmnTab
      && !isSwitchingTab
      && !isFlushingTab
      && !isManualSaveBusy
      && saveSnapshot.isSaving !== true
      && saveUi.createRevisionNoDiff === true
    );
    const truthSourceMap = asObject(asObject(sessionCompanionBridgeSnapshot).sourceMap);
    return {
      canSaveNow,
      canCreateRevisionNow,
      saveSmartText: hasSession ? saveUi.saveSmartText : workbench.labels.save,
      saveDirtyHint: saveUi.saveDirty,
      publishActionRequired: saveUi.publishActionRequired,
      showSaveActionButton: saveUi.showSaveActionButton,
      saveActionText: hasSession ? saveUi.saveActionText : workbench.labels.save,
      createRevisionActionText: hasSession ? saveUi.createRevisionActionText : "Создать версию BPMN",
      createRevisionNoDiffHintVisible: showCreateRevisionNoDiffHint,
      createRevisionNoDiffHintText: showCreateRevisionNoDiffHint
        ? "Нет изменений сессии после последней версии BPMN"
        : "",
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
      bpmnVersionTruthState: versionTruth,
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
    manualSaveIntent,
    isSwitchingTab,
    saveDirtyHint,
    saveUploadStatus,
    bpmnVersionTruthState,
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
