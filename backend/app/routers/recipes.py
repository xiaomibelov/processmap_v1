"""E5 — Recipe CRUD API (/api/recipes) + словарь параметров (/api/recipe-params).

Рецепты технолога поверх таблицы `recipe` (E1): привязка к process_template,
parameters_json, валидация по словарю recipe_param_def (E5.2), публикация с
проверкой полноты относительно recipe_params блоков шаблона (E5.5), клонирование
на новый SKU (E5.4).

NB: старые прототипные endpoints /api/recipes (ингредиенты, calculate) заменены
этим контрактом — они работали поверх отдельного SQLite-хранилища
(`backend/app/recipe/storage.py`, модуль и его unit-тесты сохранены).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..audit.writer import diff_parameters, format_diff_lines, write_event
from ..legacy.request_context import request_active_org_id
from ..middleware.role_middleware import require_role
from ..process_template.publishing import write_publish_audit
from ..process_template.repository import ProcessTemplateRepository
from ..process_template.version_repository import ProcessTemplateVersionRepository
from ..recipe.param_defs import (
    analyze_blocks,
    collect_required_params,
    get_param_def,
    list_param_defs,
    update_param_def,
    validate_def_payload,
    validate_parameters,
)
from ..recipe.repository import RecipeRepository, RecipeVersionRepository

router = APIRouter(prefix="/api", tags=["recipes"])
recipes_repo = RecipeRepository()
recipe_versions_repo = RecipeVersionRepository()
templates_repo = ProcessTemplateRepository()
template_versions_repo = ProcessTemplateVersionRepository()


class RecipeCreate(BaseModel):
    sku_id: str = Field(examples=["borsch_classic"])
    template_id: str
    template_version: Optional[str] = None
    parameters_json: Dict[str, Any] = Field(default_factory=dict)


class RecipeUpdate(BaseModel):
    sku_id: Optional[str] = None
    template_version: Optional[str] = None
    parameters_json: Optional[Dict[str, Any]] = None


class CloneRequest(BaseModel):
    sku_id: str


class ParamDefUpdate(BaseModel):
    type: Optional[str] = None
    unit: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None
    enum_json: Optional[List[str]] = None
    dict_ref: Optional[str] = None


def _current_user(request: Request) -> Dict[str, Any]:
    user = getattr(request.state, "auth_user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _user_label(user: Dict[str, Any]) -> str:
    return str(user.get("email") or user.get("id") or "")


def _template_or_404(template_id: str) -> Dict[str, Any]:
    template = templates_repo.get_by_id(str(template_id or ""))
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон процесса не найден")
    return template


def _validate_params_or_422(parameters: Dict[str, Any]) -> None:
    errors = validate_parameters(parameters or {})
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors, "message": errors[0]})


def _with_analysis(recipe: Dict[str, Any]) -> Dict[str, Any]:
    """Добавляет блок «используется в блоках» (E5.3), не меняя шаблон."""
    template = templates_repo.get_by_id(str(recipe.get("template_id") or ""))
    analysis = analyze_blocks(
        (template or {}).get("ui_model"), recipe.get("parameters_json") or {}
    )
    return {**recipe, "blocks_analysis": analysis}


@router.get("/recipes")
def list_recipes(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> List[Dict[str, Any]]:
    _current_user(request)
    return recipes_repo.list(limit, offset)


@router.post("/recipes", status_code=201)
def create_recipe(data: RecipeCreate, request: Request) -> Dict[str, Any]:
    user = _current_user(request)
    template = _template_or_404(data.template_id)
    _validate_params_or_422(data.parameters_json)
    recipe = recipes_repo.create(
        {
            "sku_id": data.sku_id,
            "template_id": str(template["id"]),
            "template_version": data.template_version or str(template.get("version") or ""),
            "parameters_json": data.parameters_json,
            "status": "draft",
            "created_by": _user_label(user),
        }
    )
    # E8.1: journal entry — создание рецепта (diff: все параметры добавлены)
    create_diff = diff_parameters({}, data.parameters_json)
    write_event(
        actor_user_id=str(user.get("id") or ""),
        org_id=request_active_org_id(request),
        action="recipe.create",
        entity_type="recipe",
        entity_id=str(recipe.get("id") or ""),
        meta_json={
            "sku_id": data.sku_id,
            "template_id": str(template["id"]),
            "diff_json": create_diff,
            "diff_lines": format_diff_lines(create_diff),
        },
    )
    return _with_analysis(recipe)


@router.get("/recipes/{recipe_id}")
def get_recipe(recipe_id: str, request: Request) -> Dict[str, Any]:
    _current_user(request)
    recipe = recipes_repo.get_by_id(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    return _with_analysis(recipe)


@router.put("/recipes/{recipe_id}")
def update_recipe(recipe_id: str, data: RecipeUpdate, request: Request) -> Dict[str, Any]:
    user = _current_user(request)
    recipe = recipes_repo.get_by_id(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    if recipe.get("status") == "published":
        raise HTTPException(
            status_code=409,
            detail="Рецепт опубликован — редактирование запрещено, клонируйте его на новый SKU",
        )
    patch = data.model_dump(exclude_unset=True)
    if "parameters_json" in patch:
        _validate_params_or_422(patch["parameters_json"] or {})
    updated = recipes_repo.update(recipe_id, patch)
    # E8.1: journal entry — поимённый diff параметров (+ служебные поля)
    old_params = recipe.get("parameters_json") or {}
    new_params = (updated or {}).get("parameters_json") or {}
    param_diff = diff_parameters(old_params, new_params)
    field_diff: Dict[str, Any] = {}
    for field in ("sku_id", "template_version"):
        if field in patch and str(patch[field] or "") != str(recipe.get(field) or ""):
            field_diff[field] = {"old": recipe.get(field), "new": patch[field]}
    diff_json: Dict[str, Any] = {**param_diff, **field_diff}
    write_event(
        actor_user_id=str(user.get("id") or ""),
        org_id=request_active_org_id(request),
        action="recipe.update",
        entity_type="recipe",
        entity_id=recipe_id,
        meta_json={
            "sku_id": (updated or {}).get("sku_id"),
            "diff_json": diff_json,
            "diff_lines": format_diff_lines(diff_json),
        },
    )
    return _with_analysis(updated)


@router.post("/recipes/{recipe_id}/publish")
def publish_recipe(recipe_id: str, request: Request) -> Dict[str, Any]:
    require_role(["analyst", "admin"])(request)
    user = _current_user(request)
    recipe = recipes_repo.get_by_id(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    template = _template_or_404(str(recipe.get("template_id") or ""))
    parameters = recipe.get("parameters_json") or {}
    # E5.5: все recipe_params блоков шаблона должны быть заданы в рецепте
    required = collect_required_params(template.get("ui_model"))
    missing = [name for name in required if name not in parameters]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Рецепт неполон: не заданы параметры, требуемые блоками шаблона: "
                + ", ".join(missing),
                "missing_params": missing,
            },
        )
    _validate_params_or_422(parameters)
    # E7.3: recipe.template_version должна указывать на published-версию шаблона
    template_version = str(recipe.get("template_version") or "")
    published_version = template_versions_repo.get_by_version(
        str(recipe.get("template_id") or ""), template_version
    )
    if not published_version or published_version.get("status") != "published":
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Версия шаблона «{template_version}» не опубликована — "
                "публикация рецепта возможна только на published-версию шаблона",
                "template_version": template_version,
            },
        )
    updated = recipes_repo.update(recipe_id, {"status": "published"})
    # E8: diff текущих параметров против предыдущей опубликованной версии
    previous_versions = recipe_versions_repo.list_for_recipe(recipe_id)
    previous_params = (
        (previous_versions[0].get("parameters_json") or {}) if previous_versions else {}
    )
    previous_version = (
        str(previous_versions[0].get("version") or "") if previous_versions else ""
    )
    publish_diff = diff_parameters(previous_params, parameters)
    version_row = recipe_versions_repo.create(
        {
            "recipe_id": recipe_id,
            "version": recipe_versions_repo.next_version(recipe_id),
            "status": "published",
            "parameters_json": parameters,
            "template_id": recipe.get("template_id"),
            "template_version": template_version,
            "created_by": _user_label(user),
        }
    )
    write_publish_audit(
        actor_user_id=str(user.get("id") or ""),
        org_id=request_active_org_id(request),
        entity_type="recipe",
        entity_id=recipe_id,
        meta={
            "version": version_row.get("version"),
            "diff_summary": (
                f"sku={recipe.get('sku_id')} template_version={template_version} "
                f"params={len(parameters)}"
            ),
            "warnings_count": 0,
            "previous_version": previous_version,
            "diff_json": publish_diff,
            "diff_lines": format_diff_lines(publish_diff),
        },
    )
    return {**_with_analysis(updated), "version": version_row}


@router.get("/recipes/{recipe_id}/versions")
def list_recipe_versions(recipe_id: str, request: Request) -> List[Dict[str, Any]]:
    """E7.4: история версий рецепта со статусами."""
    _current_user(request)
    recipe = recipes_repo.get_by_id(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    return recipe_versions_repo.list_for_recipe(recipe_id)


@router.post("/recipes/{recipe_id}/clone", status_code=201)
def clone_recipe(recipe_id: str, data: CloneRequest, request: Request) -> Dict[str, Any]:
    user = _current_user(request)
    recipe = recipes_repo.get_by_id(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    sku_id = str(data.sku_id or "").strip()
    if not sku_id:
        raise HTTPException(status_code=422, detail="sku_id обязателен для клонирования")
    clone = recipes_repo.create(
        {
            "sku_id": sku_id,
            "template_id": recipe["template_id"],
            "template_version": recipe.get("template_version") or "",
            "parameters_json": recipe.get("parameters_json") or {},
            "status": "draft",
            "created_by": _user_label(user),
        }
    )
    # E8.1: journal entry — клонирование рецепта на новый SKU
    write_event(
        actor_user_id=str(user.get("id") or ""),
        org_id=request_active_org_id(request),
        action="recipe.clone",
        entity_type="recipe",
        entity_id=str(clone.get("id") or ""),
        meta_json={
            "sku_id": sku_id,
            "source_recipe_id": recipe_id,
            "source_sku_id": recipe.get("sku_id"),
        },
    )
    return _with_analysis(clone)


# ---------- E8.2 — diff версий рецепта ----------


@router.get("/recipes/{recipe_id}/diff")
def diff_recipe_versions(
    recipe_id: str,
    request: Request,
    from_version: Optional[str] = Query(None, alias="from"),
    to_version: Optional[str] = Query(None, alias="to"),
) -> Dict[str, Any]:
    """Поимённый diff параметров между двумя опубликованными версиями рецепта.

    Источник — таблица recipe_version (E7.3). from/to — строки версий
    (например ?from=1.0.0&to=1.0.1); to по умолчанию — последняя версия.
    """
    _current_user(request)
    recipe = recipes_repo.get_by_id(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    versions = recipe_versions_repo.list_for_recipe(recipe_id)
    if not versions:
        raise HTTPException(status_code=404, detail="У рецепта нет опубликованных версий")

    def _find(version_str: str) -> Optional[Dict[str, Any]]:
        for row in versions:
            if str(row.get("version") or "") == str(version_str or ""):
                return row
        return None

    to_row = _find(to_version) if to_version else versions[0]
    if not to_row:
        raise HTTPException(status_code=404, detail=f"Версия «{to_version}» не найдена")
    if from_version:
        from_row = _find(from_version)
        if not from_row:
            raise HTTPException(status_code=404, detail=f"Версия «{from_version}» не найдена")
    else:
        # предыдущая версия относительно to (список отсортирован по убыванию)
        idx = versions.index(to_row)
        from_row = versions[idx + 1] if idx + 1 < len(versions) else None
    old_params = (from_row or {}).get("parameters_json") or {}
    new_params = to_row.get("parameters_json") or {}
    diff = diff_parameters(old_params, new_params)
    return {
        "recipe_id": recipe_id,
        "from": str((from_row or {}).get("version") or "") or None,
        "to": str(to_row.get("version") or ""),
        "diff": diff,
        "lines": format_diff_lines(diff),
    }


# ---------- словарь параметров рецепта (E5.2) ----------


@router.get("/recipe-params")
def get_recipe_params(request: Request) -> List[Dict[str, Any]]:
    _current_user(request)
    return list_param_defs()


@router.put("/recipe-params/{name}")
def put_recipe_param(name: str, data: ParamDefUpdate, request: Request) -> Dict[str, Any]:
    require_role(["analyst", "admin"])(request)
    patch = data.model_dump(exclude_unset=True)
    current = get_param_def(name)
    if not current:
        raise HTTPException(status_code=404, detail=f"Параметр «{name}» не найден в словаре")
    # валидируем объединённое состояние (patch + текущие значения)
    merged = {**current, **patch}
    errors = validate_def_payload(merged)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors, "message": errors[0]})
    updated = update_param_def(name, patch)
    return updated
