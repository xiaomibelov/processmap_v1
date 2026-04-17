from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response, status

from ..error_events import ErrorEventIn, build_stored_error_event
from ..storage import append_error_event

router = APIRouter()


@router.post("/api/telemetry/error-events", status_code=status.HTTP_201_CREATED)
def ingest_error_event(payload: ErrorEventIn, request: Request, response: Response) -> Any:
    stored = build_stored_error_event(payload, request)
    row = append_error_event(**stored.model_dump())
    normalized_request_id = str(row.get("request_id") or "")
    if normalized_request_id:
        response.headers["X-Request-Id"] = normalized_request_id
    return {
        "ok": True,
        "item": {
            "id": str(row.get("id") or ""),
            "schema_version": int(row.get("schema_version") or 1),
            "occurred_at": int(row.get("occurred_at") or 0),
            "ingested_at": int(row.get("ingested_at") or 0),
            "request_id": normalized_request_id,
        },
    }
