from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Request

from ..legacy.request_context import request_active_org_id, request_user_meta
from ..recipe.storage import (
    calculate_recipe as _calculate_recipe,
    create_ingredient as _create_ingredient,
    create_recipe as _create_recipe,
    delete_recipe as _delete_recipe,
    get_ingredient as _get_ingredient,
    get_recipe as _get_recipe,
    list_ingredients as _list_ingredients,
    list_recipes as _list_recipes,
    update_recipe as _update_recipe,
)
from ..schemas.recipe import (
    IngredientCreate,
    IngredientOut,
    RecipeCalculateIn,
    RecipeCalculationOut,
    RecipeCreate,
    RecipeOut,
    RecipeUpdate,
)

router = APIRouter()


def _request_context(request: Request):
    return request_active_org_id(request), request_user_meta(request)[0]


@router.get("/api/ingredients", response_model=List[IngredientOut])
def get_ingredients(request: Request):
    org_id, _ = _request_context(request)
    return _list_ingredients(org_id)


@router.post("/api/ingredients", response_model=IngredientOut)
def post_ingredient(data: IngredientCreate, request: Request):
    org_id, user_id = _request_context(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    return _create_ingredient(data.model_dump(), org_id, user_id)


@router.get("/api/recipes", response_model=List[RecipeOut])
def get_recipes(request: Request):
    org_id, _ = _request_context(request)
    return _list_recipes(org_id)


@router.post("/api/recipes", response_model=RecipeOut)
def post_recipe(data: RecipeCreate, request: Request):
    org_id, user_id = _request_context(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    return _create_recipe(data.model_dump(), org_id, user_id)


@router.get("/api/recipes/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: str, request: Request):
    org_id, _ = _request_context(request)
    recipe = _get_recipe(recipe_id, org_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="recipe not found")
    return recipe


@router.patch("/api/recipes/{recipe_id}", response_model=RecipeOut)
def patch_recipe(recipe_id: str, data: RecipeUpdate, request: Request):
    org_id, user_id = _request_context(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    recipe = _update_recipe(recipe_id, data.model_dump(exclude_unset=True), org_id, user_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="recipe not found")
    return recipe


@router.delete("/api/recipes/{recipe_id}")
def delete_recipe(recipe_id: str, request: Request):
    org_id, user_id = _request_context(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    if not _delete_recipe(recipe_id, org_id):
        raise HTTPException(status_code=404, detail="recipe not found")
    return {"ok": True}


@router.post("/api/recipes/{recipe_id}/calculate", response_model=RecipeCalculationOut)
def post_calculate_recipe(recipe_id: str, data: RecipeCalculateIn, request: Request):
    org_id, user_id = _request_context(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    result = _calculate_recipe(recipe_id, data.target_portions, org_id, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="recipe not found")
    return result
