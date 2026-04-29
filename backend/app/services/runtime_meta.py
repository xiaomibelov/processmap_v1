from __future__ import annotations

import os
from typing import Optional


def _clean_env(value: object) -> Optional[str]:
    text = str(value or "").strip()
    return text or None


def get_runtime_build_meta() -> dict:
    app_version = _clean_env(os.getenv("PROCESSMAP_APP_VERSION")) or "unknown"
    git_sha = _clean_env(os.getenv("PROCESSMAP_GIT_SHA"))
    build_id = (
        _clean_env(os.getenv("PROCESSMAP_BUILD_ID"))
        or git_sha
        or app_version
        or "dev"
    )
    min_supported = (
        _clean_env(os.getenv("PROCESSMAP_MIN_SUPPORTED_FRONTEND_VERSION"))
        or app_version
        or None
    )
    return {
        "app_version": app_version,
        "build_id": build_id,
        "git_sha": git_sha,
        "min_supported_frontend_version": min_supported,
    }
