from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID


class ProcessTemplateBase(BaseModel):
    name: str
    version: str
    status: str = "draft"
    ui_model: Optional[Dict[str, Any]] = None


class ProcessTemplateCreate(ProcessTemplateBase):
    created_by: str


class ProcessTemplateUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[str] = None
    status: Optional[str] = None
    ui_model: Optional[Dict[str, Any]] = None


class ProcessTemplate(ProcessTemplateBase):
    id: UUID
    created_by: str
    updated_at: datetime
    published_at: Optional[datetime] = None
    audit_metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class RecipeBase(BaseModel):
    sku_id: str
    template_version: str
    parameters_json: Optional[Dict[str, Any]] = None
    status: str = "draft"


class RecipeCreate(RecipeBase):
    template_id: UUID
    created_by: str


class RecipeUpdate(BaseModel):
    sku_id: Optional[str] = None
    template_version: Optional[str] = None
    parameters_json: Optional[Dict[str, Any]] = None
    status: Optional[str] = None


class Recipe(RecipeBase):
    id: UUID
    template_id: UUID
    created_by: str
    updated_at: datetime

    class Config:
        from_attributes = True


class ProcessEntityBase(BaseModel):
    name: str
    entity_type: str
    source: str = "manual"
    metadata: Optional[Dict[str, Any]] = None


class ProcessEntityCreate(ProcessEntityBase):
    template_id: UUID
    created_by: str


class ProcessEntity(ProcessEntityBase):
    id: UUID
    template_id: UUID
    created_by: str

    class Config:
        from_attributes = True


# --- E6: dry-run validate + feasibility pre-check ---------------------------


class ValidateDraftRequest(BaseModel):
    """POST /api/process-templates/validate — несохранённый черновик (ui_model в теле)."""
    ui_model: Dict[str, Any]
    check_reachability: bool = True


class PrecheckRequest(BaseModel):
    """POST /api/process-templates[/<id>]/precheck.

    mode: 'warning' (default, locked decision) | 'strict' (E7 будет
    блокировать publish при verdict='blocked').
    kitchen_ids пустой = все кухни реестра.
    """
    ui_model: Optional[Dict[str, Any]] = None
    kitchen_ids: List[str] = Field(default_factory=list)
    mode: str = "warning"


class PublishRequest(BaseModel):
    """POST /api/process-templates/<id>/publish (E7.2).

    target_kitchen_ids пустой = все кухни реестра (привязки шаблона к
    кухням нет — реестр целиком). mode: pre-check режим ('warning'
    default | 'strict'). bump: 'patch' (default, автоинкремент) |
    'minor' | 'major' (ручной bump, locked decision).
    """
    target_kitchen_ids: List[str] = Field(default_factory=list)
    mode: str = "warning"
    bump: str = "patch"
