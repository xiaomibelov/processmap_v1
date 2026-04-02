import { useEffect, useRef, useMemo } from "react";

import {
  runSettledPropertiesFanout,
  runSettledRobotMetaFanout,
  runSettledSelectionFanout,
  runSettledStepTimeFanout,
  runSettledUserNotesFanout,
} from "../fanout/postStagingFanout.js";

/**
 * Stable JSON-ish signature for notes data to avoid spurious re-runs.
 * Returns a string that changes only when actual notes content changes.
 */
function notesSignature(notesByElementId, notesByElement) {
  const src = notesByElement || notesByElementId;
  if (!src || typeof src !== "object") return "";
  const keys = Object.keys(src);
  if (keys.length === 0) return "";
  keys.sort();
  const parts = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const entry = src[k];
    const items = Array.isArray(entry?.items) ? entry.items : [];
    parts.push(k + ":" + items.length);
  }
  return parts.join("|");
}

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
  // ── Stabilize callback refs to avoid spurious useEffect re-fires ──
  const cbRef = useRef({});
  cbRef.current.clearUserNotesDecor = clearUserNotesDecor;
  cbRef.current.applyUserNotesDecor = applyUserNotesDecor;
  cbRef.current.applyStepTimeDecor = applyStepTimeDecor;
  cbRef.current.applyRobotMetaDecor = applyRobotMetaDecor;
  cbRef.current.applyPropertiesOverlayDecor = applyPropertiesOverlayDecor;
  cbRef.current.clearPropertiesOverlayDecor = clearPropertiesOverlayDecor;
  cbRef.current.isInterviewDecorModeOn = isInterviewDecorModeOn;
  cbRef.current.emitElementSelection = emitElementSelection;
  cbRef.current.syncAiQuestionPanelWithSelection = syncAiQuestionPanelWithSelection;
  cbRef.current.buildSettledSelectionFanoutSignature = buildSettledSelectionFanoutSignature;
  cbRef.current.syncCamundaExtensionsToModeler = syncCamundaExtensionsToModeler;

  // ── Lightweight ready-signal: changes only when instances flip null↔ready ──
  // Unlike the old settledDecorReadySignal this does NOT include token/defs
  // which caused spurious re-fires on every modeler status tick.
  const readySignal = [
    viewerRef.current ? 1 : 0,
    modelerRef.current || modelerRuntimeRef.current?.getInstance?.() ? 1 : 0,
  ].join(":");

  // ── Stable notes signature — changes only when notes data actually changes ──
  const notesSig = useMemo(
    () => notesSignature(draft?.notesByElementId, draft?.notes_by_element),
    [draft?.notesByElementId, draft?.notes_by_element],
  );

  // ── Camunda sync (unchanged logic, stabilized ref) ──
  useEffect(() => {
    const inst = modelerRef.current || modelerRuntimeRef.current?.getInstance?.() || null;
    if (!inst || !modelerReadyRef.current) return;
    cbRef.current.syncCamundaExtensionsToModeler(inst);
  }, [draft?.bpmn_meta, modelerReadyRef, modelerRef, modelerRuntimeRef]);

  // ── Notes fanout — only active view, signature-gated ──
  useEffect(() => {
    const viewerInst = viewerRef.current;
    const modelerInst = modelerRef.current || modelerRuntimeRef.current?.getInstance?.() || null;
    runSettledUserNotesFanout({
      viewerInst: view !== "editor" ? viewerInst : null,
      modelerInst: (view === "editor" || view === "diagram") ? modelerInst : null,
      view,
      isInterviewDecorModeOn: cbRef.current.isInterviewDecorModeOn,
      clearUserNotesDecor: cbRef.current.clearUserNotesDecor,
      applyUserNotesDecor: cbRef.current.applyUserNotesDecor,
    });
  }, [
    notesSig,
    readySignal,
    diagramDisplayMode,
    view,
  ]);

  // ── StepTime fanout ──
  useEffect(() => {
    runSettledStepTimeFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      applyStepTimeDecor: cbRef.current.applyStepTimeDecor,
    });
  }, [
    draft?.nodes,
    stepTimeUnit,
    readySignal,
    view,
  ]);

  // ── RobotMeta fanout ──
  useEffect(() => {
    runSettledRobotMetaFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      applyRobotMetaDecor: cbRef.current.applyRobotMetaDecor,
    });
  }, [
    draft?.bpmn_meta,
    robotMetaOverlayEnabled,
    robotMetaOverlayFilters,
    robotMetaStatusByElementId,
    readySignal,
    view,
  ]);

  // ── Properties fanout ──
  useEffect(() => {
    runSettledPropertiesFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      applyPropertiesOverlayDecor: cbRef.current.applyPropertiesOverlayDecor,
      clearPropertiesOverlayDecor: cbRef.current.clearPropertiesOverlayDecor,
    });
  }, [
    propertiesOverlayAlwaysEnabled,
    propertiesOverlayAlwaysPreviewByElementId,
    selectedPropertiesOverlayPreview,
    readySignal,
    view,
  ]);

  // ── Selection fanout ──
  useEffect(() => {
    runSettledSelectionFanout({
      viewerInst: viewerRef.current,
      modelerInst: modelerRef.current,
      view,
      selectedMarkerStateRef,
      selectionFanoutStateRef: settledSelectionFanoutRef,
      buildSelectionFanoutSignature: cbRef.current.buildSettledSelectionFanoutSignature,
      emitElementSelection: cbRef.current.emitElementSelection,
      syncAiQuestionPanelWithSelection: cbRef.current.syncAiQuestionPanelWithSelection,
    });
  }, [
    notesSig,
    readySignal,
    diagramDisplayMode,
    selectedMarkerStateRef,
    settledSelectionFanoutRef,
    view,
  ]);
}
