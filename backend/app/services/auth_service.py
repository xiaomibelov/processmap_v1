from __future__ import annotations

from typing import Any, Dict

from ..auth import (
    AuthError,
    authenticate_user,
    ensure_invited_identity,
    find_user_by_email,
    issue_login_tokens,
    revoke_refresh_from_token,
    rotate_refresh_token,
    set_invited_identity_password,
)
from ..storage import (
    accept_org_invite,
    count_org_records,
    get_default_org_id,
    list_user_org_memberships,
    preview_org_invite,
    resolve_active_org_id,
)
from ..services.org_invites import (
    extract_invite_token,
    invited_identity_state,
)
from ..utils.response_builders import (
    build_auth_me_payload,
    build_invite_activate_payload,
    build_invite_preview_payload,
)


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
    return build_auth_me_payload(
        user_id=user_id,
        email=str(user.get("email") or ""),
        is_admin=is_admin,
        active_org_id=active_org_id,
        default_org_id=get_default_org_id(),
        orgs=memberships,
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
