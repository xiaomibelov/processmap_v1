"""Core-shared pure helpers lifted verbatim from app._legacy_main (PR-5)."""
from __future__ import annotations

import json
import os
from ..schemas.legacy_api import NotesExtractionApplyIn
from ..session_status import normalize_session_status as _normalize_session_status_base
from fastapi import Request
from fastapi.responses import JSONResponse
from typing import Any
from typing import Dict
from typing import List
from typing import Optional

__all__ = [
    "_env_bool",
    "_env_int",
    "_coerce_bool",
    "_to_non_negative_int",
    "_as_dict_obj",
    "_as_list_obj",
    "_safe_json_dict",
    "_norm_project_sessions_view",
    "_normalize_session_status",
    "_notes_apply_flag",
    "_llm_question_status_to_interview",
    "_is_retryable_report_generation_error",
    "_request_client_ip",
    "_auth_error_response",
    "_ensure_dict_at_path",
]


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.environ.get(name, "") or "").strip().lower()
    if not raw:
        return bool(default)
    return raw in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = str(os.environ.get(name, "") or "").strip()
    try:
        value = int(raw or default)
    except Exception:
        value = int(default)
    return value


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _to_non_negative_int(value: Any) -> Optional[int]:
    try:
        parsed = int(value)
    except Exception:
        return None
    if parsed < 0:
        return None
    return parsed


def _as_dict_obj(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list_obj(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _safe_json_dict(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(str(raw or "{}"))
    except Exception:
        parsed = {}
    return parsed if isinstance(parsed, dict) else {}


def _norm_project_sessions_view(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"", "full"}:
        return "full"
    if text == "summary":
        return "summary"
    return ""


def _normalize_session_status(raw: Any) -> str:
    return _normalize_session_status_base(raw)


def _notes_apply_flag(inp: NotesExtractionApplyIn, name: str) -> bool:
    value = getattr(inp, name, None)
    if value is not None:
        return bool(value)
    options = getattr(inp, "options", None)
    if isinstance(options, dict) and name in options:
        return bool(options.get(name))
    return False


def _llm_question_status_to_interview(status: Any) -> str:
    s = str(status or "").strip().lower()
    if s == "answered":
        return "подтверждено"
    if s == "open":
        return "уточнить"
    return "неизвестно"


def _is_retryable_report_generation_error(exc: Exception) -> bool:
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    tokens = (
        "response ended prematurely",
        "incomplete read",
        "connection aborted",
        "connection reset",
        "timed out",
        "temporarily unavailable",
        "remote disconnected",
        "chunkedencodingerror",
        "read timed out",
    )
    return any(tok in msg for tok in tokens)


def _request_client_ip(request: Request) -> str:
    headers = getattr(request, "headers", {}) or {}
    forwarded = headers.get("x-forwarded-for") if hasattr(headers, "get") else None
    if forwarded:
        return str(forwarded).split(",")[0].strip()[:120]
    client = getattr(request, "client", None)
    host = getattr(client, "host", "") if client is not None else ""
    if host:
        return str(host)[:120]
    return ""


def _auth_error_response(detail: str = "unauthorized") -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(detail or "unauthorized")})


def _ensure_dict_at_path(root: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
    cur = root
    for k in keys:
        v = cur.get(k)
        if not isinstance(v, dict):
            v = {}
            cur[k] = v
        cur = v
    return cur
