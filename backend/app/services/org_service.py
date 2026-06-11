from __future__ import annotations

from typing import Any, Dict, List, Optional


def patch_org(org_id: str, inp, request=None) -> Dict[str, Any]:
    import backend.app._legacy_main as _lm
    return _lm.patch_org_endpoint(org_id, inp, request)


def get_org_git_mirror(org_id: str, request=None) -> Dict[str, Any]:
    import backend.app._legacy_main as _lm
    return _lm.get_org_git_mirror_endpoint(org_id, request)


def patch_org_git_mirror(org_id: str, inp, request=None) -> Dict[str, Any]:
    import backend.app._legacy_main as _lm
    return _lm.patch_org_git_mirror_endpoint(org_id, inp, request)


def validate_org_git_mirror(org_id: str, inp, request=None) -> Dict[str, Any]:
    import backend.app._legacy_main as _lm
    return _lm.validate_org_git_mirror_endpoint(org_id, inp, request)


def patch_org_member(org_id: str, user_id: str, inp, request=None):
    import backend.app._legacy_main as _lm
    return _lm.patch_org_member_endpoint(org_id, user_id, inp, request)


def list_org_projects(org_id: str, request=None) -> List[Dict[str, Any]]:
    import backend.app._legacy_main as _lm
    return _lm.list_org_projects(org_id, request)


def create_org_project(org_id: str, inp, request=None) -> Dict[str, Any]:
    import backend.app._legacy_main as _lm
    return _lm.create_org_project(org_id, inp, request)


def get_org_project(org_id: str, project_id: str, request=None) -> Dict[str, Any]:
    import backend.app._legacy_main as _lm
    return _lm.get_org_project(org_id, project_id, request)


def list_org_project_sessions(org_id: str, project_id: str, request=None, mode=None, view=None) -> List[Dict[str, Any]]:
    import backend.app._legacy_main as _lm
    return _lm.list_org_project_sessions(org_id, project_id, request, mode, view)


def create_org_project_session(org_id: str, project_id: str, inp, request=None, mode=None):
    import backend.app._legacy_main as _lm
    return _lm.create_org_project_session(org_id, project_id, inp, request, mode)


def list_org_project_members(org_id: str, project_id: str, request=None) -> Dict[str, Any]:
    import backend.app._legacy_main as _lm
    return _lm.list_org_project_members(org_id, project_id, request)


def create_org_project_member(org_id: str, project_id: str, inp, request=None):
    import backend.app._legacy_main as _lm
    return _lm.create_org_project_member(org_id, project_id, inp, request)


def patch_org_project_member(org_id: str, project_id: str, user_id: str, inp, request=None):
    import backend.app._legacy_main as _lm
    return _lm.patch_org_project_member(org_id, project_id, user_id, inp, request)


def delete_org_project_member(org_id: str, project_id: str, user_id: str, request=None):
    import backend.app._legacy_main as _lm
    return _lm.delete_org_project_member(org_id, project_id, user_id, request)


def list_org_audit(org_id: str, request=None, limit=100, action="", project_id="", session_id="", status=""):
    import backend.app._legacy_main as _lm
    return _lm.list_org_audit_endpoint(org_id, request, limit, action, project_id, session_id, status)


def cleanup_org_audit(org_id: str, request=None, retention_days: int = 0):
    import backend.app._legacy_main as _lm
    return _lm.cleanup_org_audit_endpoint(org_id, request, retention_days)


def get_enterprise_workspace(request=None):
    import backend.app._legacy_main as _lm
    return _lm.get_enterprise_workspace(request)


# ── Invites (thin extraction from org_invites.py) ─────────────────

def list_org_invites(org_id: str, request=None):
    import backend.app._legacy_main as _lm
    return _lm.list_org_invites_endpoint(org_id, request)


def create_org_invite(org_id: str, inp, request=None):
    import backend.app._legacy_main as _lm
    return _lm.create_org_invite_endpoint(org_id, inp, request)


def accept_org_invite(org_id: str, inp, request=None):
    import backend.app._legacy_main as _lm
    return _lm.accept_org_invite_endpoint(org_id, inp, request)


def accept_invite(inp, request=None):
    import backend.app._legacy_main as _lm
    return _lm.accept_invite_endpoint(inp, request)


def revoke_org_invite(org_id: str, invite_id: str, request=None):
    import backend.app._legacy_main as _lm
    return _lm.revoke_org_invite_endpoint(org_id, invite_id, request)


def cleanup_org_invites(org_id: str, request=None, keep_days: int = 0):
    import backend.app._legacy_main as _lm
    return _lm.cleanup_org_invites_endpoint(org_id, request, keep_days)
