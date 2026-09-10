# Контур: fix/llm-gateway-error-sanitization

Находка S1 аудита `llm-agent-audit-v1`: внутренний URL upstream-роутера утекал в тело
ответа чата любому авторизованному пользователю
(`{"error":"deepseek: HTTPError: 403 Client Error: Forbidden for url: https://vvchat.vkusvill.ru/red-mad-router/v1/chat/completions"}`).

## Патч

Единый helper `sanitize_llm_error(status, error)`: для `status="error"` текст заменяется
на generic `«Не удалось получить ответ от ИИ. Попробуйте ещё раз.»`, прочие статусы
(`disabled` / `rate_limited` / `no_provider` / `bad_request` …) пробрасываются без изменений
(они формируются внутри gateway без инфра-деталей). Детали сбоя — в логах (см. ниже);
телеметрия `llm_usage` пишет только `status` — как и раньше.

- Монолит: `backend/app/ai/error_sanitize.py`.
- Agent-сервис: `backend/services/agent/gateway/error_sanitize.py` — **осознанная копия**:
  сервис отдельный deploy-boundary (свой Dockerfile/requirements), импорт `app.*` запрещён
  тестом `tests/test_no_monolith_imports.py`. Правки вносить в оба файла синхронно.

Детали сбоя (сырой текст ошибки) сохраняются в логах для всех закрытых путей:
`logger.warning` с сырым `last_error` в ветках полного отказа цепочки обоих gateway
(complete и complete_stream), `logger.warning`/​`logger.exception` в stream-ветках
`memory/chat` и `routers/agent_stream`, `logger.warning(exc_info=True)` в `ai_questions`
и `session-title questions`, `logger.warning` в `llm_internal_client`. Телеметрия:
`llm_usage` пишет только `status="error"` (как и раньше, без текста); `ai_execution_log`
(ai/questions) хранит `error_message` без изменений — это админская диагностика в БД.

Контракт НЕ менялся: HTTP-статусы прежние (200 + `ok=false`), формат `[error] …` /
кнопка «Повторить» фронта сохраняются. i18n-словарей в agent-чате нет (существующие
пользовательские тексты захардкожены на русском) — generic-текст на русском, как принято
в этих модулях.

## Правки по REQUEST_CHANGES ревью (R1–R3, 2026-09-10)

- **R1** — `POST /api/sessions/{id}/ai/questions` (прямой вызов DeepSeek, НЕ gateway,
  любой авторизованный пользователь): оба except-блока `ai_questions.py`
  (ветки strict/soft — `:597-607`, node_step/sequential — `:510-520`) санитизируют
  `{"error": …}`; сырой текст — `logger.warning(exc_info=True)`; `error_message` в
  `ai_execution_log` (админская диагностика в БД) без изменений.
- **R2** — `POST /api/llm/session-title/questions` (`_legacy_main.py:3758`, serving через
  system-router `routers/system.py:13`): sanitize + `logger.warning(exc_info=True)`.
- **R3** — сырой `last_error` логируется `logger.warning` в ветках полного отказа цепочки
  обоих gateway (complete + complete_stream); docstring `error_sanitize.py` приведён
  к фактическому поведению; добавлен `logger.warning` в `llm_internal_client`
  (закрытый путь, где детали раньше терялись полностью).

## Инвентаризация путей утечки

### Монолит (backend/app)

