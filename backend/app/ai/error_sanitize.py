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

GENERIC_LLM_ERROR = "Не удалось получить ответ от ИИ. Попробуйте ещё раз."


def sanitize_llm_error(status: str, error: str) -> str:
    """Вернуть безопасный для пользователя текст ошибки LLM."""
    text = str(error or "")
    if not text:
        return text
    if str(status or "") == "error":
        return GENERIC_LLM_ERROR
    return text
