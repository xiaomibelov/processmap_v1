"""E9.2 — API пилотного контура SKU-привязок (/api/sku-bindings).

GET    /api/sku-bindings                  — список (auth)
POST   /api/sku-bindings                  — создать draft (analyst/admin)
POST   /api/sku-bindings/{id}/start-pilot — старт пилота ровно на 1 кухне (analyst/admin)
GET    /api/sku-bindings/{id}/pilot-metrics — прогресс к критериям (auth)
POST   /api/sku-bindings/{id}/metrics     — ручной ввод выборки метрик (analyst/admin)
POST   /api/sku-bindings/{id}/rollout     — раскатка при выполненных критериях (analyst/admin)
POST   /api/sku-bindings/{id}/retire      — вывод из эксплуатации (analyst/admin)

Статусы (E9.1): draft → pilot → active → retired.
Rollout (E9.5) НЕ создаёт новых версий шаблона/рецепта — только расширяет
kitchen_ids и пишет audit_log(action='rollout', entity_type='sku_binding').
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..legacy.request_context import request_active_org_id
from ..middleware.role_middleware import require_role
from ..sku_bindings.criteria import CriteriaError, compute_progress, validate_criteria
from ..sku_bindings.repository import SkuBindingRepository

router = APIRouter(prefix="/api/sku-bindings", tags=["sku-bindings"])
repository = SkuBindingRepository()

WRITE_ROLES = ["analyst", "admin", "technologist"]


class BindingCreate(BaseModel):
    recipe_id: str
    recipe_version: Optional[str] = None
    kitchen_ids: List[str] = Field(default_factory=list)
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None


class StartPilot(BaseModel):
    # str (одна кухня) или list ровно из одного элемента; 2+ → 422 (E9.3)
    pilot_kitchen_id: Union[str, List[str]]
    criteria: Dict[str, Any]


class MetricSampleIn(BaseModel):
    orders_count: int = 0
    critical_errors: int = 0
    defect_count: int = 0


class RolloutIn(BaseModel):
    kitchen_ids: List[str] = Field(default_factory=list)


def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "auth_user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется аутентификация")
    return user


def _require_write(request: Request) -> dict:
    return require_role(WRITE_ROLES)(request)


def _get_or_404(binding_id: str) -> Dict[str, Any]:
    binding = repository.get(binding_id)
    if binding is None:
        raise HTTPException(status_code=404, detail="SKU-привязка не найдена")
    return binding


def _write_rollout_audit(request: Request, binding: Dict[str, Any], progress: Dict[str, Any]) -> None:
    """E9.5 — audit_log(action='rollout'); best-effort, не роняет rollout.

    Колонки audit_log заморожены (E7/E8) — пишем через storage.append_audit_log
    в том же формате, что и E7 publish.
    """
    try:
        from ..storage import append_audit_log

        user = get_current_user(request)
        append_audit_log(
            actor_user_id=str(user.get("id") or "-"),
            org_id=request_active_org_id(request),
            action="rollout",
            entity_type="sku_binding",
            entity_id=str(binding.get("id") or "-"),
            status="ok",
            meta={
                "recipe_id": binding.get("recipe_id"),
                "recipe_version": binding.get("recipe_version"),
                "kitchen_ids": binding.get("kitchen_ids") or [],
                "pilot_kitchen_id": binding.get("pilot_kitchen_id"),
                "totals": progress.get("totals"),
                "criteria": progress.get("criteria"),
            },
        )
    except Exception as exc:  # pragma: no cover - audit не должен ронять rollout
        print(f"[AUDIT] rollout write_failed entity=sku_binding:{binding.get('id')} err={exc}")


@router.get("")
async def list_bindings(request: Request, status: Optional[str] = None) -> List[Dict[str, Any]]:
    get_current_user(request)
    if status and status not in ("draft", "pilot", "active", "retired"):
        raise HTTPException(status_code=422, detail=f"unknown status: {status}")
    return repository.list(status=status)


@router.post("", status_code=201)
async def create_binding(request: Request, data: BindingCreate) -> Dict[str, Any]:
    user = _require_write(request)
    if not repository.recipe_exists(data.recipe_id):
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    for kitchen_id in data.kitchen_ids:
        if not repository.kitchen_exists(kitchen_id):
            raise HTTPException(status_code=404, detail=f"Кухня не найдена: {kitchen_id}")
    return repository.create(
        {
            "recipe_id": data.recipe_id,
            "recipe_version": data.recipe_version,
            "kitchen_ids": data.kitchen_ids,
            "valid_from": data.valid_from,
            "valid_to": data.valid_to,
            "created_by": str(user.get("email") or user.get("id") or ""),
        }
    )


@router.post("/{binding_id}/start-pilot")
async def start_pilot(request: Request, binding_id: str, data: StartPilot) -> Dict[str, Any]:
    _require_write(request)
    binding = _get_or_404(binding_id)
    if binding["status"] != "draft":
        raise HTTPException(
            status_code=409,
            detail={"error": "invalid_status", "status": binding["status"], "expected": "draft",
                        "message": "пилот можно запустить только из статуса «Черновик»"},
        )
    # E9.3 — пилот ровно на ОДНОЙ кухне
    raw = data.pilot_kitchen_id
    kitchen_ids = [str(k) for k in raw] if isinstance(raw, list) else [str(raw)]
    kitchen_ids = [k for k in kitchen_ids if k.strip()]
    if len(kitchen_ids) != 1:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "pilot_requires_exactly_one_kitchen",
                "message": f"пилот допускается ровно на одной кухне, получено: {len(kitchen_ids)}",
            },
        )
    pilot_kitchen_id = kitchen_ids[0]
    if not repository.kitchen_exists(pilot_kitchen_id):
        raise HTTPException(status_code=404, detail=f"Кухня не найдена: {pilot_kitchen_id}")
    try:
        criteria = validate_criteria(data.criteria)
    except CriteriaError as exc:
        raise HTTPException(status_code=422, detail={"error": "invalid_criteria", "message": str(exc)})
    return repository.start_pilot(binding_id, pilot_kitchen_id, criteria)  # type: ignore[return-value]


@router.post("/{binding_id}/metrics", status_code=201)
async def add_metric_sample(request: Request, binding_id: str, data: MetricSampleIn) -> Dict[str, Any]:
    _require_write(request)
    binding = _get_or_404(binding_id)
    if binding["status"] != "pilot":
        raise HTTPException(
            status_code=409,
            detail={"error": "invalid_status", "status": binding["status"], "expected": "pilot",
                        "message": "операция доступна только в статусе «Пилот»"},
        )
    for field_name, value in (
        ("orders_count", data.orders_count),
        ("critical_errors", data.critical_errors),
        ("defect_count", data.defect_count),
    ):
        if value < 0:
            raise HTTPException(
                status_code=422,
                detail={"error": "invalid_metric", "message": f"{field_name} должен быть неотрицательным"},
            )
    return repository.add_sample(binding_id, data.orders_count, data.critical_errors, data.defect_count)


@router.get("/{binding_id}/pilot-metrics")
async def pilot_metrics(request: Request, binding_id: str) -> Dict[str, Any]:
    get_current_user(request)
    binding = _get_or_404(binding_id)
    progress = compute_progress(binding.get("pilot_exit_criteria_json"), repository.totals(binding_id))
    return {
        "binding_id": binding["id"],
        "status": binding["status"],
        "pilot_kitchen_id": binding.get("pilot_kitchen_id"),
        **progress,
        "samples": repository.list_samples(binding_id),
    }


@router.post("/{binding_id}/rollout")
async def rollout(request: Request, binding_id: str, data: RolloutIn) -> Dict[str, Any]:
    _require_write(request)
    binding = _get_or_404(binding_id)
    if binding["status"] != "pilot":
        raise HTTPException(
            status_code=409,
            detail={"error": "invalid_status", "status": binding["status"], "expected": "pilot",
                        "message": "операция доступна только в статусе «Пилот»"},
        )
    # E9.5 — блокировка, пока критерии не выполнены (с явными причинами)
    progress = compute_progress(binding.get("pilot_exit_criteria_json"), repository.totals(binding_id))
    if not progress["all_met"]:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "pilot_criteria_not_met",
                "message": "критерии выхода из пилота не выполнены",
                "unmet": progress["unmet"],
                "totals": progress["totals"],
                "criteria": progress["criteria"],
            },
        )
    for kitchen_id in data.kitchen_ids:
        if not repository.kitchen_exists(kitchen_id):
            raise HTTPException(status_code=404, detail=f"Кухня не найдена: {kitchen_id}")
    # Раскатка расширяет kitchen_ids БЕЗ новых версий шаблона/рецепта (E9.5).
    updated = repository.rollout(binding_id, data.kitchen_ids)
    _write_rollout_audit(request, updated, progress)  # type: ignore[arg-type]
    return updated


@router.post("/{binding_id}/retire")
async def retire(request: Request, binding_id: str) -> Dict[str, Any]:
    _require_write(request)
    binding = _get_or_404(binding_id)
    if binding["status"] == "retired":
        raise HTTPException(
            status_code=409,
            detail={"error": "invalid_status", "status": "retired", "expected": "draft|pilot|active",
                        "message": "привязка уже снята с эксплуатации"},
        )
    return repository.retire(binding_id)  # type: ignore[return-value]
