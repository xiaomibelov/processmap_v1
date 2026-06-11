from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..models import Session
from ..storage import get_storage


def create(
    title: str,
    roles: List[str] | None = None,
    *,
    start_role: Optional[str] = None,
    project_id: Optional[str] = None,
    mode: Optional[str] = None,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> str:
    st = get_storage()
    return st.create(
        title=title,
        roles=roles,
        start_role=start_role,
        project_id=project_id,
        mode=mode,
        user_id=user_id,
        is_admin=is_admin,
        org_id=org_id,
    )


def load(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> Optional[Session]:
    st = get_storage()
    return st.load(session_id, user_id=user_id, is_admin=is_admin, org_id=org_id)


def save(
    sess: Session,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> None:
    st = get_storage()
    st.save(sess, user_id=user_id, is_admin=is_admin, org_id=org_id)


def delete(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    org_id: Optional[str] = None,
) -> bool:
    st = get_storage()
    try:
        st.delete(session_id, user_id=user_id, is_admin=is_admin, org_id=org_id)
        return True
    except Exception:
        return False


def list_sessions(
    query: Optional[str] = None,
    limit: int = 200,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    st = get_storage()
    return st.list(query=query, limit=limit, org_id=org_id, is_admin=is_admin)


def list_project_session_summaries(
    project_id: str,
    mode: Optional[str] = None,
    limit: int = 500,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    st = get_storage()
    return st.list_project_session_summaries(
        project_id=project_id,
        mode=mode,
        limit=limit,
        org_id=org_id,
        is_admin=is_admin,
    )


def list_bpmn_versions(
    session_id: str,
    *,
    org_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    st = get_storage()
    return st.list_bpmn_versions(session_id, org_id=org_id)


def create_bpmn_version_snapshot(
    session_id: str,
    bpmn_xml: str,
    source_action: str,
    user_id: str,
    *,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    st = get_storage()
    return st.create_bpmn_version_snapshot(
        session_id=session_id,
        bpmn_xml=bpmn_xml,
        source_action=source_action,
        user_id=user_id,
        org_id=org_id,
    )
