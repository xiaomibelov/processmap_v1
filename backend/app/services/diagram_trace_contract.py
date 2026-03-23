from __future__ import annotations

import uuid
from typing import Any, Dict, Mapping, Optional


DIAGRAM_TRACE_CONTRACT = {
    "version": "diagram-trace-contract-v1",
    "required_fields": (
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
    ),
}

DIAGRAM_TRACE_HEADERS = {
    "trace_id": "x-diagram-trace-id",
    "correlation_id": "x-diagram-correlation-id",
    "layer": "x-diagram-trace-layer",
    "operation": "x-diagram-trace-op",
}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_int01(value: Any) -> int:
    text = _as_text(value).lower()
    if text in {"1", "true", "yes", "on"}:
        return 1
    if text in {"0", "false", "no", "off", ""}:
        return 0
    try:
        return 1 if int(value) == 1 else 0
    except Exception:
        return 0


def new_trace_id() -> str:
    return uuid.uuid4().hex[:16]


def read_trace_headers(headers: Optional[Mapping[str, Any]]) -> Dict[str, str]:
    source = headers if isinstance(headers, Mapping) else {}
    client_trace_id = _as_text(source.get(DIAGRAM_TRACE_HEADERS["trace_id"], ""))
    correlation_id = _as_text(source.get(DIAGRAM_TRACE_HEADERS["correlation_id"], ""))
    layer = _as_text(source.get(DIAGRAM_TRACE_HEADERS["layer"], ""))
    operation = _as_text(source.get(DIAGRAM_TRACE_HEADERS["operation"], ""))
    return {
        "client_trace_id": client_trace_id,
        "correlation_id": correlation_id,
        "client_layer": layer,
        "client_operation": operation,
    }


def build_trace_payload(
    *,
    trace_id: str,
    correlation_id: str,
    layer: str,
    operation: str,
    session_id: str,
    project_id: str,
    org_id: str,
    scope_id: str,
    provider: str,
    owner_requested_state: str,
    owner_effective_state: str,
    diagram_owner_state: str,
    adapter_mode_effective: str,
    cutover_state: str,
    rollback_state: str,
    blocked_reason: str = "",
    conflict_reason: str = "",
    reason: str = "",
    doc_id: str = "",
    doc_alias: str = "",
    mapping_id: str = "",
    client_trace_id: str = "",
    client_layer: str = "",
    client_operation: str = "",
    scoped_gate_match: Any = "",
    scoped_gate_scope: str = "",
    scoped_gate_blocked_reason: str = "",
    scoped_gate_operator: str = "",
) -> Dict[str, Any]:
    return {
        "trace_id": _as_text(trace_id),
        "correlation_id": _as_text(correlation_id),
        "layer": _as_text(layer),
        "operation": _as_text(operation),
        "session_id": _as_text(session_id),
        "project_id": _as_text(project_id),
        "org_id": _as_text(org_id),
        "scope_id": _as_text(scope_id),
        "provider": _as_text(provider),
        "owner_requested_state": _as_text(owner_requested_state),
        "owner_effective_state": _as_text(owner_effective_state),
        "diagram_owner_state": _as_text(diagram_owner_state),
        "adapter_mode_effective": _as_text(adapter_mode_effective),
        "cutover_state": _as_text(cutover_state),
        "rollback_state": _as_text(rollback_state),
        "blocked_reason": _as_text(blocked_reason),
        "conflict_reason": _as_text(conflict_reason),
        "reason": _as_text(reason),
        "doc_id": _as_text(doc_id),
        "doc_alias": _as_text(doc_alias),
        "mapping_id": _as_text(mapping_id),
        "client_trace_id": _as_text(client_trace_id),
        "client_layer": _as_text(client_layer),
        "client_operation": _as_text(client_operation),
        "scoped_gate_match": _as_int01(scoped_gate_match),
        "scoped_gate_scope": _as_text(scoped_gate_scope),
        "scoped_gate_blocked_reason": _as_text(scoped_gate_blocked_reason),
        "scoped_gate_operator": _as_text(scoped_gate_operator),
        "trace_contract_version": DIAGRAM_TRACE_CONTRACT["version"],
    }
