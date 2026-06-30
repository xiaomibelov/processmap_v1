from __future__ import annotations

import os


def _bool(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


class Config:
    """Service-specific configuration read from environment."""

    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL",
        "sqlite:///./notifications.db",
    )
    JWT_SECRET: str = os.environ.get("JWT_SECRET", "dev-secret")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_ISSUER: str | None = os.environ.get("JWT_ISSUER")

    HOST: str = os.environ.get("NOTIFICATIONS_HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("NOTIFICATIONS_PORT", "8000"))
    LOG_LEVEL: str = os.environ.get("NOTIFICATIONS_LOG_LEVEL", "info")

    # Development / test flags
    DEBUG: bool = _bool(os.environ.get("NOTIFICATIONS_DEBUG"))
    SKIP_AUTH: bool = _bool(os.environ.get("NOTIFICATIONS_SKIP_AUTH"))

    # Feature flags for future endpoints
    ENABLE_NOTIFICATIONS_ENDPOINT: bool = _bool(
        os.environ.get("NOTIFICATIONS_ENABLE_NOTIFICATIONS_ENDPOINT", "true")
    )
    ENABLE_SYSTEM_EVENTS_ENDPOINT: bool = _bool(
        os.environ.get("NOTIFICATIONS_ENABLE_SYSTEM_EVENTS_ENDPOINT", "true")
    )


config = Config()
