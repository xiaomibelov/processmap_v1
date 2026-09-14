# REVIEW_REPORT — feature/agent-rag-retrieval-citations-v1 (E2)

Роль: Agent 3 (Reviewer) · Дата: 2026-09-14 · Read-only
Объект: коммит `4a21b537` (+nits `c98695f8`) · База: `origin/main@df7feabc`

## ВЕРДИКТ: REVIEW_PASS_WITH_NITS (блокеров нет)

Проверено построчно: chat.py (новый vs main), prompt_builder.py, citations.py,
schemas (сервис + монолит), routers, тесты; stream-рефакторинг сравнён
с baseline; контракт /api/rag/search сверен с rag.py.

## Подтверждение гейтов

- **G3 — PASS**: hit-путь schema_overview (non-stream chat.py:509–523, stream
  :1549–1553) возвращается до любого RAG/LLM-вызова; тест
  `test_schema_overview_hit_path_performs_no_rag` (search_rag not called,
  usage.cached), `test_schema_memory_shortcircuit` зелёный.
- **G4 — PASS**: parse_citations вырезает маркеры вне диапазона (в т.ч.
  многозначные после nits-фикса); парсер опирается только на rag_refs
  фактически показанной ступени лестницы; деградации search_rag → [] везде
  пойманы; trim-ladder до "" при budget=0.
- **G1 — PASS** (уровень сервиса): org-wide корпус (session_id="" → фильтр
  пропускается, rag.py:196), кросс-сессионный тест с source_id=chunk_id.
  Live stage — хвост после деплоя, корректно заявлен.
- **G2 — latency ✓ (+50 мс ≤ +150 мс); tokens — выше +10% относительно на
  микро-базлайне, в абсолютном бюджете 4096 с гарантией лестницы** —
  зафиксировано как open-решение владельца.

## Замечания и их закрытие

| # | Замечание | Статус |
|---|---|---|
| 1 | Маркеры [Sn] утекают в SSE token-дельты | ЗАКРЫТО c98695f8 (MarkerStripper с carry для разорванных маркеров) |
| 2 | Схлопывание двойных пробелов ломало индентацию | ЗАКРЫТО c98695f8 (схлопывание только interior, без line-start) |
| 3 | Regex `\d{1,3}` пропускал [S1000+] | ЗАКРЫТО c98695f8 (`\d+` + range-check) |
| 4 | Нет дедупликации chunk_id | ЗАКРЫТО c98695f8 |
| 5 | TOP_K в import-time | ЗАКРЫТО c98695f8 (per-call, как PromptBudgetConfig.from_env) |
| 6 | _doc_qa без rag_refs в call_kwargs | ЗАКРЫТО c98695f8 |
| 7 | sync-save schema-memory добавлен в stream miss-путь (на main не было) | НАМЕРЕННО (урок #948: short-circuit не должен зависеть от async-пути); зафиксировано в CHANGES.md |
| 8 | «_doc_qa на main читал chunk/text → пустые отрывки» | **ЛОЖНОЕ** замечание: ревьюер сравнивал со stale baseline 7fb5863e; на актуальном main (df7feabc, P0 #965) `_doc_qa` уже читает `chunk_text or chunk or text`; E2 сохраняет контракт через chunk_excerpt |

## Намеренные поведенческие изменения (зафиксированы в CHANGES.md)

1. Stream-ошибка LLM санитизируется (S1) — раньше сырой текст уходил клиенту.
2. schema_overview stream-miss материализует sync-save → повторный вопрос hit.
3. doc_qa/structured_fact: отрывки с S-нумерацией + инструкция; structured_fact
   факты теперь сниппеты ≤200 символов (был полный chunk_text).
4. Free-answer non-stream: невалидный action-JSON/fenced → fallback-текст
   (N1/M3), раньше клиенту показывался сырой JSON.
5. SSE `done` для node_qa/suggest_next/schema-hit содержит `sources: null` (additive).

## Эквивалентность stream-рефакторинга

Подтверждена построчно: события token/usage/error, final_usage, persist,
provider_id/model в error, условие action-fallback (покрытие intent'ов
совпадает со старым `intent in {smalltalk, doc_qa}`).

## Рекомендация

Принимать. Перед merge — прогон `pytest backend/services/agent/tests/` (зелёный,
177 passed / 1 пред-существующий fail) и live-верификация G1/G3 на stage после деплоя.
