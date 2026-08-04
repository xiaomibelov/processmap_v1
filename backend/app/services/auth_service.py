from __future__ import annotations

import logging
import time
from typing import Any, Dict

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from ..auth import (
    AuthError,
    _clear_refresh_cookie,
    _rate_limit_check,
    _set_refresh_cookie,
    authenticate_user,
    ensure_invited_identity,
    find_user_by_email,
    issue_login_tokens,
    revoke_refresh_from_token,
    rotate_refresh_token,
    set_invited_identity_password,
    user_from_bearer_header,
)
from ..legacy.request_context import (
    enterprise_error as _enterprise_error,
    extract_org_from_headers as _extract_org_from_headers,
    request_client_ip as _request_client_ip,
)
from ..schemas.legacy_api import AuthLoginIn, InviteActivateIn, InvitePreviewIn
from ..shared.coerce import _env_int
from ..storage import (
    accept_org_invite,
    append_audit_log,
    count_org_records,
    get_default_org_id,
    list_user_groups,
    list_user_org_memberships,
    preview_org_invite,
    resolve_active_org_id,
)
from ..services.org_invites import (
    extract_invite_token,
    invite_error_to_response as _invite_error_to_response,
    invited_identity_state,
)
from ..utils.response_builders import (
    build_auth_me_payload,
    build_invite_activate_payload,
    build_invite_preview_payload,
)
from .audit import _audit_log_safe

_auth_logger = logging.getLogger("auth_debug")


class AuthServiceError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail


def _invite_error(status_code: int, code: str, message: str) -> Dict[str, Any]:
    return {"status_code": status_code, "code": code, "detail": message}


def _invite_error_from_marker(marker_raw: str) -> Dict[str, Any]:
    marker = str(marker_raw or "").strip().lower()
    if marker in {"invite_not_found", "invite_invalid_key", "invalid_key"}:
        return _invite_error(404, "not_found", marker or "not_found")
    if marker == "invite_revoked":
        return _invite_error(409, "conflict", "invite_revoked")
    if marker == "invite_expired":
        return _invite_error(410, "gone", "invite_expired")
    if marker in {
        "invite_already_accepted",
        "invite_used",
        "invite_email_mismatch",
        "identity_already_active",
    }:
        return _invite_error(409, "conflict", marker)
    if marker in {"token is required", "password_required", "password_mismatch", "password_too_short"}:
        return _invite_error(422, "validation_error", marker)
    if marker in {"identity_not_found", "email_required"}:
        return _invite_error(422, "validation_error", marker)
    if marker:
        return _invite_error(422, "validation_error", marker)
    return _invite_error(500, "invite_activation_failed", "invite_activation_failed")


def login(
    email: str,
    password: str,
    *,
    user_agent: str = "",
    ip: str = "",
) -> Dict[str, Any]:
    try:
        user = authenticate_user(email, password)
    except AuthError as exc:
        raise AuthServiceError(401, "invalid_credentials") from exc

    issued = issue_login_tokens(user=user, user_agent=user_agent, ip=ip)
    return {
        "user": user,
        "access_token": str(issued.get("access_token") or ""),
        "refresh_token": str(issued.get("refresh_token") or ""),
        "refresh_expires_at": int(issued.get("refresh_expires_at") or 0),
    }


def refresh(
    refresh_token: str,
    *,
    user_agent: str = "",
    ip: str = "",
) -> Dict[str, Any]:
    try:
        rotated = rotate_refresh_token(
            refresh_token,
            user_agent=user_agent,
            ip=ip,
        )
    except AuthError as exc:
        raise AuthServiceError(401, str(exc)) from exc

    return {
        "access_token": str(rotated.get("access_token") or ""),
        "refresh_token": str(rotated.get("refresh_token") or ""),
        "refresh_expires_at": int(rotated.get("refresh_expires_at") or 0),
    }


def logout(refresh_token: str) -> bool:
    if refresh_token:
        return revoke_refresh_from_token(refresh_token)
    return False


def me(
    user: Dict[str, Any],
    requested_org_id: str | None = None,
) -> Dict[str, Any]:
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    memberships = list_user_org_memberships(user_id, is_admin=is_admin)
    active_org_id = resolve_active_org_id(
        user_id,
        requested_org_id=requested_org_id,
        is_admin=is_admin,
    )
    groups = list_user_groups(user_id, org_id=active_org_id)
    return build_auth_me_payload(
        user_id=user_id,
        email=str(user.get("email") or ""),
        is_admin=is_admin,
        active_org_id=active_org_id,
        default_org_id=get_default_org_id(),
        orgs=memberships,
        groups=groups,
        role=str(user.get("role") or ""),
    )


