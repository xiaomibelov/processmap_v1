from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status

from ..dependencies import get_current_admin, get_current_user
from ..repositories.error_event_repo import (
    append_error_event,
    count_error_events,
    delete_error_event,
    get_error_event,
    list_error_events,
    update_error_event,
)
from ..shared.dto.error_event_dto import (
    ErrorEventIn,
    ErrorEventListOut,
    ErrorEventOut,
    ErrorEventPatchIn,
)

router = APIRouter(prefix="/error_events", tags=["error_events"])


def _header_request_id(request: Request) -> Optional[str]:
    for name in ("x-client-request-id", "x-request-id"):
        value = request.headers.get(name)
        if value:
            text = str(value).strip()
            if text:
                return text
    return None


@router.post("", status_code=status.HTTP_201_CREATED)
def ingest_error_event(
    payload: ErrorEventIn,
    request: Request,
    response: Response,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    stored = append_error_event(
        payload,
        trusted_user_id=user.get("user_id"),
        trusted_org_id=user.get("org_id"),
        path=str(request.url.path or ""),
        method=request.method,
        client_ip=getattr(getattr(request, "client", None), "host", None),
        header_request_id=_header_request_id(request),
    )
    if stored.request_id:
        response.headers["X-Request-Id"] = stored.request_id
    return {
        "ok": True,
        "item": {
            "id": stored.id,
            "schema_version": stored.schema_version,
            "occurred_at": stored.occurred_at,
            "ingested_at": stored.ingested_at,
            "request_id": stored.request_id or None,
        },
    }


@router.get("")
def list_error_events_endpoint(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_admin),
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
    event_type: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    occurred_from: Optional[int] = None,
    occurred_to: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    order: str = "asc",
) -> ErrorEventListOut:
    org_id = user.get("org_id")
    filters = {
        "session_id": session_id,
        "request_id": request_id,
        "correlation_id": correlation_id,
        "org_id": org_id,
        "runtime_id": runtime_id,
        "event_type": event_type,
        "source": source,
        "severity": severity,
        "occurred_from": occurred_from,
        "occurred_to": occurred_to,
    }
    items = list_error_events(**filters, limit=limit, offset=offset, order=order)
    count = count_error_events(**filters)
    return ErrorEventListOut(
        ok=True,
        items=items,
        count=count,
        page={"limit": limit, "offset": offset, "order": order},
        filters={k: v for k, v in filters.items() if v is not None},
        timeline={},
    )


@router.get("/{event_id}")
def get_error_event_by_id(
    event_id: str,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> ErrorEventOut:
    event = get_error_event(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    return event


@router.patch("/{event_id}")
def patch_error_event(
    event_id: str,
    patch: ErrorEventPatchIn,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> ErrorEventOut:
    updated = update_error_event(event_id, patch)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    return updated


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_error_event(
    event_id: str,
    user: Dict[str, Any] = Depends(get_current_admin),
) -> Response:
    if not delete_error_event(event_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
