from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from .. import _legacy_main
from ..schemas.legacy_api import OrgInviteAcceptIn, OrgInviteCreateIn

router = APIRouter()


@router.get("/api/orgs/{org_id}/invites")
@router.get("/api/admin/organizations/{org_id}/invites")
def list_org_invites_endpoint(org_id: str, request: Request) -> Any:
    return _legacy_main.list_org_invites_endpoint(org_id, request)


@router.post("/api/orgs/{org_id}/invites")
@router.post("/api/admin/organizations/{org_id}/invites")
def create_org_invite_endpoint(org_id: str, inp: OrgInviteCreateIn, request: Request) -> Any:
    return _legacy_main.create_org_invite_endpoint(org_id, inp, request)


@router.post("/api/orgs/{org_id}/invites/accept")
def accept_org_invite_endpoint(org_id: str, inp: OrgInviteAcceptIn, request: Request) -> Any:
    return _legacy_main.accept_org_invite_endpoint(org_id, inp, request)


@router.post("/api/invites/accept")
def accept_invite_endpoint(inp: OrgInviteAcceptIn, request: Request) -> Any:
    return _legacy_main.accept_invite_endpoint(inp, request)


@router.post("/api/orgs/{org_id}/invites/{invite_id}/revoke")
@router.post("/api/admin/organizations/{org_id}/invites/{invite_id}/revoke")
def revoke_org_invite_endpoint(org_id: str, invite_id: str, request: Request) -> Any:
    return _legacy_main.revoke_org_invite_endpoint(org_id, invite_id, request)


@router.post("/api/orgs/{org_id}/invites/cleanup")
def cleanup_org_invites_endpoint(org_id: str, request: Request, keep_days: int = 0) -> Any:
    return _legacy_main.cleanup_org_invites_endpoint(org_id, request, keep_days=keep_days)
