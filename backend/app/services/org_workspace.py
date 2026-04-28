from __future__ import annotations

import re
from typing import Any, Dict, Optional, Set, Tuple

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from ..auth import find_user_by_id
from ..legacy.request_context import enterprise_error, request_active_org_id, request_auth_user, request_user_meta
from ..storage import (
    get_default_org_id,
    get_effective_project_scope,
    get_user_org_role,
    list_org_memberships,
    list_user_org_memberships,
    rename_org_record,
    resolve_active_org_id,
    user_has_org_membership,
)
from ..utils.response_builders import build_items_count_payload, build_items_payload

ORG_READ_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}
ORG_MEMBER_READ_ROLES = {"org_owner", "org_admin", "auditor"}
EXPLORER_CONTEXT_STATUSES = {"none", "as_is", "to_be"}
_GIT_MIRROR_PROVIDERS = {"github", "gitlab"}
_GITHUB_REPOSITORY_RE = re.compile(r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$")
_GITLAB_REPOSITORY_RE = re.compile(r"^[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)+$")


def org_role_for_request(request: Request, org_id: str) -> str:
    user_id, is_admin = request_user_meta(request)
    role = get_user_org_role(user_id, org_id, is_admin=is_admin)
    return str(role or "")


def require_org_member_for_enterprise(request: Request, org_id: str) -> str:
    oid = str(org_id or "").strip()
    user_id, is_admin = request_user_meta(request)
    if not oid:
        raise HTTPException(status_code=404, detail="not found")
    if not user_has_org_membership(user_id, oid, is_admin=is_admin):
        raise HTTPException(status_code=404, detail="not found")
    return org_role_for_request(request, oid)


def require_org_role(request: Request, org_id: str, allowed: Set[str]) -> str:
    role = require_org_member_for_enterprise(request, org_id)
    if role not in allowed:
        raise HTTPException(status_code=403, detail="forbidden")
    return role


def can_edit_workspace(request: Request, org_id: str) -> bool:
    user_id, is_admin = request_user_meta(request)
    if is_admin:
        return True
    if not user_id:
        return False
    return str(get_user_org_role(user_id, org_id, is_admin=is_admin) or "").strip().lower() in {
        "org_owner",
        "org_admin",
        "project_manager",
        "editor",
    }


def can_manage_workspace(request: Request, org_id: str) -> bool:
    user_id, is_admin = request_user_meta(request)
    if is_admin:
        return True
    if not user_id:
        return False
    return str(get_user_org_role(user_id, org_id, is_admin=is_admin) or "").strip().lower() in {
        "org_owner",
        "org_admin",
    }


def normalize_context_status(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return "none"
    if text not in EXPLORER_CONTEXT_STATUSES:
        raise HTTPException(status_code=400, detail="invalid context_status")
    return text


def build_assignable_user_payload(user_id: str) -> Optional[Dict[str, str]]:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    user = find_user_by_id(uid) or {}
    if not user:
        return None
    email = str(user.get("email") or "").strip().lower()
    full_name = str(user.get("full_name") or "").strip()
    job_title = str(user.get("job_title") or "").strip()
    display_name = full_name or email or uid
    return {
        "user_id": uid,
        "email": email,
        "full_name": full_name,
        "job_title": job_title,
        "display_name": display_name,
    }


def validate_org_user_assignable(org_id: str, user_id: Any) -> str:
    oid = str(org_id or "").strip()
    uid = str(user_id or "").strip()
    if not uid:
        return ""
    if not oid:
        raise HTTPException(status_code=404, detail="not found")
    if not build_assignable_user_payload(uid):
        raise HTTPException(status_code=422, detail="assigned user not found")
    if not user_has_org_membership(uid, oid, is_admin=False):
        raise HTTPException(status_code=422, detail="assigned user is not an org member")
    return uid


def enterprise_require_org_member(request: Request, org_id: str) -> Tuple[Optional[str], Optional[JSONResponse]]:
    oid = str(org_id or "").strip()
    if not oid:
        return None, enterprise_error(404, "not_found", "not_found")
    user_id, is_admin = request_user_meta(request)
    if not user_id:
        return None, enterprise_error(401, "unauthorized", "unauthorized")
    if not user_has_org_membership(user_id, oid, is_admin=is_admin):
        return None, enterprise_error(404, "not_found", "not_found")
    role = str(get_user_org_role(user_id, oid, is_admin=is_admin) or "").strip().lower()
    if role not in ORG_READ_ROLES and not is_admin:
        return None, enterprise_error(403, "forbidden", "insufficient_permissions")
    return role, None


def enterprise_require_org_role(
    request: Request,
    org_id: str,
    allowed: Set[str],
) -> Tuple[Optional[str], Optional[JSONResponse]]:
    role, err = enterprise_require_org_member(request, org_id)
    if err is not None:
        return None, err
    _, is_admin = request_user_meta(request)
    if is_admin:
        return role or "platform_admin", None
    allowed_normalized = {str(item or "").strip().lower() for item in allowed}
    if str(role or "").strip().lower() not in allowed_normalized:
        return None, enterprise_error(403, "forbidden", "insufficient_permissions")
    return role, None


def project_scope_for_request(request: Optional[Request], org_id: str) -> Dict[str, Any]:
    user_id, is_admin = request_user_meta(request)
    oid = str(org_id or "").strip() or get_default_org_id()
    if not user_id:
        return {"mode": "all", "project_ids": [], "org_role": ""}
    return get_effective_project_scope(user_id, oid, is_admin=is_admin)


def project_access_allowed(request: Optional[Request], org_id: str, project_id: str) -> bool:
    pid = str(project_id or "").strip()
    if not pid:
        return False
    scope = project_scope_for_request(request, org_id)
    if str(scope.get("mode") or "") == "all":
        return True
    allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
    return pid in allowed


def rename_org_with_validation(org_id: str, name: str) -> Dict[str, Any]:
    return rename_org_record(str(org_id or "").strip(), str(name or "").strip())


def resolved_active_org_id(request: Optional[Request]) -> str:
    return request_active_org_id(request)


def list_org_memberships_payload(request: Request) -> Dict[str, Any]:
    user = request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    active_org_id = (
        str(getattr(request.state, "active_org_id", "") or "").strip()
        or resolve_active_org_id(user_id, is_admin=is_admin)
    )
    items = list_user_org_memberships(user_id, is_admin=is_admin)
    return build_items_payload(
        items,
        active_org_id=active_org_id,
        default_org_id=get_default_org_id(),
    )


def list_org_members_payload(request: Request, org_id: str):
    oid = str(org_id or "").strip()
    role, err = enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    _, is_admin = request_user_meta(request)
    role_l = str(role or "").strip().lower()
    if not (is_admin or role_l in ORG_MEMBER_READ_ROLES):
        return enterprise_error(403, "forbidden", "insufficient_permissions")
    items = []
    for row_raw in list_org_memberships(oid):
        row = dict(row_raw or {}) if isinstance(row_raw, dict) else {}
        user_id = str(row.get("user_id") or "").strip()
        if user_id:
            found = find_user_by_id(user_id) or {}
            email = str(found.get("email") or "").strip().lower()
            if email:
                row["email"] = email
            row["full_name"] = str(found.get("full_name") or "").strip()
            row["job_title"] = str(found.get("job_title") or "").strip()
        items.append(row)
    return build_items_count_payload(items, org_id=oid)


def _norm_provider(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text in _GIT_MIRROR_PROVIDERS else ""


def _norm_text(value: Any) -> str:
    return str(value or "").strip()


def _norm_base_path(value: Any) -> str:
    src = _norm_text(value).replace("\\", "/")
    if not src:
        return ""
    src = re.sub(r"/+", "/", src)
    return src.strip("/")


def _is_valid_git_branch(value: str) -> bool:
    branch = _norm_text(value)
    if not branch or branch.startswith("/") or branch.endswith("/"):
        return False
    if branch == "@":
        return False
    if "//" in branch or "@{" in branch:
        return False
    if branch.startswith(".") or branch.endswith("."):
        return False
    if branch.endswith(".lock"):
        return False
    if ".." in branch or " " in branch:
        return False
    segments = branch.split("/")
    if any(not seg for seg in segments):
        return False
    for seg in segments:
        if seg.startswith("."):
            return False
        if seg.endswith(".lock"):
            return False
    if any(ch in branch for ch in ["~", "^", ":", "?", "*", "[", "\\"]):
        return False
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in branch):
        return False
    return True


def evaluate_org_git_mirror_config(config_raw: Dict[str, Any] | None) -> Dict[str, Any]:
    config = dict(config_raw or {})
    enabled = bool(config.get("git_mirror_enabled"))
    provider = _norm_provider(config.get("git_provider"))
    repository = _norm_text(config.get("git_repository"))
    branch = _norm_text(config.get("git_branch"))
    base_path = _norm_base_path(config.get("git_base_path"))

    issues = []
    if enabled:
        if not provider:
            issues.append("Provider is required when mirror is enabled.")
        if not repository:
            issues.append("Repository/project is required when mirror is enabled.")
        elif provider == "github" and not _GITHUB_REPOSITORY_RE.fullmatch(repository):
            issues.append("GitHub repository must be in owner/repo format.")
        elif provider == "gitlab" and not _GITLAB_REPOSITORY_RE.fullmatch(repository):
            issues.append("GitLab project must be in group/project or group/subgroup/project format.")
        if not branch:
            issues.append("Branch is required when mirror is enabled.")
        elif not _is_valid_git_branch(branch):
            issues.append("Branch contains unsupported characters.")
        if base_path and (".." in base_path.split("/") or base_path.startswith(".")):
            issues.append("Base path cannot contain parent traversal.")

    if not enabled:
        health_status = "unknown"
        health_message = "Mirror is disabled."
    elif issues:
        health_status = "invalid"
        health_message = " ".join(issues)
    else:
        health_status = "valid"
        health_message = "Configuration is valid."

    return {
        "git_mirror_enabled": enabled,
        "git_provider": provider or None,
        "git_repository": repository or None,
        "git_branch": branch or None,
        "git_base_path": base_path or None,
        "git_health_status": health_status,
        "git_health_message": health_message or None,
        "issues": issues,
    }
