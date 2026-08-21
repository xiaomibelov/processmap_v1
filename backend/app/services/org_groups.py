from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import Request

from ..legacy.request_context import (
    enterprise_error as _enterprise_error,
    request_user_meta,
)
from ..services.org_workspace import (
    enterprise_require_org_member,
    enterprise_require_org_role,
    user_is_assignable_to_org,
)
from ..storage import (
    add_group_member as _add_group_member,
    create_org_group as _create_org_group,
    delete_org_group as _delete_org_group,
    get_org_group as _get_org_group,
    list_group_members as _list_group_members,
    list_org_groups as _list_org_groups,
    list_user_groups as _list_user_groups,
    remove_group_member as _remove_group_member,
    update_org_group as _update_org_group,
)
from ..utils.authz import ORG_MEMBER_MANAGE_ROLES


ORG_GROUP_READ_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}


def _clean_name(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def list_groups(org_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    if not role:
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    items = _list_org_groups(oid)
    return {"ok": True, "items": items, "count": len(items)}


def create_group(org_id: str, inp: Any, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    uid, _is_admin = request_user_meta(request)
    name = _clean_name(getattr(inp, "name", ""))
    if not name:
        return _enterprise_error(422, "validation_error", "name is required")
    description = _clean_name(getattr(inp, "description", ""))
    try:
        item = _create_org_group(oid, name, description=description, created_by=uid or "")
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        if "already exists" in marker:
            return _enterprise_error(409, "conflict", "group_name_exists")
        return _enterprise_error(422, "validation_error", str(exc))
    return {"ok": True, "item": item}


def update_group(org_id: str, group_id: str, inp: Any, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    role, err = enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    uid, _is_admin = request_user_meta(request)
    name = getattr(inp, "name", None)
    description = getattr(inp, "description", None)
    try:
        item = _update_org_group(
            oid,
            gid,
            name=_clean_name(name) if name is not None else None,
            description=_clean_name(description) if description is not None else None,
            updated_by=uid or "",
        )
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        if "not found" in marker:
            return _enterprise_error(404, "not_found", "not_found")
        if "already exists" in marker:
            return _enterprise_error(409, "conflict", "group_name_exists")
        return _enterprise_error(422, "validation_error", str(exc))
    if not item:
        return _enterprise_error(404, "not_found", "not_found")
    return {"ok": True, "item": item}


def delete_group(org_id: str, group_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    role, err = enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    if not gid:
        return _enterprise_error(422, "validation_error", "group_id is required")
    if not _delete_org_group(oid, gid):
        return _enterprise_error(404, "not_found", "not_found")
    return {"ok": True}


def list_members(org_id: str, group_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    role, err = enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    if not role:
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    group = _get_org_group(oid, gid)
    if not group:
        return _enterprise_error(404, "not_found", "not_found")
    items = _list_group_members(oid, gid)
    return {"ok": True, "items": items, "count": len(items)}


def add_member(org_id: str, group_id: str, inp: Any, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    role, err = enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    uid, _is_admin = request_user_meta(request)
    user_id = str(getattr(inp, "user_id", "") or "").strip()
    if not user_id:
        return _enterprise_error(422, "validation_error", "user_id is required")
    if not user_is_assignable_to_org(user_id, oid):
        return _enterprise_error(422, "validation_error", "user is not an org member")
    try:
        _add_group_member(oid, gid, user_id, created_by=uid or "")
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        if "not found" in marker:
            return _enterprise_error(404, "not_found", marker)
        return _enterprise_error(422, "validation_error", str(exc))
    items = _list_group_members(oid, gid)
    return {"ok": True, "items": items, "count": len(items)}


def remove_member(org_id: str, group_id: str, user_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    gid = str(group_id or "").strip()
    uid = str(user_id or "").strip()
    role, err = enterprise_require_org_role(request, oid, ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    if not uid:
        return _enterprise_error(422, "validation_error", "user_id is required")
    if not _remove_group_member(oid, gid, uid):
        return _enterprise_error(404, "not_found", "not_found")
    return {"ok": True}


def user_groups(user_id: str, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return _list_user_groups(user_id, org_id)
