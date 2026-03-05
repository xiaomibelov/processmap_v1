from __future__ import annotations

from typing import Any, Dict, Optional, Set, Tuple

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import _legacy_main
from ..redis_cache import cache_delete_prefix, cache_get_json, cache_set_json
from ..storage import (
    create_template,
    delete_template,
    get_template,
    list_templates,
    update_template,
)

router = APIRouter()


class TemplateCreateIn(BaseModel):
    scope: str = "personal"
    template_type: str = "bpmn_selection_v1"
    org_id: str = ""
    name: str
    description: str = ""
    payload: Dict[str, Any] = {}


class TemplatePatchIn(BaseModel):
    template_type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


def _normalize_template_scope(scope_raw: Any) -> str:
    scope = str(scope_raw or "").strip().lower()
    return "org" if scope == "org" else "personal"


def _normalize_template_type(template_type_raw: Any) -> str:
    value = str(template_type_raw or "").strip().lower()
    if value == "hybrid_stencil_v1":
        return "hybrid_stencil_v1"
    if value == "bpmn_fragment_v1":
        return "bpmn_fragment_v1"
    return "bpmn_selection_v1"


def _validate_template_payload(template_type_raw: Any, payload_raw: Any) -> Tuple[bool, str]:
    payload = payload_raw if isinstance(payload_raw, dict) else None
    if payload is None:
        return False, "payload must be object"
    template_type = _normalize_template_type(template_type_raw)
    if template_type == "hybrid_stencil_v1":
        elements = payload.get("elements")
        edges = payload.get("edges")
        bbox = payload.get("bbox")
        if not isinstance(elements, list):
            return False, "payload.elements must be array for hybrid_stencil_v1"
        if not isinstance(edges, list):
            return False, "payload.edges must be array for hybrid_stencil_v1"
        if not isinstance(bbox, dict):
            return False, "payload.bbox must be object for hybrid_stencil_v1"
        return True, ""
    if template_type == "bpmn_fragment_v1":
        pack = payload.get("pack")
        fragment = payload.get("fragment")
        source_fragment = pack.get("fragment") if isinstance(pack, dict) else fragment
        if not isinstance(source_fragment, dict):
            return False, "payload.pack.fragment must be object for bpmn_fragment_v1"
        nodes = source_fragment.get("nodes")
        edges = source_fragment.get("edges")
        if not isinstance(nodes, list):
            return False, "payload.pack.fragment.nodes must be array for bpmn_fragment_v1"
        if not isinstance(edges, list):
            return False, "payload.pack.fragment.edges must be array for bpmn_fragment_v1"
        return True, ""
    ids = payload.get("bpmn_element_ids")
    if ids is not None and not isinstance(ids, list):
        return False, "payload.bpmn_element_ids must be array"
    return True, ""


def _templates_cache_key(*, scope: str, user_id: str = "", org_id: str = "", limit: int = 200) -> str:
    normalized_scope = _normalize_template_scope(scope)
    lim = max(1, min(int(limit or 200), 1000))
    if normalized_scope == "org":
        oid = str(org_id or "").strip() or "org_default"
        return f"pm:cache:templates:scope:org:org:{oid}:limit:{lim}:v1"
    uid = str(user_id or "").strip() or "anonymous"
    return f"pm:cache:templates:scope:personal:user:{uid}:limit:{lim}:v1"


def _invalidate_templates_cache(*, user_id: str = "", org_id: str = "") -> None:
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if uid:
        cache_delete_prefix(f"pm:cache:templates:scope:personal:user:{uid}:")
    if oid:
        cache_delete_prefix(f"pm:cache:templates:scope:org:org:{oid}:")


