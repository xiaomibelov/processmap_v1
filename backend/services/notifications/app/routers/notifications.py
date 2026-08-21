from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..dependencies import get_current_admin, get_current_user
from ..repositories.notification_repo import (
    append_notification,
    count_notifications,
    delete_notification,
    get_notification,
    list_notifications,
    update_notification,
)
from ..shared.dto.notification_dto import NotificationIn, NotificationListOut, NotificationOut, NotificationPatchIn

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_notification(
    payload: NotificationIn,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    stored = append_notification(
        payload,
        trusted_user_id=user.get("user_id"),
        trusted_org_id=user.get("org_id"),
    )
    return {"ok": True, "item": stored.model_dump(mode="json")}


@router.get("")
def list_notifications_endpoint(
    user: Dict[str, Any] = Depends(get_current_admin),
    user_id: Optional[str] = None,
    type: Optional[str] = None,
    priority: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_dismissed: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "desc",
) -> NotificationListOut:
    filters: Dict[str, Any] = {
        "org_id": user.get("org_id"),
        "user_id": user_id,
        "type": type,
        "priority": priority,
        "is_read": is_read,
        "is_dismissed": is_dismissed,
    }
    items = list_notifications(**filters, limit=limit, offset=offset, order=order)
    count = count_notifications(**filters)
    return NotificationListOut(
        ok=True,
        items=items,
        count=count,
        page={"limit": limit, "offset": offset, "order": order},
        filters={k: v for k, v in filters.items() if v is not None},
    )


@router.get("/{notification_id}")
def get_notification_by_id(
    notification_id: str,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> NotificationOut:
    item = get_notification(notification_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="notification not found")
    return item


@router.patch("/{notification_id}")
def patch_notification(
    notification_id: str,
    patch: NotificationPatchIn,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> NotificationOut:
    updated = update_notification(notification_id, patch)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="notification not found")
    return updated


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_notification(
    notification_id: str,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> Response:
    if not delete_notification(notification_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="notification not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
