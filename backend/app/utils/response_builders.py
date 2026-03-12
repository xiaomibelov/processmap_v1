from __future__ import annotations

from typing import Any, Dict, List, Optional


def build_items_count_payload(items: List[Any], **extra: Any) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"items": items, "count": len(items)}
    payload.update(extra)
    return payload


def build_items_payload(items: List[Any], **extra: Any) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"items": items}
    payload.update(extra)
    return payload


def build_auth_me_payload(
    *,
    user_id: str,
    email: str,
    is_admin: bool,
    active_org_id: str,
    default_org_id: str,
    orgs: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "id": str(user_id or ""),
        "email": str(email or ""),
        "is_admin": bool(is_admin),
        "active_org_id": str(active_org_id or ""),
        "default_org_id": str(default_org_id or ""),
        "orgs": list(orgs or []),
    }


def build_invite_preview_payload(
    invite: Dict[str, Any],
    *,
    identity_state: str,
    single_org_mode: bool = False,
) -> Dict[str, Any]:
    return {
        "invite": {
            "id": str(invite.get("id") or ""),
            "email": str(invite.get("email") or ""),
            "full_name": str(invite.get("full_name") or ""),
            "job_title": str(invite.get("job_title") or ""),
            "org_id": str(invite.get("org_id") or ""),
            "org_name": str(invite.get("org_name") or invite.get("org_id") or ""),
            "role": str(invite.get("role") or "viewer"),
            "status": str(invite.get("status") or "pending"),
            "expires_at": int(invite.get("expires_at") or 0),
            "invite_mode": "one_time",
            "created_by": str(invite.get("created_by") or ""),
            "invite_key": str(invite.get("invite_key") or ""),
            "used_by_user_id": str(invite.get("used_by_user_id") or invite.get("used_by") or ""),
            "used_at": int(invite.get("used_at") or 0) if invite.get("used_at") else None,
        },
        "identity": {
            "login": str(invite.get("email") or ""),
            "email": str(invite.get("email") or ""),
            "state": str(identity_state or "missing"),
            "readonly": True,
        },
        "activation_allowed": str(identity_state or "missing") != "active",
        "single_org_mode": bool(single_org_mode),
    }


def build_invite_activate_payload(
    *,
    issued: Dict[str, Any],
    accepted: Dict[str, Any],
    activated_user: Dict[str, Any],
    invited_email: str,
) -> Dict[str, Any]:
    return {
        "access_token": str(issued.get("access_token") or ""),
        "token_type": "bearer",
        "invite": accepted,
        "membership": {
            "org_id": str(accepted.get("org_id") or ""),
            "user_id": str(activated_user.get("id") or ""),
            "role": str(accepted.get("role") or "viewer"),
        },
        "user": {
            "id": str(activated_user.get("id") or ""),
            "email": str(activated_user.get("email") or invited_email),
        },
    }
