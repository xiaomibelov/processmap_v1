from __future__ import annotations

import os

from fastapi import APIRouter, status

router = APIRouter(tags=["health"])


@router.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> dict:
    return {"status": "ok", "service": "agent"}


@router.get("/version", status_code=status.HTTP_200_OK)
def version_check() -> dict:
    """Return build metadata so deploy freshness can be verified at runtime."""
    return {
        "service": "agent",
        "build_id": os.environ.get("BUILD_ID", ""),
        "build_time": os.environ.get("BUILD_TIME", ""),
        "build_branch": os.environ.get("BUILD_BRANCH", ""),
        "build_env": os.environ.get("BUILD_ENV", ""),
        "git_commit": os.environ.get("GIT_COMMIT", os.environ.get("BUILD_ID", "")),
    }
