import logging
from typing import Any, Dict

from fastapi import APIRouter, Request

from ..redis_client import get_client

logger = logging.getLogger(__name__)
router = APIRouter()

_DEFAULT_FLAGS: Dict[str, str] = {
    "bpmn_fps_meter_enabled": "0",
    "canvas_profiler_enabled": "0",
}


def _redis_key(org_id: str) -> str:
    return f"feature_flags:{org_id or 'default'}"


def _get_flags(org_id: str) -> Dict[str, bool]:
    client = get_client()
    key = _redis_key(org_id)
    flags = dict(_DEFAULT_FLAGS)
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
    if client is not None:
        try:
            client.hset(key, flag, "1" if value else "0")
        except Exception as exc:
            logger.warning("feature_flags: redis write failed: %s", exc)


@router.get("/api/feature-flags")
def get_feature_flags(request: Request) -> Any:
    org_id = ""
    if hasattr(request.state, "org_id"):
        org_id = str(request.state.org_id or "")
    return {"ok": True, "flags": _get_flags(org_id)}


@router.patch("/api/admin/feature-flags")
def patch_feature_flags(request: Request, body: Dict[str, Any]) -> Any:
    org_id = ""
    if hasattr(request.state, "org_id"):
        org_id = str(request.state.org_id or "")

    updates = body.get("flags", {})
    for flag, value in updates.items():
        if flag in _DEFAULT_FLAGS:
            _set_flag(org_id, flag, bool(value))

    return {"ok": True, "flags": _get_flags(org_id)}
