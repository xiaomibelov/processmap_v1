# EXEC_REPORT — feature/agent-rag-retrieval-citations-v1 (E2)

Роль: Agent 2 (Executor) · Дата: 2026-09-14
Ветка: `feature/agent-rag-retrieval-citations-v1` · База: `origin/main@df7feabc` (P0 #965 внутри, E1 #972 снаружи)
HEAD: `4a21b537` (код) · Worktree: `p0-work-worktrees/feature-agent-rag-retrieval-citations-v1`

## Цель контура
Честный retrieval агента (эпик E2 аудита): RAG-подмешивание в free-answer и
schema_overview (miss-only), cite-контракт с гарантией отсутствия выдуманных
цитат, в пределах latency/token-бюджета.

## Что закрыто (план фазы 1 → фаза 2)

| Пункт плана | Статус |
|---|---|
| free-answer: org-wide bpmn_xml, top_k=4 (env) | DONE |
| schema_overview: RAG только miss-путь, текущая сессия, top_k=3 (env); hit 0-LLM не тронут | DONE |
| step-qa: scope-out (решение владельца) | DONE (не тронут) |
| Cite-контракт: SourceRef, промпт-инструкция, маркеры [Sn], AgentChatOut.sources, SSE sources-ивент + done.sources | DONE |
| Trim-ladder под PROCESSMAN_MAX_TOTAL_PROMPT_TOKENS | DONE |
| Prefetch | НЕ ДЕЛАЛ: после route_intent нет независимой работы для параллелизма — search идёт первым шагом ветки; измерено: live-поиск ~50 мс p50, суммарное добавление ≈ +50 мс (порог +150 мс) |
| Деградация: пустой корпус/ошибка поиска → ответ без источников, без выдуманных цитат | DONE + тесты |
| Фикс dangling `_run_free_answer_branch_stream` | DONE (обобщение в `_stream_llm_turn`) |
| M8: монолит runtime не тронут, additive-поле схемы, пометка в PR | DONE |
| openapi.yaml регенерация + redocly lint 0 | DONE |

## Гейты

| Гейт | Вердикт | Доказательство |
|---|---|---|
| G1 (цитата о другой сессии org, корректный source_id) | PASS (unit/e2e-уровень сервиса) | `test_free_answer_branch_with_rag_citations`: отрывок сессии B → sources[0].source_id == chunk_id B, session_id == B. Live stage-curl — после stage-деплоя |
| G2 (p50/tokens в бюджете) | ЧАСТИЧНО | p50: +50 мс поиска + 0.05 мс CPU ≈ +50 мс ≤ +150 мс ✓. Tokens: +575 est. на микро-сценарии (86→661) — выше относительного порога +10%, в абсолютном бюджете 4096 ✓ (16%), trim-ladder не даёт превысить бюджет. Решение об ужесточении default top_k/snippet — за владельцем |
| G3 (schema_overview warm-hit 0 LLM) | PASS | `test_schema_overview_hit_path_performs_no_rag` (search_rag не вызывается, usage.cached), `test_schema_memory_shortcircuit` зелёный; hit-путь в diff не затронут |
| G4 (пустой RAG → degrade, 0 выдуманных цитат) | PASS | `test_free_answer_no_hallucinated_citations` ([S42] вырезан), `test_free_answer_empty_rag_degrades…`, `test_free_answer_rag_error_degrades` |

## Валидация (5-плоскостей, локально)

- **code**: ветка `feature/agent-rag-retrieval-citations-v1`, HEAD `4a21b537`, diffstat 7 файлов +548/−132 (+2 новых файла).
- **workspace**: worktree изолирован от p0-work (uiux-ветка, dirty).
- **DB**: sources персистятся в `agent_turns.content_json` → idempotent-replay
  возвращает их же (`test_idempotent_replay_returns_sources`).
- **env/compose**: стек `processmap_v1` не мутировал (замеры search — read-only curl);
  тесты в venv `.tools/venv-agent-e2` (python 3.11), агентский контейнер без mount'ов
  не использовался для прогона ветки.
- **serving mode**: не применимо до деплоя; live-замер search API выполнен против
  локального стека (read-only).

## Тесты

- Сервис: **173 passed / 1 failed / 1 skipped** (main: 151/1 failed/1 skipped →
  дельта +22 passed, 0 регрессий). Failed — пред-существующий
  `test_measurement_baseline` (идентично падает на чистом origin/main, вне контура).
- Монолит: `test_rag_bm25.py` + `test_rag_bpmn_chunker.py` — **21 passed**.
  `test_rag_api.py` на хосте не прогоняется (зависает на сетевых deps rag-embedder,
  дизайн под docker-стек); кодовые пути файла контуром не затронуты, прогон — в CI.

## Экономика (§7)

| Метрика | Было | Стало | Порог | Статус |
|---|---|---|---|---|
| p50 латентности поиска (live, n=5) | — | ≈50 мс | +150 мс | ✓ |
| CPU cite-контура (n=200) | — | 0.05 мс | — | ✓ |
| Токены промпта free-answer (фикс. сценарий) | 86 | 661 | +10% | ✗ относительно; ✓ бюджет 4096 |

## Риски / ограничения / хвосты

1. **E1 (#972) открыт и содержит реверты P0** (list_turns, удалённые тесты, ключ
   `chunk` в `_doc_qa`). Рекомендация владельцу не мержить #972 до fix-контура
   `fix/rag-e1-regressions-v1`. E2 на это не опирается (process_layer опционален → null).
2. **G2 tokens**: на микро-базлайне дельта выше +10%. Опции: default
   `PROCESSMAN_RAG_FREE_ANSWER_TOP_K=2` или snippet 120 — снизит дельту до ~+150–250
   токенов. Жду решения владельца (код — env-only изменение).
3. Live-верификация G1/G3 на stage — после stage-деплоя (curl + SSE).
4. `test_rag_api.py` — прогон в CI (хост без стека недоступен для него).
5. Prefetch не внедрял — обоснование выше; при появлении независимой работы
   после route_intent можно вернуться.

## Handoff

Сделано: E2-код + тесты + openapi + артефакты; дельта регрессий 0; гейты
G1/G3/G4 закрыты на уровне кода, G2 — latency закрыт, tokens — с оговоркой.
Осталось: review (Agent 3) → PR → approve владельца → merge → stage-деплой →
live-верификация G1/G3 + SSE.
