from __future__ import annotations

import json
import uuid
from dataclasses import replace
from typing import Any, Callable, Dict, Mapping, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import _legacy_main
from ..services.diagram_jazz_contract import (
    DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS,
    DiagramJazzBackendActivation,
    DiagramJazzBackendContractDraftAdapter,
    build_diagram_jazz_backend_identity,
    resolve_diagram_jazz_backend_activation,
)
from ..services.diagram_owner_cutover import DIAGRAM_OWNER_TRACE_MARKERS
from ..services.diagram_trace_contract import (
    DIAGRAM_TRACE_CONTRACT,
    build_trace_payload,
    new_trace_id,
    read_trace_headers,
)

router = APIRouter()

DIAGRAM_JAZZ_API_TRACE_MARKERS = {
    "read_attempt": "diagram_jazz_api_read_attempt",
    "write_attempt": "diagram_jazz_api_write_attempt",
    "read_success": "diagram_jazz_api_read_success",
    "write_success": "diagram_jazz_api_write_success",
    "conflict": "diagram_jazz_api_conflict",
    "blocked": "diagram_jazz_api_blocked",
}


class DiagramJazzWriteIn(BaseModel):
    xml: str = Field(default="", description="BPMN XML payload to persist into Diagram->Jazz durable storage")
    expected_revision: Optional[int] = Field(default=None, description="Optimistic concurrency check")
    expected_fingerprint: Optional[str] = Field(default="", description="Optional concurrency fingerprint check")
    provider: Optional[str] = Field(default=None, description="Provider override for future multi-provider routing")


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_raw_text(value: Any) -> str:
    return "" if value is None else str(value)


def _api_status_for_reason(reason_raw: Any, fallback: int = 400) -> int:
    reason = _as_text(reason_raw).lower()
    if not reason:
        return int(fallback)
    if reason in {"unauthorized"}:
        return 401
    if reason in {"forbidden"}:
        return 403
    if "not_found" in reason or "mapping_missing" in reason or "payload_missing" in reason:
        return 404
    if "disabled" in reason:
        return 503
    if "cutover_blocked" in reason or "owner_" in reason or "rollback" in reason:
        return 409
    if "missing" in reason or "invalid" in reason:
        return 422
    if "conflict" in reason or "mismatch" in reason:
        return 409
    return int(fallback)


def _api_error_message(reason_raw: Any) -> str:
    reason = _as_text(reason_raw)
    custom = {
        "diagram_jazz_backend_disabled": "Diagram->Jazz API is disabled by gate.",
        "diagram_jazz_backend_provider_missing": "Diagram->Jazz provider is not configured.",
        "diagram_jazz_provider_mismatch": "Requested provider does not match active provider.",
        "diagram_jazz_identity_invalid": "Diagram->Jazz identity is invalid for this session.",
        "diagram_jazz_mapping_missing": "Diagram->Jazz mapping is missing for this session scope.",
        "diagram_jazz_payload_missing": "Diagram->Jazz payload is missing for this mapped document.",
        "diagram_jazz_payload_invalid": "Diagram->Jazz payload is malformed or empty.",
        "diagram_jazz_revision_conflict": "Diagram->Jazz write rejected by revision conflict.",
        "diagram_jazz_fingerprint_conflict": "Diagram->Jazz write rejected by fingerprint conflict.",
        "diagram_jazz_document_conflict": "Diagram->Jazz document ownership invariant conflict.",
        "diagram_cutover_owner_legacy_path_locked": "Diagram owner is legacy; Jazz path is locked.",
        "diagram_cutover_owner_jazz_path_locked": "Diagram owner is Jazz; legacy path is locked.",
        "diagram_cutover_rollback_active": "Diagram cutover rollback is active; Jazz path is blocked.",
        "diagram_cutover_invariant_violation_mode_owner_mismatch": "Diagram owner and mode invariant mismatch.",
        "diagram_cutover_blocked_owner_switch_not_approved": "Diagram cutover blocked: owner switch is not approved.",
        "diagram_cutover_blocked_switch_not_enabled": "Diagram cutover blocked: cutover switch is disabled.",
        "diagram_cutover_blocked_backend_gate_not_ready": "Diagram cutover blocked: backend gate is not ready.",
        "diagram_cutover_blocked_backend_mode_not_jazz": "Diagram cutover blocked: backend mode is not Jazz.",
        "diagram_cutover_blocked_provider_missing": "Diagram cutover blocked: provider is missing.",
        "diagram_cutover_blocked_api_not_ready": "Diagram cutover blocked: API readiness is false.",
        "diagram_cutover_blocked_rollback_not_ready": "Diagram cutover blocked: rollback readiness is false.",
        "diagram_cutover_blocked_observability_not_ready": "Diagram cutover blocked: observability readiness is false.",
        "diagram_cutover_blocked_contract_mismatch": "Diagram cutover blocked: contract version mismatch.",
        "diagram_cutover_rollback_not_ready": "Diagram rollback requested but rollback readiness is false.",
        "diagram_cutover_rollback_trigger_missing": "Diagram rollback requested without explicit rollback trigger.",
        "diagram_cutover_state_invalid": "Diagram cutover blocked: owner state is invalid.",
    }
    if reason in custom:
        return custom[reason]
    return "Diagram->Jazz API request rejected by contract guard."


