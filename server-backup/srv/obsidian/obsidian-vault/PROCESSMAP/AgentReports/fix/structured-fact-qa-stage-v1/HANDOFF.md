# fix/structured-fact-qa-stage-v1

**Статус:** готово к review  
**Агент:** Canvas Agent (Kimi)  
**Ветка:** `fix/structured-fact-qa-stage-v1`  
**Baseline:** origin/main @ `b43f41cc`  
**Связано:** [[stage-verify-agent-wave-a-v1|audit defect F2]], [[rag-dictionaries-coverage-v1|feature PLAN]]

## Что сделано

- Доказано, что код на `origin/main` уже содержит `structured_fact_qa` в `VALID_INTENTS` и ветку `_run_structured_fact_qa_branch`.
- Доказано, что на stage активен router prompt v2 без `structured_fact_qa` → роутер физически не может вернуть нужный intent.
- Создана миграция `033_agent_router_structured_fact_qa_prompt.py`:
  - архивирует активный `agent_router`;
  - добавляет v3 active с интентом `structured_fact_qa` и примерами.
- Обновлён `db_bootstrap.py` (`LINEAR` + marker `033`).
- В `backend/services/agent/memory/chat.py` фактовая ветка теперь вызывает LLM с `model_class='cheap'`.
- Добавлены регрессионные тесты:
  - `test_intent_router.py` — нормализация и классификация `structured_fact_qa`;
  - `test_branches.py` — end-to-end проверка cheap routing.

## Файлы

```
backend/alembic/versions/033_agent_router_structured_fact_qa_prompt.py  (new)
backend/scripts/db_bootstrap.py                                          (modified)
backend/services/agent/memory/chat.py                                    (modified)
backend/services/agent/tests/test_intent_router.py                       (modified)
backend/services/agent/tests/test_branches.py                            (modified)
```

## Тесты

```bash
cd backend/services/agent
python -m pytest tests/test_intent_router.py tests/test_branches.py tests/test_resolve_model_class.py -v
# 14 passed
```

Полный набор: `133 passed, 1 skipped, 1 failed`. Failure — `test_measurement_baseline.py::test_baseline_measurement`, pre-existing, не связан с контуром.

## Применение на stage

1. Убедиться, что `fix/stage-alembic-032-seed-v1` применён.
2. Задеплоить ветку, выполнить `alembic upgrade head`.
3. Проверить активный prompt:
   ```sql
   SELECT id, version, status FROM llm_prompts
   WHERE feature='agent_router' ORDER BY version DESC;
   ```
4. Прогнать: «какие свойства у задачи» → `action="structured_fact_qa"`, ответ из RAG, `llm_usage.model_class='cheap'`.

## Риски

- Без проиндексированных dictionary-корпусов (`rag-dictionaries-coverage-v1`) ветка упадёт в free-answer.
- Миграция меняет активный router prompt — применять сначала на stage, PROD только после verify.

## Следующий шаг

Code review → merge в `main` → stage verify.
