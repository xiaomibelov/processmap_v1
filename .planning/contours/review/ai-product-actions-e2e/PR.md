# PR — fix/ai-product-actions-llm-gateway

**Название (рус):** Перевод «Действий с продуктом» на единый LLM-шлюз

**Ветка:** `fix/ai-product-actions-llm-gateway`  
**База:** `origin/main` (`2a437a11`)  
**Merge/deploy:** только владелец вручную.

---

## Что исправляет

На `stage.processmap.ru` вкладка AI → «Действия с продуктом» возвращала `AI_PROVIDER_NOT_CONFIGURED`, несмотря на живые провайдеры в админке LLM (`/admin/llm`).

**Root cause:** `POST /api/sessions/{id}/analysis/product-actions/suggest` читал `DEEPSEEK_API_KEY` через `load_llm_settings()` и вызывал DeepSeek напрямую, минуя существующий LLM-шлюз, в котором уже настроены org-scoped провайдеры.

**Решение:** эндпоинт теперь использует тот же `gateway.complete()` / `llm_internal_client.complete()`, что и остальные AI-фичи (`process_analysis`, `schema_assistant` и др.).

---

## Схема resolution для product-actions

```
POST /api/sessions/{id}/analysis/product-actions/suggest
  → _llm_complete("product_actions_suggest", context, org_id=..., ...)
    → LLM_VIA_AGENT_SVC=1 ? llm_internal_client.complete : gateway.complete
      → gateway:
        1. feature flag из llm_feature_flags (product_actions_suggest)
        2. активный промпт из llm_prompts (product_actions_suggest)
        3. провайдер: effective_providers_with_key(org_id)
           → org-scoped провайдер, если есть и включён
           → иначе org_default
           → иначе env-фолбэк DEEPSEEK_API_KEY (резерв)
        4. вызов LLM + запись llm_usage
```

- Никаких прямых чтений `DEEPSEEK_API_KEY` в коде фичи.
- Модель/провайдер берутся из шлюза (БД), а не из env.
- Execution log по-прежнему пишется в `ai_execution_log` для модуля `ai.product_actions.suggest`.

---

## Изменения

### Backend

- `backend/alembic/versions/029_product_actions_llm_gateway_prompt.py` (new)
  - Сид активного промпта `feature='product_actions_suggest'` (V4-шаблон + placeholder `{input}`).
  - Сид флага фичи `llm_feature_flags` (`enabled=true`, `daily_token_limit=200000`).
- `backend/app/ai/product_actions_suggest.py`
  - Добавлен `parse_product_actions_suggestions(text, max_suggestions)` — единая точка парсинга ответа шлюза.
  - `suggest_product_actions_with_deepseek` оставлен для обратной совместимости, но роутер больше не вызывает его.
- `backend/app/routers/product_actions_ai.py`
  - Константа `FEATURE = "product_actions_suggest"`.
  - `_llm_complete(...)` — роутинг на `llm_internal_client` при `LLM_VIA_AGENT_SVC=1`, иначе `gateway.complete`.
  - `_call_product_actions_llm(...)` — вызов шлюза и парсинг; типизированные исключения для `no_provider` / `rate_limited` / `error`.
  - Убран `load_llm_settings()` / прямое чтение env для `suggest` и `batch-suggest`.
  - Ошибки шлюза мапятся на существующие коды: `AI_PROVIDER_NOT_CONFIGURED`, `AI_RATE_LIMIT_EXCEEDED`, `AI_PROVIDER_ERROR`, `AI_RESPONSE_PARSE_ERROR`.
  - В ответе и execution log используются `provider_id`, `model`, `prompt_version` из результата шлюза.

### Тесты

- `backend/tests/test_product_actions_ai_suggest.py`
  - Все моки `suggest_product_actions_with_deepseek` заменены на мок `_llm_complete`.
  - Добавлен тест `test_gateway_no_provider_returns_ai_provider_not_configured`.
  - Добавлен тест `test_gateway_ok_json_text_returns_suggestions`.
  - Сохранены регрессионные тесты на mutation guard, batch draft, bulk.
- `backend/tests/test_llm_provider_resolution.py` (new)
  - 4 unit-теста на `llm_store.effective_providers_with_key`: org > org_default > пусто; disabled/пустой ключ исключаются.
- `backend/tests/test_llm_gateway.py`
  - Добавлен тест `test_effective_providers_with_key_prefers_org_then_org_default` (следует существующему sandbox-паттерну Postgres).

---

## Регрессия

| Элемент | Было | Стало | Функционал затронут? |
|---|---|---|---|
| Другие AI-фичи (`process_analysis`, `schema_assistant`, AI-вопросы) | используют шлюз | без изменений | нет |
| `settings.load_llm_settings()` / `save_llm_settings()` | используются product-actions | product-actions больше не читает их | нет (функции остались для legacy/admin) |
| Контракт ответа `/analysis/product-actions/suggest` | `ok/error/message/...` | без изменений | нет |
| AI execution log | пишется | пишется (provider/model из шлюза) | нет |

---

## Как проверено

- `python -m pytest backend/tests/test_product_actions_ai_suggest.py` — **28 passed** (Docker `python:3.11-slim`, sqlite).
- `python -m pytest backend/tests/test_llm_provider_resolution.py` — **4 passed**.
- `backend/tests/test_llm_gateway.py` — добавлен тест по образцу существующих sandbox-тестов; прогон требует Postgres (`E2_TEST_DATABASE_URL`).

---

## Что остаётся после merge

1. Владелец мержит PR.
2. Авто-деплой stage применяет миграцию `029` и обновляет код.
3. curl-проверка: `POST /api/sessions/05e59e4aea/analysis/product-actions/suggest` не возвращает `AI_PROVIDER_NOT_CONFIGURED`.
4. Playwright E2E по 7 шагам (требуются stage-креды).

---

## Секреты

- Ни ключи, ни endpoint'ы не хардкодятся в коде/миграциях.
- В отчётах и diagnostics ключи маскируются через `_safe_error_message`.
