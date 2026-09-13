# PLAN — feature/agent-rag-retrieval-citations-v1 (эпик E2: RAG-retrieval + цитирование)

Статус: **PLANNING — ждёт approve владельца. Код не пишется до approve.**
Контур: `feature/agent-rag-retrieval-citations-v1` · Тип: `feat` · Роль: Agent 1 (Planner)
Дата: 2026-09-14

---

## 0. Резюме для approve

E2 чинит «честный retrieval» агента: RAG-подмешивание расширяется с двух веток (doc_qa, structured_fact_qa) на **free-answer (обязательно)** и **schema_overview (только miss-путь, hit-путь 0-LLM не трогаем)**, плюс вводится **cite-контракт** — структурированные источники в ответе и SSE, с гарантией «ни одной выдуманной цитаты». Данные для цитат уже есть в ответе `/api/rag/search` (chunk_id, source_type, source_id, metadata.session_title/element_id/element_name), расширять search-API не нужно.

**Ключевое расхождение с постановкой (требует решения владельца, §8):** E1 (#972) в постановке назван смерженным, но фактически **PR открыт**, а его ветка содержит реверты P0-фиксов. Рекомендуемая стратегия — E2 от `origin/main` без жёсткой зависимости от E1 (вариант A, §8.1).

---

## 1. Runtime/source truth (зафиксировано 2026-09-14)

```
repo:     /Users/mac/agents_place/kimi_PM/p0-work  (remote: git@github.com:xiaomibelov/processmap_v1.git)
worktree: /Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-agent-rag-retrieval-citations-v1
branch:   feature/agent-rag-retrieval-citations-v1  (новая, от origin/main)
base:     origin/main = df7feabc661add72ffac97c00ea2dda66008bdac
          (включает #965 P0: merge-base --is-ancestor 35580e8a → OK)
          (НЕ включает E1: cc94669cf — ветка feature/rag-schema-layer-indexing-v1, PR #972 OPEN)
base осн. checkout: p0-work на uiux/bpmn-session-upload-v1 (ahead 2347 / behind 143, dirty) — НЕ используется для контура
```

---

## 2. Фактическое состояние (проверено по коду origin/main, референсы аудита перепроверены)

### 2.1 Ветки агента и RAG (канон: backend/services/agent/memory/chat.py, 1405 строк)

| Ветка | Функция (строки) | RAG сейчас | rag_results в prompt |
|---|---|---|---|
| node_qa (step-qa) | `_run_node_qa_branch` 371–404 | нет (LLM3 action-runner) | — |
| suggest_next | `_run_suggest_next_branch` 406–438 | нет | — |
| schema_overview | `_run_schema_overview_branch` 440–498 | **нет** | `build()` на chat.py:466 без rag |
| doc_qa | `_run_doc_qa_branch` 500–556 | двухкруговой `_search_rag_prioritized` 80–133 (сессия bpmn_xml top_k=5 → глобум) | chat.py:527 |
| structured_fact_qa | `_run_structured_fact_qa_branch` 633–686 | `_search_rag_for_structured_fact` 574–619 (корпуса-словари, session-scope намеренно сброшен :591) | свой промпт 621–631 |
| free-answer/smalltalk | `_run_free_answer_branch` 688–758 | **нет** | `build()` на chat.py:710 без rag |

Stream-дубль (`run_turn_stream` 1188–1405): логика веток продублирована инлайн; doc_qa RAG на chat.py:1318–1326; structured_fact RAG на :999–1006; schema_overview hit-путь (0-LLM) на :1310–1314.

### 2.2 Верификация референсов постановки (прецедент недействительных референсов учтён)

- «chat.py:466,701,1301 — free-answer/schema_overview без rag» → **TRUE**, фактические строки: schema_overview chat.py:466, free-answer chat.py:710, stream doc_qa :1318–1326. Строка 1301 в текущем main не соответствует.
- «prompt_builder.py:489–496 — мёртвый код для free-answer» → **FALSE (с уточнением)**: строки 489–496 мёртвы, но это блок в `build_schema_overview_prompt` (def :472), ждёт `rag_chunks` с полями `element_id/element_name/chunk_text`. Free-answer-промпт (`build_processman_prompt`, :420) RAG-блока не имеет — `rag_chunks` там участвует только в `_select_relevant_step_ids`/`_trim_compact_projection` (199, 268–282).
- «metadata чанков: process_layer, session_type, session_id, session_title» → **частично**: session_id/session_title есть на main (routers/rag.py:198–208, chunker.py:58–95 + element_id/element_name/projection_digest); process_layer/session_type — только в незамерженном E1.
- «фильтры: process_layer/session_id/source_type» → **частично**: на main есть session_id (сравнение с metadata.source_id, rag.py:196), source_type (:194), min_score, top_k; process_layer — только в E1.
- «история — последние N» → TRUE (P0): `list_turns` last-N (memory_store.py:246–270, N=50 в context.py:158), verbatim последние 6 ходов (prompt_builder.py:33–35).

### 2.3 Контракты ответа

- `AgentChatOut` (backend/app/schemas/agent_chat.py): `ok, status, error, message, action, action_payload, usage, projection_digest`. **Поля sources/citations нет.**
- action_payload doc_qa/structured_fact_qa: только `{"results_count": N[, "source_type"]}` — чанки наружу не отдаются.
- SSE (routers/agent_stream.py): `event: <type>\ndata: <json>`; типы `start/token/done/error/action`. `done` = `{usage, projection_digest}`; hit отдаёт только `done`.

### 2.4 Бюджеты и latency

- `rag_top_k=5`, env `PROCESSMAN_RAG_TOP_K` (prompt_builder.py:35,46); trim-ladder `_trim_compact_projection` 268–282 (top_k→3 → radius=0 → drop RAG).
- `PromptBudgetConfig`: total 4096 / projection 2048 / history 1024; output caps: chat 1200.
- doc_qa: RAG последовательно после `load_context` (до 2 HTTP search); параллелизма/prefetch нет. route_intent — кэшированный LLM-вызов до ветки (chat.py:225).
- schema_overview warm-hit = persisted summary, **0 LLM** (chat.py:442–456 / :1310–1314), тест `test_schema_memory_shortcircuit.py` — урок #948.
- 100-node fallback: при переполнении бюджета проекция жмётся (_trim_compact_projection) — RAG-токены в free-answer добавят давление на эту ветку, нужен регрессионный тест.

### 2.5 M8: монолит backend/app/agent/ — НЕ симметричен канону

Монолит — старый AGENT-0: один общий промпт, нет route_intent, нет веток, **RAG отсутствует полностью** (grep пуст). Симметрия не тривиальна → по ограничению M8: **монолит не трогаем, явная пометка в PR**; каноническая реализация только в `backend/services/agent/`.

### 2.6 Предсуществующий дефект main (включить в контур, отдельным коммитом)

`run_turn_stream` вызывает `_run_free_answer_branch_stream` (chat.py:1009), но функция **нигде не определена** — NameError в stream-fallback structured_fact_qa при пустом RAG, ловится generic except в agent_stream.py:81–84 → SSE error. E2 в любом случае переписывает stream-ветку free-answer — фиксим здесь.

---

## 3. Критический риск: статус E1 (#972) и merge-hazard

Факт (gh, git): PR #972 **OPEN**, ветка `feature/rag-schema-layer-indexing-v1` @ cc94669cf, base 26bbab34. Diff к main (31 файл) содержит для агентского кода:

1. `services/agent/memory/prompt_builder.py` — `_doc_qa` меняет `chunk_text → chunk` — **сломает doc_qa на main-контракте** (/api/rag/search отдаёт `chunk_text`, rag.py:198–205; P0-фикс #965 был обратной замены).
2. `services/agent/memory/memory_store.py` + `backend/app/agent/memory_store.py` — **реверт P0-фикса list_turns** (возврат к «первым N ходов»), тест `test_memory_store_turns.py` удалён, assert'ы doc_qa/structured_fact в test_branches/test_prompt_builder ослаблены.
3. E1 по факту **не трогал** runtime-логику services/agent (финальный diffstat E1-контура: 9 файлов, все backend/app, compose, deploy, openapi) — но diff ветки к main сейчас включает и эти реверты.

Вывод: мерж #972 в текущем виде **откатывает P0**. Это дефекты E1, не E2, но E2 обязан от них защититься.

---

## 4. Дизайн (что пишется после approve)

### 4.1 Покрытие веток retrieval'ом

| Ветка | Retrieval | Источник | Фильтр | top_k |
|---|---|---|---|---|
| free-answer | **да (новое)** | org-wide `source_type=bpmn_xml` (все сессии org, включая текущую) | session_id **не** задаём (G1 — вопросы о других сессиях org), process_layer — не фильтруем (опционально post-E1) | 4 |
| schema_overview | **да, только miss-путь** | текущая сессия `bpmn_xml` | session_id = текущая | 3 |
| schema_overview hit-путь | **нет** | — | — | — |
| step-qa | **scope-out E2** | — | — | — |
| doc_qa / structured_fact_qa | без изменений (P0 контракт сохраняем) | — | — | 5 (как есть) |

Обоснования: free-answer — единственная общая ветка, сейчас отвечает «по памяти» без источников; org-wide охват нужен для G1. schema_overview: hit-путь — 0-LLM из schema_memory (урок #948), трогать запрещено (G3); cold/miss-путь получает RAG через оживление мёртвого блока `build_schema_overview_prompt` (prompt_builder.py:489–496 — он уже ждёт `element_id/element_name/chunk_text`). step-qa: отвечает по конкретному шагу проекции (projection уже в контексте), citation-value низкий, latency-sensitive интерактив; cite-контракт остаётся опциональным, чтобы step-qa можно было подключить отдельным мини-контуром без смены контракта.

### 4.2 Cite-контракт

**SourceRef** (новая схема, backend/app/schemas/agent_chat.py):

```json
{
  "source_id": "<chunk_id>",                  // уникален, проверяемый (G1)
  "source_type": "bpmn_xml",
  "session_id": "<uuid>",
  "session_title": "<title>",
  "process_layer": "as_is | to_be | null",    // опционально: из metadata при наличии (E1); иначе null
  "element_id": "...", "element_name": "...", // опционально, навигация для E5
  "snippet": "<первые ~200 символов chunk_text>",
  "score": 0.0                                // опционально
}
```

**Промпт-инструкция** (для веток с rag): отрывки нумеруются S1..Sn с заголовками `[S1] <session_title>`; «утверждения, основанные на отрывках, помечай маркером [S1]; цитируй ТОЛЬКО переданные отрывки; если отрывков недостаточно — скажи прямо, не додумывай».

**Парсинг**: regex `\[(S\d+)\]` в сыром ответе → used-индексы; маркеры вырезаются из текста наружу; в `sources[]` идут только SourceRef из used ∩ provided; индексы вне диапазона игнорируются (guard против выдуманных цитат).

**API/SSE**:
- `AgentChatOut` += `sources: list[SourceRef] | None` (additive, обратная совместимость).
- SSE: новый ивент `sources` {sources: [...]} после последнего `token`, до `done`; поле `sources` продублировано в `done` (для hit-пути без token'ов и для простоты клиента). Расчёт под E5: UI сможет рендерить источники по `sources`-ивенту без догадок; E5 добавит только рендеринг.

### 4.3 Бюджет токенов и latency

- Новые env (с дефолтами): `PROCESSMAN_RAG_FREE_ANSWER_TOP_K=4`, `PROCESSMAN_RAG_OVERVIEW_TOP_K=3`; trim-ladder переиспользуем: full → top 3 → snippet 200 чар → titles-only → drop RAG. Не ломать 100-node fallback: регрессионный тест на `_trim_compact_projection` при >100 nodes с rag_chunks.
- Prefetch: после `route_intent` стартуем org-wide search (для intent=free-answer) параллельно с оставшейся подготовкой контекста; потребление — в ветке. doc_qa не меняем (уже двухкруговой и cheap). Для schema_overview prefetch невозможен (не знаем miss заранее) — допустимо, cold-путь не latency-critical.
- **Пороги (предложение, согласовать с владельцем)**: p50 turn'а free-answer **≤ +150 мс** к baseline; tokens/turn **≤ +10%** на фиксированном сценарии (§7). Поиск BM25 локальный, основной вклад — токены промпта, контролируется trim-ladder.

### 4.4 Деградация

- search_rag бросает (MonolithError/таймаут) → free-answer/schema_overview отвечают как на main (без источников), sources не возвращается; ошибка не пробрасывается пользователю.
- Пустой корпус/пустой результат → sources=[], промпт без блока отрывков и без инструкции цитировать; модель не видит ни одного Sn → физически не может процитировать (контракт + тест G4).
- Парсер: markers ∉ provided → вырезать маркер, не включать в sources (guard).

### 4.5 Фикс в контуре (предсуществующий дефект)

`_run_free_answer_branch_stream` — определить (общая логика free-answer вынесется так, чтобы stream/non-stream не дублировали RAG-путь), отдельный коммит «fix(agent): dangling _run_free_answer_branch_stream (#P0-fallback NameError)».

### 4.6 M8

Монолит `backend/app/agent/` не изменяется. Пометка в PR: «монолитный контур RAG не содержит, симметрия не тривиальна; cite-контракт заложен в схеме AgentChatOut общей для обоих контуров, монолитные ответы sources не заполняют (null)».

---

## 5. Тест-стратегия (RED → GREEN)

RED сначала (ветка, фиксация падений), потом код. Существующие тесты сервиса: `backend/services/agent/tests/` (pytest, per-test SQLite через DATABASE_URL, 151 passed на P0).

1. `test_free_answer_branch_with_rag_citations` — RAG-mock (через monolith_client) → в `complete()` промпт содержит отрывки S1..S4; в ответе sources[] с корректным source_id (G1-unit).
2. `test_free_answer_no_hallucinated_citations` — ответ модели с маркером [S99] вне диапазона → markers вырезаны, sources не содержит S99 (G4).
3. `test_free_answer_empty_rag_degrades` — пустой RAG + ошибка search → ответ как на main, sources=None/[] (G4 degrade).
4. `test_schema_overview_hit_zero_llm_zero_rag` — warm-hit: ни одного LLM-вызова, ни одного search_rag (G3; расширение test_schema_memory_shortcircuit).
5. `test_schema_overview_cold_includes_rag` — miss-путь: промпт содержит отрывки, ответ с sources.
6. `test_doc_qa_citations_contract` — существующие doc_qa-тесты дополняются assert'ом sources (source_id ∈ переданных chunk_id).
7. `test_cite_contract_schema` — AgentChatOut сериализация sources; SSE `done` и `sources`-ивент содержат sources (расширение test_agent_stream_contract).
8. `test_stream_free_answer_branch_defined` — stream-fallback structured_fact при пустом RAG не падает (фикс §4.5).
9. `test_trim_compact_projection_with_rag_100nodes` — >100 nodes + rag_chunks: fallback сохранён, бюджет не превышен.
10. **e2e G1** (backend/tests или e2e-харнесс): seeded org, сессия A (текущая) + сессия B (другая); вопрос про содержимое B через free-answer → ответ содержит ≥1 цитату, source_id == chunk_id чанка из B, session_id == B.
11. Регрессия: полный прогон `pytest backend/services/agent/tests/` + монолитные RAG-тесты (test_rag_api, test_rag_bm25) — дельта 0 к baseline.

## 6. Гейты приёмки (из аудита, операционализированы)

| Гейт | Как закрываем |
|---|---|
| G1 — ответ о ДРУГОЙ сессии org содержит ≥1 цитату с корректным source_id | Тест №10 (e2e) в фазе 2; stage live-curl после stage-деплоя |
| G2 — p50 латентность и tokens/turn в бюджете | Замеры до/после §7 на фиксированном сценарии; пороги из §4.3 |
| G3 — schema_overview warm-hit: 0 LLM сохранён | Тест №4; hit-путь в diff не затрагивается (only miss) |
| G4 — пустой RAG → degrade без выдуманных цитат | Тесты №2, №3 |

## 7. Экономика (замеры до/после)

Методика (фаза 2, локальный стек processmap_v1, AGENTS.md §9–10, env-lock на любые мутации):
- Seed: org с 2+ сессиями (A — текущая, B — другая, проиндексированные bpmn_xml), фиксированный набор из 20 вопросов (10 free-answer, 5 doc_qa, 5 schema_overview cold) × 3 прогона.
- Метрики: latency turn (серверный тайминг ответа), tokens/turn (usage из ответов), доля ответов с ≥1 цитатой, доля маркеров вне диапазона (должна быть 0).
- Отчёт: таблица baseline (main) vs ветка в EXEC_REPORT.md + CHANGES.md.

## 8. Открытые решения на approve

### 8.1 Стратегия интеграции с E1 (#972 OPEN, содержит реверты P0) — **главный вопрос**

- **Вариант A (рекомендую)**: E2 от origin/main (уже создано), без жёсткой зависимости от E1: `process_layer` читается из metadata опционально (нет → null). После мержа #972 — отдельный fix-контур `fix/rag-e1-regressions-v1` на реверты (list_turns, удалённые тесты, ключ chunk в `_doc_qa`). В handoff E2 — явная пометка владельцу: «#972 мержить только после фикса ревертов».
- Вариант B: ждать мержа #972 и вести E2 от E1-tip — наследуем реверты P0 и конфликтуем с main; не рекомендуется.
- Вариант C: чинить E1-реверты внутри E2 — смешение контуров, регламентом запрещено.

### 8.2 Прочие решения (рекомендации)

1. Пороги G2: p50 ≤ +150 мс, tokens ≤ +10% — подтвердить или дать свои.
2. step-qa — scope-out E2 (подключить позже отдельным контуром) — подтвердить.
3. `source_id` = chunk_id (а session_id отдельным полем) — подтвердить.
4. Фикс dangling `_run_free_answer_branch_stream` — внутри E2, отдельным коммитом — подтвердить.
5. Новые env `PROCESSMAN_RAG_FREE_ANSWER_TOP_K=4` / `PROCESSMAN_RAG_OVERVIEW_TOP_K=3` — подтвердить дефолты.

## 9. Scope-out (фиксируем границы)

Индексация новых типов (E3), feedback-ранкинг (E4), UI-показ источников (E5 — контракт/SSE проектируем с учётом), hybrid по умолчанию, pgvector, монолитная реализация (M8-пометка), починка ревертов E1 (отдельный контур после мержа #972).

## 10. План выполнения (после approve, фаза 2)

1. RED: тесты №1–10 (ветка feature/agent-rag-retrieval-citations-v1, worktree создан).
2. GREEN: retrieval в free-answer (org-wide, prefetch), оживление блока schema_overview (miss-only), cite-парсер + SourceRef, AgentChatOut + SSE `sources`-ивент, деградация, фикс stream-free-answer (отдельный коммит).
3. Прогон всех тестов сервиса + монолитной регрессии (дельта 0).
4. Замеры экономики §7 → таблица до/после.
5. Артефакты: API.md / TESTS.md / CHANGES.md / EXEC_REPORT.md / STATE.json + READY_FOR_REVIEW; mirror в Obsidian (pm-agent-mirror-report.sh).
6. PR (русский) с таблицей G1–G4 и замерами → review (Agent 3) → merge/deploy только по approve владельца.
