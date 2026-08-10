from __future__ import annotations

from fastapi import Depends, FastAPI

from .. import _legacy_main
from ..auth import bearer_auth, optional_access_token_payload, seed_admin_user_if_enabled
from ..middleware.logging_middleware import LoggingMiddleware
from ..routers import ROUTERS
from .boot_checks import register_boot_events
from .middleware import (
    build_cors_origins,
    register_backend_exception_capture,
    register_auth_guard,
    register_cors,
    register_deprecated_alias_middleware,
)
from .static_mounts import mount_static_assets


def create_app() -> FastAPI:
    app = FastAPI(
        title="Food Process Copilot MVP",
        description="ProcessMap API. Use the Authorize button to supply a JWT access token.",
        # Swagger/OpenAPI закрыты по праву уровня админки: встроенные ручки
        # отключены, свои — в routers/api_docs.py на тех же путях с dependency.
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        dependencies=[Depends(optional_access_token_payload)],
        security=[{bearer_auth.scheme_name: []}],
    )
    register_cors(app, cors_origins=build_cors_origins())
    register_auth_guard(app, public_paths=set(_legacy_main.AUTH_PUBLIC_PATHS))
    register_deprecated_alias_middleware(app)
    register_backend_exception_capture(app)
    app.add_middleware(LoggingMiddleware)
    mount_static_assets(app)

    for router, tags in ROUTERS:
        effective_tags = list(router.tags) if router.tags else list(tags)
        app.include_router(router, tags=effective_tags)

    register_boot_events(
        app,
        seed_admin=seed_admin_user_if_enabled,
        validate_invite_email_config=_legacy_main._validate_invite_email_config_on_boot,
    )

    # Системный фикс класса «int-параметр > int64 → OverflowError на sqlite-bind
    # → 500» (contract-fuzz B7-класс, CI #703): любой такой параметр — по сути
    # невалидный ввод, отвечаем 422 в формате HTTPValidationError (задокументирован).
    @app.exception_handler(OverflowError)
    async def _overflow_error_handler(request, exc):  # noqa: ANN001, ANN202
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=422,
            content={
                "detail": [
                    {
                        "loc": ["query"],
                        "msg": "integer parameter out of supported range (int64)",
                        "type": "value_error",
                    }
                ]
            },
        )

    return app
