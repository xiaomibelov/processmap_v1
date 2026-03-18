from __future__ import annotations

from typing import Any, Dict, Set

from fastapi import HTTPException


SESSION_STATUS_ORDER = ("draft", "in_progress", "review", "ready", "archived")
SESSION_STATUS_SET = set(SESSION_STATUS_ORDER)

# Manual workflow transitions.
# `archived` is reversible so operators can reopen sessions without forced data rewrites.
SESSION_STATUS_TRANSITIONS: Dict[str, Set[str]] = {
    "draft": {"draft", "in_progress", "archived"},
    "in_progress": {"draft", "in_progress", "review", "ready", "archived"},
    "review": {"in_progress", "review", "ready", "archived"},
    "ready": {"in_progress", "review", "ready", "archived"},
    "archived": set(SESSION_STATUS_ORDER),
}

_SESSION_STATUS_ALIASES = {
    "draft": "draft",
    "in_work": "in_progress",
    "inprogress": "in_progress",
    "in_progress": "in_progress",
    "review": "review",
    "on_review": "review",
    "ready": "ready",
    "done": "ready",
    "archive": "archived",
    "archived": "archived",
}


def normalize_session_status(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    normalized = _SESSION_STATUS_ALIASES.get(value, value)
    return normalized if normalized in SESSION_STATUS_SET else ""


def validate_session_status_transition(
    current_raw: Any,
    next_raw: Any,
    *,
    can_edit: bool,
    can_archive: bool,
) -> str:
    current_status = normalize_session_status(current_raw) or "draft"
    next_status = normalize_session_status(next_raw)
    if not next_status:
        raise HTTPException(status_code=422, detail="invalid status")
    if not can_edit:
        raise HTTPException(status_code=403, detail="forbidden")
    allowed = set(SESSION_STATUS_TRANSITIONS.get(current_status) or {current_status})
    if next_status not in allowed:
        raise HTTPException(status_code=409, detail="invalid status transition")
    if next_status == "archived" and not can_archive:
        raise HTTPException(status_code=403, detail="forbidden")
    return next_status
