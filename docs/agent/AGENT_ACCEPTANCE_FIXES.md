# AGENT acceptance fixes — приёмочный протокол

Контур: `fix/agent-acceptance`  
Цель: закрыть три дефекта из e2e-приёмки AGENT-1/3 на processmap.ru.

## Исправления в коде

### Баг A — FK violation при rename
- **Файл:** `backend/services/agent/memory/chat.py`
- **Что изменилось:** `_persist_assistant_turn` возвращает реальный
  `assistant_turn_id`; `create_pending_edit` получает именно его, а не
  фиктивный `stream_id`.
- **Тесты:** `backend/services/agent/tests/test_edit_stream.py`
  - `test_stream_edit_canvas_creates_pending_edit_with_real_turn_id`
  - `test_stream_edit_reject_updates_status`
  - `test_stream_edit_confirm_applies_plan`

### Баг B — «невидимый ключ» / org-скоуп провайдеров
- **Файлы:**
  - `backend/app/ai/llm_store.py` — `effective_providers_with_key`
  - `backend/services/agent/gateway/llm_store.py` — `effective_providers_with_key`
  - `backend/app/ai/gateway.py` — `_provider_chain`, fallback-флаг
  - `backend/services/agent/gateway/gateway.py` — `_provider_chain`, fallback-флаг
  - `backend/app/routers/llm_status.py` — `effective_provider`
- **Что изменилось:**
  - Цепочка провайдеров: org сессии → `org_default` fallback → env.
  - `/api/llm/status` показывает `effective_provider` и его `source`.
- **Тесты:**
  - `backend/tests/test_llm_gateway.py::test_org_default_fallback_for_org_without_provider`
  - `backend/tests/test_llm_status_api.py::test_configured_true_org_fallback_from_org_default`
  - `backend/services/agent/tests/test_gateway.py`

### Баг C — кэш только у роутера
- **Файлы:**
  - `backend/tests/test_llm_schema_assistant.py`
  - `backend/services/agent/tests/test_internal_llm.py`
  - `docs/agent/REQUEST_FLOW.md`
- **Что изменилось:**
  - Добавлен тест, что повторный `suggest-next` на неизменной схеме даёт
    `cached=true`.
  - Добавлен тест, что `cache_digest` доезжает до сервисного gateway.
  - Зафиксировано: `processman_agent` не кэшируется by design.

## Приёмка на приёмочном окружении

Проверяемый критерий → артефакт → вердикт.

| Критерий | Артефакт | Вердикт | Дата |
|---|---|---|---|
| Свободный вопрос → SSE осмысленный ответ | Тело SSE, `llm_usage.model=deepseek-chat` | TBD | |
| «Объяснить шаг» — регрессия | Ответ агента | TBD | |
| Router cache — повторный вопрос → cached=true | `llm_usage.cached=true`, 0 токенов | TBD | |
| Rename → карточка confirm → Reject | `agent_pending_edits.status=rejected` | TBD | |
| Rename → карточка confirm → Confirm | Шаг переименован в canvas | TBD | |
| Org без ключа + org_default с ключом → ответ есть | `llm_usage` с provider_id org_default | TBD | |
| V2-оверлеи отображаются | Скриншот | TBD | |
| Canvas-правки руками работают | Ручной smoke-test | TBD | |

## Известные ограничения

- `test_status_404_foreign_user` падает на локальной dev-БД (возвращает 200
  вместо 404). Это предсуществующая особенность/баг, не в scope данного контура.
- Прямые INSERT в `llm_providers` на боевой/приёмочной БД запрещены;
  провайдер и промпты настраиваются только через `/admin/llm`.
