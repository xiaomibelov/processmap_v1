# Agent request flow & caching

Краткая карта: какой фичей (feature) обрабатывается каждый сценарий обращения к
LLM, где лежит промпт, где провайдер, кэшируется ли вызов.

## Feature → сценарий

| Feature | Эндпоинт / действие | Кэш | Примечание |
|---|---|---|---|
| `agent_router` | `POST /api/sessions/{id}/agent/stream` (свободный вопрос) | Да, Redis по `md5(messages)` | AGENT-1/3. Версия v2 с `edit_canvas` активна на prod. |
| `agent_edit` | `POST /api/sessions/{id}/agent/resume` decision=confirm | Нет | Применение плана к canvas. |
| `agent_edit_propose` | `POST /api/sessions/{id}/agent/stream` + selected_step (rename) | Нет | Генерация `confirm_required` карточки. |
| `agent_memory` | История сессии / summary | Нет | Промпт уникален из-за истории. |
| `processman_agent` | legacy/монолитный контур процессов | Нет | by design: история делает промпт уникальным (P1 Phase 5). |
| `schema_assistant` | `POST /api/sessions/{id}/llm/suggest-next\|explain-step\|step-qa` | Да, Redis по digest схемы/вопроса/каталога | LLM3. При `force=1` кэш игнорируется. |

## Кэширование

- Ключ: `pm:cache:llm:{feature}:v1:{digest}`.
- Redis-клиент живёт в том же процессе, что и gateway (монолит или agent-сервис).
- При `LLM_VIA_AGENT_SVC=1` монолит вызывает `/internal/llm/complete_cached`, digest
  пробрасывается до сервисного gateway и бьёт в тот же Redis.
- Cache hit → `cached=true`, `usage = {0, 0}`, запись в `llm_usage` всё равно
  создаётся для наблюдаемости.

## Провайдер

- Цепочка: `org_id` сессии → `org_default` fallback → env (`DEEPSEEK_API_KEY`).
- Подробнее см. `LLM_CONFIG_MAP.md`.
