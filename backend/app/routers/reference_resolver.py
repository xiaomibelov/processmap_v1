from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from ..legacy.request_context import (
    require_authenticated_user,
    request_active_org_id,
)
from ..services.org_workspace import require_org_member_for_enterprise
from ..storage import list_reference_options

router = APIRouter(tags=["reference-resolver"])


def _active_org_id(request: Request) -> str:
    return request_active_org_id(request) or ""


@router.get("/api/reference/{source}/options")
def get_reference_options(
    source: str,
    request: Request,
    q: str = "",
    limit: int = 20,
) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = _active_org_id(request)
    if org_id:
        require_org_member_for_enterprise(request, org_id)

    if not source:
        raise HTTPException(status_code=422, detail="invalid source format; expected type:identifier")

    if ":" in source:
        source_type, source_id = source.split(":", 1)
    elif "/" in source:
        source_type, source_id = source.split("/", 1)
    else:
        raise HTTPException(status_code=422, detail="invalid source format; expected type:identifier")
    if source_type == "table":
        items = list_reference_options(source_id, org_id=org_id or None, q=q, limit=min(max(limit, 1), 100))
    elif source_type == "org_dict":
        items = []
    else:
        raise HTTPException(status_code=422, detail="unsupported source type")

    return {"ok": True, "source": source, "items": items, "count": len(items)}
