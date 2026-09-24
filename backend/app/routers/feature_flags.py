import logging
from typing import Any, Dict

from fastapi import APIRouter, Request, HTTPException

from ..feature_flag_catalog import ENV_FLAG_CATALOG, build_catalog_payload
from ..redis_client import get_client
from ..storage import get_feature_flags, set_feature_flag

logger = logging.getLogger(__name__)
router = APIRouter()

_DEFAULT_FLAGS: Dict[str, str] = {
    "bpmn_fps_meter_enabled": "0",
    "canvas_profiler_enabled": "0",
    "lightweightOverlays": "0",
    "useBpmnExtensionOverlays": "0",
    "workspace_session_tree_view": "0",
    "workspace_auto_expand_steps": "0",
    "workspace_tobe_overview": "0",
    "tobe_overlay_mock": "0",
    "tobe_overlay_underlay": "0",
}


def _redis_key(org_id: str) -> str:
    return f"feature_flags:{org_id or 'default'}"


def _get_flags(org_id: str) -> Dict[str, bool]:
    client = get_client()
    key = _redis_key(org_id)
    flags = dict(_DEFAULT_FLAGS)
    # Postgres is source of truth
    try:
        db_flags = get_feature_flags()
        if db_flags:
            flags.update(db_flags)
    except Exception as exc:
        logger.warning("feature_flags: db read failed: %s", exc)
    # Redis overlay (optional cache)
    if client is not None:
        try:
            stored = client.hgetall(key)
            if stored:
                flags.update({k.decode() if isinstance(k, bytes) else k: v.decode() if isinstance(v, bytes) else v for k, v in stored.items()})
        except Exception as exc:
            logger.warning("feature_flags: redis read failed: %s", exc)
    return {k: str(v).lower() in {"1", "true", "yes", "on"} for k, v in flags.items()}


def _set_flag(org_id: str, flag: str, value: bool) -> None:
    client = get_client()
    key = _redis_key(org_id)
    # Update Postgres (source of truth)
    try:
        set_feature_flag(flag, "1" if value else "0")
    except Exception as exc:
        logger.warning("feature_flags: db write failed: %s", exc)
    # Update Redis cache
    if client is not None:
        try:
            client.hset(key, flag, "1" if value else "0")
        except Exception as exc:
            logger.warning("feature_flags: redis write failed: %s", exc)


def _request_auth_user(request: Request) -> dict:
    user = getattr(request.state, "auth_user", None)
    if user is None:
        from ..legacy.request_context import request_auth_user
        user = request_auth_user(request)
    return user if isinstance(user, dict) else {}


@router.get("/api/feature-flags")
def get_feature_flags_endpoint(request: Request) -> Any:
    org_id = ""
    if hasattr(request.state, "org_id"):
        org_id = str(request.state.org_id or "")
    return {"ok": True, "flags": _get_flags(org_id)}


