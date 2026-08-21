from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .db import ensure_schema
from .routers import error_events, health

logging.basicConfig(
    level=logging.INFO if config.LOG_LEVEL.lower() != "debug" else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("notifications")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ProcessMap Notifications Service",
        version="0.1.0",
        docs_url="/docs" if config.DEBUG else None,
        redoc_url="/redoc" if config.DEBUG else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(error_events.router)

    @app.on_event("startup")
    def _startup() -> None:
        logger.info("notifications service starting up")
        try:
            ensure_schema()
            logger.info("schema ensured")
        except Exception as exc:
            logger.exception("failed to ensure schema: %s", exc)
            raise

    @app.on_event("shutdown")
    def _shutdown() -> None:
        logger.info("notifications service shutting down")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=config.HOST, port=config.PORT)
