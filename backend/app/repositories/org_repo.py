from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..storage import (
    cleanup_audit_log,
    get_org_git_mirror_config,
    list_audit_log,
    rename_org_record,
    update_org_git_mirror_config,
    upsert_org_membership,
)


def rename_org(org_id: str, name: str) -> Dict[str, Any]:
    return rename_org_record(org_id, name)


def get_git_mirror_config(org_id: str) -> Dict[str, Any]:
    return get_org_git_mirror_config(org_id)


def update_git_mirror_config(
    org_id: str,
    *,
    git_mirror_enabled: bool = False,
    git_provider: Optional[str] = None,
    git_repository: Optional[str] = None,
    git_branch: Optional[str] = None,
    git_base_path: Optional[str] = None,
    git_health_status: Optional[str] = None,
    git_health_message: Optional[str] = None,
    git_updated_by: Optional[str] = None,
) -> Dict[str, Any]:
    return update_org_git_mirror_config(
        org_id,
        git_mirror_enabled=git_mirror_enabled,
        git_provider=git_provider,
        git_repository=git_repository,
        git_branch=git_branch,
        git_base_path=git_base_path,
        git_health_status=git_health_status,
        git_health_message=git_health_message,
        git_updated_by=git_updated_by,
    )


def upsert_membership(org_id: str, user_id: str, role: str) -> Dict[str, Any]:
    return upsert_org_membership(org_id, user_id, role)


def list_audit(
    org_id: str,
    *,
    limit: int = 100,
    action: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    return list_audit_log(
        org_id,
        limit=limit,
        action=action,
        project_id=project_id,
        session_id=session_id,
        status=status,
    )


def cleanup_audit(org_id: str, retention_days: int) -> int:
    return cleanup_audit_log(org_id, retention_days=retention_days)
