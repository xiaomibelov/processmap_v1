from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping, Optional
from urllib.parse import urlsplit

_MAX_TEXT = 2000
_MAX_ROUTE = 512
_MAX_ID = 128
_MAX_CONTEXT_DEPTH = 6
_MAX_CONTEXT_KEYS = 50
_MAX_CONTEXT_LIST = 20
_MAX_STACK_FRAMES = 8
_TRUNCATED = "...[truncated]"
_REDACTED = "[REDACTED]"
_SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "cookies",
    "set-cookie",
    "x-api-key",
    "api_key",
    "access_token",
    "refresh_token",
    "id_token",
    "bearer",
}
_PAYLOAD_REDACT_KEYS = {
    "body",
    "request_body",
    "response_body",
    "payload",
    "draft_payload",
    "session_payload",
}


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _normalize_text(value: Any, *, max_len: int = _MAX_TEXT) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len] + _TRUNCATED


def _normalize_slug(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    cleaned = []
    for ch in raw:
        if ch.isalnum() or ch in {"_", "-", ".", "/"}:
            cleaned.append(ch)
        elif ch.isspace():
            cleaned.append("_")
    normalized = "".join(cleaned).strip("._/-")
    normalized = normalized.replace("__", "_")
    return normalized[:_MAX_ID]


def _normalize_nullable_id(value: Any) -> str | None:
    text = _normalize_text(value, max_len=_MAX_ID)
    return text or None


def _normalize_route(value: Any, *, fallback: str = "") -> str:
    raw = _normalize_text(value, max_len=_MAX_ROUTE)
    if raw:
        return raw
    fb = _normalize_text(fallback, max_len=_MAX_ROUTE)
    if fb.startswith("http://") or fb.startswith("https://"):
        try:
            split = urlsplit(fb)
            path = str(split.path or "").strip()
            query = str(split.query or "").strip()
            return f"{path}?{query}" if query else path
        except Exception:
            return fb
    return fb


def _normalize_occurred_at(value: Any, *, default_ts: int | None = None) -> int:
    default_ts = default_ts or _now_ts()
    if value is None or value == "":
        return default_ts
    if isinstance(value, (int, float)):
        ts = int(value)
        return ts if ts > 0 else default_ts
    raw = str(value or "").strip()
    if not raw:
        return default_ts
    try:
        ts = int(raw)
        return ts if ts > 0 else default_ts
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp())
    except Exception:
        return default_ts


def _json_size_hint(value: Any) -> int:
    try:
        return len(json.dumps(value, ensure_ascii=False))
    except Exception:
        return len(str(value or ""))


def _redacted_summary(kind: str, value: Any) -> Dict[str, Any]:
    return {"_redacted": kind, "size_hint": _json_size_hint(value)}


def redact_context_json(value: Mapping[str, Any] | None) -> Dict[str, Any]:
    source = dict(value or {})
    sanitized = _sanitize_context_value(source, depth=0, parent_key="context")
    return sanitized if isinstance(sanitized, dict) else {}


def _sanitize_context_value(value: Any, *, depth: int, parent_key: str) -> Any:
    if depth >= _MAX_CONTEXT_DEPTH:
        return _redacted_summary("max_depth", value)
    if isinstance(value, Mapping):
        out: Dict[str, Any] = {}
        for idx, (key, item) in enumerate(value.items()):
            if idx >= _MAX_CONTEXT_KEYS:
                out["_truncated_keys"] = len(value) - _MAX_CONTEXT_KEYS
                break
            key_text = _normalize_text(key, max_len=_MAX_ID) or f"key_{idx}"
            lowered = key_text.lower()
            if lowered in _SENSITIVE_KEYS or lowered.endswith("token"):
                out[key_text] = _REDACTED
                continue
            if lowered == "bpmn_xml" or lowered.endswith("bpmn_xml"):
                out[key_text] = _redacted_summary("bpmn_xml", item)
                continue
            if lowered in _PAYLOAD_REDACT_KEYS or lowered.endswith("_payload") or lowered.endswith("_draft"):
                out[key_text] = _redacted_summary("payload", item)
                continue
            out[key_text] = _sanitize_context_value(item, depth=depth + 1, parent_key=lowered)
        return out
    if isinstance(value, list):
        items = []
        for idx, item in enumerate(value[:_MAX_CONTEXT_LIST]):
            items.append(_sanitize_context_value(item, depth=depth + 1, parent_key=parent_key))
        if len(value) > _MAX_CONTEXT_LIST:
            items.append({"_truncated_items": len(value) - _MAX_CONTEXT_LIST})
        return items
    if isinstance(value, tuple):
        return _sanitize_context_value(list(value), depth=depth, parent_key=parent_key)
    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, str):
            return _normalize_text(value)
        return value
    return _normalize_text(repr(value))


def compute_fingerprint(event: Mapping[str, Any]) -> str:
    basis = {
        "schema_version": int(event.get("schema_version") or 1),
        "source": str(event.get("source") or ""),
        "event_type": str(event.get("event_type") or ""),
        "severity": str(event.get("severity") or ""),
        "message": str(event.get("message") or ""),
        "route": str(event.get("route") or ""),
        "session_id": str(event.get("session_id") or ""),
        "project_id": str(event.get("project_id") or ""),
    }
    raw = json.dumps(basis, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _compact_exception_frames(exc: Exception) -> list[Dict[str, Any]]:
    import traceback

    frames = traceback.extract_tb(exc.__traceback__) if exc.__traceback__ is not None else []
    compact = []
    for frame in list(frames)[-_MAX_STACK_FRAMES:]:
        compact.append(
            {
                "file": _normalize_text(Path(str(frame.filename or "")).name, max_len=160),
                "function": _normalize_text(frame.name, max_len=160),
                "line": int(frame.lineno or 0),
            }
        )
    return compact


def generate_event_id() -> str:
    return f"evt_{uuid.uuid4().hex[:12]}"


def generate_request_id() -> str:
    return f"reqevt_{uuid.uuid4().hex[:12]}"
