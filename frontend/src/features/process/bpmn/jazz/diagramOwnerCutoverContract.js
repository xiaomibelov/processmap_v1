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

function normalizeMode(raw) {
  return toText(raw).toLowerCase() === "jazz" ? "jazz" : "legacy";
}

function normalizeOwnerState(raw) {
  const text = toText(raw).toLowerCase();
  if (!text || text === "legacy" || text === "legacy_owner") return "legacy_owner";
  if (text === "jazz" || text === "jazz_owner") return "jazz_owner";
  if (text === "rollback" || text === "rollback_to_legacy") return "rollback_to_legacy";
  return "cutover_blocked";
}

export const DIAGRAM_OWNER_CONTRACT_DRAFT = Object.freeze({
  version: "diagram-owner-cutover-contract-draft-v1",
  states: Object.freeze(["legacy_owner", "jazz_owner", "cutover_blocked", "rollback_to_legacy"]),
  defaultOwner: "legacy_owner",
  cutoverLaw: "single_owner_switch_without_dual_read_write",
  rollbackLaw: "explicit_rollback_trigger_restores_legacy_owner",
});

export const DIAGRAM_OWNER_TRACE_MARKERS = Object.freeze({
  ownerState: "diagram_owner_state",
  cutoverAttempt: "diagram_cutover_attempt",
  cutoverBlocked: "diagram_cutover_blocked",
  cutoverSuccess: "diagram_cutover_success",
  cutoverRollback: "diagram_cutover_rollback",
  cutoverInvariantViolation: "diagram_cutover_invariant_violation",
});

function firstFailedReason(preconditions = {}) {
  const ordered = [
    ["owner_switch_approved", "diagram_cutover_blocked_owner_switch_not_approved"],
    ["cutover_switch_enabled", "diagram_cutover_blocked_switch_not_enabled"],
    ["frontend_gate_ready", "diagram_cutover_blocked_frontend_gate_not_ready"],
    ["frontend_mode_jazz", "diagram_cutover_blocked_frontend_mode_not_jazz"],
    ["provider_ready", "diagram_cutover_blocked_provider_missing"],
    ["backend_api_ready", "diagram_cutover_blocked_api_not_ready"],
    ["rollback_ready", "diagram_cutover_blocked_rollback_not_ready"],
    ["observability_ready", "diagram_cutover_blocked_observability_not_ready"],
    ["contract_version_match", "diagram_cutover_blocked_contract_mismatch"],
  ];
  for (const [key, reason] of ordered) {
    if (Number(preconditions?.[key] || 0) !== 1) return reason;
  }
  return "";
}

function scopeFromParts(orgId, projectId, sessionId) {
  const org = toText(orgId);
  const project = toText(projectId);
  const session = toText(sessionId);
  if (!org || !project || !session) return "";
  return `${org}::${project}::${session}`;
}

function parseScopedAllowlist(raw) {
  const text = toText(raw);
  if (!text) return { present: false, malformed: false, entries: [] };
  const tokens = text
    .replace(/\n/g, ",")
    .replace(/;/g, ",")
    .split(",")
    .map((part) => toText(part))
    .filter(Boolean);
  const entries = [];
  let malformed = false;
  for (const token of tokens) {
    const [scopePart, operatorPartRaw = ""] = token.split("@");
    const scopeText = toText(scopePart);
    const operatorText = toText(operatorPartRaw);
    const chunks = scopeText.split("::").map((item) => toText(item));
    if (chunks.length !== 3 || chunks.some((item) => !item)) {
      malformed = true;
      continue;
    }
    if (token.includes("@") && !operatorText) {
      malformed = true;
      continue;
    }
    entries.push({
      scopeId: chunks.join("::"),
      operatorId: operatorText,
    });
  }
  if (!entries.length) malformed = true;
  return { present: true, malformed, entries };
}

function evaluateScopedGate(env, { scopeId = "", operatorId = "" } = {}) {
  const parsed = parseScopedAllowlist(env?.VITE_DIAGRAM_JAZZ_SCOPE_ALLOWLIST);
  if (!parsed.present) {
    return {
      match: false,
      reason: "diagram_cutover_blocked_scope_allowlist_missing",
      scopeId: toText(scopeId),
      operatorId: toText(operatorId),
    };
  }
  if (parsed.malformed) {
    return {
      match: false,
      reason: "diagram_cutover_blocked_scope_allowlist_malformed",
      scopeId: toText(scopeId),
      operatorId: toText(operatorId),
    };
  }
  if (!toText(scopeId)) {
    return {
      match: false,
      reason: "diagram_cutover_blocked_scope_context_missing",
      scopeId: "",
      operatorId: toText(operatorId),
    };
  }
  const scopeMatches = parsed.entries.filter((entry) => toText(entry.scopeId) === toText(scopeId));
  if (!scopeMatches.length) {
    return {
      match: false,
      reason: "diagram_cutover_blocked_scope_not_allowed",
      scopeId: toText(scopeId),
      operatorId: toText(operatorId),
    };
  }
  if (scopeMatches.some((entry) => !toText(entry.operatorId))) {
    return {
      match: true,
      reason: "",
      scopeId: toText(scopeId),
      operatorId: toText(operatorId),
    };
  }
  if (!toText(operatorId)) {
    return {
      match: false,
      reason: "diagram_cutover_blocked_operator_context_missing",
      scopeId: toText(scopeId),
      operatorId: "",
    };
  }
  if (!scopeMatches.some((entry) => toText(entry.operatorId) === toText(operatorId))) {
    return {
      match: false,
      reason: "diagram_cutover_blocked_operator_not_allowed",
      scopeId: toText(scopeId),
      operatorId: toText(operatorId),
    };
  }
  return {
    match: true,
    reason: "",
    scopeId: toText(scopeId),
    operatorId: toText(operatorId),
  };
}

