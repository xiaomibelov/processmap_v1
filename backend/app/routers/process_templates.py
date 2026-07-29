from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile

from ..legacy.request_context import request_active_org_id
from ..middleware.role_middleware import require_role
from ..kitchens.repository import KitchenRepository
from ..process_template.bpmn_import import BpmnImportError, parse_bpmn
from ..process_template.publishing import PublishError, PublishService
from ..process_template.service import ProcessTemplateService
from ..process_template.models import (
    PrecheckRequest,
    ProcessTemplateCreate,
    ProcessTemplateUpdate,
    PublishRequest,
    ValidateDraftRequest,
)
from ..validation.precheck import precheck_with_catalog
from ..validation.service import validate_with_catalog

router = APIRouter(prefix="/api/process-templates", tags=["process-templates"])
service = ProcessTemplateService()
publish_service = PublishService()
kitchen_repository = KitchenRepository()


def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "auth_user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется аутентификация")
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
        raise HTTPException(status_code=404, detail="Шаблон процесса не найден")
    return template


@router.put("/{template_id}")
async def update_template(
    request: Request,
    template_id: str,
    data: ProcessTemplateUpdate,
) -> Dict[str, Any]:
    user = get_current_user(request)
    existing = service.get_template(template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Шаблон процесса не найден")
    # E7.4: published-шаблон не редактируется — новая версия через new-draft
    if str(existing.get("status") or "") == "published":
        raise HTTPException(
            status_code=409,
            detail="Шаблон опубликован — редактирование запрещено, создайте новый черновик "
            "(POST /api/process-templates/{id}/new-draft)",
        )
    template = service.update_template(template_id, data)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон процесса не найден")
    return template


@router.post("/{template_id}/publish")
async def publish_template(
    request: Request,
    template_id: str,
    data: Optional[PublishRequest] = None,
) -> Dict[str, Any]:
    """E7.2: publish flow — dry-run (E6) → pre-check по кухням → bpmn_xml →
    process_template_version + bump версии + audit_log.

    warning pre-check: публикует с записью warnings в version artifact
    (locked decision).
    """
    user = get_current_user(request)
    payload = data or PublishRequest()
    try:
        result = publish_service.publish_template(
            template_id,
            actor_user_id=str(user.get("id") or ""),
            org_id=request_active_org_id(request),
            target_kitchen_ids=payload.target_kitchen_ids,
            mode=payload.mode,
            bump=payload.bump,
        )
    except PublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    version = result["version"]
    return {
        "id": template_id,
        "status": "published",
        "version": version.get("version"),
        "version_id": version.get("id"),
        "published_at": (result["template"] or {}).get("published_at"),
        "warnings_count": result["warnings_count"],
        "precheck": result["precheck"],
        "dry_run": result["dry_run"],
    }


@router.post("/{template_id}/new-draft")
async def new_draft(
    request: Request,
    template_id: str,
) -> Dict[str, Any]:
    """E7.2: «создать новую версию» — published → draft, version = next patch."""
    user = get_current_user(request)
    try:
        return publish_service.new_draft(template_id)
    except PublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/{template_id}/versions")
async def list_versions(
    request: Request,
    template_id: str,
) -> List[Dict[str, Any]]:
    """E7.4: версии шаблона со статусами (draft/published/retired)."""
    user = get_current_user(request)
    try:
        return publish_service.list_versions(template_id)
    except PublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/{template_id}/versions/{version}/bpmn")
async def version_bpmn(
    request: Request,
    template_id: str,
    version: str,
) -> Response:
    """E7 UI: скачать BPMN-XML опубликованной версии."""
    user = get_current_user(request)
    try:
        xml_text = publish_service.version_bpmn(template_id, version)
    except PublishError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return Response(
        content=xml_text,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="process_template_{version}.bpmn"'
        },
    )


@router.post("/import-bpmn")
async def import_bpmn(
    request: Request,
    file: Optional[UploadFile] = File(None),
) -> Dict[str, Any]:
    user = get_current_user(request)
    # E2.0b: импорт BPMN — admin-only метод (analyst/admin); technologist → 403
    require_role(["analyst", "admin"])(request)
    if file is not None:
        raw = await file.read()
    else:
        raw = await request.body()
    xml_text = raw.decode("utf-8", errors="replace")
    if not xml_text.strip():
        raise HTTPException(status_code=422, detail="Пустой BPMN-файл")
    try:
        result = parse_bpmn(xml_text)
    except BpmnImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {
        "ui_model": result.ui_model,
        "report": result.report,
        "draft_entities": result.draft_entities,
    }


@router.post("/validate")
async def validate_draft(
    request: Request,
    data: ValidateDraftRequest,
) -> Dict[str, Any]:
    """E6.1: dry-run валидация несохранённого черновика (конструктор).

    Каталог операций подгружается из БД; правила R1–R7 — validation service.
    """
    user = get_current_user(request)
    result = validate_with_catalog(data.ui_model, check_reachability=data.check_reachability)
    return {
        "valid": result["summary"]["errors"] == 0,
        **result,
    }


@router.post("/{template_id}/validate")
async def validate_template(
    request: Request,
    template_id: str,
) -> Dict[str, Any]:
    """E6.1: dry-run валидация сохранённого шаблона (правила R1–R7)."""
    user = get_current_user(request)
    template = service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон процесса не найден")
    result = validate_with_catalog(template.get("ui_model") or {})
    return {
        "valid": result["summary"]["errors"] == 0,
        "template_id": template_id,
        **result,
    }


def _run_precheck(ui_model: Dict[str, Any], data: PrecheckRequest) -> Dict[str, Any]:
    mode = (data.mode or "warning").strip().lower()
    if mode not in ("strict", "warning"):
        raise HTTPException(status_code=422, detail="mode должен быть 'strict' или 'warning'")
    kitchens = kitchen_repository.list_kitchens()
    if data.kitchen_ids:
        wanted = {str(k) for k in data.kitchen_ids}
        kitchens = [k for k in kitchens if k["id"] in wanted]
    return precheck_with_catalog(ui_model, kitchens, mode=mode)


@router.post("/precheck")
async def precheck_draft(
    request: Request,
    data: PrecheckRequest,
) -> Dict[str, Any]:
    """E6.4: feasibility pre-check несохранённого черновика (конструктор)."""
    user = get_current_user(request)
    if not isinstance(data.ui_model, dict):
        raise HTTPException(status_code=422, detail="Требуется ui_model")
    return _run_precheck(data.ui_model, data)


@router.post("/{template_id}/precheck")
async def precheck_template(
    request: Request,
    template_id: str,
    data: PrecheckRequest,
) -> Dict[str, Any]:
    """E6.4: feasibility pre-check сохранённого шаблона против реестра кухонь."""
    user = get_current_user(request)
    template = service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон процесса не найден")
    result = _run_precheck(template.get("ui_model") or {}, data)
    return {"template_id": template_id, **result}
