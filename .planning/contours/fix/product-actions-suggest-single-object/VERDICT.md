# VERDICT: fix/product-actions-suggest-single-object

## Что чинилось

`AI_RESPONSE_PARSE_ERROR` в модуле `ai.product_actions.suggest`, когда LLM возвращает одно действие как верхнеуровневый JSON-объект вместо массива `suggestions`.

## Фиксы

| Код | Что | Где | Статус |
|-----|-----|-----|--------|
| F1 | Парсер теперь распознаёт одиночный dict-предложение и оборачивает в список | `backend/app/ai/product_actions_suggest.py` | ✅ |
| F2 | Golden-фикстура + регрессионные тесты: одиночный объект, неполные теги, произвольный dict | `backend/tests/test_product_actions_suggest_v2.py`, `backend/tests/fixtures/llm_suggest/single_object_raw.txt` | ✅ |
| F3 | Промпт v4: инструкция «всегда возвращай массив suggestions» + few-shot с одним элементом | `backend/app/ai/product_actions_suggest.py` (`PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE_V4`) | ✅ |
| F4 | Диагностика `selected_step` scope: UI не передаёт `selected_step_id`, `steps_count: 98` — весь процесс | `VERDICT.md` (запись), не фикс | ✅ |

## Проверки

### Unit-тесты парсера (без БД)

```bash
docker compose -p fix-suggest-test run --rm --no-deps api \
  sh -c "cd /app && PYTHONPATH=backend python -m unittest tests.test_product_actions_suggest_v2 -v"
```

Результат: **18/18 OK**.

### Интеграционные тесты роутера

`tests.test_product_actions_ai_suggest` требует инициализированной Postgres-схемы. В локальном контейнере без подготовленной тестовой БД тесты падают на `setUp` (`no such table: org_memberships` / `email_exists`) — это **pre-existing проблема тестового окружения**, не регрессия изменений. Целевой парсер покрыт unit-тестами выше.

### Agent-service

Дублирующего парсера в `backend/services/agent/` нет. `backend/services/agent/runners/action_runners.py` проксирует `suggest-next` в монолит (`/api/sessions/{id}/llm/suggest-next`), поэтому фикс монолитного парсера покрывает и agent-путь. Синхронизация не требуется.

## F4 — selected_step scope (out of scope)

- `frontend/src/features/process/analysis/ProductActionSuggestionsPanel.jsx:487` вызывает `apiSuggestProductActions(sessionId, { options: { max_suggestions: 20 } })` без `selected_step_id`.
- `frontend/src/lib/api.js:663-685` пробрасывает payload как есть.
- В бэкенде `product_actions_ai.py:728` `selected_step_requested` определяется по `options.selected_step_id` / `selected_step_label` / `selected_step_bpmn_id`.
- В diagnostics ошибки `scope: "selected_step"` — захардкоженная строка (`product_actions_ai.py:997`), не реальный параметр запроса.
- Вывод: selected-step-фильтрация сейчас не используется в UI; `steps_count: 98` означает, что в LLM ушёл весь процесс. Это отдельный контур оптимизации (контекст/токены/latency) — требует отдельного approve.

## Что осталось за пользователем

1. Review и merge PR.
2. Проверка на stage: сессия `240167273b`, выбрать шаг → suggest → предложения рендерятся (включая случай ровно одного действия).
3. Suggest на всей сессии (scope=all) — не сломался.
4. Execution log: вызов `ok: true`, `provider=deepseek-main`.

## Артефакты

- `ROOT_CAUSE.md` — этот файл рядом.
- `evidence/single_object_raw.txt` — захваченный raw.
- `PR.md` — описание PR.
