import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)


def _read_redis_url() -> str:
    return str(os.environ.get("REDIS_URL", "") or "").strip()


@lru_cache(maxsize=1)
def _load_redis_module():
    try:
        import redis  # type: ignore
    except Exception as exc:
        logger.warning("redis_client: redis package not available: %s", exc)
        return None
    return redis


@lru_cache(maxsize=1)
def get_client():
    """
    Return Redis client or None if redis is not configured/available.
    This function must never raise to keep redis optional.
    """
    redis_url = _read_redis_url()
    if not redis_url:
        logger.warning("redis_client: REDIS_URL is empty, redis disabled")
        return None

    redis_mod = _load_redis_module()
    if redis_mod is None:
        return None

    try:
        client = redis_mod.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
            health_check_interval=30,
        )
        return client
    except Exception as exc:
        logger.warning("redis_client: failed to create client for %s: %s", redis_url, exc)
        return None


def ping(client=None) -> bool:
    """
    Return True only when redis client exists and answers PING.
    """
    conn = client if client is not None else get_client()
    if conn is None:
        return False
    try:
        return bool(conn.ping())
    except Exception as exc:
        logger.warning("redis_client: ping failed: %s", exc)
        return False

