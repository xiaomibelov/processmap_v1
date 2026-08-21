from __future__ import annotations

from typing import Any, Dict, Optional

import jwt

from ..config import config
from ..db import adapt_sql, get_conn, row_to_dict


class AuthError(Exception):
    pass


_ADMIN_ROLES = {"org_owner", "org_admin", "auditor"}


def decode_access_token(token: str) -> Dict[str, Any]:
    if not token:
        raise AuthError("missing token")
    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=[config.ALGORITHM],
            issuer=config.ACCESS_TOKEN_ISSUER,
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("invalid token") from exc
    return payload


def _user_id_from_payload(payload: Dict[str, Any]) -> str:
    for key in ("sub", "id", "user_id"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value
    raise AuthError("token without user identity")


def resolve_user_context(
    token: str,
    active_org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate JWT and resolve user + optional org membership."""
    if config.SKIP_AUTH:
        return {
            "user_id": "skip-auth-user",
            "org_id": active_org_id,
            "role": None,
            "is_admin": True,
        }

    payload = decode_access_token(token)
    user_id = _user_id_from_payload(payload)

    with get_conn() as conn:
        user_row = conn.execute(
            adapt_sql("SELECT id, is_admin FROM users WHERE id = ? LIMIT 1"),
            [user_id],
        ).fetchone()
        if not user_row:
            raise AuthError("user not found")
        user = row_to_dict(user_row)
        is_admin = bool(user.get("is_admin"))

        role: Optional[str] = None
        if active_org_id:
            membership = conn.execute(
                adapt_sql("SELECT role FROM org_memberships WHERE user_id = ? AND org_id = ? LIMIT 1"),
                [user_id, active_org_id],
            ).fetchone()
            if not membership:
                raise AuthError("user is not a member of the organization")
            role = row_to_dict(membership).get("role")

    return {
        "user_id": user_id,
        "org_id": active_org_id,
        "role": role,
        "is_admin": is_admin,
    }


def require_admin(context: Dict[str, Any]) -> None:
    is_admin = bool(context.get("is_admin"))
    role = context.get("role")
    if is_admin:
        return
    if role in _ADMIN_ROLES:
        return
    raise AuthError("admin access required")
