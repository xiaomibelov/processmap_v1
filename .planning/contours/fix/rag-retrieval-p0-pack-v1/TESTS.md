# TESTS — fix/rag-retrieval-p0-pack-v1

Дата: 2026-09-13 · Чекаут: `p0-work-worktrees/fix-rag-retrieval-p0-pack-v1`

## Окружение прогонов

- Agent-сервис: `docker run --rm -v <services/agent>:/app -w /app python:3.12-slim`,
  `pip install -r requirements.txt pytest fakeredis`, `python -m pytest tests -q`.
  Примечание: `fakeredis` не зафиксирован в `requirements.txt` — без него
  `tests/test_memory_worker.py` не собирается (ModuleNotFoundError), pre-existing
  инфраструктурный зазор, вне контура.
- Монолит: `docker run --rm -v <backend>:/app -w /app python:3.12-slim`,
  `pip install -r requirements.txt -r requirements-dev.txt`.

## Баг A — RED → GREEN

RED (baseline-код + новые тесты), все падают по правильной причине
(отрывки пустые при контрактном ключе `chunk_text`):

```
FAILED tests/test_prompt_builder.py::test_doc_qa_with_rag_is_cheap
FAILED tests/test_branches.py::test_doc_qa_branch_with_results
FAILED tests/test_branches.py::test_doc_qa_branch_searches_current_session_first
```

GREEN (после `prompt_builder.py:523`): полный suite сервиса
**149 passed, 1 skipped**, 1 pre-existing failure (`test_baseline_measurement`,
TypeError `conversation_summary` — падает на чистом origin/main, вне контура).

## Баг B — RED → GREEN

RED (baseline-код):

```
FAILED tests/test_memory_store_turns.py::test_list_turns_returns_last_n_in_chronological_order
E       AssertionError: assert 'turn-000' not in ['turn-000', 'turn-001', ..., 'turn-049']
```

GREEN (после subquery DESC→ASC в обеих реализациях): полный suite сервиса
**151 passed, 1 skipped**, тот же 1 pre-existing failure. Тест
`test_list_turns_under_limit_returns_all_chronological` — защита от регрессии
для диалогов ≤ N ходов.

## Регрессия

- Agent-сервис, полный `pytest tests`: 151 passed / 1 pre-existing failure
  (см. CHANGES.md).
- Монолит (agent + LLM3-гейт): `tests/test_agent_chat_contract.py`,
  `tests/test_agent_memory.py`, `tests/test_llm_schema_assistant.py`,
  `tests/test_processman_agent_prompt_v3_seed.py` — результат в STATE.json.
- SSE-формат и контракты API не менялись (diff — 2 product-файла, ~30 строк).
