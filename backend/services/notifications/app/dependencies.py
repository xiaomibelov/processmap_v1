from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Header, HTTPException, Request, status

from .config import config
from .services.auth_service import AuthError, require_admin, resolve_user_context


def _extract_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = str(auth).split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _skip_auth_context(active_org_id: Optional[str]) -> Dict[str, Any]:
    return {
        "user_id": "skip-auth-user",
        "org_id": active_org_id,
        "role": None,
        "is_admin": True,
    }


def get_current_user(
    request: Request,
    x_active_org_id: Optional[str] = Header(default=None, alias="X-Active-Org-Id"),
) -> Dict[str, Any]:
    if config.SKIP_AUTH:
        return _skip_auth_context(x_active_org_id)
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )
    try:
        return resolve_user_context(token, active_org_id=x_active_org_id)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


def get_current_admin(
    request: Request,
    x_active_org_id: Optional[str] = Header(default=None, alias="X-Active-Org-Id"),
) -> Dict[str, Any]:
    user = get_current_user(request, x_active_org_id=x_active_org_id)
    try:
        require_admin(user)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    return user
