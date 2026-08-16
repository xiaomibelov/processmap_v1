"""Redis-кэш сервиса — урезанная копия монолитных redis_client/redis_cache.

Оставлены только get_client (env REDIS_URL) + cache_get_json/cache_set_json,
нужные gateway.complete_cached. Ключи идентичны монолиту
(`pm:cache:llm:{feature}:v1:{digest}`) — перенос НЕ инвалидирует кэш (0.4 плана).
"""
from __future__ import annotations

import json
import logging
import os
from threading import Lock
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CLIENT = None
_CLIENT_URL = ""
_CLIENT_LOCK = Lock()


def _read_redis_url() -> str:
    return str(os.environ.get("REDIS_URL", "") or "").strip()


def get_client():
    global _CLIENT, _CLIENT_URL
    redis_url = _read_redis_url()
    if not redis_url:
        with _CLIENT_LOCK:
            _CLIENT = None
            _CLIENT_URL = ""
        return None

    with _CLIENT_LOCK:
        if _CLIENT is not None and _CLIENT_URL == redis_url:
            return _CLIENT

    try:
        import redis
    except Exception as exc:
        logger.warning("redis_cache: redis package not available: %s", exc)
        return None

    try:
        client = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
            health_check_interval=30,
        )
    except Exception as exc:
        logger.warning("redis_cache: failed to create client: %s", exc)
        return None
    with _CLIENT_LOCK:
        _CLIENT = client
        _CLIENT_URL = redis_url
    return client


def reset_client_cache() -> None:
    global _CLIENT, _CLIENT_URL
    with _CLIENT_LOCK:
        _CLIENT = None
        _CLIENT_URL = ""


def cache_get_json(key: str, *, client: Any = None) -> Optional[Any]:
    cache_key = str(key or "").strip()
    if not cache_key:
        return None
    conn = client if client is not None else get_client()
    if conn is None:
        return None
    try:
        raw = conn.get(cache_key)
    except Exception as exc:
        logger.warning("redis_cache: get failed key=%s: %s", cache_key, exc)
        return None
    if raw is None:
        return None
    try:
        return json.loads(str(raw or "null"))
    except Exception as exc:
        logger.warning("redis_cache: json decode failed key=%s: %s", cache_key, exc)
        return None


def cache_set_json(key: str, value: Any, *, ttl_sec: int, client: Any = None) -> bool:
    cache_key = str(key or "").strip()
    if not cache_key:
        return False
    conn = client if client is not None else get_client()
    if conn is None:
        return False
    ttl = max(1, int(ttl_sec or 1))
    try:
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    except Exception as exc:
        logger.warning("redis_cache: json encode failed key=%s: %s", cache_key, exc)
        return False
    try:
        if hasattr(conn, "setex"):
            ok = conn.setex(cache_key, ttl, raw)
        else:
            ok = conn.set(cache_key, raw, ex=ttl)
    except Exception as exc:
        logger.warning("redis_cache: set failed key=%s: %s", cache_key, exc)
        return False
    return bool(ok)
