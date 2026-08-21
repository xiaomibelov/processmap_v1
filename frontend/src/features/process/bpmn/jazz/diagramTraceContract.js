function toText(value) {
  return String(value || "").trim();
}

function randomId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const DIAGRAM_TRACE_CONTRACT = Object.freeze({
  version: "diagram-trace-contract-v1",
  requiredFields: Object.freeze([
    "trace_id",
    "correlation_id",
    "layer",
    "operation",
    "session_id",
    "project_id",
    "org_id",
    "scope_id",
    "provider",
    "owner_requested_state",
    "owner_effective_state",
    "diagram_owner_state",
    "adapter_mode_effective",
    "cutover_state",
    "rollback_state",
  ]),
});

export const DIAGRAM_TRACE_HEADERS = Object.freeze({
  traceId: "X-Diagram-Trace-Id",
  correlationId: "X-Diagram-Correlation-Id",
  layer: "X-Diagram-Trace-Layer",
  operation: "X-Diagram-Trace-Op",
});

export function createDiagramTraceSeed({
  sessionId = "",
  projectId = "",
  orgId = "",
  scopeId = "",
  provider = "",
  ownerRequestedState = "legacy_owner",
  ownerEffectiveState = "legacy_owner",
  diagramOwnerState = "legacy_owner",
  adapterModeEffective = "legacy",
  ownerRollbackActive = false,
  scopedGateMatch = false,
  scopedGateScope = "",
  scopedGateBlockedReason = "",
  scopedGateOperator = "",
  correlationId = "",
} = {}) {
  const correlation = toText(correlationId || randomId());
  return {
    session_id: toText(sessionId),
    project_id: toText(projectId),
    org_id: toText(orgId),
    scope_id: toText(scopeId),
    provider: toText(provider),
    owner_requested_state: toText(ownerRequestedState || "legacy_owner"),
    owner_effective_state: toText(ownerEffectiveState || "legacy_owner"),
    diagram_owner_state: toText(diagramOwnerState || "legacy_owner"),
    adapter_mode_effective: toText(adapterModeEffective || "legacy"),
    cutover_state: toText(ownerEffectiveState || "legacy_owner"),
    rollback_state: ownerRollbackActive ? "active" : "inactive",
    scoped_gate_match: scopedGateMatch ? 1 : 0,
    scoped_gate_scope: toText(scopedGateScope),
    scoped_gate_blocked_reason: toText(scopedGateBlockedReason),
    scoped_gate_operator: toText(scopedGateOperator),
    correlation_id: correlation,
    trace_contract_version: DIAGRAM_TRACE_CONTRACT.version,
  };
}

export function buildDiagramTracePayload(seed, {
  layer = "",
  operation = "",
  reason = "",
  blockedReason = "",
  conflictReason = "",
  traceId = "",
  docId = "",
  docAlias = "",
  mappingId = "",
  extra = {},
} = {}) {
  const base = seed && typeof seed === "object" ? seed : {};
  return {
    ...base,
    trace_id: toText(traceId || randomId()),
    layer: toText(layer),
    operation: toText(operation),
    reason: toText(reason),
    blocked_reason: toText(blockedReason),
    conflict_reason: toText(conflictReason),
    doc_id: toText(docId),
    doc_alias: toText(docAlias),
    mapping_id: toText(mappingId),
    ...((extra && typeof extra === "object") ? extra : {}),
  };
}

export function traceHeadersFromPayload(payload) {
  const trace = payload && typeof payload === "object" ? payload : {};
  return {
    [DIAGRAM_TRACE_HEADERS.traceId]: toText(trace.trace_id),
    [DIAGRAM_TRACE_HEADERS.correlationId]: toText(trace.correlation_id),
    [DIAGRAM_TRACE_HEADERS.layer]: toText(trace.layer),
    [DIAGRAM_TRACE_HEADERS.operation]: toText(trace.operation),
  };
}
