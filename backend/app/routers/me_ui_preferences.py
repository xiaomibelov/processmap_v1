"""
Per-user UI-preferences API (feature/workspace-as-is-tobe-overview)
===================================================================

GET   /api/me/ui-preferences — снапшот {preferences: {key: value}} текущего
                               пользователя в scope активной org (request.state.org_id).
PATCH /api/me/ui-preferences — {set: {key: value}, unset: [key]};
                               value — строка (баннер хранит dismissed_at как ts-строку).

Технический (не бизнес-) endpoint: хранилище — runtime-guard таблица
`user_ui_preferences` (см. _ensure_schema), per-user + per-org scope.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..legacy.request_context import request_active_org_id, require_authenticated_user

router = APIRouter(tags=["me"])
logger = logging.getLogger(__name__)

_KEY_RE = re.compile(r"^[a-z0-9_.\-]{1,64}$")
_MAX_VALUE_LEN = 256
_MAX_KEYS = 50


class UiPreferencesPatchBody(BaseModel):
    set: Optional[Dict[str, str]] = None
    unset: Optional[List[str]] = None


def _validate_key(key: str) -> Optional[str]:
    if not _KEY_RE.match(str(key or "")):
        return f"invalid preference key: {key!r}"
    return None


def _validate_value(value: Any) -> Optional[str]:
    text = str(value if value is not None else "")
    if len(text) > _MAX_VALUE_LEN:
        return "preference value too long (max 256 chars)"
    return None


@router.get("/api/me/ui-preferences")
def get_me_ui_preferences(request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = str(getattr(request.state, "org_id", "") or "").strip()
    storage = _storage()
    return {"ok": True, "preferences": storage.get_user_ui_preferences(org_id=org_id)}


@router.patch("/api/me/ui-preferences")
def patch_me_ui_preferences(body: UiPreferencesPatchBody, request: Request) -> Dict[str, Any]:
    require_authenticated_user(request)
    org_id = str(getattr(request.state, "org_id", "") or "").strip()
    storage = _storage()

    to_set = dict(body.set or {})
    to_unset = list(body.unset or [])
    if len(to_set) + len(to_unset) > _MAX_KEYS:
        return {"ok": False, "error": "too many keys in one patch", "preferences": storage.get_user_ui_preferences(org_id)}

    for key in to_set:
        error = _validate_key(key)
        if error:
            return {"ok": False, "error": error, "preferences": storage.get_user_ui_preferences(org_id)}
    for key in to_unset:
        error = _validate_key(key)
        if error:
            return {"ok": False, "error": error, "preferences": storage.get_user_ui_preferences(org_id)}
    for value in to_set.values():
        error = _validate_value(value)
        if error:
            return {"ok": False, "error": error, "preferences": storage.get_user_ui_preferences(org_id)}

    preferences: Dict[str, str] = {}
    for key, value in to_set.items():
        preferences = storage.set_user_ui_preference(key, str(value if value is not None else ""), org_id)
    for key in to_unset:
        preferences = storage.delete_user_ui_preference(key, org_id)
    return {"ok": True, "preferences": preferences}


def _storage():
    from .. import storage as storage_module

    return storage_module.get_storage()
