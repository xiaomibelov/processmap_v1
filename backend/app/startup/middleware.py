from __future__ import annotations

import logging
import re
from typing import Iterable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.routing import Match

from ..auth import AuthError, user_from_bearer_header
from ..error_events import build_backend_exception_event, get_or_create_backend_request_id
from ..legacy.request_context import (
    extract_org_from_headers,
    extract_org_from_path,
    request_client_ip,
)
from ..storage import (
    append_error_event,
    get_default_org_id,
    list_user_org_memberships,
    pop_storage_request_scope,
    push_storage_request_scope,
    resolve_active_org_id,
    user_has_org_membership,
)

_logger = logging.getLogger(__name__)

DEPRECATED_ALIAS_RULES = (
    (
        re.compile(r"^/api/sessions/(?P<session_id>[^/]+)/path/(?P<path_id>[^/]+)/reports/?$"),
        "/api/sessions/{session_id}/paths/{path_id}/reports",
    ),
    (
        re.compile(r"^/api/sessions/(?P<session_id>[^/]+)/path/(?P<path_id>[^/]+)/reports/(?P<report_id>[^/]+)/?$"),
        "/api/sessions/{session_id}/paths/{path_id}/reports/{report_id}",
    ),
    (
        re.compile(r"^/api/sessions/(?P<session_id>[^/]+)/paths/(?P<path_id>[^/]+)/reports/$"),
        "/api/sessions/{session_id}/paths/{path_id}/reports",
    ),
    (
        re.compile(r"^/api/sessions/(?P<session_id>[^/]+)/paths/(?P<path_id>[^/]+)/reports/(?P<report_id>[^/]+)/$"),
        "/api/sessions/{session_id}/paths/{path_id}/reports/{report_id}",
    ),
    (
        re.compile(r"^/api/reports/(?P<report_id>[^/]+)/$"),
        "/api/reports/{report_id}",
    ),
    (
        re.compile(r"^/api/sessions/(?P<session_id>[^/]+)/meta/?$"),
        "/api/sessions/{session_id}/bpmn_meta",
    ),
    (
        re.compile(r"^/api/sessions/(?P<session_id>[^/]+)/bpmn/meta/?$"),
        "/api/sessions/{session_id}/bpmn_meta",
    ),
    (
        re.compile(r"^/api/sessions/(?P<session_id>[^/]+)/ai/ops/?$"),
        "/api/sessions/{session_id}/ai/questions",
    ),
)


def build_cors_origins() -> list[str]:
    import os

    cors_env = str(os.getenv("CORS_ORIGINS", "") or "").strip()
    if cors_env:
        return [origin.strip() for origin in cors_env.split(",") if origin.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5177",
        "http://127.0.0.1:5177",
    ]


def register_cors(app: FastAPI, *, cors_origins: Iterable[str]) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "X-Requested-With",
            "X-Org-Id",
            "X-Active-Org-Id",
            "X-Client-Request-Id",
        ],
    )


def _auth_error_response(detail: str = "unauthorized") -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(detail or "unauthorized")})


def register_auth_guard(app: FastAPI, *, public_paths: set[str]) -> None:
    @app.middleware("http")
    async def auth_guard_middleware(request: Request, call_next):
        path = str(request.url.path or "")
        scope_tokens = None
        if request.method.upper() == "OPTIONS":
            return await call_next(request)
        if not path.startswith("/api"):
            return await call_next(request)
        if path in public_paths:
            scope_tokens = push_storage_request_scope("", False, "")
            try:
                return await call_next(request)
            finally:
                pop_storage_request_scope(scope_tokens)

        try:
            user = user_from_bearer_header(request.headers.get("authorization", ""))
            request.state.auth_user = user
            user_id = str(user.get("id") or "").strip()
            is_admin = bool(user.get("is_admin", False))
            path_org_id = extract_org_from_path(path)
            header_org_id = extract_org_from_headers(request)

            allow_non_member = bool(path_org_id and path.rstrip("/").endswith("/invites/accept"))
            if path_org_id and (not allow_non_member) and not user_has_org_membership(user_id, path_org_id, is_admin=is_admin):
                return JSONResponse(status_code=404, content={"detail": "not found"})

            requested_org_id = path_org_id or header_org_id
            active_org_id = resolve_active_org_id(user_id, requested_org_id=requested_org_id, is_admin=is_admin)
            request.state.active_org_id = active_org_id
            request.state.org_memberships = list_user_org_memberships(user_id, is_admin=is_admin)
            scope_tokens = push_storage_request_scope(user_id, is_admin, active_org_id)
        except AuthError as exc:
            return _auth_error_response(str(exc))

        try:
            return await call_next(request)
        finally:
            pop_storage_request_scope(scope_tokens)


