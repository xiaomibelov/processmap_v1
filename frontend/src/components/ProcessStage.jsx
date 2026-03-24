import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import DocStage from "./process/DocStage";
import DodStage from "./process/DodStage";
import InterviewStage from "./process/InterviewStage";
import WorkspaceExplorer from "../features/explorer/WorkspaceExplorer";
import { useAuth } from "../features/auth/AuthProvider";
import {
  apiPatchSession,
  apiRecompute,
  apiStartAutoPass,
  apiGetAutoPassPrecheck,
  apiGetAutoPassStatus,
} from "../lib/api/sessionApi";
import { apiGetBpmnMeta, apiGetBpmnXml } from "../lib/api/bpmnApi";
import { apiAiQuestions } from "../lib/api/interviewApi";
import { createAiInputHash, executeAi } from "../features/ai/aiExecutor";
import {
  shortSnapshotHash,
} from "../features/process/bpmn/snapshots/bpmnSnapshots";
import { parseAndProjectBpmnToInterview } from "../features/process/hooks/useInterviewProjection";
import useBpmnSync from "../features/process/hooks/useBpmnSync";
import useProcessOrchestrator from "../features/process/hooks/useProcessOrchestrator";
import useProcessWorkbenchController from "../features/process/hooks/useProcessWorkbenchController";
import { deriveActorsFromBpmn, sameDerivedActors } from "../features/process/lib/deriveActorsFromBpmn";
import {
  asArray,
  asObject,
  interviewHasContent,
  isLikelySeedBpmnXml,
  mergeInterviewData,
  enrichInterviewWithNodeBindings,
  sanitizeGraphNodes,
  toNodeId,
  mergeNodesById,
  mergeEdgesByKey,
  readFileText,
  parseBpmnToSessionGraph,
  buildClarificationHints,
} from "../features/process/lib/processStageDomain";
import { parseCommandToOps } from "../features/process/bpmn/ops/parseOps";
import useQualityDerivation from "../features/process/quality/useQualityDerivation";
import useCoverageDerivation from "../features/process/coverage/useCoverageDerivation";
import { useAttentionMarkerDerivation, useAttentionItemsDerivation } from "../features/process/attention/useAttentionDerivation";
import { computeDodSnapshotFromDraft } from "../features/process/dod/computeDodSnapshot";
import { buildDodReadinessV1 } from "../features/process/dod/buildDodReadinessV1";
import {
  buildRobotMetaStatusByElementId,
  getRobotMetaStatus,
  normalizeRobotMetaMap,
} from "../features/process/robotmeta/robotMeta";
import {
  appendExecutionPlanVersionEntry,
  buildExecutionPlan,
  normalizeExecutionPlanVersionList,
} from "../features/process/robotmeta/executionPlan";
import {
  applyHybridModeTransition,
  applyHybridVisibilityTransition,
  normalizeHybridLayerMap,
  normalizeHybridUiPrefs,
  saveHybridUiPrefs,
} from "../features/process/hybrid/hybridLayerUi";
import {
  docToComparableJson,
  normalizeHybridV2Doc,
} from "../features/process/hybrid/hybridLayerV2";
import {
  matrixToDiagram,
  matrixToScreen,
} from "../features/process/stage/utils/hybridCoords";
import HybridOverlayRenderer from "../features/process/hybrid/renderers/HybridOverlayRenderer";
import useSessionMetaPersist from "../features/process/stage/controllers/useSessionMetaPersist";
import { attachProcessStageFlushBeforeLeaveListener } from "../features/process/navigation/processLeaveFlush";
import { flushProcessStageBeforeLeave } from "../features/process/navigation/processLeaveFlushController";
import {
  buildSaveUploadStatusBadge,
  normalizeBpmnSaveLifecycleEvent,
} from "../features/process/navigation/saveUploadStatus";
import useProcessStageShellController from "../features/process/stage/controllers/useProcessStageShellController";
import useBpmnCanvasController from "../features/process/stage/controllers/useBpmnCanvasController";
import useDiagramOverlayTransform from "../features/process/stage/controllers/useDiagramOverlayTransform";
import useHybridLayerAnchorController from "../features/process/stage/hooks/useBpmnCanvasController";
import useHybridLayerViewportController from "../features/process/stage/hooks/useHybridLayerViewportController";
import usePlaybackController from "../features/process/stage/controllers/usePlaybackController";
import useDiagramShellState from "../features/process/stage/orchestration/useDiagramShellState";
import useDiagramActionsController from "../features/process/stage/orchestration/useDiagramActionsController";
import useDiagramRuntimeBridges from "../features/process/stage/orchestration/useDiagramRuntimeBridges";
import useProcessStageLocalState from "../features/process/stage/orchestration/state/useProcessStageLocalState";
import {
  buildTopPanelsView,
  buildAttentionPanelsView,
  buildDialogsView,
  buildDiagramHeaderView,
  buildDiagramControlsView,
} from "../features/process/stage/orchestration/buildDiagramViewModel";
import ProcessStageShell from "../features/process/stage/ui/ProcessStageShell";
import ProcessPanels from "../features/process/stage/ui/ProcessPanels";
import ProcessDialogs from "../features/process/stage/ui/ProcessDialogs";
import ProcessStageHeader from "../features/process/stage/ui/ProcessStageHeader";
import ProcessStageDiagramControls from "../features/process/stage/ui/ProcessStageDiagramControls";
import useHybridStore from "../features/process/hybrid/controllers/useHybridStore";
import useHybridPersistController from "../features/process/hybrid/controllers/useHybridPersistController";
import useHybridPipelineController from "../features/process/hybrid/controllers/useHybridPipelineController";
import HybridContextMenu from "../features/process/hybrid/tools/HybridContextMenu";
import HybridPersistToast from "../features/process/hybrid/ui/HybridPersistToast";
import DrawioEditorModal from "../features/process/drawio/DrawioEditorModal";
import DrawioOverlayRenderer from "../features/process/drawio/DrawioOverlayRenderer";
import {
  isDrawioXml,
  mergeDrawioMeta,
  normalizeDrawioMeta,
  serializeDrawioMeta,
} from "../features/process/drawio/drawioMeta";
import {
  buildDrawioAnchorImportDiagnostics,
  collectBpmnNodeIdsFromDraft,
} from "../features/process/drawio/drawioAnchors";
import {
  buildSessionCompanionAfterSave,
  buildSessionCompanionAfterTemplateApply,
  buildSessionCompanionAfterTraversal,
  normalizeSessionCompanion,
} from "../features/process/session-companion/sessionCompanionContracts.js";
import { buildSessionCompanionJazzUiBridgeSnapshot } from "../features/process/session-companion/read/index.js";
import { createSessionCompanionJazzAdapter } from "../features/process/session-companion/sessionCompanionJazzAdapter.js";
import { createLiveDocumentJazzAdapter } from "../features/process/session-companion/liveDocumentJazzAdapter.js";
import { appendRevisionToLedger } from "../features/process/session-companion/revisionLedgerModule.js";
import { buildRevisionDiffView } from "../features/process/session-companion/revisionCompareModule.js";
import { buildRevisionRestoreTransition } from "../features/process/session-companion/revisionRestoreModule.js";
import {
  buildSessionCompanionJazzScopeId,
  resolveSessionCompanionLocalFirstActivation,
} from "../features/process/session-companion/sessionCompanionLocalFirstPilot.js";
import useTemplatesStore from "../features/templates/model/useTemplatesStore";
import useTemplatesStageBridge from "../features/templates/services/useTemplatesStageBridge";
import BpmnFragmentPlacementGhost from "../features/templates/ui/BpmnFragmentPlacementGhost";
import {
  normalizeAttentionMarkers,
  createAttentionMarker,
  isAttentionMarkerUnread,
  markAttentionMarkersSeen,
  countAttentionMarkers,
  countUnreadAttentionMarkers,
} from "../features/process/attention/attentionMarkers";
import {
  AI_QUESTIONS_TIMEOUT_MS,
  COMMAND_HISTORY_LIMIT,
  DIAGRAM_PATHS_INTENT_VERSION,
  NOTES_BATCH_APPLY_EVENT,
  NOTES_COVERAGE_OPEN_EVENT,
  buildRouteStepsFromInterviewPathSpec,
  copyText,
  coverageMarkerClass,
  cssEscapeAttr,
  dedupeDiagramHints,
  downloadJsonFile,
  downloadTextFile,
  emitBatchOpsResult,
  fnv1aHex,
  getAiGenerateGate,
  insertBetweenErrorMessage,
  isEditableTarget,
  isLocalSessionId,
  logActorsTrace,
  logAiOpsTrace,
  logPlaybackDebug,
  normalizeDebugRouteSteps,
  normalizeDiagramMode,
  normalizeFlowTierMetaMap,
  normalizeNodePathMetaMap,
  normalizePathSequenceKey,
  normalizePathTier,
  parseSequenceFlowsFromXml,
  qualityImpactLabel,
  qualityIssueCopy,
  qualityLevelLabel,
  readCommandHistory,
  readCommandMode,
  readDiagramMode,
  readInsertBetweenCandidate,
  readQualityProfile,
  serializeHybridLayerMap,
  shortErr,
  shortHash,
  snapshotScopeKey,
  toArray,
  toText,
  withInjectedAiQuestionsPayload,
  writeAiQuestionsMode,
  writeCommandHistory,
  writeCommandMode,
  writeDiagramMode,
  writeQualityMode,
  writeQualityProfile,
} from "../features/process/stage/utils/processStageHelpers";
import { pushDeleteTrace } from "../features/process/stage/utils/deleteTrace";

const IDLE_SAVE_UPLOAD_EVENT = Object.freeze({
  event: "",
  stage: "idle",
  at: 0,
  reason: "",
  sessionId: "",
  rev: 0,
  status: 0,
  xmlBytes: 0,
  error: "",
});