export function resolveDiagramOwnerCutoverState(options = {}) {
  const env = (options?.envOverride && typeof options.envOverride === "object")
    ? options.envOverride
    : (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {});
  const requestedRaw = toText(env.VITE_DIAGRAM_OWNER_STATE);
  const requestedState = normalizeOwnerState(requestedRaw);
  const source = requestedRaw ? "env" : "default";
  const scopeOverride = (options?.scopeOverride && typeof options.scopeOverride === "object")
    ? options.scopeOverride
    : {};
  const effectiveScope = toText(scopeOverride.scopeId) || scopeFromParts(
    scopeOverride.orgId,
    scopeOverride.projectId,
    scopeOverride.sessionId,
  );
  const scopedOperator = toText(scopeOverride.operatorId);

  const cutoverSwitchEnabled = parseBool(env.VITE_DIAGRAM_JAZZ_CUTOVER_ENABLE, false);
  const ownerSwitchApproved = parseBool(env.VITE_DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED, false);
  const frontendGateReady = parseBool(env.VITE_DIAGRAM_JAZZ_CONTRACT_DRAFT, false);
  const frontendModeJazz = normalizeMode(env.VITE_DIAGRAM_JAZZ_ADAPTER) === "jazz";
  const providerReady = !!toText(env.VITE_DIAGRAM_JAZZ_PEER);
  const backendApiReady = parseBool(env.VITE_DIAGRAM_JAZZ_BACKEND_API_READY, false);
  const rollbackReady = parseBool(env.VITE_DIAGRAM_JAZZ_ROLLBACK_READY, false);
  const rollbackTrigger = parseBool(env.VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER, false);
  const observabilityReady = parseBool(env.VITE_DIAGRAM_JAZZ_OBSERVABILITY_READY, false);
  const requiredContractVersion = toText(env.VITE_DIAGRAM_JAZZ_REQUIRED_CONTRACT_VERSION || "diagram-jazz-backend-contract-draft-v1");
  const activeContractVersion = toText(env.VITE_DIAGRAM_JAZZ_CONTRACT_VERSION);
  const contractVersionMatch = !!activeContractVersion && activeContractVersion === requiredContractVersion;

  const preconditions = {
    owner_switch_approved: ownerSwitchApproved ? 1 : 0,
    cutover_switch_enabled: cutoverSwitchEnabled ? 1 : 0,
    frontend_gate_ready: frontendGateReady ? 1 : 0,
    frontend_mode_jazz: frontendModeJazz ? 1 : 0,
    provider_ready: providerReady ? 1 : 0,
    backend_api_ready: backendApiReady ? 1 : 0,
    rollback_ready: rollbackReady ? 1 : 0,
    observability_ready: observabilityReady ? 1 : 0,
    contract_version_match: contractVersionMatch ? 1 : 0,
  };
  let scopedGate = {
    match: false,
    reason: "",
    scopeId: effectiveScope,
    operatorId: scopedOperator,
  };

  if (requestedState === "cutover_blocked") {
    return {
      requestedState,
      effectiveState: "cutover_blocked",
      diagramOwner: "legacy_owner",
      blockedReason: "diagram_cutover_state_invalid",
      rollbackTriggered: false,
      switchApproved: ownerSwitchApproved,
      preconditions,
      source,
      scopedGateMatch: false,
      scopedGateScope: effectiveScope,
      scopedGateBlockedReason: "diagram_cutover_state_invalid",
      scopedGateOperator: scopedOperator,
    };
  }

  if (requestedState === "rollback_to_legacy") {
    if (!rollbackReady) {
      return {
        requestedState,
        effectiveState: "cutover_blocked",
        diagramOwner: "legacy_owner",
        blockedReason: "diagram_cutover_rollback_not_ready",
        rollbackTriggered: false,
        switchApproved: ownerSwitchApproved,
        preconditions,
        source,
        scopedGateMatch: false,
        scopedGateScope: effectiveScope,
        scopedGateBlockedReason: "",
        scopedGateOperator: scopedOperator,
      };
    }
    if (!rollbackTrigger) {
      return {
        requestedState,
        effectiveState: "cutover_blocked",
        diagramOwner: "legacy_owner",
        blockedReason: "diagram_cutover_rollback_trigger_missing",
        rollbackTriggered: false,
        switchApproved: ownerSwitchApproved,
        preconditions,
        source,
        scopedGateMatch: false,
        scopedGateScope: effectiveScope,
        scopedGateBlockedReason: "",
        scopedGateOperator: scopedOperator,
      };
    }
    return {
      requestedState,
      effectiveState: "rollback_to_legacy",
      diagramOwner: "legacy_owner",
      blockedReason: "",
      rollbackTriggered: true,
      switchApproved: ownerSwitchApproved,
      preconditions,
      source,
      scopedGateMatch: false,
      scopedGateScope: effectiveScope,
      scopedGateBlockedReason: "",
      scopedGateOperator: scopedOperator,
    };
  }

  if (requestedState === "legacy_owner") {
    return {
      requestedState,
      effectiveState: "legacy_owner",
      diagramOwner: "legacy_owner",
      blockedReason: "",
      rollbackTriggered: false,
      switchApproved: ownerSwitchApproved,
      preconditions,
      source,
      scopedGateMatch: false,
      scopedGateScope: effectiveScope,
      scopedGateBlockedReason: "",
      scopedGateOperator: scopedOperator,
    };
  }

  if (rollbackTrigger) {
    return {
      requestedState: "jazz_owner",
      effectiveState: "cutover_blocked",
      diagramOwner: "legacy_owner",
      blockedReason: "diagram_cutover_blocked_rollback_triggered",
      rollbackTriggered: true,
      switchApproved: ownerSwitchApproved,
      preconditions,
      source,
      scopedGateMatch: false,
      scopedGateScope: effectiveScope,
      scopedGateBlockedReason: "diagram_cutover_blocked_rollback_triggered",
      scopedGateOperator: scopedOperator,
    };
  }

  scopedGate = evaluateScopedGate(env, {
    scopeId: effectiveScope,
    operatorId: scopedOperator,
  });
  preconditions.scoped_gate_match = scopedGate.match ? 1 : 0;
  if (!scopedGate.match) {
    return {
      requestedState: "jazz_owner",
      effectiveState: "cutover_blocked",
      diagramOwner: "legacy_owner",
      blockedReason: toText(scopedGate.reason || "diagram_cutover_blocked_scope_not_allowed"),
      rollbackTriggered: false,
      switchApproved: ownerSwitchApproved,
      preconditions,
      source,
      scopedGateMatch: false,
      scopedGateScope: toText(scopedGate.scopeId),
      scopedGateBlockedReason: toText(scopedGate.reason || "diagram_cutover_blocked_scope_not_allowed"),
      scopedGateOperator: toText(scopedGate.operatorId),
    };
  }

  const blockedReason = firstFailedReason(preconditions);
  if (blockedReason) {
    return {
      requestedState: "jazz_owner",
      effectiveState: "cutover_blocked",
      diagramOwner: "legacy_owner",
      blockedReason,
      rollbackTriggered: false,
      switchApproved: ownerSwitchApproved,
      preconditions,
      source,
      scopedGateMatch: true,
      scopedGateScope: toText(scopedGate.scopeId),
      scopedGateBlockedReason: "",
      scopedGateOperator: toText(scopedGate.operatorId),
    };
  }

  return {
    requestedState: "jazz_owner",
    effectiveState: "jazz_owner",
    diagramOwner: "jazz_owner",
    blockedReason: "",
    rollbackTriggered: false,
    switchApproved: ownerSwitchApproved,
    preconditions,
    source,
    scopedGateMatch: true,
    scopedGateScope: toText(scopedGate.scopeId),
    scopedGateBlockedReason: "",
    scopedGateOperator: toText(scopedGate.operatorId),
  };
}

export function ownerPathBlockReason(stateLike, pathKind) {
  const state = stateLike && typeof stateLike === "object" ? stateLike : {};
  const path = toText(pathKind).toLowerCase();
  if (path !== "legacy" && path !== "jazz") return "diagram_cutover_invariant_violation_unknown_path";
  if (toText(state.effectiveState) === "cutover_blocked") return toText(state.blockedReason || "diagram_cutover_blocked");
  if (state.rollbackTriggered === true && path === "jazz") return "diagram_cutover_rollback_active";
  if (toText(state.diagramOwner) === "legacy_owner" && path === "jazz") return "diagram_cutover_owner_legacy_path_locked";
  if (toText(state.diagramOwner) === "jazz_owner" && path === "legacy") return "diagram_cutover_owner_jazz_path_locked";
  return "";
}