| Путь | Что утекало | Статус |
|---|---|---|
| `ai/gateway.py:189` + `:225` (`complete`, полный отказ фолбэк-цепочки) | `last_error = "{provider}: {exc.__class__.__name__}: {exc}"` → `error=last_error`; `requests.HTTPError` содержит `for url: https://host/path` | **Закрыт**: sanitize на возврате результата (`:224`) |
| `agent/chat.py:196,212` (`run_turn` → ответ `/api/sessions/{id}/agent/chat`) | прокидывал `result["error"]` в `AgentChatOut.error` и `message` (`[error] …`) | **Закрыт**: sanitize `error_text` |
| `ai/schema_assistant.py:103-110` (`_not_ok` → LLM3 `suggest-next`/`explain-step`/`step-qa`) | `error` из gateway-result наружу | **Закрыт**: sanitize в `_not_ok` |
| `ai/process_analysis.py:180-187` (LLM1 `/llm/analysis`) | `error` из gateway-result наружу | **Закрыт**: sanitize в ветке non-ok |
| `ai/llm_internal_client.py:31-37` (монолит→agent-svc при `LLM_VIA_AGENT_SVC=1`) | `agent-svc unreachable: {httpx-exc}` / `agent-svc HTTP {code}` | **Закрыт**: sanitize в `_error_result` + raw `logger.warning` (R3) |
| `ai_questions.py:510-520` + `:597-607` (`POST /api/sessions/{id}/ai/questions`, ветки node_step/sequential и strict/soft; прямой вызов DeepSeek, не gateway) | `{"error": "deepseek failed: {e}"`, `e` = HTTPError с `for url: …` | **Закрыт** (R1): sanitize `{"error": …}` + raw `logger.warning(exc_info=True)`; `error_message` в ai_execution_log (админ-диагностика) без изменений |
| `_legacy_main.py:3758` (`POST /api/llm/session-title/questions`, serving через system-router `routers/system.py:13`) | `{"error": "deepseek failed: {e}"` с URL upstream | **Закрыт** (R2): sanitize + raw `logger.warning(exc_info=True)` |
| `routers/admin_llm.py:221-230` (admin «Проверить» провайдера) | `{exc.__class__.__name__}: {exc}` с URL провайдера | **Не закрыт (осознанно)**: endpoint только для платформенного админа; URL в ошибке = его собственный `base_url` провайдера, который админ и так видит в списке провайдеров; админу нужна диагностика (401/403/таймаут) |

### Agent-сервис (backend/services/agent)

| Путь | Что утекало | Статус |
|---|---|---|
| `gateway/gateway.py:204` → `:237` (`complete`, отказ цепочки) | `last_error` с URL upstream | **Закрыт**: sanitize на возврате + raw `logger.warning` (R3) |
| `gateway/gateway.py:453` → `:471` (`complete_stream`, SSE-ветка) | `last_error` с URL upstream в error-событии | **Закрыт**: sanitize в error-событии + raw `logger.warning` (R3) |
| `memory/chat.py:1061-1083` (`_gateway_error_out`: schema_overview / doc_qa / free-answer) | `result["error"]` в `AgentChatOut.error`/`message` | **Закрыт**: sanitize `error_text` |
| `memory/chat.py:1019-1033` (stream, `structured_fact_qa`) | `stream_error["error"]` в SSE error-событие и persisted-turn | **Закрыт**: sanitize (сырой текст остаётся в логах) |
| `memory/chat.py:1305-1322` (stream, free-answer) | `stream_error["error"]` в SSE error-событие; `logger.warning` с сырым текстом сохранён | **Закрыт**: sanitize на выходе |
| `routers/agent_stream.py:79-81` (catch-all SSE) | `{exc.__class__.__name__}: {exc}` при непредвиденном исключении | **Закрыт**: sanitize (полный текст в `logger.exception`) |
| `runners/action_runners.py:29,31,35` (LLM3-прокси к монолиту) | `monolith unreachable: …` / `monolith llm/{action} HTTP {code}` | **Не закрыт — не требуется**: не содержит URL провайдера/роутера; доменные ошибки связности/HTTP монолита |
| `routers/agent_resume.py:97` (`failed to load session: {exc}`) | текст исключения загрузки сессии | **Не закрыт — не требуется**: не LLM-провайдер, httpx-текст без URL |
| `memory/schema_memory.py:243` | — | **Не найдено**: non-ok обрабатывается только `logger.warning(status)`, наружу не идёт |
| `edit/planner.py:133` (error из gateway в meta плана правок) | проброс `result["error"]` | **Закрыт транзитивно**: gateway сервиса теперь возвращает generic |

## Изменённые файлы

См. `git diff --stat` в отчёте / `TESTS.md`.
