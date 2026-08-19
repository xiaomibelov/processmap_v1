"""Авторизация сервиса: JWT decode общим секретом + membership по общей БД +
org-scoped проверка доступа к сессии (read-only SQL в sessions).

Паттерн notifications app/services/auth_service.py (decode_access_token /
resolve_user_context). Гейт — «org member», как у LLM3 (решение владельца
2026-08-16): сессия должна принадлежать org, пользователь — быть member этой
org (или platform admin). Роль technologist не вводим. issuer в токенах
монолита не используется → JWT_ISSUER default None.

Чужая/несуществующая сессия → 404 (как session_repo.load → raise_session_not_found
в монолите — существование сессии чужой org не раскрываем).
"""
from __future__ import annotations

import os
from typing import Any, Dict

import jwt

from db import adapt_sql, get_conn, row_to_dict


class AuthError(Exception):
    """401: токен отсутствует/невалиден/просрочен, пользователь не найден."""


class SessionNotFound(Exception):
    """404: сессии нет, она удалена или принадлежит чужой org."""


def decode_access_token(token: str) -> Dict[str, Any]:
    if not token:
        raise AuthError("missing token")
    try:
        payload = jwt.decode(
            token,
            str(os.environ.get("JWT_SECRET") or "dev-insecure-change-me"),
            algorithms=["HS256"],
            issuer=os.environ.get("JWT_ISSUER") or None,
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


def get_session_context(token: str, session_id: str) -> Dict[str, Any]:
    """Validate JWT and resolve user + org-scoped session access (org member gate)."""
    payload = decode_access_token(token)
    user_id = _user_id_from_payload(payload)
    sid = str(session_id or "").strip()

    with get_conn() as conn:
        user_row = conn.execute(
            adapt_sql("SELECT id, is_admin FROM users WHERE id = ? LIMIT 1"),
            [user_id],
        ).fetchone()
        if not user_row:
            raise AuthError("user not found")
        user = row_to_dict(user_row)
        is_admin = bool(user.get("is_admin"))

        sess_row = conn.execute(
            adapt_sql(
                "SELECT id, org_id, project_id, owner_user_id, deleted_at, diagram_state_version"
                " FROM sessions WHERE id = ? LIMIT 1"
            ),
            [sid],
        ).fetchone()
        if not sess_row:
            raise SessionNotFound(sid)
        session = row_to_dict(sess_row)
        if int(session.get("deleted_at") or 0):
            raise SessionNotFound(sid)

        role = None
        if not is_admin:
            org_id = str(session.get("org_id") or "org_default")
            membership = conn.execute(
                adapt_sql("SELECT role FROM org_memberships WHERE user_id = ? AND org_id = ? LIMIT 1"),
                [user_id, org_id],
            ).fetchone()
            if not membership:
                # org-scoped gate: чужая org → 404, как в монолите
                raise SessionNotFound(sid)
            role = row_to_dict(membership).get("role")

    return {
        "user_id": user_id,
        "org_id": str(session.get("org_id") or "org_default"),
        "role": role,
        "is_admin": is_admin,
        "session": session,
    }
