from typing import Optional

from .. import storage
from ..shared.dto.deployment_notice_dto import DeploymentNoticeOut


def create(message: str, scheduled_at: int, display_duration_minutes: int, created_by: str) -> DeploymentNoticeOut:
    row = storage.create_deployment_notice(
        message=message,
        scheduled_at=scheduled_at,
        display_duration_minutes=display_duration_minutes,
        created_by=created_by,
    )
    return DeploymentNoticeOut(**row)


def list_all(limit: int = 100) -> list[DeploymentNoticeOut]:
    rows = storage.list_deployment_notices(limit=limit)
    return [DeploymentNoticeOut(**r) for r in rows]


def get_active(now: Optional[int] = None) -> Optional[DeploymentNoticeOut]:
    row = storage.get_active_deployment_notice(now=now)
    if not row:
        return None
    return DeploymentNoticeOut(**row)


def cancel(notice_id: str) -> bool:
    return storage.cancel_deployment_notice(notice_id)
