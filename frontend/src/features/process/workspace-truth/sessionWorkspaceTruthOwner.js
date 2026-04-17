function toText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toIsoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function normalizeSnapshot(raw = {}, fallbackSessionId = "") {
  const value = raw && typeof raw === "object" ? raw : {};
  const hasBpmnXml = Object.prototype.hasOwnProperty.call(value, "bpmn_xml");
  const hasBpmnXmlVersion = Object.prototype.hasOwnProperty.call(value, "bpmn_xml_version");
  const hasDiagramStateVersion = Object.prototype.hasOwnProperty.call(value, "diagram_state_version");
  const sessionId = toText(value.sessionId || value.session_id || value.id || fallbackSessionId);
  const xml = String(hasBpmnXml ? value.bpmn_xml : (value.xml ?? ""));
  const xmlVersion = Math.max(
    0,
    Math.round(toNumber(
      hasBpmnXmlVersion
        ? value.bpmn_xml_version
        : (
          value.xmlVersion
          ?? value.version
          ?? value.storedRev
          ?? value.stored_rev
        ),
      0,
    )),
  );
  const diagramStateVersion = Math.max(
    0,
    Math.round(toNumber(
      hasDiagramStateVersion
        ? value.diagram_state_version
        : value.diagramStateVersion,
      0,
    )),
  );
  const graphFingerprint = toText(
    value.graphFingerprint
    || value.bpmn_graph_fingerprint
    || value.graph_fingerprint,
  );
  const source = toText(value.source || value._sync_source || "unknown");
  const capturedAt = toText(value.capturedAt || value.updated_at || value.updatedAt || toIsoNow());
  return {
    sessionId,
    xml,
    xmlVersion,
    diagramStateVersion,
    graphFingerprint,
    source,
    capturedAt,
  };
}

function cloneSnapshot(snapshotRaw, fallbackSessionId = "") {
  return normalizeSnapshot(snapshotRaw, fallbackSessionId);
}

function normalizeSource(raw) {
  return toText(raw).toLowerCase();
}

function isPrimaryTruthSource(raw) {
  const source = normalizeSource(raw);
  if (!source) return false;
  if (isProjectionSource(source)) return false;
  if (source === "manual_save") return true;
  if (source === "autosave") return true;
  if (source.startsWith("manual_save")) return true;
  if (source.startsWith("publish_manual_save")) return true;
  if (source.startsWith("tab_switch")) return true;
  if (source.startsWith("import_xml")) return true;
  if (source === "durable_reload") return true;
  if (source === "save_conflict_refresh") return true;
  if (source === "get_session") return true;
  if (source.startsWith("reload")) return true;
  return false;
}

function isProjectionSource(raw) {
  const source = normalizeSource(raw);
  if (!source) return false;
  if (source.endsWith("_session_patch")) return true;
  if (source.includes("session_companion")) return true;
  if (source.includes("diagram.autosave_patch")) return true;
  if (source.includes("interview.autosave")) return true;
  if (source.includes("sync_interview_from_bpmn")) return true;
  if (source.includes("bpmn_meta")) return true;
  return false;
}

function buildInitialState(sessionId = "", durableSnapshot = null) {
  const initialAccepted = cloneSnapshot(
    durableSnapshot || { sessionId, source: "initial_durable_snapshot" },
    sessionId,
  );
  const initialWorking = cloneSnapshot(
    initialAccepted,
    sessionId,
  );
  return {
    sessionId: toText(sessionId || initialAccepted.sessionId),
    workingSnapshot: initialWorking,
    acceptedSnapshot: initialAccepted,
    dirtyState: {
      isDirty: false,
      reason: "",
      changedAt: "",
      changedByCommand: "",
    },
    saveState: {
      stage: "idle",
      inFlight: false,
      source: "",
      startedAt: "",
      lastAcceptedAt: "",
      lastError: "",
      lastPrimaryAck: null,
    },
    revisionState: {
      lastAcceptedRevisionNumber: 0,
      lastAcceptedRevisionId: "",
      lastPublishedRevisionNumber: 0,
      lastPublishedRevisionId: "",
      lastCreateRevisionAt: "",
    },
    diagnostics: {
      commandSeq: 0,
      lastCommand: "",
      lastCommandAt: "",
      lastProjectionSyncAt: "",
      lastNotificationAt: "",
    },
  };
}

function cloneState(stateRaw) {
  const state = stateRaw && typeof stateRaw === "object" ? stateRaw : buildInitialState("");
  return {
    ...state,
    workingSnapshot: cloneSnapshot(state.workingSnapshot, state.sessionId),
    acceptedSnapshot: cloneSnapshot(state.acceptedSnapshot, state.sessionId),
    dirtyState: {
      ...(state.dirtyState || {}),
    },
    saveState: {
      ...(state.saveState || {}),
    },
    revisionState: {
      ...(state.revisionState || {}),
    },
    diagnostics: {
      ...(state.diagnostics || {}),
    },
  };
}

