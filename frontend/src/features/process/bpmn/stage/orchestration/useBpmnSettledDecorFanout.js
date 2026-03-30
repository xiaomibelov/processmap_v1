import { useEffect } from "react";

import {
  runSettledPropertiesFanout,
  runSettledRobotMetaFanout,
  runSettledSelectionFanout,
  runSettledStepTimeFanout,
  runSettledUserNotesFanout,
} from "../fanout/postStagingFanout.js";

export default function useBpmnSettledDecorFanout({
  viewerRef,
  modelerRef,
  modelerRuntimeRef,
  modelerReadyRef,
  view,
  draft,
  diagramDisplayMode,
  stepTimeUnit,
  robotMetaOverlayEnabled,
  robotMetaOverlayFilters,
  robotMetaStatusByElementId,
  selectedPropertiesOverlayPreview,
  propertiesOverlayAlwaysEnabled,
  propertiesOverlayAlwaysPreviewByElementId,
  isInterviewDecorModeOn,
  clearUserNotesDecor,
  applyUserNotesDecor,
  applyStepTimeDecor,
  applyRobotMetaDecor,
  applyPropertiesOverlayDecor,
  clearPropertiesOverlayDecor,
  selectedMarkerStateRef,
  settledSelectionFanoutRef,
  buildSettledSelectionFanoutSignature,
  emitElementSelection,
  syncAiQuestionPanelWithSelection,
  syncCamundaExtensionsToModeler,
}) {
  const settledDecorRuntimeStatus = modelerRuntimeRef.current?.getStatus?.() || {};
  const settledDecorReadySignal = [
    Number(settledDecorRuntimeStatus?.token || 0),
    settledDecorRuntimeStatus?.ready ? 1 : 0,
    settledDecorRuntimeStatus?.defs ? 1 : 0,
    viewerRef.current ? 1 : 0,
    modelerRef.current ? 1 : 0,
  ].join(":");

  useEffect(() => {
    const inst = modelerRef.current || modelerRuntimeRef.current?.getInstance?.() || null;
    if (!inst || !modelerReadyRef.current) return;
    syncCamundaExtensionsToModeler(inst);
  }, [draft?.bpmn_meta, modelerReadyRef, modelerRef, modelerRuntimeRef, syncCamundaExtensionsToModeler]);

  useEffect(() => {
    runSettledUserNotesFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current || modelerRuntimeRef.current?.getInstance?.() || null,
      view,
      isInterviewDecorModeOn,
      clearUserNotesDecor,
      applyUserNotesDecor,
    });
  }, [
    applyUserNotesDecor,
    clearUserNotesDecor,
    diagramDisplayMode,
    draft?.notesByElementId,
    draft?.notes_by_element,
    isInterviewDecorModeOn,
    settledDecorReadySignal,
    view,
  ]);

  useEffect(() => {
    runSettledStepTimeFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      applyStepTimeDecor,
    });
  }, [
    applyStepTimeDecor,
    draft?.nodes,
    stepTimeUnit,
    view,
  ]);

  useEffect(() => {
    runSettledRobotMetaFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      applyRobotMetaDecor,
    });
  }, [
    applyRobotMetaDecor,
    draft?.bpmn_meta,
    robotMetaOverlayEnabled,
    robotMetaOverlayFilters,
    robotMetaStatusByElementId,
    view,
  ]);

  useEffect(() => {
    runSettledPropertiesFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      applyPropertiesOverlayDecor,
      clearPropertiesOverlayDecor,
    });
  }, [
    applyPropertiesOverlayDecor,
    clearPropertiesOverlayDecor,
    propertiesOverlayAlwaysEnabled,
    propertiesOverlayAlwaysPreviewByElementId,
    selectedPropertiesOverlayPreview,
    view,
  ]);

  useEffect(() => {
    runSettledSelectionFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      selectedMarkerStateRef,
      selectionFanoutStateRef: settledSelectionFanoutRef,
      buildSelectionFanoutSignature: buildSettledSelectionFanoutSignature,
      emitElementSelection,
      syncAiQuestionPanelWithSelection,
    });
  }, [
    buildSettledSelectionFanoutSignature,
    diagramDisplayMode,
    draft?.notesByElementId,
    draft?.notes_by_element,
    emitElementSelection,
    selectedMarkerStateRef,
    settledSelectionFanoutRef,
    syncAiQuestionPanelWithSelection,
    view,
  ]);
}