def _canonical_path_for_alias(path: str) -> str:
    src = str(path or "").strip()
    for pattern, target in DEPRECATED_ALIAS_RULES:
        matched = pattern.match(src)
        if matched:
            return target.format(**matched.groupdict())
    if src.startswith("/api/") and src.endswith("/"):
        return src.rstrip("/")
    return ""


def _path_has_matching_route(app: FastAPI, path: str, method: str) -> bool:
    src = str(path or "").strip()
    req_method = str(method or "GET").upper()
    if not src.startswith("/api"):
        return False
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": req_method,
        "scheme": "http",
        "path": src,
        "raw_path": src.encode("utf-8"),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 0),
        "server": ("127.0.0.1", 80),
        "root_path": "",
    }
    for route in app.router.routes:
        try:
            matched, _ = route.matches(scope)
        except Exception:
            continue
        if matched == Match.FULL:
            return True
    return False


def _apply_deprecation_headers(response, canonical_path: str) -> None:
    canonical = str(canonical_path or "").strip()
    response.headers["Deprecation"] = "true"
    response.headers["Warning"] = f'299 - "Deprecated endpoint, use {canonical}"'
    response.headers["Link"] = f"<{canonical}>; rel=\"alternate\""
    response.headers["X-Deprecated-Endpoint"] = "true"


def register_deprecated_alias_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def deprecated_route_compat_middleware(request: Request, call_next):
        current_path = str(request.url.path or "")
        canonical_path = _canonical_path_for_alias(current_path)
        method = str(request.method or "GET").upper()
        if not canonical_path:
            if current_path.startswith("/api/") and current_path.endswith("/"):
                stripped = current_path.rstrip("/")
                if stripped and _path_has_matching_route(app, stripped, method):
                    canonical_path = stripped
        if not canonical_path or canonical_path == current_path:
            return await call_next(request)

        query = str(request.url.query or "").strip()
        canonical_url = canonical_path + (f"?{query}" if query else "")
        _logger.warning(
            "Deprecated endpoint used: method=%s path=%s canonical=%s ip=%s",
            method,
            current_path,
            canonical_path,
            request_client_ip(request),
        )
        if method in {"GET", "HEAD"}:
            redirect = RedirectResponse(url=canonical_url, status_code=308)
            _apply_deprecation_headers(redirect, canonical_path)
            return redirect

        request.scope["path"] = canonical_path
        request.scope["raw_path"] = canonical_path.encode("utf-8")
        response = await call_next(request)
        _apply_deprecation_headers(response, canonical_path)
        return response


def register_backend_exception_capture(app: FastAPI) -> None:
    @app.middleware("http")
    async def backend_exception_telemetry_middleware(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            request_id = ""
            try:
                stored = build_backend_exception_event(request, exc)
                append_error_event(**stored.model_dump())
                request_id = str(stored.request_id or "")
            except Exception as telemetry_exc:
                request_id, _ = get_or_create_backend_request_id(request)
                _logger.error(
                    "Backend exception telemetry append failed: type=%s request_id=%s",
                    type(telemetry_exc).__name__,
                    request_id,
                )
            _logger.error(
                "Unhandled backend exception captured: type=%s request_id=%s method=%s path=%s",
                type(exc).__name__,
                request_id,
                str(request.method or ""),
                str(request.url.path or ""),
            )
            headers = {"X-Request-Id": request_id} if request_id else None
            return JSONResponse(
                status_code=500,
                content={"detail": "internal_server_error", "request_id": request_id},
                headers=headers,
            )
