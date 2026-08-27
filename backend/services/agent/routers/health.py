from __future__ import annotations

import os

from fastapi import APIRouter, status

router = APIRouter(tags=["health"])


@router.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> dict:
    return {"status": "ok", "service": "agent"}


@router.get("/version", status_code=status.HTTP_200_OK)
def version_check() -> dict:
    """Return build metadata so deploy freshness can be verified at runtime.

    Format mirrors backend/app/routers/version.py for consistency across
    the API gateway and the agent service.
    """
    commit = os.environ.get("BUILD_ID", "unknown")
    build_time = os.environ.get("BUILD_TIME", "unknown")
    return {
        # Новые клиенты (boot guard / appUpdate model) читают commit/buildTime.
        "commit": commit,
        "buildTime": build_time,
        # Алиасы sha/builtAt нужны для закешированных index.html.
        "sha": commit,
        "builtAt": build_time,
        "containerId": os.uname().nodename,
        "branch": os.environ.get("BUILD_BRANCH", "unknown"),
        "env": os.environ.get("BUILD_ENV", "prod"),
    }
