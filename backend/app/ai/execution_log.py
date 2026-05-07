from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, Optional

from ..storage import append_ai_execution_log, count_ai_execution_log, list_ai_execution_log


AI_EXECUTION_STATUSES = {"queued", "running", "success", "error", "cancelled"}

DEFAULT_AI_RATE_LIMITS: Dict[str, Dict[str, int]] = {
    "default": {"window_sec": 3600, "max_executions": 60},
    "ai.path_report": {"window_sec": 3600, "max_executions": 20},
    "ai.product_actions.suggest": {"window_sec": 3600, "max_executions": 10},
}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_status(status: Any) -> str:
    value = _as_text(status).lower()
    return value if value in AI_EXECUTION_STATUSES else "queued"


def normalize_ai_scope(scope: Optional[Dict[str, Any]] = None, **overrides: Any) -> Dict[str, str]:
    raw = scope if isinstance(scope, dict) else {}
    return {
        "org_id": _as_text(overrides.get("org_id", raw.get("org_id"))),
        "workspace_id": _as_text(overrides.get("workspace_id", raw.get("workspace_id"))),
        "project_id": _as_text(overrides.get("project_id", raw.get("project_id"))),
        "session_id": _as_text(overrides.get("session_id", raw.get("session_id"))),
    }


def hash_ai_input(input_payload: Any) -> str:
    if input_payload is None:
        return ""
    try:
        canonical = json.dumps(input_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        canonical = str(input_payload)
    return hashlib.sha256(canonical.encode("utf-8", errors="replace")).hexdigest()


def record_ai_execution(
    *,
    module_id: str,
    actor_user_id: str = "",
    scope: Optional[Dict[str, Any]] = None,
    provider: str = "deepseek",
    model: str = "deepseek-chat",
    prompt_id: str = "",
    prompt_version: str = "",
    status: str = "queued",
    input_payload: Any = None,
    input_hash: str = "",
    output_summary: str = "",
    usage: Optional[Dict[str, Any]] = None,
    latency_ms: int = 0,
    error_code: str = "",
    error_message: str = "",
    execution_id: str = "",
    created_at: Optional[int] = None,
    finished_at: Optional[int] = None,
) -> Dict[str, Any]:
    normalized_scope = normalize_ai_scope(scope)
    safe_input_hash = _as_text(input_hash) or hash_ai_input(input_payload)
    return append_ai_execution_log(
        execution_id=execution_id or None,
        module_id=_as_text(module_id),
        actor_user_id=_as_text(actor_user_id),
        org_id=normalized_scope["org_id"],
        workspace_id=normalized_scope["workspace_id"],
        project_id=normalized_scope["project_id"],
        session_id=normalized_scope["session_id"],
        provider=_as_text(provider),
        model=_as_text(model),
        prompt_id=_as_text(prompt_id),
        prompt_version=_as_text(prompt_version),
        status=_normalize_status(status),
        input_hash=safe_input_hash,
        output_summary=_as_text(output_summary),
        usage=usage if isinstance(usage, dict) else {},
        latency_ms=max(0, int(latency_ms or 0)),
        error_code=_as_text(error_code),
        error_message=_as_text(error_message),
        created_at=created_at,
        finished_at=finished_at,
    )


def list_ai_executions(
    *,
    org_id: str = "",
    module_id: str = "",
    status: str = "",
    actor_user_id: str = "",
    workspace_id: str = "",
    project_id: str = "",
    session_id: str = "",
    created_from: int = 0,
    created_to: int = 0,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    lim = max(1, min(int(limit or 50), 200))
    off = max(0, int(offset or 0))
    common = {
        "org_id": _as_text(org_id),
        "module_id": _as_text(module_id) or None,
        "status": _normalize_status(status) if _as_text(status) else None,
        "actor_user_id": _as_text(actor_user_id) or None,
        "workspace_id": _as_text(workspace_id) or None,
        "project_id": _as_text(project_id) or None,
        "session_id": _as_text(session_id) or None,
        "created_from": int(created_from or 0) or None,
        "created_to": int(created_to or 0) or None,
    }
    total = count_ai_execution_log(**common)
    items = list_ai_execution_log(**common, limit=lim, offset=off)
    return {
        "ok": True,
        "items": items,
        "count": int(total),
        "page": {"limit": lim, "offset": off, "total": int(total), "has_more": off + len(items) < int(total)},
    }


def check_ai_rate_limit(
    *,
    module_id: str,
    actor_user_id: str,
    scope: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Dict[str, int]]] = None,
    now_ts: Optional[int] = None,
) -> Dict[str, Any]:
    limits = config if isinstance(config, dict) else DEFAULT_AI_RATE_LIMITS
    module_cfg = limits.get(_as_text(module_id)) or limits.get("default") or {}
    window_sec = max(1, int(module_cfg.get("window_sec") or 3600))
    max_executions = max(1, int(module_cfg.get("max_executions") or 60))
    now_value = int(now_ts or 0) or int(time.time())
    start_ts = max(0, now_value - window_sec)
    normalized_scope = normalize_ai_scope(scope)
    matched = count_ai_execution_log(
        org_id=normalized_scope["org_id"],
        module_id=_as_text(module_id) or None,
        actor_user_id=_as_text(actor_user_id) or None,
        workspace_id=normalized_scope["workspace_id"] or None,
        project_id=normalized_scope["project_id"] or None,
        session_id=normalized_scope["session_id"] or None,
        created_from=start_ts,
        created_to=now_value,
    )
    remaining = max(0, max_executions - matched)
    allowed = matched < max_executions
    return {
        "ok": bool(allowed),
        "allowed": bool(allowed),
        "module_id": _as_text(module_id),
        "actor_user_id": _as_text(actor_user_id),
        "scope": normalized_scope,
        "window_sec": window_sec,
        "limit": max_executions,
        "matched": int(matched),
        "remaining": remaining,
        "reset_at": now_value + window_sec,
        "reason": "" if allowed else "ai_rate_limit_exceeded",
    }