def _emit_api_marker(
    event: str,
    payload: Optional[Dict[str, Any]] = None,
    *,
    on_marker: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> None:
    safe_payload = dict(payload or {})
    if callable(on_marker):
        try:
            on_marker(str(event or "unknown"), safe_payload)
        except Exception:
            pass
    try:
        print(f"[DIAGRAM_JAZZ_API] {json.dumps({'event': str(event or 'unknown'), **safe_payload}, ensure_ascii=False)}")
    except Exception:
        pass


def _api_error_payload(
    *,
    session_id: str,
    trace_id: str,
    provider: str,
    scope_id: str,
    reason: str,
    status: int,
    adapter_trace_tail: Optional[list[Dict[str, Any]]] = None,
    activation: Optional[DiagramJazzBackendActivation] = None,
    trace_payload: Optional[Dict[str, Any]] = None,
    project_id: str = "",
    org_id: str = "",
) -> Dict[str, Any]:
    payload = {
        "ok": False,
        "status": int(status),
        "session_id": _as_text(session_id),
        "project_id": _as_text(project_id),
        "org_id": _as_text(org_id),
        "provider": _as_text(provider),
        "scope_id": _as_text(scope_id),
        "trace_id": _as_text(trace_id),
        "error_code": _as_text(reason),
        "blocked": _as_text(reason),
        "error": _api_error_message(reason),
        "adapter_trace_tail": list(adapter_trace_tail or []),
        "owner_requested_state": _as_text(getattr(activation, "owner_requested_state", "legacy_owner")),
        "owner_effective_state": _as_text(getattr(activation, "owner_effective_state", "legacy_owner")),
        "diagram_owner_state": _as_text(getattr(activation, "owner_state", "legacy_owner")),
        "owner_blocked_reason": _as_text(getattr(activation, "owner_blocked_reason", "")),
        "owner_rollback_active": 1 if bool(getattr(activation, "owner_rollback_active", False)) else 0,
        "scoped_gate_match": 1 if bool(getattr(activation, "scoped_gate_match", False)) else 0,
        "scoped_gate_scope": _as_text(getattr(activation, "scoped_gate_scope", "")),
        "scoped_gate_blocked_reason": _as_text(getattr(activation, "scoped_gate_blocked_reason", "")),
        "scoped_gate_operator": _as_text(getattr(activation, "scoped_gate_operator", "")),
        "correlation_id": _as_text((trace_payload or {}).get("correlation_id")),
        "client_trace_id": _as_text((trace_payload or {}).get("client_trace_id")),
        "trace_layer": _as_text((trace_payload or {}).get("layer")),
        "trace_operation": _as_text((trace_payload or {}).get("operation")),
        "trace_contract_version": _as_text((trace_payload or {}).get("trace_contract_version")),
    }
    return payload


def _activation_with_provider(activation: DiagramJazzBackendActivation, provider_raw: Any) -> DiagramJazzBackendActivation:
    requested = _as_text(provider_raw).lower()
    active = _as_text(activation.provider).lower()
    provider_text = active or requested
    unsupported_reason = _as_text(activation.unsupported_reason)
    if activation.jazz_mode and not provider_text:
        unsupported_reason = "diagram_jazz_backend_provider_missing"
    return replace(
        activation,
        provider=provider_text,
        unsupported=bool(unsupported_reason),
        unsupported_reason=unsupported_reason,
    )


def _provider_guard(
    *,
    requested_provider: str,
    active_provider: str,
) -> Optional[str]:
    req = _as_text(requested_provider).lower()
    active = _as_text(active_provider).lower()
    if req and active and req != active:
        return "diagram_jazz_provider_mismatch"
    return None


def _emit_owner_markers(
    *,
    activation: DiagramJazzBackendActivation,
    trace_base: Dict[str, Any],
    on_marker: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> None:
    base_payload = dict(trace_base or {})
    base_payload.update({
        "owner_requested_state": _as_text(activation.owner_requested_state or "legacy_owner"),
        "owner_effective_state": _as_text(activation.owner_effective_state or "legacy_owner"),
        "diagram_owner_state": _as_text(activation.owner_state or "legacy_owner"),
        "owner_blocked_reason": _as_text(activation.owner_blocked_reason),
        "owner_rollback_active": 1 if activation.owner_rollback_active else 0,
        "scoped_gate_match": 1 if activation.scoped_gate_match else 0,
        "scoped_gate_scope": _as_text(activation.scoped_gate_scope),
        "scoped_gate_blocked_reason": _as_text(activation.scoped_gate_blocked_reason),
        "scoped_gate_operator": _as_text(activation.scoped_gate_operator),
        "adapter_mode_effective": _as_text(activation.effective_mode),
        "cutover_state": _as_text(activation.owner_effective_state or "legacy_owner"),
        "rollback_state": "active" if activation.owner_rollback_active else "inactive",
    })
    _emit_api_marker(DIAGRAM_OWNER_TRACE_MARKERS["owner_state"], base_payload, on_marker=on_marker)

    if _as_text(activation.owner_requested_state or "") == "jazz_owner":
        _emit_api_marker(DIAGRAM_OWNER_TRACE_MARKERS["cutover_attempt"], base_payload, on_marker=on_marker)
    if _as_text(activation.owner_effective_state or "") == "cutover_blocked":
        _emit_api_marker(DIAGRAM_OWNER_TRACE_MARKERS["cutover_blocked"], base_payload, on_marker=on_marker)
    elif _as_text(activation.owner_effective_state or "") == "jazz_owner":
        _emit_api_marker(DIAGRAM_OWNER_TRACE_MARKERS["cutover_success"], base_payload, on_marker=on_marker)
    if activation.owner_rollback_active:
        _emit_api_marker(DIAGRAM_OWNER_TRACE_MARKERS["cutover_rollback"], base_payload, on_marker=on_marker)
    if "invariant" in _as_text(activation.owner_blocked_reason).lower() or "invariant" in _as_text(activation.unsupported_reason).lower():
        _emit_api_marker(DIAGRAM_OWNER_TRACE_MARKERS["cutover_invariant_violation"], base_payload, on_marker=on_marker)


def _build_api_trace_base(
    *,
    trace_id: str,
    correlation_id: str,
    request_trace: Optional[Dict[str, str]],
    layer: str,
    operation: str,
    session_id: str,
    org_id: str,
    project_id: str,
    scope_id: str,
    provider: str,
    activation: DiagramJazzBackendActivation,
    reason: str = "",
    blocked_reason: str = "",
    conflict_reason: str = "",
    doc_id: str = "",
    doc_alias: str = "",
    mapping_id: str = "",
) -> Dict[str, Any]:
    req = request_trace if isinstance(request_trace, dict) else {}
    return build_trace_payload(
        trace_id=trace_id,
        correlation_id=correlation_id,
        layer=layer,
        operation=operation,
        session_id=session_id,
        project_id=project_id,
        org_id=org_id,
        scope_id=scope_id,
        provider=provider,
        owner_requested_state=_as_text(activation.owner_requested_state or "legacy_owner"),
        owner_effective_state=_as_text(activation.owner_effective_state or "legacy_owner"),
        diagram_owner_state=_as_text(activation.owner_state or "legacy_owner"),
        adapter_mode_effective=_as_text(activation.effective_mode),
        cutover_state=_as_text(activation.owner_effective_state or "legacy_owner"),
        rollback_state="active" if activation.owner_rollback_active else "inactive",
        blocked_reason=blocked_reason,
        conflict_reason=conflict_reason,
        reason=reason,
        doc_id=doc_id,
        doc_alias=doc_alias,
        mapping_id=mapping_id,
        client_trace_id=_as_text(req.get("client_trace_id")),
        client_layer=_as_text(req.get("client_layer")),
        client_operation=_as_text(req.get("client_operation")),
        scoped_gate_match=1 if activation.scoped_gate_match else 0,
        scoped_gate_scope=_as_text(activation.scoped_gate_scope),
        scoped_gate_blocked_reason=_as_text(activation.scoped_gate_blocked_reason),
        scoped_gate_operator=_as_text(activation.scoped_gate_operator),
    )


def diagram_jazz_api_read_contract(
    *,
    session_id: str,
    org_id: str,
    project_id: str,
    provider: str = "",
    operator_user_id: str = "",
    env: Optional[Mapping[str, str]] = None,
    request_trace: Optional[Dict[str, str]] = None,
    on_marker: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    request_trace_meta = request_trace if isinstance(request_trace, dict) else {}
    trace_id = new_trace_id()
    correlation_id = _as_text(request_trace_meta.get("correlation_id")) or trace_id
    adapter_trace: list[Dict[str, Any]] = []
    activation = _activation_with_provider(
        resolve_diagram_jazz_backend_activation(
            env,
            org_id=org_id,
            project_id=project_id,
            session_id=session_id,
            operator_user_id=operator_user_id,
        ),
        provider,
    )
    identity = build_diagram_jazz_backend_identity(
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
    )
    trace_base = _build_api_trace_base(
        trace_id=trace_id,
        correlation_id=correlation_id,
        request_trace=request_trace_meta,
        layer="api",
        operation="read",
        session_id=session_id,
        org_id=org_id,
        project_id=project_id,
        scope_id=identity.scope_id,
        provider=_as_text(activation.provider),
        activation=activation,
    )
    _emit_owner_markers(
        activation=activation,
        trace_base=trace_base,
        on_marker=on_marker,
    )
    provider_mismatch = _provider_guard(requested_provider=provider, active_provider=activation.provider)
    if provider_mismatch:
        status = _api_status_for_reason(provider_mismatch, 409)
        payload = _api_error_payload(
            session_id=session_id,
            trace_id=trace_id,
            provider=activation.provider,
            scope_id=identity.scope_id,
            reason=provider_mismatch,
            status=status,
            activation=activation,
            trace_payload=_build_api_trace_base(
                trace_id=trace_id,
                correlation_id=correlation_id,
                request_trace=request_trace_meta,
                layer="api",
                operation="read",
                session_id=session_id,
                org_id=org_id,
                project_id=project_id,
                scope_id=identity.scope_id,
                provider=_as_text(activation.provider),
                activation=activation,
                blocked_reason=provider_mismatch,
                reason=provider_mismatch,
                conflict_reason=provider_mismatch,
            ),
            project_id=project_id,
            org_id=org_id,
        )
        _emit_api_marker(DIAGRAM_JAZZ_API_TRACE_MARKERS["blocked"], payload, on_marker=on_marker)
        return payload

    _emit_api_marker(
        DIAGRAM_JAZZ_API_TRACE_MARKERS["read_attempt"],
        trace_base,
        on_marker=on_marker,
    )

    def capture_adapter_event(event: str, payload_raw: Dict[str, Any]) -> None:
        payload = dict(payload_raw or {})
        doc_id = _as_text(payload.get("doc_id"))
        mapping_id = _as_text(payload.get("mapping_id"))
        adapter_event_payload = _build_api_trace_base(
            trace_id=trace_id,
            correlation_id=correlation_id,
            request_trace=request_trace_meta,
            layer="adapter",
            operation=_as_text(event or "adapter_event"),
            session_id=session_id,
            org_id=org_id,
            project_id=project_id,
            scope_id=_as_text(payload.get("scope_id") or identity.scope_id),
            provider=_as_text(payload.get("provider") or activation.provider),
            activation=activation,
            reason=_as_text(payload.get("reason")),
            blocked_reason=_as_text(payload.get("reason")),
            conflict_reason=_as_text(payload.get("reason") if "conflict" in _as_text(event).lower() else ""),
            doc_id=doc_id,
            doc_alias=_as_text(identity.doc_alias),
            mapping_id=mapping_id,
        )
        adapter_trace.append({"event": event, "payload": dict(payload or {}), "trace": adapter_event_payload})
        _emit_api_marker(_as_text(event or "diagram_jazz_adapter_event"), adapter_event_payload, on_marker=on_marker)

    adapter = DiagramJazzBackendContractDraftAdapter(
        activation=activation,
        on_trace=capture_adapter_event,
    )
    out = adapter.read_durable_xml(identity=identity)
    if not bool(out.get("ok")):
        reason = _as_text(out.get("blocked") or out.get("error_code") or "diagram_jazz_api_read_blocked")
        status = int(out.get("status") or _api_status_for_reason(reason, 400))
        payload = _api_error_payload(
            session_id=session_id,
            trace_id=trace_id,
            provider=activation.provider,
            scope_id=identity.scope_id,
            reason=reason,
            status=status,
            adapter_trace_tail=adapter_trace[-8:],
            activation=activation,
            trace_payload=_build_api_trace_base(
                trace_id=trace_id,
                correlation_id=correlation_id,
                request_trace=request_trace_meta,
                layer="api",
                operation="read",
                session_id=session_id,
                org_id=org_id,
                project_id=project_id,
                scope_id=identity.scope_id,
                provider=_as_text(activation.provider),
                activation=activation,
                blocked_reason=reason,
                reason=reason,
                conflict_reason=reason if ("conflict" in reason or "mismatch" in reason) else "",
            ),
            project_id=project_id,
            org_id=org_id,
        )
        marker = (
            DIAGRAM_JAZZ_API_TRACE_MARKERS["conflict"]
            if ("conflict" in reason or "mismatch" in reason)
            else DIAGRAM_JAZZ_API_TRACE_MARKERS["blocked"]
        )
        _emit_api_marker(marker, payload, on_marker=on_marker)
        return payload

    ack = dict(out.get("durable_ack") or {})
    payload = {
        "ok": True,
        "status": 200,
        "trace_id": trace_id,
        "correlation_id": correlation_id,
        "client_trace_id": _as_text(request_trace_meta.get("client_trace_id")),
        "session_id": _as_text(session_id),
        "project_id": _as_text(project_id),
        "org_id": _as_text(org_id),
        "provider": _as_text(ack.get("provider") or activation.provider),
        "mode": _as_text(activation.effective_mode),
        "owner_requested_state": _as_text(activation.owner_requested_state or "legacy_owner"),
        "owner_effective_state": _as_text(activation.owner_effective_state or "legacy_owner"),
        "diagram_owner_state": _as_text(activation.owner_state or "legacy_owner"),
        "owner_blocked_reason": _as_text(activation.owner_blocked_reason),
        "owner_rollback_active": 1 if activation.owner_rollback_active else 0,
        "scoped_gate_match": 1 if activation.scoped_gate_match else 0,
        "scoped_gate_scope": _as_text(activation.scoped_gate_scope),
        "scoped_gate_blocked_reason": _as_text(activation.scoped_gate_blocked_reason),
        "scoped_gate_operator": _as_text(activation.scoped_gate_operator),
        "trace_contract_version": _as_text(DIAGRAM_TRACE_CONTRACT.get("version")),
        "ack": ack,
        "xml": _as_raw_text(out.get("xml")),
        "adapter_trace_tail": adapter_trace[-8:],
    }
    _emit_api_marker(
        DIAGRAM_JAZZ_API_TRACE_MARKERS["read_success"],
        {
            **_build_api_trace_base(
                trace_id=trace_id,
                correlation_id=correlation_id,
                request_trace=request_trace_meta,
                layer="api",
                operation="read_success",
                session_id=session_id,
                org_id=org_id,
                project_id=project_id,
                scope_id=_as_text(ack.get("scope_id") or identity.scope_id),
                provider=_as_text(ack.get("provider") or activation.provider),
                activation=activation,
                doc_id=_as_text(ack.get("doc_id")),
                doc_alias=_as_text(ack.get("doc_alias") or identity.doc_alias),
                mapping_id=_as_text(ack.get("mapping_id")),
            ),
            "stored_revision": int(ack.get("stored_revision") or 0),
            "adapter_event": DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["read_success"],
        },
        on_marker=on_marker,
    )
    return payload


def diagram_jazz_api_write_contract(
    *,
    session_id: str,
    org_id: str,
    project_id: str,
    payload: DiagramJazzWriteIn,
    provider_query: str = "",
    operator_user_id: str = "",
    env: Optional[Mapping[str, str]] = None,
    request_trace: Optional[Dict[str, str]] = None,
    on_marker: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    request_trace_meta = request_trace if isinstance(request_trace, dict) else {}
    trace_id = new_trace_id()
    correlation_id = _as_text(request_trace_meta.get("correlation_id")) or trace_id
    adapter_trace: list[Dict[str, Any]] = []
    provider_req = _as_text(getattr(payload, "provider", "") or provider_query)
    activation = _activation_with_provider(
        resolve_diagram_jazz_backend_activation(
            env,
            org_id=org_id,
            project_id=project_id,
            session_id=session_id,
            operator_user_id=operator_user_id,
        ),
        provider_req,
    )
    identity = build_diagram_jazz_backend_identity(
        org_id=org_id,
        project_id=project_id,
        session_id=session_id,
    )
    trace_base = _build_api_trace_base(
        trace_id=trace_id,
        correlation_id=correlation_id,
        request_trace=request_trace_meta,
        layer="api",
        operation="write",
        session_id=session_id,
        org_id=org_id,
        project_id=project_id,
        scope_id=identity.scope_id,
        provider=_as_text(activation.provider),
        activation=activation,
    )
    _emit_owner_markers(
        activation=activation,
        trace_base=trace_base,
        on_marker=on_marker,
    )
    provider_mismatch = _provider_guard(requested_provider=provider_req, active_provider=activation.provider)
    if provider_mismatch:
        status = _api_status_for_reason(provider_mismatch, 409)
        out = _api_error_payload(
            session_id=session_id,
            trace_id=trace_id,
            provider=activation.provider,
            scope_id=identity.scope_id,
            reason=provider_mismatch,
            status=status,
            activation=activation,
            trace_payload=_build_api_trace_base(
                trace_id=trace_id,
                correlation_id=correlation_id,
                request_trace=request_trace_meta,
                layer="api",
                operation="write",
                session_id=session_id,
                org_id=org_id,
                project_id=project_id,
                scope_id=identity.scope_id,
                provider=_as_text(activation.provider),
                activation=activation,
                blocked_reason=provider_mismatch,
                reason=provider_mismatch,
                conflict_reason=provider_mismatch,
            ),
            project_id=project_id,
            org_id=org_id,
        )
        _emit_api_marker(DIAGRAM_JAZZ_API_TRACE_MARKERS["blocked"], out, on_marker=on_marker)
        return out

    _emit_api_marker(
        DIAGRAM_JAZZ_API_TRACE_MARKERS["write_attempt"],
        {
            **trace_base,
            "expected_revision": getattr(payload, "expected_revision", None),
            "has_expected_fingerprint": 1 if _as_text(getattr(payload, "expected_fingerprint", "")) else 0,
        },
        on_marker=on_marker,
    )

    def capture_adapter_event(event: str, payload_raw: Dict[str, Any]) -> None:
        payload_item = dict(payload_raw or {})
        adapter_event_payload = _build_api_trace_base(
            trace_id=trace_id,
            correlation_id=correlation_id,
            request_trace=request_trace_meta,
            layer="adapter",
            operation=_as_text(event or "adapter_event"),
            session_id=session_id,
            org_id=org_id,
            project_id=project_id,
            scope_id=_as_text(payload_item.get("scope_id") or identity.scope_id),
            provider=_as_text(payload_item.get("provider") or activation.provider),
            activation=activation,
            reason=_as_text(payload_item.get("reason")),
            blocked_reason=_as_text(payload_item.get("reason")),
            conflict_reason=_as_text(payload_item.get("reason") if "conflict" in _as_text(event).lower() else ""),
            doc_id=_as_text(payload_item.get("doc_id")),
            doc_alias=_as_text(identity.doc_alias),
            mapping_id=_as_text(payload_item.get("mapping_id")),
        )
        adapter_trace.append({"event": event, "payload": payload_item, "trace": adapter_event_payload})
        _emit_api_marker(_as_text(event or "diagram_jazz_adapter_event"), adapter_event_payload, on_marker=on_marker)

    adapter = DiagramJazzBackendContractDraftAdapter(
        activation=activation,
        on_trace=capture_adapter_event,
    )
    out = adapter.write_durable_xml(
        identity=identity,
        xml=_as_raw_text(getattr(payload, "xml", "")),
        rev={
            "expected_revision": getattr(payload, "expected_revision", None),
            "expected_fingerprint": _as_text(getattr(payload, "expected_fingerprint", "")),
        },
    )
    if not bool(out.get("ok")):
        reason = _as_text(out.get("blocked") or out.get("error_code") or "diagram_jazz_api_write_blocked")
        status = int(out.get("status") or _api_status_for_reason(reason, 400))
        error_payload = _api_error_payload(
            session_id=session_id,
            trace_id=trace_id,
            provider=activation.provider,
            scope_id=identity.scope_id,
            reason=reason,
            status=status,
            adapter_trace_tail=adapter_trace[-8:],
            activation=activation,
            trace_payload=_build_api_trace_base(
                trace_id=trace_id,
                correlation_id=correlation_id,
                request_trace=request_trace_meta,
                layer="api",
                operation="write",
                session_id=session_id,
                org_id=org_id,
                project_id=project_id,
                scope_id=identity.scope_id,
                provider=_as_text(activation.provider),
                activation=activation,
                blocked_reason=reason,
                reason=reason,
                conflict_reason=reason if ("conflict" in reason or "mismatch" in reason) else "",
            ),
            project_id=project_id,
            org_id=org_id,
        )
        marker = (
            DIAGRAM_JAZZ_API_TRACE_MARKERS["conflict"]
            if ("conflict" in reason or "mismatch" in reason)
            else DIAGRAM_JAZZ_API_TRACE_MARKERS["blocked"]
        )
        _emit_api_marker(marker, error_payload, on_marker=on_marker)
        return error_payload

    ack = dict(out.get("durable_ack") or {})
    result_payload = {
        "ok": True,
        "status": 200,
        "trace_id": trace_id,
        "correlation_id": correlation_id,
        "client_trace_id": _as_text(request_trace_meta.get("client_trace_id")),
        "session_id": _as_text(session_id),
        "project_id": _as_text(project_id),
        "org_id": _as_text(org_id),
        "provider": _as_text(ack.get("provider") or activation.provider),
        "mode": _as_text(activation.effective_mode),
        "owner_requested_state": _as_text(activation.owner_requested_state or "legacy_owner"),
        "owner_effective_state": _as_text(activation.owner_effective_state or "legacy_owner"),
        "diagram_owner_state": _as_text(activation.owner_state or "legacy_owner"),
        "owner_blocked_reason": _as_text(activation.owner_blocked_reason),
        "owner_rollback_active": 1 if activation.owner_rollback_active else 0,
        "scoped_gate_match": 1 if activation.scoped_gate_match else 0,
        "scoped_gate_scope": _as_text(activation.scoped_gate_scope),
        "scoped_gate_blocked_reason": _as_text(activation.scoped_gate_blocked_reason),
        "scoped_gate_operator": _as_text(activation.scoped_gate_operator),
        "trace_contract_version": _as_text(DIAGRAM_TRACE_CONTRACT.get("version")),
        "ack": ack,
        "adapter_trace_tail": adapter_trace[-8:],
    }
    _emit_api_marker(
        DIAGRAM_JAZZ_API_TRACE_MARKERS["write_success"],
        {
            **_build_api_trace_base(
                trace_id=trace_id,
                correlation_id=correlation_id,
                request_trace=request_trace_meta,
                layer="api",
                operation="write_success",
                session_id=session_id,
                org_id=org_id,
                project_id=project_id,
                scope_id=_as_text(ack.get("scope_id") or identity.scope_id),
                provider=_as_text(ack.get("provider") or activation.provider),
                activation=activation,
                doc_id=_as_text(ack.get("doc_id")),
                doc_alias=_as_text(ack.get("doc_alias") or identity.doc_alias),
                mapping_id=_as_text(ack.get("mapping_id")),
            ),
            "stored_revision": int(ack.get("stored_revision") or 0),
            "adapter_event": DIAGRAM_JAZZ_BACKEND_ADAPTER_TRACE_MARKERS["write_success"],
        },
        on_marker=on_marker,
    )
    return result_payload


@router.get("/api/sessions/{session_id}/diagram-jazz")
def read_diagram_jazz(session_id: str, request: Request, provider: str = Query(default="")) -> Any:
    sess, _scope, err = _legacy_main._session_access_from_request(request, session_id)
    if err is not None:
        return err
    if sess is None:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    user = _legacy_main._request_auth_user(request) if request is not None else {}
    operator_user_id = _as_text((user or {}).get("id"))
    out = diagram_jazz_api_read_contract(
        session_id=str(getattr(sess, "id", "") or session_id),
        org_id=str(getattr(sess, "org_id", "") or ""),
        project_id=str(getattr(sess, "project_id", "") or ""),
        provider=provider,
        operator_user_id=operator_user_id,
        request_trace=read_trace_headers(request.headers),
    )
    if not bool(out.get("ok")):
        return JSONResponse(status_code=int(out.get("status") or 400), content=out)
    return out


@router.put("/api/sessions/{session_id}/diagram-jazz")
def write_diagram_jazz(
    session_id: str,
    inp: DiagramJazzWriteIn,
    request: Request,
    provider: str = Query(default=""),
) -> Any:
    sess, _scope, err = _legacy_main._session_access_from_request(request, session_id)
    if err is not None:
        return err
    if sess is None:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    user = _legacy_main._request_auth_user(request) if request is not None else {}
    operator_user_id = _as_text((user or {}).get("id"))
    out = diagram_jazz_api_write_contract(
        session_id=str(getattr(sess, "id", "") or session_id),
        org_id=str(getattr(sess, "org_id", "") or ""),
        project_id=str(getattr(sess, "project_id", "") or ""),
        provider_query=provider,
        payload=inp,
        operator_user_id=operator_user_id,
        request_trace=read_trace_headers(request.headers),
    )
    if not bool(out.get("ok")):
        return JSONResponse(status_code=int(out.get("status") or 400), content=out)
    return out
