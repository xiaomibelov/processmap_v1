"""Redis cache helpers for analytics endpoints."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Callable, Dict, Optional

from .redis_cache import cache_delete_prefix, cache_get_json, cache_set_json

ANALYTICS_CACHE_TTL_SEC = 300  # 5 minutes


def _stable_params_hash(params: Optional[Dict[str, Any]]) -> str:
    """Stable short hash for filter/query params."""
    payload = params if isinstance(params, dict) else {}
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def analytics_cache_key(
    segment: str,
    scope: str,
    scope_id: str,
    org_id: str,
    params: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Segment examples: dashboard, properties, actions, properties_summary, actions_summary,
    export_properties, export_actions.
    """
    oid = str(org_id or "default").strip()
    seg = str(segment or "unknown").strip()
    sco = str(scope or "unknown").strip()
    sid = str(scope_id or "unknown").strip()
    h = _stable_params_hash(params)
    return f"pm:cache:analytics:{seg}:{sco}:{sid}:org:{oid}:v1:{h}"


def analytics_cache_prefix(scope: str, scope_id: str, org_id: str) -> str:
    oid = str(org_id or "default").strip()
    sco = str(scope or "unknown").strip()
    sid = str(scope_id or "unknown").strip()
    return f"pm:cache:analytics:*:{sco}:{sid}:org:{oid}:v1:*"


def get_cached_analytics(
    segment: str,
    scope: str,
    scope_id: str,
    org_id: str,
    params: Optional[Dict[str, Any]] = None,
) -> Optional[Any]:
    return cache_get_json(analytics_cache_key(segment, scope, scope_id, org_id, params))


def set_cached_analytics(
    segment: str,
    scope: str,
    scope_id: str,
    org_id: str,
    value: Any,
    params: Optional[Dict[str, Any]] = None,
    ttl_sec: int = ANALYTICS_CACHE_TTL_SEC,
) -> bool:
    return cache_set_json(
        analytics_cache_key(segment, scope, scope_id, org_id, params),
        value,
        ttl_sec=ttl_sec,
    )


def invalidate_analytics_scope(scope: str, scope_id: str, org_id: str) -> int:
    """Delete all analytics cache entries for a given scope."""
    prefix = analytics_cache_prefix(scope, scope_id, org_id)
    return cache_delete_prefix(prefix)


def cached_analytics(
    segment: str,
    scope: str,
    scope_id: str,
    org_id: str,
    params: Optional[Dict[str, Any]] = None,
    compute: Optional[Callable[[], Any]] = None,
):
    """Read-through cache helper."""
    cached = get_cached_analytics(segment, scope, scope_id, org_id, params)
    if cached is not None:
        return cached
    if compute is None:
        return None
    value = compute()
    set_cached_analytics(segment, scope, scope_id, org_id, value, params)
    return value