def preview_invite(raw_token_input: Any) -> Dict[str, Any]:
    token = extract_invite_token(raw_token_input)
    if not token:
        raise AuthServiceError(422, "token is required")
    try:
        invite = preview_org_invite(token)
    except ValueError as exc:
        err = _invite_error_from_marker(str(exc or "").strip().lower())
        raise AuthServiceError(err["status_code"], err["detail"]) from exc

    identity = find_user_by_email(str(invite.get("email") or "").strip().lower())
    return build_invite_preview_payload(
        invite,
        identity_state=invited_identity_state(identity),
        single_org_mode=count_org_records() <= 1,
    )


def activate_invite(
    raw_token_input: Any,
    password: str,
    password_confirm: str,
    *,
    ip: str = "",
    user_agent: str = "",
) -> Dict[str, Any]:
    token = extract_invite_token(raw_token_input)
    if not token:
        raise AuthServiceError(422, "token is required")
    if not password:
        raise AuthServiceError(422, "password_required")
    if len(password) < 8:
        raise AuthServiceError(422, "password_too_short")
    if password_confirm and password_confirm != password:
        raise AuthServiceError(422, "password_mismatch")

    try:
        invite = preview_org_invite(token)
    except ValueError as exc:
        err = _invite_error_from_marker(str(exc or "").strip().lower())
        raise AuthServiceError(err["status_code"], err["detail"]) from exc

    invited_email = str(invite.get("email") or "").strip().lower()
    identity = find_user_by_email(invited_email)
    if isinstance(identity, dict):
        if bool(identity.get("is_active", False)) and str(identity.get("password_hash") or "").strip():
            raise AuthServiceError(422, "identity_already_active")

    try:
        base_identity = ensure_invited_identity(invited_email)
        accepted = accept_org_invite(
            str(invite.get("org_id") or "") or None,
            token,
            accepted_by=str(base_identity.get("id") or ""),
            accepted_email=invited_email,
        )
        activated_user = set_invited_identity_password(invited_email, password)
    except (ValueError, AuthError) as exc:
        err = _invite_error_from_marker(str(exc or "").strip().lower())
        raise AuthServiceError(err["status_code"], err["detail"]) from exc

    issued = issue_login_tokens(
        user=activated_user,
        user_agent=user_agent,
        ip=ip,
    )

    return build_invite_activate_payload(
        issued=issued,
        accepted=accepted,
        activated_user=activated_user,
        invited_email=invited_email,
    )


# ── Live /api/auth/* HTTP handlers (lifted verbatim from app._legacy_main, PR-6) ──
def auth_login(inp: AuthLoginIn, request: Request):
    login_limit = max(1, _env_int("RL_LOGIN_PER_MIN", 30))
    ip_key = str(_request_client_ip(request) or "ip_unknown")
    if not _rate_limit_check(f"login:{ip_key}", login_limit, 60):
        raise HTTPException(status_code=429, detail="too_many_requests")
    try:
        user = authenticate_user(inp.email, inp.password)
    except AuthError as _e:
        import logging
        logging.getLogger("auth_debug").warning(f"auth_login failed: email={inp.email} error={_e}")
        raise HTTPException(status_code=401, detail="invalid_credentials")

    issued = issue_login_tokens(
        user=user,
        user_agent=request.headers.get("user-agent", ""),
        ip=_request_client_ip(request),
    )
    max_age = max(1, int(issued.get("refresh_expires_at", 0)) - int(time.time()))
    payload = {
        "access_token": str(issued.get("access_token") or ""),
        "token_type": "bearer",
    }
    try:
        uid = str(user.get("id") or "").strip()
        oid = resolve_active_org_id(
            uid,
            requested_org_id=_extract_org_from_headers(request),
            is_admin=bool(user.get("is_admin", False)),
        )
        if uid and oid:
            append_audit_log(
                actor_user_id=uid,
                org_id=oid,
                action="login",
                entity_type="auth",
                entity_id=uid,
                status="ok",
                meta={"ip": _request_client_ip(request), "user_agent": str(request.headers.get("user-agent") or "")[:180]},
            )
    except Exception:
        pass
    resp = JSONResponse(status_code=200, content=payload)
    _set_refresh_cookie(resp, str(issued.get("refresh_token") or ""), max_age)
    return resp


def auth_refresh(request: Request):
    refresh_token = str(request.cookies.get("refresh_token") or "").strip()
    if not refresh_token:
        _auth_logger.warning("refresh_failed: missing_refresh_token ip=%s ua=%s", _request_client_ip(request), str(request.headers.get("user-agent", ""))[:120])
        resp = JSONResponse(status_code=401, content={"detail": "missing_refresh_token"})
        _clear_refresh_cookie(resp)
        return resp

    try:
        rotated = rotate_refresh_token(
            refresh_token,
            user_agent=request.headers.get("user-agent", ""),
            ip=_request_client_ip(request),
        )
    except AuthError as e:
        _auth_logger.warning("refresh_failed: %s ip=%s ua=%s", e, _request_client_ip(request), str(request.headers.get("user-agent", ""))[:120])
        resp = JSONResponse(status_code=401, content={"detail": str(e)})
        _clear_refresh_cookie(resp)
        return resp

    max_age = max(1, int(rotated.get("refresh_expires_at", 0)) - int(time.time()))
    payload = {
        "access_token": str(rotated.get("access_token") or ""),
        "token_type": "bearer",
    }
    resp = JSONResponse(status_code=200, content=payload)
    _set_refresh_cookie(resp, str(rotated.get("refresh_token") or ""), max_age)
    return resp


