# EXEC_REPORT — fix/structured-fact-qa-stage-v1

## 1. Контур

- **Тип:** fix
- **Название:** structured-fact-qa-stage-v1
- **Ветка:** `fix/structured-fact-qa-stage-v1`
- **Worktree:** `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix/structured-fact-qa-stage-v1`
- **Baseline:** origin/main @ `b43f41cc6776370dcb5aab885527ce3b9ae7a1e3`
- **Связанный audit-контур:** `stage-verify-agent-wave-a-v1` (de defect №2)
- **Связанный feature-контур:** `rag-dictionaries-coverage-v1` (добавил intent + ветку в коде)

## 2. Диагностика: (a) vs (b)

| Кандидат | Проверка | Вердикт |
|----------|----------|---------|
| **(a) Код: `VALID_INTENTS` в `chat.py` потерял `structured_fact_qa`** | `git show origin/main:backend/services/agent/memory/chat.py` содержит `VALID_INTENTS = {..., "structured_fact_qa"}` и реализацию `_run_structured_fact_qa_branch`. | **Ложно.** Код на `origin/main` intent поддерживает. |
| **(b) Данные: активный router prompt в `llm_prompts` не содержит новый intent** | Миграции `020` и `025` сидят `agent_router` v1/v2 со списком интентов без `structured_fact_qa`. `gateway` использует `llm_store.get_active_prompt(feature)`, который выбирает только `status='active'`. На stage активен v2, поэтому роутер физически не может вернуть `structured_fact_qa`. | **Истинно.** |

**Корневая причина:** в БД stage активен `llmprompt_agent_router_v2` (миграция 025). Промт разрешает только `node_qa, schema_overview, doc_qa, suggest_next, smalltalk, edit_canvas`. Вопросы о свойствах/операциях/терминах деградируют к `node_qa` или `smalltalk`.

## 3. Фикс

### 3.1 Миграция 033 — новый активный router prompt v3

- **Файл:** `backend/alembic/versions/033_agent_router_structured_fact_qa_prompt.py`
- Добавляет `llmprompt_agent_router_v3` (`agent_router`, версия 3, `status='active'`, `model_class='cheap'`, `max_tokens=200`).
- В список интентов добавлен `structured_fact_qa` с примерами вопросов.
- В `upgrade` все текущие активные промты `agent_router` архивируются; в `downgrade` восстанавливается v2.
- `db_bootstrap.py` обновлён: в `LINEAR` добавлена ревизия `033`, добавлен маркер `SELECT 1 FROM llm_prompts WHERE id='llmprompt_agent_router_v3' AND status='active' LIMIT 1`.

### 3.2 Cheap model class для structured_fact_qa

- **Файл:** `backend/services/agent/memory/chat.py`
- В `_run_structured_fact_qa_branch` и `_run_structured_fact_qa_branch_stream` вызовы `complete`/`complete_stream` теперь передают `model_class="cheap"`, чтобы ответ на фактовый вопрос генерировался дешёвой моделью (deepseek-chat) поверх RAG-чанков.

### 3.3 Регрессионные тесты

- **Файл:** `backend/services/agent/tests/test_intent_router.py`
  - `test_normalize_intent_structured_fact_qa_aliases` — проверяет нормализацию `structured_fact_qa` и его алиасов.
  - `test_route_intent_classifies_structured_fact_qa` — мок `complete_cached` возвращает `structured_fact_qa`, `route_intent` возвращает этот intent.
- **Файл:** `backend/services/agent/tests/test_branches.py`
  - `test_structured_fact_qa_branch_uses_cheap_model_class` — end-to-end через `TestClient`: запрос «какие свойства у задачи» → `action="structured_fact_qa"`, `complete` вызван с `model_class="cheap"`.

## 4. Верификация

### 4.1 Тесты

Запуск (Docker, python:3.12-slim):

```bash
cd backend/services/agent
python -m pytest tests/test_intent_router.py tests/test_branches.py tests/test_resolve_model_class.py -v
```

Результат:

