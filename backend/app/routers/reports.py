from __future__ import annotations

from ._shared import build_router


def _is_report_path(path: str) -> bool:
    src = str(path or "")
    if src.startswith("/api/orgs/") and "/reports" in src:
        return True
    if src.startswith("/api/reports"):
        return not src.endswith("/")
    if src.startswith("/api/sessions/") and "/reports" in src:
        if "/path/" in src:
            return False
        return not src.endswith("/")
    return False


router = build_router(_is_report_path)
