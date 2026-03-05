from __future__ import annotations

from ._shared import build_router

_SYSTEM_EXACT = {
    "/",
    "/favicon.ico",
    "/health",
    "/api/glossary/add",
    "/api/llm/session-title/questions",
    "/api/meta",
}
_SYSTEM_PREFIXES = (
    "/api/auth/",
    "/api/settings/",
)


def _is_system_path(path: str) -> bool:
    src = str(path or "")
    if src in _SYSTEM_EXACT:
        return True
    return any(src.startswith(prefix) for prefix in _SYSTEM_PREFIXES)


router = build_router(_is_system_path)
