function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeActivationState(raw) {
  return raw && typeof raw === "object"
    ? {
        phase: normalizeString(raw.phase) || "idle",
        projectId: normalizeString(raw.projectId),
        sessionId: normalizeString(raw.sessionId),
        source: normalizeString(raw.source),
        error: normalizeString(raw.error),
      }
    : {
        phase: "idle",
        projectId: "",
        sessionId: "",
        source: "",
        error: "",
      };
}

function normalizeShellResetInfo(raw) {
  return raw && typeof raw === "object"
    ? {
        reason: normalizeString(raw.reason),
        prevShellSessionId: normalizeString(raw.prevShellSessionId),
        nextShellSessionId: normalizeString(raw.nextShellSessionId),
        at: Number(raw.at || 0) || 0,
      }
    : {
        reason: "",
        prevShellSessionId: "",
        nextShellSessionId: "",
        at: 0,
      };
}

export function buildSessionDebugProbeSnapshot({
  routeSelection,
  requestedSessionId,
  activeSessionId,
  confirmedSessionId,
  activationState,
  shellSessionId,
  shellTransitionReason,
  shellResetInfo,
  processStageSessionId,
} = {}) {
  return Object.freeze({
    route: Object.freeze({
      projectId: normalizeString(routeSelection?.projectId),
      sessionId: normalizeString(routeSelection?.sessionId),
    }),
    restoreMemory: Object.freeze({
      requestedSessionId: normalizeString(requestedSessionId),
      activeSessionId: normalizeString(activeSessionId),
      confirmedSessionId: normalizeString(confirmedSessionId),
    }),
    activationState: Object.freeze(normalizeActivationState(activationState)),
    shell: Object.freeze({
      shellSessionId: normalizeString(shellSessionId),
      transitionKind: normalizeString(shellTransitionReason),
      resetInfo: Object.freeze(normalizeShellResetInfo(shellResetInfo)),
    }),
    processStage: Object.freeze({
      sessionId: normalizeString(processStageSessionId),
    }),
  });
}

