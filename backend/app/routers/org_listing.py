from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..legacy.request_context import request_auth_user, request_user_meta
from ..services.org_workspace import list_org_memberships_payload
from ..storage import (
    create_org_record,
    get_user_org_role,
    upsert_org_membership,
)

router = APIRouter()

_ORG_WRITE_ROLES = {"org_owner", "org_admin"}


class CreateOrgBody(BaseModel):
    name: str
    id: Optional[str] = None


class AssignOrgMemberBody(BaseModel):
    """Body for assigning/re-assigning a user to an organization."""
    user_id: str
    role: str = "org_viewer"


@router.get("/api/orgs")
def list_orgs_endpoint(request: Request) -> Any:
    return list_org_memberships_payload(request)


@router.post("/api/orgs", status_code=201)
def create_org_endpoint(body: CreateOrgBody, request: Request) -> Dict[str, Any]:
    """Create a new organization. Requires is_admin OR org_owner/org_admin in current org."""
    user = request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    current_org_id = str(getattr(request.state, "active_org_id", "") or "").strip()
    current_role = str(get_user_org_role(user_id, current_org_id) or "").strip() if current_org_id else ""
    if not is_admin and current_role not in _ORG_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="forbidden")
    name = str(body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    org = create_org_record(name=name, created_by=user_id, org_id=getattr(body, "id", None))
    return org


@router.post("/api/orgs/{org_id}/members/assign")
def assign_org_member(org_id: str, body: AssignOrgMemberBody, request: Request) -> Dict[str, Any]:
    """Assign (or update) a user's membership and role in a specific organization.
    org_id comes from the path. Requires is_admin OR org_owner/org_admin in that org.
    """
    actor_id, is_admin = request_user_meta(request)
    target_org_id = str(org_id or "").strip()
    if not target_org_id:
        raise HTTPException(status_code=422, detail="org_id required")
    if not is_admin:
        actor_role = str(get_user_org_role(actor_id, target_org_id) or "").strip()
        if actor_role not in _ORG_WRITE_ROLES:
            raise HTTPException(status_code=403, detail="forbidden")
    target_user_id = str(body.user_id or "").strip()
    if not target_user_id:
        raise HTTPException(status_code=422, detail="user_id required")
    role = str(body.role or "org_viewer").strip() or "org_viewer"
    upsert_org_membership(target_org_id, target_user_id, role)
    return {"ok": True, "org_id": target_org_id, "user_id": target_user_id, "role": role}
