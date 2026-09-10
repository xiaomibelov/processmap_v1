"""Санитизация LLM-ошибок на границе пользовательского ответа.

КОПИЯ backend/app/ai/error_sanitize.py — осознанное дублирование: agent-сервис
является отдельным deploy-boundary (свой Dockerfile/requirements), импорт
монолитного пакета app.* запрещён тестом tests/test_no_monolith_imports.py.
Правки вносить в оба файла синхронно.

См. докстрип оригинала: S1 (llm-agent-audit-v1) — URL upstream-роутера не должен
утекать в пользовательский ответ; детали остаются в логах/телеметрии/llm_usage.
"""
from __future__ import annotations

GENERIC_LLM_ERROR = "Не удалось получить ответ от ИИ. Попробуйте ещё раз."


def sanitize_llm_error(status: str, error: str) -> str:
    """Вернуть безопасный для пользователя текст ошибки LLM."""
    text = str(error or "")
    if not text:
        return text
    if str(status or "") == "error":
        return GENERIC_LLM_ERROR
    return text
