from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from ..services.org_workspace import list_org_members_payload

router = APIRouter()


@router.get("/api/orgs/{org_id}/members")
def list_org_members_endpoint(org_id: str, request: Request) -> Any:
    return list_org_members_payload(request, org_id)
