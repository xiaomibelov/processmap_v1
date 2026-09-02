"""Session assignee management service.

Encapsulates the assignment logic for session-level responsible users.
This module is the single source of truth for assign/unassign/list/replace
operations; controllers and frontend must only call this service layer.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Request

from ..cache import session_cache
from ..legacy.request_context import (
    request_active_org_id,
    request_is_admin,
    request_user_meta,
)
from ..redis_cache import explorer_invalidate_sessions
from ..repositories import project_repo, session_repo
from . import org_workspace as _org
from .session_event_bus import get_session_event_bus
from .session_events import SessionAssigneesChanged
from ..domains.storage.canvas_session.repository import (
    load_session_assignees,
    replace_session_assignees,
)

logger = logging.getLogger(__name__)


def _raise_not_found(session_id: str) -> None:
    raise HTTPException(status_code=404, detail="session not found")


def _load_session_for_assignment(session_id: str) -> Any:
    """Load a session without applying user-level read scope.

    Assignment is an org-scoped management operation; we load the session
    as admin and then verify the actor's permissions against the project.
    """
    sid = str(session_id or "").strip()
    if not sid:
        _raise_not_found(session_id)
    sess = session_repo.load(sid, org_id=None, is_admin=True)
    if sess is None:
        _raise_not_found(session_id)
    return sess


def _project_for_session(session: Any) -> Any:
    pid = str(getattr(session, "project_id", "") or "").strip()
    oid = str(getattr(session, "org_id", "") or "").strip()
    if not pid:
        raise HTTPException(status_code=422, detail="session has no project")
    proj = project_repo.load_project(pid, org_id=(oid or None), is_admin=True)
    if proj is None and oid:
        # Fallback for legacy sessions with drifted org_id.
        proj = project_repo.load_project(pid, org_id=None, is_admin=True)
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")
    return proj


def _can_manage_assignees(
    request: Optional[Request],
    org_id: str,
    project: Any,
) -> bool:
    """Return True if the authenticated user may change session assignees."""
    user_id, is_admin = request_user_meta(request)
    if not user_id:
        return False
    if is_admin:
        return True

    oid = str(org_id or "").strip()
    if oid:
        role = str(_org.org_role_for_request(request, oid) or "").strip().lower()
        if role in {"org_owner", "org_admin"}:
            return True

    uid = str(user_id or "").strip()
    owner = str(getattr(project, "owner_user_id", "") or "").strip()
    executor = str(getattr(project, "executor_user_id", "") or "").strip()
    if uid and (uid == owner or uid == executor):
        return True

    return False


def _require_org_access(request: Request, org_id: str) -> str:
    """Ensure the caller is a member of the org (or platform admin)."""
    user_id, is_admin = request_user_meta(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    oid = str(org_id or "").strip()
    if is_admin:
        return user_id
    if not oid:
        raise HTTPException(status_code=404, detail="organization not found")
    if not _org.user_has_org_membership(user_id, oid, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="not an organization member")
    return user_id


def _normalize_user_ids(user_ids: Any) -> List[str]:
    """Deduplicate and clean user ids while preserving request order."""
    out: List[str] = []
    seen: set[str] = set()
    for raw in user_ids or []:
        uid = str(raw or "").strip()
        if uid and uid not in seen:
            seen.add(uid)
            out.append(uid)
    return out


def _validate_assignees(org_id: str, user_ids: List[str]) -> List[str]:
    """Ensure every proposed assignee can be assigned in the organization."""
    oid = str(org_id or "").strip()
    if not oid:
        raise HTTPException(status_code=404, detail="organization not found")
    invalid: List[str] = []
    for uid in user_ids:
        if not _org.user_is_assignable_to_org(uid, oid):
            invalid.append(uid)
    if invalid:
        raise HTTPException(
            status_code=422,
            detail={"message": "assigned user is not an org member", "user_ids": invalid},
        )
    return user_ids


def _emit_assignees_changed(session_id: str, user_ids: List[str], actor_id: str) -> None:
    event = SessionAssigneesChanged(
        session_id=session_id,
        user_ids=user_ids,
        actor_id=actor_id,
    )
    try:
        get_session_event_bus().publish_nowait(session_id, event.to_bus_event())
    except Exception:
        logger.exception("failed to publish SessionAssigneesChanged for %s", session_id)


def _invalidate_caches(session_id: str, project_id: str) -> None:
    try:
        explorer_invalidate_sessions(project_id)
    except Exception:
        logger.exception("failed to invalidate explorer sessions cache for %s", project_id)
    try:
        session_cache.invalidate_session(session_id)
    except Exception:
        logger.exception("failed to invalidate session cache for %s", session_id)


def list_assignees(session_id: str, request: Request) -> List[Dict[str, Any]]:
    """Return current assignees for a session."""
    sess = _load_session_for_assignment(session_id)
    org_id = str(getattr(sess, "org_id", "") or "").strip() or request_active_org_id(request)
    _require_org_access(request, org_id)
    loaded = load_session_assignees([str(sess.id)])
    return loaded.get(str(sess.id), [])


def replace_assignees(
    session_id: str,
    user_ids: Any,
    request: Request,
) -> Dict[str, Any]:
    """Idempotently replace the assignee list for a session."""
    sess = _load_session_for_assignment(session_id)
    sid = str(sess.id)
    org_id = str(getattr(sess, "org_id", "") or "").strip() or request_active_org_id(request)

    actor_id, _ = request_user_meta(request)
    if not actor_id:
        raise HTTPException(status_code=401, detail="authentication required")

    proj = _project_for_session(sess)
    if not _can_manage_assignees(request, org_id, proj):
        raise HTTPException(status_code=403, detail="forbidden")

    final_ids = _normalize_user_ids(user_ids)
    if final_ids:
        _validate_assignees(org_id, final_ids)

    assigned = replace_session_assignees(
        sid,
        final_ids,
        assigned_by=actor_id,
        org_id=org_id,
        project_id=str(getattr(proj, "id", "") or ""),
    )

    _emit_assignees_changed(sid, assigned, actor_id)
    _invalidate_caches(sid, str(getattr(proj, "id", "") or ""))

    return {
        "session_id": sid,
        "user_ids": assigned,
        "assigned_by": actor_id,
    }
