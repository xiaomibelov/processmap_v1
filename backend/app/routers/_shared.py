from __future__ import annotations

import re
from typing import Callable

from fastapi import APIRouter
from fastapi.routing import APIRoute

from .. import _legacy_main

PathPredicate = Callable[[str], bool]


def _canonicalize_api_path(path: str) -> str:
    src = str(path or "").strip()
    if not src.startswith("/api"):
        return src
    out = src
    out = re.sub(r"^(/api/sessions/[^/]+)/path(/.*)$", r"\1/paths\2", out)
    out = re.sub(r"^(/api/sessions/[^/]+)/(?:meta|bpmn/meta)$", r"\1/bpmn_meta", out)
    out = re.sub(r"^(/api/sessions/[^/]+)/ai/ops$", r"\1/ai/questions", out)
    if out != "/" and out.endswith("/"):
        out = out.rstrip("/")
    return out


def build_router(predicate: PathPredicate) -> APIRouter:
    router = APIRouter()
    selected = {}
    order = []
    for route in _legacy_main.app.router.routes:
        if not isinstance(route, APIRoute):
            continue
        path = str(route.path or "")
        if predicate(path):
            canonical_path = _canonicalize_api_path(path)
            methods = sorted(str(m or "").upper() for m in (route.methods or []) if str(m or "").upper() not in {"HEAD", "OPTIONS"})
            if not methods:
                methods = ["*"]
            for method in methods:
                key = (method, canonical_path)
                prev = selected.get(key)
                if prev is None:
                    selected[key] = (path == canonical_path, route)
                    order.append(key)
                    continue
                prev_is_canonical, _prev_route = prev
                # Prefer canonical declaration when alias + canonical overlap.
                if not prev_is_canonical and path == canonical_path:
                    selected[key] = (True, route)
    for key in order:
        route = selected[key][1]
        if route not in router.routes:
            router.routes.append(route)
    return router
