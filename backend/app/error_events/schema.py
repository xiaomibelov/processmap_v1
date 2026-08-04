from __future__ import annotations

import uuid
from typing import Any, Dict, Mapping, MutableMapping, Optional

from fastapi import Request
from pydantic import Field

from ..shared.dto.error_event_dto import (
    SCHEMA_VERSION,
    _ALLOWED_SEVERITIES,
    _ALLOWED_SOURCES,
    ErrorEventIn,
    ErrorEventOut,
)
from ..shared.dto.error_event_helpers import (
    _MAX_TEXT,
    _compact_exception_frames,
    _normalize_nullable_id,
    _normalize_occurred_at,
    _normalize_route,
    _normalize_slug,
    _normalize_text,
    _now_ts,
    compute_fingerprint,
    redact_context_json,
)


class ErrorEventStored(ErrorEventOut):
    """Stored error event; unlike ErrorEventOut, context_json may be omitted."""

    context_json: Dict[str, Any] = Field(default_factory=dict)


def _request_state_dict(request: Request) -> Any:
    return getattr(request, "state", None)


def _request_auth_user(request: Request) -> Mapping[str, Any]:
    user = getattr(_request_state_dict(request), "auth_user", {}) or {}
    return user if isinstance(user, Mapping) else {}


def _request_active_org_id(request: Request) -> str | None:
    return _normalize_nullable_id(getattr(_request_state_dict(request), "active_org_id", None))


def _trusted_request_user_id(request: Request) -> str | None:
    return _normalize_nullable_id(_request_auth_user(request).get("id"))


def _request_header_id(request: Request) -> tuple[str | None, str]:
    for header_name in ("x-client-request-id", "x-request-id"):
        value = _normalize_nullable_id(request.headers.get(header_name))
        if value:
            return value, header_name
    return None, ""


def get_or_create_backend_request_id(request: Request) -> tuple[str, str]:
    state = _request_state_dict(request)
    existing = _normalize_nullable_id(getattr(state, "telemetry_request_id", None))
    if existing:
        source = _normalize_text(getattr(state, "telemetry_request_id_source", ""), max_len=32) or "state"
        return existing, source
    header_id, header_name = _request_header_id(request)
    if header_id:
        if state is not None:
            setattr(state, "telemetry_request_id", header_id)
            setattr(state, "telemetry_request_id_source", header_name)
        return header_id, header_name
    generated = f"req_{uuid.uuid4().hex[:12]}"
    if state is not None:
        setattr(state, "telemetry_request_id", generated)
        setattr(state, "telemetry_request_id_source", "generated")
    return generated, "generated"


def _request_route_template(request: Request) -> str:
    route = request.scope.get("route") if isinstance(getattr(request, "scope", None), dict) else None
    route_path = _normalize_route(getattr(route, "path", ""))
    return route_path or _normalize_route(str(getattr(request.url, "path", "") or ""))


def build_stored_error_event(payload: ErrorEventIn, request: Request) -> ErrorEventStored:
    now_ts = _now_ts()
    trusted_user_id = _trusted_request_user_id(request)
    trusted_org_id = _request_active_org_id(request)
    advisory_user_id = _normalize_nullable_id(payload.user_id)
    advisory_org_id = _normalize_nullable_id(payload.org_id)
    request_header_id, _ = _request_header_id(request)
    normalized_request_id = _normalize_nullable_id(payload.request_id) or request_header_id or f"reqevt_{uuid.uuid4().hex[:12]}"
    client_route = _normalize_route(payload.route, fallback=request.headers.get("referer", ""))
    sanitized_context = redact_context_json(payload.context_json)
    intake_meta: MutableMapping[str, Any] = {
        "ingest_path": _normalize_route(str(request.url.path or "")),
        "ingest_method": _normalize_text(request.method, max_len=16),
        "normalized_request_id_source": "payload"
        if _normalize_nullable_id(payload.request_id)
        else ("header" if request_header_id else "generated"),
    }
    client_ip = getattr(getattr(request, "client", None), "host", None)
    if client_ip:
        intake_meta["client_ip"] = _normalize_text(client_ip, max_len=128)
    if advisory_user_id and advisory_user_id != trusted_user_id:
        intake_meta["client_claimed_user_id"] = advisory_user_id
    if advisory_org_id and advisory_org_id != trusted_org_id:
        intake_meta["client_claimed_org_id"] = advisory_org_id
    sanitized_context["_server"] = intake_meta
    event = {
        "id": f"evt_{uuid.uuid4().hex[:12]}",
        "schema_version": SCHEMA_VERSION,
        "occurred_at": _normalize_occurred_at(payload.occurred_at, default_ts=now_ts),
        "ingested_at": now_ts,
        "source": payload.source if payload.source in _ALLOWED_SOURCES else payload.source,
        "event_type": payload.event_type,
        "severity": payload.severity,
        "message": payload.message,
        "user_id": trusted_user_id,
        "org_id": trusted_org_id,
        "session_id": _normalize_nullable_id(payload.session_id),
        "project_id": _normalize_nullable_id(payload.project_id),
        "route": client_route or None,
        "runtime_id": _normalize_nullable_id(payload.runtime_id),
        "tab_id": _normalize_nullable_id(payload.tab_id),
        "request_id": normalized_request_id,
        "correlation_id": _normalize_nullable_id(payload.correlation_id),
        "app_version": _normalize_nullable_id(payload.app_version),
        "git_sha": _normalize_nullable_id(payload.git_sha),
        "fingerprint": _normalize_nullable_id(payload.fingerprint) or "",
        "context_json": sanitized_context,
    }
    if not event["fingerprint"]:
        event["fingerprint"] = compute_fingerprint(event)
    return ErrorEventStored(**event)


