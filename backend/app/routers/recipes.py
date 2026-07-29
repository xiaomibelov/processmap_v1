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

from ..middleware.role_middleware import require_role
from ..process_template.repository import ProcessTemplateRepository
from ..recipe.param_defs import (
    analyze_blocks,
    collect_required_params,
    get_param_def,
    list_param_defs,
    update_param_def,
    validate_def_payload,
    validate_parameters,
)
from ..recipe.repository import RecipeRepository

router = APIRouter(prefix="/api", tags=["recipes"])
recipes_repo = RecipeRepository()
templates_repo = ProcessTemplateRepository()


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
    _current_user(request)
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
    return _with_analysis(updated)


@router.post("/recipes/{recipe_id}/publish")
def publish_recipe(recipe_id: str, request: Request) -> Dict[str, Any]:
    require_role(["analyst", "admin"])(request)
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
    updated = recipes_repo.update(recipe_id, {"status": "published"})
    return _with_analysis(updated)


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
    return _with_analysis(clone)


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
