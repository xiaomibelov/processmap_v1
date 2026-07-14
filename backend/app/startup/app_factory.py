from __future__ import annotations

from fastapi import Depends, FastAPI

from .. import _legacy_main
from ..auth import bearer_auth, optional_access_token_payload, seed_admin_user_if_enabled
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
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        dependencies=[Depends(optional_access_token_payload)],
        security=[{bearer_auth.scheme_name: []}],
    )
    register_cors(app, cors_origins=build_cors_origins())
    register_auth_guard(app, public_paths=set(_legacy_main.AUTH_PUBLIC_PATHS))
    register_deprecated_alias_middleware(app)
    register_backend_exception_capture(app)
    mount_static_assets(app)

    for router, tags in ROUTERS:
        effective_tags = list(router.tags) if router.tags else list(tags)
        app.include_router(router, tags=effective_tags)

    register_boot_events(
        app,
        seed_admin=seed_admin_user_if_enabled,
        validate_invite_email_config=_legacy_main._validate_invite_email_config_on_boot,
    )
    return app