export default function ProcessStage({
  sessionId,
  activeProjectId,
  activeProjectWorkspaceId = "",
  workspaceActiveOrgId = "",
  canInviteWorkspaceUsers = false,
  canManageSharedTemplates = false,
  locked,
  draft,
  onSessionSync,
  onPublishRealtimeBpmnOps = null,
  onOpenWorkspaceSession,
  onClearWorkspaceProject,
  onCreateWorkspaceProject,
  onCreateWorkspaceSession,
  onOpenWorkspaceOrgSettings,
  onUiStateChange,
  processTabIntent,
  aiGenerateIntent,
  stepTimeUnit = "min",
  reloadKey,
  selectedBpmnElement,
  onBpmnElementSelect,
  onOpenElementNotes,
  onElementNotesRemap,
  onRecalculateRtiers,
  snapshotRestoreNotice,
  onSnapshotRestoreNoticeConsumed,
  selectedPropertiesOverlayPreview = null,
  propertiesOverlayAlwaysEnabled = false,
  propertiesOverlayAlwaysPreviewByElementId = null,
  drawioCompanionFocusIntent = null,
  sessionRemoteSyncState = null,
  onApplySessionRemoteSync = null,
}) {
  const sid = String(sessionId || "");
  const { user } = useAuth();
  const bpmnRef = useRef(null);
  const importInputRef = useRef(null);
  const processBodyRef = useRef(null);
  const toolbarMenuRef = useRef(null);
  const toolbarMenuButtonRef = useRef(null);
  const diagramActionBarRef = useRef(null);
  const diagramPathPopoverRef = useRef(null);
  const diagramHybridToolsPopoverRef = useRef(null);
  const diagramPlanPopoverRef = useRef(null);
  const diagramPlaybackPopoverRef = useRef(null);
  const diagramLayersPopoverRef = useRef(null);
  const diagramRobotMetaPopoverRef = useRef(null);
  const diagramRobotMetaListRef = useRef(null);
  const diagramQualityPopoverRef = useRef(null);
  const diagramOverflowPopoverRef = useRef(null);
  const bpmnStageHostRef = useRef(null);
  const hybridLayerOverlayRef = useRef(null);
  const hybridV2FileInputRef = useRef(null);
  const drawioFileInputRef = useRef(null);
  const lastDraftXmlHashRef = useRef("");
  const lastSuccessfulPublishRef = useRef({ sessionId: "", atMs: 0, xmlHash: "" });
  const lastAiGenerateIntentKeyRef = useRef("");
  const lastDrawioCompanionFocusKeyRef = useRef("");
  const saveUploadLifecycleClearTimerRef = useRef(0);
  const attentionPanelWasOpenRef = useRef(false);
  const autoPassToastJobIdRef = useRef("");
  const autoPassDocSyncInFlightRef = useRef(false);
  const autoPassDocSyncLastAttemptMsRef = useRef(0);
  const localStateResetSidRef = useRef("");
  const sessionTruthProbeSeqRef = useRef(0);
  const sessionTruthProbeLastRef = useRef({
    scopeKey: "",
    sourceSignature: "",
    saveSignature: "",
    versionSignature: "",
    templateSignature: "",
    revisionSignature: "",
  });
  const [drawioAnchorImportDiagnostics, setDrawioAnchorImportDiagnostics] = useState(null);
  const [saveUploadLifecycleEvent, setSaveUploadLifecycleEvent] = useState(IDLE_SAVE_UPLOAD_EVENT);

  const {
    genBusy,
    setGenBusy,
    genErr,
    setGenErr,
    infoMsg,
    setInfoMsg,
    aiBottleneckOn,
    setAiBottleneckOn,
    aiStepBusy,
    setAiStepBusy,
    isManualSaveBusy,
    setIsManualSaveBusy,
    apiClarifyHints,
    setApiClarifyHints,
    apiClarifyList,
    setApiClarifyList,
    llmClarifyList,
    setLlmClarifyList,
    apiClarifyMeta,
    setApiClarifyMeta,
    versionsOpen,
    setVersionsOpen,
    versionsBusy,
    setVersionsBusy,
    versionsList,
    setVersionsList,
    previewSnapshotId,
    setPreviewSnapshotId,
    diffOpen,
    setDiffOpen,
    diffBaseSnapshotId,
    setDiffBaseSnapshotId,
    diffTargetSnapshotId,
    setDiffTargetSnapshotId,
    commandModeEnabled,
    setCommandModeEnabled,
    diagramMode,
    setDiagramMode,
    qualityProfileId,
    setQualityProfileId,
    commandInput,
    setCommandInput,
    commandBusy,
    setCommandBusy,
    commandStatus,
    setCommandStatus,
    commandHistory,
    setCommandHistory,
    qualityIssueFocusKey,
    setQualityIssueFocusKey,
    qualityAutoFixOpen,
    setQualityAutoFixOpen,
    qualityAutoFixBusy,
    setQualityAutoFixBusy,
    aiQuestionsBusy,
    setAiQuestionsBusy,
    aiQuestionsStatus,
    setAiQuestionsStatus,
    insertBetweenOpen,
    setInsertBetweenOpen,
    insertBetweenBusy,
    setInsertBetweenBusy,
    insertBetweenName,
    setInsertBetweenName,
    insertBetweenDraft,
    setInsertBetweenDraft,
    toolbarMenuOpen,
    setToolbarMenuOpen,
    saveDirtyHint,
    setSaveDirtyHint,
    attentionOpen,
    setAttentionOpen,
    attentionFilters,
    setAttentionFilters,
    attentionMarkerMessage,
    setAttentionMarkerMessage,
    attentionMarkerSaving,
    setAttentionMarkerSaving,
    attentionSessionLastOpenedAt,
    setAttentionSessionLastOpenedAt,
    autoPassJobState,
    setAutoPassJobState,
    autoPassPrecheck,
    setAutoPassPrecheck,
    autoPassPrecheckReqSeqRef,
    diagramActionPathOpen,
    setDiagramActionPathOpen,
    diagramActionHybridToolsOpen,
    setDiagramActionHybridToolsOpen,
    diagramActionPlanOpen,
    setDiagramActionPlanOpen,
    diagramActionPlaybackOpen,
    setDiagramActionPlaybackOpen,
    diagramActionLayersOpen,
    setDiagramActionLayersOpen,
    diagramActionRobotMetaOpen,
    setDiagramActionRobotMetaOpen,
    diagramActionQualityOpen,
    setDiagramActionQualityOpen,
    diagramActionOverflowOpen,
    setDiagramActionOverflowOpen,
    drawioSelectedElementId,
    setDrawioSelectedElementId,
    pathHighlightEnabled,
    setPathHighlightEnabled,
    pathHighlightTier,
    setPathHighlightTier,
    pathHighlightSequenceKey,
    setPathHighlightSequenceKey,
    robotMetaOverlayEnabled,
    setRobotMetaOverlayEnabled,
    robotMetaOverlayFilters,
    setRobotMetaOverlayFilters,
    robotMetaListOpen,
    setRobotMetaListOpen,
    robotMetaListTab,
    setRobotMetaListTab,
    robotMetaListSearch,
    setRobotMetaListSearch,
    qualityOverlayFilters,
    setQualityOverlayFilters,
    qualityOverlayListKey,
    setQualityOverlayListKey,
    qualityOverlaySearch,
    setQualityOverlaySearch,
    diagramPathsIntent,
    setDiagramPathsIntent,
    executionPlanPreview,
    setExecutionPlanPreview,
    executionPlanBusy,
    setExecutionPlanBusy,
    executionPlanSaveBusy,
    setExecutionPlanSaveBusy,
    executionPlanError,
    setExecutionPlanError,
    resetLocalStateForSession,
  } = useProcessStageLocalState({
    sid,
    readCommandHistory,
    readCommandMode,
    readDiagramMode,
    readQualityProfile,
  });
  const {
    hybridLayerDragRef,
    hybridLayerMapRef,
    hybridLayerPersistedMapRef,
    hybridAutoFocusGuardRef,
    hybridV2DocRef,
    hybridV2PersistedDocRef,
    drawioMetaRef,
    drawioPersistedMetaRef,
    hybridV2MigrationGuardRef,
    hybridUiPrefs,
    setHybridUiPrefs,
    hybridPeekActive,
    setHybridPeekActive,
    hybridLayerByElementId,
    setHybridLayerByElementId,
    hybridLayerActiveElementId,
    setHybridLayerActiveElementId,
    hybridV2Doc,
    setHybridV2Doc,
    hybridV2BindPickMode,
    setHybridV2BindPickMode,
    drawioMeta,
    setDrawioMeta,
    drawioJazzAdapter,
    drawioLocalFirstAdapterMode,
    drawioVisibilityContract,
    drawioEditorOpen,
    setDrawioEditorOpen,
    hybridLayerMapFromDraft,
    hybridStorageKey,
    hybridVisible,
    drawioVisible,
    overlayLayerVisible,
    hybridModeEffective,
    hybridOpacityValue,
  } = useHybridStore({
    sid,
    projectId: draft?.project_id || draft?.projectId || activeProjectId,
    draftBpmnMeta: draft?.bpmn_meta,
    userId: user?.id,
  });
  const [sessionCompanionJazzMeta, setSessionCompanionJazzMeta] = useState(() => normalizeSessionCompanion({}));
  const sessionCompanionActivation = useMemo(
    () => resolveSessionCompanionLocalFirstActivation(),
    [sid],
  );
  const sessionCompanionLocalFirstAdapterMode = useMemo(
    () => (sessionCompanionActivation?.unsupportedState === true ? "legacy" : toText(sessionCompanionActivation?.adapterModeEffective) || "legacy"),
    [sessionCompanionActivation?.adapterModeEffective, sessionCompanionActivation?.unsupportedState],
  );
  const sessionCompanionJazzPeer = useMemo(() => (
    sessionCompanionLocalFirstAdapterMode === "jazz" ? toText(sessionCompanionActivation?.jazzPeer) : ""
  ), [sessionCompanionActivation?.jazzPeer, sessionCompanionLocalFirstAdapterMode]);
  const sessionCompanionJazzScopeId = useMemo(
    () => buildSessionCompanionJazzScopeId(draft?.project_id || draft?.projectId || activeProjectId, sid),
    [activeProjectId, draft?.projectId, draft?.project_id, sid],
  );
  const sessionCompanionJazzAdapter = useMemo(() => {
    if (sessionCompanionLocalFirstAdapterMode !== "jazz" || !sessionCompanionJazzScopeId) return null;
    return createSessionCompanionJazzAdapter({
      peer: sessionCompanionJazzPeer,
      scopeId: sessionCompanionJazzScopeId,
    });
  }, [sessionCompanionJazzPeer, sessionCompanionJazzScopeId, sessionCompanionLocalFirstAdapterMode]);
  const liveDocumentJazzAdapter = useMemo(() => createLiveDocumentJazzAdapter({
    adapterMode: sessionCompanionLocalFirstAdapterMode,
    jazzAdapter: sessionCompanionJazzAdapter,
    legacySnapshotRaw: asObject(asObject(draft?.bpmn_meta).session_companion_v1),
  }), [
    draft?.bpmn_meta,
    sessionCompanionJazzAdapter,
    sessionCompanionLocalFirstAdapterMode,
  ]);
  useEffect(() => {
    if (!liveDocumentJazzAdapter.isJazzBacked) {
      setSessionCompanionJazzMeta(normalizeSessionCompanion({}));
      return undefined;
    }
    setSessionCompanionJazzMeta(normalizeSessionCompanion(liveDocumentJazzAdapter.readLiveSnapshot()));
    const off = liveDocumentJazzAdapter.subscribeLiveSnapshot((nextSnapshot) => {
      setSessionCompanionJazzMeta(normalizeSessionCompanion(nextSnapshot));
    });
    return () => {
      off?.();
    };
  }, [liveDocumentJazzAdapter]);
  const sessionCompanionLegacyMeta = useMemo(
    () => normalizeSessionCompanion(asObject(asObject(draft?.bpmn_meta).session_companion_v1)),
    [draft?.bpmn_meta],
  );
  const sessionCompanionBridgeSnapshot = useMemo(() => buildSessionCompanionJazzUiBridgeSnapshot({
    legacyCompanionRaw: sessionCompanionLegacyMeta,
    jazzCompanionRaw: sessionCompanionJazzMeta,
    sessionCompanionAdapterMode: sessionCompanionLocalFirstAdapterMode,
    activationContextRaw: sessionCompanionActivation,
    durableSessionRaw: {
      bpmn_xml_version: Number(draft?.bpmn_xml_version || draft?.version || 0),
      bpmn_graph_fingerprint: toText(draft?.bpmn_graph_fingerprint),
      updated_at: toText(draft?.updated_at || draft?.updatedAt),
    },
    liveDraftRaw: {
      bpmn_xml: toText(draft?.bpmn_xml || ""),
      bpmn_xml_version: Number(draft?.bpmn_xml_version || draft?.version || 0),
      bpmn_graph_fingerprint: toText(draft?.bpmn_graph_fingerprint),
    },
    uiSaveStateRaw: {
      saveDirtyHint: saveDirtyHint === true,
      isManualSaveBusy: isManualSaveBusy === true,
    },
  }), [
    draft?.bpmn_graph_fingerprint,
    draft?.bpmn_xml,
    draft?.bpmn_xml_version,
    draft?.updatedAt,
    draft?.updated_at,
    draft?.version,
    isManualSaveBusy,
    saveDirtyHint,
    sessionCompanionActivation,
    sessionCompanionJazzMeta,
    sessionCompanionLegacyMeta,
    sessionCompanionLocalFirstAdapterMode,
  ]);
  const sessionCompanionMetaLive = useMemo(() => {
    return normalizeSessionCompanion(sessionCompanionBridgeSnapshot.companion);
  }, [sessionCompanionBridgeSnapshot.companion]);
  const sessionSaveReadSnapshot = useMemo(
    () => asObject(sessionCompanionBridgeSnapshot.save),
    [sessionCompanionBridgeSnapshot.save],
  );
  const saveUploadStatus = useMemo(
    () => buildSaveUploadStatusBadge(saveUploadLifecycleEvent),
    [saveUploadLifecycleEvent],
  );
  const sessionVersionReadSnapshot = useMemo(
    () => asObject(sessionCompanionBridgeSnapshot.version),
    [sessionCompanionBridgeSnapshot.version],
  );
  const sessionTemplateProvenanceSnapshot = useMemo(
    () => asObject(sessionCompanionBridgeSnapshot.templateProvenance),
    [sessionCompanionBridgeSnapshot.templateProvenance],
  );
  const sessionRevisionHistorySnapshot = useMemo(
    () => asObject(sessionCompanionBridgeSnapshot.revisionHistory),
    [sessionCompanionBridgeSnapshot.revisionHistory],
  );
  useEffect(() => {
    if (typeof window === "undefined" || window.__FPC_E2E__ !== true) return;
    const projectId = toText(draft?.project_id || draft?.projectId || activeProjectId);
    const scopeKey = `${projectId}::${sid}`;
    const sourceMap = asObject(sessionCompanionBridgeSnapshot?.sourceMap);
    const saveSnapshot = asObject(sessionSaveReadSnapshot);
    const versionSnapshot = asObject(sessionVersionReadSnapshot);
    const templateSnapshot = asObject(sessionTemplateProvenanceSnapshot);
    const revisionSnapshot = asObject(sessionRevisionHistorySnapshot);
    const sourceSignature = JSON.stringify({
      bridgeMode: toText(sessionCompanionBridgeSnapshot?.bridgeMode),
      sourceMap,
      hasFallback: sessionCompanionBridgeSnapshot?.hasFallback === true,
      fallbackReasons: asArray(sessionCompanionBridgeSnapshot?.fallbackReasons).map((x) => toText(x)).filter(Boolean),
    });
    const saveSignature = JSON.stringify({
      status: toText(saveSnapshot.status),
      storedRev: Number(saveSnapshot.storedRev || 0),
      requestedBaseRev: Number(saveSnapshot.requestedBaseRev || 0),
      effectiveSource: toText(saveSnapshot.effectiveSource),
      isStale: saveSnapshot.isStale === true,
      isDirty: saveSnapshot.isDirty === true,
      isSaving: saveSnapshot.isSaving === true,
      isFailed: saveSnapshot.isFailed === true,
    });
    const versionSignature = JSON.stringify({
      xmlVersion: Number(versionSnapshot.xmlVersion || 0),
      graphFingerprint: toText(versionSnapshot.graphFingerprint),
      effectiveSource: toText(versionSnapshot.effectiveSource),
      isStale: versionSnapshot.isStale === true,
      companionXmlVersion: Number(asObject(versionSnapshot.revisionContext).companionXmlVersion || 0),
      durableXmlVersion: Number(asObject(versionSnapshot.revisionContext).durableXmlVersion || 0),
    });
    const templateSignature = JSON.stringify({
      templateId: toText(templateSnapshot.templateId),
      templateRevision: toText(templateSnapshot.templateRevision),
      appliedAt: toText(templateSnapshot.appliedAt),
      effectiveSource: toText(templateSnapshot.effectiveSource),
      isStale: templateSnapshot.isStale === true,
      isMissing: templateSnapshot.isMissing === true,
    });
    const revisionSignature = JSON.stringify({
      latestRevisionNumber: Number(revisionSnapshot.latestRevisionNumber || 0),
      latestRevisionId: toText(revisionSnapshot.latestRevisionId),
      totalCount: Number(revisionSnapshot.totalCount || 0),
      effectiveSource: toText(revisionSnapshot.effectiveSource),
      draftMatchesLatestRevision: asObject(revisionSnapshot.draftState).draftMatchesLatestRevision === true,
    });
    const prev = sessionTruthProbeLastRef.current || {};
    let transitionReason = "snapshot_refresh";
    if (toText(prev.scopeKey) !== scopeKey) {
      transitionReason = "session_scope_changed";
    } else if (toText(prev.sourceSignature) !== sourceSignature) {
      transitionReason = "source_precedence_changed";
    } else if (toText(prev.saveSignature) !== saveSignature) {
      transitionReason = "save_snapshot_changed";
    } else if (toText(prev.versionSignature) !== versionSignature) {
      transitionReason = "version_snapshot_changed";
    } else if (toText(prev.templateSignature) !== templateSignature) {
      transitionReason = "template_snapshot_changed";
    } else if (toText(prev.revisionSignature) !== revisionSignature) {
      transitionReason = "revision_snapshot_changed";
    }
    sessionTruthProbeLastRef.current = {
      scopeKey,
      sourceSignature,
      saveSignature,
      versionSignature,
      templateSignature,
      revisionSignature,
    };
    const seq = Number(sessionTruthProbeSeqRef.current || 0) + 1;
    sessionTruthProbeSeqRef.current = seq;
    const snapshot = {
      seq,
      at: new Date().toISOString(),
      transitionReason,
      session: {
        projectId,
        sessionId: sid,
        scopeKey,
      },
      bridge: {
        mode: toText(sessionCompanionBridgeSnapshot?.bridgeMode),
        activation: asObject(sessionCompanionBridgeSnapshot?.activation),
        sourceMap,
        effectiveSourceMap: asObject(sessionCompanionBridgeSnapshot?.effectiveSourceMap),
        fallbackUsed: sessionCompanionBridgeSnapshot?.fallbackUsed === true,
        hasFallback: sessionCompanionBridgeSnapshot?.hasFallback === true,
        fallbackReasons: asArray(sessionCompanionBridgeSnapshot?.fallbackReasons).map((x) => toText(x)).filter(Boolean),
        stalePayloadRejected: sessionCompanionBridgeSnapshot?.stalePayloadRejected === true,
        latePayloadRejected: sessionCompanionBridgeSnapshot?.latePayloadRejected === true,
        recoveryState: toText(sessionCompanionBridgeSnapshot?.recoveryState),
        diagnosticsSeverity: toText(sessionCompanionBridgeSnapshot?.diagnosticsSeverity),
        readinessState: toText(sessionCompanionBridgeSnapshot?.readinessState),
        diagnostics: asObject(sessionCompanionBridgeSnapshot?.diagnostics),
      },
      save: saveSnapshot,
      version: versionSnapshot,
      templateProvenance: templateSnapshot,
      revisionHistory: revisionSnapshot,
    };
    const history = Array.isArray(window.__FPC_E2E_SESSION_TRUTH_HISTORY__)
      ? window.__FPC_E2E_SESSION_TRUTH_HISTORY__.slice(-399)
      : [];
    history.push(snapshot);
    window.__FPC_E2E_SESSION_TRUTH__ = snapshot;
    window.__FPC_E2E_SESSION_TRUTH_HISTORY__ = history;
    window.__FPC_E2E_GET_SESSION_TRUTH__ = () => window.__FPC_E2E_SESSION_TRUTH__;
    window.__FPC_E2E_GET_SESSION_TRUTH_HISTORY__ = () => window.__FPC_E2E_SESSION_TRUTH_HISTORY__ || [];
  }, [
    activeProjectId,
    draft?.projectId,
    draft?.project_id,
    sessionCompanionBridgeSnapshot,
    sessionSaveReadSnapshot,
    sessionTemplateProvenanceSnapshot,
    sessionRevisionHistorySnapshot,
    sessionVersionReadSnapshot,
    sid,
  ]);

  const hasSession = !!sid;
  const isLocal = isLocalSessionId(sid);
  // Track the last project that had an active session so the explorer can
  // navigate back to it when the session is closed.
  const lastSessionProjectIdRef = useRef("");
  useEffect(() => {
    const pid = String(draft?.project_id || draft?.projectId || "").trim();
    if (hasSession && pid) {
      lastSessionProjectIdRef.current = pid;
    }
  }, [hasSession, draft?.project_id, draft?.projectId]);
  const isInterviewMode = diagramMode === "interview";
  const isQualityMode = diagramMode === "quality";
  const isCoverageMode = diagramMode === "coverage";

  const projectionHelpers = useMemo(
    () => ({
      asArray,
      asObject,
      interviewHasContent,
      mergeInterviewData,
      sanitizeGraphNodes,
      mergeNodesById,
      mergeEdgesByKey,
      enrichInterviewWithNodeBindings,
      parseBpmnToSessionGraph,
    }),
    [],
  );

  const bpmnSync = useBpmnSync({
    sessionId: sid,
    isLocal,
    draft,
    bpmnRef,
    onSessionSync,
    apiGetBpmnXml,
  });

  const {
    tab,
    setTab,
    switchTab,
    isSwitchingTab,
    isFlushingTab,
    requestDiagramFocus,
    isInterview,
    isBpmnTab,
    markInterviewAsSaved,
    handleInterviewChange,
    queueDiagramMutation: queueDiagramMutationRaw,
  } = useProcessOrchestrator({
    sid,
    isLocal,
    draft,
    processTabIntent,
    bpmnRef,
    processBodyRef,
    bpmnSync,
    projectionHelpers,
    onSessionSync,
    onPublishRealtimeBpmnOps,
    onError: setGenErr,
  });

  const {
    diagramFocusMode,
    setDiagramFocusMode,
    diagramFullscreenActive,
    setDiagramFullscreenActive,
    toggleDiagramFullscreen,
    shellClassName,
    bodyClassName,
  } = useDiagramShellState({
    tab,
    processBodyRef,
    setGenErr,
    shortErr,
  });

  useEffect(() => {
    const scopeKey = `${String(activeProjectId || "")}::${sid}`;
    if (localStateResetSidRef.current === scopeKey) return;
    localStateResetSidRef.current = scopeKey;
    resetLocalStateForSession({
      autoPassToastJobIdRef,
      setDiagramFocusMode,
      setDiagramFullscreenActive,
    });
    setDrawioAnchorImportDiagnostics(null);
  }, [activeProjectId, resetLocalStateForSession, setDiagramFocusMode, setDiagramFullscreenActive, sid]);

  const queueDiagramMutation = useCallback((mutation) => {
    const kind = String(mutation?.kind || mutation || "").trim().toLowerCase();
    if (kind.startsWith("diagram.") || kind.startsWith("xml.")) {
      setSaveDirtyHint(true);
    }
    queueDiagramMutationRaw(mutation);
  }, [queueDiagramMutationRaw]);

  useEffect(() => {
    return () => {
      if (saveUploadLifecycleClearTimerRef.current) {
        globalThis.clearTimeout(saveUploadLifecycleClearTimerRef.current);
        saveUploadLifecycleClearTimerRef.current = 0;
      }
    };
  }, []);

  const onBpmnSaveLifecycleEvent = useCallback((eventRaw = null) => {
    const next = normalizeBpmnSaveLifecycleEvent(eventRaw);
    if (!next.stage || next.stage === "idle") return;
    setSaveUploadLifecycleEvent(next);
    if (saveUploadLifecycleClearTimerRef.current) {
      globalThis.clearTimeout(saveUploadLifecycleClearTimerRef.current);
      saveUploadLifecycleClearTimerRef.current = 0;
    }
    if (next.stage === "persisted" || next.stage === "skipped_unchanged") {
      const stableAt = Number(next.at || Date.now());
      saveUploadLifecycleClearTimerRef.current = globalThis.setTimeout(() => {
        setSaveUploadLifecycleEvent((prev) => (
          Number(prev?.at || 0) === stableAt ? IDLE_SAVE_UPLOAD_EVENT : prev
        ));
        saveUploadLifecycleClearTimerRef.current = 0;
      }, 4200);
    }
  }, []);

  const applyDiagramMode = useCallback((nextModeRaw) => {
    const nextMode = normalizeDiagramMode(nextModeRaw);
    setDiagramMode(nextMode);
  }, []);

  async function handleSaveCurrentTab() {
    if (!hasSession || !isBpmnTab || isSwitchingTab || isFlushingTab || isManualSaveBusy) return;
    setGenErr("");
    setInfoMsg("");
    setIsManualSaveBusy(true);
    try {
      const saved = await bpmnSync.flushFromActiveTab(tab, {
        force: tab === "diagram",
        source: "manual_save",
        reason: "manual_save",
      });
      if (!saved?.ok) {
        setGenErr(shortErr(saved?.error || "Не удалось сохранить BPMN."));
        return;
      }
      let companionError = "";
      if (!saved?.pending) {
        lastSuccessfulPublishRef.current = {
          sessionId: sid,
          atMs: Date.now(),
          xmlHash: fnv1aHex(String(saved?.xml || draft?.bpmn_xml || "")),
        };
        const companionResult = await persistSavedSessionCompanion({
          source: "manual_save",
          xml: toText(saved?.xml || draft?.bpmn_xml || ""),
          savedAt: new Date().toISOString(),
          storedRev: Number(draft?.bpmn_xml_version || draft?.version || 0),
          requestedBaseRev: Number(draft?.bpmn_xml_version || draft?.version || 0),
          publishRevision: true,
          revisionSource: "publish_manual_save",
        });
        if (!companionResult?.ok) {
          companionError = shortErr(companionResult?.error || "Не удалось синхронизировать companion metadata.");
          setGenErr(companionError);
        }
      }
      setSaveDirtyHint(false);
      if (selectedElementId) {
        bpmnRef.current?.flashNode?.(selectedElementId, "sync", { label: "Synced" });
      }
      if (saved?.pending) {
        setInfoMsg("Сохранение поставлено в очередь (pending).");
      } else if (companionError) {
        setInfoMsg("BPMN сохранён, companion metadata не синхронизированы.");
      } else {
        setInfoMsg("");
      }
    } catch (e) {
      setGenErr(shortErr(e?.message || e || "Не удалось сохранить BPMN."));
    } finally {
      setIsManualSaveBusy(false);
    }
  }

  // TODO(tech-debt): Review/LLM tabs are temporarily hidden from UI.
  // Clarification data pipeline is kept for later re-introduction.
  const {
    bottlenecks,
    lintResult,
    qualityHintsRaw,
    qualitySummary,
    qualityProfile,
    qualityAutoFixPreview,
    activeHints,
    qualityHints,
  } = useQualityDerivation({ draft, qualityProfileId, apiClarifyHints, isQualityMode });
  const workbench = useProcessWorkbenchController({
    sessionId: sid,
    isLocal,
    locked,
    tab,
    isInterview,
    isBpmnTab,
    genBusy,
    aiStepBusy,
  });
  const selectedElementId = String(selectedBpmnElement?.id || "").trim();
  const selectedElementName = String(selectedBpmnElement?.name || selectedElementId || "").trim();
  const selectedElementType = String(selectedBpmnElement?.type || "").trim();
  const selectedElementLaneName = String(selectedBpmnElement?.laneName || "").trim();
  const selectedElementContext = useMemo(() => {
    if (!selectedElementId) return null;
    return {
      id: selectedElementId,
      name: selectedElementName || selectedElementId,
      type: selectedElementType,
      laneName: selectedElementLaneName,
    };
  }, [selectedElementId, selectedElementName, selectedElementType, selectedElementLaneName]);
  const sessionMetaPersist = useSessionMetaPersist({
    sid,
    isLocal,
    draftBpmnMeta: draft?.bpmn_meta,
    onSessionSync,
    setGenErr,
    shortErr,
    hybridLayerPersistedMapRef,
    hybridV2PersistedDocRef,
    drawioPersistedMetaRef,
    normalizeHybridLayerMap,
    serializeHybridLayerMap,
    normalizeHybridV2Doc,
    docToComparableJson,
    normalizeDrawioMeta,
    serializeDrawioMeta,
    drawioJazzAdapter,
    drawioLocalFirstAdapterMode,
    sessionCompanionJazzAdapter,
    sessionCompanionLocalFirstAdapterMode,
  });
  const persistBpmnMeta = sessionMetaPersist.persistBpmnMeta;
  const persistSessionCompanion = sessionMetaPersist.persistSessionCompanion;
  const persistSavedSessionCompanion = useCallback(async ({
    source = "manual_save",
    xml = "",
    savedAt = "",
    storedRev = 0,
    requestedBaseRev = 0,
    publishRevision = false,
    revisionComment = "",
    revisionSource = "publish_revision",
  } = {}) => {
    if (!sid || typeof persistSessionCompanion !== "function") return { ok: true, skipped: true };
    let nextCompanion = buildSessionCompanionAfterSave(sessionCompanionMetaLive, {
      draft,
      xml,
      source,
      savedAt,
      storedRev,
      requestedBaseRev,
    });
    let revisionTransition = { ok: true, skipped: true, revisionNumber: 0, skipReason: "" };
    if (publishRevision) {
      revisionTransition = appendRevisionToLedger(nextCompanion, {
        xml: toText(xml || draft?.bpmn_xml || ""),
        draft,
        liveVersionRaw: sessionVersionReadSnapshot,
        author: {
          id: user?.id,
          name: user?.name || user?.username || user?.email || "",
          email: user?.email || "",
        },
        comment: toText(revisionComment) || "Published via Save",
        source: toText(revisionSource) || "publish_revision",
        skipIfContentUnchanged: true,
      });
      if (!revisionTransition?.ok) {
        return { ok: false, error: String(revisionTransition?.error || "revision_publish_failed") };
      }
      nextCompanion = revisionTransition.nextCompanion;
    }
    const persisted = await persistSessionCompanion(nextCompanion, { source: `${source}_session_companion` });
    return {
      ...persisted,
      revision: {
        skipped: revisionTransition?.skipped === true,
        skipReason: toText(revisionTransition?.skipReason),
        revisionNumber: Number(revisionTransition?.revisionNumber || 0),
      },
    };
  }, [draft, persistSessionCompanion, sessionCompanionMetaLive, sessionVersionReadSnapshot, sid, toText, user?.email, user?.id, user?.name, user?.username]);
  const persistTemplateAppliedSessionCompanion = useCallback(async ({
    template = null,
    source = "template_apply",
    xml = "",
    savedAt = "",
    storedRev = 0,
    requestedBaseRev = 0,
  } = {}) => {
    if (!sid || typeof persistSessionCompanion !== "function") return { ok: true, skipped: true };
    const nextCompanion = buildSessionCompanionAfterTemplateApply(sessionCompanionMetaLive, {
      draft,
      xml,
      source,
      savedAt,
      storedRev,
      requestedBaseRev,
      template,
    });
    return persistSessionCompanion(nextCompanion, { source: `${source}_session_companion` });
  }, [draft, persistSessionCompanion, sessionCompanionMetaLive, sid]);
  const persistTraversalSessionCompanion = useCallback(async (autoPassResultRaw, source = "auto_pass_result_sync") => {
    if (!sid || typeof persistSessionCompanion !== "function") return { ok: true, skipped: true };
    const nextCompanion = buildSessionCompanionAfterTraversal(sessionCompanionMetaLive, {
      draft,
      xml: toText(draft?.bpmn_xml || ""),
      source,
      autoPassResult: autoPassResultRaw,
    });
    return persistSessionCompanion(nextCompanion, { source: `${source}_session_companion` });
  }, [draft, persistSessionCompanion, sessionCompanionMetaLive, sid, toText]);
  const applyAutoPassResultToDraft = useCallback((resultRaw, source = "auto_pass_result_sync") => {
    const result = asObject(resultRaw);
    if (!Object.keys(result).length || !sid) return false;
    const currentMeta = asObject(draft?.bpmn_meta);
    const nextMeta = {
      ...currentMeta,
      auto_pass_v1: result,
    };
    onSessionSync?.({
      id: sid,
      session_id: sid,
      bpmn_meta: nextMeta,
      _sync_source: source,
    });
    return true;
  }, [draft?.bpmn_meta, onSessionSync, sid]);
  const syncAutoPassResultFromServer = useCallback(async (source = "auto_pass_result_server_sync") => {
    if (!sid) return false;
    const metaResult = await apiGetBpmnMeta(sid);
    if (!metaResult?.ok) return false;
    const serverMeta = asObject(metaResult?.meta);
    const result = asObject(serverMeta?.auto_pass_v1);
    const applied = applyAutoPassResultToDraft(result, source);
    if (applied) {
      const persistResult = await persistTraversalSessionCompanion(result, source);
      if (!persistResult?.ok) {
        setGenErr(shortErr(persistResult?.error || "Не удалось синхронизировать traversal result contract."));
      }
    }
    return applied;
  }, [applyAutoPassResultToDraft, persistTraversalSessionCompanion, setGenErr, shortErr, sid]);
  const hydrateAutoPassResult = useCallback(async (jobIdRaw, source = "auto_pass_hydrate") => {
    const jobId = toText(jobIdRaw);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (jobId) {
        const statusResult = await apiGetAutoPassStatus(sid, jobId);
        if (statusResult?.ok) {
          const result = asObject(statusResult?.result);
          const statusApplied = applyAutoPassResultToDraft(
            result,
            `${source}_status_attempt_${attempt + 1}`,
          );
          if (statusApplied) {
            const persistResult = await persistTraversalSessionCompanion(result, `${source}_status_attempt_${attempt + 1}`);
            if (!persistResult?.ok) {
              setGenErr(shortErr(persistResult?.error || "Не удалось синхронизировать traversal result contract."));
            }
            return true;
          }
        }
      }
      const metaApplied = await syncAutoPassResultFromServer(`${source}_meta_attempt_${attempt + 1}`);
      if (metaApplied) return true;
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return false;
  }, [applyAutoPassResultToDraft, persistTraversalSessionCompanion, setGenErr, shortErr, sid, syncAutoPassResultFromServer]);
  useEffect(() => {
    const currentSid = toText(sid);
    if (!currentSid) {
      setAutoPassPrecheck({ loading: false, canRun: false, reason: "Session is not selected.", code: "NO_SESSION" });
      return;
    }
    const reqSeq = Number(autoPassPrecheckReqSeqRef.current || 0) + 1;
    autoPassPrecheckReqSeqRef.current = reqSeq;
    setAutoPassPrecheck((prev) => ({ ...prev, loading: true }));
    (async () => {
      const result = await apiGetAutoPassPrecheck(currentSid);
      if (autoPassPrecheckReqSeqRef.current !== reqSeq) return;
      if (result?.ok) {
        const canRun = result.can_run === true;
        setAutoPassPrecheck({
          loading: false,
          canRun,
          reason: canRun ? "" : (toText(result.message) || "No complete path to EndEvent in main process."),
          code: toText(result.code),
        });
        return;
      }
      const status = Number(result?.status || 0);
      if (status === 404) {
        // Backward compatibility: if precheck endpoint is not present, do not block Auto.
        setAutoPassPrecheck({ loading: false, canRun: true, reason: "", code: "" });
        return;
      }
      setAutoPassPrecheck({
        loading: false,
        canRun: false,
        reason: shortErr(result?.error || "No complete path to EndEvent in main process."),
        code: "",
      });
    })();
  }, [sid, shortErr]);
  useEffect(() => {
    if (tab !== "doc" || !sid) return;
    const current = asObject(asObject(draft?.bpmn_meta)?.auto_pass_v1);
    if (Object.keys(current).length > 0) return;
    if (autoPassDocSyncInFlightRef.current) return;
    const now = Date.now();
    if (now - Number(autoPassDocSyncLastAttemptMsRef.current || 0) < 3000) return;
    autoPassDocSyncInFlightRef.current = true;
    autoPassDocSyncLastAttemptMsRef.current = now;
    (async () => {
      try {
        await syncAutoPassResultFromServer("doc_tab_autopass_sync");
      } finally {
        autoPassDocSyncInFlightRef.current = false;
      }
    })();
  }, [draft?.bpmn_meta, sid, syncAutoPassResultFromServer, tab]);
  const startAutoPass = useCallback(async () => {
    if (!sid) return;
    if (!autoPassPrecheck.canRun) {
      const reason = toText(autoPassPrecheck.reason) || "No complete path to EndEvent in main process.";
      setAutoPassJobState((prev) => ({
        ...prev,
        status: "failed",
        progress: 100,
        error: reason,
      }));
      setGenErr(reason);
      return;
    }
    const currentStatus = toText(autoPassJobState?.status).toLowerCase();
    if (currentStatus === "queued" || currentStatus === "running") return;
    setAutoPassJobState((prev) => ({
      ...prev,
      status: "starting",
      error: "",
      progress: 0,
      startedAtMs: Date.now(),
    }));
    const started = await apiStartAutoPass(sid, {
      mode: "all",
      max_variants: 500,
      max_visits_per_node: 2,
      max_steps: 2000,
    });
    if (!started?.ok) {
      setAutoPassJobState({
        jobId: "",
        status: "failed",
        progress: 100,
        startedAtMs: Date.now(),
        error: shortErr(started?.error || "Не удалось запустить автопроход."),
      });
      setGenErr(shortErr(started?.error || "Не удалось запустить автопроход."));
      return;
    }
    const jobId = toText(started?.job_id);
    const nextStatus = toText(started?.job_status || started?.status || "queued").toLowerCase() || "queued";
    setGenErr("");
    setAutoPassJobState({
      jobId,
      status: nextStatus,
      progress: Number(started?.progress || (nextStatus === "completed" ? 100 : 0)),
      startedAtMs: Date.now(),
      error: "",
    });
    if (nextStatus === "completed") {
      const completedResult = asObject(started?.result);
      const applied = applyAutoPassResultToDraft(completedResult, "auto_pass_completed_sync");
      if (!applied) {
        const hydrated = await hydrateAutoPassResult(jobId, "auto_pass_completed_sync_hydrate");
        if (!hydrated) {
          setGenErr("Автопроход завершён, но результат пока не синхронизирован. Повторите через несколько секунд.");
        }
      } else {
        const persistResult = await persistTraversalSessionCompanion(completedResult, "auto_pass_completed_sync");
        if (!persistResult?.ok) {
          setGenErr(shortErr(persistResult?.error || "Не удалось синхронизировать traversal result contract."));
        }
      }
      if (autoPassToastJobIdRef.current !== jobId) {
        autoPassToastJobIdRef.current = jobId;
        setInfoMsg("Автопроход готов.");
      }
    }
  }, [
    applyAutoPassResultToDraft,
    autoPassJobState?.status,
    autoPassPrecheck.canRun,
    autoPassPrecheck.reason,
    hydrateAutoPassResult,
    persistTraversalSessionCompanion,
    setInfoMsg,
    setGenErr,
    sid,
  ]);
  useEffect(() => {
    const jobId = toText(autoPassJobState?.jobId);
    const status = toText(autoPassJobState?.status).toLowerCase();
    if (!sid || !jobId) return undefined;
    if (status !== "queued" && status !== "running" && status !== "starting") return undefined;
    const elapsedMs = Math.max(0, Date.now() - Number(autoPassJobState?.startedAtMs || Date.now()));
    const delayMs = elapsedMs >= 30000 ? 4500 : 1500;
    const timer = window.setTimeout(async () => {
      const polled = await apiGetAutoPassStatus(sid, jobId);
      if (!polled?.ok) {
        const errMsg = shortErr(polled?.error || "Не удалось получить статус автопрохода.");
        setAutoPassJobState((prev) => ({
          ...prev,
          status: "failed",
          progress: Math.max(Number(prev?.progress || 0), 0),
          error: errMsg,
        }));
        setGenErr(errMsg);
        return;
      }
      const nextStatus = toText(polled?.job_status || polled?.status || "").toLowerCase();
      const nextProgress = Number(polled?.progress || 0);
      if (nextStatus === "completed" || nextStatus === "done") {
        const completedResult = asObject(polled?.result);
        const applied = applyAutoPassResultToDraft(completedResult, "auto_pass_completed_poll");
        if (!applied) {
          const hydrated = await hydrateAutoPassResult(jobId, "auto_pass_completed_poll_hydrate");
          if (!hydrated) {
            setGenErr("Автопроход завершён, но результат пока не синхронизирован. Повторите через несколько секунд.");
          }
        } else {
          const persistResult = await persistTraversalSessionCompanion(completedResult, "auto_pass_completed_poll");
          if (!persistResult?.ok) {
            setGenErr(shortErr(persistResult?.error || "Не удалось синхронизировать traversal result contract."));
          }
        }
        setAutoPassJobState((prev) => ({
          ...prev,
          status: "completed",
          progress: Number.isFinite(nextProgress) ? Math.max(0, Math.min(100, nextProgress || 100)) : 100,
          error: "",
        }));
        if (autoPassToastJobIdRef.current !== jobId) {
          autoPassToastJobIdRef.current = jobId;
          setInfoMsg("Автопроход готов.");
        }
        setGenErr("");
        return;
      }
      if (nextStatus === "failed" || nextStatus === "error") {
        const errMsg = shortErr(polled?.error || "Автопроход завершился с ошибкой.");
        setAutoPassJobState((prev) => ({
          ...prev,
          status: "failed",
          progress: 100,
          error: errMsg,
        }));
        setGenErr(errMsg);
        return;
      }
      setAutoPassJobState((prev) => ({
        ...prev,
        status: nextStatus || prev.status || "running",
        progress: Number.isFinite(nextProgress) ? Math.max(0, Math.min(99, nextProgress)) : prev.progress,
        error: "",
      }));
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    applyAutoPassResultToDraft,
    autoPassJobState?.jobId,
    autoPassJobState?.startedAtMs,
    autoPassJobState?.status,
    hydrateAutoPassResult,
    persistTraversalSessionCompanion,
    setGenErr,
    setInfoMsg,
    sid,
  ]);
  const autoPassUi = useMemo(() => {
    const status = toText(autoPassJobState?.status).toLowerCase();
    if (!status || status === "idle") return { status: "idle", label: "Auto: idle", progress: 0 };
    if (status === "starting") return { status, label: "Auto: queued", progress: 0 };
    if (status === "queued") return { status, label: "Auto: queued", progress: Number(autoPassJobState?.progress || 0) };
    if (status === "running") return { status, label: "Auto: running", progress: Number(autoPassJobState?.progress || 0) };
    if (status === "completed" || status === "done") return { status: "done", label: "Auto: done", progress: 100 };
    if (status === "failed" || status === "error") return { status: "fail", label: "Auto: fail", progress: 100 };
    return { status, label: `Auto: ${status}`, progress: Number(autoPassJobState?.progress || 0) };
  }, [autoPassJobState?.progress, autoPassJobState?.status]);
  const {
    attentionViewerId,
    attentionStorageKey,
    attentionMarkers,
    attentionShowOnWorkspace,
    attentionMarkersWithState,
    attentionMarkerUnreadCount,
    attentionMarkerHomeCount,
    customAttentionHints,
  } = useAttentionMarkerDerivation({
    user,
    bpmnMeta: draft?.bpmn_meta,
    attentionSessionLastOpenedAt,
    sid,
  });
  useEffect(() => {
    if (!sid) return;
    if (typeof window === "undefined") return;
    const now = Math.floor(Date.now() / 1000);
    try {
      const raw = Number(window.localStorage?.getItem(attentionStorageKey) || 0);
      const prev = Number.isFinite(raw) ? Math.round(raw) : 0;
      if (prev > 0) {
        setAttentionSessionLastOpenedAt(prev);
      } else {
        setAttentionSessionLastOpenedAt(now);
      }
      window.localStorage?.setItem(attentionStorageKey, String(now));
    } catch {
      setAttentionSessionLastOpenedAt(now);
    }
  }, [attentionStorageKey, sid]);
  const persistAttentionMeta = useCallback(async ({
    markersRaw,
    showOnWorkspaceRaw,
    source = "attention_marker_update",
  }) => {
    const markersNext = normalizeAttentionMarkers(markersRaw);
    const showOnWorkspace = showOnWorkspaceRaw !== false;
    const currentMeta = asObject(draft?.bpmn_meta);
    const nextMeta = {
      ...currentMeta,
      attention_markers: markersNext,
      attention_show_on_workspace: showOnWorkspace,
    };
    setAttentionMarkerSaving(true);
    try {
      const saved = await persistBpmnMeta(nextMeta, {
        source,
        maxAttempts: 3,
        retryBackoffMs: [280, 720],
      });
      if (!saved?.ok) {
        const status = Number(saved?.status || 0);
        if (status === 409 || status === 423) {
          setInfoMsg("Session is being updated. Retry in a moment.");
        }
      }
      return saved;
    } finally {
      setAttentionMarkerSaving(false);
    }
  }, [draft?.bpmn_meta, persistBpmnMeta]);
  const addAttentionMarker = useCallback(async () => {
    const message = toText(attentionMarkerMessage);
    if (!message) return;
    const marker = createAttentionMarker({
      message,
      nodeId: selectedElementId,
      createdBy: attentionViewerId,
      createdAt: Math.floor(Date.now() / 1000),
    });
    const next = [marker, ...attentionMarkers];
    setAttentionMarkerMessage("");
    const saved = await persistAttentionMeta({
      markersRaw: next,
      showOnWorkspaceRaw: attentionShowOnWorkspace,
      source: "attention_marker_add",
    });
    if (saved?.ok) {
      setInfoMsg("Маркер внимания добавлен.");
      setGenErr("");
    }
  }, [
    attentionMarkerMessage,
    selectedElementId,
    attentionViewerId,
    attentionMarkers,
    persistAttentionMeta,
    attentionShowOnWorkspace,
  ]);
  const toggleAttentionMarkerChecked = useCallback(async (markerIdRaw, checkedRaw) => {
    const markerId = toText(markerIdRaw);
    if (!markerId) return;
    const checked = !!checkedRaw;
    const nextMarkers = attentionMarkers.map((marker) => (
      marker.id === markerId ? { ...marker, is_checked: checked } : marker
    ));
    const saved = await persistAttentionMeta({
      markersRaw: nextMarkers,
      showOnWorkspaceRaw: attentionShowOnWorkspace,
      source: "attention_marker_check_toggle",
    });
    if (saved?.ok) {
      setInfoMsg(checked ? "Маркер отмечен как проверенный." : "Маркер снова требует внимания.");
      setGenErr("");
    }
  }, [attentionMarkers, attentionShowOnWorkspace, persistAttentionMeta]);
  const markAttentionMarkersSeenByIds = useCallback(async (markerIdsRaw = null, source = "attention_marker_seen") => {
    const markerIds = markerIdsRaw ? asArray(markerIdsRaw).map((id) => toText(id)).filter(Boolean) : null;
    const nextMarkers = markAttentionMarkersSeen(
      attentionMarkers,
      attentionViewerId,
      markerIds,
      Math.floor(Date.now() / 1000),
    );
    const hasChanges = JSON.stringify(nextMarkers) !== JSON.stringify(attentionMarkers);
    if (!hasChanges) return { ok: true, skipped: true };
    return persistAttentionMeta({
      markersRaw: nextMarkers,
      showOnWorkspaceRaw: attentionShowOnWorkspace,
      source,
    });
  }, [attentionMarkers, attentionShowOnWorkspace, attentionViewerId, persistAttentionMeta]);
  const toggleAttentionShowOnWorkspace = useCallback(async (enabledRaw) => {
    const enabled = !!enabledRaw;
    const saved = await persistAttentionMeta({
      markersRaw: attentionMarkers,
      showOnWorkspaceRaw: enabled,
      source: "attention_show_on_workspace_toggle",
    });
    if (saved?.ok) {
      setInfoMsg(enabled ? "Маркеры внимания теперь отображаются на главной." : "Маркеры внимания скрыты на главной.");
      setGenErr("");
    }
  }, [attentionMarkers, persistAttentionMeta]);
  const focusAttentionMarker = useCallback(async (markerRaw) => {
    const marker = asObject(markerRaw);
    const markerId = toText(marker.id);
    if (!markerId) return;
    await markAttentionMarkersSeenByIds([markerId], "attention_marker_focus");
    const nodeId = toNodeId(marker.node_id);
    if (!nodeId) return;
    if (tab !== "diagram") setTab("diagram");
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Показано" });
    }, 120);
    onOpenElementNotes?.({
      id: nodeId,
      name: toText(marker.message || nodeId) || nodeId,
      type: "",
      laneName: "",
    }, "header_open_notes");
  }, [markAttentionMarkersSeenByIds, onOpenElementNotes, requestDiagramFocus, setTab, tab, toNodeId, toText]);
  useEffect(() => {
    if (!attentionOpen) {
      attentionPanelWasOpenRef.current = false;
      return;
    }
    const justOpened = !attentionPanelWasOpenRef.current;
    attentionPanelWasOpenRef.current = true;
    if (!justOpened) return;
    const unreadIds = attentionMarkersWithState
      .filter((marker) => marker.unread)
      .map((marker) => marker.id);
    if (!unreadIds.length) return;
    void markAttentionMarkersSeenByIds(unreadIds, "attention_marker_panel_open");
  }, [attentionOpen, attentionMarkersWithState, markAttentionMarkersSeenByIds]);
  const nodePathMetaMap = useMemo(
    () => normalizeNodePathMetaMap(asObject(asObject(draft?.bpmn_meta).node_path_meta)),
    [draft?.bpmn_meta],
  );
  const flowTierMetaMap = useMemo(
    () => normalizeFlowTierMetaMap(asObject(asObject(draft?.bpmn_meta).flow_meta)),
    [draft?.bpmn_meta],
  );
  const robotMetaByElementId = useMemo(
    () => normalizeRobotMetaMap(asObject(asObject(draft?.bpmn_meta).robot_meta_by_element_id)),
    [draft?.bpmn_meta],
  );
  const robotMetaStatusByElementId = useMemo(
    () => buildRobotMetaStatusByElementId(robotMetaByElementId),
    [robotMetaByElementId],
  );
  const robotMetaCounts = useMemo(() => {
    const summary = { ready: 0, incomplete: 0 };
    Object.values(robotMetaStatusByElementId).forEach((statusRaw) => {
      const status = toText(statusRaw).toLowerCase();
      if (status === "ready") summary.ready += 1;
      if (status === "incomplete") summary.incomplete += 1;
    });
    return summary;
  }, [robotMetaStatusByElementId]);
  const robotMetaNodeCatalogById = useMemo(() => {
    const out = {};
    asArray(draft?.nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      out[nodeId] = {
        id: nodeId,
        title: toText(node?.name || node?.title || nodeId) || nodeId,
        type: toText(node?.type),
      };
    });
    return out;
  }, [draft?.nodes]);
  const hybridLayerMapLive = useMemo(
    () => normalizeHybridLayerMap(hybridLayerByElementId),
    [hybridLayerByElementId],
  );
  const hybridLayerItems = useMemo(() => {
    const out = [];
    const seen = new Set();
    Object.keys(robotMetaByElementId).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || seen.has(elementId)) return;
      const meta = asObject(robotMetaByElementId[elementId]);
      const mode = toText(meta?.exec?.mode).toLowerCase();
      if (mode !== "hybrid") return;
      seen.add(elementId);
      const node = asObject(robotMetaNodeCatalogById[elementId]);
      out.push({
        elementId,
        title: toText(node?.title || elementId) || elementId,
        status: toText(robotMetaStatusByElementId[elementId]).toLowerCase() || "none",
        executor: toText(meta?.exec?.executor),
        actionKey: toText(meta?.exec?.action_key),
      });
    });
    Object.keys(hybridLayerMapLive).forEach((elementIdRaw) => {
      const elementId = toText(elementIdRaw);
      if (!elementId || seen.has(elementId)) return;
      seen.add(elementId);
      const node = asObject(robotMetaNodeCatalogById[elementId]);
      out.push({
        elementId,
        title: toText(node?.title || elementId) || elementId,
        status: toText(robotMetaStatusByElementId[elementId]).toLowerCase() || "none",
        executor: "",
        actionKey: "",
      });
    });
    return out.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru") || String(a.elementId || "").localeCompare(String(b.elementId || ""), "ru"));
  }, [
    robotMetaByElementId,
    robotMetaNodeCatalogById,
    robotMetaStatusByElementId,
    hybridLayerMapLive,
  ]);
  const hybridDebugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(String(window.location.search || "")).get("debugHybrid") === "1";
    } catch {
      return false;
    }
  }, [sid, tab]);
  const bpmnCanvasApi = useBpmnCanvasController({
    bpmnRef,
    bpmnStageHostRef,
  });
  const {
    hybridViewportSize,
    hybridViewportMatrix,
    hybridViewportMatrixRef,
    subscribeOverlayViewportMatrix,
    getOverlayViewportMatrix,
    overlayViewbox,
    overlayContainerRect,
    localToDiagram,
    clientToDiagram,
    getElementBBox,
    diagramToScreen,
    screenToDiagram,
  } = useDiagramOverlayTransform({
    enabled: tab === "diagram" && overlayLayerVisible,
    canvasApi: bpmnCanvasApi,
  });
  const templatesDiagramContainerRect = (() => {
    const rect = asObject(overlayContainerRect);
    const width = Number(rect.width || 0);
    const height = Number(rect.height || 0);
    if (width > 0 && height > 0) return rect;
    const host = bpmnStageHostRef?.current;
    if (host instanceof Element && typeof host.getBoundingClientRect === "function") {
      const box = host.getBoundingClientRect();
      return {
        left: Number(box.left || 0),
        top: Number(box.top || 0),
        width: Number(box.width || 0),
        height: Number(box.height || 0),
      };
    }
    return rect;
  })();
  const {
    hybridLayerPositions,
    hybridLayerPositionsRef,
    readHybridElementAnchor,
    resolveHybridTargetElementIdFromPoint,
    resolveFirstHybridSeedElementId,
  } = useHybridLayerAnchorController({
    canvasApi: bpmnCanvasApi,
    tab,
    hybridVisible,
    hybridLayerItems,
    bpmnStageHostRef,
    toText,
    toNodeId,
    cssEscapeAttr,
    localToDiagram,
    getElementBBox,
  });
  const {
    getHybridLayerCardRefCallback,
    hybridLayerRenderRows,
    hybridLayerMissingBindingIds,
    hybridLayerVisibilityStats,
    hybridLayerCounts,
  } = useHybridLayerViewportController({
    resetKey: sid,
    tab,
    hybridVisible,
    hybridModeEffective,
    hybridLayerItems,
    hybridLayerPositions,
    hybridLayerByElementId,
    hybridViewportSize,
    hybridViewportMatrix,
    hybridLayerActiveElementId,
    matrixToDiagram,
    matrixToScreen,
    toText,
  });
  const hybridPersist = useHybridPersistController({
    persistHybridLayerMap: sessionMetaPersist.persistHybridLayerMap,
    persistHybridV2Doc: sessionMetaPersist.persistHybridV2Doc,
    persistDrawioMeta: sessionMetaPersist.persistDrawioMeta,
    sessionId: sid,
    setInfoMsg,
  });
  const persistHybridLayerMap = hybridPersist.persistHybridLayerMap;
  const persistHybridV2Doc = hybridPersist.saveHybrid;
  const persistDrawioMeta = hybridPersist.persistDrawioMeta;
  const robotMetaListItems = useMemo(() => {
    const tab = toText(robotMetaListTab).toLowerCase() === "incomplete" ? "incomplete" : "ready";
    const query = toText(robotMetaListSearch).toLowerCase();
    return Object.keys(robotMetaStatusByElementId)
      .map((elementId) => {
        const status = toText(robotMetaStatusByElementId[elementId]).toLowerCase();
        if (status !== tab) return null;
        const meta = asObject(robotMetaByElementId[elementId]);
        const node = asObject(robotMetaNodeCatalogById[elementId]);
        const mode = toText(meta?.exec?.mode).toLowerCase();
        const executor = toText(meta?.exec?.executor);
        const actionKey = toText(meta?.exec?.action_key);
        const title = toText(node?.title || elementId) || elementId;
        const searchText = [title, elementId, mode, executor, actionKey].join(" ").toLowerCase();
        if (query && !searchText.includes(query)) return null;
        return {
          nodeId: elementId,
          title,
          type: toText(node?.type),
          mode: mode || "human",
          executor,
          actionKey,
          status: getRobotMetaStatus(meta),
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru") || String(a.nodeId || "").localeCompare(String(b.nodeId || ""), "ru"));
  }, [
    robotMetaStatusByElementId,
    robotMetaByElementId,
    robotMetaNodeCatalogById,
    robotMetaListTab,
    robotMetaListSearch,
  ]);
  const executionPlanVersions = useMemo(
    () => normalizeExecutionPlanVersionList(asObject(asObject(draft?.bpmn_meta).execution_plans)),
    [draft?.bpmn_meta],
  );
  const executionPlanNodeTypeById = useMemo(() => {
    const out = {};
    asArray(draft?.nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      out[nodeId] = toText(node?.type) || null;
    });
    return out;
  }, [draft?.nodes]);
  const executionPlanSource = useMemo(() => {
    const interview = asObject(draft?.interview);
    const debug = asObject(interview?.report_build_debug);
    const highlightedTier = normalizePathTier(pathHighlightTier);
    const highlightedSeq = normalizePathSequenceKey(pathHighlightSequenceKey);
    const useHighlightScope = !!pathHighlightEnabled && !!(highlightedTier || highlightedSeq);
    const debugRouteSteps = normalizeDebugRouteSteps(debug?.route_steps || debug?.routeSteps);
    const routeSteps = debugRouteSteps.length
      ? debugRouteSteps
      : asArray(buildRouteStepsFromInterviewPathSpec(interview));
    const sourceSteps = routeSteps.length
      ? routeSteps
      : asArray(draft?.nodes).map((nodeRaw, idx) => {
        const node = asObject(nodeRaw);
        const workSec = Number(
          node?.step_time_sec
          ?? node?.stepTimeSec
          ?? node?.duration_sec
          ?? node?.durationSec
          ?? 0,
        );
        return {
          order_index: idx + 1,
          step_id: toText(node?.id) || `node_step_${idx + 1}`,
          title: toText(node?.name || node?.title || node?.id) || `Step ${idx + 1}`,
          bpmn_ref: toText(node?.id),
          lane_name: toText(node?.laneName || node?.role || node?.area),
          work_duration_sec: Number.isFinite(workSec) && workSec >= 0 ? Math.round(workSec) : 0,
          wait_duration_sec: 0,
        };
      });
    const readStepBpmnId = (stepRaw) => toText(
      asObject(stepRaw)?.bpmn_ref
      || asObject(stepRaw)?.bpmnRef
      || asObject(stepRaw)?.node_bind_id
      || asObject(stepRaw)?.nodeBindId
      || asObject(stepRaw)?.node_id
      || asObject(stepRaw)?.nodeId,
    );
    let filteredSteps = sourceSteps;
    if (useHighlightScope && highlightedTier) {
      const scoped = sourceSteps.filter((stepRaw) => {
        const bpmnId = readStepBpmnId(stepRaw);
        if (!bpmnId) return false;
        const nodeMeta = asObject(nodePathMetaMap[bpmnId]);
        const paths = asArray(nodeMeta?.paths)
          .map((item) => normalizePathTier(item))
          .filter(Boolean);
        if (!paths.includes(highlightedTier)) return false;
        if (!highlightedSeq) return true;
        const seq = normalizePathSequenceKey(nodeMeta?.sequence_key || nodeMeta?.sequenceKey);
        return seq === highlightedSeq;
      });
      if (scoped.length > 0) filteredSteps = scoped;
    }
    const debugPathId = toText(debug?.path_id_used);
    const pathId = toText(
      useHighlightScope
        ? (highlightedSeq || highlightedTier || debugPathId || "primary")
        : (debugPathId || highlightedSeq || highlightedTier || "primary"),
    );
    let scenarioLabel = toText(debug?.selectedScenarioLabel);
    if (!scenarioLabel && useHighlightScope && highlightedTier) {
      scenarioLabel = highlightedSeq ? `${highlightedTier} (${highlightedSeq})` : `${highlightedTier} Ideal`;
    }
    if (!scenarioLabel) scenarioLabel = highlightedTier ? `${highlightedTier} Ideal` : "P0 Ideal";
    return {
      pathId,
      scenarioLabel,
      steps: filteredSteps,
      source: useHighlightScope
        ? "diagram_path_highlight"
        : (debugRouteSteps.length ? "report_build_debug_route" : "interview_path_spec"),
    };
  }, [
    draft?.interview,
    draft?.nodes,
    nodePathMetaMap,
    pathHighlightEnabled,
    pathHighlightTier,
    pathHighlightSequenceKey,
  ]);
  const canExportExecutionPlan = asArray(executionPlanSource?.steps).length > 0;
  const pathHighlightCatalog = useMemo(() => {
    const tiers = {
      P0: { id: "P0", nodes: 0, flows: 0, sequenceKeys: [] },
      P1: { id: "P1", nodes: 0, flows: 0, sequenceKeys: [] },
      P2: { id: "P2", nodes: 0, flows: 0, sequenceKeys: [] },
    };
    const seqByTier = {
      P0: new Set(),
      P1: new Set(),
      P2: new Set(),
    };
    Object.values(nodePathMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const sequenceKey = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      asArray(entry?.paths).forEach((tierRaw) => {
        const tier = normalizePathTier(tierRaw);
        if (!tier || !tiers[tier]) return;
        tiers[tier].nodes += 1;
        if (sequenceKey) seqByTier[tier].add(sequenceKey);
      });
    });
    Object.values(flowTierMetaMap).forEach((entryRaw) => {
      const tier = normalizePathTier(asObject(entryRaw)?.tier);
      if (!tier || !tiers[tier]) return;
      tiers[tier].flows += 1;
    });
    ["P0", "P1", "P2"].forEach((tier) => {
      tiers[tier].sequenceKeys = Array.from(seqByTier[tier]).sort((a, b) => a.localeCompare(b, "ru"));
    });
    return tiers;
  }, [nodePathMetaMap, flowTierMetaMap]);
  const availablePathTiers = useMemo(
    () => ["P0", "P1", "P2"].filter((tier) => {
      const row = asObject(pathHighlightCatalog[tier]);
      return Number(row?.nodes || 0) > 0 || Number(row?.flows || 0) > 0;
    }),
    [pathHighlightCatalog],
  );
  const availableSequenceKeysForTier = useMemo(
    () => asArray(asObject(pathHighlightCatalog[pathHighlightTier]).sequenceKeys),
    [pathHighlightCatalog, pathHighlightTier],
  );
  const [playbackDecisionMode, setPlaybackDecisionMode] = useState("auto_pass");
  const {
    playbackOverlayClickGuardRef,
    playbackIsPlaying,
    playbackRuntimeSnapshot,
    playbackGateways,
    playbackGatewayChoices,
    playbackGatewayChoiceSource,
    playbackGatewayReadOnly,
    playbackDecisionMode: playbackDecisionModeResolved,
    playbackGatewayPending,
    playbackAwaitingGatewayId,
    playbackGraphError,
    playbackTotal,
    playbackCanRun,
    playbackIndexClamped,
    playbackCurrentEvent,
    playbackHighlightedBpmnIds,
    markPlaybackOverlayInteraction,
    setPlaybackGatewayChoice,
    handlePlaybackPrev,
    handlePlaybackNext,
    handlePlaybackReset,
    handlePlaybackTogglePlay,
    playbackAutoCamera,
    setPlaybackAutoCamera,
    playbackSpeed,
    setPlaybackSpeed,
    playbackManualAtGateway,
    setPlaybackManualAtGateway,
    playbackScenarioKey,
    setPlaybackScenarioKey,
    playbackScenarioOptions,
    playbackScenarioLabel,
    playbackEventTitle,
    formatPlaybackGatewayTitle,
    playbackGatewayOptionLabel,
  } = usePlaybackController({
    sid,
    tab,
    draftBpmnXml: draft?.bpmn_xml,
    diagramActionPlaybackOpen,
    bpmnRef,
    draftInterview: draft?.interview,
    executionPlanSteps: asArray(executionPlanSource?.steps),
    executionPlanPathId: executionPlanSource?.pathId,
    executionPlanScenarioLabel: executionPlanSource?.scenarioLabel,
    pathHighlightCatalog,
    pathHighlightTier,
    pathHighlightSequenceKey,
    flowTierMetaMap,
    nodePathMetaMap,
    playbackDecisionMode,
    autoPassUiStatus: toText(autoPassUi?.status || autoPassJobState?.status || ""),
    materializedTraversalResult: asObject(sessionCompanionMetaLive?.traversal_result_v1),
    materializedAutoPassResult: asObject(asObject(draft?.bpmn_meta)?.auto_pass_v1),
    initialPlaybackAutoCamera: true,
    initialPlaybackSpeed: "1",
    initialPlaybackManualAtGateway: false,
    initialPlaybackScenarioKey: "active",
  });
  const {
    hybridTools,
    hybridSelection,
    hybridV2DocLive,
    hybridV2BindingByHybridId,
    hybridV2Renderable,
    hybridV2HiddenCount,
    hybridV2ToolState,
    hybridV2ActiveId,
    hybridV2SelectedIds,
    hybridV2SelectedIdSet,
    hybridV2ImportNotice,
    setHybridV2ActiveId,
    deleteSelectedHybridIds,
    hybridTotalCount,
    showHybridLayer,
    hideHybridLayer,
    setHybridLayerMode,
    toggleHybridToolsVisible,
    setHybridLayerOpacity,
    toggleHybridLayerLock,
    toggleHybridLayerFocus,
    toggleHybridV2LayerVisibility,
    toggleHybridV2LayerLock,
    setHybridV2LayerOpacity,
    revealAllHybridV2,
    focusHybridLayer,
    goToHybridLayerItem,
    cleanupMissingHybridBindings,
    withHybridOverlayGuard,
    handleHybridLayerItemPointerDown,
    hybridToolsUiState,
    drawioUiState,
    setHybridToolsMode,
    selectHybridPaletteTool,
    startHybridStencilPlacement,
    hybridPlacementHitLayerActive,
    goToActiveHybridBinding,
    exportHybridV2Drawio,
    handleHybridV2ImportFile,
    handleHybridV2ElementPointerDown,
    handleHybridV2ResizeHandlePointerDown,
    handleHybridV2OverlayPointerDown,
    handleHybridV2OverlayContextMenu,
    handleHybridV2ElementContextMenu,
    handleHybridV2ElementDoubleClick,
    deleteLegacyHybridMarkers,
    hybridV2PlaybackHighlightedIds,
  } = useHybridPipelineController({
    sid,
    tab,
    draft,
    user,
    isLocal,
    selectedElementId,
    selectedElementType,
    diagramActionHybridToolsOpen,
    setDiagramActionHybridToolsOpen,
    hybridUiPrefs,
    setHybridUiPrefs,
    hybridPeekActive,
    setHybridPeekActive,
    hybridVisible,
    hybridModeEffective,
    hybridLayerByElementId,
    setHybridLayerByElementId,
    hybridLayerActiveElementId,
    setHybridLayerActiveElementId,
    hybridLayerMapRef,
    hybridLayerPersistedMapRef,
    hybridLayerDragRef,
    hybridAutoFocusGuardRef,
    hybridV2Doc,
    setHybridV2Doc,
    hybridV2DocRef,
    hybridV2PersistedDocRef,
    hybridV2BindPickMode,
    setHybridV2BindPickMode,
    hybridV2MigrationGuardRef,
    drawioMeta,
    hybridStorageKey,
    hybridLayerMapFromDraft,
    hybridLayerMapLive,
    hybridLayerRenderRows,
    hybridLayerMissingBindingIds,
    hybridLayerVisibilityStats,
    hybridLayerCounts,
    hybridViewportSize,
    hybridViewportMatrix,
    overlayViewbox,
    overlayContainerRect,
    clientToDiagram,
    resolveHybridTargetElementIdFromPoint,
    resolveFirstHybridSeedElementId,
    readHybridElementAnchor,
    getHybridLayerCardRefCallback,
    bpmnRef,
    bpmnStageHostRef,
    persistHybridLayerMap,
    persistHybridV2Doc,
    markPlaybackOverlayInteraction,
    playbackHighlightedBpmnIds,
    hybridDebugEnabled,
    normalizeHybridLayerMap,
    normalizeHybridUiPrefs,
    saveHybridUiPrefs,
    applyHybridVisibilityTransition,
    applyHybridModeTransition,
    normalizeHybridV2Doc,
    docToComparableJson,
    parseSequenceFlowsFromXml,
    toText,
    toNodeId,
    asArray,
    asObject,
    isEditableTarget,
    downloadTextFile,
    setGenErr,
    setInfoMsg,
  });
  const templatesBridge = useTemplatesStageBridge({
    selectedBpmnElement,
    draftNodes: draft?.nodes,
    sessionId: sid,
    bpmnApiRef: bpmnRef,
    bpmnStageHostRef,
    clientToDiagram,
    onPersistedTemplateApply: async ({ template, saved }) => {
      const result = await persistTemplateAppliedSessionCompanion({
        template,
        source: "template_apply",
        xml: toText(saved?.xml || bpmnRef.current?.getXmlDraft?.() || draft?.bpmn_xml || ""),
        savedAt: new Date().toISOString(),
        storedRev: Number(draft?.bpmn_xml_version || draft?.version || 0),
        requestedBaseRev: Number(draft?.bpmn_xml_version || draft?.version || 0),
      });
      if (!result?.ok) {
        setGenErr(shortErr(result?.error || "Не удалось синхронизировать template provenance."));
      }
    },
  });
  const selectedBpmnElementIds = templatesBridge.selectedBpmnIds;
  const getSelectedHybridStencilTemplate = useCallback(() => {
    const selectedIds = Array.from(new Set(asArray(hybridV2SelectedIds).map((row) => toText(row)).filter(Boolean)));
    return {
      selected_ids: selectedIds,
      hybrid_doc: hybridV2DocLive,
      selection_count: selectedIds.length,
    };
  }, [asArray, hybridV2DocLive, hybridV2SelectedIds, toText]);
  const applyHybridStencilTemplate = useCallback((template) => {
    return startHybridStencilPlacement(template);
  }, [startHybridStencilPlacement]);
  const templatesStore = useTemplatesStore({
    userId: toText(user?.id),
    orgId: workspaceActiveOrgId,
    canCreateOrgTemplate: !!workspaceActiveOrgId && !!canManageSharedTemplates,
    hasSession,
    tab,
    getSelectedBpmnElementIds: templatesBridge.getSelectedBpmnIds,
    getSelectedHybridStencilTemplate,
    applySelectionIds: templatesBridge.applyBpmnSelection,
    applyHybridStencilTemplate,
    captureBpmnFragmentTemplatePack: templatesBridge.captureBpmnFragmentTemplatePack,
    insertBpmnFragmentTemplateAtPoint: templatesBridge.insertBpmnFragmentTemplateAtPoint,
    insertBpmnFragmentTemplateImmediately: templatesBridge.insertBpmnFragmentTemplateImmediately,
    isDiagramClientPoint: templatesBridge.isDiagramClientPoint,
    diagramContainerRect: templatesDiagramContainerRect,
    selectionContext: templatesBridge.selectionContext,
    setError: setGenErr,
    setInfo: setInfoMsg,
  });
  const {
    templatesEnabled,
    setTemplatesEnabled,
    pickerOpen: templatesPickerOpen,
    setPickerOpen: setTemplatesPickerOpen,
    createOpen: createTemplateOpen,
    setCreateOpen: setCreateTemplateOpen,
    busy: templatesBusy,
    search: templatesSearch,
    setSearch: setTemplatesSearch,
    activeScope: templatesScope,
    setActiveScope: setTemplatesScope,
    activeFolderId: templatesActiveFolderId,
    setActiveFolderForScope: setTemplatesActiveFolder,
    foldersByScope: templatesFoldersByScope,
    createScope: createTemplateScope,
    setCreateScope: setCreateTemplateScope,
    createType: createTemplateType,
    setCreateType: setCreateTemplateType,
    createTitle: createTemplateTitle,
    setCreateTitle: setCreateTemplateTitle,
    createFolderId: createTemplateFolderId,
    setCreateFolderId: setCreateTemplateFolderId,
    selectedHybridCount: selectedHybridTemplateCount,
    scopedTemplates,
    suggestedTemplates,
    counts: templateCounts,
    openTemplatesPicker,
    openCreateTemplateModal,
    createFolderFromUi: createTemplateFolderFromUi,
    saveCurrentSelectionAsTemplate,
    reloadTemplates,
    reloadTemplatesAndFolders,
    applyTemplate,
    removeTemplate,
    bpmnFragmentPlacementGhost,
    bpmnFragmentPlacementActive,
  } = templatesStore;
  const { stageActions } = useDiagramActionsController({
    popovers: {
      toolbarMenuOpen,
      setToolbarMenuOpen,
      diagramActionPathOpen,
      setDiagramActionPathOpen,
      diagramActionHybridToolsOpen,
      setDiagramActionHybridToolsOpen,
      diagramActionPlanOpen,
      setDiagramActionPlanOpen,
      diagramActionPlaybackOpen,
      setDiagramActionPlaybackOpen,
      diagramActionLayersOpen,
      setDiagramActionLayersOpen,
      diagramActionRobotMetaOpen,
      setDiagramActionRobotMetaOpen,
      robotMetaListOpen,
      setRobotMetaListOpen,
      setRobotMetaListSearch,
      diagramActionQualityOpen,
      setDiagramActionQualityOpen,
      diagramActionOverflowOpen,
      setDiagramActionOverflowOpen,
      toolbarMenuRef,
      toolbarMenuButtonRef,
      diagramActionBarRef,
      diagramPathPopoverRef,
      diagramHybridToolsPopoverRef,
      diagramPlanPopoverRef,
      diagramPlaybackPopoverRef,
      diagramLayersPopoverRef,
      diagramRobotMetaPopoverRef,
      diagramRobotMetaListRef,
      diagramQualityPopoverRef,
      diagramOverflowPopoverRef,
      hybridLayerOverlayRef,
      playbackOverlayClickGuardRef,
      logPlaybackDebug,
      toText,
    },
    actions: {
      setToolbarMenuOpen,
      setAttentionOpen,
      setQualityAutoFixOpen,
      setInsertBetweenOpen,
      setVersionsOpen,
      setDiffOpen,
      setCreateTemplateOpen,
      setTemplatesPickerOpen,
    },
  });
  const aiGenerateGate = useMemo(
    () => getAiGenerateGate({
      hasSession,
      tab,
      selectedElementId,
      isLocal,
      aiQuestionsBusy,
    }),
    [hasSession, tab, selectedElementId, isLocal, aiQuestionsBusy],
  );
  const canGenerateAiQuestions = aiGenerateGate.canGenerate;
  const selectedInsertBetween = readInsertBetweenCandidate(selectedBpmnElement?.insertBetween);
  const canInsertBetween =
    !!hasSession
    && tab === "diagram"
    && !!selectedInsertBetween
    && selectedInsertBetween.available !== false
    && !!selectedInsertBetween.fromId
    && !!selectedInsertBetween.toId;
  const {
    coverageNodes,
    coverageMatrix,
    coverageRowsAll,
    coverageRows,
    coverageById,
    coverageMinimapRows,
    coverageHints,
  } = useCoverageDerivation({ draft, qualityHintsRaw, isCoverageMode });
  const reportPathStopHints = useMemo(() => {
    const debug = asObject(draft?.interview?.report_build_debug);
    const stopReason = String(debug?.stop_reason || "").trim().toUpperCase();
    const stopNodeId = toNodeId(debug?.stop_at_bpmn_id);
    if (!stopNodeId || !stopReason || stopReason === "OK_COMPLETE") return [];
    return [{
      nodeId: stopNodeId,
      title: `Report path stopped here: ${stopReason}`,
      severity: "high",
      markerClass: "fpcReportStopMarker",
      aiHint: "!",
      reasons: [
        `path=${String(debug?.path_id_used || "—").trim() || "—"}`,
        `steps=${Number(debug?.steps_count || 0)}`,
      ],
    }];
  }, [draft?.interview?.report_build_debug]);
  const reportPathFlowConflictHints = useMemo(() => {
    const debug = asObject(draft?.interview?.report_build_debug);
    const stopReason = String(debug?.stop_reason || "").trim().toUpperCase();
    const stopNodeId = toNodeId(debug?.stop_at_bpmn_id);
    const activeSeq = String(debug?.path_id_used || "").trim();
    if (stopReason !== "FILTERED_OUT" || !stopNodeId || !activeSeq) return [];
    const nodePathMeta = asObject(asObject(draft?.bpmn_meta).node_path_meta);
    const outgoing = parseSequenceFlowsFromXml(draft?.bpmn_xml).filter((flow) => toNodeId(flow?.sourceId) === stopNodeId);
    if (!outgoing.length) return [];
    return outgoing.map((flow) => {
      const targetNodeId = toNodeId(flow?.targetId);
      const targetMeta = asObject(nodePathMeta[targetNodeId]);
      const targetSeq = String(targetMeta?.sequence_key || "").trim();
      const paths = asArray(targetMeta?.paths).map((item) => String(item || "").trim().toUpperCase());
      const hasMeta = !!targetNodeId && !!Object.keys(targetMeta).length;
      let kind = "MISS";
      if (hasMeta) kind = targetSeq === activeSeq ? "OK" : "OUT";
      const actionHint = kind === "OK"
        ? "action=ok"
        : (kind === "OUT"
          ? `action=move_target_sequence_to_${activeSeq}`
          : "action=assign_node_path_meta");
      return {
        elementIds: [String(flow?.id || "").trim()].filter(Boolean),
        title: `Path flow ${kind}: ${String(flow?.id || "").trim()}`,
        severity: kind === "OK" ? "low" : (kind === "OUT" ? "medium" : "high"),
        markerClass: kind === "OK"
          ? "fpcReportPathFlowOk"
          : (kind === "OUT" ? "fpcReportPathFlowOut" : "fpcReportPathFlowMiss"),
        aiHint: kind,
        reasons: [
          `active_seq=${activeSeq}`,
          `target=${targetNodeId || "—"}`,
          `target_seq=${targetSeq || "none"}`,
          `target_paths=${paths.join(",") || "none"}`,
          actionHint,
        ],
      };
    });
  }, [draft?.interview?.report_build_debug, draft?.bpmn_xml, draft?.bpmn_meta]);
  const diagramDodSnapshot = useMemo(() => {
    if (!hasSession) return null;
    try {
      return computeDodSnapshotFromDraft({
        draft,
        bpmnXml: draft?.bpmn_xml,
        qualityReport: lintResult,
      });
    } catch {
      return null;
    }
  }, [hasSession, draft, lintResult]);
  const dodReadinessV1 = useMemo(() => {
    if (!hasSession) return null;
    try {
      return buildDodReadinessV1({
        draft,
        dodSnapshot: diagramDodSnapshot,
        autoPassPrecheck,
        autoPassJobState,
        coverageMatrix,
        context: {
          orgId: workspaceActiveOrgId,
          workspaceId: activeProjectWorkspaceId,
          projectId: activeProjectId,
          sessionId: sid,
          folderId: draft?.folder_id || draft?.folderId || "",
        },
      });
    } catch {
      return null;
    }
  }, [
    hasSession,
    draft,
    diagramDodSnapshot,
    autoPassPrecheck,
    autoPassJobState,
    coverageMatrix,
    workspaceActiveOrgId,
    activeProjectWorkspaceId,
    activeProjectId,
    sid,
  ]);
  const qualityOverlayCatalog = useMemo(() => {
    const quality = asObject(diagramDodSnapshot?.quality);
    const bpmnNodesById = {};
    asArray(diagramDodSnapshot?.bpmn_nodes).forEach((nodeRaw) => {
      const node = asObject(nodeRaw);
      const nodeId = toNodeId(node?.id);
      if (!nodeId) return;
      bpmnNodesById[nodeId] = {
        id: nodeId,
        title: toText(node?.name || node?.title) || nodeId,
        type: toText(node?.type),
      };
    });
    const resolveItem = (nodeIdRaw, extra = {}) => {
      const nodeId = toNodeId(nodeIdRaw);
      if (!nodeId) return null;
      const fromBpmn = asObject(bpmnNodesById[nodeId]);
      const fromCoverage = asObject(coverageById[nodeId]);
      return {
        nodeId,
        title: toText(extra?.title || fromCoverage?.title || fromBpmn?.title || nodeId) || nodeId,
        type: toText(extra?.type || fromCoverage?.type || fromBpmn?.type),
        detail: toText(extra?.detail),
      };
    };
    const orphanItems = toArray(quality?.orphan_bpmn_nodes)
      .map((nodeId) => resolveItem(nodeId, { detail: "Недостижим от startEvent." }))
      .filter(Boolean);
    const deadEndItems = toArray(quality?.dead_end_bpmn_nodes)
      .map((nodeId) => resolveItem(nodeId, { detail: "Обрывает процесс (нет исходящего flow)." }))
      .filter(Boolean);
    const gatewayItems = toArray(quality?.gateway_unjoined)
      .map((nodeId) => resolveItem(nodeId, { detail: "Gateway split без join." }))
      .filter(Boolean);

    const linkItemsMap = {};
    toArray(quality?.link_integrity).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const integrity = toText(row?.integrity).toLowerCase();
      if (!(integrity === "error" || integrity === "warn")) return;
      const detail = toText(row?.details) || `Link integrity: ${integrity}`;
      const allIds = [...toArray(row?.throw_ids), ...toArray(row?.catch_ids)];
      allIds.forEach((nodeIdRaw) => {
        const item = resolveItem(nodeIdRaw, { detail });
        if (!item) return;
        if (linkItemsMap[item.nodeId]) return;
        linkItemsMap[item.nodeId] = item;
      });
    });
    const linkItems = Object.values(linkItemsMap);

    const missingDurationItems = coverageRowsAll
      .filter((row) => !!row?.missingDurationQuality)
      .map((row) => resolveItem(row?.id, {
        title: toText(row?.title || row?.id),
        type: toText(row?.type),
        detail: "Нет work/wait или duration/quality.",
      }))
      .filter(Boolean);

    const missingNotesItems = coverageRowsAll
      .filter((row) => !!row?.missingNotes)
      .map((row) => resolveItem(row?.id, {
        title: toText(row?.title || row?.id),
        type: toText(row?.type),
        detail: "Нет заметок по узлу.",
      }))
      .filter(Boolean);

    const debug = asObject(draft?.interview?.report_build_debug);
    const stopReason = toText(debug?.stop_reason).toUpperCase();
    const stopNodeId = toNodeId(debug?.stop_at_bpmn_id);
    const routeTruncatedItems = (!stopNodeId || !stopReason || stopReason === "OK_COMPLETE")
      ? []
      : toArray([
        resolveItem(stopNodeId, {
          detail: `${stopReason} · path=${toText(debug?.path_id_used) || "—"} · steps=${Number(debug?.steps_count || 0)}`,
        }),
      ]).filter(Boolean);

    return {
      orphan: { key: "orphan", label: "Orphan / Unreachable", items: orphanItems },
      dead_end: { key: "dead_end", label: "Dead-end", items: deadEndItems },
      gateway: { key: "gateway", label: "Gateway split without join", items: gatewayItems },
      link_errors: { key: "link_errors", label: "Link event errors", items: linkItems },
      missing_duration: { key: "missing_duration", label: "Missing durations", items: missingDurationItems },
      missing_notes: { key: "missing_notes", label: "Missing notes", items: missingNotesItems },
      route_truncated: { key: "route_truncated", label: "Route truncated", items: routeTruncatedItems },
    };
  }, [diagramDodSnapshot, coverageById, coverageRowsAll, draft?.interview?.report_build_debug]);
  const pathHighlightHints = useMemo(() => {
    if (!pathHighlightEnabled) return [];
    const tier = normalizePathTier(pathHighlightTier);
    if (!tier) return [];
    const sequenceKey = normalizePathSequenceKey(pathHighlightSequenceKey);
    const hints = [];
    Object.values(nodePathMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const nodeId = toNodeId(entry?.nodeId || entryRaw?.nodeId);
      if (!nodeId) return;
      const paths = asArray(entry?.paths).map((item) => normalizePathTier(item));
      if (!paths.includes(tier)) return;
      const nodeSeq = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      if (sequenceKey && nodeSeq && nodeSeq !== sequenceKey) return;
      hints.push({
        nodeId,
        title: `Path ${tier}${sequenceKey ? ` · ${sequenceKey}` : ""}`,
        markerClass: "fpcPathHighlightNode",
        severity: "low",
        hideTag: true,
      });
    });
    Object.values(flowTierMetaMap).forEach((entryRaw) => {
      const entry = asObject(entryRaw);
      const flowId = toText(entry?.flowId || entryRaw?.flowId);
      if (!flowId) return;
      if (normalizePathTier(entry?.tier) !== tier) return;
      const flowSeq = normalizePathSequenceKey(entry?.sequenceKey || entry?.sequence_key);
      if (sequenceKey && flowSeq && flowSeq !== sequenceKey) return;
      hints.push({
        elementIds: [flowId],
        title: `Path flow ${tier}`,
        markerClass: "fpcPathHighlightFlow",
        severity: "low",
        hideTag: true,
      });
    });
    return dedupeDiagramHints(hints);
  }, [pathHighlightEnabled, pathHighlightTier, pathHighlightSequenceKey, nodePathMetaMap, flowTierMetaMap]);
  const qualityOverlayHints = useMemo(() => {
    const markerByKey = {
      orphan: "fpcQualityProblem",
      dead_end: "fpcQualityProblem",
      gateway: "fpcQualityProblem",
      link_errors: "fpcQualityProblem",
      missing_duration: "fpcCoverageRisk",
      missing_notes: "fpcCoverageWarn",
      route_truncated: "fpcReportStopMarker",
    };
    const hints = [];
    Object.entries(asObject(qualityOverlayFilters)).forEach(([key, enabled]) => {
      if (!enabled) return;
      const category = asObject(qualityOverlayCatalog[key]);
      const markerClass = toText(markerByKey[key] || "fpcQualityProblem");
      toArray(category?.items).forEach((itemRaw) => {
        const item = asObject(itemRaw);
        const nodeId = toNodeId(item?.nodeId);
        if (!nodeId) return;
        hints.push({
          nodeId,
          title: toText(item?.title || nodeId),
          reasons: toArray([toText(item?.detail)]).filter(Boolean),
          markerClass,
          severity: key === "route_truncated" ? "high" : "medium",
          hideTag: key !== "route_truncated",
          aiHint: key === "route_truncated" ? "!" : "",
        });
      });
    });
    return dedupeDiagramHints(hints);
  }, [qualityOverlayFilters, qualityOverlayCatalog]);
  const diagramHints = useMemo(() => {
    const base = isQualityMode ? qualityHints : (isCoverageMode ? coverageHints : []);
    return dedupeDiagramHints([
      ...asArray(base),
      ...asArray(customAttentionHints),
      ...asArray(pathHighlightHints),
      ...asArray(qualityOverlayHints),
      ...asArray(reportPathStopHints),
      ...asArray(reportPathFlowConflictHints),
    ]);
  }, [
    isQualityMode,
    isCoverageMode,
    qualityHints,
    coverageHints,
    customAttentionHints,
    pathHighlightHints,
    qualityOverlayHints,
    reportPathStopHints,
    reportPathFlowConflictHints,
  ]);
  const qualityNodeTitleById = useMemo(() => {
    const map = {};
    asArray(coverageNodes).forEach((node) => {
      const id = toNodeId(node?.id);
      if (!id || map[id]) return;
      const title = String(node?.title || node?.name || "").trim();
      if (title) map[id] = title;
    });
    asArray(draft?.interview?.steps).forEach((step) => {
      const id = toNodeId(step?.node_id || step?.nodeId);
      if (!id || map[id]) return;
      const title = String(step?.action || step?.title || step?.name || "").trim();
      if (title) map[id] = title;
    });
    asArray(qualityHintsRaw).forEach((issue) => {
      const id = toNodeId(issue?.nodeId);
      if (!id || map[id]) return;
      const title = String(issue?.title || "").trim();
      if (title && title !== id) map[id] = title;
    });
    return map;
  }, [coverageNodes, draft?.interview?.steps, qualityHintsRaw]);
  const coverageNodeMetaById = useMemo(() => {
    const map = {};
    asArray(coverageNodes).forEach((node) => {
      const id = toNodeId(node?.id);
      if (!id) return;
      map[id] = {
        id,
        title: String(node?.title || node?.name || id).trim() || id,
        lane: String(node?.actor_role || node?.laneName || node?.lane || "").trim(),
        type: String(node?.type || "").trim(),
      };
    });
    return map;
  }, [coverageNodes]);
  const qualityReasonsByNode = useMemo(() => {
    const map = {};
    asArray(qualityHintsRaw).forEach((issue) => {
      const nodeId = toNodeId(issue?.nodeId);
      if (!nodeId) return;
      const nodeTitle = String(
        qualityNodeTitleById[nodeId]
        || coverageById[nodeId]?.title
        || issue?.title
        || nodeId,
      ).trim();
      const ui = qualityIssueCopy(issue, nodeTitle);
      const reason = {
        id: `quality:${ui.ruleId}`,
        kind: "quality",
        text: `Ошибка качества: ${ui.short}`,
        detail: ui.fix,
      };
      if (!Array.isArray(map[nodeId])) map[nodeId] = [];
      if (!map[nodeId].some((it) => String(it?.id || "") === reason.id)) {
        map[nodeId].push(reason);
      }
    });
    return map;
  }, [qualityHintsRaw, qualityNodeTitleById, coverageById]);
  const attentionItemsRaw = useMemo(() => {
    const byNode = {};
    const ensureItem = (nodeId) => {
      const id = toNodeId(nodeId);
      if (!id) return null;
      if (!byNode[id]) {
        const row = coverageById[id];
        const meta = coverageNodeMetaById[id] || {};
        byNode[id] = {
          id,
          title: String(row?.title || meta?.title || qualityNodeTitleById[id] || id).trim() || id,
          lane: String(row?.lane || meta?.lane || "").trim(),
          type: String(row?.type || meta?.type || "").trim(),
          reasons: [],
          hasQuality: false,
          hasAiMissing: false,
          hasNotesMissing: false,
          hasDodMissing: false,
          priority: Number(row?.score || 0),
        };
      }
      return byNode[id];
    };

    coverageRowsAll.forEach((row) => {
      const item = ensureItem(row?.id);
      if (!item) return;
      const dodMissingCount = Number(!!row?.missingNotes) + Number(!!row?.missingAiQuestions) + Number(!!row?.missingDurationQuality);
      if (row?.missingAiQuestions) {
        item.hasAiMissing = true;
        item.reasons.push({ id: "ai_missing", kind: "ai", text: "Нет AI-вопросов" });
      }
      if (row?.missingNotes) {
        item.hasNotesMissing = true;
        item.reasons.push({ id: "notes_missing", kind: "notes", text: "Нет заметок" });
      }
      if (dodMissingCount > 0) {
        item.hasDodMissing = true;
        item.reasons.push({ id: "dod_missing", kind: "dod", text: `DoD: missing ${dodMissingCount}` });
      }
    });

    Object.entries(qualityReasonsByNode).forEach(([nodeId, reasons]) => {
      const item = ensureItem(nodeId);
      if (!item) return;
      item.hasQuality = true;
      item.priority = Math.max(item.priority, 10);
      asArray(reasons).forEach((reason) => {
        if (!item.reasons.some((it) => String(it?.id || "") === String(reason?.id || ""))) {
          item.reasons.push(reason);
        }
      });
    });

    return Object.values(byNode)
      .map((item) => ({
        ...item,
        reasons: asArray(item?.reasons).slice(0, 3),
      }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => {
        const qualityDelta = Number(!!b.hasQuality) - Number(!!a.hasQuality);
        if (qualityDelta !== 0) return qualityDelta;
        const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDelta !== 0) return priorityDelta;
        return String(a.title || "").localeCompare(String(b.title || ""), "ru");
      });
  }, [coverageRowsAll, coverageById, coverageNodeMetaById, qualityNodeTitleById, qualityReasonsByNode]);
  const attentionFilterKinds = useMemo(
    () => Object.entries(attentionFilters || {})
      .filter(([, enabled]) => !!enabled)
      .map(([kind]) => String(kind || "").trim()),
    [attentionFilters],
  );
  const attentionItems = useMemo(() => {
    if (!attentionFilterKinds.length) return attentionItemsRaw;
    return attentionItemsRaw.filter((item) => attentionFilterKinds.some((kind) => {
      if (kind === "quality") return !!item?.hasQuality;
      if (kind === "ai") return !!item?.hasAiMissing;
      if (kind === "notes") return !!item?.hasNotesMissing;
      return false;
    }));
  }, [attentionItemsRaw, attentionFilterKinds]);
  const qualityOverlayRows = useMemo(
    () => ([
      "orphan",
      "dead_end",
      "gateway",
      "link_errors",
      "missing_duration",
      "missing_notes",
      "route_truncated",
    ]).map((key) => {
      const category = asObject(qualityOverlayCatalog[key]);
      return {
        key,
        label: toText(category?.label || key) || key,
        count: Number(toArray(category?.items).length || 0),
        items: toArray(category?.items),
      };
    }),
    [qualityOverlayCatalog],
  );
  const activeQualityOverlayCount = useMemo(
    () => Object.values(asObject(qualityOverlayFilters)).filter(Boolean).length,
    [qualityOverlayFilters],
  );
  const qualityOverlayListItems = useMemo(() => {
    const listKey = toText(qualityOverlayListKey);
    if (!listKey) return [];
    const row = qualityOverlayRows.find((item) => item.key === listKey);
    const all = toArray(row?.items);
    if (!all.length) return [];
    const query = toText(qualityOverlaySearch).toLowerCase();
    const filtered = query
      ? all.filter((itemRaw) => {
        const item = asObject(itemRaw);
        return [
          toText(item?.title),
          toText(item?.nodeId),
          toText(item?.type),
          toText(item?.detail),
        ].some((part) => part.toLowerCase().includes(query));
      })
      : all;
    return filtered.slice(0, 200);
  }, [qualityOverlayRows, qualityOverlayListKey, qualityOverlaySearch]);
  const pathHighlightBadge = useMemo(() => {
    const tier = normalizePathTier(pathHighlightTier);
    if (!tier) return "Путь: —";
    const seq = normalizePathSequenceKey(pathHighlightSequenceKey);
    return seq ? `${tier} · ${seq}` : tier;
  }, [pathHighlightTier, pathHighlightSequenceKey]);
  const snapshotProjectId = String(draft?.project_id || draft?.projectId || activeProjectId || "").trim();
  const revisionListFromBridge = useMemo(
    () => asArray(sessionRevisionHistorySnapshot?.revisions),
    [sessionRevisionHistorySnapshot?.revisions],
  );
  const previewSnapshot = useMemo(
    () => asArray(versionsList).find((item) => String(item?.id || "") === String(previewSnapshotId || "")) || null,
    [versionsList, previewSnapshotId],
  );

  function formatSnapshotTs(ts) {
    const n = Number(ts || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    try {
      return new Date(n).toLocaleString("ru-RU");
    } catch {
      return String(n);
    }
  }

  function defaultCheckpointLabel(ts) {
    return `Checkpoint ${formatSnapshotTs(ts || Date.now())}`;
  }

  function snapshotLabel(item) {
    const explicit = String(item?.label || "").trim();
    if (explicit) return explicit;
    const comment = String(item?.comment || "").trim();
    if (comment) return comment;
    const revisionNumber = Number(item?.revisionNumber || item?.rev || 0);
    if (revisionNumber > 0) return `Revision r${revisionNumber}`;
    if (item?.pinned) return defaultCheckpointLabel(item?.ts);
    return "Без названия";
  }

  const semanticDiffView = useMemo(() => {
    return buildRevisionDiffView({
      revisions: asArray(versionsList),
      baseRevisionId: diffBaseSnapshotId,
      targetRevisionId: diffTargetSnapshotId,
    });
  }, [diffBaseSnapshotId, diffTargetSnapshotId, versionsList]);

  const refreshSnapshotVersions = useCallback(async () => {
    if (!sid) {
      setVersionsList([]);
      setPreviewSnapshotId("");
      return;
    }
    const list = revisionListFromBridge;
    // eslint-disable-next-line no-console
    console.debug(
      `UI_VERSIONS_LOAD sid=${sid} key="${snapshotScopeKey(snapshotProjectId, sid)}" count=${asArray(list).length}`,
    );
    setVersionsList(asArray(list));
    setPreviewSnapshotId((prev) => {
      const exists = asArray(list).some((item) => String(item?.id || "") === String(prev || ""));
      if (exists) return prev;
      return asArray(list)[0]?.id || "";
    });
  }, [revisionListFromBridge, sid, snapshotProjectId]);

  async function openVersionsModal() {
    setVersionsOpen(true);
    setVersionsBusy(true);
    try {
      await refreshSnapshotVersions();
    } finally {
      setVersionsBusy(false);
    }
  }

  async function restoreSnapshot(item) {
    const xml = String(item?.xml || "");
    if (!xml.trim()) {
      setGenErr("В выбранной версии нет XML.");
      return;
    }
    if (typeof persistSessionCompanion !== "function") return;
    setVersionsBusy(true);
    setGenErr("");
    setInfoMsg("");
    setDrawioAnchorImportDiagnostics(null);
    try {
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_CLICK sid=${sid} action=restore key="${snapshotScopeKey(snapshotProjectId, sid)}" `
        + `hash=${fnv1aHex(xml)} len=${xml.length}`,
      );
      const imported = await bpmnSync.importXml(xml);
      if (!imported?.ok) {
        setGenErr(shortErr(imported?.error || "Не удалось восстановить версию."));
        return;
      }
      const restoreTransition = buildRevisionRestoreTransition(sessionCompanionMetaLive, {
        revisionId: String(item?.id || ""),
        draft,
        liveVersionRaw: sessionVersionReadSnapshot,
        author: {
          id: user?.id,
          name: user?.name || user?.username || user?.email || "",
          email: user?.email || "",
        },
        comment: `Restore r${Number(item?.revisionNumber || item?.rev || 0)}`,
        source: "restore_revision",
      });
      if (!restoreTransition?.ok) {
        setGenErr(shortErr(restoreTransition?.error || "Не удалось зафиксировать восстановление ревизии."));
        return;
      }
      const restored = await persistSessionCompanion(restoreTransition.nextCompanion, {
        source: "restore_revision_session_companion",
      });
      // eslint-disable-next-line no-console
      console.debug(
        `UI_SNAPSHOT_RESULT sid=${sid} action=restore ok=${restored?.ok ? 1 : 0} saved=${restored?.saved ? 1 : 0} `
        + `reason=${String(restored?.decisionReason || restored?.error || "-")} key="${snapshotScopeKey(snapshotProjectId, sid)}"`,
      );
      if (!restored?.ok) {
        setGenErr(shortErr(restored?.error || "Не удалось сохранить цепочку ревизий после восстановления."));
        return;
      }
      setTab("diagram");
      await Promise.resolve(bpmnRef.current?.fit?.());
      setInfoMsg(
        `Ревизия r${Number(item?.revisionNumber || item?.rev || 0)} восстановлена как новая latest `
        + `r${Number(restoreTransition?.revisionNumber || 0)}.`,
      );
      await refreshSnapshotVersions();
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось восстановить версию."));
    } finally {
      setVersionsBusy(false);
    }
  }

  async function clearSnapshotHistory() {
    setGenErr("");
    setInfoMsg("История ревизий immutable и не может быть очищена.");
  }

  async function updateSnapshotMeta(item, patch = {}) {
    void item;
    void patch;
    setGenErr("");
    setInfoMsg("Редактирование ревизии отключено: immutable ledger.");
  }

  async function togglePinSnapshot(item) {
    void item;
    setInfoMsg("Pin/Unpin отключён: ревизии immutable.");
  }

  async function editSnapshotLabel(item) {
    void item;
    setInfoMsg("Изменение label отключено: ревизии immutable.");
  }

  function openDiffForSnapshot(item) {
    const targetId = String(item?.id || "").trim();
    if (!targetId) return;
    const list = asArray(versionsList);
    const idx = list.findIndex((candidate) => String(candidate?.id || "") === targetId);
    const latestId = String(list[0]?.id || "");
    const previousId = idx >= 0 ? String(list[idx + 1]?.id || "") : "";
    let baseId = previousId || (latestId !== targetId ? latestId : String(list[1]?.id || ""));
    if (!baseId || baseId === targetId) {
      setGenErr("Для diff нужно минимум две разные версии.");
      return;
    }
    setDiffBaseSnapshotId(baseId);
    setDiffTargetSnapshotId(targetId);
    setDiffOpen(true);
  }

  function pushCommandHistory(commandText) {
    const text = String(commandText || "").trim();
    if (!text || !sid) return;
    const next = [
      { text, ts: Date.now() },
      ...commandHistory.filter((item) => String(item?.text || "").trim() && String(item?.text || "").trim() !== text),
    ].slice(0, COMMAND_HISTORY_LIMIT);
    setCommandHistory(next);
    writeCommandHistory(sid, next);
  }

  async function runAiCommand(commandText) {
    const text = String(commandText || "").trim();
    if (!text || !sid) return;
    if (tab !== "diagram") {
      setCommandStatus({ kind: "error", text: "Командный режим доступен только во вкладке Diagram." });
      return;
    }

    setCommandBusy(true);
    setCommandStatus({ kind: "loading", text: "AI работает…" });
    setGenErr("");

    try {
      const parsed = await parseCommandToOps({
        command: text,
        context: {
          selectedElementId,
          selectedElementName,
          selectedElementType,
          selectedElementLaneName,
        },
      });

      if (!parsed?.ok || !asArray(parsed?.ops).length) {
        const reason = shortErr(parsed?.error || "Не удалось распознать команду.");
        setCommandStatus({ kind: "error", text: reason || "Не удалось распознать команду." });
        logAiOpsTrace("parse_fail", {
          sid,
          command: text,
          reason: parsed?.error || "parse_failed",
        });
        return;
      }

      const applyResult = await Promise.resolve(
        bpmnRef.current?.applyCommandOps?.({
          ops: parsed.ops,
          command: text,
          selectedElementId,
        }),
      );

      const applied = Number(applyResult?.applied || 0);
      const failed = Number(applyResult?.failed || 0);
      const changedIds = asArray(applyResult?.changedIds).filter(Boolean);

      logAiOpsTrace("apply", {
        sid,
        source: parsed?.source || "rule",
        command: text,
        ops: JSON.stringify(parsed?.ops || []),
        applied,
        failed,
        changedIds: `[${changedIds.join(",")}]`,
      });

      if (!applyResult?.ok && applied <= 0) {
        setCommandStatus({
          kind: "error",
          text: shortErr(applyResult?.error || "Команда не применена."),
        });
        return;
      }

      pushCommandHistory(text);
      setCommandInput("");
      setCommandStatus({
        kind: failed > 0 ? "warn" : "ok",
        text: `Сделано: ${applied} опер. Изменено элементов: ${changedIds.length}.${failed > 0 ? ` Ошибок: ${failed}.` : ""}`,
      });
    } catch (error) {
      setCommandStatus({
        kind: "error",
        text: shortErr(error?.message || error || "Не удалось выполнить команду."),
      });
      logAiOpsTrace("exception", {
        sid,
        command: text,
        error: shortErr(error?.message || error || "unknown"),
      });
    } finally {
      setCommandBusy(false);
    }
  }

  function downloadSnapshot(item) {
    const xml = String(item?.xml || "");
    if (!xml.trim()) return;
    const base = String(draft?.title || sid || "process")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "process";
    const stamp = new Date(Number(item?.ts || Date.now()) || Date.now()).toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${base}_snapshot_${stamp}.bpmn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  function focusQualityIssue(issue) {
    const nodeId = toNodeId(issue?.nodeId || issue?.id || issue?.elementId);
    if (!nodeId) return;
    const key = `${nodeId}::${String(asArray(issue?.reasons).join("|"))}`;
    const nodeTitle = String(
      qualityNodeTitleById[nodeId]
      || coverageById[nodeId]?.title
      || issue?.title
      || "",
    ).trim();
    const copy = qualityIssueCopy(issue, nodeTitle);
    setQualityIssueFocusKey(key);
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Показано" });
    }, 160);
    setInfoMsg(`Качество: ${copy.short}`);
    setGenErr("");
  }

  function confirmExportWithQualityGate(target = "bpmn") {
    const errorCount = Number(qualitySummary?.errors || 0);
    if (errorCount <= 0) return true;
    const message = [
      `Обнаружены критичные проблемы качества: ${errorCount}.`,
      "Рекомендуется сначала исправить их в режиме «Качество».",
      `Продолжить экспорт ${target.toUpperCase()}?`,
    ].join("\n");
    // eslint-disable-next-line no-console
    console.debug(`[LINT] export_gate target=${target} errors=${errorCount} warns=${Number(qualitySummary?.warns || 0)}`);
    return window.confirm(message);
  }

  async function applyQualityAutoFix() {
    const ops = asArray(qualityAutoFixPreview?.ops);
    if (!ops.length) {
      setInfoMsg("Safe auto-fix недоступен для текущих проблем.");
      setQualityAutoFixOpen(false);
      return;
    }
    setQualityAutoFixBusy(true);
    setGenErr("");
    setInfoMsg("");
    // eslint-disable-next-line no-console
    console.debug(
      `[AUTOFIX] preview sid=${sid || "-"} profile=${qualityProfile?.id || qualityProfileId} `
      + `safe=${Number(qualityAutoFixPreview?.safeFixes || 0)} ops=${ops.length}`,
    );
    try {
      const result = await Promise.resolve(
        bpmnRef.current?.applyCommandOps?.({
          ops,
          command: "lint_autofix",
          selectedElementId: "",
        }),
      );
      const applied = Number(result?.applied || 0);
      const failed = Number(result?.failed || 0);
      // eslint-disable-next-line no-console
      console.debug(
        `[AUTOFIX] applied sid=${sid || "-"} applied=${applied} failed=${failed} changedIds=${asArray(result?.changedIds).length}`,
      );
      if (!result?.ok && applied <= 0) {
        setGenErr(shortErr(result?.error || "Автоисправление не выполнено."));
        return;
      }
      const flush = await bpmnSync.flushFromActiveTab("diagram", {
        force: true,
        source: "lint_autofix",
        reason: "lint_autofix",
      });
      if (!flush?.ok) {
        setGenErr(shortErr(flush?.error || "Не удалось сохранить BPMN после автоисправления."));
        return;
      }
      setInfoMsg(
        `Автоисправление: ${applied} опер.${failed > 0 ? ` Ошибок: ${failed}.` : ""} `
        + "Черновик обновлён; для новой ревизии используйте Save.",
      );
      setQualityAutoFixOpen(false);
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Автоисправление не выполнено."));
    } finally {
      setQualityAutoFixBusy(false);
    }
  }

  function toggleRobotMetaOverlayFilter(keyRaw) {
    const key = toText(keyRaw).toLowerCase();
    if (key !== "ready" && key !== "incomplete") return;
    setRobotMetaOverlayFilters((prev) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
    setRobotMetaOverlayEnabled(true);
  }

  function showRobotMetaOverlay() {
    setRobotMetaOverlayEnabled(true);
    setRobotMetaOverlayFilters((prev) => {
      const next = {
        ready: !!prev?.ready,
        incomplete: !!prev?.incomplete,
      };
      if (!next.ready && !next.incomplete) {
        return { ready: true, incomplete: true };
      }
      return next;
    });
  }

  function resetRobotMetaOverlay() {
    setRobotMetaOverlayEnabled(false);
    setRobotMetaOverlayFilters({ ready: true, incomplete: true });
    setRobotMetaListOpen(false);
    setRobotMetaListSearch("");
    setRobotMetaListTab("ready");
  }

  function focusRobotMetaItem(itemRaw, source = "robot_meta_list") {
    const item = asObject(itemRaw);
    const nodeId = toNodeId(item?.nodeId || item?.id);
    if (!nodeId) return;
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 3000,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Robot Meta" });
    }, 120);
    const title = toText(item?.title || robotMetaNodeCatalogById?.[nodeId]?.title || nodeId) || nodeId;
    onOpenElementNotes?.({
      id: nodeId,
      name: title,
      type: toText(item?.type || robotMetaNodeCatalogById?.[nodeId]?.type),
    }, "header_open_notes");
    setInfoMsg(`Robot Meta: ${title}`);
    setGenErr("");
    if (source === "robot_meta_list" && tab !== "diagram") {
      setTab("diagram");
    }
  }

  function focusCoverageIssue(item, source = "coverage_panel") {
    const nodeId = toNodeId(item?.id || item?.nodeId);
    if (!nodeId) return;
    requestDiagramFocus(nodeId, {
      markerClass: "fpcAttentionJumpFocus",
      durationMs: 6200,
      targetZoom: 0.92,
      clearExistingSelection: true,
    });
    window.setTimeout(() => {
      bpmnRef.current?.flashNode?.(nodeId, "accent", { label: "Показано" });
    }, 160);
    const title = String(item?.title || nodeId).trim();
    onOpenElementNotes?.({
      id: nodeId,
      name: title,
      type: String(item?.type || "").trim(),
    }, "header_open_notes");
    setInfoMsg(`Покрытие: ${title}`);
    setGenErr("");
    if (source === "notes_panel_event") {
      setTab("diagram");
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onOpenCoverage = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      applyDiagramMode("coverage");
      if (tab !== "diagram") setTab("diagram");
      const focusId = toNodeId(detail?.focusElementId);
      if (!focusId) return;
      const row = coverageById[focusId] || { id: focusId, title: focusId, type: "" };
      focusCoverageIssue(row, "notes_panel_event");
    };
    window.addEventListener(NOTES_COVERAGE_OPEN_EVENT, onOpenCoverage);
    return () => {
      window.removeEventListener(NOTES_COVERAGE_OPEN_EVENT, onOpenCoverage);
    };
  }, [tab, setTab, coverageById, applyDiagramMode]);

  const generateAiQuestionsForSelectedElement = useCallback(async () => {
    if (!canGenerateAiQuestions) {
      const reason = shortErr(aiGenerateGate.reasonText || "Генерация сейчас недоступна.");
      if (reason) setGenErr(reason);
      return;
    }

    setAiQuestionsBusy(true);
    setAiQuestionsStatus({ kind: "pending", text: "AI работает..." });
    setGenErr("");
    setInfoMsg("");
    try {
      let timeoutHandle = null;
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      if (controller) {
        timeoutHandle = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // noop
          }
        }, AI_QUESTIONS_TIMEOUT_MS);
      }
      const aiRes = await apiAiQuestions(
        sid,
        {
          mode: "node_step",
          node_id: selectedElementId,
          limit: 5,
        },
        { signal: controller?.signal },
      );
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (!aiRes || typeof aiRes !== "object") {
        const errText = "Не удалось получить ответ генератора.";
        setAiQuestionsStatus({ kind: "error", text: errText });
        setGenErr(errText);
        return;
      }
      if (!aiRes?.ok) {
        const aborted = !!aiRes?.aborted || String(aiRes?.error_name || "").toLowerCase() === "aborterror";
        const errText = aborted
          ? `Таймаут генерации (${Math.round(AI_QUESTIONS_TIMEOUT_MS / 1000)}с). Попробуйте ещё раз.`
          : shortErr(aiRes?.error || "Не удалось сгенерировать AI-вопросы.");
        setAiQuestionsStatus({ kind: "error", text: errText });
        setGenErr(errText);
        return;
      }
      const payloadRaw = aiRes.result && typeof aiRes.result === "object" ? aiRes.result : {};
      const payload = withInjectedAiQuestionsPayload(payloadRaw, {
        selectedElementId,
        draftInterview: draft?.interview,
      });
      const payloadInterview = asObject(payload?.interview);
      const payloadAiMap = asObject(payloadInterview?.ai_questions_by_element || payloadInterview?.aiQuestionsByElementId);
      if (String(payload?.error || "").trim()) {
        const errText = shortErr(payload.error);
        setAiQuestionsStatus({ kind: "error", text: errText });
        setGenErr(errText);
        return;
      }
      onSessionSync?.({
        ...payload,
        _sync_source: "diagram_ai_questions_generate",
      });
      if (Object.keys(payloadAiMap).length) {
        handleAiQuestionsByElementChange(payloadAiMap, {
          source: "diagram_ai_questions_generate",
          elementId: selectedElementId,
        });
      }
      applyClarifyFromSession(payload, draft?.nodes);
      const step = payload?.llm_step && typeof payload.llm_step === "object" ? payload.llm_step : {};
      const generated = Number(step?.generated || 0);
      const reused = !!step?.reused || generated <= 0;
      const msg = reused
        ? "AI-вопросы актуальны: новые не требуются."
        : `AI-вопросы обновлены: +${generated}.`;
      bpmnRef.current?.flashNode?.(selectedElementId, "ai", { label: "AI added" });
      bpmnRef.current?.flashBadge?.(selectedElementId, "ai");
      setAiQuestionsStatus({ kind: reused ? "warn" : "ok", text: msg });
      setInfoMsg(msg);
      onOpenElementNotes?.({
        id: selectedElementId,
        name: selectedElementName || selectedElementId,
        type: selectedElementType,
      }, "header_open_notes");
    } catch (error) {
      const errText = shortErr(error?.message || error || "Не удалось сгенерировать AI-вопросы.");
      setAiQuestionsStatus({ kind: "error", text: errText });
      setGenErr(errText);
    } finally {
      setAiQuestionsBusy(false);
    }
  }, [
    canGenerateAiQuestions,
    aiGenerateGate.reasonText,
    sid,
    selectedElementId,
    onSessionSync,
    handleAiQuestionsByElementChange,
    applyClarifyFromSession,
    draft?.interview,
    draft?.nodes,
    selectedElementName,
    selectedElementType,
    onOpenElementNotes,
  ]);

  function handleBpmnSelectionChange(payload) {
    const selected = payload && typeof payload === "object" ? payload : null;
    onBpmnElementSelect?.(selected);
    const source = String(selected?.source || "").toLowerCase();
    if (!selected?.id) return;
    if (source.includes("ai_badge_click") || source.includes("ai_indicator_click")) {
      onOpenElementNotes?.(selected, "header_open_ai");
      return;
    }
    if (source.includes("notes_badge_click")) {
      onOpenElementNotes?.(selected, "header_open_notes");
    }
  }

  function openInsertBetweenModal() {
    if (!hasSession || tab !== "diagram") {
      setGenErr("Операция доступна только во вкладке Diagram.");
      return;
    }
    const candidate = readInsertBetweenCandidate(selectedBpmnElement?.insertBetween);
    if (!candidate) {
      setGenErr("Выберите стрелку BPMN или пару связанных шагов A→B.");
      return;
    }
    if (candidate.available === false) {
      setGenErr(insertBetweenErrorMessage(candidate.error));
      return;
    }
    setGenErr("");
    setInfoMsg("");
    setInsertBetweenDraft(candidate);
    setInsertBetweenName("");
    setInsertBetweenOpen(true);
  }

  async function applyInsertBetweenFromDiagram() {
    const candidate = readInsertBetweenCandidate(insertBetweenDraft);
    if (!candidate || !candidate.fromId || !candidate.toId) {
      setGenErr("Не удалось определить связь для вставки.");
      return;
    }
    const newTaskName = String(insertBetweenName || "").trim();
    if (!newTaskName) {
      setGenErr("Введите название нового шага.");
      return;
    }

    setInsertBetweenBusy(true);
    setGenErr("");
    setInfoMsg("");
    try {
      const result = await Promise.resolve(
        bpmnRef.current?.applyCommandOps?.({
          command: `insert_between:${candidate.fromId}->${candidate.toId}`,
          selectedElementId: candidate.flowId || candidate.fromId,
          ops: [
            {
              type: "insertBetween",
              fromId: candidate.fromId,
              toId: candidate.toId,
              flowId: candidate.flowId,
              newTaskName,
              laneId: candidate.laneId,
              when: candidate.when,
              whenPolicy: "to_first",
            },
          ],
        }),
      );
      if (!result?.ok && Number(result?.applied || 0) <= 0) {
        const opError = String(result?.results?.[0]?.error || result?.error || "").trim();
        setGenErr(insertBetweenErrorMessage(opError));
        return;
      }
      setInsertBetweenOpen(false);
      setInsertBetweenName("");
      setInsertBetweenDraft(null);
      const changedIds = asArray(result?.changedIds).map((x) => String(x || "").trim()).filter(Boolean);
      if (changedIds.length) {
        changedIds.slice(0, 3).forEach((id, idx) => {
          bpmnRef.current?.flashNode?.(id, "flow", {
            label: idx === 0 ? "Branch added" : "",
          });
        });
      } else {
        bpmnRef.current?.flashNode?.(candidate.fromId, "flow", { label: "Branch added" });
      }
      setInfoMsg(`Шаг "${newTaskName}" вставлен между ${candidate.fromId} и ${candidate.toId}.`);
    } catch (error) {
      setGenErr(shortErr(error?.message || error || "Не удалось вставить шаг между."));
    } finally {
      setInsertBetweenBusy(false);
    }
  }

  const runNotesBatchOps = useCallback(async (detail = {}) => {
    const requestSid = String(detail?.sid || "").trim();
    if (!requestSid || requestSid !== String(sid || "")) {
      return { ok: false, error: "wrong_session" };
    }
    const ops = asArray(detail?.ops);
    if (!ops.length) {
      return { ok: false, error: "empty_ops" };
    }

    if (tab !== "diagram") {
      await switchTab("diagram");
    }

    try {
      await Promise.resolve(bpmnRef.current?.whenReady?.({
        timeoutMs: 4000,
        expectedSid: requestSid,
      }));
    } catch {
    }

    const result = await Promise.resolve(
      bpmnRef.current?.applyCommandOps?.({
        ops,
        command: String(detail?.commandText || "batch_notes"),
        selectedElementId: "",
      }),
    );
    const applied = Number(result?.applied || 0);
    const failed = Number(result?.failed || 0);
    if (!result?.ok && applied <= 0) {
      return {
        ok: false,
        applied,
        failed,
        error: String(result?.error || result?.results?.[0]?.error || "apply_failed"),
      };
    }
    setInfoMsg(`Batch: применено ${applied} опер.${failed > 0 ? ` Ошибок: ${failed}.` : ""}`);
    logAiOpsTrace("batch_apply", {
      sid: requestSid,
      applied,
      failed,
      source: String(detail?.source || "notes_batch"),
      ops: ops.length,
    });
    return {
      ok: true,
      applied,
      failed,
      changedIds: asArray(result?.changedIds),
    };
  }, [sid, tab, switchTab]);

  useEffect(() => {
    const notice = snapshotRestoreNotice && typeof snapshotRestoreNotice === "object" ? snapshotRestoreNotice : null;
    if (!notice) return;
    if (String(notice.sid || "") !== String(sid || "")) return;
    setInfoMsg(`Восстановлено из локальной истории (${formatSnapshotTs(notice.ts)}).`);
    onSnapshotRestoreNoticeConsumed?.(sid, Number(notice?.nonce || 0));
  }, [sid, snapshotRestoreNotice, onSnapshotRestoreNoticeConsumed]);

  useEffect(() => {
    if (!versionsOpen || !sid) return;
    void refreshSnapshotVersions();
  }, [versionsOpen, sid, draft?.bpmn_xml_version, draft?.version, refreshSnapshotVersions]);

  useEffect(() => {
    if (!diffOpen) return;
    const ids = new Set(asArray(versionsList).map((item) => String(item?.id || "")));
    if (!ids.has(String(diffTargetSnapshotId || ""))) {
      setDiffTargetSnapshotId(String(asArray(versionsList)[0]?.id || ""));
    }
    if (!ids.has(String(diffBaseSnapshotId || ""))) {
      setDiffBaseSnapshotId(String(asArray(versionsList)[1]?.id || asArray(versionsList)[0]?.id || ""));
    }
  }, [diffOpen, versionsList, diffBaseSnapshotId, diffTargetSnapshotId]);

  useEffect(() => {
    writeCommandMode(commandModeEnabled);
  }, [commandModeEnabled]);

  useEffect(() => {
    writeDiagramMode(diagramMode);
    writeQualityMode(diagramMode === "quality");
    writeAiQuestionsMode(diagramMode === "interview");
  }, [diagramMode]);

  useEffect(() => {
    writeQualityProfile(qualityProfileId);
  }, [qualityProfileId]);

  useEffect(() => {
    if (!isQualityMode) setQualityIssueFocusKey("");
  }, [isQualityMode]);

  useEffect(() => {
    const sidValue = String(sid || "").trim();
    return attachProcessStageFlushBeforeLeaveListener(async ({ sessionId }) => {
      return flushProcessStageBeforeLeave({
        requestedSessionId: sessionId,
        activeSessionId: sidValue,
        activeTab: tab,
        bpmnSync,
        saveDirtyHint,
        hasXmlDraftChanges: !!bpmnRef.current?.hasXmlDraftChanges?.(),
        lastSuccessfulPublish: lastSuccessfulPublishRef.current,
      });
    });
  }, [sid, tab, bpmnSync, saveDirtyHint]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug(
      `[LINT] run sid=${sid || "-"} profile=${qualityProfile?.id || qualityProfileId} `
      + `issues=${Number(qualitySummary?.total || 0)} errors=${Number(qualitySummary?.errors || 0)} warns=${Number(qualitySummary?.warns || 0)}`,
    );
  }, [sid, qualityProfile?.id, qualityProfileId, qualitySummary?.total, qualitySummary?.errors, qualitySummary?.warns]);

  useEffect(() => {
    if (tab !== "diagram") setAiQuestionsStatus({ kind: "", text: "" });
  }, [tab]);

  useEffect(() => {
    if (typeof onUiStateChange !== "function") return;
    const saveSnapshot = asObject(sessionSaveReadSnapshot);
    onUiStateChange({
      sid,
      tab,
      diagramMode,
      selectedElementId,
      hasSession,
      isLocal,
      aiQuestionsBusy,
      canGenerateAiQuestions,
      aiGenerateBlockReason: canGenerateAiQuestions ? "" : aiGenerateGate.reasonText,
      aiGenerateBlockReasonCode: canGenerateAiQuestions ? "" : aiGenerateGate.reasonCode,
      isManualSaveBusy: isManualSaveBusy === true,
      save: {
        status: toText(saveSnapshot.status),
        isDirty: saveSnapshot.isDirty === true,
        isSaving: saveSnapshot.isSaving === true,
        isStale: saveSnapshot.isStale === true,
        isFailed: saveSnapshot.isFailed === true,
      },
    });
  }, [
    onUiStateChange,
    sid,
    tab,
    diagramMode,
    selectedElementId,
    hasSession,
    isLocal,
    aiQuestionsBusy,
    canGenerateAiQuestions,
    aiGenerateGate.reasonText,
    aiGenerateGate.reasonCode,
    isManualSaveBusy,
    sessionSaveReadSnapshot,
  ]);

  useEffect(() => {
    const intent = aiGenerateIntent && typeof aiGenerateIntent === "object" ? aiGenerateIntent : null;
    if (!intent) return;
    const intentSid = String(intent.sid || "").trim();
    if (!intentSid || intentSid !== sid) return;
    const intentNonce = String(intent.nonce || "").trim();
    const intentKey = `${intentSid}:${intentNonce || "none"}`;
    if (lastAiGenerateIntentKeyRef.current === intentKey) return;
    lastAiGenerateIntentKeyRef.current = intentKey;
    void generateAiQuestionsForSelectedElement();
  }, [aiGenerateIntent, sid, generateAiQuestionsForSelectedElement]);

  useEffect(() => {
    const intent = drawioCompanionFocusIntent && typeof drawioCompanionFocusIntent === "object"
      ? drawioCompanionFocusIntent
      : null;
    if (!intent) return;
    const intentSid = String(intent.sid || "").trim();
    const objectId = String(intent.objectId || "").trim();
    if (!intentSid || intentSid !== sid || !objectId) return;
    const intentNonce = String(intent.nonce || "").trim();
    const intentKey = `${intentSid}:${objectId}:${intentNonce || "none"}`;
    if (lastDrawioCompanionFocusKeyRef.current === intentKey) return;
    lastDrawioCompanionFocusKeyRef.current = intentKey;
    setDrawioSelectedElementId(objectId);
    setDiagramActionLayersOpen(true);
  }, [drawioCompanionFocusIntent, sid, setDrawioSelectedElementId, setDiagramActionLayersOpen]);

  useEffect(() => {
    setToolbarMenuOpen(false);
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionLayersOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setRobotMetaListOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionOverflowOpen(false);
  }, [tab, sid]);

  useEffect(() => {
    if (!availablePathTiers.length) {
      if (pathHighlightEnabled) setPathHighlightEnabled(false);
      if (pathHighlightTier) setPathHighlightTier("");
      if (pathHighlightSequenceKey) setPathHighlightSequenceKey("");
      return;
    }
    if (!availablePathTiers.includes(pathHighlightTier)) {
      setPathHighlightTier(availablePathTiers[0]);
      setPathHighlightSequenceKey("");
      return;
    }
    if (pathHighlightSequenceKey && !availableSequenceKeysForTier.includes(pathHighlightSequenceKey)) {
      setPathHighlightSequenceKey("");
    }
  }, [
    availablePathTiers,
    availableSequenceKeysForTier,
    pathHighlightEnabled,
    pathHighlightTier,
    pathHighlightSequenceKey,
  ]);

  useEffect(() => {
    const xml = String(draft?.bpmn_xml || "");
    const hash = fnv1aHex(xml);
    const prevHash = String(lastDraftXmlHashRef.current || "");
    lastDraftXmlHashRef.current = hash;
    if (!saveDirtyHint) return;
    if (!xml.trim()) return;
    if (prevHash && prevHash !== hash) {
      setSaveDirtyHint(false);
    }
  }, [draft?.bpmn_xml, saveDirtyHint]);

  useEffect(() => {
    if (!diagramActionPlanOpen) return;
    void buildExecutionPlanNow({ suppressError: true });
  }, [
    diagramActionPlanOpen,
    sid,
    draft?.project_id,
    draft?.projectId,
    executionPlanSource,
    robotMetaByElementId,
    executionPlanNodeTypeById,
  ]);

  useEffect(() => {
    if (diagramActionPlanOpen) return;
    setExecutionPlanError("");
  }, [diagramActionPlanOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onBatchApply = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const requestId = String(detail?.requestId || "").trim();
      if (!requestId) return;
      void (async () => {
        try {
          const result = await runNotesBatchOps(detail);
          emitBatchOpsResult(requestId, result);
        } catch (error) {
          emitBatchOpsResult(requestId, {
            ok: false,
            error: String(error?.message || error || "batch_apply_failed"),
          });
        }
      })();
    };
    window.addEventListener(NOTES_BATCH_APPLY_EVENT, onBatchApply);
    return () => {
      window.removeEventListener(NOTES_BATCH_APPLY_EVENT, onBatchApply);
    };
  }, [runNotesBatchOps]);

  useEffect(() => {
    if (!sid) {
      setCommandHistory([]);
      return;
    }
    setCommandHistory(readCommandHistory(sid));
  }, [sid]);

  function handleAiQuestionsByElementChange(nextMap, meta = {}) {
    const interviewNow = asObject(draft?.interview);
    handleInterviewChange(
      {
        ...interviewNow,
        ai_questions_by_element: asObject(nextMap),
      },
      {
        type: "diagram.ai_questions_by_element.update",
        source: String(meta?.source || "bpmn_overlay"),
        element_id: String(meta?.elementId || ""),
        question_id: String(meta?.qid || ""),
      },
    );
  }

  useEffect(() => {
    if (!sid) return;
    const rawXml = String(draft?.bpmn_xml || "");
    logActorsTrace("derive start", {
      sid,
      source: "process_stage_effect",
      xmlLen: rawXml.length,
      xmlHash: fnv1aHex(rawXml),
    });
    const derivedActors = deriveActorsFromBpmn(rawXml);
    logActorsTrace("derive done", {
      sid,
      source: "process_stage_effect",
      count: derivedActors.length,
    });
    if (sameDerivedActors(draft?.actors_derived, derivedActors)) return;
    onSessionSync?.({
      id: sid,
      session_id: sid,
      actors_derived: derivedActors,
      _sync_source: "actors_derive_effect",
    });
  }, [sid, draft?.bpmn_xml, draft?.actors_derived, onSessionSync]);

  function applyClarifyFromSession(updated, fallbackNodes) {
    const review = buildClarificationHints(updated?.questions, updated?.nodes || fallbackNodes || []);
    setApiClarifyHints(review.hints);
    setApiClarifyList(review.list);
    setLlmClarifyList(review.llmList || []);
    const sourceLabel = review.hasLlm
      ? "API-валидаторы + DeepSeek вопросы (llm)"
      : "API-валидаторы (coverage/resources/disposition/loss)";
    setApiClarifyMeta({
      openTotal: review.openTotal,
      validatorOpenTotal: review.validatorOpenTotal,
      criticalTotal: review.criticalTotal,
      hasLlm: review.hasLlm,
      llmOpenTotal: review.llmOpenTotal,
      issueStats: review.issueStats,
      sourceLabel,
    });
    return review;
  }

  async function doGenerate() {
    if (!workbench.canGenerate) return;

    setGenErr("");
    setGenBusy(true);

    try {
      setTab("diagram");
      const runInputHash = createAiInputHash({
        tool: "generate_process",
        sid,
        bpmn_len: String(draft?.bpmn_xml || "").length,
        nodes_len: asArray(draft?.nodes).length,
        edges_len: asArray(draft?.edges).length,
        interview: asObject(draft?.interview),
      });
      const exec = await executeAi({
        toolId: "generate_process",
        sessionId: sid,
        projectId: String(draft?.project_id || draft?.projectId || ""),
        inputHash: runInputHash,
        payload: {
          source: "process_header_generate",
        },
        mode: "live",
        run: () => apiRecompute(sid),
      });
      if (!exec.ok) {
        const msg = shortErr(exec?.error?.message || exec?.error?.code || "Не удалось сгенерировать процесс.");
        if (exec?.error?.shouldNotify !== false) setGenErr(msg);
        return;
      }
      const r = exec.result;
      if (!r?.ok) {
        setGenErr(shortErr(r?.error || `recompute failed (${r?.status || 0})`));
        return;
      }

      if (exec.cached) {
        setInfoMsg("AI недоступен: показан последний успешный результат генерации (cached).");
      }
      await bpmnSync.resetBackend();
      await Promise.resolve(bpmnRef.current?.fit?.());
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    } finally {
      setGenBusy(false);
    }
  }

  async function onImportPicked(e) {
    const file = e?.target?.files?.[0];
    if (e?.target) e.target.value = "";
    if (!file) return;

    if (!hasSession) {
      setGenErr("Сначала выберите сессию.");
      return;
    }
    if (isInterview) {
      setGenErr("Переключитесь на Diagram/XML для импорта BPMN.");
      return;
    }

    setGenErr("");
    setInfoMsg("");
    try {
      const text = (await readFileText(file)).trim();
      if (!text) {
        setGenErr("Файл пустой.");
        return;
      }
      if (!text.includes("<") || (!text.includes("bpmn:") && !text.includes("definitions"))) {
        setGenErr("Похоже, это не BPMN/XML файл.");
        return;
      }

      const imported = await bpmnSync.importXml(text);
      if (!imported.ok) {
        setGenErr(shortErr(imported.error || "Импорт не выполнен."));
        return;
      }
      const replaceSeedInterview = isLikelySeedBpmnXml(draft?.bpmn_xml);
      const projected = parseAndProjectBpmnToInterview({
        xmlText: text,
        draft,
        helpers: projectionHelpers,
        preferBpmn: true,
        canAutofillInterview: replaceSeedInterview || !interviewHasContent(draft?.interview),
      });
      const derivedActors = deriveActorsFromBpmn(text);
      const currentDrawioMeta = normalizeDrawioMeta(drawioMetaRef.current);
      const beforeBpmnNodeIds = collectBpmnNodeIdsFromDraft(draft);
      const afterBpmnNodeIds = projected.ok
        ? collectBpmnNodeIdsFromDraft({ nodes: projected.nextNodes })
        : beforeBpmnNodeIds;
      const importDiagnostics = buildDrawioAnchorImportDiagnostics({
        beforeMeta: currentDrawioMeta,
        beforeBpmnNodeIds,
        afterBpmnNodeIds,
        validationReady: projected.ok,
      });
      setDrawioAnchorImportDiagnostics(importDiagnostics);
      if (projected.ok) {
        const hasProjectedInterview = interviewHasContent(projected.nextInterview);
        if (hasProjectedInterview) {
          const savePlan = markInterviewAsSaved(
            projected.nextInterview,
            projected.nextNodes,
            draft?.nodes,
            projected.nextEdges,
            draft?.edges,
          );
          const optimisticSession = {
            ...(draft || {}),
            id: sid,
            session_id: sid,
            interview: projected.nextInterview,
            bpmn_xml: text,
            actors_derived: derivedActors,
            ...(savePlan.nodesChanged ? { nodes: projected.nextNodes } : {}),
            ...(savePlan.edgesChanged ? { edges: projected.nextEdges } : {}),
          };
          onSessionSync?.(optimisticSession);
          if (!isLocal) {
            const syncRes = await apiPatchSession(sid, savePlan.patch);
            if (syncRes.ok) {
              const serverSession =
                syncRes.session && typeof syncRes.session === "object"
                  ? {
                      ...syncRes.session,
                      actors_derived: derivedActors,
                    }
                  : optimisticSession;
              onSessionSync?.(serverSession);
            } else {
              setGenErr(shortErr(syncRes.error || "Не удалось сохранить Interview из BPMN."));
            }
          }
        }
        setInfoMsg(
          replaceSeedInterview
            ? `BPMN распознан: ${projected.parsed.nodes.length} узл., ${projected.parsed.edges.length} связей.`
              + `${importDiagnostics.importHasAnchorImpact ? ` Overlay anchors affected: ${importDiagnostics.affectedObjectIds.length}.` : " Overlay anchors unchanged."}`
              + " Стартовый seed BPMN заменён импортом."
            : `BPMN распознан: ${projected.parsed.nodes.length} узл., ${projected.parsed.edges.length} связей.`
              + `${importDiagnostics.importHasAnchorImpact ? ` Overlay anchors affected: ${importDiagnostics.affectedObjectIds.length}.` : " Overlay anchors unchanged."}`,
        );
      } else {
        setDrawioAnchorImportDiagnostics(null);
        setInfoMsg(projected.error || "BPMN загружен, но парсинг не выполнен.");
      }
      setApiClarifyHints([]);
      setApiClarifyList([]);
      setLlmClarifyList([]);
      setApiClarifyMeta(null);
      setTab("diagram");
      await Promise.resolve(bpmnRef.current?.fit?.());
    } catch (e2) {
      setGenErr(shortErr(e2?.message || e2));
    }
  }

  const {
    drawioEditorBridge,
    overlayPanelModel,
    runtimeActions,
    commitDrawioOverlayMove,
    deleteDrawioOverlayElement,
    deleteOverlayEntity,
    toggleDrawioEnabled,
    setDrawioOpacity,
    drawioModeEffective,
    drawioRuntimeToolState,
    setDrawioMode,
    createDrawioRuntimeElement,
    toggleDrawioLock,
    setDrawioElementVisible,
    setDrawioElementLocked,
    setDrawioElementText,
    setDrawioElementTextWidth,
    setDrawioElementStylePreset,
    setDrawioElementSize,
    setDrawioElementAnchor,
  } = useDiagramRuntimeBridges({
    overlay: {
      sid,
      drawioMetaRef,
      setDrawioMeta,
      normalizeDrawioMeta,
      serializeDrawioMeta,
      persistDrawioMeta,
      markPlaybackOverlayInteraction,
      deleteSelectedHybridIds,
      deleteLegacyHybridMarkers,
      drawioEditorOpen,
      isDrawioXml,
      readFileText,
      setDrawioEditorOpen,
      setInfoMsg,
      setGenErr,
      downloadTextFile,
      drawioUiState,
      drawioVisibilityContract,
      drawioVisible,
      setDrawioSelectedElementId,
      hybridVisible,
      hybridTotalCount,
      hybridModeEffective,
      hybridUiPrefs,
      hybridV2HiddenCount,
      hybridLayerRenderRows,
      hybridV2Renderable,
      hybridV2BindingByHybridId,
      drawioSelectedElementId,
      hybridV2ActiveId,
      hybridV2SelectedIds,
      hybridLayerActiveElementId,
    },
    runtimeGlueConfig: {
      importInputRef,
      bpmnRef,
      bpmnSync,
      hasSession,
      isInterview,
      aiStepBusy,
      isLocal,
      aiBottleneckOn,
      activeHints,
      sid,
      draft,
      tab,
      diagramHints,
      isBpmnTab,
      selectedElementContext,
      pathHighlightTier,
      pathHighlightSequenceKey,
      executionPlanSource,
      robotMetaByElementId,
      executionPlanNodeTypeById,
      executionPlanPreview,
      executionPlanVersions,
      flowTierMetaMap,
      nodePathMetaMap,
      hybridVisible,
      hybridLayerDragRef,
      hybridLayerByElementId,
      hybridLayerPersistedMapRef,
      hybridV2Doc,
      hybridV2PersistedDocRef,
      setSaveDirtyHint,
      setToolbarMenuOpen,
      setAiBottleneckOn,
      setAiStepBusy,
      setGenErr,
      setInfoMsg,
      setTab,
      setAttentionFilters,
      setAttentionOpen,
      setDiagramPathsIntent,
      setDiagramActionPathOpen,
      setDiagramActionHybridToolsOpen,
      setDiagramActionPlanOpen,
      setDiagramActionPlaybackOpen,
      setDiagramActionRobotMetaOpen,
      setRobotMetaListOpen,
      setDiagramActionQualityOpen,
      setDiagramActionOverflowOpen,
      setExecutionPlanError,
      setExecutionPlanBusy,
      setExecutionPlanPreview,
      setExecutionPlanSaveBusy,
      setQualityOverlayFilters,
      onSessionSync,
      onOpenElementNotes,
      requestDiagramFocus,
      applyClarifyFromSession,
      confirmExportWithQualityGate,
      markPlaybackOverlayInteraction,
      persistHybridLayerMap,
      persistHybridV2Doc,
      toText,
      toNodeId,
      asArray,
      asObject,
      shortErr,
      normalizePathTier,
      normalizePathSequenceKey,
      DIAGRAM_PATHS_INTENT_VERSION,
      createAiInputHash,
      executeAi,
      apiAiQuestions,
      apiGetBpmnXml,
      apiPatchSession,
      buildExecutionPlan,
      appendExecutionPlanVersionEntry,
      copyText,
      downloadJsonFile,
      serializeHybridLayerMap,
      docToComparableJson,
    },
  });

  const {
    openEmbeddedDrawioEditor,
    closeEmbeddedDrawioEditor,
    handleDrawioEditorSave,
    exportEmbeddedDrawio,
    handleDrawioImportFile,
  } = drawioEditorBridge;

  const {
    openImportDialog,
    runToolbarReset,
    runToolbarClear,
    toggleAiBottlenecks,
    exportBpmn,
    exportPdf,
    openClarifyNode,
    toggleAttentionFilter,
    focusAttentionItem,
    openSelectedElementNotes,
    openSelectedElementAi,
    openReportsFromDiagram,
    openDocFromDiagram,
    buildExecutionPlanNow,
    copyExecutionPlanFromDiagram,
    downloadExecutionPlanFromDiagram,
    saveExecutionPlanVersionFromDiagram,
    openPathsFromDiagram,
    toggleQualityOverlayFilter,
    setQualityOverlayAll,
    focusQualityOverlayItem,
  } = runtimeActions;

  const topPanelsView = buildTopPanelsView({
    toolbarMenuOpen,
    toolbarMenuRef,
    diagramMode,
    applyDiagramMode,
    commandModeEnabled,
    setCommandModeEnabled,
    openImportDialog,
    closeToolbarMenu: stageActions.closeToolbarMenu,
    hasSession,
    isBpmnTab,
    workbench,
    exportBpmn,
    exportPdf,
    openVersionsModal,
    selectedElementId,
    openInsertBetweenModal,
    insertBetweenBusy,
    selectedInsertBetween,
    canInsertBetween,
    insertBetweenErrorMessage,
    onOpenElementNotes,
    selectedBpmnElement,
    generateAiQuestionsForSelectedElement,
    canGenerateAiQuestions,
    aiGenerateGate,
    aiQuestionsBusy,
    aiQuestionsStatus,
    templatesEnabled,
    setTemplatesEnabled,
    selectedBpmnElementIds,
    suggestedTemplates,
    applyTemplate,
    commandInput,
    setCommandInput,
    commandBusy,
    runAiCommand,
    commandStatus,
    commandHistory,
    runToolbarReset,
    runToolbarClear,
    isQualityMode,
    qualitySummary,
    qualityProfile,
    qualityProfileId,
    openQualityAutoFix: stageActions.openQualityAutoFix,
    qualityAutoFixBusy,
    qualityAutoFixPreview,
    qualityHints,
    toNodeId,
    qualityIssueFocusKey,
    qualityNodeTitleById,
    coverageById,
    qualityIssueCopy,
    focusQualityIssue,
    qualityLevelLabel,
    qualityImpactLabel,
    isCoverageMode,
    coverageMatrix,
    coverageRows,
    focusCoverageIssue,
    aiBottleneckOn,
    apiClarifyHints,
    activeHints,
    asArray,
  });

  const attentionPanelsView = buildAttentionPanelsView({
    tab,
    hasSession,
    attentionOpen,
    attentionItemsRaw,
    attentionMarkerHomeCount,
    closeAttentionPanel: stageActions.closeAttentionPanel,
    attentionFilters,
    toggleAttentionFilter,
    attentionItems,
    focusAttentionItem,
    attentionMarkers: attentionMarkersWithState,
    attentionMarkerMessage,
    setAttentionMarkerMessage,
    attentionMarkerSaving,
    addAttentionMarker,
    toggleAttentionMarkerChecked,
    focusAttentionMarker,
    attentionShowOnWorkspace,
    toggleAttentionShowOnWorkspace,
    attentionMarkerUnreadCount,
    asArray,
  });

  const dialogsView = buildDialogsView({
    qualityAutoFixOpen,
    qualityAutoFixBusy,
    closeQualityAutoFix: stageActions.closeQualityAutoFix,
    applyQualityAutoFix,
    qualityAutoFixPreview,
    qualityProfile,
    qualityProfileId,
    asArray,
    insertBetweenOpen,
    insertBetweenBusy,
    closeInsertBetweenDialog: stageActions.closeInsertBetweenDialog,
    applyInsertBetweenFromDiagram,
    insertBetweenName,
    setInsertBetweenName,
    insertBetweenDraft,
    createTemplateOpen,
    templatesBusy,
    closeCreateTemplateDialog: stageActions.closeCreateTemplateDialog,
    createTemplateTitle,
    setCreateTemplateTitle,
    createTemplateScope,
    setCreateTemplateScope,
    createTemplateType,
    setCreateTemplateType,
    workspaceActiveOrgId,
    canCreateOrgTemplates: !!workspaceActiveOrgId && !!canManageSharedTemplates,
    canCreateOrgFolders: !!workspaceActiveOrgId && !!canInviteWorkspaceUsers,
    selectedBpmnElementIds,
    selectedHybridTemplateCount,
    createTemplateFolders: templatesFoldersByScope?.[createTemplateScope] || [],
    createTemplateFolderId,
    setCreateTemplateFolderId,
    createTemplateFolderFromModal: (name = "") => createTemplateFolderFromUi({
      scope: createTemplateScope,
      name,
      parentId: createTemplateFolderId,
    }),
    saveCurrentSelectionAsTemplate,
    versionsOpen,
    closeVersionsDialog: stageActions.closeVersionsDialog,
    refreshSnapshotVersions,
    versionsBusy,
    hasSession,
    versionsList,
    revisionHistorySnapshot: sessionRevisionHistorySnapshot,
    setGenErr,
    setDiffTargetSnapshotId,
    setDiffBaseSnapshotId,
    openDiffDialog: stageActions.openDiffDialog,
    clearSnapshotHistory,
    previewSnapshotId,
    setPreviewSnapshotId,
    formatSnapshotTs,
    snapshotLabel,
    shortSnapshotHash,
    downloadSnapshot,
    editSnapshotLabel,
    togglePinSnapshot,
    openDiffForSnapshot,
    restoreSnapshot,
    previewSnapshot,
    diffOpen,
    closeDiffDialog: stageActions.closeDiffDialog,
    diffBaseSnapshotId,
    diffTargetSnapshotId,
    semanticDiffView,
  });
  const shellVm = useProcessStageShellController({
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
    selectedHybridTemplateCount,
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
  });
  const {
    canSaveNow,
    saveSmartText,
    toolbarInlineMessage,
    toolbarInlineTone,
    canUseElementContextActions,
    templateSelectionCount,
    canCreateTemplateFromSelection,
    canOpenTemplatesList,
    hasPathHighlightData,
  } = shellVm.shellProps;
  const headerView = buildDiagramHeaderView({
    shellProps: shellVm.shellProps,
    sid,
    saveDirtyHint: shellVm.shellProps.saveDirtyHint === true,
    handleSaveCurrentTab,
    workbench,
    tab,
    diagramMode,
    applyDiagramMode,
    isSwitchingTab,
    isFlushingTab,
    switchTab,
    hasSession,
    attentionOpen,
    toggleAttentionPanel: stageActions.toggleAttentionPanel,
    attentionItemsRaw,
    attentionItemsCount: shellVm.panelsProps.attention?.attentionItemsCount,
    doGenerate,
    toolbarMenuButtonRef,
    toggleToolbarMenu: stageActions.toggleToolbarMenu,
    toolbarMenuOpen,
    importInputRef,
    onImportPicked,
    hybridV2FileInputRef,
    handleHybridV2ImportFile,
    drawioFileInputRef,
    handleDrawioImportFile,
    topPanelsView: shellVm.panelsProps.top,
    asArray,
  });
  const remoteSyncState = sessionRemoteSyncState && typeof sessionRemoteSyncState === "object"
    ? sessionRemoteSyncState
    : {};
  const remoteSyncMode = String(remoteSyncState.mode || "").trim().toLowerCase();
  const showDiagramRemoteSyncStale = hasSession && tab === "diagram" && remoteSyncMode === "stale_pending";
  const remoteSyncUpdatedAt = Number(remoteSyncState.updatedAt || 0);
  const remoteSyncUpdatedAtLabel = remoteSyncUpdatedAt > 0
    ? new Date(remoteSyncUpdatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <ProcessStageShell className={shellClassName}>
      <ProcessStageHeader view={headerView} />

      <div
        className={bodyClassName}
        ref={processBodyRef}
      >
        {!hasSession ? (
          <WorkspaceExplorer
            activeOrgId={workspaceActiveOrgId}
            requestProjectId={activeProjectId}
            requestProjectWorkspaceId={activeProjectWorkspaceId}
            onOpenSession={(sessionLike) => onOpenWorkspaceSession?.(sessionLike)}
            onClearRequestedProject={onClearWorkspaceProject}
          />
        ) : tab === "doc" ? (
          <DocStage
            sessionId={sid}
            draft={draft}
            qualityErrorCount={Number(qualitySummary?.errors || 0)}
            onRecalculateRtiers={onRecalculateRtiers}
            onClose={() => setTab("diagram")}
          />
        ) : tab === "dod" ? (
          <DodStage readiness={dodReadinessV1} />
        ) : (
          <div className="relative h-full min-h-0">
            {showDiagramRemoteSyncStale ? (
              <div
                className="absolute left-3 top-3 z-40 max-w-[520px] rounded-md border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm"
                data-testid="processstage-diagram-remote-sync-stale"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>Удалённые BPMN-изменения</strong>
                  <span>Локальная диаграмма устарела. Примените обновление, чтобы синхронизировать canvas.</span>
                  {remoteSyncUpdatedAtLabel ? (
                    <span className="rounded border border-amber-300/80 bg-white/70 px-1.5 py-0.5 text-[10px]">
                      {remoteSyncUpdatedAtLabel}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="secondaryBtn tinyBtn"
                    onClick={() => {
                      if (typeof onApplySessionRemoteSync === "function") {
                        void onApplySessionRemoteSync();
                      }
                    }}
                    data-testid="processstage-diagram-remote-sync-apply"
                  >
                    Применить
                  </button>
                </div>
              </div>
            ) : null}
            <div className={isInterview ? "absolute inset-0 opacity-0 pointer-events-none" : "absolute inset-0"}>
              <div
                className={`bpmnStageHost h-full ${(hybridVisible && hybridUiPrefs.focus) ? "isHybridFocus" : ""}`}
                ref={bpmnStageHostRef}
              >
                <ProcessStageDiagramControls
                  view={buildDiagramControlsView({
                    tab,
                    diagramActionBarRef,
                    pathHighlightEnabled,
                    setDiagramActionPathOpen,
                    setDiagramActionHybridToolsOpen,
                    setDiagramActionPlanOpen,
                    setDiagramActionPlaybackOpen,
                    setDiagramActionLayersOpen,
                    setDiagramActionRobotMetaOpen,
                    setRobotMetaListOpen,
                    setDiagramActionQualityOpen,
                    setDiagramActionOverflowOpen,
                    diagramFocusMode,
                    setDiagramFocusMode,
                    diagramFullscreenActive,
                    toggleDiagramFullscreen,
                    pathHighlightBadge,
                    hybridVisible,
                    drawioUiState,
                    toText,
                    hybridV2ToolState,
                    hybridModeEffective,
                    openCreateTemplateModal,
                    canCreateTemplateFromSelection,
                    templateSelectionCount,
                    openTemplatesPicker,
                    canOpenTemplatesList,
                    sessionSaveReadSnapshot,
                    sessionVersionReadSnapshot,
                    sessionTemplateProvenanceSnapshot,
                    sessionCompanionBridgeSnapshot,
                    templatesMenuOpen: templatesPickerOpen,
                    setTemplatesMenuOpen: setTemplatesPickerOpen,
                    templatesScope,
                    setTemplatesScope,
                    templatesActiveFolderId,
                    setTemplatesActiveFolder,
                    templatesFoldersByScope,
                    scopedTemplates,
                    reloadTemplatesAndFolders,
                    templatesBusy,
                    applyTemplate,
                    removeTemplate,
                    createTemplateFolderFromUi,
                    canCreateOrgFolders: !!workspaceActiveOrgId && !!canInviteWorkspaceUsers,
                    workspaceActiveOrgId,
                    openSelectedElementNotes,
                    canUseElementContextActions,
                    openSelectedElementAi,
                    openReportsFromDiagram,
                    openDocFromDiagram,
                    hasSession,
                    diagramActionPlanOpen,
                    executionPlanSource,
                    diagramActionPlaybackOpen,
                    playbackIsPlaying,
                    playbackScenarioLabel,
                    diagramActionLayersOpen,
                    robotMetaOverlayEnabled,
                    setRobotMetaOverlayEnabled,
                    setRobotMetaOverlayFilters,
                    robotMetaCounts,
                    activeQualityOverlayCount,
                    bpmnRef,
                    isBpmnTab,
                    diagramActionPathOpen,
                    diagramPathPopoverRef,
                    hasPathHighlightData,
                    setPathHighlightEnabled,
                    availablePathTiers,
                    pathHighlightCatalog,
                    pathHighlightTier,
                    setPathHighlightTier,
                    setPathHighlightSequenceKey,
                    availableSequenceKeysForTier,
                    pathHighlightSequenceKey,
                    openPathsFromDiagram,
                    diagramActionHybridToolsOpen,
                    diagramHybridToolsPopoverRef,
                    hybridToolsUiState,
                    toggleHybridToolsVisible,
                    selectHybridPaletteTool,
                    setHybridToolsMode,
                    openEmbeddedDrawioEditor,
                    toggleDrawioEnabled,
                    drawioModeEffective,
                    setDrawioMode,
                    setDrawioOpacity,
                    toggleDrawioLock,
                    setDrawioElementVisible,
                    setDrawioElementLocked,
                    setDrawioElementText,
                    setDrawioElementTextWidth,
                    setDrawioElementStylePreset,
                    setDrawioElementSize,
                    setDrawioElementAnchor,
                    drawioFileInputRef,
                    exportEmbeddedDrawio,
                    diagramPlanPopoverRef,
                    canExportExecutionPlan,
                    executionPlanBusy,
                    executionPlanPreview,
                    asObject,
                    asArray,
                    executionPlanError,
                    copyExecutionPlanFromDiagram,
                    downloadExecutionPlanFromDiagram,
                    saveExecutionPlanVersionFromDiagram,
                    executionPlanSaveBusy,
                    executionPlanVersions,
                    shortHash,
                    diagramPlaybackPopoverRef,
                    playbackRuntimeSnapshot,
                    playbackGraphError,
                    playbackCanRun,
                    playbackScenarioKey,
                    setPlaybackScenarioKey,
                    playbackScenarioOptions,
                    playbackIndexClamped,
                    playbackTotal,
                    playbackCurrentEvent,
                    playbackEventTitle,
                    autoPassUi,
                    autoPassError: toText(autoPassJobState?.error),
                    autoPassBlockedReason: autoPassPrecheck.loading
                      ? "Checking complete path to EndEvent..."
                      : (autoPassPrecheck.canRun ? "" : (toText(autoPassPrecheck.reason) || "No complete path to EndEvent in main process.")),
                    startAutoPass,
                    handlePlaybackPrev,
                    handlePlaybackTogglePlay,
                    handlePlaybackNext,
                    handlePlaybackReset,
                    playbackSpeed,
                    setPlaybackSpeed,
                    playbackManualAtGateway,
                    setPlaybackManualAtGateway,
                    playbackAutoCamera,
                    setPlaybackAutoCamera,
                    playbackGateways,
                    playbackGatewayChoices,
                    playbackGatewayChoiceSource,
                    playbackGatewayReadOnly,
                    playbackDecisionMode: playbackDecisionModeResolved,
                    setPlaybackDecisionMode,
                    playbackGatewayPending,
                    playbackAwaitingGatewayId,
                    formatPlaybackGatewayTitle,
                    playbackGatewayOptionLabel,
                    markPlaybackOverlayInteraction,
                    setPlaybackGatewayChoice,
                    diagramLayersPopoverRef,
                    showHybridLayer,
                    hideHybridLayer,
                    focusHybridLayer,
                    setHybridLayerMode,
                    hybridUiPrefs,
                    setHybridLayerOpacity,
                    toggleHybridLayerLock,
                    toggleHybridLayerFocus,
                    hybridTotalCount,
                    hybridV2DocLive,
                    hybridV2HiddenCount,
                    revealAllHybridV2,
                    toggleHybridV2LayerVisibility,
                    toggleHybridV2LayerLock,
                    setHybridV2LayerOpacity,
                    hybridV2ActiveId,
                    hybridV2SelectedIds,
                    hybridLayerActiveElementId,
                    hybridV2BindPickMode,
                    setHybridV2BindPickMode,
                    goToActiveHybridBinding,
                    hybridV2BindingByHybridId,
                    exportHybridV2Drawio,
                    hybridV2FileInputRef,
                    hybridV2ImportNotice,
                    hybridLayerCounts,
                    hybridLayerVisibilityStats,
                    cleanupMissingHybridBindings,
                    hybridLayerRenderRows,
                    hybridV2Renderable,
                    setHybridV2ActiveId,
                    deleteSelectedHybridIds,
                    deleteLegacyHybridMarkers,
                    drawioSelectedElementId,
                    setDrawioSelectedElementId,
                    drawioAnchorImportDiagnostics,
                    overlayPanelModel,
                    deleteOverlayEntity,
                    deleteDrawioElement: deleteDrawioOverlayElement,
                    goToHybridLayerItem,
                    hideSelectedHybridItems: () => hybridTools?.hideHybridIds?.(hybridV2SelectedIds),
                    lockSelectedHybridItems: () => hybridTools?.lockLayersForHybridIds?.(hybridV2SelectedIds),
                    diagramActionRobotMetaOpen,
                    diagramRobotMetaPopoverRef,
                    robotMetaOverlayFilters,
                    toggleRobotMetaOverlayFilter,
                    showRobotMetaOverlay,
                    resetRobotMetaOverlay,
                    robotMetaListOpen,
                    diagramRobotMetaListRef,
                    robotMetaListSearch,
                    setRobotMetaListSearch,
                    robotMetaListTab,
                    setRobotMetaListTab,
                    robotMetaListItems,
                    focusRobotMetaItem,
                    diagramActionQualityOpen,
                    diagramQualityPopoverRef,
                    setQualityOverlayAll,
                    qualityOverlayRows,
                    qualityOverlayFilters,
                    toggleQualityOverlayFilter,
                    setQualityOverlayListKey,
                    setQualityOverlaySearch,
                    qualityOverlayListKey,
                    qualityOverlaySearch,
                    qualityOverlayListItems,
                    focusQualityOverlayItem,
                    diagramActionOverflowOpen,
                    diagramOverflowPopoverRef,
                    selectedInsertBetween,
                    selectedElementContext,
                    openInsertBetweenModal,
                    insertBetweenBusy,
                    canInsertBetween,
                    insertBetweenErrorMessage,
                  })}
                />
                <BpmnStage
                  ref={bpmnRef}
                  sessionId={sid}
                  activeProjectId={activeProjectId}
                  view={tab === "xml" ? "xml" : "editor"}
                  draft={draft}
                  reloadKey={reloadKey}
                  onDiagramMutation={queueDiagramMutation}
                  onElementSelectionChange={handleBpmnSelectionChange}
                  onElementNotesRemap={onElementNotesRemap}
                  onAiQuestionsByElementChange={handleAiQuestionsByElementChange}
                  onSessionSync={onSessionSync}
                  onSaveLifecycleEvent={onBpmnSaveLifecycleEvent}
                  aiQuestionsModeEnabled={isInterviewMode}
                  diagramDisplayMode={diagramMode}
                  stepTimeUnit={stepTimeUnit}
                  robotMetaOverlayEnabled={robotMetaOverlayEnabled}
                  robotMetaOverlayFilters={robotMetaOverlayFilters}
                  robotMetaStatusByElementId={robotMetaStatusByElementId}
                  selectedPropertiesOverlayPreview={selectedPropertiesOverlayPreview}
                  propertiesOverlayAlwaysEnabled={propertiesOverlayAlwaysEnabled}
                  propertiesOverlayAlwaysPreviewByElementId={propertiesOverlayAlwaysPreviewByElementId}
                />
                <BpmnFragmentPlacementGhost
                  active={bpmnFragmentPlacementActive}
                  ghost={bpmnFragmentPlacementGhost}
                />
                <DrawioOverlayRenderer
                  visible={tab === "diagram" && drawioVisible}
                  drawioMeta={drawioUiState}
                  drawioMode={drawioModeEffective}
                  drawioActiveTool={drawioRuntimeToolState}
                  overlayMatrix={hybridViewportMatrix}
                  overlayMatrixRef={hybridViewportMatrixRef}
                  subscribeOverlayMatrix={subscribeOverlayViewportMatrix}
                  getOverlayMatrix={getOverlayViewportMatrix}
                  screenToDiagram={clientToDiagram}
                  onCommitMove={commitDrawioOverlayMove}
                  onCreateElement={createDrawioRuntimeElement}
                  onDeleteElement={deleteDrawioOverlayElement}
                  onSelectionChange={setDrawioSelectedElementId}
                />
                <HybridOverlayRenderer
                  visible={tab === "diagram" && hybridVisible}
                  modeEffective={hybridModeEffective}
                  uiPrefs={hybridUiPrefs}
                  opacityValue={hybridOpacityValue}
                  overlayRef={hybridLayerOverlayRef}
                  placementHitLayerActive={hybridPlacementHitLayerActive}
                  onOverlayPointerDown={handleHybridV2OverlayPointerDown}
                  onOverlayPointerMove={hybridTools.onOverlayPointerMove}
                  onOverlayPointerLeave={hybridTools.onOverlayPointerLeave}
                  onOverlayContextMenu={handleHybridV2OverlayContextMenu}
                  v2Renderable={hybridV2Renderable}
                  v2ActiveId={hybridV2ActiveId}
                  v2SelectedIds={hybridV2SelectedIdSet}
                  v2PlaybackHighlightedIds={hybridV2PlaybackHighlightedIds}
                  v2BindingByHybridId={hybridV2BindingByHybridId}
                  onV2ElementPointerDown={handleHybridV2ElementPointerDown}
                  onV2ElementContextMenu={handleHybridV2ElementContextMenu}
                  onV2ElementDoubleClick={handleHybridV2ElementDoubleClick}
                  onV2ResizeHandlePointerDown={handleHybridV2ResizeHandlePointerDown}
                  v2GhostPreview={hybridTools.ghostPreview}
                  v2ArrowPreview={hybridTools.arrowPreview}
                  v2TextEditor={hybridTools.textEditor}
                  onV2TextEditorChange={hybridTools.updateTextEditorValue}
                  onV2TextEditorCommit={hybridTools.commitTextEditor}
                  onV2TextEditorCancel={hybridTools.closeTextEditor}
                  legacyRows={hybridLayerRenderRows}
                  legacyActiveElementId={hybridLayerActiveElementId}
                  debugEnabled={hybridDebugEnabled}
                  onLegacyHotspotMouseDown={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "hotspot_mousedown", elementId });
                  }}
                  onLegacyHotspotClick={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "hotspot_click", elementId });
                    setHybridLayerActiveElementId(elementId);
                    bpmnRef.current?.focusNode?.(elementId, { keepPrevious: false, durationMs: 1200 });
                  }}
                  onLegacyCardMouseDown={handleHybridLayerItemPointerDown}
                  onLegacyCardClick={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "card_click", elementId });
                  }}
                  onLegacyMissingCleanupMouseDown={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "card_missing_cleanup_mousedown", elementId });
                  }}
                  onLegacyMissingCleanupClick={(event, elementId) => {
                    withHybridOverlayGuard(event, { action: "card_missing_cleanup_click", elementId });
                    cleanupMissingHybridBindings("card_missing_cleanup");
                  }}
                  onLegacyCardRef={getHybridLayerCardRefCallback}
                />
                <HybridContextMenu
                  menu={hybridTools.contextMenu}
                  selectionCount={hybridSelection.selectionCount}
                  canRename={hybridSelection.selectionCount === 1 && !!hybridV2DocLive.elements.find((row) => toText(asObject(row).id) === hybridV2ActiveId)}
                  onClose={hybridTools.closeContextMenu}
                  onDelete={() => {
                    deleteSelectedHybridIds();
                    hybridTools.closeContextMenu();
                  }}
                  onRename={() => {
                    hybridTools.renameHybridItem(hybridV2ActiveId);
                    hybridTools.closeContextMenu();
                  }}
                  onHide={() => {
                    hybridTools.hideHybridIds(hybridV2SelectedIds);
                    hybridTools.closeContextMenu();
                  }}
                  onLock={() => {
                    hybridTools.lockLayersForHybridIds(hybridV2SelectedIds);
                    hybridTools.closeContextMenu();
                  }}
                />
                <HybridPersistToast
                  visible={tab === "diagram" && !!hybridPersist.lockBusyNotice?.open}
                  message={hybridPersist.lockBusyNotice?.message}
                  pendingDraft={!!hybridPersist.pendingDraft}
                  onRetry={() => {
                    void hybridPersist.retryLast();
                  }}
                  onDismiss={hybridPersist.dismissLockBusyNotice}
                />
                <DrawioEditorModal
                  open={drawioEditorOpen}
                  title="Draw.io Editor"
                  initialXml={drawioUiState.doc_xml}
                  onSave={handleDrawioEditorSave}
                  onClose={closeEmbeddedDrawioEditor}
                />
                {tab === "diagram" && isCoverageMode ? (
                  <div className="coverageMiniMap" data-testid="coverage-minimap">
                    <div className="coverageMiniMapHead">
                      <span className="coverageMiniMapTitle">Coverage map</span>
                      <span className="coverageMiniMapCount">{coverageMinimapRows.length}</span>
                    </div>
                    <div className="coverageMiniMapLegend">
                      <span className="coverageMiniMapLegendItem">
                        <i className="coverageMiniMapLegendSwatch fpcCoverageReady" />
                        <span>OK</span>
                      </span>
                      <span className="coverageMiniMapLegendItem">
                        <i className="coverageMiniMapLegendSwatch fpcCoverageWarn" />
                        <span>Partial</span>
                      </span>
                      <span className="coverageMiniMapLegendItem">
                        <i className="coverageMiniMapLegendSwatch fpcCoverageRisk" />
                        <span>Gap</span>
                      </span>
                    </div>
                    {coverageMinimapRows.length === 0 ? (
                      <div className="coverageMiniMapEmpty">Нет маркеров покрытия.</div>
                    ) : (
                      <div className="coverageMiniMapGrid">
                        {coverageMinimapRows.slice(0, 80).map((item) => {
                          const readiness = Number(item?.readiness || 0);
                          const markerClass = coverageMarkerClass(item);
                          const title = String(item?.title || item?.id || "").trim() || "Узел";
                          const detail = [
                            `Готовность: ${readiness}%`,
                            item?.hasQualityIssue ? "ошибка качества" : "",
                            item?.missingAiQuestions ? "нет AI" : "",
                            item?.missingNotes ? "нет заметок" : "",
                            item?.missingDurationQuality ? "нет duration/quality" : "",
                          ].filter(Boolean).join(" · ");
                          return (
                            <button
                              key={`coverage_minimap_${item.id}`}
                              type="button"
                              className={`coverageMiniMapMarker ${markerClass}`}
                              onClick={() => focusCoverageIssue(item, "coverage_minimap")}
                              title={`${title}${detail ? ` · ${detail}` : ""}`}
                              data-testid="coverage-minimap-marker"
                              data-element-id={item.id}
                            >
                              <span className="coverageMiniMapMarkerTitle">{title}</span>
                              <span className="coverageMiniMapMarkerMeta">{readiness}%</span>
                              <span className="coverageMiniMapMarkerFlags">
                                {item?.hasQualityIssue ? <span className="coverageMiniMapFlag is-error">E</span> : null}
                                {item?.missingAiQuestions ? <span className="coverageMiniMapFlag is-ai">AI</span> : null}
                                {item?.missingNotes ? <span className="coverageMiniMapFlag is-notes">N</span> : null}
                                {item?.missingDurationQuality ? <span className="coverageMiniMapFlag is-missing">D</span> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <ProcessPanels
              section="attention"
              view={shellVm.panelsProps.attention}
            />
            {isInterview ? (
              <div className="absolute inset-0 h-full min-h-0 overflow-auto">
                <InterviewStage
                  sessionId={sid}
                  sessionTitle={draft?.title}
                  sessionDraft={draft}
                  interview={draft?.interview}
                  nodes={draft?.nodes}
                  edges={draft?.edges}
                  roles={draft?.roles}
                  actorsDerived={draft?.actors_derived}
                  bpmnXml={draft?.bpmn_xml}
                  selectedDiagramElement={selectedBpmnElement}
                  onChange={handleInterviewChange}
                  stepTimeUnit={stepTimeUnit}
                  pathsUiIntent={diagramPathsIntent}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ProcessDialogs
        view={shellVm.dialogsProps}
      />
    </ProcessStageShell>
  );
}
