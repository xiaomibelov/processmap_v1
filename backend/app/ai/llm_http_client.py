"""LLM0 — HTTP-клиент DeepSeek с retry/backoff (chat/completions).

Выделено из deepseek_questions.py в рамках AGENT-SVC Phase 1 без изменения
логики: монолитный экземпляр retry-хелпера живёт здесь, сервисная копия
создаётся в Phase 2 (services/agent/llm/llm_http_client.py).
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import requests


def _is_retryable_deepseek_error(exc: Exception) -> bool:
    if isinstance(exc, (requests.exceptions.Timeout, requests.exceptions.ConnectionError, requests.exceptions.ChunkedEncodingError)):
        return True
    if isinstance(exc, requests.exceptions.HTTPError):
        status = int(getattr(getattr(exc, "response", None), "status_code", 0) or 0)
        if status in {408, 409, 425, 429, 500, 502, 503, 504}:
            return True
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    retry_tokens = (
        "response ended prematurely",
        "incomplete read",
        "connection aborted",
        "connection reset",
        "timed out",
        "temporarily unavailable",
        "remote disconnected",
    )
    return any(tok in msg for tok in retry_tokens)


def _deepseek_chat_request(
    *,
    api_key: str,
    base_url: str,
    messages: List[Dict[str, str]],
    temperature: float,
    timeout: int,
    max_tokens: Optional[int] = None,
    max_attempts: int = 3,
    retry_backoff_sec: float = 0.8,
    retry_on_timeout: bool = True,
    model: str = "deepseek-chat",
    response_format: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "model": str(model or "deepseek-chat"),
        "messages": messages,
        "temperature": float(temperature),
    }
    mt = int(max_tokens or 0)
    if mt > 0:
        payload["max_tokens"] = mt
    if response_format:
        payload["response_format"] = response_format
    url = f"{base_url}/v1/chat/completions"
    attempts = max(1, int(max_attempts or 1))
    backoff = max(0.0, float(retry_backoff_sec or 0.0))
    last_exc: Optional[Exception] = None
    read_timeout = max(10, int(timeout or 0))
    connect_timeout = max(3, min(15, read_timeout))
    for attempt in range(1, attempts + 1):
        try:
            r = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                },
                json=payload,
                timeout=(connect_timeout, read_timeout),
            )
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict):
                return data
            raise ValueError("invalid_json_root")
        except Exception as exc:
            last_exc = exc
            is_timeout = isinstance(exc, (requests.exceptions.Timeout, requests.exceptions.ConnectionError))
            if is_timeout and not retry_on_timeout:
                raise
            if attempt >= attempts or not _is_retryable_deepseek_error(exc):
                raise
            sleep_for = backoff * attempt
            if sleep_for > 0:
                time.sleep(sleep_for)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("deepseek request failed")
