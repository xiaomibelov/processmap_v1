from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..services import org_groups as _svc

router = APIRouter()


class GroupCreateIn(BaseModel):
    name: str
    description: str = ""


class GroupPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None


class GroupMemberIn(BaseModel):
    user_id: str


# Group collection

@router.get("/api/orgs/{org_id}/groups")
@router.get("/api/admin/organizations/{org_id}/groups")
def list_groups(org_id: str, request: Request) -> Any:
    return _svc.list_groups(org_id, request)


@router.post("/api/orgs/{org_id}/groups", status_code=201)
@router.post("/api/admin/organizations/{org_id}/groups", status_code=201)
def create_group(org_id: str, inp: GroupCreateIn, request: Request) -> Any:
    return _svc.create_group(org_id, inp, request)


# Group item

@router.patch("/api/orgs/{org_id}/groups/{group_id}")
@router.patch("/api/admin/organizations/{org_id}/groups/{group_id}")
def patch_group(org_id: str, group_id: str, inp: GroupPatchIn, request: Request) -> Any:
    return _svc.update_group(org_id, group_id, inp, request)


@router.delete("/api/orgs/{org_id}/groups/{group_id}")
@router.delete("/api/admin/organizations/{org_id}/groups/{group_id}")
def delete_group(org_id: str, group_id: str, request: Request) -> Any:
    return _svc.delete_group(org_id, group_id, request)


# Group members

@router.get("/api/orgs/{org_id}/groups/{group_id}/members")
@router.get("/api/admin/organizations/{org_id}/groups/{group_id}/members")
def list_group_members(org_id: str, group_id: str, request: Request) -> Any:
    return _svc.list_members(org_id, group_id, request)


@router.post("/api/orgs/{org_id}/groups/{group_id}/members")
@router.post("/api/admin/organizations/{org_id}/groups/{group_id}/members")
def add_group_member(org_id: str, group_id: str, inp: GroupMemberIn, request: Request) -> Any:
    return _svc.add_member(org_id, group_id, inp, request)


@router.delete("/api/orgs/{org_id}/groups/{group_id}/members/{user_id}")
@router.delete("/api/admin/organizations/{org_id}/groups/{group_id}/members/{user_id}")
def remove_group_member(org_id: str, group_id: str, user_id: str, request: Request) -> Any:
    return _svc.remove_member(org_id, group_id, user_id, request)
