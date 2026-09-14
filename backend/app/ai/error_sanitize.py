"""Санитизация LLM-ошибок на границе пользовательского ответа.

S1 (аудит llm-agent-audit-v1): текст исключения провайдера утекал в тело ответа
чата любому авторизованному пользователю — requests.HTTPError тащит
'403 Client Error: Forbidden for url: https://<internal-host>/<router-path>'.

Куда сохраняются детали сбоя:
- логи — сырой текст пишется через logger.warning в ветках полного отказа
  цепочки (оба gateway), в stream-ветках memory/chat и ai_questions /
  session-title questions (exc_info=True);
- телеметрия — llm_usage пишет только status="error" (без текста, как и раньше);
- ai_execution_log (ai/questions) хранит error_message без изменений —
  это админская диагностика в БД, не пользовательский ответ.

Контракт НЕ меняется: HTTP-статусы как были (200 + ok=false), формат
'[status] …' / кнопка «Повторить» фронта сохраняются. Заменяется только текст
ошибки со status="error" на человекочитаемый generic. Прочие статусы
(disabled / rate_limited / no_provider / bad_request …) формируются внутри
gateway без инфра-деталей и пробрасываются без изменений.
"""
from __future__ import annotations

import json as _json
from typing import Any

import requests

GENERIC_LLM_ERROR = "Не удалось получить ответ от ИИ. Попробуйте ещё раз."


def sanitize_llm_error(status: str, error: str) -> str:
    """Вернуть безопасный для пользователя текст ошибки LLM."""
    text = str(error or "")
    if not text:
        return text
    if str(status or "") == "error":
        return GENERIC_LLM_ERROR
    return text


def classify_llm_error(exc: Any) -> str:
    """Классифицировать сырой сбой LLM-провайдера в sanitized error_class.

    M-2 (аудит llm-agent-audit-v1): failure-reason провайдерской цепочки был
    невидим админам без серверных логов. Теперь класс сбоя пропагируется в
    diagnostics ответа и ai_execution_log. Класс выводится ТОЛЬКО из
    безопасных признаков (HTTP-статус ответа, тип исключения, маркерные слова
    в тексте ошибки); URL, заголовки, ключ и тело ответа провайдера
    НИКОГДА не включаются в класс. Чистая функция — легко тестируется.
    """
    if exc is None:
        return "unknown"
    text = str(exc)
    response = getattr(exc, "response", None)
    # Тело ответа провайдера участвует в классификации только по маркерным
    # словам; само тело в класс не попадает (S1).
    body = str(getattr(response, "text", "") or "") if response is not None else ""
    lowered = (text + " " + body).lower()
    if "budget" in lowered:
        return "budget_exceeded"
    if isinstance(exc, (requests.exceptions.Timeout, TimeoutError)):
        return "timeout"
    if isinstance(exc, requests.exceptions.ConnectionError):
        return "connection"
    if isinstance(exc, _json.JSONDecodeError):
        return "parse_error"
    status_code = getattr(response, "status_code", None)
    if status_code == 403:
        return "403_auth"
    if isinstance(status_code, int) and 500 <= status_code <= 599:
        return "http_5xx"
    if "no provider" in lowered or "no enabled" in lowered:
        return "no_provider"
    if "parse" in lowered or "invalid json" in lowered or "jsondecode" in lowered:
        return "parse_error"
    return "unknown"