def _template_can_manage(
    *,
    template: Dict[str, Any],
    user_id: str,
    is_admin: bool,
    org_role: str = "",
) -> bool:
    if is_admin:
        return True
    owner_id = str(template.get("owner_user_id") or "").strip()
    if owner_id and owner_id == str(user_id or "").strip():
        return True
    scope = _normalize_template_scope(template.get("scope"))
    if scope == "org":
        return _legacy_main._is_role_allowed(org_role, _legacy_main._ORG_TEMPLATE_WRITE_ROLES)
    return False


def _template_response_row(
    template: Dict[str, Any],
    *,
    user_id: str,
    is_admin: bool,
    org_role: str = "",
) -> Dict[str, Any]:
    item = dict(template or {}) if isinstance(template, dict) else {}
    can_manage = _template_can_manage(
        template=item,
        user_id=user_id,
        is_admin=is_admin,
        org_role=org_role,
    )
    return {
        "id": str(item.get("id") or ""),
        "scope": _normalize_template_scope(item.get("scope")),
        "template_type": _normalize_template_type(item.get("template_type")),
        "org_id": str(item.get("org_id") or ""),
        "owner_user_id": str(item.get("owner_user_id") or ""),
        "name": str(item.get("name") or ""),
        "description": str(item.get("description") or ""),
        "payload": item.get("payload") if isinstance(item.get("payload"), dict) else {},
        "bpmn_element_ids": item.get("bpmn_element_ids") if isinstance(item.get("bpmn_element_ids"), list) else [],
        "selection_count": int(item.get("selection_count") or 0),
        "created_at": int(item.get("created_at") or 0),
        "updated_at": int(item.get("updated_at") or 0),
        "can_edit": bool(can_manage),
        "can_delete": bool(can_manage),
    }


@router.get("/api/templates")
def list_templates_endpoint(
    request: Request,
    scope: str = Query(default="personal"),
    org_id: str = Query(default=""),
    limit: int = Query(default=200),
) -> Dict[str, Any]:
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    normalized_scope = _normalize_template_scope(scope)
    lim = max(1, min(int(limit or 200), 1000))
    if normalized_scope == "personal":
        cache_key = _templates_cache_key(scope="personal", user_id=uid, limit=lim)
        cached = cache_get_json(cache_key)
        if isinstance(cached, dict):
            return cached
        rows = list_templates(
            scope="personal",
            owner_user_id=uid,
            org_id="",
            limit=lim,
        )
        items = [
            _template_response_row(row, user_id=uid, is_admin=is_admin)
            for row in rows
        ]
        result = {
            "scope": "personal",
            "org_id": "",
            "items": items,
            "count": len(items),
        }
        cache_set_json(cache_key, result, ttl_sec=45)
        return result

    oid = str(org_id or "").strip() or _legacy_main._request_active_org_id(request)
    role, err = _legacy_main._enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    org_role = str(role or "").strip().lower()
    cache_key = _templates_cache_key(scope="org", org_id=oid, limit=lim)
    cached = cache_get_json(cache_key)
    if isinstance(cached, dict):
        return cached
    rows = list_templates(
        scope="org",
        owner_user_id="",
        org_id=oid,
        limit=lim,
    )
    items = [
        _template_response_row(
            row,
            user_id=uid,
            is_admin=is_admin,
            org_role=org_role,
        )
        for row in rows
    ]
    result = {
        "scope": "org",
        "org_id": oid,
        "items": items,
        "count": len(items),
    }
    cache_set_json(cache_key, result, ttl_sec=45)
    return result


