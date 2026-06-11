from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..storage import (
    delete_project_membership,
    get_project_storage,
    list_project_memberships,
    upsert_project_membership,
)


def list_projects(org_id: Optional[str] = None, is_admin: bool = True) -> List[Any]:
    st = get_project_storage()
    return st.list(org_id=org_id, is_admin=is_admin)


def create_project(
    title: str,
    passport: Optional[Dict[str, Any]] = None,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    executor_user_id: Optional[str] = None,
) -> str:
    st = get_project_storage()
    return st.create(
        title=title,
        passport=passport or {},
        user_id=user_id,
        org_id=org_id,
        executor_user_id=executor_user_id,
    )


def load_project(project_id: str, org_id: Optional[str] = None, is_admin: bool = True):
    st = get_project_storage()
    return st.load(project_id, org_id=org_id, is_admin=is_admin)


def save_project(proj, *, user_id: Optional[str] = None, org_id: Optional[str] = None, is_admin: bool = True):
    st = get_project_storage()
    return st.save(proj, user_id=user_id, org_id=org_id, is_admin=is_admin)


def delete_project(project_id: str, org_id: Optional[str] = None, is_admin: bool = True):
    st = get_project_storage()
    return st.delete(project_id, org_id=org_id, is_admin=is_admin)


def list_members(org_id: str, project_id: str) -> List[Dict[str, Any]]:
    return list_project_memberships(org_id, project_id=project_id)


def upsert_member(org_id: str, project_id: str, user_id: str, role: str) -> Dict[str, Any]:
    return upsert_project_membership(org_id, project_id, user_id, role)


def delete_member(org_id: str, project_id: str, user_id: str):
    return delete_project_membership(org_id, project_id, user_id)
