from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..services.org_workspace import require_org_member_for_enterprise
from ..storage import (
    delete_org_property_dictionary_definition,
    delete_org_property_dictionary_value,
    get_org_property_dictionary_bundle,
    get_org_property_dictionary_value_by_id,
    list_org_property_dictionary_operations,
    upsert_org_property_dictionary_definition,
    upsert_org_property_dictionary_operation,
    upsert_org_property_dictionary_value,
    update_org_property_dictionary_value,
)

router = APIRouter()


def _actor_user_id(request: Request) -> str:
    user = getattr(request.state, "auth_user", None)
    if isinstance(user, dict):
        return str(user.get("id") or "").strip()
    return ""


def _ensure_org_member(request: Request, org_id: str) -> str:
    oid = str(org_id or "").strip()
    if not oid:
        raise HTTPException(status_code=422, detail="org_id required")
    try:
        require_org_member_for_enterprise(request, oid)
    except Exception as exc:
        message = str(getattr(exc, "detail", "") or str(exc) or "forbidden")
        status_code = int(getattr(exc, "status_code", 403) or 403)
        raise HTTPException(status_code=status_code, detail=message) from exc
    return oid


class OperationUpsertIn(BaseModel):
    operation_key: str = ""
    operation_label: str = ""
    is_active: bool = True
    sort_order: int = 0


class DefinitionUpsertIn(BaseModel):
    property_key: str = ""
    property_label: str = ""
    input_mode: str = "autocomplete"
    allow_custom_value: bool = True
    required: bool = False
    is_active: bool = True
    sort_order: int = 0


class ValueUpsertIn(BaseModel):
    option_value: str = ""
    is_active: bool = True
    sort_order: int = 0


@router.get("/api/orgs/{org_id}/property-dictionary/operations")
def list_org_property_dictionary_operations_endpoint(
    org_id: str,
    request: Request,
    include_inactive: bool = False,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    items = list_org_property_dictionary_operations(oid, include_inactive=include_inactive)
    return {"items": items, "count": len(items), "org_id": oid}


@router.post("/api/orgs/{org_id}/property-dictionary/operations")
def create_or_update_org_property_dictionary_operation_endpoint(
    org_id: str,
    body: OperationUpsertIn,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    item = upsert_org_property_dictionary_operation(
        oid,
        operation_key=body.operation_key,
        operation_label=body.operation_label,
        is_active=body.is_active,
        sort_order=body.sort_order,
        actor_user_id=_actor_user_id(request),
    )
    return {"ok": True, "item": item}


@router.patch("/api/orgs/{org_id}/property-dictionary/operations/{operation_key}")
def patch_org_property_dictionary_operation_endpoint(
    org_id: str,
    operation_key: str,
    body: OperationUpsertIn,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    item = upsert_org_property_dictionary_operation(
        oid,
        operation_key=operation_key or body.operation_key,
        operation_label=body.operation_label,
        is_active=body.is_active,
        sort_order=body.sort_order,
        actor_user_id=_actor_user_id(request),
    )
    return {"ok": True, "item": item}


@router.get("/api/orgs/{org_id}/property-dictionary/operations/{operation_key}")
def get_org_property_dictionary_bundle_endpoint(
    org_id: str,
    operation_key: str,
    request: Request,
    include_inactive: bool = False,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    return get_org_property_dictionary_bundle(oid, operation_key, include_inactive=include_inactive)


@router.post("/api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties")
def create_or_update_org_property_dictionary_definition_endpoint(
    org_id: str,
    operation_key: str,
    body: DefinitionUpsertIn,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    item = upsert_org_property_dictionary_definition(
        oid,
        operation_key=operation_key,
        property_key=body.property_key,
        property_label=body.property_label,
        input_mode=body.input_mode,
        allow_custom_value=body.allow_custom_value,
        required=body.required,
        is_active=body.is_active,
        sort_order=body.sort_order,
        actor_user_id=_actor_user_id(request),
    )
    return {"ok": True, "item": item}


@router.patch("/api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties/{property_key}")
def patch_org_property_dictionary_definition_endpoint(
    org_id: str,
    operation_key: str,
    property_key: str,
    body: DefinitionUpsertIn,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    item = upsert_org_property_dictionary_definition(
        oid,
        operation_key=operation_key,
        property_key=property_key or body.property_key,
        property_label=body.property_label,
        input_mode=body.input_mode,
        allow_custom_value=body.allow_custom_value,
        required=body.required,
        is_active=body.is_active,
        sort_order=body.sort_order,
        actor_user_id=_actor_user_id(request),
    )
    return {"ok": True, "item": item}


@router.delete("/api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties/{property_key}")
def delete_org_property_dictionary_definition_endpoint(
    org_id: str,
    operation_key: str,
    property_key: str,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    deleted = delete_org_property_dictionary_definition(oid, operation_key, property_key)
    return {"ok": bool(deleted)}


@router.post("/api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties/{property_key}/values")
def create_or_update_org_property_dictionary_value_endpoint(
    org_id: str,
    operation_key: str,
    property_key: str,
    body: ValueUpsertIn,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    item = upsert_org_property_dictionary_value(
        oid,
        operation_key=operation_key,
        property_key=property_key,
        option_value=body.option_value,
        is_active=body.is_active,
        sort_order=body.sort_order,
        actor_user_id=_actor_user_id(request),
    )
    return {"ok": True, "item": item}


@router.patch("/api/orgs/{org_id}/property-dictionary/values/{value_id}")
def patch_org_property_dictionary_value_endpoint(
    org_id: str,
    value_id: str,
    body: ValueUpsertIn,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    current = get_org_property_dictionary_value_by_id(oid, value_id)
    if not current:
        raise HTTPException(status_code=404, detail="value_not_found")
    item = update_org_property_dictionary_value(
        oid,
        value_id,
        option_value=body.option_value,
        is_active=body.is_active,
        sort_order=body.sort_order,
        actor_user_id=_actor_user_id(request),
    )
    if not item:
        raise HTTPException(status_code=404, detail="value_not_found")
    return {"ok": True, "item": item}


@router.delete("/api/orgs/{org_id}/property-dictionary/values/{value_id}")
def delete_org_property_dictionary_value_endpoint(
    org_id: str,
    value_id: str,
    request: Request,
) -> Dict[str, Any]:
    oid = _ensure_org_member(request, org_id)
    deleted = delete_org_property_dictionary_value(oid, value_id)
    return {"ok": bool(deleted)}
