# CHANGES — feature/agent-rag-retrieval-citations-v1 (E2)

Контур: `feature/agent-rag-retrieval-citations-v1` · База: `origin/main@df7feabc` (включает P0 #965)
Дата: 2026-09-14 · Статус: READY_FOR_REVIEW

## Что изменено

### Новые файлы
- `backend/services/agent/memory/citations.py` — cite-контракт: `SourceRef`-сборка из
  результатов `/api/rag/search` (`build_source_refs`), нумерованные отрывки для промпта
  (`rag_excerpts_block`), парсер маркеров `[Sn]` с guard против выдуманных цитат
  (`parse_citations`), budget-aware trim-ladder (`rag_block_within_budget`:
  полные отрывки → top 3 → top 2 + сниппет 100 → titles-only → без RAG).
- `backend/services/agent/tests/test_citations.py` — 20 тестов контура (G1/G3/G4,
  prompt-уровень, trim-ladder, idempotent-replay).

### Изменения
- `backend/services/agent/memory/chat.py`:
  - free-answer (`smalltalk`): org-wide RAG по `bpmn_xml` (`_search_rag_org_wide`,
    top_k=`PROCESSMAN_RAG_FREE_ANSWER_TOP_K` default 4), цитаты в ответе.
  - schema_overview: RAG только на miss-пути (`_search_rag_session`, top_k=
    `PROCESSMAN_RAG_OVERVIEW_TOP_K` default 3, текущая сессия); hit-путь 0-LLM
    не затронут (G3).
  - doc_qa / structured_fact_qa: единый cite-контракт (S-нумерация отрывков,
    парсинг маркеров, `sources` в ответе).
  - **fix пред-существующего дефекта main**: `_run_free_answer_branch_stream` —
    dangling reference (вызов на старом main падал с NameError → generic SSE
    error в fallback structured_fact_qa при пустом RAG). Функция определена,
    stream-логика free-answer/doc_qa/schema_overview обобщена в `_stream_llm_turn`.
  - `sources` сохраняются в `content_json` хода → idempotent-replay
    (`client_turn_id`) возвращает их же (плоскость DB).
- `backend/services/agent/memory/prompt_builder.py`:
  - `build_processman_prompt` / `build_schema_overview_prompt`: RAG-блок с
    инструкцией цитирования, ограниченный остатком `max_total_prompt_tokens`
    (trim-ladder); `PromptAssembly.rag_refs` — refs фактически показанной
    ступени (парсер цитат опирается только на них).
  - `build()` пробрасывает `rag_results` в free-answer/schema_overview и
    возвращает `rag_refs`.
  - `_doc_qa`: S-нумерация отрывков + инструкция цитировать только отрывки.
- `backend/services/agent/schemas.py` + `backend/app/schemas/agent_chat.py`:
  `SourceRef` (source_id=chunk_id, source_type, session_id/session_title,
  process_layer? — опционально после E1 #972, element_id/element_name? — под E5,
  snippet ~200, score); `AgentChatOut.sources: Optional[List[SourceRef]]`
  (additive, default None). Монолит получил только схемное поле (M8-пометка в PR:
  монолитный контур retrieval не выполняет, симметрия не тривиальна).
- `docs/openapi.yaml` — регенерация через `scripts/dump_openapi.py`, redocly lint 0 ошибок.
- Тесты: `test_agent_chat_contract.py` (sources в ключах ответа),
  `test_streaming.py` (SSE-ивент sources + фикс fallback без NameError).

### SSE-контракт ( additive, под E5 )
- Новый ивент `sources` {sources: [...]} после токенов, до `done`; поле `sources`
  продублировано в `done` (в т.ч. hit-путь schema_overview: sources=null).

## Экономика (замеры до/после, §7 PLAN)
| Метрика | Было (main) | Стало (ветка) | Порог | Статус |
|---|---|---|---|---|
| Латентность поиска (live `/api/rag/search`, пустой корпус, n=5) | — | p50 ≈ 50 мс | p50 turn ≤ +150 мс | ✓ |
| CPU cite-контура (build+parse, n=200) | — | p50 ≈ 0.05 мс | — | несущественно |
| Токены промпта free-answer (фикс. сценарий, 4×400-char чанка) | 86 | 661 (+575) | ≤ +10% | ✗ на микро-базлайне |
| Тот же сценарий, % от бюджета 4096 | 2% | 16% | в бюджете | ✓ (trim-ladder) |

Вывод G2: латентность в пороге; токены — выше относительного порога +10% на
микро-базлайне, но в абсолютном бюджете с trim-ladder. Решение по ужесточению
(снижение default top_k/snippet) — за владельцем (см. EXEC_REPORT §риски).

## Не затронуто (scope-out)
Индексация новых типов (E3), feedback-ранкинг (E4), UI-показ источников (E5 —
SSE/контракт под него заложены), hybrid/pgvector, монолитная runtime-логика,
починка ревертов E1 (#972 — отдельный fix-контур после её мержа).
