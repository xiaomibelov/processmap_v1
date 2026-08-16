"""ProcessMap Agent Service — автономный FastAPI-сервис (AGENT-SVC Phase 2).

Замыкание LLM-gateway (gateway/) + PROCESSMAN chat (memory/, runners/) +
internal LLM API (routers/internal_llm.py). Миграций НЕТ — схему накатывает
монолит. backend.app.* не импортируется (жёсткое правило, guard-тест в tests/).

Запуск: uvicorn main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI

from routers import agent_chat, health, internal_llm

logging.basicConfig(
    level=logging.INFO if str(os.environ.get("AGENT_LOG_LEVEL") or "info").lower() != "debug" else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("agent")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ProcessMap Agent Service",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
    )

    app.include_router(health.router)
    app.include_router(agent_chat.router)
    app.include_router(internal_llm.router)

    @app.on_event("startup")
    def _startup() -> None:
        logger.info("agent service starting up")

    @app.on_event("shutdown")
    def _shutdown() -> None:
        logger.info("agent service shutting down")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("AGENT_PORT", "8000")))
