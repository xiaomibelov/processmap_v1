# PR — feature/agent-model-routing-optimization-v1

**Репозиторий:** `git@github.com:xiaomibelov/processmap_v1.git`  
**Ветка:** `feature/agent-model-routing-optimization-v1`  
**Base:** `origin/main` (`8f904834559993bcb86d098bc5aa7bbba133dcfd`)  
**Статус:** draft — **не мержить без явного approve владельца**.

## Что меняется

Минимальный дифф: только модельный роутинг PROCESSMAN-агента и наблюдаемость
стоимости. Логика ответов агента не изменяется.

| Файл | Изменение |
|------|-----------|
| `backend/alembic/versions/032_agent_model_class_and_cost.py` | Миграция: `llm_models.model_class` + pricing, `llm_feature_models.model_class`, `llm_usage.cost_usd`, seed deepseek-chat cheap / claude-opus-4-6 primary. |
| `backend/scripts/db_bootstrap.py` | LINEAR + MARKERS для миграции 032. |
| `backend/services/agent/gateway/llm_store.py` | `resolve_model(feature, org_id, model_class)`, `resolve_model_for_feature`, `get_model_cost`, `estimate_cost`, `record_usage(..., cost_usd)`. |
| `backend/services/agent/gateway/gateway.py` | `complete` / `complete_stream` принимают `model_class`, резолвят модель через реестр, логируют `cost_usd`. |
| `backend/services/agent/memory/prompt_builder.py` | Новый класс: model_class по интенту (`cheap` vs `primary`) + подготовка prompt. |
| `backend/services/agent/memory/chat.py` | Ветки `schema_overview`, `doc_qa`, `free_answer` (smalltalk) используют PromptBuilder и передают `model_class` в gateway. Удалены дублирующие функции `_build_user_prompt` / `_format_history_for_prompt`. |
| `backend/services/agent/routers/agent_resume.py` | Финальный ответ правки теперь использует фичу `agent_edit` (primary), а не `processman_agent`. |
| `backend/services/agent/tests/conftest.py` | DDL под новые колонки. |
| `backend/services/agent/tests/test_no_monolith_imports.py` | Исключение `.venv-test`/кэшей из AST-скана. |
| `backend/services/agent/tests/test_resolve_model_ttl.py` | Адаптация под новую структуру кэша. |
| `backend/services/agent/tests/test_resolve_model_class.py` | Unit-тесты override/fallback/pricing. |
| `backend/services/agent/tests/test_prompt_builder.py` | Unit-тесты матрицы интент → model_class. |
| `backend/services/agent/tests/test_gateway_cost_logging.py` | Unit-тесты записи `cost_usd` в `llm_usage`. |
| `backend/services/agent/tests/test_measurement_baseline.py` | Harness A/B замера на `large_schema_300_nodes`. |

## Итоговая матрица

| Интент | model_class | Обоснование |
|--------|-------------|-------------|
| `smalltalk` | `cheap` | Дефолт при любом сбое роутера; не должно биллиться в Opus. |
| `schema_overview` | `cheap` | Summarization схемы — low-creativity, retrieval-bound. |
| `doc_qa` (с RAG) | `cheap` | Ответ по найденным чанкам — low-creativity. |
| `doc_qa_fallback` (без RAG) | `primary` | Нет документов — нужно рассуждение над схемой. |
| `node_qa` | action runner | Нет прямого LLM-вызова в chat.py. |
| `suggest_next` | action runner | Творческий, но выполняется через action runner / monolith. |
| `edit_canvas` | `agent_edit_propose` cheap + `agent_edit` primary | Сложные правки схемы — primary; планирование — cheap. |

## Экономика

| Метрика | Значение |
|---------|---------:|
| Baseline (ДО) | $1.097631 |
| After (ПОСЛЕ) | $0.431438 |
| **Экономия** | **60.70%** |

Детали: `COST_AB.md` и `MEASUREMENTS*.md`.

## Тесты

```bash
cd backend/services/agent
.venv-test/bin/python -m pytest tests/ -q
# 119 passed, 1 skipped
```

Дополнительно:
```bash
AGENT_ROUTING_MEASUREMENT=before pytest tests/test_measurement_baseline.py -v -s
AGENT_ROUTING_MEASUREMENT=after  pytest tests/test_measurement_baseline.py -v -s
```

## Что НЕ входит (явно вне скоупа)

- Сжатие промпт-стека — отдельный контур.
- RAG-индексация — отдельные контуры.
- `cache_control` — зафиксирован в бэклоге как `agent-gateway-cache-control-v1`.

## Rebase plan — коллизия с `agent-prompt-stack-compression-v1`

**Порядок:** `agent-prompt-stack-compression-v1` (T1) мержится в `main` первым.

**Известная коллизия:**
1. Оба контура создали `backend/services/agent/memory/prompt_builder.py` и
   `tests/test_prompt_builder.py` с разным содержимым.
2. Оба контура меняли ветки `schema_overview` / `doc_qa` / `free_answer` в
   `backend/services/agent/memory/chat.py`.

**Правило ребейза этого контура (после merge T1):**
1. Ребейзнуть `feature/agent-model-routing-optimization-v1` на актуальный `main`.
2. `prompt_builder.py` из T1 считать каноническим для **сборки промпта**.
   НЕ перезаписывать его версией из этого контура.
3. Матрицу `intent → model_class` вынести в отдельный модуль
   (`intent_model_matrix.py` или раздел в `llm_store.py`) и подключить
   интеграционно к PromptBuilder T1 / веткам `chat.py`.
4. Конфликты в `chat.py` разрешать интеграцией обоих изменений, а не выбором
   `ours/theirs`.
5. После ребейза: полный прогон `pytest tests/` + повторный A/B-замер
   (цифры ПОСЛЕ могут сместиться из-за изменения длины промптов T1).

## Follow-up после `rag-dictionaries-coverage-v1`

После merge контура `rag-dictionaries-coverage-v1` дополнить матрицу интентом
`structured_fact_qa` → `cheap` (retrieval-bound вопрос по фактам после
покрытия словарями).

## Diffstat

```text
 backend/scripts/db_bootstrap.py                           |   6 +-
 backend/services/agent/gateway/gateway.py                 |  55 +++++++--
 backend/services/agent/gateway/llm_store.py               | 107 +++++++++++++----
 backend/services/agent/memory/chat.py                     | 133 ++++-----------------
 backend/services/agent/routers/agent_resume.py            |   4 +-
 backend/services/agent/tests/conftest.py                  |   7 +-
 backend/services/agent/tests/test_no_monolith_imports.py  |  12 ++
 backend/services/agent/tests/test_resolve_model_ttl.py    |  10 +-
 backend/alembic/versions/032_agent_model_class_and_cost.py | new
 backend/services/agent/memory/prompt_builder.py           | new
 backend/services/agent/tests/fixtures/large_schema.py     | new
 backend/services/agent/tests/test_gateway_cost_logging.py | new
 backend/services/agent/tests/test_measurement_baseline.py | new
 backend/services/agent/tests/test_prompt_builder.py       | new
 backend/services/agent/tests/test_resolve_model_class.py  | new
```

## Критерий приёмки

- [x] Экономия ≥ целевой (30%) — фактически 60.7%.
- [x] Unit + regression тесты проходят без деградации.
- [x] Каждый LLM-вызов логирует `feature × model × tokens × cost_usd`.
- [ ] Merge только после явного approve пользователя.