function withCommandMeta(stateRaw, commandName) {
  const state = cloneState(stateRaw);
  const now = toIsoNow();
  return {
    ...state,
    diagnostics: {
      ...state.diagnostics,
      commandSeq: Math.max(0, toNumber(state.diagnostics?.commandSeq, 0)) + 1,
      lastCommand: toText(commandName),
      lastCommandAt: now,
    },
  };
}

function withWorkingMutation(stateRaw, commandName, patch = {}, reason = "") {
  const state = withCommandMeta(stateRaw, commandName);
  const now = toIsoNow();
  const nextWorking = cloneSnapshot({
    ...state.workingSnapshot,
    ...patch,
    sessionId: state.sessionId || patch.sessionId || patch.session_id || state.workingSnapshot?.sessionId,
    source: toText(commandName),
    capturedAt: now,
  }, state.sessionId);
  return {
    ...state,
    workingSnapshot: nextWorking,
    dirtyState: {
      isDirty: true,
      reason: toText(reason || commandName),
      changedAt: now,
      changedByCommand: toText(commandName),
    },
  };
}

function stripCompetingTruthFields(payloadRaw = {}) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const next = { ...payload };
  delete next.bpmn_xml;
  delete next.bpmn_xml_version;
  delete next.version;
  delete next.bpmn_graph_fingerprint;
  delete next.graph_fingerprint;
  return next;
}

