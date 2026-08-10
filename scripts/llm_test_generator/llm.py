"""LLM-бэкенд генератора: вызов через СУЩЕСТВУЮЩИЙ LLM-модуль проекта.

Основной путь — ``app.ai.deepseek_questions._deepseek_chat_request`` (sync,
OpenAI-compatible chat/completions, retry с backoff, usage в ответе).
Модель там захардкожена ("deepseek-chat"), поэтому при нестандартной модели
используется адаптированная копия той же функции с параметром ``model``
(помечено в коде). Никаких прямых внешних API-клиентов.

Конфигурация: env ``DEEPSEEK_API_KEY`` / ``DEEPSEEK_BASE_URL``
(через ``app.settings.load_llm_settings``), CLI-оверрайды --api-key/--base-url/--model.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

DEFAULT_MODEL = "deepseek-chat"


class LLMConfig:
    def __init__(self, api_key: str = "", base_url: str = "", model: str = ""):
        from app.settings import load_llm_settings  # проектный конфиг (env + override-файл)

        cfg = load_llm_settings()
        self.api_key = api_key or cfg.get("api_key") or ""
        self.base_url = (base_url or cfg.get("base_url") or "https://api.deepseek.com").rstrip("/")
        self.model = model or os.environ.get("LLM_TEST_GENERATOR_MODEL", "") or DEFAULT_MODEL

    def available(self) -> bool:
        return bool(self.api_key)


class LLMUsage:
    """Суммарный учёт токенов по всем вызовам генератора."""

    def __init__(self) -> None:
        self.calls = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.model = ""

    def add(self, usage: Optional[Dict[str, Any]], model: str) -> None:
        self.calls += 1
        self.model = model
        if usage:
            self.prompt_tokens += int(usage.get("prompt_tokens") or 0)
            self.completion_tokens += int(usage.get("completion_tokens") or 0)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "calls": self.calls,
            "model": self.model,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
        }


def _chat_request_with_model(
    *,
    api_key: str,
    base_url: str,
    model: str,
    messages: List[Dict[str, str]],
    temperature: float = 0.2,
    timeout: int = 120,
    max_tokens: Optional[int] = 16000,
    max_attempts: int = 3,
    retry_backoff_sec: float = 0.8,
) -> Dict[str, Any]:
    """Адаптация app/ai/deepseek_questions.py:_deepseek_chat_request (+ параметр model).

    Используется только когда нужна модель ≠ дефолтной проектной; логика
    (endpoint, retry, формат) идентична проектной.
    """
    import requests

    url = f"{base_url}/v1/chat/completions"
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=timeout)
            if response.status_code == 200:
                return response.json()
            if response.status_code in {408, 409, 425, 429} or response.status_code >= 500:
                last_error = RuntimeError(f"LLM HTTP {response.status_code}: {response.text[:300]}")
            else:
                raise RuntimeError(f"LLM HTTP {response.status_code}: {response.text[:500]}")
        except Exception as exc:  # сетевые/таймауты — ретраим
            last_error = exc
        if attempt < max_attempts:
            time.sleep(retry_backoff_sec * attempt)
    raise RuntimeError(f"LLM request failed after {max_attempts} attempts: {last_error}")


def chat(
    cfg: LLMConfig,
    messages: List[Dict[str, str]],
    *,
    max_tokens: int = 16000,
    timeout: int = 240,
) -> Dict[str, Any]:
    """Возвращает {"text": str, "usage": dict, "model": str}. Бросает RuntimeError.

    max_tokens=16000: reasoning-модели (deepseek-v4-flash) расходуют бюджет на
    reasoning_tokens — при 6000 content приходил пустым (баг первого батча).
    """
    if not cfg.available():
        raise RuntimeError(
            "LLM недоступен: задайте DEEPSEEK_API_KEY (env/.env) или --api-key "
            "(+ --base-url/--model при не-DeepSeek провайдере)"
        )
    if cfg.model == DEFAULT_MODEL:
        # Основной путь — проектный клиент как есть.
        from app.ai.deepseek_questions import _deepseek_chat_request

        data = _deepseek_chat_request(
            api_key=cfg.api_key,
            base_url=cfg.base_url,
            messages=messages,
            temperature=0.2,
            timeout=timeout,
            max_tokens=max_tokens,
        )
    else:
        data = _chat_request_with_model(
            api_key=cfg.api_key,
            base_url=cfg.base_url,
            model=cfg.model,
            messages=messages,
            timeout=timeout,
            max_tokens=max_tokens,
        )
    choices = data.get("choices") or []
    text = str((choices[0] or {}).get("message", {}).get("content") or "") if choices else ""
    return {"text": text, "usage": data.get("usage") or {}, "model": str(data.get("model") or cfg.model)}
