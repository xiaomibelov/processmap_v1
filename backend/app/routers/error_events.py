from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse

from ..clients.notifications_client import (
    NotificationsUnavailable,
    delete_error_event as service_delete_error_event,
    get_error_event as service_get_error_event,
    list_error_events as service_list_error_events,
    patch_error_event as service_patch_error_event,
    post_error_event,
)
from ..repositories.error_event_repo import (
    append_error_event,
    delete_error_event,
    get_error_event,
    list_error_events,
    update_error_event,
)
from ..shared.dto.error_event_dto import ErrorEventIn, ErrorEventPatchIn

router = APIRouter()


def _header_request_id(request: Request) -> Optional[str]:
    for name in ("x-client-request-id", "x-request-id"):
        value = request.headers.get(name)
        if value:
            text = str(value).strip()
            if text:
                return text
    return None


def _ingest_local(payload: ErrorEventIn, request: Request, response: Response) -> Any:
    trusted_user = getattr(request.state, "auth_user", {}) or {}
    trusted_user_id = str(trusted_user.get("id") or "").strip() or None
    active_org_id = str(getattr(request.state, "active_org_id", "") or "").strip() or None

    stored = append_error_event(
        payload,
        trusted_user_id=trusted_user_id,
        trusted_org_id=active_org_id,
        path=str(request.url.path or ""),
        method=request.method,
        client_ip=getattr(getattr(request, "client", None), "host", None),
        header_request_id=_header_request_id(request),
    )

    normalized_request_id = stored.request_id or ""
    if normalized_request_id:
        response.headers["X-Request-Id"] = normalized_request_id

    return {
        "ok": True,
        "item": {
            "id": stored.id,
            "schema_version": stored.schema_version,
            "occurred_at": stored.occurred_at,
            "ingested_at": stored.ingested_at,
            "request_id": normalized_request_id,
        },
    }


@router.post("/api/telemetry/error-events", status_code=status.HTTP_201_CREATED)
def ingest_error_event(payload: ErrorEventIn, request: Request, response: Response) -> Any:
    """Ingest an error/telemetry event.

    First tries the notifications microservice; falls back to the local
    repository if the service is unreachable so the monolith keeps working.
    """
    try:
        result = post_error_event(payload.model_dump(mode="json"), request)
        normalized_request_id = (result.get("item") or {}).get("request_id") or ""
        if normalized_request_id:
            response.headers["X-Request-Id"] = str(normalized_request_id)
        return result
    except NotificationsUnavailable:
        return _ingest_local(payload, request, response)


# ---------------------------------------------------------------------------
# Proxy endpoints under /api/notifications/* — these allow the frontend to
# keep calling the monolith URL while the request is delegated to the
# notifications service.
# ---------------------------------------------------------------------------


def _service_unavailable_response(exc: NotificationsUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"ok": False, "detail": f"notifications service unavailable: {exc}"},
    )


@router.post("/api/notifications/error_events", status_code=status.HTTP_201_CREATED)
def proxy_create_error_event(payload: ErrorEventIn, request: Request, response: Response) -> Any:
    try:
        result = post_error_event(payload.model_dump(mode="json"), request)
        normalized_request_id = (result.get("item") or {}).get("request_id") or ""
        if normalized_request_id:
            response.headers["X-Request-Id"] = str(normalized_request_id)
        return result
    except NotificationsUnavailable:
        return _ingest_local(payload, request, response)


@router.get("/api/notifications/error_events")
def proxy_list_error_events(
    request: Request,
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
) -> Any:
    params = {
        k: v
        for k, v in {
            "session_id": session_id,
            "request_id": request_id,
            "correlation_id": correlation_id,
            "runtime_id": runtime_id,
            "event_type": event_type,
            "source": source,
            "severity": severity,
            "occurred_from": occurred_from,
            "occurred_to": occurred_to,
            "limit": limit,
            "offset": offset,
            "order": order,
        }.items()
        if v is not None
    }
    try:
        return service_list_error_events(params, request)
    except NotificationsUnavailable:
        pass

    # Fallback to local repository
    active_org_id = str(getattr(request.state, "active_org_id", "") or "").strip() or None
    items = list_error_events(org_id=active_org_id, **params)
    count = len(items)  # simplified; full count would require count_error_events
    return {
        "ok": True,
        "items": [item.model_dump(mode="json") for item in items],
        "count": count,
        "page": {"limit": limit, "offset": offset, "order": order},
        "filters": params,
        "timeline": {},
    }


@router.get("/api/notifications/error_events/{event_id}")
def proxy_get_error_event(event_id: str, request: Request) -> Any:
    try:
        data = service_get_error_event(event_id, request)
        if data is None:
            return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "event not found"})
        return data
    except NotificationsUnavailable:
        pass

    item = get_error_event(event_id)
    if item is None:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "event not found"})
    return item.model_dump(mode="json")


@router.patch("/api/notifications/error_events/{event_id}")
def proxy_patch_error_event(event_id: str, patch: ErrorEventPatchIn, request: Request) -> Any:
    try:
        data = service_patch_error_event(event_id, patch.model_dump(mode="json", exclude_unset=True), request)
        if data is None:
            return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "event not found"})
        return data
    except NotificationsUnavailable:
        pass

    updated = update_error_event(event_id, patch)
    if updated is None:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "event not found"})
    return updated.model_dump(mode="json")


@router.delete("/api/notifications/error_events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def proxy_delete_error_event(event_id: str, request: Request) -> Response:
    try:
        if service_delete_error_event(event_id, request):
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "event not found"})
    except NotificationsUnavailable:
        pass

    if delete_error_event(event_id):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "event not found"})