export function createSessionWorkspaceTruthOwner({
  sessionId = "",
  durableSnapshot = null,
} = {}) {
  let state = buildInitialState(sessionId, durableSnapshot);

  function getState() {
    return cloneState(state);
  }

  function resetSession({
    sessionId: nextSessionId = "",
    durableSnapshot: nextDurableSnapshot = null,
  } = {}) {
    state = buildInitialState(nextSessionId, nextDurableSnapshot);
    return getState();
  }

  function applyDiagramEdit({
    patch = {},
    reason = "diagram_edit",
  } = {}) {
    state = withWorkingMutation(state, "applyDiagramEdit", patch, reason);
    return getState();
  }

  function applyPropertyChange({
    patch = {},
    reason = "property_change",
  } = {}) {
    state = withWorkingMutation(state, "applyPropertyChange", patch, reason);
    return getState();
  }

  function applyTemplate({
    patch = {},
    reason = "template_apply",
  } = {}) {
    state = withWorkingMutation(state, "applyTemplate", patch, reason);
    return getState();
  }

  function applyCopyPaste({
    patch = {},
    reason = "copy_paste",
  } = {}) {
    state = withWorkingMutation(state, "applyCopyPaste", patch, reason);
    return getState();
  }

  function saveSessionStart({
    source = "manual_save",
  } = {}) {
    const next = withCommandMeta(state, "saveSession");
    state = {
      ...next,
      saveState: {
        ...next.saveState,
        stage: "saving",
        inFlight: true,
        source: toText(source),
        startedAt: toIsoNow(),
        lastError: "",
      },
    };
    return getState();
  }

  function saveSessionAccepted({
    primaryAck = null,
    durableSnapshot: durableSnapshotRaw = null,
    source = "primary_save_accepted",
  } = {}) {
    const next = withCommandMeta(state, "saveSession.accepted");
    const ack = primaryAck && typeof primaryAck === "object" ? primaryAck : {};
    const accepted = cloneSnapshot({
      ...next.acceptedSnapshot,
      ...ack,
      ...(durableSnapshotRaw && typeof durableSnapshotRaw === "object" ? durableSnapshotRaw : {}),
      sessionId: next.sessionId,
      source,
      capturedAt: toIsoNow(),
    }, next.sessionId);
    const revisionNumber = Math.max(
      0,
      toNumber(
        ack?.bpmnVersionSnapshot?.revisionNumber
        ?? ack?.bpmn_version_snapshot?.revision_number
        ?? ack?.storedRev
        ?? ack?.stored_rev,
        0,
      ),
    );
    const revisionId = toText(
      ack?.bpmnVersionSnapshot?.id
      || ack?.bpmn_version_snapshot?.id
      || "",
    );
    state = {
      ...next,
      acceptedSnapshot: accepted,
      workingSnapshot: cloneSnapshot(accepted, next.sessionId),
      dirtyState: {
        isDirty: false,
        reason: "",
        changedAt: "",
        changedByCommand: "",
      },
      saveState: {
        ...next.saveState,
        stage: "accepted",
        inFlight: false,
        source: toText(source),
        lastAcceptedAt: toIsoNow(),
        lastError: "",
        lastPrimaryAck: ack,
      },
      revisionState: {
        ...next.revisionState,
        lastAcceptedRevisionNumber: revisionNumber > 0
          ? revisionNumber
          : toNumber(next.revisionState?.lastAcceptedRevisionNumber, 0),
        lastAcceptedRevisionId: revisionId || toText(next.revisionState?.lastAcceptedRevisionId),
      },
    };
    return getState();
  }

  function saveSessionFailed({
    error = "",
    source = "primary_save_failed",
  } = {}) {
    const next = withCommandMeta(state, "saveSession.failed");
    state = {
      ...next,
      saveState: {
        ...next.saveState,
        stage: "failed",
        inFlight: false,
        source: toText(source),
        lastError: toText(error || "save_failed"),
      },
    };
    return getState();
  }

  function reloadSession({
    durableSnapshot: durableSnapshotRaw = null,
    source = "durable_reload",
  } = {}) {
    const next = withCommandMeta(state, "reloadSession");
    const accepted = cloneSnapshot({
      ...next.acceptedSnapshot,
      ...(durableSnapshotRaw && typeof durableSnapshotRaw === "object" ? durableSnapshotRaw : {}),
      sessionId: next.sessionId,
      source,
      capturedAt: toIsoNow(),
    }, next.sessionId);
    state = {
      ...next,
      acceptedSnapshot: accepted,
      workingSnapshot: cloneSnapshot(accepted, next.sessionId),
      dirtyState: {
        isDirty: false,
        reason: "",
        changedAt: "",
        changedByCommand: "",
      },
      saveState: {
        ...next.saveState,
        stage: "idle",
        inFlight: false,
        source: toText(source),
      },
    };
    return getState();
  }

  function createRevision({
    revisionNumber = 0,
    revisionId = "",
  } = {}) {
    const next = withCommandMeta(state, "createRevision");
    state = {
      ...next,
      revisionState: {
        ...next.revisionState,
        lastPublishedRevisionNumber: Math.max(0, toNumber(revisionNumber, 0)),
        lastPublishedRevisionId: toText(revisionId),
        lastCreateRevisionAt: toIsoNow(),
      },
    };
    return getState();
  }

  function rebuildProjections({
    source = "rebuild_projections",
  } = {}) {
    const next = withCommandMeta(state, "rebuildProjections");
    state = {
      ...next,
      diagnostics: {
        ...next.diagnostics,
        lastProjectionSyncAt: toIsoNow(),
        lastCommand: toText(source) || next.diagnostics.lastCommand,
      },
    };
    return getState();
  }

  function syncProjection({
    source = "sync_projection",
  } = {}) {
    const next = withCommandMeta(state, "syncProjection");
    state = {
      ...next,
      diagnostics: {
        ...next.diagnostics,
        lastProjectionSyncAt: toIsoNow(),
        lastCommand: toText(source) || next.diagnostics.lastCommand,
      },
    };
    return getState();
  }

  function showNotification() {
    const next = withCommandMeta(state, "showNotification");
    state = {
      ...next,
      diagnostics: {
        ...next.diagnostics,
        lastNotificationAt: toIsoNow(),
      },
    };
    return getState();
  }

  function sanitizeIncomingSessionSyncPayload(sessionLikeRaw, {
    source = "",
  } = {}) {
    const payload = sessionLikeRaw && typeof sessionLikeRaw === "object"
      ? { ...sessionLikeRaw }
      : {};
    const normalizedSource = normalizeSource(source || payload._sync_source || payload._source);
    const accepted = cloneSnapshot(state.acceptedSnapshot, state.sessionId);
    const incomingXml = String(payload?.bpmn_xml || "");
    const incomingHasXml = Object.prototype.hasOwnProperty.call(payload, "bpmn_xml");
    const acceptedXml = String(accepted?.xml || "");
    const shouldStripCompetingXml = (
      incomingHasXml
      && !!incomingXml.trim()
      && !!acceptedXml.trim()
      && incomingXml !== acceptedXml
      && isProjectionSource(normalizedSource)
      && !isPrimaryTruthSource(normalizedSource)
      && payload._truth_owner_allow_bpmn_xml !== true
    );
    if (!shouldStripCompetingXml) {
      return {
        payload,
        stripped: false,
        reason: "not_stripped",
      };
    }
    return {
      payload: stripCompetingTruthFields(payload),
      stripped: true,
      reason: "projection_cannot_overwrite_accepted_truth",
    };
  }

  return {
    getState,
    resetSession,
    applyDiagramEdit,
    applyPropertyChange,
    applyTemplate,
    applyCopyPaste,
    saveSessionStart,
    saveSessionAccepted,
    saveSessionFailed,
    reloadSession,
    createRevision,
    rebuildProjections,
    syncProjection,
    showNotification,
    sanitizeIncomingSessionSyncPayload,
  };
}

export {
  normalizeSnapshot,
  isPrimaryTruthSource,
  isProjectionSource,
};

export default createSessionWorkspaceTruthOwner;
