import { useMemo } from "react";
import useDiagramElementMetaModel from "./useDiagramElementMetaModel";
import useDiagramDodQualityModel from "./useDiagramDodQualityModel";
import buildInterviewDecorSignature from "./buildInterviewDecorSignature";
import {
  buildDiagramSourceKey,
  buildBpmnMetaVersionKey,
  buildInterviewVersionKey,
  buildNodesVersionKey,
  buildNotesVersionKey,
  buildHybridLayerVersionKey,
} from "./diagramDerivedModelHash";

export default function useDiagramDerivedModel({
  hasSession,
  draft,
  lintResult,
  autoPassPrecheck,
  autoPassJobState,
  coverageMatrix,
  workspaceActiveOrgId,
  activeProjectWorkspaceId,
  activeProjectId,
  sid,
  coverageById,
  coverageRowsAll,
  coverageNodes,
  qualityHintsRaw,
  qualityOverlayFilters,
  qualityOverlayListKey,
  qualityOverlaySearch,
  isQualityMode,
  isCoverageMode,
  qualityHints,
  coverageHints,
  customAttentionHints,
  pathHighlightEnabled,
  pathHighlightTier,
  pathHighlightSequenceKey,
  reportPathStopHints,
  reportPathFlowConflictHints,
  hybridLayerByElementId,
  isInterviewMode,
  diagramMode,
}) {
  const elementMetaModel = useDiagramElementMetaModel({
    bpmnMeta: draft?.bpmn_meta,
    nodes: draft?.nodes,
    hybridLayerByElementId,
  });

  const dodQualityModel = useDiagramDodQualityModel({
    hasSession,
    draft,
    lintResult,
    autoPassPrecheck,
    autoPassJobState,
    coverageMatrix,
    workspaceActiveOrgId,
    activeProjectWorkspaceId,
    activeProjectId,
    sid,
    coverageById,
    coverageRowsAll,
    coverageNodes,
    qualityHintsRaw,
    qualityOverlayFilters,
    qualityOverlayListKey,
    qualityOverlaySearch,
    isQualityMode,
    isCoverageMode,
    qualityHints,
    coverageHints,
    customAttentionHints,
    pathHighlightEnabled,
    pathHighlightTier,
    pathHighlightSequenceKey,
    nodePathMetaMap: elementMetaModel.nodePathMetaMap,
    flowTierMetaMap: elementMetaModel.flowTierMetaMap,
    reportPathStopHints,
    reportPathFlowConflictHints,
  });

  const sourceKey = useMemo(() => {
    const bpmnMeta = draft?.bpmn_meta;
    const interview = draft?.interview;
    const notesMap = draft?.notes_by_element || draft?.notesByElementId;
    return buildDiagramSourceKey({
      sessionId: sid,
      bpmnXmlVersion: draft?.bpmn_xml_version || draft?.version || 0,
      diagramStateVersion: draft?.diagram_state_version || draft?.diagramStateVersion || 0,
      bpmnMetaVersion: buildBpmnMetaVersionKey(bpmnMeta),
      nodesVersion: buildNodesVersionKey(draft?.nodes),
      interviewVersion: buildInterviewVersionKey(interview),
      notesVersion: buildNotesVersionKey(notesMap),
      hybridLayerVersion: buildHybridLayerVersionKey(hybridLayerByElementId),
      overlaySettingsFlags: [
        isQualityMode ? 1 : 0,
        isCoverageMode ? 1 : 0,
        pathHighlightEnabled ? 1 : 0,
        pathHighlightTier,
        pathHighlightSequenceKey,
      ].join(":"),
    });
  }, [
    sid,
    draft?.bpmn_xml_version,
    draft?.version,
    draft?.diagram_state_version,
    draft?.diagramStateVersion,
    draft?.bpmn_meta,
    draft?.nodes,
    draft?.interview,
    draft?.notes_by_element,
    draft?.notesByElementId,
    hybridLayerByElementId,
    isQualityMode,
    isCoverageMode,
    pathHighlightEnabled,
    pathHighlightTier,
    pathHighlightSequenceKey,
  ]);

  // Stable interview decor signature — computed from draft data but only when underlying data changes
  const interviewDecorSignature = useMemo(
    () => buildInterviewDecorSignature(draft, isInterviewMode, diagramMode),
    [
      sourceKey,
      isInterviewMode,
      diagramMode,
    ],
  );

  return {
    elementMetaModel,
    dodQualityModel,
    sourceKey,
    interviewDecorSignature,
  };
}
