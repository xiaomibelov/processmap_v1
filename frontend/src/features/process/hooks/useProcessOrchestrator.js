import { useRef } from "react";
import useProcessTabs from "./useProcessTabs";
import useInterviewSyncLifecycle from "./useInterviewSyncLifecycle";
import useDiagramMutationLifecycle from "./useDiagramMutationLifecycle";

export default function useProcessOrchestrator({
  sid,
  isLocal,
  draft,
  processTabIntent,
  bpmnRef,
  coordinator,
  processBodyRef,
  bpmnSync,
  projectionHelpers,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
  onSessionSync,
  onError,
}) {
  const flushBeforeSwitchRef = useRef(async () => true);
  const flushDiagramBeforeSwitchRef = useRef(async () => true);
  const invalidateHydrateRef = useRef(() => {});
  const markHydrateDoneRef = useRef(() => {});

  const {
    tab,
    setTab,
    switchTab,
    isSwitchingTab,
    isFlushingTab,
    requestDiagramFocus,
    isInterview,
    isBpmnTab,
  } = useProcessTabs({
    sid,
    draft,
    isLocal,
    processTabIntent,
    bpmnRef,
    processBodyRef,
    bpmnSync,
    projectionHelpers,
    getBaseDiagramStateVersion,
    onSessionSync,
    flushInterviewBeforeTabSwitch: (currentTab, targetTab) =>
      flushBeforeSwitchRef.current?.(currentTab, targetTab),
    flushDiagramBeforeTabSwitch: (currentTab, targetTab) =>
      flushDiagramBeforeSwitchRef.current?.(currentTab, targetTab),
    invalidateHydrateForSession: () => invalidateHydrateRef.current?.(),
    markHydrateDoneForSession: () => markHydrateDoneRef.current?.(),
    onError,
  });

  const {
    flushInterviewBeforeTabSwitch,
    invalidateHydrateForSession,
    markHydrateDoneForSession,
    markInterviewAsSaved,
    handleInterviewChange,
  } = useInterviewSyncLifecycle({
    sid,
    isLocal,
    isInterview,
    draft,
    onSessionSync,
    bpmnSync,
    projectionHelpers,
    getBaseDiagramStateVersion,
    rememberDiagramStateVersion,
    coordinator,
    onError,
  });

  const {
    queueDiagramMutation,
    flushDiagramBeforeTabSwitch,
    cancelPendingDiagramAutosave,
  } = useDiagramMutationLifecycle({
    sid,
    isLocal,
    draft,
    bpmnSync,
    coordinator,
    projectionHelpers,
    getBaseDiagramStateVersion,
    rememberDiagramStateVersion,
    onSessionSync,
    onError,
  });

  // Keep the same invocation order and stale-safe hand-off between hooks.
  flushBeforeSwitchRef.current = flushInterviewBeforeTabSwitch;
  flushDiagramBeforeSwitchRef.current = flushDiagramBeforeTabSwitch;
  invalidateHydrateRef.current = invalidateHydrateForSession;
  markHydrateDoneRef.current = markHydrateDoneForSession;

  return {
    tab,
    setTab,
    switchTab,
    isSwitchingTab,
    isFlushingTab,
    requestDiagramFocus,
    isInterview,
    isBpmnTab,
    flushInterviewBeforeTabSwitch,
    invalidateHydrateForSession,
    markHydrateDoneForSession,
    markInterviewAsSaved,
    handleInterviewChange,
    queueDiagramMutation,
    cancelPendingDiagramAutosave,
  };
}
