from __future__ import annotations

import logging
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Match

from . import _legacy_main
from .routers import ROUTERS

app = FastAPI(title="Food Process Copilot MVP")
_logger = logging.getLogger(__name__)

_DEPRECATED_ALIAS_RULES = (
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


def _canonical_path_for_alias(path: str) -> str:
    src = str(path or "").strip()
    for pattern, target in _DEPRECATED_ALIAS_RULES:
        matched = pattern.match(src)
        if matched:
            return target.format(**matched.groupdict())
    if src.startswith("/api/") and src.endswith("/"):
        return src.rstrip("/")
    return ""


def _path_has_matching_route(path: str, method: str) -> bool:
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_legacy_main.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Requested-With",
        "X-Org-Id",
        "X-Active-Org-Id",
    ],
)


async def deprecated_route_compat_middleware(request, call_next):
    current_path = str(request.url.path or "")
    canonical_path = _canonical_path_for_alias(current_path)
    method = str(request.method or "GET").upper()
    if not canonical_path:
        if current_path.startswith("/api/") and current_path.endswith("/"):
            stripped = current_path.rstrip("/")
            if stripped and _path_has_matching_route(stripped, method):
                canonical_path = stripped
    if not canonical_path or canonical_path == current_path:
        return await call_next(request)

    query = str(request.url.query or "").strip()
    canonical_url = canonical_path + (f"?{query}" if query else "")
    _logger.warning(
        "Deprecated endpoint used: method=%s path=%s canonical=%s",
        method,
        current_path,
        canonical_path,
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


app.middleware("http")(_legacy_main.auth_guard_middleware)
app.middleware("http")(deprecated_route_compat_middleware)

if _legacy_main.STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_legacy_main.STATIC_DIR)), name="static")

for router in ROUTERS:
    app.include_router(router)
