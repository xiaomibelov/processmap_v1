"""
User Preferences API (P1 [А], PHASE2_USER_PREFERENCES_CONTRACT)
================================================================

GET   /api/users/me/preferences  — снапшот {user_id, version, updated_at, preferences};
                                   нет записи → 200 с version=0 и preferences={}.
PATCH /api/users/me/preferences  — {base_version, set{...}, unset[...]};
                                   merge на уровне верхнего namespaced-ключа
                                   (значение заменяется целиком, null — удалить);
                                   200 со снапшотом и version+1;
                                   409 — base_version не совпал (тело = актуальный снапшот,
                                   клиент решает last-write-wins);
                                   422 — неизвестный ключ / невалидное значение / лимиты.

Scope: per-user + per-org (org — active_org_id запроса). Whitelist ключей:
explorer.tree.expanded, explorer.tree.collapsed, explorer.columns, explorer.density,
explorer.saved_views.

Уточнение контракта (2026-08-16): значения хранятся как TEXT (JSON) через общий
storage-слой, который прозрачно работает и на SQLite (dev/tests), и на
PostgreSQL (prod, DATABASE_URL) — отдельного jsonb-типа не вводим.
Семантика explorer.tree.expanded: дефолт дерева в UI — «всё свёрнуто», поэтому
в значении ключа хранятся ID ЯВНО РАСКРЫТЫХ пользователем узлов
(Record<orgId::workspaceId, string[]>). Legacy `explorer.tree.collapsed`
с той же фактической expanded-семантикой читается для обратной совместимости.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..legacy.request_context import require_authenticated_user, request_active_org_id
from .. import storage

router = APIRouter(tags=["users"])
logger = logging.getLogger(__name__)

MAX_PAYLOAD_BYTES = 64 * 1024
MAX_COLLAPSED_IDS_PER_WORKSPACE = 500
MAX_SAVED_VIEWS = 20
MAX_SAVED_VIEW_NAME = 80

KEY_TREE_COLLAPSED = "explorer.tree.collapsed"
KEY_TREE_EXPANDED = "explorer.tree.expanded"
KEY_COLUMNS = "explorer.columns"
KEY_DENSITY = "explorer.density"
KEY_SAVED_VIEWS = "explorer.saved_views"

ALLOWED_KEYS = {KEY_TREE_EXPANDED, KEY_TREE_COLLAPSED, KEY_COLUMNS, KEY_DENSITY, KEY_SAVED_VIEWS}
DENSITY_VALUES = {"comfortable", "compact"}


class PreferencesPatchBody(BaseModel):
    base_version: int
    set: Optional[Dict[str, Any]] = None
    unset: Optional[List[str]] = None


def _err_422(detail: str) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": detail})


def _validate_tree_collapsed(value: Any) -> Optional[str]:
    if not isinstance(value, dict):
        return "explorer tree state must be an object Record<scopeKey, string[]>"
    for scope_id, ids in value.items():
        if not str(scope_id or "").strip():
            return "explorer tree state scope id must be a non-empty string"
        if not isinstance(ids, list):
            return f"explorer tree state[{scope_id}] must be an array of node ids"
        if len(ids) > MAX_COLLAPSED_IDS_PER_WORKSPACE:
            return f"explorer tree state[{scope_id}] exceeds {MAX_COLLAPSED_IDS_PER_WORKSPACE} ids"
        for node_id in ids:
            if not isinstance(node_id, str) or not node_id.strip():
                return f"explorer tree state[{scope_id}] must contain non-empty string ids"
    return None


def _validate_columns(value: Any) -> Optional[str]:
    if not isinstance(value, dict):
        return "explorer.columns must be an object Record<string, boolean>"
    for key, flag in value.items():
        if not str(key or "").strip() or not isinstance(flag, bool):
            return "explorer.columns values must be booleans keyed by non-empty strings"
    return None


def _validate_density(value: Any) -> Optional[str]:
    if value not in DENSITY_VALUES:
        return "explorer.density must be one of: comfortable, compact"
    return None


def _validate_saved_views(value: Any) -> Optional[str]:
    if not isinstance(value, list):
        return "explorer.saved_views must be an array"
    if len(value) > MAX_SAVED_VIEWS:
        return f"explorer.saved_views exceeds {MAX_SAVED_VIEWS} views"
    for view in value:
        if not isinstance(view, dict):
            return "explorer.saved_views items must be objects"
        name = view.get("name")
        if not isinstance(name, str) or not name.strip():
            return "explorer.saved_views items require a non-empty name"
        if len(name) > MAX_SAVED_VIEW_NAME:
            return f"explorer.saved_views name exceeds {MAX_SAVED_VIEW_NAME} chars"
        view_id = view.get("id")
        if view_id is not None and not isinstance(view_id, str):
            return "explorer.saved_views id must be a string"
        for optional_key in ("filters", "sort"):
            if optional_key in view and not isinstance(view[optional_key], dict):
                return f"explorer.saved_views.{optional_key} must be an object"
        # Полная whitelist-валидация фильтров видов — Фаза 3 (контракт п.4),
        # когда saved_views появятся на фронте.
    return None


_VALIDATORS = {
    KEY_TREE_EXPANDED: _validate_tree_collapsed,
    KEY_TREE_COLLAPSED: _validate_tree_collapsed,
    KEY_COLUMNS: _validate_columns,
    KEY_DENSITY: _validate_density,
    KEY_SAVED_VIEWS: _validate_saved_views,
}


def _validate_set_values(set_values: Dict[str, Any]) -> Optional[str]:
    try:
        payload_size = len(json.dumps(set_values, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError):
        return "preferences values must be JSON-serializable"
    if payload_size > MAX_PAYLOAD_BYTES:
        return f"preferences payload exceeds {MAX_PAYLOAD_BYTES} bytes"
    for key, value in set_values.items():
        if key not in ALLOWED_KEYS:
            return f"unknown preference key: {key}"
        if value is None:
            continue  # null — удаление ключа
        validator = _VALIDATORS[key]
        error = validator(value)
        if error:
            return error
    return None


def _validate_unset_keys(unset_keys: List[str]) -> Optional[str]:
    for key in unset_keys:
        if key not in ALLOWED_KEYS:
            return f"unknown preference key: {key}"
    return None


@router.get("/api/users/me/preferences")
def get_my_preferences(request: Request) -> Dict[str, Any]:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    return storage.get_user_preferences(user_id, org_id)


@router.patch("/api/users/me/preferences")
def patch_my_preferences(request: Request, body: PreferencesPatchBody) -> Any:
    user_id = require_authenticated_user(request)
    org_id = request_active_org_id(request)
    set_values = dict(body.set or {})
    unset_keys = list(body.unset or [])
    error = _validate_set_values(set_values) or _validate_unset_keys(unset_keys)
    if error:
        return _err_422(error)
    snapshot, conflict = storage.apply_user_preferences_patch(
        user_id,
        org_id,
        base_version=body.base_version,
        set_values=set_values,
        unset_keys=unset_keys,
    )
    if conflict:
        return JSONResponse(status_code=409, content=snapshot)
    return snapshot
