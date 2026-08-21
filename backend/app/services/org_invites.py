from __future__ import annotations

import math
from typing import Any, Dict

from fastapi.responses import JSONResponse

from ..legacy.request_context import enterprise_error


def invite_error_to_response(marker_raw: str) -> JSONResponse:
    marker = str(marker_raw or "").strip().lower()
    if marker in {"invite_not_found", "invite_invalid_key", "invalid_key"}:
        return enterprise_error(404, "not_found", marker or "not_found")
    if marker == "invite_revoked":
        return enterprise_error(409, "conflict", "invite_revoked")
    if marker == "invite_expired":
        return enterprise_error(410, "gone", "invite_expired")
    if marker in {"invite_already_accepted", "invite_used", "invite_email_mismatch", "identity_already_active"}:
        return enterprise_error(409, "conflict", marker)
    if marker in {"token is required", "password_required", "password_mismatch", "password_too_short"}:
        return enterprise_error(422, "validation_error", marker)
    if marker in {"identity_not_found", "email_required"}:
        return enterprise_error(422, "validation_error", marker)
    if marker:
        return enterprise_error(422, "validation_error", marker)
    return enterprise_error(500, "invite_activation_failed", "invite_activation_failed")


def extract_invite_token(payload: Any) -> str:
    return str(
        getattr(payload, "invite_key", "")
        or getattr(payload, "key", "")
        or getattr(payload, "token", "")
        or ""
    ).strip()


def invited_identity_state(identity: Dict[str, Any] | None) -> str:
    if not isinstance(identity, dict):
        return "missing"
    has_password = bool(str(identity.get("password_hash") or "").strip())
    is_active = bool(identity.get("is_active", False))
    return "active" if (is_active and has_password) else "pending"


def normalize_invite_role(role_raw: Any) -> str:
    role = str(role_raw or "viewer").strip().lower() or "viewer"
    if role in {"owner", "org_owner"}:
        raise ValueError("owner_invite_not_allowed")
    return role


def normalize_invite_ttl_days(ttl_raw: Any, default_hours: int) -> int:
    ttl_days = 0
    try:
        ttl_days = int(ttl_raw or 0)
    except Exception:
        ttl_days = 0
    if ttl_days <= 0:
        ttl_days = max(1, int(math.ceil(float(default_hours or 24) / 24.0)))
    return max(1, min(ttl_days, 60))


def build_invite_create_audit_meta(
    *,
    email: str,
    role: str,
    full_name: str,
    job_title: str,
    delivery: str,
    is_admin: bool,
) -> Dict[str, Any]:
    return {
        "email": str(email or ""),
        "role": str(role or ""),
        "full_name": str(full_name or ""),
        "job_title": str(job_title or ""),
        "invite_mode": "one_time",
        "delivery": str(delivery or "token"),
        "is_admin": bool(is_admin),
    }
