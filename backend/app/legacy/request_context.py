from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from ..storage import get_default_org_id

_ORG_PATH_RE = re.compile(r"^/api/orgs/([^/]+)(?:/|$)")


def extract_org_from_path(path: str) -> str:
    src = str(path or "").strip()
    match = _ORG_PATH_RE.match(src)
    if not match:
        return ""
    return str(match.group(1) or "").strip()


def extract_org_from_headers(request: Request) -> str:
    return str(request.headers.get("x-org-id") or request.headers.get("x-active-org-id") or "").strip()


def request_auth_user(request: Request) -> Dict[str, Any]:
    user = getattr(request.state, "auth_user", None)
    if isinstance(user, dict):
        return user
    return {}


def enterprise_error(
    status_code: int,
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> JSONResponse:
    payload = {
        "error": {
            "code": str(code or "error"),
            "message": str(message or "error"),
            "details": details or {},
        },
    }
    return JSONResponse(status_code=int(status_code), content=payload)


def request_user_meta(request: Optional[Request]) -> Tuple[str, bool]:
    if request is None:
        return "", False
    user = request_auth_user(request)
    return str(user.get("id") or "").strip(), bool(user.get("is_admin", False))


def request_is_admin(request: Optional[Request]) -> bool:
    _, is_admin = request_user_meta(request)
    return bool(is_admin)


def require_authenticated_user(request: Request) -> str:
    user_id, _ = request_user_meta(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    return user_id


def request_active_org_id(request: Optional[Request]) -> str:
    if request is None:
        return get_default_org_id()
    org_id = str(getattr(request.state, "active_org_id", "") or "").strip()
    return org_id or get_default_org_id()


def request_user_email(request: Optional[Request]) -> str:
    user = request_auth_user(request) if request is not None else {}
    email = str(user.get("email") or "").strip().lower()
    if email:
        return email
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        return ""
    try:
        from ..auth import find_user_by_id

        row = find_user_by_id(user_id)
    except Exception:
        row = None
    return str((row or {}).get("email") or "").strip().lower()


def request_client_ip(request: Optional[Request]) -> str:
    if request is None:
        return ""
    forwarded_for = str(request.headers.get("x-forwarded-for") or "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = str(request.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip
    client = getattr(request, "client", None)
    host = str(getattr(client, "host", "") or "").strip()
    return host
