from __future__ import annotations

import hashlib
import json
import logging
import threading
from typing import Any, Dict, Optional

from .redis_client import get_client

logger = logging.getLogger(__name__)

_STATS_LOCK = threading.Lock()
_CACHE_STATS: Dict[str, int] = {
    "hit": 0,
    "miss": 0,
    "set": 0,
    "delete": 0,
    "error": 0,
    "skip_no_client": 0,
}


def cache_stats_reset() -> None:
    with _STATS_LOCK:
        for key in list(_CACHE_STATS.keys()):
            _CACHE_STATS[key] = 0


def cache_stats_snapshot() -> Dict[str, int]:
    with _STATS_LOCK:
        return {key: int(value or 0) for key, value in _CACHE_STATS.items()}


def _stat_inc(name: str, delta: int = 1) -> None:
    key = str(name or "").strip() or "error"
    with _STATS_LOCK:
        _CACHE_STATS[key] = int(_CACHE_STATS.get(key, 0) or 0) + int(delta or 0)


def _stable_json_hash(payload: Dict[str, Any]) -> str:
    source = payload if isinstance(payload, dict) else {}
    raw = json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def workspace_filters_hash(filters_payload: Dict[str, Any]) -> str:
    return _stable_json_hash(filters_payload)[:24]


def workspace_cache_key(org_id: str, filters_hash: str) -> str:
    oid = str(org_id or "").strip() or "default"
    h = str(filters_hash or "").strip() or "all"
    return f"pm:cache:workspace:org:{oid}:v1:{h}"


def tldr_cache_key(session_id: str) -> str:
    sid = str(session_id or "").strip() or "unknown"
    return f"pm:cache:tldr:session:{sid}:v1"


def _resolve_client(client: Any = None):
    conn = client if client is not None else get_client()
    if conn is None:
        _stat_inc("skip_no_client")
    return conn


def cache_get_json(key: str, *, client: Any = None) -> Optional[Any]:
    cache_key = str(key or "").strip()
    if not cache_key:
        _stat_inc("miss")
        return None
    conn = _resolve_client(client=client)
    if conn is None:
        return None
    try:
        raw = conn.get(cache_key)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: get failed key=%s: %s", cache_key, exc)
        return None
    if raw is None:
        _stat_inc("miss")
        return None
    try:
        payload = json.loads(str(raw or "null"))
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: json decode failed key=%s: %s", cache_key, exc)
        return None
    _stat_inc("hit")
    return payload


def cache_set_json(key: str, value: Any, *, ttl_sec: int, client: Any = None) -> bool:
    cache_key = str(key or "").strip()
    if not cache_key:
        return False
    conn = _resolve_client(client=client)
    if conn is None:
        return False
    ttl = max(1, int(ttl_sec or 1))
    try:
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: json encode failed key=%s: %s", cache_key, exc)
        return False
    try:
        if hasattr(conn, "setex"):
            ok = conn.setex(cache_key, ttl, raw)
        else:
            ok = conn.set(cache_key, raw, ex=ttl)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: set failed key=%s: %s", cache_key, exc)
        return False
    if ok:
        _stat_inc("set")
    return bool(ok)


def cache_delete_key(key: str, *, client: Any = None) -> int:
    cache_key = str(key or "").strip()
    if not cache_key:
        return 0
    conn = _resolve_client(client=client)
    if conn is None:
        return 0
    try:
        deleted = int(conn.delete(cache_key) or 0)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: delete key failed key=%s: %s", cache_key, exc)
        return 0
    if deleted > 0:
        _stat_inc("delete", deleted)
    return deleted


def cache_delete_prefix(prefix: str, *, client: Any = None) -> int:
    key_prefix = str(prefix or "").strip()
    if not key_prefix:
        return 0
    conn = _resolve_client(client=client)
    if conn is None:
        return 0
    match_expr = f"{key_prefix}*"
    keys: list[str] = []
    try:
        for item in conn.scan_iter(match=match_expr, count=500):
            key = str(item or "").strip()
            if key:
                keys.append(key)
    except Exception as exc:
        _stat_inc("error")
        logger.warning("redis_cache: scan failed prefix=%s: %s", key_prefix, exc)
        return 0
    if not keys:
        return 0
    deleted = 0
    for key in keys:
        deleted += cache_delete_key(key, client=conn)
    return int(deleted)


def invalidate_workspace_org(org_id: str, *, client: Any = None) -> int:
    oid = str(org_id or "").strip() or "default"
    prefix = f"pm:cache:workspace:org:{oid}:v1:"
    return cache_delete_prefix(prefix, client=client)


def invalidate_tldr_session(session_id: str, *, client: Any = None) -> int:
    return cache_delete_key(tldr_cache_key(session_id), client=client)
