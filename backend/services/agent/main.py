"""ProcessMap Agent Service — автономный FastAPI-сервис (AGENT-SVC Phase 2 + AGENT-1).

Замыкание LLM-gateway (gateway/) + PROCESSMAN chat (memory/, runners/) +
internal LLM API (routers/internal_llm.py) + streaming (routers/agent_stream.py).
Миграций НЕТ — схему накатывает монолит. backend.app.* не импортируется
(жёсткое правило, guard-тест в tests/).

Запуск: uvicorn main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import logging
import os
import threading
import time

from fastapi import FastAPI

from memory.schema_memory import run_memory_worker_once
from routers import agent_chat, agent_stream, health, internal_llm

logging.basicConfig(
    level=logging.INFO if str(os.environ.get("AGENT_LOG_LEVEL") or "info").lower() != "debug" else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("agent")

_worker_stop_event: threading.Event | None = None
_worker_thread: threading.Thread | None = None


def _memory_worker_loop(stop_event: threading.Event) -> None:
    """Background schema-memory worker: in-process thread, graceful shutdown."""
    while not stop_event.is_set():
        try:
            processed = run_memory_worker_once(stop_event=stop_event, timeout_sec=5.0)
        except Exception as exc:
            logger.warning("memory worker loop error: %s", exc)
            processed = False
        if not processed and not stop_event.is_set():
            time.sleep(0.5)


def create_app() -> FastAPI:
    app = FastAPI(
        title="ProcessMap Agent Service",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
    )

    app.include_router(health.router)
    app.include_router(agent_chat.router)
    app.include_router(agent_stream.router)
    app.include_router(internal_llm.router)

    @app.on_event("startup")
    def _startup() -> None:
        global _worker_stop_event, _worker_thread
        logger.info("agent service starting up")
        _worker_stop_event = threading.Event()
        _worker_thread = threading.Thread(
            target=_memory_worker_loop,
            args=(_worker_stop_event,),
            name="agent-memory-worker",
            daemon=True,
        )
        _worker_thread.start()
        logger.info("agent memory worker started")

    @app.on_event("shutdown")
    def _shutdown() -> None:
        global _worker_stop_event, _worker_thread
        logger.info("agent service shutting down")
        if _worker_stop_event is not None:
            _worker_stop_event.set()
        if _worker_thread is not None and _worker_thread.is_alive():
            _worker_thread.join(timeout=2.0)
        logger.info("agent memory worker stopped")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("AGENT_PORT", "8000")))
