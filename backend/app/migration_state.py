"""F3: наблюдаемость состояния миграций (инцидент 04.08 — degraded-старт
entrypoint был слепой зоной: обнаружили по 500 фичи, а не по факту провала).

Экспонирует {alembic_version, head, ok} для /api/health. ok=false означает:
схема БД старше кода (degraded-старт entrypoint) — мониторинг обязан алертить.

ALEMBIC_HEAD держим синхронным с backend/scripts/db_bootstrap.py LINEAR[-1]
(проверяется тестом test_migration_bootstrap_resilience.py).
"""
from __future__ import annotations

import os
import time
from typing import Any, Dict

ALEMBIC_HEAD = "028"
_CACHE_TTL_SEC = 60.0

_cache: Dict[str, Any] = {"ts": 0.0, "payload": None}


def get_migration_state(*, force: bool = False) -> Dict[str, Any]:
    now = time.monotonic()
    if not force and _cache["payload"] is not None and (now - _cache["ts"]) < _CACHE_TTL_SEC:
        return dict(_cache["payload"])
    payload: Dict[str, Any] = {"alembic_version": "", "head": ALEMBIC_HEAD, "ok": None}
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        # SQLite/дев-режим без PG: состояние неизвестно — НЕ деградируем статус.
        payload["error"] = "no_database_url"
    else:
        try:
            import psycopg

            with psycopg.connect(url, connect_timeout=3) as con:
                row = con.execute(
                    "SELECT version_num FROM alembic_version LIMIT 1"
                ).fetchone()
            version = str(row[0]) if row else ""
            payload["alembic_version"] = version
            payload["ok"] = version == ALEMBIC_HEAD
            if not version:
                payload["ok"] = None
                payload["error"] = "alembic_version_empty"
        except Exception as exc:  # таблицы нет / БД недоступна / не PG
            payload["error"] = str(getattr(exc, "message", None) or exc)[:200]
    _cache["ts"] = now
    _cache["payload"] = dict(payload)
    return payload
