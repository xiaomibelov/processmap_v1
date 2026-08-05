"""Core-shared pure helpers lifted verbatim from app._legacy_main (PR-5)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from typing import Tuple

__all__ = [
    "_clean_name",
    "_to_epoch_ms",
    "_looks_like_technical_actor_id",
    "_resolve_actor_label_from_user",
    "_redact_notes_preview_message",
    "_ln_tag",
    "_ws_path",
    "_canon_path",
    "_primitive_path_value",
    "_normalize_sequence_key",
]


def _clean_name(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _to_epoch_ms(value: Any) -> int:
    try:
        ts = int(value or 0)
    except Exception:
        ts = 0
    if ts <= 0:
        return 0
    # Storage persists unix seconds; UI metadata expects milliseconds.
    if ts < 10_000_000_000:
        return ts * 1000
    return ts


def _looks_like_technical_actor_id(value: Any) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return False
    if re.fullmatch(r"[0-9a-f]{12,}", text):
        return True
    if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f-]{9,}", text):
        return True
    return False


def _resolve_actor_label_from_user(user: Any, fallback_user_id: str = "") -> str:
    actor = user if isinstance(user, dict) else {}
    for key in ("name", "username", "email", "id"):
        value = str(actor.get(key) or "").strip()
        if value:
            return value
    return str(fallback_user_id or "").strip()


def _redact_notes_preview_message(message: Any, *, api_key: str = "", base_url: str = "") -> str:
    text = str(message or "").strip()
    for secret in (api_key,):
        secret_text = str(secret or "")
        if secret_text:
            text = text.replace(secret_text, "[redacted]")
    if base_url:
        text = text.replace(f"Bearer {base_url}", "Bearer [redacted]")
    return text


def _ln_tag(tag: str) -> str:
    if "}" in str(tag or ""):
        return str(tag).rsplit("}", 1)[-1].lower()
    return str(tag or "").lower()


def _ws_path(*parts: str) -> Path:
    # workspace is mounted to /app/workspace in docker; on host it is ./workspace
    return Path("workspace").joinpath(*parts)


def _canon_path(p: Path) -> str:
    try:
        return str(p.resolve())
    except Exception:
        return str(p)


def _primitive_path_value(value: Any, keys: Tuple[str, ...] = ("value", "key", "code", "tier", "path")) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value or "").strip()
    if isinstance(value, dict):
        for key in keys:
            if key not in value:
                continue
            nested = _primitive_path_value(value.get(key), keys)
            if nested:
                return nested
    return ""


def _normalize_sequence_key(value: Any) -> str:
    raw = _primitive_path_value(
        value,
        ("key", "value", "sequence_key", "sequenceKey", "id"),
    ).lower()
    if not raw:
        return ""
    compact = re.sub(r"\s+", "_", raw)
    compact = re.sub(r"[^a-z0-9_\-]+", "_", compact)
    compact = re.sub(r"_+", "_", compact).strip("_")
    return compact[:64]
