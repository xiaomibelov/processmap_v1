# Release checklist — agent/LLM contours

Чек-лист для релиза любого контура, затрагивающего agent/LLM (AGENT-1/3,
schema_assistant, LLM gateway).

## Перед деплоем

- [ ] Образы собираются в CI на каждый PR; деплой на хост только переносит/перезапускает уже доказанное.
- [ ] Миграции накатаны (`alembic upgrade head` или через docker compose).
- [ ] Промпты активированы в `/admin/llm`:
  - [ ] `agent_router` v2 (с `edit_canvas`) → `active`;
  - [ ] `processman_agent` v2 → `active`;
  - [ ] `agent_memory` → `active`;
  - [ ] `agent_edit` → `active`;
  - [ ] `agent_edit_propose` → `active`.
- [ ] Провайдер создан в `/admin/llm`:
  - [ ] enabled = true;
  - [ ] API key введён (UI показывает `has_api_key: true`);
  - [ ] model/base_url корректны.
- [ ] `GET /api/llm/status` возвращает `configured: true` (с учётом
      `org_default` fallback).
- [ ] Транспорт agent-сервиса:
  - [ ] `AGENT_SVC_URL` и `AGENT_SVC_INTERNAL_TOKEN` настроены в монолите;
  - [ ] `LLM_VIA_AGENT_SVC=1` (если prod/stage работает через сервис);
  - [ ] `GET /health` agent-сервиса отвечает 200.
- [ ] Redis доступен и не пустой `REDIS_URL` (или дефолтные настройки compose).

## После деплоя

- [ ] Свободный вопрос в агенте — SSE стримит осмысленный ответ.
- [ ] `llm_usage` за сессию приёмки: реальные токены, `model` соответствует
      провайдеру.
- [ ] Повторный свободный вопрос — `cached=true`, 0 токенов (для router).
- [ ] «Объяснить шаг» работает.
- [ ] V2-оверлеи (`confirm_required` и др.) отображаются.
- [ ] Ручные правки canvas работают.

## Специфика релиза `fix/agent-acceptance`

- [ ] Баг A: rename → reject/confirm без `ForeignKeyViolation`.
- [ ] Баг B: org без своего ключа использует `org_default` fallback.
- [ ] Баг C: `schema_assistant` повторный запрос — `cached=true`.
- [ ] Протокол приёмки заполнен: `AGENT_ACCEPTANCE_FIXES.md`.

Если какой-то пункт невозможно выполнить через UI/API — зафиксировать gap в
PR, не расширять scope без approve владельца.
