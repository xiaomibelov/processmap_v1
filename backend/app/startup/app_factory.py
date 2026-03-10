from __future__ import annotations

from fastapi import FastAPI

from .. import _legacy_main
from ..auth import seed_admin_user_if_enabled
from ..routers import ROUTERS
from .boot_checks import register_boot_events
from .middleware import (
    build_cors_origins,
    register_auth_guard,
    register_cors,
    register_deprecated_alias_middleware,
)
from .static_mounts import mount_static_assets


def create_app() -> FastAPI:
    app = FastAPI(title="Food Process Copilot MVP")
    register_cors(app, cors_origins=build_cors_origins())
    register_auth_guard(app, public_paths=set(_legacy_main.AUTH_PUBLIC_PATHS))
    register_deprecated_alias_middleware(app)
    mount_static_assets(app)

    for router in ROUTERS:
        app.include_router(router)

    register_boot_events(
        app,
        seed_admin=seed_admin_user_if_enabled,
        validate_invite_email_config=_legacy_main._validate_invite_email_config_on_boot,
    )
    return app
