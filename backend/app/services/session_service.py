from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from ..models import Session
from ..repositories import session_repo
from ..storage import get_storage

logger = logging.getLogger(__name__)


def create_session(
    title: str,
    roles: List[str] | None = None,
    *,
    start_role: Optional[str] = None,
    prep_questions: Optional[List[Dict[str, Any]]] = None,
    project_id: Optional[str] = None,
    mode: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new session."""
    st = get_storage()
    sid = session_repo.create(
        title=title,
        roles=roles,
        start_role=start_role,
        project_id=project_id,
        mode=mode,
        user_id=user_id,
        org_id=org_id,
    )
    sess = session_repo.load(sid, user_id=user_id, org_id=org_id, is_admin=True)
    if sess is None:
        raise RuntimeError("session not persisted")
    if prep_questions:
        sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=True)
    # Note: _recompute_session and _session_api_dump are still in _legacy_main.py
    # Full extraction requires moving those helpers first.
    import backend.app._legacy_main as _lm
    sess = _lm._recompute_session(sess)
    session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=True)
    _lm._invalidate_session_caches(sess, org_id=org_id or getattr(sess, "org_id", "") or "")
    return _lm._session_api_dump(sess)


def get_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    """Load a single session by id."""
    sess = session_repo.load(session_id, user_id=user_id, org_id=org_id, is_admin=is_admin)
    if not sess:
        return {"error": "not found"}
    import backend.app._legacy_main as _lm
    return _lm._session_api_dump(sess)


def list_sessions(
    query: Optional[str] = None,
    limit: int = 200,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    allowed_project_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """List sessions with optional filtering."""
    items = session_repo.list_sessions(
        query=query,
        limit=min(max(int(limit), 1), 500),
        org_id=org_id,
        is_admin=is_admin,
    )
    if allowed_project_ids:
        items = [
            item for item in items
            if str((item or {}).get("project_id") or "").strip() in allowed_project_ids
        ]
    return {"items": items, "count": len(items)}


def list_project_sessions(
    project_id: str,
    mode: Optional[str] = None,
    view: str = "full",
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = True,
) -> List[Dict[str, Any]]:
    """List sessions scoped to a project."""
    if view == "summary":
        return session_repo.list_project_session_summaries(
            project_id=project_id,
            mode=mode,
            limit=500,
            org_id=org_id,
            is_admin=is_admin,
        )
    rows = session_repo.list_sessions(
        query=None,
        limit=500,
        org_id=org_id,
        is_admin=is_admin,
    )
    # Filter by project_id in memory (storage.list does not support project_id filter directly)
    rows = [r for r in rows if str((r or {}).get("project_id") or "").strip() == project_id]
    out = []
    import backend.app._legacy_main as _lm
    for row in rows:
        if isinstance(row, dict):
            out.append(_lm._session_api_dump(Session.model_validate(row)))
    return out


def delete_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> bool:
    """Delete a session."""
    return session_repo.delete(
        session_id,
        user_id=user_id,
        org_id=org_id,
        is_admin=is_admin,
    )
