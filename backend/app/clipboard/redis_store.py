from __future__ import annotations

import os
import time
from typing import Any, Optional

from ..redis_cache import cache_delete_key, cache_get_json, cache_set_json
from .models import ClipboardTaskPayload

_DEFAULT_TTL_SEC = 60 * 60


def clipboard_ttl_sec() -> int:
    raw = str(os.environ.get("BPMN_TASK_CLIPBOARD_TTL_SEC", "") or "").strip()
    try:
        value = int(raw) if raw else _DEFAULT_TTL_SEC
    except Exception:
        value = _DEFAULT_TTL_SEC
    return max(60, int(value))


def clipboard_key(*, user_id: str, org_id: str) -> str:
    uid = str(user_id or "").strip() or "anonymous"
    oid = str(org_id or "").strip() or "default"
    return f"pm:clipboard:org:{oid}:user:{uid}:bpmn_task:v1"


class ClipboardRedisStore:
    def __init__(self, *, client: Any = None) -> None:
        self._client = client

    def put(self, *, user_id: str, org_id: str, payload: ClipboardTaskPayload) -> bool:
        return bool(
            cache_set_json(
                clipboard_key(user_id=user_id, org_id=org_id),
                payload.model_dump(),
                ttl_sec=clipboard_ttl_sec(),
                client=self._client,
            )
        )

    def get(self, *, user_id: str, org_id: str) -> Optional[dict]:
        payload = cache_get_json(
            clipboard_key(user_id=user_id, org_id=org_id),
            client=self._client,
        )
        return payload if isinstance(payload, dict) else None

    def clear(self, *, user_id: str, org_id: str) -> int:
        return int(
            cache_delete_key(
                clipboard_key(user_id=user_id, org_id=org_id),
                client=self._client,
            )
            or 0
        )
