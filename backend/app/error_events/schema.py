from __future__ import annotations

import hashlib
import json
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping, MutableMapping, Optional
from urllib.parse import urlsplit

from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = 1
_ALLOWED_SEVERITIES = {"fatal", "error", "warn", "info"}
_ALLOWED_SOURCES = {"frontend", "backend", "server", "worker"}
_MAX_TEXT = 2000
_MAX_ROUTE = 512
_MAX_ID = 128
_MAX_CONTEXT_DEPTH = 6
_MAX_CONTEXT_KEYS = 50
_MAX_CONTEXT_LIST = 20
_MAX_STACK_FRAMES = 8
_REDACTED = "[REDACTED]"
_TRUNCATED = "...[truncated]"
_SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "cookies",
    "set-cookie",
    "x-api-key",
    "api_key",
    "access_token",
    "refresh_token",
    "id_token",
    "bearer",
}
_PAYLOAD_REDACT_KEYS = {
    "body",
    "request_body",
    "response_body",
    "payload",
    "draft_payload",
    "session_payload",
}


class ErrorEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=SCHEMA_VERSION)
    event_type: str
    severity: str
    message: str
    occurred_at: int | float | str | None = None
    source: str
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    session_id: Optional[str] = None
    project_id: Optional[str] = None
    route: Optional[str] = None
    runtime_id: Optional[str] = None
    tab_id: Optional[str] = None
    request_id: Optional[str] = None
    correlation_id: Optional[str] = None
    app_version: Optional[str] = None
    git_sha: Optional[str] = None
    fingerprint: Optional[str] = None
    context_json: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_type", "source")
    @classmethod
    def _validate_slug(cls, value: str) -> str:
        normalized = _normalize_slug(value)
        if not normalized:
            raise ValueError("must be a non-empty slug")
        return normalized

    @field_validator("severity")
    @classmethod
    def _validate_severity(cls, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized not in _ALLOWED_SEVERITIES:
            raise ValueError(f"severity must be one of {sorted(_ALLOWED_SEVERITIES)}")
        return normalized

    @field_validator("message")
    @classmethod
    def _validate_message(cls, value: str) -> str:
        text = _normalize_text(value, max_len=_MAX_TEXT)
        if not text:
            raise ValueError("message is required")
        return text

    @model_validator(mode="after")
    def _validate_schema_version(self) -> "ErrorEventIn":
        if int(self.schema_version or 0) != SCHEMA_VERSION:
            raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
        return self


class ErrorEventStored(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    schema_version: int
    occurred_at: int
    ingested_at: int
    source: str
    event_type: str
    severity: str
    message: str
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    session_id: Optional[str] = None
    project_id: Optional[str] = None
    route: Optional[str] = None
    runtime_id: Optional[str] = None
    tab_id: Optional[str] = None
    request_id: Optional[str] = None
    correlation_id: Optional[str] = None
    app_version: Optional[str] = None
    git_sha: Optional[str] = None
    fingerprint: str
    context_json: Dict[str, Any] = Field(default_factory=dict)


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _normalize_slug(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    cleaned = []
    for ch in raw:
        if ch.isalnum() or ch in {"_", "-", ".", "/"}:
            cleaned.append(ch)
        elif ch.isspace():
            cleaned.append("_")
    normalized = "".join(cleaned).strip("._/-")
    normalized = normalized.replace("__", "_")
    return normalized[:_MAX_ID]


def _normalize_text(value: Any, *, max_len: int) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len] + _TRUNCATED


def _normalize_nullable_id(value: Any) -> str | None:
    text = _normalize_text(value, max_len=_MAX_ID)
    return text or None


def _normalize_route(value: Any, *, fallback: str = "") -> str:
    raw = _normalize_text(value, max_len=_MAX_ROUTE)
    if raw:
        return raw
    fb = _normalize_text(fallback, max_len=_MAX_ROUTE)
    if fb.startswith("http://") or fb.startswith("https://"):
        try:
            split = urlsplit(fb)
            path = str(split.path or "").strip()
            query = str(split.query or "").strip()
            return f"{path}?{query}" if query else path
        except Exception:
            return fb
    return fb


def _normalize_occurred_at(value: Any, *, default_ts: int) -> int:
    if value is None or value == "":
        return default_ts
    if isinstance(value, (int, float)):
        ts = int(value)
        return ts if ts > 0 else default_ts
    raw = str(value or "").strip()
    if not raw:
        return default_ts
    try:
        ts = int(raw)
        return ts if ts > 0 else default_ts
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp())
    except Exception:
        return default_ts


def _json_size_hint(value: Any) -> int:
    try:
        return len(json.dumps(value, ensure_ascii=False))
    except Exception:
        return len(str(value or ""))


def _redacted_summary(kind: str, value: Any) -> Dict[str, Any]:
    return {"_redacted": kind, "size_hint": _json_size_hint(value)}


def redact_context_json(value: Mapping[str, Any] | None) -> Dict[str, Any]:
    source = dict(value or {})
    sanitized = _sanitize_context_value(source, depth=0, parent_key="context")
    return sanitized if isinstance(sanitized, dict) else {}


def _sanitize_context_value(value: Any, *, depth: int, parent_key: str) -> Any:
    if depth >= _MAX_CONTEXT_DEPTH:
        return _redacted_summary("max_depth", value)
    if isinstance(value, Mapping):
        out: Dict[str, Any] = {}
        for idx, (key, item) in enumerate(value.items()):
            if idx >= _MAX_CONTEXT_KEYS:
                out["_truncated_keys"] = len(value) - _MAX_CONTEXT_KEYS
                break
            key_text = _normalize_text(key, max_len=_MAX_ID) or f"key_{idx}"
            lowered = key_text.lower()
            if lowered in _SENSITIVE_KEYS or lowered.endswith("token"):
                out[key_text] = _REDACTED
                continue
            if lowered == "bpmn_xml" or lowered.endswith("bpmn_xml"):
                out[key_text] = _redacted_summary("bpmn_xml", item)
                continue
            if lowered in _PAYLOAD_REDACT_KEYS or lowered.endswith("_payload") or lowered.endswith("_draft"):
                out[key_text] = _redacted_summary("payload", item)
                continue
            out[key_text] = _sanitize_context_value(item, depth=depth + 1, parent_key=lowered)
        return out
    if isinstance(value, list):
        items = []
        for idx, item in enumerate(value[:_MAX_CONTEXT_LIST]):
            items.append(_sanitize_context_value(item, depth=depth + 1, parent_key=parent_key))
        if len(value) > _MAX_CONTEXT_LIST:
            items.append({"_truncated_items": len(value) - _MAX_CONTEXT_LIST})
        return items
    if isinstance(value, tuple):
        return _sanitize_context_value(list(value), depth=depth, parent_key=parent_key)
    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, str):
            return _normalize_text(value, max_len=_MAX_TEXT)
        return value
    return _normalize_text(repr(value), max_len=_MAX_TEXT)


def compute_fingerprint(event: Mapping[str, Any]) -> str:
    basis = {
        "schema_version": int(event.get("schema_version") or SCHEMA_VERSION),
        "source": str(event.get("source") or ""),
        "event_type": str(event.get("event_type") or ""),
        "severity": str(event.get("severity") or ""),
        "message": str(event.get("message") or ""),
        "route": str(event.get("route") or ""),
        "session_id": str(event.get("session_id") or ""),
        "project_id": str(event.get("project_id") or ""),
    }
    raw = json.dumps(basis, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


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


def _compact_exception_frames(exc: Exception) -> list[Dict[str, Any]]:
    frames = traceback.extract_tb(exc.__traceback__) if exc.__traceback__ is not None else []
    compact = []
    for frame in list(frames)[-_MAX_STACK_FRAMES:]:
        compact.append(
            {
                "file": _normalize_text(Path(str(frame.filename or "")).name, max_len=160),
                "function": _normalize_text(frame.name, max_len=160),
                "line": int(frame.lineno or 0),
            }
        )
    return compact


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
