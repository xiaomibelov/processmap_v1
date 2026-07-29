"""E6.3 — API реестра кухонь.

GET  /api/kitchens                    — список (любая роль, нужен auth)
POST /api/kitchens                    — создать кухню (analyst/admin)
PUT  /api/kitchens/{id}/equipment     — заменить оборудование (analyst/admin)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..kitchens.repository import KitchenRepository
from ..middleware.role_middleware import require_role

router = APIRouter(prefix="/api/kitchens", tags=["kitchens"])
repository = KitchenRepository()


class KitchenEquipmentItem(BaseModel):
    equipment_type_id: str
    capabilities_json: Dict[str, Any] = Field(default_factory=dict)


class KitchenCreate(BaseModel):
    name: str
    location: str = ""
    status: str = "active"
    equipment: List[KitchenEquipmentItem] = Field(default_factory=list)


class KitchenEquipmentReplace(BaseModel):
    equipment: List[KitchenEquipmentItem] = Field(default_factory=list)


def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "auth_user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.get("")
async def list_kitchens(request: Request) -> List[Dict[str, Any]]:
    get_current_user(request)
    return repository.list_kitchens()


@router.post("", status_code=201)
async def create_kitchen(request: Request, data: KitchenCreate) -> Dict[str, Any]:
    get_current_user(request)
    require_role(["analyst", "admin"])(request)
    return repository.create(
        data.dict(exclude={"equipment"}),
        [item.dict() for item in data.equipment],
    )


@router.put("/{kitchen_id}/equipment")
async def replace_kitchen_equipment(
    request: Request,
    kitchen_id: str,
    data: KitchenEquipmentReplace,
) -> Dict[str, Any]:
    get_current_user(request)
    require_role(["analyst", "admin"])(request)
    kitchen = repository.replace_equipment(kitchen_id, [item.dict() for item in data.equipment])
    if kitchen is None:
        raise HTTPException(status_code=404, detail="Kitchen not found")
    return kitchen
