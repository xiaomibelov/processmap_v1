from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class IngredientBase(BaseModel):
    name: str = Field(examples=["Мука пшеничная"])
    unit: str = Field(examples=["кг"])
    value: Optional[float] = Field(
        default=None,
        examples=[1.2],
        description="Optional numeric coefficient used by analytics recalculation (per-unit time/qty).",
    )


class IngredientCreate(IngredientBase):
    pass


class IngredientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, examples=["Мука пшеничная"])
    unit: Optional[str] = Field(default=None, examples=["кг"])
    value: Optional[float] = Field(default=None, examples=[1.2])


class IngredientOut(IngredientBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_id: str
    created_by: str
    created_at: int
    updated_at: int


class RecipeIngredientBase(BaseModel):
    ingredient_id: str = Field(examples=["ing_abc123"])
    quantity: float = Field(examples=["0.5"])
    unit: Optional[str] = Field(default=None, examples=["кг"])
    sort_order: int = Field(default=0, examples=[0])


class RecipeIngredientCreate(RecipeIngredientBase):
    pass


class RecipeIngredientOut(RecipeIngredientBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ingredient: Optional[IngredientOut] = None


class RecipeBase(BaseModel):
    name: str = Field(examples=["Борщ"])
    description: Optional[str] = Field(default=None, examples=["Классический красный борщ"])
    base_portions: int = Field(default=1, ge=1, examples=[10])


class RecipeCreate(RecipeBase):
    ingredients: List[RecipeIngredientCreate] = Field(default_factory=list)


class RecipeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, examples=["Борщ"])
    description: Optional[str] = Field(default=None, examples=["Классический красный борщ"])
    base_portions: Optional[int] = Field(default=None, ge=1, examples=[10])
    ingredients: Optional[List[RecipeIngredientCreate]] = Field(default=None)


class RecipeOut(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    org_id: str
    created_by: str
    created_at: int
    updated_at: int
    ingredients: List[RecipeIngredientOut] = Field(default_factory=list)


class RecipeCalculateIn(BaseModel):
    target_portions: int = Field(ge=1, examples=[25])


class RecipeCalculationResult(BaseModel):
    ingredient_id: str
    name: str
    unit: str
    base_quantity: float
    target_quantity: float


class RecipeCalculationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recipe_id: str
    base_portions: int
    target_portions: int
    coefficient: float
    results: List[RecipeCalculationResult]
    created_by: str
    created_at: int
