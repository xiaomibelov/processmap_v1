import { useEffect, useMemo, useState } from "react";

function normalizeActivationState(raw) {
  return raw && typeof raw === "object" ? raw : { phase: "idle", sessionId: "", projectId: "", source: "", error: "" };
}

export function deriveSessionShellTransition({
  draftSessionId,
  activationState,
  previousShellSessionId,
}) {
  const draftSid = String(draftSessionId || "").trim();
  const prevShellSid = String(previousShellSessionId || "").trim();
  const activation = normalizeActivationState(activationState);
  const activationSid = String(activation?.sessionId || "").trim();
  const phase = String(activation?.phase || "idle").trim();

  if (draftSid) {
    return {
      nextShellSessionId: draftSid,
      reason: draftSid === prevShellSid ? "reuse_current_session" : "replace_session",
      resetShellState: !!prevShellSid && draftSid !== prevShellSid,
      preserveShell: true,
    };
  }

  const preserveDuringRestore = (
    prevShellSid
    && activationSid === prevShellSid
    && (
      phase === "opening"
      || phase === "restoring_session"
      || phase === "restoring_sessions"
      || phase === "active"
    )
  );

  if (preserveDuringRestore) {
    return {
      nextShellSessionId: prevShellSid,
      reason: "preserve_during_same_session_restore",
      resetShellState: false,
      preserveShell: true,
    };
  }

  return {
    nextShellSessionId: "",
    reason: prevShellSid ? "clear_shell" : "stay_empty",
    resetShellState: !!prevShellSid,
    preserveShell: false,
  };
}

function emptyResetInfo() {
  return {
    reason: "",
    prevShellSessionId: "",
    nextShellSessionId: "",
    at: 0,
  };
}

export default function useSessionShellOrchestration({
  draftSessionId,
  activationState,
}) {
  const [shellSessionId, setShellSessionId] = useState(() => String(draftSessionId || "").trim());
  const [shellResetInfo, setShellResetInfo] = useState(() => emptyResetInfo());

  const [sidebarActiveSection, setSidebarActiveSection] = useState("selected");
  const [sidebarShortcutRequest, setSidebarShortcutRequest] = useState("");
  const [selectedBpmnElement, setSelectedBpmnElement] = useState(null);
  const [selectedPropertiesOverlayPreview, setSelectedPropertiesOverlayPreview] = useState(null);
  const [selectedPropertiesOverlayAlwaysPreview, setSelectedPropertiesOverlayAlwaysPreview] = useState(null);
  const [processUiState, setProcessUiState] = useState(null);
  const [aiGenerateIntent, setAiGenerateIntent] = useState(null);

  const transition = useMemo(() => deriveSessionShellTransition({
    draftSessionId,
    activationState,
    previousShellSessionId: shellSessionId,
  }), [activationState, draftSessionId, shellSessionId]);

  useEffect(() => {
    const nextShellSid = String(transition?.nextShellSessionId || "").trim();
    const prevShellSid = String(shellSessionId || "").trim();
    if (nextShellSid === prevShellSid) return;
    setShellSessionId(nextShellSid);
    if (transition?.resetShellState) {
      setSelectedBpmnElement(null);
      setProcessUiState(null);
      setAiGenerateIntent(null);
      setSidebarActiveSection("selected");
      setSidebarShortcutRequest("");
      setSelectedPropertiesOverlayPreview(null);
      setSelectedPropertiesOverlayAlwaysPreview(null);
    }
    setShellResetInfo({
      reason: String(transition?.reason || "").trim(),
      prevShellSessionId: prevShellSid,
      nextShellSessionId: nextShellSid,
      at: Date.now(),
    });
  }, [shellSessionId, transition]);

  return {
    shellSessionId,
    shellTransitionReason: String(transition?.reason || "").trim(),
    shellResetInfo,
    sidebarActiveSection,
    setSidebarActiveSection,
    sidebarShortcutRequest,
    setSidebarShortcutRequest,
    selectedBpmnElement,
    setSelectedBpmnElement,
    selectedPropertiesOverlayPreview,
    setSelectedPropertiesOverlayPreview,
    selectedPropertiesOverlayAlwaysPreview,
    setSelectedPropertiesOverlayAlwaysPreview,
    processUiState,
    setProcessUiState,
    aiGenerateIntent,
    setAiGenerateIntent,
  };
}
