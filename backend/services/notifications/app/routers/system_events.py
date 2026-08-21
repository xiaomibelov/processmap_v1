from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..dependencies import get_current_admin, get_current_user
from ..repositories.system_event_repo import (
    append_system_event,
    count_system_events,
    delete_system_event,
    get_system_event,
    list_system_events,
    update_system_event,
)
from ..shared.dto.system_event_dto import (
    SystemEventIn,
    SystemEventListOut,
    SystemEventOut,
    SystemEventPatchIn,
)

router = APIRouter(prefix="/system-events", tags=["system_events"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_system_event(
    payload: SystemEventIn,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    stored = append_system_event(
        payload,
        trusted_user_id=user.get("user_id"),
        trusted_org_id=user.get("org_id"),
    )
    return {"ok": True, "item": stored.model_dump(mode="json")}


@router.get("")
def list_system_events_endpoint(
    user: Dict[str, Any] = Depends(get_current_admin),
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    created_from: Optional[int] = None,
    created_to: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "desc",
) -> SystemEventListOut:
    filters: Dict[str, Any] = {
        "org_id": user.get("org_id"),
        "event_type": event_type,
        "source": source,
        "severity": severity,
        "created_from": created_from,
        "created_to": created_to,
    }
    items = list_system_events(**filters, limit=limit, offset=offset, order=order)
    count = count_system_events(**filters)
    return SystemEventListOut(
        ok=True,
        items=items,
        count=count,
        page={"limit": limit, "offset": offset, "order": order},
        filters={k: v for k, v in filters.items() if v is not None},
    )


@router.get("/{event_id}")
def get_system_event_by_id(
    event_id: str,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> SystemEventOut:
    item = get_system_event(event_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="system event not found")
    return item


@router.patch("/{event_id}")
def patch_system_event(
    event_id: str,
    patch: SystemEventPatchIn,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> SystemEventOut:
    updated = update_system_event(event_id, patch)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="system event not found")
    return updated


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_system_event(
    event_id: str,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> Response:
    if not delete_system_event(event_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="system event not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
