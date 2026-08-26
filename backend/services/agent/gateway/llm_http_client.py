"""HTTP-клиент DeepSeek с retry/backoff (chat/completions).

КОПИЯ backend/app/ai/llm_http_client.py (выделено из deepseek_questions.py в
AGENT-SVC Phase 1). Сервис не импортирует backend.app.* — копия, не импорт
(жёсткое правило без исключений). Дрейф копий контролируется CI diff-check (Phase 3).
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Generator, List, Optional

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


def _deepseek_chat_request_stream(
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
) -> Generator[Dict[str, Any], None, None]:
    """Streaming chat/completions request.

    Yields parsed chunks (OpenAI streaming format) OR a single non-streaming
    response dict if the provider returns a regular JSON body.  Caller must
    distinguish `choices[0].delta.content` (stream) from
    `choices[0].message.content` (fallback).
    """
    payload = {
        "model": str(model or "deepseek-chat"),
        "messages": messages,
        "temperature": float(temperature),
        "stream": True,
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
            with requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                },
                json=payload,
                stream=True,
                timeout=(connect_timeout, read_timeout),
            ) as r:
                r.raise_for_status()
                content_type = str(r.headers.get("Content-Type", "")).lower()
                # Non-streaming fallback: provider ignored stream=true.
                if "text/event-stream" not in content_type:
                    data = r.json()
                    if isinstance(data, dict):
                        yield data
                        return
                    raise ValueError("invalid_json_root")
                for line in r.iter_lines():
                    if not line:
                        continue
                    text = line.decode("utf-8", errors="replace") if isinstance(line, bytes) else str(line)
                    text = text.strip()
                    if text == "data: [DONE]" or text == "[DONE]":
                        return
                    if text.startswith("data: "):
                        text = text[len("data: "):]
                    if not text:
                        continue
                    try:
                        chunk = json.loads(text)
                    except Exception:
                        continue
                    if isinstance(chunk, dict):
                        yield chunk
                return
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
    raise RuntimeError("deepseek stream request failed")
