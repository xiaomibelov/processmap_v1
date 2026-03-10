from __future__ import annotations

from ._shared import build_router


def _is_project_path(path: str) -> bool:
    src = str(path or "")
    if not src.startswith("/api/projects"):
        return False
    return "/sessions" not in src


router = build_router(_is_project_path)
