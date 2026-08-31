# PR — fix/stage-alembic-032-seed-v1

## Что закрывает

Цепочка дефектов аудита `stage-verify-agent-wave-a-v1` (F1, F4, F7):

- `llm_models` пуст на stage → `pricing` отсутствует → `cost_usd` не заполняется →
  `resolve_model_for_feature` уходит в conservative fallback `primary`
  (claude-opus-4-6) вместо `cheap` (deepseek-chat).
- Экономия T5 (60.7%) не работает.

## Изменения

| Файл | Что изменено |
|------|--------------|
| `backend/alembic/versions/032_agent_model_class_and_cost.py` | Сделан idempotent: `deepseek-chat` сидируется через `INSERT ... ON CONFLICT (id) DO UPDATE`; deepseek seed-провайдер включается только при непустом `api_key`. |
| `backend/app/migration_state.py` | `ALEMBIC_HEAD = "033"` (ребейз на свежий `origin/main`, где уже есть миграция 033). |
| `backend/services/agent/memory/chat.py` | `_usage_out` и streaming `final_usage` теперь возвращают `cost_usd`. |
| `backend/services/agent/gateway/gateway.py` | `complete_cached` возвращает `cost_usd=0.0` для cache-hit. |
| `backend/app/ai/llm_store.py` | `record_usage` принимает `cost_usd`; `usage_aggregate` суммирует `cost_usd` в items/totals. |
| `backend/tests/test_migration_bootstrap_resilience.py` | Ожидания head подняты до `033`; добавлен `test_032_seeds_models_and_pricing`; stub-таблицы RAG для миграции 023. |
| `backend/tests/test_admin_llm_api.py` | `PROVIDER_SHAPE` дополнен `capabilities`; `USAGE_ITEM_SHAPE`/`USAGE_TOTALS_SHAPE` дополнены `cost_usd`. |

## Что НЕ менялось

- Логика `resolve_model*` / `resolve_model_for_feature`.
- Монолитный endpoint `backend/app/agent/chat.py`.
- Prod / stage runtime конфигурация.

## Проверка

- `backend/tests/test_migration_bootstrap_resilience.py` — **5 passed**.
- `backend/services/agent/tests/` — **133 passed, 1 skipped, 1 failed**.
  - Fail: `test_measurement_baseline.py::test_baseline_measurement` (вне контура, требует `AGENT_ROUTING_MEASUREMENT=before`).
- `backend/tests/test_admin_llm_api.py` — 17 passed, 2 failed.
  - Fail локальные только из-за dev-БД на `031` (нет колонок `cost_usd` / `capabilities`).
  - После применения миграций 032+033 на целевой БД должны стать зелёными.

DB-proof на изолированном temp PostgreSQL (`localhost:5434`) после `db_bootstrap.py`:

```text
            id             | model_class | cost_prompt_1k_usd | cost_completion_1k_usd | is_default
---------------------------+-------------+--------------------+------------------------+------------
 llmmodel_deepseek_chat    | cheap       |           0.000500 |               0.002000 | f
 llmmodel_opus_4_6_primary | primary     |           0.015000 |               0.075000 | t
```

## Условие merge / cross-contour

`origin/main` уже содержит миграцию `033` из контура
`fix/structured-fact-qa-stage-v1`. Ветка `fix/stage-alembic-032-seed-v1`
ребейзнута на свежий `origin/main`, и `ALEMBIC_HEAD` поднят до `"033"`.

**Если этот PR вмержится раньше контура `fix/structured-fact-qa-stage-v1`,
контур №3 при своём ребейзе обязан поднять `ALEMBIC_HEAD` до `"033"`**
(если он ещё не сделал этого). В текущем `origin/main` значение уже
`"033"`, поэтому конфликта нет.

## После merge / deploy на stage (ops)

1. Применить миграции `032` и `033` на stage-БД.
2. Убедиться, что `llmprov_deepseek_seed` имеет непустой `api_key`
   (миграция 032 включает провайдер только при непустом ключе).
3. Обязательно прогнать `backend/tests/test_admin_llm_api.py` против stage-БД
   — 2 локальных failure должны стать зелёными.
4. Smoke с доказательством по `llm_usage`:
   - `schema_overview` / `smalltalk` / `doc_qa` (с RAG) → `cheap` + ненулевой `cost_usd`;
   - `suggest_next` / `edit_canvas` → `primary`.

Это и есть критерий закрытия дефектов №1, 4, 7 аудита `stage-verify`.
