# TESTS — feature/agent-rag-retrieval-citations-v1 (E2)

## RED (фиксация до кода)

Новый `backend/services/agent/tests/test_citations.py` + расширения
`test_streaming.py` — падение по правильной причине: `memory.citations` отсутствует,
`sources` нет в ответе/SSE, fallback structured_fact_stream падает с NameError.

## Итоговый прогон (venv `.tools/venv-agent-e2`, python 3.11)

| Набор | main | ветка | Дельта |
|---|---|---|---|
| `backend/services/agent/tests/` (полный) | 151 passed / 1 failed / 1 skipped | 173 passed / 1 failed / 1 skipped | +22 passed, регрессий 0 |
| Монолит `backend/tests` RAG-подмножество (rag_api, rag_bpmn_chunker, rag_bm25) | (см. EXEC_REPORT) | (см. EXEC_REPORT) | 0 |

Единственный failed — `test_measurement_baseline.py::test_baseline_measurement`:
пред-существующий дефект main (падение идентично на чистом origin/main,
TypeError в legacy-моке `_primary_promptbuilder_patch`, вне контура).

## Карта новых тестов → гейты

| Тест | Гейт |
|---|---|
| test_free_answer_branch_with_rag_citations (кросс-сессионный сценарий, source_id=chunk_id сессии B) | G1 |
| test_free_answer_no_hallucinated_citations ([S42] вырезан, в sources не попал) | G4 |
| test_free_answer_empty_rag_degrades_without_citations | G4 |
| test_free_answer_rag_error_degrades (MonolithError → ответ без источников) | G4 |
| test_doc_qa_citations_contract / test_structured_fact_qa_citations_contract | контракт единообразия |
| test_schema_overview_cold_includes_rag_citations (miss-путь, session-scope) | — |
| test_schema_overview_hit_path_performs_no_rag (0 LLM, 0 search_rag) | G3 |
| test_agent_chat_out_sources_schema_roundtrip / _default_none | схема |
| test_idempotent_replay_returns_sources (client_turn_id, плоскость DB) | — |
| citations unit: build_source_refs fields/snippet, parse order/range-guard | G4 |
| test_prompt_builder_free_answer_includes_rag_excerpts / without_rag_has_no_instruction | промпт |
| test_prompt_builder_schema_overview_includes_rag_on_miss | — |
| test_trim_compact_projection_with_rag_many_nodes (150 узлов) | 100-node fallback |
| test_rag_trim_ladder_respects_total_budget (малый бюджет → ladder) | G2 |
| test_stream_free_answer_emits_sources_event (SSE sources + done.sources) | контракт SSE |
| test_stream_structured_fact_empty_rag_falls_back_without_error (dangling fix) | фикс |

## Live-проверки после stage-деплоя (фаза приёмки)

- G1: curl к stage — вопрос о другой сессии org → ≥1 цитата, source_id чанка.
- SSE: наличие `sources`-ивента в живом потоке.
