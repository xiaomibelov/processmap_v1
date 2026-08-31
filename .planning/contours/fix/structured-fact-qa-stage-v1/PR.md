# Draft PR — fix/structured-fact-qa-stage-v1

**Заголовок:** fix(agent): router prompt v3 с интентом structured_fact_qa + cheap routing

**Ветка:** `fix/structured-fact-qa-stage-v1`

**Base:** `main`

---

## Что починено

На stage роутер агента не возвращал интент `structured_fact_qa` для вопросов о свойствах, операциях и терминах — они деградировали к `node_qa`/`smalltalk`.

Корень: в `llm_prompts` активен `agent_router` v2 (миграция 025), в списке интентов нет `structured_fact_qa`. Код (`backend/services/agent/memory/chat.py`) intent уже поддерживает, поэтому фикс — обновление prompt-версии в БД + cheap model class для фактовой ветки.

## Изменения

- `backend/alembic/versions/033_agent_router_structured_fact_qa_prompt.py` — миграция 033:
  - архивирует текущий активный `agent_router` prompt;
  - добавляет `llmprompt_agent_router_v3` (`status='active'`, `model_class='cheap'`, `max_tokens=200`) со списком интентов, включающим `structured_fact_qa` и примерами вопросов.
- `backend/scripts/db_bootstrap.py` — в `LINEAR` и `MARKERS` добавлена ревизия 033.
- `backend/services/agent/memory/chat.py` — `_run_structured_fact_qa_branch` и `_run_structured_fact_qa_branch_stream` теперь вызывают LLM с `model_class='cheap'`.
- `backend/services/agent/tests/test_intent_router.py` — регрессионные тесты нормализации и классификации `structured_fact_qa`.
- `backend/services/agent/tests/test_branches.py` — end-to-end тест: «какие свойства у задачи» → `action="structured_fact_qa"`, `complete(..., model_class="cheap")`.

## Как проверить

1. Поднять стек локально или применить миграции на stage:
   ```bash
   alembic -c backend/alembic.ini upgrade head
   ```
2. Убедиться, что активный router prompt — v3:
   ```sql
   SELECT id, version, status FROM llm_prompts
   WHERE feature='agent_router' ORDER BY version DESC;
   ```
3. Задать вопрос в сессии:
   ```bash
   curl -X POST /api/sessions/{sid}/agent/chat \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"message":"какие свойства у задачи"}'
   ```
   Ожидается: `"action": "structured_fact_qa"`, ответ из RAG.
4. В `llm_usage` для `processman_agent` вызова фиксации должна быть `model_class='cheap'`.

## Тесты

```bash
cd backend/services/agent
python -m pytest tests/test_intent_router.py tests/test_branches.py tests/test_resolve_model_class.py -v
# 14 passed
```

Полный набор agent-сервиса: `133 passed, 1 skipped, 1 failed`. Единственный failure — `tests/test_measurement_baseline.py::test_baseline_measurement`, pre-existing и не связан с этим контуром (несовместимость мока `PromptBuilder.build` с kwarg `conversation_summary`).

## Риски

- Требует проиндексированных dictionary-корпусов (`property_dictionary`, `operation_catalog`, `glossary`) из контура `rag-dictionaries-coverage-v1`. Без них ветка упадёт в free-answer.
- Миграция меняет активный production prompt; применять сначала на stage.

## Чек-лист

- [x] Минимальные изменения в рамках контура.
- [x] Регрессионные тесты добавлены.
- [x] Alembic head корректен (`033`).
- [x] `db_bootstrap.py` обновлён.
- [ ] Review approve.
- [ ] Merge в `main` только после approve.
- [ ] Stage verify.
