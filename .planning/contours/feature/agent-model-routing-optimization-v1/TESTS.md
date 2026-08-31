# TESTS — agent-model-routing-optimization-v1

## Как запускать

```bash
cd backend/services/agent
.venv-test/bin/python -m pytest tests/ -q
```

Результат:
```
119 passed, 1 skipped, 50 warnings in 3.38s
```

## Unit-тесты, добавленные в контуре

### `tests/test_resolve_model_class.py`
- `test_resolve_model_class_override_wins` — override (feature, model_class) побеждает default; fallback на default по классу.
- `test_resolve_model_for_feature_uses_prompt_model_class` — `resolve_model_for_feature` читает `model_class` из активного промпта.
- `test_resolve_model_for_feature_missing_prompt_defaults_to_primary` — без промпта безопасный fallback primary.
- `test_estimate_cost_uses_cached_prices` — цены из `llm_models` используются для расчёта стоимости.

### `tests/test_prompt_builder.py`
- `test_smalltalk_is_cheap`
- `test_schema_overview_is_cheap`
- `test_doc_qa_with_rag_is_cheap`
- `test_doc_qa_fallback_is_primary`
- `test_unknown_intent_defaults_to_primary`
- `test_doc_qa_empty_rag_falls_back_to_primary`

### `tests/test_gateway_cost_logging.py`
- `test_complete_records_cost_usd_for_known_model` — `cost_usd` возвращается в результате и сохраняется в `llm_usage`.
- `test_complete_zero_cost_when_price_unknown` — если цены модели не заданы, стоимость 0, но usage записывается.

### `tests/test_measurement_baseline.py`
- `test_baseline_measurement` — A/B baseline ДО (primary для processman).
- `test_after_measurement` — A/B измерение ПОСЛЕ (cheap для low-creativity).

Оба замера запускаются только при явном `AGENT_ROUTING_MEASUREMENT=before/after`,
чтобы не замедлять обычный прогон и не перезаписывать артефакты случайно.

## Обновлённые существующие тесты

- `tests/test_resolve_model_ttl.py` — адаптирован под новую структуру кэша
  `defaults`/`overrides`/`costs`.
- `tests/test_no_monolith_imports.py` — исключены локальные виртуальные окружения
  (`.venv-test` и др.) из AST-скана.

## Regression / no-degradation

Полный набор тестов agent-сервиса проходит без изменений:
- контракты чата (`test_agent_chat_contract.py`, `test_agent_chat_integration.py`)
- потоковый чат (`test_streaming.py`, `test_agent_stream_contract.py`)
- edit-контур (`test_edit.py`, `test_edit_stream.py`)
- auth / internal LLM / health / branches / memory worker

## Качество

В контуре качество оценивается через отсутствие регрессий в тестах и корректность
model_class роутинга. Полноценный A/B по качеству ответов требует ручного
контрольного набора сценариев, который в этом контуре не задан.