@router.post("/api/templates")
def create_template_endpoint(inp: TemplateCreateIn, request: Request) -> Dict[str, Any]:
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    normalized_scope = _normalize_template_scope(getattr(inp, "scope", "personal"))
    normalized_template_type = _normalize_template_type(getattr(inp, "template_type", "bpmn_selection_v1"))
    name = str(getattr(inp, "name", "") or "").strip()
    description = str(getattr(inp, "description", "") or "").strip()
    payload = getattr(inp, "payload", None)
    if not name:
        return _legacy_main._enterprise_error(422, "validation_error", "name is required")
    payload_ok, payload_error = _validate_template_payload(normalized_template_type, payload)
    if not payload_ok:
        return _legacy_main._enterprise_error(422, "validation_error", payload_error)

    oid = ""
    org_role = ""
    if normalized_scope == "org":
        oid = str(getattr(inp, "org_id", "") or "").strip() or _legacy_main._request_active_org_id(request)
        role, err = _legacy_main._enterprise_require_org_member(request, oid)
        if err is not None:
            return err
        org_role = str(role or "").strip().lower()
        if not (is_admin or _legacy_main._is_role_allowed(org_role, _legacy_main._ORG_TEMPLATE_WRITE_ROLES)):
            return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    try:
        created = create_template(
            scope=normalized_scope,
            template_type=normalized_template_type,
            owner_user_id=uid,
            org_id=oid,
            name=name,
            description=description,
            payload=payload if isinstance(payload, dict) else {},
        )
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))

    item = _template_response_row(
        created,
        user_id=uid,
        is_admin=is_admin,
        org_role=org_role,
    )
    _invalidate_templates_cache(user_id=uid, org_id=oid)
    return {"ok": True, "item": item}


@router.patch("/api/templates/{template_id}")
def patch_template_endpoint(template_id: str, inp: TemplatePatchIn, request: Request) -> Dict[str, Any]:
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    tid = str(template_id or "").strip()
    if not tid:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")

    found = get_template(tid)
    if not found:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")

    scope = _normalize_template_scope(found.get("scope"))
    org_role = ""
    if scope == "org":
        oid = str(found.get("org_id") or "").strip()
        role, err = _legacy_main._enterprise_require_org_member(request, oid)
        if err is not None:
            return err
        org_role = str(role or "").strip().lower()
    can_manage = _template_can_manage(
        template=found,
        user_id=uid,
        is_admin=is_admin,
        org_role=org_role,
    )
    if not can_manage:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    has_name = inp.name is not None
    has_description = inp.description is not None
    has_payload = inp.payload is not None
    has_template_type = inp.template_type is not None
    if not (has_name or has_description or has_payload or has_template_type):
        return _legacy_main._enterprise_error(422, "validation_error", "empty_patch")
    if has_payload or has_template_type:
        next_template_type = _normalize_template_type(inp.template_type if has_template_type else found.get("template_type"))
        next_payload = inp.payload if has_payload else found.get("payload")
        payload_ok, payload_error = _validate_template_payload(next_template_type, next_payload)
        if not payload_ok:
            return _legacy_main._enterprise_error(422, "validation_error", payload_error)

    try:
        updated = update_template(
            tid,
            template_type=inp.template_type if has_template_type else None,
            name=inp.name if has_name else None,
            description=inp.description if has_description else None,
            payload=inp.payload if has_payload else None,
        )
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))
    if not updated:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    _invalidate_templates_cache(
        user_id=str(updated.get("owner_user_id") or uid),
        org_id=str(updated.get("org_id") or ""),
    )
    return {"ok": True, "item": _template_response_row(updated, user_id=uid, is_admin=is_admin, org_role=org_role)}


@router.delete("/api/templates/{template_id}")
def delete_template_endpoint(template_id: str, request: Request):
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    tid = str(template_id or "").strip()
    if not tid:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    found = get_template(tid)
    if not found:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")

    scope = _normalize_template_scope(found.get("scope"))
    org_role = ""
    if scope == "org":
        oid = str(found.get("org_id") or "").strip()
        role, err = _legacy_main._enterprise_require_org_member(request, oid)
        if err is not None:
            return err
        org_role = str(role or "").strip().lower()
    if not _template_can_manage(template=found, user_id=uid, is_admin=is_admin, org_role=org_role):
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    deleted = delete_template(tid)
    if not deleted:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    _invalidate_templates_cache(
        user_id=str(found.get("owner_user_id") or uid),
        org_id=str(found.get("org_id") or ""),
    )
    return Response(status_code=204)
