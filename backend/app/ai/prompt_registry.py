from __future__ import annotations

from typing import Any, Dict

from ..storage import (
    activate_ai_prompt_version,
    archive_ai_prompt_version,
    count_ai_prompt_versions,
    create_ai_prompt_draft,
    get_active_ai_prompt_version,
    get_ai_prompt_version,
    list_ai_prompt_versions,
)


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def create_prompt_draft(
    *,
    module_id: str,
    version: str,
    template: str,
    variables_schema: Dict[str, Any] | None = None,
    output_schema: Dict[str, Any] | None = None,
    created_by: str = "",
    scope_level: str = "global",
    scope_id: str = "",
) -> Dict[str, Any]:
    return create_ai_prompt_draft(
        module_id=_as_text(module_id),
        version=_as_text(version),
        template=str(template or ""),
        variables_schema=variables_schema if isinstance(variables_schema, dict) else {},
        output_schema=output_schema if isinstance(output_schema, dict) else {},
        created_by=_as_text(created_by),
        scope_level=_as_text(scope_level) or "global",
        scope_id=_as_text(scope_id),
    )


def list_prompt_versions(
    *,
    module_id: str = "",
    status: str = "",
    scope_level: str = "",
    scope_id: str = "",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    lim = max(1, min(int(limit or 50), 200))
    off = max(0, int(offset or 0))
    common = {
        "module_id": _as_text(module_id) or None,
        "status": _as_text(status) or None,
        "scope_level": _as_text(scope_level) or None,
        "scope_id": _as_text(scope_id) or None,
    }
    total = count_ai_prompt_versions(**common)
    items = list_ai_prompt_versions(**common, limit=lim, offset=off)
    return {
        "ok": True,
        "items": items,
        "count": int(total),
        "page": {"limit": lim, "offset": off, "total": int(total), "has_more": off + len(items) < int(total)},
    }


def get_prompt_detail(prompt_id: str) -> Dict[str, Any] | None:
    return get_ai_prompt_version(_as_text(prompt_id))


def get_active_prompt(
    *,
    module_id: str,
    scope_level: str = "global",
    scope_id: str = "",
) -> Dict[str, Any] | None:
    return get_active_ai_prompt_version(
        module_id=_as_text(module_id),
        scope_level=_as_text(scope_level) or "global",
        scope_id=_as_text(scope_id),
    )


def activate_prompt_version(prompt_id: str, *, actor_user_id: str = "") -> Dict[str, Any]:
    return activate_ai_prompt_version(_as_text(prompt_id), actor_user_id=_as_text(actor_user_id))


def archive_prompt_version(prompt_id: str, *, actor_user_id: str = "") -> Dict[str, Any]:
    return archive_ai_prompt_version(_as_text(prompt_id), actor_user_id=_as_text(actor_user_id))
