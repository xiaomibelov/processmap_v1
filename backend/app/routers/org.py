from __future__ import annotations

from ._shared import build_router


def _is_org_path(path: str) -> bool:
    src = str(path or "")
    if src == "/api/orgs":
        return False
    if src == "/api/orgs/{org_id}/members":
        return False
    if src == "/api/enterprise/workspace":
        return True
    if src == "/api/invites/accept":
        return False
    if "/invites" in src:
        return False
    if src.startswith("/api/orgs/") and "/reports" in src:
        return False
    return src.startswith("/api/orgs")


router = build_router(_is_org_path)
