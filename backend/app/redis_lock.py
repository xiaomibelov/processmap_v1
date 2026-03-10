from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from .redis_client import get_client

logger = logging.getLogger(__name__)

_DEFAULT_TTL_MS = 15000
_RELEASE_IF_MATCH_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
"""


def _session_lock_key(session_id: str) -> str:
    sid = str(session_id or "").strip()
    return f"pm:lock:session:{sid}"


@dataclass
class RedisLockHandle:
    key: str
    token: str
    client: Optional[Any]
    acquired: bool
    bypass: bool = False

    def release(self) -> bool:
        if not self.acquired:
            return True
        if self.bypass or self.client is None:
            return True
        try:
            self.client.eval(_RELEASE_IF_MATCH_LUA, 1, self.key, self.token)
            return True
        except Exception as exc:
            logger.warning("redis_lock: release failed for key=%s: %s", self.key, exc)
            return False


def acquire_session_lock(session_id: str, ttl_ms: int = _DEFAULT_TTL_MS, client: Any = None) -> RedisLockHandle:
    sid = str(session_id or "").strip()
    if not sid:
        return RedisLockHandle(key="", token="", client=None, acquired=True, bypass=True)

    conn = client if client is not None else get_client()
    if conn is None:
        return RedisLockHandle(key=_session_lock_key(sid), token="", client=None, acquired=True, bypass=True)

    key = _session_lock_key(sid)
    token = uuid.uuid4().hex
    ttl = max(1, int(ttl_ms or _DEFAULT_TTL_MS))
    try:
        locked = bool(conn.set(key, token, nx=True, px=ttl))
    except Exception as exc:
        logger.warning("redis_lock: acquire failed for key=%s: %s (bypass enabled)", key, exc)
        return RedisLockHandle(key=key, token=token, client=conn, acquired=True, bypass=True)

    if not locked:
        return RedisLockHandle(key=key, token=token, client=conn, acquired=False, bypass=False)

    return RedisLockHandle(key=key, token=token, client=conn, acquired=True, bypass=False)

