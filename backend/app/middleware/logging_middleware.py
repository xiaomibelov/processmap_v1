from __future__ import annotations

import re
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class _ExtrasFormatter(logging.Formatter):
    """Рендерит extra-поля записи (duration_ms, stage_ms, user_id, ...) в конце
    сообщения — стандартный Formatter выводит только %(message)s, поэтому
    числа этапов save-пути в логе не были видны (дефект найден review/
    stage-409-save-validation-v1). Значения repr'ятся; строки — в кавычках."""

    _RESERVED = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = {
            k: v
            for k, v in record.__dict__.items()
            if k not in self._RESERVED and not k.startswith("_")
        }
        if not extras:
            return base
        rendered = " ".join(f"{k}={v!r}" for k, v in sorted(extras.items()))
        return f"{base} | {rendered}"


def _ensure_handler() -> None:
    # uvicorn настраивает только свои логгеры: root без handler'ов глотает
    # app-level INFO (api_request никогда не доходил до stdout). Handler
    # уровня модуля — минимальное изменение, внешнее поведение остальных
    # логгеров не меняется.
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(_ExtrasFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


_ensure_handler()

_BPMN_SAVE_PATH_RE = re.compile(r"^/api/sessions/[^/]+/bpmn$")


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        response = await call_next(request)
        
        duration_ms = (time.time() - start_time) * 1000
        
        # Log requests to process-templates and recipes endpoints
        if request.url.path.startswith("/api/process-templates") or            request.url.path.startswith("/api/recipes"):
            user = getattr(request.state, "user", None)
            user_id = getattr(user, "id", None) if user else None
            user_role = getattr(user, "role", None) if user else None
            
            logger.info(
                "api_request",
                extra={
                    "user_id": user_id,
                    "role": user_role,
                    "endpoint": request.url.path,
                    "method": request.method,
                    "duration_ms": round(duration_ms, 2),
                    "status_code": response.status_code
                }
            )
        elif request.method == "PUT" and _BPMN_SAVE_PATH_RE.match(request.url.path):
            user = getattr(request.state, "user", None)
            user_id = getattr(user, "id", None) if user else None

            extra = {
                "user_id": user_id,
                "endpoint": request.url.path,
                "method": request.method,
                "duration_ms": round(duration_ms, 2),
                "status_code": response.status_code,
            }
            stage_ms = getattr(request.state, "save_stage_ms", None)
            if isinstance(stage_ms, dict):
                extra["stage_ms"] = stage_ms

            logger.info("bpmn_save_request", extra=extra)

        return response
