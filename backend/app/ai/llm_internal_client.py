"""AGENT-SVC Phase 1 — internal LLM-клиент монолита.

Когда LLM_VIA_AGENT_SVC=1/true, LLM1/LLM2/LLM3 вызывают agent-сервис вместо
прямого gateway:
  POST {AGENT_SVC_URL}/internal/llm/complete
  POST {AGENT_SVC_URL}/internal/llm/complete_cached
Контракт ответа идентичен gateway.complete()/complete_cached():
  {ok, status, text, usage, provider_id, model, fallback, cached, latency_ms}.

Как и gateway, исключения наружу не бросаются: недоступность сервиса,
таймаут, не-200 → честный ok=False, status="error".
"""
from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

DEFAULT_TIMEOUT_SEC = 30  # как gateway.DEFAULT_TIMEOUT_SEC


def enabled() -> bool:
    """LLM_VIA_AGENT_SVC=1/true → LLM1/2/3 ходят через agent-сервис (дефолт выкл)."""
    return str(os.environ.get("LLM_VIA_AGENT_SVC") or "").strip().lower() in {"1", "true"}


def _base_url() -> str:
    return str(os.environ.get("AGENT_SVC_URL") or "").strip().rstrip("/")


def _error_result(error: str, started: float) -> Dict[str, Any]:
    return {
        "ok": False,
        "status": "error",
        "error": error,
        "latency_ms": int((time.monotonic() - started) * 1000),
    }


def _post(path: str, body: Dict[str, Any], timeout_sec: int) -> Dict[str, Any]:
    started = time.monotonic()
    base = _base_url()
    if not base:
        return _error_result("AGENT_SVC_URL is not set", started)
    # lazy import: httpx пока dev-зависимость (requirements-dev.txt), прод-пин — Phase 3.
    import httpx

    # запас над timeout_sec: внутри сервиса gateway делает до 2 попыток на провайдера.
    http_timeout = max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)) * 2 + 10
    # AGENT-SVC: internal endpoints сервиса требуют общий секрет (X-Internal-Token).
    headers = {"X-Internal-Token": str(os.environ.get("AGENT_SVC_INTERNAL_TOKEN") or "").strip()}
    try:
        resp = httpx.post(f"{base}{path}", json=body, headers=headers, timeout=http_timeout)
    except Exception as exc:
        return _error_result(f"agent-svc unreachable: {exc.__class__.__name__}: {exc}", started)
    if resp.status_code != 200:
        return _error_result(f"agent-svc HTTP {resp.status_code}", started)
    try:
        data = resp.json()
    except Exception as exc:
        return _error_result(f"agent-svc invalid json: {exc.__class__.__name__}", started)
    if not isinstance(data, dict):
        return _error_result("agent-svc invalid_json_root", started)
    return data


def complete(
    feature: str,
    payload: Any = None,
    *,
    user_id: str = "",
    project_id: str = "",
    session_id: str = "",
    org_id: str = "org_default",
    max_tokens: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """POST /internal/llm/complete — сигнатура и контракт как у gateway.complete()."""
    body = {
        "feature": feature,
        "payload": payload,
        "user_id": user_id,
        "project_id": project_id,
        "session_id": session_id,
        "org_id": org_id,
        "max_tokens": max_tokens,
        "timeout_sec": timeout_sec,
    }
    return _post("/internal/llm/complete", body, timeout_sec)


def complete_cached(
    feature: str,
    cache_digest: str,
    payload: Any = None,
    *,
    cache_client: Any = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """POST /internal/llm/complete_cached — как gateway.complete_cached().

    cache_client монолита не пробрасывается: Redis-кэш живёт на стороне сервиса
    (те же ключи pm:cache:llm:*).
    """
    timeout_sec = int(kwargs.pop("timeout_sec", DEFAULT_TIMEOUT_SEC) or DEFAULT_TIMEOUT_SEC)
    body = {
        "feature": feature,
        "cache_digest": cache_digest,
        "payload": payload,
        **kwargs,
    }
    return _post("/internal/llm/complete_cached", body, timeout_sec)
