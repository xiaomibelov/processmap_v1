"""Core status transition service."""

from __future__ import annotations

import time
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from ..._legacy_main import (
    _audit_log_safe,
    _can_edit_workspace,
    _can_manage_workspace,
    _invalidate_session_caches,
    _legacy_load_session_scoped,
    _session_api_dump,
    get_default_org_id,
)
from ...legacy.request_context import request_auth_user as _request_auth_user
from ...services.org_workspace import org_role_for_request as _org_role_for_request
from ...services.publish_git_mirror import execute_git_mirror_publish
from ...session_status import validate_session_status_transition
from ...storage import get_storage


def change_session_status(
    session_id: str,
    inp: Any,
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    """Validate and apply a session status transition.

    Enforces the same CAS check as diagram-truth writes so that status changes
    do not silently overwrite concurrent edits.
    """
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}

    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False

    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    data = inp.model_dump(exclude_unset=True) if hasattr(inp, "model_dump") else dict(inp or {})
    next_status_raw = data.get("status")

    next_status = validate_session_status_transition(
        (sess.interview or {}).get("status"),
        next_status_raw,
        can_edit=_can_edit_workspace(role, is_admin=is_admin),
        can_archive=_can_manage_workspace(role, is_admin=is_admin),
    )

    st = get_storage()
    updated = st.patch_session_interview(
        session_id,
        {**(sess.interview or {}), "status": next_status},
        user_id=user_id,
        org_id=oid,
        is_admin=True,
    )
    if updated is not None:
        sess = updated

    if next_status == "ready":
        interview_pending = dict(getattr(sess, "interview", {}) or {})
        mirror_pending = interview_pending.get("git_mirror_publish")
        if not isinstance(mirror_pending, dict):
            mirror_pending = {}
        mirror_pending = {
            **mirror_pending,
            "schema_version": "git_mirror_publish_v1",
            "mirror_state": "pending",
            "last_attempt_at": int(time.time()),
            "last_error": None,
        }
        interview_pending["git_mirror_publish"] = mirror_pending
        updated = st.patch_session_interview(
            session_id,
            interview_pending,
            user_id=user_id,
            org_id=oid,
            is_admin=True,
        )
        if updated is not None:
            sess = updated

        mirror_result = execute_git_mirror_publish(
            sess,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            user_id=user_id,
        )
        next_interview = mirror_result.get("interview")
        if isinstance(next_interview, dict):
            updated = st.patch_session_interview(
                session_id,
                next_interview,
                user_id=user_id,
                org_id=oid,
                is_admin=True,
            )
            if updated is not None:
                sess = updated

    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.update",
        entity_type="session",
        entity_id=str(getattr(sess, "id", "") or session_id),
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=str(getattr(sess, "id", "") or session_id),
        meta={"keys": ["status"], "status": next_status},
    )
    _invalidate_session_caches(
        sess,
        org_id=oid or getattr(sess, "org_id", "") or get_default_org_id(),
    )
    from ..analytics_aggregator import publish_session_saved
    publish_session_saved(
        str(getattr(sess, "id", "") or session_id),
        oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
    )
    return _session_api_dump(sess)
