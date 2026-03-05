from __future__ import annotations

from ._shared import build_router


def _is_session_path(path: str) -> bool:
    src = str(path or "")
    if src.startswith("/api/projects/{project_id}/sessions"):
        return True
    if not src.startswith("/api/sessions"):
        return False
    return "/reports" not in src


router = build_router(_is_session_path)
