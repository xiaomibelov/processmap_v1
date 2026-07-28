from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Request

from ..process_template.service import ProcessTemplateService
from ..process_template.models import ProcessTemplateCreate, ProcessTemplateUpdate

router = APIRouter(prefix="/api/process-templates", tags=["process-templates"])
service = ProcessTemplateService()


def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "auth_user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.get("")
async def list_templates(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> List[Dict[str, Any]]:
    user = get_current_user(request)
    return service.list_templates(limit, offset)


@router.post("")
async def create_template(
    request: Request,
    data: ProcessTemplateCreate,
) -> Dict[str, Any]:
    user = get_current_user(request)
    data.created_by = user.get("id", "")
    return service.create_template(data)


@router.get("/{template_id}")
async def get_template(
    request: Request,
    template_id: str,
) -> Dict[str, Any]:
    user = get_current_user(request)
    template = service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id}")
async def update_template(
    request: Request,
    template_id: str,
    data: ProcessTemplateUpdate,
) -> Dict[str, Any]:
    user = get_current_user(request)
    template = service.update_template(template_id, data)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/{template_id}/publish")
async def publish_template(
    request: Request,
    template_id: str,
) -> Dict[str, Any]:
    user = get_current_user(request)
    template = service.publish_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/{template_id}/validate")
async def validate_template(
    request: Request,
    template_id: str,
) -> Dict[str, Any]:
    user = get_current_user(request)
    return service.validate_template(template_id)
