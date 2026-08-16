"""HTTP-клиент к монолиту: проекция сессии с пробросом JWT пользователя.

Base URL — env MONOLITH_INTERNAL_URL (дефолт http://api:8000). Все вызовы
сервис→монолит несут Authorization: Bearer <user-jwt> — org-scoped guard'ы
монолита работают без изменений, service-token с обходом авторизации не вводим
(решение владельца, план 0.3/Phase 2).
"""
from __future__ import annotations

import os
from typing import Any, Dict

import httpx

DEFAULT_TIMEOUT_SEC = 30


class MonolithError(Exception):
    """Монолит недоступен или вернул не-200/не-ok — роутер отдаёт честный 502."""


def _base_url() -> str:
    return str(os.environ.get("MONOLITH_INTERNAL_URL") or "http://api:8000").strip().rstrip("/")


def _headers(token: str) -> Dict[str, str]:
    headers = {"Accept": "application/json"}
    if str(token or "").strip():
        headers["Authorization"] = f"Bearer {str(token).strip()}"
    return headers


def get_projection(session_id: str, *, token: str = "", timeout_sec: int = DEFAULT_TIMEOUT_SEC) -> Dict[str, Any]:
    """GET /api/sessions/{id}/agent/projection → {ok, projection, projection_digest, rev}."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/agent/projection"
    try:
        resp = httpx.get(url, headers=_headers(token), timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise MonolithError(f"monolith projection HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith projection invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict) or not data.get("ok"):
        raise MonolithError("monolith projection not ok")
    return data
