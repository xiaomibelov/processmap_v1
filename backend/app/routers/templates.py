from __future__ import annotations

from ._shared import build_router


def _is_template_path(path: str) -> bool:
    return str(path or "").startswith("/api/templates")


router = build_router(_is_template_path)