```
14 passed, 14 warnings in 1.04s
```

Полный набор agent-сервиса:

```bash
python -m pytest tests/ -q
```

Результат:

```
133 passed, 1 skipped, 1 failed, 51 warnings
FAILED tests/test_measurement_baseline.py::test_baseline_measurement
```

**Один failure — pre-existing, не связан с контуром:** `test_baseline_measurement` падает из-за несовместимости мока `PromptBuilder.build` с kwarg `conversation_summary` в `_run_free_answer_branch`. Тронутые файлы не затрагивают `PromptBuilder` и smalltalk-ветку.

### 4.2 Цепочка alembic

```bash
cd backend && python -m alembic -c alembic.ini history -v
```

Head — `033`, parent `032`, путь корректный.

## 5. Как применить на stage

1. Убедиться, что `fix/stage-alembic-032-seed-v1` уже применён (модели и `llm_feature_models` на месте).
2. Задеплоить ветку `fix/structured-fact-qa-stage-v1` на stage.
3. Выполнить миграции:
   ```bash
   python backend/scripts/db_bootstrap.py backend/alembic.stage.ini
   # или
   alembic -c backend/alembic.stage.ini upgrade head
   ```
4. Проверить активный промт:
   ```sql
   SELECT id, version, status FROM llm_prompts WHERE feature='agent_router' ORDER BY version DESC;
   -- ожидается: llmprompt_agent_router_v3, active
   ```
5. Прогнать контрольный вопрос:
   ```bash
   curl -s -X POST https://stage.processmap.ru/api/sessions/{sid}/agent/chat \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"message":"какие свойства у задачи"}'
   ```
   Ожидаемый результат: `action="structured_fact_qa"`, ответ из RAG.
6. Проверить `llm_usage`:
   ```sql
   SELECT feature, model_class, model, cost_usd FROM llm_usage
   WHERE feature='processman_agent' AND session_id='...'
   ORDER BY ts DESC LIMIT 5;
   ```
   Ожидается: `model_class='cheap'`, `model='deepseek-chat'` (или дешёвая модель по умолчанию орга).

## 6. Git-proof

```text
branch:   fix/structured-fact-qa-stage-v1
HEAD:     b43f41cc6776370dcb5aab885527ce3b9ae7a1e3
origin/main: b43f41cc6776370dcb5aab885527ce3b9ae7a1e3
remote:   git@github.com:xiaomibelov/processmap_v1.git
status:
 M backend/scripts/db_bootstrap.py
 M backend/services/agent/memory/chat.py
 M backend/services/agent/tests/test_branches.py
 M backend/services/agent/tests/test_intent_router.py
?? backend/alembic/versions/033_agent_router_structured_fact_qa_prompt.py

diffstat:
 backend/scripts/db_bootstrap.py                    |  6 ++--
 backend/services/agent/memory/chat.py              |  2 ++
 backend/services/agent/tests/test_branches.py      | 36 ++++++++++++++++++++
 backend/services/agent/tests/test_intent_router.py | 39 ++++++++++++++++++++++
 4 files changed, 81 insertions(+), 2 deletions(-)
```

## 7. Риски и ограничения

- **RAG corpus должен быть проиндексирован:** контур `rag-dictionaries-coverage-v1` отвечает за чанкирование `property_dictionary`, `operation_catalog`, `glossary`. Если чанки не созданы, `_run_structured_fact_qa_branch` упадёт в free-answer (smalltalk).
- **BM25 лексический:** синонимы («шокер» vs «blast chiller») зависят от `aliases` в glossary.
- **Stage head mismatch:** health check сейчас показывает `head=031`, `alembic_version=032`. До применения этого фикса нужно убедиться, что stage image видит миграции 032 и 033 (см. F4).
- **PROD не трогать:** миграция меняет активный router prompt; применять только на stage до явного approve.

## 8. Следующие шаги

- Code review.
- После approve — merge в `main`.
- Ручной deploy на stage, verify по сценарию §5.
- PROD deploy — только после успешной стадии и явного решения.
