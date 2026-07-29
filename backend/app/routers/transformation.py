"""E3.5 — API трансформации AS IS -> TO BE draft.

POST /api/process-templates/transform-asis          — загрузить AS IS BPMN, получить draft
POST /api/process-templates/transformation-rules/seed — засеять YAML-библиотеку правил в БД (admin)
GET  /api/process-templates/transformation-rules      — список правил из YAML-библиотеки
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from ..middleware.role_middleware import require_role
from ..process_template.bpmn_import import BpmnImportError
from ..transformation.pipeline import transform_asis
from ..transformation.rules_loader import RulesLoadError, load_rules, seed_rules_to_db

router = APIRouter(prefix="/api/process-templates", tags=["transformation"])


def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "auth_user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.post("/transform-asis")
async def transform_asis_endpoint(
    request: Request,
    file: Optional[UploadFile] = File(None),
) -> Dict[str, Any]:
    user = get_current_user(request)
    if file is not None:
        raw = await file.read()
    else:
        raw = await request.body()
    xml_text = raw.decode("utf-8", errors="replace")
    if not xml_text.strip():
        raise HTTPException(status_code=422, detail="Empty BPMN payload")
    try:
        result = transform_asis(xml_text)
    except BpmnImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RulesLoadError as exc:
        raise HTTPException(status_code=500, detail=f"Transformation rule library invalid: {exc}")
    return {
        "as_is_ui_model": result["as_is_ui_model"],
        "as_is_report": result["as_is_report"],
        "draft_ui_model": result["draft_ui_model"],
        "trace_map": result["trace_map"],
        "open_questions": result["open_questions"],
        "validation_report": result["validation_report"],
        "draft_entities": result["draft_entities"],
        "llm_status": result["llm_status"],
    }


@router.get("/transformation-rules")
async def list_transformation_rules(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    rules = load_rules()
    return {"rules": rules, "count": len(rules)}


@router.post("/transformation-rules/seed")
async def seed_transformation_rules(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    require_role(["admin"])(request)
    try:
        rules = load_rules()
        count = seed_rules_to_db(rules)
    except RulesLoadError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"seed failed: {exc}")
    return {"ok": True, "seeded": count}
