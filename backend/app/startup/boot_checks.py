from __future__ import annotations

import logging
from typing import Callable

from fastapi import FastAPI

from ..redis_client import runtime_status
from ..storage import get_db_runtime_info, startup_db_check

_logger = logging.getLogger(__name__)


def register_boot_events(
    app: FastAPI,
    *,
    seed_admin: Callable[[], None],
    validate_invite_email_config: Callable[[], None],
) -> None:
    @app.on_event("startup")
    def _startup_bootstrap() -> None:
        seed_admin()
        validate_invite_email_config()

        info = get_db_runtime_info()
        _logger.info("DB runtime config: %s", info)
        redis = runtime_status(force_ping=True)
        _logger.info(
            "Redis runtime config: mode=%s state=%s configured=%s required=%s reason=%s",
            redis.get("mode"),
            redis.get("state"),
            redis.get("configured"),
            redis.get("required"),
            redis.get("reason"),
        )
        if redis.get("mode") == "ERROR":
            _logger.error("Redis misconfigured: fallback mode active (incident)")
        elif redis.get("mode") == "FALLBACK":
            _logger.warning("Redis unavailable: degraded fallback mode active")
        if not bool(info.get("startup_check")):
            return
        checked = startup_db_check()
        _logger.info("DB startup check passed: backend=%s", checked.get("backend"))
