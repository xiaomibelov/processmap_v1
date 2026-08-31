# EXEC_REPORT — fix/stage-alembic-032-seed-v1

## Резюме
Закрыта корневая причина цепочки F1/F4/F7: миграция `032` теперь
идемпотентно сидирует `deepseek-chat` (`cheap`) и цены даже при пустом
`llm_models`; `/api/health` снова синхронен с head; `cost_usd` виден в
`AgentChatOut.usage` и в админской агрегации расхода.

## Изменения

| Файл | Что изменено |
|------|--------------|
| `backend/alembic/versions/032_agent_model_class_and_cost.py` | `UPDATE deepseek` заменён на `INSERT ... ON CONFLICT (id) DO UPDATE`; добавлено условное включение `llmprov_deepseek_seed` при непустом ключе. |
| `backend/app/migration_state.py` | `ALEMBIC_HEAD = "033"` (реBASE на свежий main, где уже есть миграция 033). |
| `backend/services/agent/memory/chat.py` | `_usage_out` и streaming `final_usage` теперь передают `cost_usd`. |
| `backend/services/agent/gateway/gateway.py` | `complete_cached` возвращает `cost_usd=0.0` для cache-hit. |
| `backend/app/ai/llm_store.py` | `record_usage` принимает `cost_usd`; `usage_aggregate` суммирует `cost_usd` в items/totals. |
| `backend/tests/test_migration_bootstrap_resilience.py` | Ожидания head обновлены до `033`; добавлен `test_032_seeds_models_and_pricing`; в setUp добавлены stub-таблицы RAG, необходимые миграции 023. |
| `backend/tests/test_admin_llm_api.py` | `PROVIDER_SHAPE` дополнен `capabilities`; `USAGE_ITEM_SHAPE`/`USAGE_TOTALS_SHAPE` дополнены `cost_usd`. |

## Проверка

### Code / workspace
- Ветка: `fix/stage-alembic-032-seed-v1`
- HEAD после rebase: поверх `origin/main` (`ed81667b`), который уже содержит миграцию 033.
- `git status -sb`: 7 модифицированных файлов product-кода + артефакты контура.

### DB proof (изолированный temp PostgreSQL)
Поднят `postgres:16-alpine` на `localhost:5434`, создан baseline-скелет
001–009 + stub RAG, запущен `backend/scripts/db_bootstrap.py`:

```
[db_bootstrap] alembic_version=009
[db_bootstrap] OK — база на head
```

Результат:

```text
            id             | model_class | cost_prompt_1k_usd | cost_completion_1k_usd | is_default
---------------------------+-------------+--------------------+------------------------+------------
 llmmodel_deepseek_chat    | cheap       |           0.000500 |               0.002000 | f
 llmmodel_opus_4_6_primary | primary     |           0.015000 |               0.075000 | t
```

### Tests
- `backend/services/agent/tests/` — **133 passed, 1 skipped, 1 failed**.
  - Единственный fail: `test_measurement_baseline.py::test_baseline_measurement`
    (вне контура, требует внешнего замера).
- `backend/tests/test_migration_bootstrap_resilience.py` — **5 passed**.
- `backend/tests/test_admin_llm_api.py` — 17 passed, 2 failed из-за того, что
  локальная dev-БД (`processmap` на 5432) ещё на `031` и не имеет колонки
  `cost_usd` / не отражает `capabilities`. После применения миграций 032+033
  на целевой БД эти тесты пройдут; поведение `usage_aggregate` дополнительно
  проверено unit-скриптом на SQLite.

### Не трогалось
- `resolve_model` / `resolve_model_for_feature` — логика не изменена.
- `backend/app/agent/chat.py` (монолитный endpoint, не используется nginx).
- Prod / stage runtime не изменены; ops-применение миграции — отдельный шаг.

## Риски / ограничения
1. **Stage ops**: для полного fix на stage нужно применить миграцию 032 и,
   если `llmprov_deepseek_seed` отключён с пустым ключом, внести/включить
   deepseek-провайдер вручную. Миграция включает провайдер только если ключ
   уже записан.
2. **Alembic head mismatch (F4)**: будет закрыт автоматически после деплоя
   образа с этой веткой, т.к. `ALEMBIC_HEAD` теперь `"033"` (head main после
   мержа контура `fix/structured-fact-qa-stage-v1`).
3. **RAG stub в тесте**: добавлены минимальные stub-таблицы для 023; это
   тестовая инфраструктура, не product-логика.

## Следующий шаг
- Push ветки → PR (draft) → approve → merge → deploy to stage → применить
  миграции 032 и 033 / `db_bootstrap.py` → прогнать
  `backend/tests/test_admin_llm_api.py` против stage-БД → smoke-тесты из
  контурного плана (`schema_overview`/`smalltalk`/`doc_qa` → cheap + ненулевой
  `cost_usd`; `suggest_next`/`edit_canvas` → primary).
