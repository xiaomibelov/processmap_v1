from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

from ..shared.dto.error_event_dto import ErrorEventIn, ErrorEventOut, ErrorEventPatchIn
from ..shared.dto.error_event_helpers import (
    _normalize_nullable_id,
    _normalize_occurred_at,
    _normalize_route,
    _normalize_text,
    _now_ts,
    compute_fingerprint,
    generate_event_id,
    generate_request_id,
    redact_context_json,
)
from ..storage import (
    append_error_event as _storage_append_error_event,
    count_error_events as _storage_count_error_events,
    delete_error_event as _storage_delete_error_event,
    get_error_event as _storage_get_error_event,
    list_error_events as _storage_list_error_events,
    update_error_event as _storage_update_error_event,
)


def _to_out(row: Optional[Dict[str, Any]]) -> Optional[ErrorEventOut]:
    if not row:
        return None
    return ErrorEventOut(**row)


def _build_intake_meta(
    *,
    payload_request_id: Optional[str],
    header_request_id: Optional[str],
    path: str,
    method: str,
    client_ip: Optional[str],
) -> Dict[str, Any]:
    if payload_request_id:
        source = "payload"
    elif header_request_id:
        source = "header"
    else:
        source = "generated"
    meta: Dict[str, Any] = {
        "ingest_path": _normalize_route(path),
        "ingest_method": _normalize_text(method, max_len=16),
        "normalized_request_id_source": source,
    }
    if client_ip:
        meta["client_ip"] = _normalize_text(client_ip, max_len=128)
    return meta


def append_error_event(
    dto: ErrorEventIn,
    *,
    trusted_user_id: Optional[str] = None,
    trusted_org_id: Optional[str] = None,
    path: str = "",
    method: str = "POST",
    client_ip: Optional[str] = None,
    header_request_id: Optional[str] = None,
) -> ErrorEventOut:
    """Store a new error event and return the stored representation."""

    now_ts = _now_ts()
    advisory_user_id = _normalize_nullable_id(dto.user_id)
    advisory_org_id = _normalize_nullable_id(dto.org_id)
    normalized_request_id = _normalize_nullable_id(dto.request_id) or header_request_id or generate_request_id()
    client_route = _normalize_route(dto.route)

    sanitized_context = redact_context_json(dto.context_json)
    intake_meta = _build_intake_meta(
        payload_request_id=_normalize_nullable_id(dto.request_id),
        header_request_id=header_request_id,
        path=path,
        method=method,
        client_ip=client_ip,
    )
    if advisory_user_id and advisory_user_id != _normalize_nullable_id(trusted_user_id):
        intake_meta["client_claimed_user_id"] = advisory_user_id
    if advisory_org_id and advisory_org_id != _normalize_nullable_id(trusted_org_id):
        intake_meta["client_claimed_org_id"] = advisory_org_id
    sanitized_context["_server"] = intake_meta

    event_id = generate_event_id()
    event: Dict[str, Any] = {
        "id": event_id,
        "schema_version": dto.schema_version,
        "occurred_at": _normalize_occurred_at(dto.occurred_at, default_ts=now_ts),
        "ingested_at": now_ts,
        "source": dto.source,
        "event_type": dto.event_type,
        "severity": dto.severity,
        "message": dto.message,
        "user_id": _normalize_nullable_id(trusted_user_id),
        "org_id": _normalize_nullable_id(trusted_org_id),
        "session_id": _normalize_nullable_id(dto.session_id),
        "project_id": _normalize_nullable_id(dto.project_id),
        "route": client_route or None,
        "runtime_id": _normalize_nullable_id(dto.runtime_id),
        "tab_id": _normalize_nullable_id(dto.tab_id),
        "request_id": normalized_request_id,
        "correlation_id": _normalize_nullable_id(dto.correlation_id),
        "app_version": _normalize_nullable_id(dto.app_version),
        "git_sha": _normalize_nullable_id(dto.git_sha),
        "fingerprint": _normalize_nullable_id(dto.fingerprint) or "",
        "context_json": sanitized_context,
    }
    if not event["fingerprint"]:
        event["fingerprint"] = compute_fingerprint(event)

    row = _storage_append_error_event(**event)
    out = _to_out(row)
    if out is None:
        raise RuntimeError("append_error_event did not return a row")
    return out


def get_error_event(event_id: str) -> Optional[ErrorEventOut]:
    row = _storage_get_error_event(event_id)
    return _to_out(row)


def list_error_events(
    *,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "asc",
) -> List[ErrorEventOut]:
    filters: Dict[str, Any] = {
        "session_id": _normalize_nullable_id(session_id),
        "request_id": _normalize_nullable_id(request_id),
        "correlation_id": _normalize_nullable_id(correlation_id),
        "user_id": _normalize_nullable_id(user_id),
        "org_id": _normalize_nullable_id(org_id),
        "runtime_id": _normalize_nullable_id(runtime_id),
        "event_type": _normalize_nullable_id(event_type),
        "source": _normalize_nullable_id(source),
        "severity": _normalize_nullable_id(severity),
        "occurred_from": int(occurred_from) if occurred_from else None,
        "occurred_to": int(occurred_to) if occurred_to else None,
    }
    rows = _storage_list_error_events(
        **filters,
        limit=limit,
        offset=offset,
        order=order,
    )
    return [_to_out(row) for row in rows]


def count_error_events(
    *,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
) -> int:
    filters: Dict[str, Any] = {
        "session_id": _normalize_nullable_id(session_id),
        "request_id": _normalize_nullable_id(request_id),
        "correlation_id": _normalize_nullable_id(correlation_id),
        "user_id": _normalize_nullable_id(user_id),
        "org_id": _normalize_nullable_id(org_id),
        "runtime_id": _normalize_nullable_id(runtime_id),
        "event_type": _normalize_nullable_id(event_type),
        "source": _normalize_nullable_id(source),
        "severity": _normalize_nullable_id(severity),
        "occurred_from": int(occurred_from) if occurred_from else None,
        "occurred_to": int(occurred_to) if occurred_to else None,
    }
    return _storage_count_error_events(**filters)


def update_error_event(event_id: str, patch: ErrorEventPatchIn) -> Optional[ErrorEventOut]:
    fields: Dict[str, Any] = {}
    if patch.severity is not None:
        fields["severity"] = patch.severity
    if patch.message is not None:
        fields["message"] = patch.message
    if patch.context_json is not None:
        fields["context_json"] = redact_context_json(patch.context_json)
    if not fields:
        return get_error_event(event_id)
    row = _storage_update_error_event(event_id, **fields)
    return _to_out(row)


def delete_error_event(event_id: str) -> bool:
    return _storage_delete_error_event(event_id)
