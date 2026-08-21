from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request

from .. import _legacy_main
from ..repositories import deployment_notice_repo
from ..shared.dto.deployment_notice_dto import DeploymentNoticeIn, DeploymentNoticeOut

router = APIRouter()


def _platform_admin_context(request: Request):
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return None, None, _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    if not is_admin:
        return None, None, _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
    oid = _legacy_main._request_active_org_id(request)
    return uid, oid, None


@router.get("/api/deployment-notice", response_model=Optional[DeploymentNoticeOut])
async def get_public_deployment_notice():
    notice = deployment_notice_repo.get_active()
    return notice


@router.get("/api/admin/deployment-notices", response_model=list[DeploymentNoticeOut])
async def list_deployment_notices(request: Request):
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    return deployment_notice_repo.list_all(limit=100)


@router.post("/api/admin/deployment-notices", response_model=DeploymentNoticeOut)
async def create_deployment_notice(request: Request, body: DeploymentNoticeIn):
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    return deployment_notice_repo.create(
        message=body.message,
        scheduled_at=body.scheduled_at,
        display_duration_minutes=body.display_duration_minutes,
        created_by=uid,
    )


@router.delete("/api/admin/deployment-notices/{notice_id}")
async def cancel_deployment_notice(request: Request, notice_id: str):
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    canceled = deployment_notice_repo.cancel(notice_id)
    if not canceled:
        return _legacy_main._enterprise_error(404, "not_found", "deployment_notice_not_found")
    return {"ok": True}