def auth_logout(request: Request):
    refresh_token = str(request.cookies.get("refresh_token") or "").strip()
    if refresh_token:
        revoke_refresh_from_token(refresh_token)
    resp = JSONResponse(status_code=200, content={"ok": True})
    _clear_refresh_cookie(resp)
    return resp


def auth_me(request: Request):
    user = getattr(request.state, "auth_user", None)
    if not isinstance(user, dict):
        try:
            user = user_from_bearer_header(request.headers.get("authorization", ""))
        except AuthError:
            raise HTTPException(status_code=401, detail="unauthorized")
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    memberships = list_user_org_memberships(user_id, is_admin=is_admin)
    requested_org_id = _extract_org_from_headers(request)
    active_org_id = resolve_active_org_id(user_id, requested_org_id=requested_org_id, is_admin=is_admin)
    groups = list_user_groups(user_id, org_id=active_org_id)
    return build_auth_me_payload(
        user_id=user_id,
        email=str(user.get("email") or ""),
        is_admin=is_admin,
        active_org_id=active_org_id,
        default_org_id=get_default_org_id(),
        orgs=memberships,
        groups=groups,
        role=str(user.get("role") or ""),
    )


def auth_invite_preview(inp: InvitePreviewIn, request: Request):
    token = extract_invite_token(inp)
    if not token:
        return _enterprise_error(422, "validation_error", "token is required")
    try:
        invite = preview_org_invite(token)
    except ValueError as exc:
        return _invite_error_to_response(str(exc or "").strip().lower())

    identity = find_user_by_email(str(invite.get("email") or "").strip().lower())
    return build_invite_preview_payload(
        invite,
        identity_state=invited_identity_state(identity),
        single_org_mode=count_org_records() <= 1,
    )


def auth_invite_activate(inp: InviteActivateIn, request: Request):
    token = extract_invite_token(inp)
    password = str(getattr(inp, "password", "") or "")
    password_confirm = str(getattr(inp, "password_confirm", "") or "")
    if not token:
        return _enterprise_error(422, "validation_error", "token is required")
    if not password:
        return _enterprise_error(422, "validation_error", "password_required")
    if len(password) < 8:
        return _enterprise_error(422, "validation_error", "password_too_short")
    if password_confirm and password_confirm != password:
        return _enterprise_error(422, "validation_error", "password_mismatch")

    accept_limit = max(1, _env_int("RL_ACCEPT_PER_MIN", 30))
    ip_key = str(_request_client_ip(request) or "ip_unknown")
    if not _rate_limit_check(f"auth:invite_activate:{ip_key}", accept_limit, 60):
        return _enterprise_error(429, "too_many_requests", "too_many_requests")

    try:
        invite = preview_org_invite(token)
    except ValueError as exc:
        return _invite_error_to_response(str(exc or "").strip().lower())

    invited_email = str(invite.get("email") or "").strip().lower()
    identity = find_user_by_email(invited_email)
    if isinstance(identity, dict):
        if bool(identity.get("is_active", False)) and str(identity.get("password_hash") or "").strip():
            return _invite_error_to_response("identity_already_active")
    try:
        base_identity = ensure_invited_identity(invited_email)
        accepted = accept_org_invite(
            str(invite.get("org_id") or "") or None,
            token,
            accepted_by=str(base_identity.get("id") or ""),
            accepted_email=invited_email,
        )
        activated_user = set_invited_identity_password(invited_email, password)
    except (ValueError, AuthError) as exc:
        return _invite_error_to_response(str(exc or "").strip().lower())

    issued = issue_login_tokens(
        user=activated_user,
        user_agent=request.headers.get("user-agent", ""),
        ip=_request_client_ip(request),
    )
    max_age = max(1, int(issued.get("refresh_expires_at", 0)) - int(time.time()))
    payload = build_invite_activate_payload(
        issued=issued,
        accepted=accepted,
        activated_user=activated_user,
        invited_email=invited_email,
    )
    _audit_log_safe(
        request,
        org_id=str(accepted.get("org_id") or get_default_org_id()),
        action="invite.activate",
        entity_type="org_invite",
        entity_id=str(accepted.get("id") or ""),
        status="ok",
        meta={
            "email": invited_email,
            "role": str(accepted.get("role") or ""),
            "team_name": str(accepted.get("team_name") or ""),
            "subgroup_name": str(accepted.get("subgroup_name") or ""),
        },
    )
    resp = JSONResponse(status_code=200, content=payload)
    _set_refresh_cookie(resp, str(issued.get("refresh_token") or ""), max_age)
    return resp