def build_backend_exception_event(request: Request, exc: Exception) -> ErrorEventStored:
    now_ts = _now_ts()
    request_id, request_id_source = get_or_create_backend_request_id(request)
    method = _normalize_text(request.method, max_len=16) or "GET"
    route = _request_route_template(request)
    path = _normalize_route(str(getattr(request.url, "path", "") or ""))
    exception_type = _normalize_text(type(exc).__name__, max_len=160) or "Exception"
    exception_module = _normalize_text(type(exc).__module__, max_len=240)
    context = redact_context_json(
        {
            "method": method,
            "route": route,
            "path": path,
            "query_present": bool(str(getattr(request.url, "query", "") or "")),
            "status_code": 500,
            "exception_type": exception_type,
            "exception_module": exception_module,
            "stack": _compact_exception_frames(exc),
            "_server": {
                "capture": "backend_exception_middleware",
                "request_id_source": request_id_source,
            },
        }
    )
    event = {
        "id": f"evt_{uuid.uuid4().hex[:12]}",
        "schema_version": SCHEMA_VERSION,
        "occurred_at": now_ts,
        "ingested_at": now_ts,
        "source": "backend",
        "event_type": "backend_exception",
        "severity": "error",
        "message": f"Unhandled backend exception: {exception_type}",
        "user_id": _trusted_request_user_id(request),
        "org_id": _request_active_org_id(request),
        "session_id": None,
        "project_id": None,
        "route": route or path or None,
        "runtime_id": None,
        "tab_id": None,
        "request_id": request_id,
        "correlation_id": None,
        "app_version": None,
        "git_sha": None,
        "fingerprint": "",
        "context_json": context,
    }
    event["fingerprint"] = compute_fingerprint(event)
    return ErrorEventStored(**event)


def build_backend_async_exception_event(
    exc: Exception,
    *,
    task_name: str,
    execution_scope: str = "background",
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    route: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    context_json: Optional[Mapping[str, Any]] = None,
) -> ErrorEventStored:
    now_ts = _now_ts()
    normalized_task = _normalize_text(task_name, max_len=160) or "background_task"
    normalized_scope = _normalize_slug(execution_scope) or "background"
    exception_type = _normalize_text(type(exc).__name__, max_len=160) or "Exception"
    exception_module = _normalize_text(type(exc).__module__, max_len=240)
    caller_context = dict(context_json or {})
    context = redact_context_json(
        {
            **caller_context,
            "execution_scope": normalized_scope,
            "task_name": normalized_task,
            "exception_type": exception_type,
            "exception_module": exception_module,
            "stack": _compact_exception_frames(exc),
            "_server": {
                "capture": "backend_async_exception_capture",
                "request_id_source": "provided" if _normalize_nullable_id(request_id) else "absent",
            },
        }
    )
    event = {
        "id": f"evt_{uuid.uuid4().hex[:12]}",
        "schema_version": SCHEMA_VERSION,
        "occurred_at": now_ts,
        "ingested_at": now_ts,
        "source": "backend",
        "event_type": "backend_async_exception",
        "severity": "error",
        "message": f"Unhandled background exception in {normalized_task}: {exception_type}",
        "user_id": _normalize_nullable_id(user_id),
        "org_id": _normalize_nullable_id(org_id),
        "session_id": _normalize_nullable_id(session_id),
        "project_id": _normalize_nullable_id(project_id),
        "route": _normalize_route(route) or None,
        "runtime_id": None,
        "tab_id": None,
        "request_id": _normalize_nullable_id(request_id),
        "correlation_id": _normalize_nullable_id(correlation_id),
        "app_version": None,
        "git_sha": None,
        "fingerprint": "",
        "context_json": context,
    }
    event["fingerprint"] = compute_fingerprint(event)
    return ErrorEventStored(**event)


def build_backend_domain_invariant_event(
    *,
    domain: str,
    invariant_name: str,
    message: str,
    severity: str = "error",
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    route: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    context_json: Optional[Mapping[str, Any]] = None,
) -> ErrorEventStored:
    now_ts = _now_ts()
    normalized_domain = _normalize_slug(domain) or "backend_domain"
    normalized_invariant = _normalize_slug(invariant_name) or "domain_invariant"
    severity_norm = str(severity or "").strip().lower()
    if severity_norm not in _ALLOWED_SEVERITIES:
        severity_norm = "error"
    context = redact_context_json(
        {
            **dict(context_json or {}),
            "domain": normalized_domain,
            "invariant_name": normalized_invariant,
            "_server": {
                "capture": "backend_domain_invariant",
                "request_id_source": "provided" if _normalize_nullable_id(request_id) else "absent",
            },
        }
    )
    event = {
        "id": f"evt_{uuid.uuid4().hex[:12]}",
        "schema_version": SCHEMA_VERSION,
        "occurred_at": now_ts,
        "ingested_at": now_ts,
        "source": "backend",
        "event_type": "domain_invariant_violation",
        "severity": severity_norm,
        "message": _normalize_text(message, max_len=_MAX_TEXT)
        or f"Backend domain invariant violation: {normalized_domain}/{normalized_invariant}",
        "user_id": _normalize_nullable_id(user_id),
        "org_id": _normalize_nullable_id(org_id),
        "session_id": _normalize_nullable_id(session_id),
        "project_id": _normalize_nullable_id(project_id),
        "route": _normalize_route(route) or None,
        "runtime_id": None,
        "tab_id": None,
        "request_id": _normalize_nullable_id(request_id),
        "correlation_id": _normalize_nullable_id(correlation_id),
        "app_version": None,
        "git_sha": None,
        "fingerprint": "",
        "context_json": context,
    }
    event["fingerprint"] = compute_fingerprint(event)
    return ErrorEventStored(**event)
