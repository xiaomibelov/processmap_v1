import {
  DIAGRAM_OWNER_TRACE_MARKERS,
  ownerPathBlockReason,
  resolveDiagramOwnerCutoverState,
} from "./diagramOwnerCutoverContract.js";
import {
  buildDiagramTracePayload,
  createDiagramTraceSeed,
} from "./diagramTraceContract.js";

function toText(value) {
  return String(value || "").trim();
}

function parseBool(raw, fallback = false) {
  const text = toText(raw).toLowerCase();
  if (!text) return fallback;
  if (text === "1" || text === "true" || text === "on" || text === "yes") return true;
  if (text === "0" || text === "false" || text === "off" || text === "no") return false;
  return fallback;
}

function readEnv() {
  if (typeof import.meta === "undefined" || !import.meta.env) return {};
  return import.meta.env || {};
}

function normalizeAdapterMode(raw) {
  return toText(raw).toLowerCase() === "jazz" ? "jazz" : "legacy";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isConflictCode(codeRaw) {
  const code = toText(codeRaw).toLowerCase();
  return code.includes("conflict") || code.includes("mismatch");
}

export const DIAGRAM_JAZZ_DOC_ID_MAP_STORAGE_KEY = "fpc:diagram-jazz-docids";

export const DIAGRAM_JAZZ_CONTRACT_DRAFT = Object.freeze({
  version: "diagram-jazz-contract-draft-v1",
  legacyAuthoritativeSource: "backend.sessions.bpmn_xml",
  jazzDocIdentityLaw: "org_id + project_id + session_id",
  jazzReadLaw: "single_read_path_jazz_only_without_legacy_fallback",
  jazzWriteLaw: "single_write_path_jazz_only_without_legacy_dual_write",
  cutoverLaw: "single_path_switch_without_permanent_dual_write",
});

export const DIAGRAM_JAZZ_TRACE_MARKERS = Object.freeze({
  gateState: "diagram_jazz_gate_state",
  adapterNotActive: "diagram_jazz_adapter_not_active",
  blockedWithoutContract: "diagram_jazz_attempt_blocked_without_contract",
  feReadAttempt: "diagram_jazz_fe_read_attempt",
  feWriteAttempt: "diagram_jazz_fe_write_attempt",
  feReadSuccess: "diagram_jazz_fe_read_success",
  feWriteSuccess: "diagram_jazz_fe_write_success",
  feConflict: "diagram_jazz_fe_conflict",
  feBlocked: "diagram_jazz_fe_blocked",
  feGateState: "diagram_jazz_fe_gate_state",
  ownerState: DIAGRAM_OWNER_TRACE_MARKERS.ownerState,
  cutoverAttempt: DIAGRAM_OWNER_TRACE_MARKERS.cutoverAttempt,
  cutoverBlocked: DIAGRAM_OWNER_TRACE_MARKERS.cutoverBlocked,
  cutoverSuccess: DIAGRAM_OWNER_TRACE_MARKERS.cutoverSuccess,
  cutoverRollback: DIAGRAM_OWNER_TRACE_MARKERS.cutoverRollback,
  cutoverInvariantViolation: DIAGRAM_OWNER_TRACE_MARKERS.cutoverInvariantViolation,
});

export function resolveDiagramJazzContractDraftActivation(options = {}) {
  const env = (options?.envOverride && typeof options.envOverride === "object")
    ? options.envOverride
    : readEnv();
  const ownerCutover = resolveDiagramOwnerCutoverState({
    envOverride: env,
    scopeOverride: (options?.scopeOverride && typeof options.scopeOverride === "object")
      ? options.scopeOverride
      : {},
  });
  const pilotEnabled = parseBool(env.VITE_DIAGRAM_JAZZ_CONTRACT_DRAFT, false);
  const adapterRequested = normalizeAdapterMode(env.VITE_DIAGRAM_JAZZ_ADAPTER);
  let adapterModeEffective = "legacy";
  const jazzPeer = toText(env.VITE_DIAGRAM_JAZZ_PEER);
  let unsupportedReason = "";
  if (adapterRequested === "jazz") {
    if (!pilotEnabled) {
      unsupportedReason = "diagram_cutover_blocked_frontend_gate_not_ready";
    } else {
      const ownerBlocked = ownerPathBlockReason(ownerCutover, "jazz");
      if (ownerBlocked) unsupportedReason = ownerBlocked;
    }
    if (!unsupportedReason) adapterModeEffective = "jazz";
  } else if (toText(ownerCutover.diagramOwner) === "jazz_owner") {
    unsupportedReason = "diagram_cutover_invariant_violation_mode_owner_mismatch";
  }
  if (adapterModeEffective === "jazz" && !jazzPeer) {
    unsupportedReason = "diagram_jazz_peer_missing";
  }
  if (ownerCutover.rollbackTriggered === true && adapterModeEffective === "jazz") {
    unsupportedReason = "diagram_cutover_rollback_active";
    adapterModeEffective = "legacy";
  }
  return {
    pilotEnabled,
    adapterRequested,
    adapterModeEffective,
    activationSource: pilotEnabled ? "env" : "default",
    jazzPeer,
    unsupportedState: !!unsupportedReason,
    unsupportedReason,
    ownerRequestedState: toText(ownerCutover.requestedState || "legacy_owner"),
    ownerEffectiveState: toText(ownerCutover.effectiveState || "legacy_owner"),
    ownerState: toText(ownerCutover.diagramOwner || "legacy_owner"),
    ownerBlockedReason: toText(ownerCutover.blockedReason || ""),
    ownerRollbackActive: ownerCutover.rollbackTriggered === true,
    ownerSwitchApproved: ownerCutover.switchApproved === true,
    scopedGateMatch: ownerCutover.scopedGateMatch === true,
    scopedGateScope: toText(ownerCutover.scopedGateScope || ""),
    scopedGateBlockedReason: toText(ownerCutover.scopedGateBlockedReason || ""),
    scopedGateOperator: toText(ownerCutover.scopedGateOperator || ""),
    ownerPreconditions: ownerCutover.preconditions && typeof ownerCutover.preconditions === "object"
      ? ownerCutover.preconditions
      : {},
  };
}

export function buildDiagramJazzDocumentIdentity({
  orgId = "",
  projectId = "",
  sessionId = "",
} = {}) {
  const org = toText(orgId);
  const project = toText(projectId);
  const session = toText(sessionId);
  const valid = !!org && !!project && !!session;
  const scopeId = valid ? `${org}::${project}::${session}` : "";
  return {
    valid,
    orgId: org,
    projectId: project,
    sessionId: session,
    scopeId,
    docAlias: scopeId ? `diagram:${scopeId}` : "",
    mappingStorageKey: DIAGRAM_JAZZ_DOC_ID_MAP_STORAGE_KEY,
    invalidReason: valid ? "" : "missing_identity_segment",
  };
}

export function evaluateDiagramJazzContractInvariant({
  activation = null,
  identity = null,
} = {}) {
  const resolvedActivation = activation && typeof activation === "object" ? activation : {};
  const resolvedIdentity = identity && typeof identity === "object" ? identity : {};
  const enabled = normalizeAdapterMode(resolvedActivation.adapterModeEffective) === "jazz";
  const identityValid = resolvedIdentity?.valid === true;
  if (!enabled) return { ok: false, reason: "diagram_jazz_disabled" };
  if (resolvedActivation?.unsupportedState === true) {
    return {
      ok: false,
      reason: toText(resolvedActivation?.unsupportedReason || "diagram_jazz_contract_unsupported"),
    };
  }
  if (!identityValid) {
    return {
      ok: false,
      reason: toText(resolvedIdentity?.invalidReason || "diagram_jazz_identity_invalid"),
    };
  }
  return { ok: true, reason: "" };
}

function blockedReadResult(reason = "diagram_jazz_contract_unimplemented") {
  return {
    ok: false,
    status: 0,
    blocked: reason,
    errorCode: reason,
    error: "Diagram Jazz read contract draft is defined but not wired to a runtime adapter.",
  };
}

function blockedWriteResult(reason = "diagram_jazz_contract_unimplemented") {
  return {
    ok: false,
    status: 0,
    blocked: reason,
    errorCode: reason,
    error: "Diagram Jazz write contract draft is defined but not wired to a runtime adapter.",
  };
}

function normalizeApiError(errorLike, fallbackReason) {
  const status = asNumber(errorLike?.status, 0);
  const blocked = toText(errorLike?.blocked || "");
  const errorCode = toText(errorLike?.errorCode || blocked || fallbackReason || "diagram_jazz_api_failed");
  const reason = errorCode || fallbackReason || "diagram_jazz_api_failed";
  return {
    ok: false,
    status,
    blocked: reason,
    errorCode: reason,
    error: toText(errorLike?.error || fallbackReason || "diagram_jazz_api_failed"),
    traceId: toText(errorLike?.traceId || ""),
    scopeId: toText(errorLike?.scopeId || ""),
    provider: toText(errorLike?.provider || ""),
    ownerRequestedState: toText(errorLike?.ownerRequestedState || ""),
    ownerEffectiveState: toText(errorLike?.ownerEffectiveState || ""),
    ownerState: toText(errorLike?.ownerState || ""),
    ownerBlockedReason: toText(errorLike?.ownerBlockedReason || ""),
    ownerRollbackActive: errorLike?.ownerRollbackActive === true,
    scopedGateMatch: Number(errorLike?.scopedGateMatch || 0) === 1,
    scopedGateScope: toText(errorLike?.scopedGateScope || ""),
    scopedGateBlockedReason: toText(errorLike?.scopedGateBlockedReason || ""),
    scopedGateOperator: toText(errorLike?.scopedGateOperator || ""),
  };
}

function normalizeAck(rawAck = {}) {
  return {
    docId: toText(rawAck?.docId || rawAck?.doc_id),
    docAlias: toText(rawAck?.docAlias || rawAck?.doc_alias),
    scopeId: toText(rawAck?.scopeId || rawAck?.scope_id),
    provider: toText(rawAck?.provider || ""),
    contractVersion: toText(rawAck?.contractVersion || rawAck?.contract_version),
    storedRevision: asNumber(rawAck?.storedRevision ?? rawAck?.stored_revision, 0),
    storedFingerprint: toText(rawAck?.storedFingerprint || rawAck?.stored_fingerprint),
    updatedAt: asNumber(rawAck?.updatedAt ?? rawAck?.updated_at, 0),
    payloadUpdatedAt: asNumber(rawAck?.payloadUpdatedAt ?? rawAck?.payload_updated_at, 0),
    mappingId: toText(rawAck?.mappingId || rawAck?.mapping_id),
  };
}

export function createDiagramJazzContractDraftAdapter({
  activation = null,
  identity = null,
  apiGetDiagramJazzXml = null,
  apiPutDiagramJazzXml = null,
  onTrace = null,
} = {}) {
  const resolvedActivation = activation && typeof activation === "object" ? activation : {};
  const resolvedIdentity = identity && typeof identity === "object" ? identity : {};
  const mode = normalizeAdapterMode(resolvedActivation.adapterModeEffective);
  const enabled = mode === "jazz";
  const provider = toText(resolvedActivation?.jazzPeer || "");
  const ownerState = {
    requestedState: toText(resolvedActivation?.ownerRequestedState || "legacy_owner"),
    effectiveState: toText(resolvedActivation?.ownerEffectiveState || "legacy_owner"),
    diagramOwner: toText(resolvedActivation?.ownerState || "legacy_owner"),
    blockedReason: toText(resolvedActivation?.ownerBlockedReason || ""),
    rollbackTriggered: resolvedActivation?.ownerRollbackActive === true,
    scopedGateMatch: resolvedActivation?.scopedGateMatch === true,
    scopedGateScope: toText(resolvedActivation?.scopedGateScope || ""),
    scopedGateBlockedReason: toText(resolvedActivation?.scopedGateBlockedReason || ""),
    scopedGateOperator: toText(resolvedActivation?.scopedGateOperator || ""),
  };
  const ownerJazzPathBlock = ownerPathBlockReason(ownerState, "jazz");
  const baseIdentity = {
    orgId: toText(resolvedIdentity?.orgId || ""),
    projectId: toText(resolvedIdentity?.projectId || ""),
    sessionId: toText(resolvedIdentity?.sessionId || ""),
    scopeId: toText(resolvedIdentity?.scopeId || ""),
    docAlias: toText(resolvedIdentity?.docAlias || ""),
  };
  let lastAck = null;

  function emit(event, payload = {}) {
    if (typeof onTrace !== "function") return;
    try {
      onTrace(String(event || "unknown"), payload);
    } catch {
      // no-op
    }
  }

  const invariant = evaluateDiagramJazzContractInvariant({
    activation: resolvedActivation,
    identity: resolvedIdentity,
  });

  function createTraceSeed(sessionId = "", correlationId = "") {
    return createDiagramTraceSeed({
      sessionId: toText(sessionId || baseIdentity.sessionId),
      projectId: baseIdentity.projectId,
      orgId: baseIdentity.orgId,
      scopeId: baseIdentity.scopeId,
      provider,
      ownerRequestedState: ownerState.requestedState,
      ownerEffectiveState: ownerState.effectiveState,
      diagramOwnerState: ownerState.diagramOwner,
      adapterModeEffective: mode,
      ownerRollbackActive: ownerState.rollbackTriggered,
      scopedGateMatch: ownerState.scopedGateMatch,
      scopedGateScope: ownerState.scopedGateScope,
      scopedGateBlockedReason: ownerState.scopedGateBlockedReason || ownerState.blockedReason,
      scopedGateOperator: ownerState.scopedGateOperator,
      correlationId,
    });
  }

  function buildTrace(
    operation,
    {
      sessionId = "",
      layer = "fe",
      reason = "",
      blockedReason = "",
      conflictReason = "",
      traceId = "",
      correlationId = "",
      docId = "",
      docAlias = "",
      mappingId = "",
      extra = {},
    } = {},
  ) {
    return buildDiagramTracePayload(
      createTraceSeed(sessionId, correlationId),
      {
        layer,
        operation: toText(operation),
        reason,
        blockedReason,
        conflictReason,
        traceId,
        docId,
        docAlias: toText(docAlias || baseIdentity.docAlias),
        mappingId,
        extra,
      },
    );
  }

  function emitGateState() {
    emit(
      DIAGRAM_JAZZ_TRACE_MARKERS.feGateState,
      buildTrace("gate_state", {
        reason: toText(resolvedActivation?.unsupportedReason || ""),
        blockedReason: toText(resolvedActivation?.unsupportedReason || ""),
        extra: {
          mode,
          enabled: enabled ? 1 : 0,
          identity_valid: resolvedIdentity?.valid === true ? 1 : 0,
          unsupported: resolvedActivation?.unsupportedState === true ? 1 : 0,
          unsupported_reason: toText(resolvedActivation?.unsupportedReason || ""),
          owner_blocked_reason: ownerState.blockedReason,
          owner_rollback_active: ownerState.rollbackTriggered ? 1 : 0,
          scoped_gate_match: ownerState.scopedGateMatch ? 1 : 0,
          scoped_gate_scope: ownerState.scopedGateScope,
          scoped_gate_blocked_reason: ownerState.scopedGateBlockedReason || ownerState.blockedReason,
          scoped_gate_operator: ownerState.scopedGateOperator,
        },
      }),
    );
  }

  function emitOwnerStateMarkers() {
    const payload = buildTrace("owner_state", {
      blockedReason: ownerState.blockedReason,
      extra: {
        mode,
        enabled: enabled ? 1 : 0,
        owner_blocked_reason: ownerState.blockedReason,
        owner_rollback_active: ownerState.rollbackTriggered ? 1 : 0,
        scoped_gate_match: ownerState.scopedGateMatch ? 1 : 0,
        scoped_gate_scope: ownerState.scopedGateScope,
        scoped_gate_blocked_reason: ownerState.scopedGateBlockedReason || ownerState.blockedReason,
        scoped_gate_operator: ownerState.scopedGateOperator,
      },
    });
    emit(DIAGRAM_OWNER_TRACE_MARKERS.ownerState, payload);
    if (ownerState.requestedState === "jazz_owner") emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverAttempt, payload);
    if (ownerState.effectiveState === "cutover_blocked") emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverBlocked, payload);
    if (ownerState.effectiveState === "jazz_owner") emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverSuccess, payload);
    if (ownerState.rollbackTriggered) emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverRollback, payload);
    if (toText(ownerState.blockedReason).toLowerCase().includes("invariant")) {
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverInvariantViolation, payload);
    }
  }

  function emitCutoverReason(reasonRaw, payload = {}) {
    const reason = toText(reasonRaw).toLowerCase();
    if (!reason) return;
    if (reason.includes("rollback")) {
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverRollback, payload);
      return;
    }
    if (reason.includes("invariant")) {
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverInvariantViolation, payload);
      return;
    }
    if (reason.includes("cutover_blocked") || reason.includes("owner_")) {
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverBlocked, payload);
    }
  }

  function emitBlocked(operation, reason, extra = {}) {
    const reasonText = toText(reason || "diagram_jazz_contract_unimplemented");
    const payload = buildTrace(operation, {
      reason: reasonText,
      blockedReason: reasonText,
      extra: {
        mode,
        enabled: enabled ? 1 : 0,
        ...extra,
      },
    });
    emit(DIAGRAM_JAZZ_TRACE_MARKERS.blockedWithoutContract, payload);
    emit(DIAGRAM_JAZZ_TRACE_MARKERS.feBlocked, payload);
    emitCutoverReason(reasonText, payload);
  }

  function emitConflict(operation, reason, extra = {}) {
    const reasonText = toText(reason);
    emit(
      DIAGRAM_JAZZ_TRACE_MARKERS.feConflict,
      buildTrace(operation, {
        reason: reasonText,
        conflictReason: reasonText,
        extra: {
          mode,
          ...extra,
        },
      }),
    );
  }

  emitGateState();
  emitOwnerStateMarkers();

  return {
    mode,
    enabled,
    activation: resolvedActivation,
    identity: resolvedIdentity,
    async readDurableXml(args = {}) {
      const sid = toText(args?.sessionId || resolvedIdentity?.sessionId || "");
      if (ownerJazzPathBlock) {
        emitBlocked("read", ownerJazzPathBlock, { sid });
        return blockedReadResult(ownerJazzPathBlock);
      }
      if (!invariant.ok) {
        const reason = toText(invariant.reason || "diagram_jazz_contract_unsupported");
        emitBlocked("read", reason, { sid });
        return blockedReadResult(reason);
      }
      if (typeof apiGetDiagramJazzXml !== "function") {
        const reason = "diagram_jazz_fe_adapter_api_missing";
        emitBlocked("read", reason, { sid });
        return blockedReadResult(reason);
      }

      const readAttemptTrace = buildTrace("read_attempt", {
        sessionId: sid,
        extra: {
          mode,
          force_remote: args?.forceRemote === true ? 1 : 0,
        },
      });
      emit(DIAGRAM_JAZZ_TRACE_MARKERS.feReadAttempt, readAttemptTrace);
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverAttempt, readAttemptTrace);
      const response = await apiGetDiagramJazzXml(sid, { provider, traceContext: readAttemptTrace });
      if (!response?.ok) {
        const normalized = normalizeApiError(response, "diagram_jazz_read_failed");
        const normalizedReason = toText(normalized.errorCode || normalized.blocked);
        const tracePayload = buildTrace("read_failed", {
          sessionId: sid,
          correlationId: toText(normalized.correlationId || readAttemptTrace.correlation_id),
          traceId: toText(normalized.traceId || ""),
          reason: normalizedReason,
          blockedReason: normalizedReason,
          conflictReason: isConflictCode(normalizedReason) ? normalizedReason : "",
          extra: {
            mode,
            status: asNumber(normalized.status, 0),
            error_code: normalizedReason,
            api_trace_layer: toText(normalized.traceLayer || ""),
            api_trace_operation: toText(normalized.traceOperation || ""),
            api_trace_contract_version: toText(normalized.traceContractVersion || ""),
          },
        });
        if (isConflictCode(normalized.errorCode)) {
          emitConflict("read", normalized.errorCode, tracePayload);
        } else {
          emitBlocked("read", normalized.errorCode, tracePayload);
        }
        return normalized;
      }

      const ack = normalizeAck(response?.ack || {});
      lastAck = ack;
      const readSuccessTrace = buildTrace("read_success", {
        sessionId: sid,
        correlationId: toText(response?.correlationId || readAttemptTrace.correlation_id),
        traceId: toText(response?.traceId || ""),
        docId: toText(ack.docId || ""),
        docAlias: toText(ack.docAlias || ""),
        mappingId: toText(ack.mappingId || ""),
        extra: {
          mode,
          provider: toText(response?.provider || ack.provider || provider),
          scope_id: toText(ack.scopeId || resolvedIdentity?.scopeId || ""),
          stored_revision: asNumber(ack.storedRevision, 0),
          stored_fingerprint: toText(ack.storedFingerprint),
          api_trace_contract_version: toText(response?.traceContractVersion || ""),
        },
      });
      emit(DIAGRAM_JAZZ_TRACE_MARKERS.feReadSuccess, readSuccessTrace);
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverSuccess, readSuccessTrace);
      return {
        ok: true,
        status: asNumber(response?.status, 200),
        xml: toText(response?.xml || ""),
        rev: asNumber(ack.storedRevision, 0),
        hash: toText(ack.storedFingerprint || ""),
        durableAck: ack,
      };
    },
    async writeDurableXml(args = {}) {
      const sid = toText(args?.sessionId || resolvedIdentity?.sessionId || "");
      if (ownerJazzPathBlock) {
        emitBlocked("write", ownerJazzPathBlock, { sid });
        return blockedWriteResult(ownerJazzPathBlock);
      }
      if (!invariant.ok) {
        const reason = toText(invariant.reason || "diagram_jazz_contract_unsupported");
        emitBlocked("write", reason, { sid });
        return blockedWriteResult(reason);
      }
      if (typeof apiPutDiagramJazzXml !== "function") {
        const reason = "diagram_jazz_fe_adapter_api_missing";
        emitBlocked("write", reason, { sid });
        return blockedWriteResult(reason);
      }

      const expectedRevisionCandidate = Number(args?.rev);
      const expectedRevision = Number.isFinite(expectedRevisionCandidate) && expectedRevisionCandidate >= 0
        ? expectedRevisionCandidate
        : (lastAck?.storedRevision ?? null);
      const expectedFingerprint = toText(lastAck?.storedFingerprint || "");

      const writeAttemptTrace = buildTrace("write_attempt", {
        sessionId: sid,
        extra: {
          mode,
          expected_revision: expectedRevision,
          has_expected_fingerprint: expectedFingerprint ? 1 : 0,
        },
      });
      emit(DIAGRAM_JAZZ_TRACE_MARKERS.feWriteAttempt, writeAttemptTrace);
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverAttempt, writeAttemptTrace);
      const response = await apiPutDiagramJazzXml(sid, args?.xml || "", {
        provider,
        expectedRevision,
        expectedFingerprint,
        traceContext: writeAttemptTrace,
      });
      if (!response?.ok) {
        const normalized = normalizeApiError(response, "diagram_jazz_write_failed");
        const normalizedReason = toText(normalized.errorCode || normalized.blocked);
        const tracePayload = buildTrace("write_failed", {
          sessionId: sid,
          correlationId: toText(normalized.correlationId || writeAttemptTrace.correlation_id),
          traceId: toText(normalized.traceId || ""),
          reason: normalizedReason,
          blockedReason: normalizedReason,
          conflictReason: isConflictCode(normalizedReason) ? normalizedReason : "",
          extra: {
            mode,
            status: asNumber(normalized.status, 0),
            error_code: normalizedReason,
            api_trace_layer: toText(normalized.traceLayer || ""),
            api_trace_operation: toText(normalized.traceOperation || ""),
            api_trace_contract_version: toText(normalized.traceContractVersion || ""),
          },
        });
        if (isConflictCode(normalized.errorCode)) {
          emitConflict("write", normalized.errorCode, tracePayload);
        } else {
          emitBlocked("write", normalized.errorCode, tracePayload);
        }
        return normalized;
      }

      const ack = normalizeAck(response?.ack || {});
      lastAck = ack;
      const writeSuccessTrace = buildTrace("write_success", {
        sessionId: sid,
        correlationId: toText(response?.correlationId || writeAttemptTrace.correlation_id),
        traceId: toText(response?.traceId || ""),
        docId: toText(ack.docId || ""),
        docAlias: toText(ack.docAlias || ""),
        mappingId: toText(ack.mappingId || ""),
        extra: {
          mode,
          provider: toText(response?.provider || ack.provider || provider),
          scope_id: toText(ack.scopeId || resolvedIdentity?.scopeId || ""),
          stored_revision: asNumber(ack.storedRevision, 0),
          stored_fingerprint: toText(ack.storedFingerprint),
          api_trace_contract_version: toText(response?.traceContractVersion || ""),
        },
      });
      emit(DIAGRAM_JAZZ_TRACE_MARKERS.feWriteSuccess, writeSuccessTrace);
      emit(DIAGRAM_OWNER_TRACE_MARKERS.cutoverSuccess, writeSuccessTrace);
      return {
        ok: true,
        status: asNumber(response?.status, 200),
        storedRev: asNumber(ack.storedRevision, asNumber(args?.rev, 0)),
        rev: asNumber(ack.storedRevision, asNumber(args?.rev, 0)),
        hash: toText(ack.storedFingerprint || ""),
        durableAck: ack,
      };
    },
  };
}