def _parse_flag_value(flag: str, value: Any) -> bool:
    """Строгий парсинг значения флага.

    Принимает: bool; строки "0"/"1"/"true"/"false" (регистронезависимо, trim);
    целые 0/1. Прочее отклоняется 422 — иначе bool(value) делает строку "0"
    truthy и флаг строкой не выключить (находка release/tobe-stage-wave-2026-09-24).
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        if value in (0, 1):
            return bool(value)
    elif isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("1", "true"):
            return True
        if normalized in ("0", "false"):
            return False
    raise HTTPException(
        status_code=422,
        detail={
            "code": "FEATURE_FLAG_INVALID_VALUE",
            "message": f"flag '{flag}': value must be boolean or one of '0'/'1'/'true'/'false'",
        },
    )


def _reject_env_flags(keys) -> None:
    env_keys = [str(k) for k in keys if str(k) in ENV_FLAG_CATALOG]
    if env_keys:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "FEATURE_FLAG_ENV_READONLY",
                "message": f"env-managed flag is read-only: {', '.join(env_keys)}",
            },
        )


@router.patch("/api/admin/feature-flags", responses={
    403: {"description": "Доступ запрещён: требуется роль admin или членство в организации с нужными правами"},
    422: {"description": "Env-управляемый флаг read-only: detail.code = FEATURE_FLAG_ENV_READONLY"},
})
def patch_feature_flags_endpoint(request: Request, body: Dict[str, Any]) -> Any:
    user = _request_auth_user(request)
    if not bool(user.get("is_admin")):
        raise HTTPException(status_code=403, detail="admin required")
    org_id = ""
    if hasattr(request.state, "org_id"):
        org_id = str(request.state.org_id or "")
    updates = body.get("flags", {})
    _reject_env_flags(list(updates.keys()))
    parsed = {flag: _parse_flag_value(flag, value) for flag, value in updates.items()}
    for flag, value in parsed.items():
        _set_flag(org_id, flag, value)
    return {"ok": True, "flags": _get_flags(org_id)}


@router.put("/api/admin/feature-flags/{key}", responses={
    403: {"description": "Доступ запрещён: требуется роль admin или членство в организации с нужными правами"},
    422: {"description": "Env-управляемый флаг read-only: detail.code = FEATURE_FLAG_ENV_READONLY"},
})
def put_feature_flag_endpoint(key: str, request: Request, body: Dict[str, Any]) -> Any:
    user = _request_auth_user(request)
    if not bool(user.get("is_admin")):
        raise HTTPException(status_code=403, detail="admin required")
    org_id = ""
    if hasattr(request.state, "org_id"):
        org_id = str(request.state.org_id or "")
    _reject_env_flags([key])
    value = _parse_flag_value(key, body.get("value")) if "value" in body else False
    _set_flag(org_id, key, value)
    return {"ok": True, "key": key, "value": value, "flags": _get_flags(org_id)}


@router.get("/api/admin/feature-flags/catalog", responses={
    403: {"description": "Доступ запрещён: требуется роль admin или членство в организации с нужными правами"},
})
def get_feature_flags_catalog_endpoint(request: Request) -> Any:
    user = _request_auth_user(request)
    if not bool(user.get("is_admin")):
        raise HTTPException(status_code=403, detail="admin required")
    org_id = ""
    if hasattr(request.state, "org_id"):
        org_id = str(request.state.org_id or "")
    flags = _get_flags(org_id)
    try:
        db_flags = get_feature_flags() or {}
    except Exception as exc:
        logger.warning("feature_flags: catalog db read failed: %s", exc)
        db_flags = {}
    return build_catalog_payload(
        flags=flags,
        db_keys=list(db_flags.keys()),
        defaults=_DEFAULT_FLAGS,
    )


# ── Canvas geometry settings ─────────────────────────────────────────────────
# Контур feature/canvas-geometry-settings (шаг 1: хранение и чтение).
# Переиспользуем таблицу feature_flags как key-value storage; новые ключи в
# FLAG_CATALOG НЕ добавляются намеренно: каталог рендерит каждую запись как
# boolean-тогл (build_catalog_payload: value=bool(flags.get(key))), числовые
# значения дали бы ложный тогл в админ-каталоге.

CANVAS_GEOMETRY_KEYS: Dict[str, str] = {
    "task_width": "canvas_task_width",
    "task_height": "canvas_task_height",
    "sequence_gap": "canvas_sequence_gap",
}
CANVAS_GEOMETRY_BOUNDS: Dict[str, Any] = {
    "task_width": (60, 400),
    "task_height": (60, 400),
    "sequence_gap": (20, 500),
}
CANVAS_GEOMETRY_DEFAULTS: Dict[str, int] = {
    "task_width": 130,
    "task_height": 80,
    "sequence_gap": 100,
}


def _coerce_geometry_int(raw: Any) -> Any:
    try:
        if isinstance(raw, bool):
            return None
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


def canvas_geometry_load() -> Dict[str, int]:
    """Текущие настройки геометрии канваса; незаполненные/битые ключи → дефолты."""
    try:
        raw = dict(get_feature_flags() or {})
    except Exception as exc:
        logger.warning("canvas_geometry: db read failed: %s", exc)
        raw = {}
    settings: Dict[str, int] = {}
    for field, key in CANVAS_GEOMETRY_KEYS.items():
        lo, hi = CANVAS_GEOMETRY_BOUNDS[field]
        value = _coerce_geometry_int(raw.get(key))
        if value is None or not (lo <= value <= hi):
            value = CANVAS_GEOMETRY_DEFAULTS[field]
        settings[field] = value
    return settings


def _canvas_geometry_invalid(field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": "CANVAS_GEOMETRY_INVALID_VALUE", "field": field, "message": message},
    )


def _canvas_geometry_validate(body: Dict[str, Any]) -> Dict[str, int]:
    unknown = sorted(set(body.keys()) - set(CANVAS_GEOMETRY_KEYS.keys()))
    if unknown:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "CANVAS_GEOMETRY_UNKNOWN_FIELD",
                "message": f"unknown fields: {unknown}",
            },
        )
    missing = [field for field in CANVAS_GEOMETRY_KEYS if field not in body]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "CANVAS_GEOMETRY_MISSING_FIELD",
                "message": f"missing fields: {missing}",
            },
        )
    parsed: Dict[str, int] = {}
    for field in CANVAS_GEOMETRY_KEYS:
        value = body[field]
        if isinstance(value, bool) or not isinstance(value, int):
            raise _canvas_geometry_invalid(field, f"{field} must be an integer")
        lo, hi = CANVAS_GEOMETRY_BOUNDS[field]
        if not (lo <= value <= hi):
            raise _canvas_geometry_invalid(field, f"{field} must be between {lo} and {hi}")
        parsed[field] = value
    return parsed


@router.get("/api/settings/canvas-geometry")
def get_canvas_geometry_endpoint(request: Request) -> Any:
    return {"ok": True, "settings": canvas_geometry_load()}


@router.put("/api/admin/canvas-geometry", responses={
    403: {"description": "Доступ запрещён: требуется роль admin"},
    422: {"description": "Невалидное значение: detail.code = CANVAS_GEOMETRY_INVALID_VALUE / CANVAS_GEOMETRY_UNKNOWN_FIELD / CANVAS_GEOMETRY_MISSING_FIELD"},
})
def put_canvas_geometry_endpoint(request: Request, body: Dict[str, Any]) -> Any:
    user = _request_auth_user(request)
    if not bool(user.get("is_admin")):
        raise HTTPException(status_code=403, detail="admin required")
    parsed = _canvas_geometry_validate(body if isinstance(body, dict) else {})
    for field, key in CANVAS_GEOMETRY_KEYS.items():
        try:
            set_feature_flag(key, str(parsed[field]))
        except Exception as exc:
            logger.warning("canvas_geometry: db write failed: %s", exc)
            raise HTTPException(
                status_code=500,
                detail={"code": "CANVAS_GEOMETRY_SAVE_FAILED", "message": str(exc)},
            )
    return {"ok": True, "settings": canvas_geometry_load()}
