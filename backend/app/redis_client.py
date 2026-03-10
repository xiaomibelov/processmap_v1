import logging
import os
from functools import lru_cache
from threading import Lock
from urllib.parse import urlsplit, urlunsplit

logger = logging.getLogger(__name__)

_CLIENT = None
_CLIENT_URL = ""
_CLIENT_LOCK = Lock()
_STATUS_LOCK = Lock()
_LAST_CLIENT_ERROR = ""
_LAST_PING_ERROR = ""


def _read_redis_url() -> str:
    return str(os.environ.get("REDIS_URL", "") or "").strip()


def _redis_required() -> bool:
    raw = str(os.environ.get("REDIS_REQUIRED", "1") or "").strip().lower()
    if raw in {"0", "false", "off", "no"}:
        return False
    return True


def _mask_redis_url(redis_url: str) -> str:
    src = str(redis_url or "").strip()
    if not src:
        return ""
    try:
        parts = urlsplit(src)
        netloc = str(parts.netloc or "")
        if "@" in netloc:
            userinfo, host = netloc.split("@", 1)
            if ":" in userinfo:
                user, _pwd = userinfo.split(":", 1)
                safe_userinfo = f"{user}:***"
            else:
                safe_userinfo = userinfo
            netloc = f"{safe_userinfo}@{host}"
        return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        return "redis://***"


def _set_client_error(message: str) -> None:
    global _LAST_CLIENT_ERROR
    with _STATUS_LOCK:
        _LAST_CLIENT_ERROR = str(message or "").strip()


def _set_ping_error(message: str) -> None:
    global _LAST_PING_ERROR
    with _STATUS_LOCK:
        _LAST_PING_ERROR = str(message or "").strip()


def _read_errors() -> tuple[str, str]:
    with _STATUS_LOCK:
        return _LAST_CLIENT_ERROR, _LAST_PING_ERROR


@lru_cache(maxsize=1)
def _load_redis_module():
    try:
        import redis  # type: ignore
    except Exception as exc:
        logger.warning("redis_client: redis package not available: %s", exc)
        _set_client_error(f"redis package not available: {exc}")
        return None
    return redis


def get_client():
    global _CLIENT, _CLIENT_URL
    redis_url = _read_redis_url()
    if not redis_url:
        msg = "REDIS_URL is empty"
        if _redis_required():
            logger.error("redis_client: %s (redis required, switching to degraded fallback)", msg)
        else:
            logger.warning("redis_client: %s (redis optional mode)", msg)
        _set_client_error(msg)
        with _CLIENT_LOCK:
            _CLIENT = None
            _CLIENT_URL = ""
        return None

    with _CLIENT_LOCK:
        if _CLIENT is not None and _CLIENT_URL == redis_url:
            return _CLIENT

    redis_mod = _load_redis_module()
    if redis_mod is None:
        return None

    safe_url = _mask_redis_url(redis_url)
    try:
        client = redis_mod.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
            health_check_interval=30,
        )
        with _CLIENT_LOCK:
            _CLIENT = client
            _CLIENT_URL = redis_url
        _set_client_error("")
        return client
    except Exception as exc:
        logger.error("redis_client: failed to create client for %s: %s", safe_url, exc)
        _set_client_error(f"failed to create client: {exc}")
        return None


def ping(client=None) -> bool:
    global _CLIENT
    conn = client if client is not None else get_client()
    if conn is None:
        return False
    try:
        ok = bool(conn.ping())
        if ok:
            _set_ping_error("")
        return ok
    except Exception as exc:
        logger.warning("redis_client: ping failed: %s", exc)
        _set_ping_error(str(exc))
        with _CLIENT_LOCK:
            if conn is _CLIENT:
                _CLIENT = None
        return False


def reset_client_cache() -> None:
    global _CLIENT, _CLIENT_URL
    with _CLIENT_LOCK:
        _CLIENT = None
        _CLIENT_URL = ""


def runtime_status(force_ping: bool = True) -> dict:
    redis_url = _read_redis_url()
    required = _redis_required()
    configured = bool(redis_url)
    safe_url = _mask_redis_url(redis_url)
    client = get_client()
    client_error, ping_error = _read_errors()

    if not configured:
        mode = "ERROR" if required else "FALLBACK"
        state = "misconfigured" if required else "fallback_unavailable"
        reason = "REDIS_URL is empty"
        return {
            "mode": mode,
            "state": state,
            "configured": False,
            "required": required,
            "available": False,
            "degraded": mode == "FALLBACK",
            "incident": mode == "ERROR",
            "fallback_active": True,
            "reason": reason,
            "redis_url": "",
            "client_error": reason,
            "ping_error": "",
        }

    if client is None:
        mode = "ERROR" if required else "FALLBACK"
        state = "misconfigured" if mode == "ERROR" else "fallback_unavailable"
        reason = client_error or "redis client unavailable"
        return {
            "mode": mode,
            "state": state,
            "configured": True,
            "required": required,
            "available": False,
            "degraded": mode == "FALLBACK",
            "incident": mode == "ERROR",
            "fallback_active": True,
            "reason": reason,
            "redis_url": safe_url,
            "client_error": client_error,
            "ping_error": ping_error,
        }

    available = bool(ping(client)) if force_ping else True
    _client_error, ping_error = _read_errors()
    if available:
        return {
            "mode": "ON",
            "state": "healthy",
            "configured": True,
            "required": required,
            "available": True,
            "degraded": False,
            "incident": False,
            "fallback_active": False,
            "reason": "",
            "redis_url": safe_url,
            "client_error": "",
            "ping_error": "",
        }

    reason = ping_error or _client_error or "redis ping failed"
    return {
        "mode": "FALLBACK",
        "state": "fallback_unavailable",
        "configured": True,
        "required": required,
        "available": False,
        "degraded": True,
        "incident": False,
        "fallback_active": True,
        "reason": reason,
        "redis_url": safe_url,
        "client_error": _client_error,
        "ping_error": ping_error,
    }
