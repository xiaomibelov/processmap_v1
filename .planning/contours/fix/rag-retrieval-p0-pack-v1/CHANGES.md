# CHANGES — fix/rag-retrieval-p0-pack-v1

Контур: `fix/rag-retrieval-p0-pack-v1` · Тип: fix · Дата: 2026-09-13
Baseline: `origin/main = 26bbab34` (чекаут `p0-work-worktrees/fix-rag-retrieval-p0-pack-v1`).
Предшественник эпика E2 (память агента / честный retrieval). Источник диагностики: `audit/agent-architecture-rag-audit-v1` (DIAGNOSIS.md, evidence-p1/p2).

## Баг A — doc-qa-empty-excerpts (коммит 1: `3f067675`)

- **Причина:** `backend/services/agent/memory/prompt_builder.py` (`_doc_qa`) читал
  отрывки по ключам `chunk`/`text`, тогда как контракт `GET /api/rag/search`
  (`backend/app/routers/rag.py:198-205`) отдаёт `chunk_text`. Отрывки в промпте
  были пустыми → retrieval в doc_qa мёртв.
- **Фикс:** читать `chunk_text` первым (канонический ключ контракта), `chunk`/`text`
  оставлены как толерантный fallback — симметрично существующему `chat.py:623`.
  1 строка product-кода.
- **Тесты:** фикстины `test_prompt_builder.py` / `test_branches.py` переведены на
  фактический контракт (`chunk_text`), добавлены assert'ы на непустое содержимое
  отрывков в отправляемом промпте.
- **Монолит:** симметричного чтения чанков в `backend/app/agent/**` нет
  (grep `chunk|rag_results|excerpt` — пусто; монолитный путь шлёт projection JSON
  без RAG). Правка монолита не требуется.

## Баг B — agent-history-last-n (коммит 2)

- **Причина:** `list_turns` в обеих реализациях делал
  `ORDER BY created_at ASC, id ASC LIMIT N` → при диалоге > N ходов агент видел
  ПЕРВЫЕ N ходов и забывал свежие.
  - `backend/services/agent/memory/memory_store.py` (serving-path)
  - `backend/app/agent/memory_store.py:201-228` (монолит, M8 dual implementation — синхронный фикс)
- **Фикс:** subquery `ORDER BY created_at DESC, id DESC LIMIT N` + внешний
  `ORDER BY created_at ASC, id ASC` → последние N ходов в хронологическом порядке.
  Минимальный diff, поведение при ≤ N ходах неизменно.
- **Контракт endpoint'а `/agent/history`:** зафиксирован как «последние N ходов
  в хронологическом порядке» (потребитель — UI чата; ранее endpoint отдавал
  первые N — тем же багом). Хронологический порядок ответа сохранён,
  существующие тесты проходят без изменений.
- **Consumers (проверены):**
  - `memory/context.py:158` (load_context, history_limit=50) — теперь свежие 50;
    verbatim-6 и summary-строка в `prompt_builder._format_history` формируются
    от свежих ходов по построению (`history[-6:]`).
  - `memory/chat.py:143-151` (router last-3) — `history[-3:]` по-прежнему свежие 3.
  - `memory/schema_memory.py:178,240` (worker, MAX_TURNS=10) — `turns[-10:]`
    теперь реально последние 10.
  - `routers/agent_chat.py:77` (history endpoint) — см. контракт выше.
  - Монолит: `app/agent/context.py:40`, `app/routers/agent_chat.py:67` — та же семантика.

## Не входит в контур

- `test_measurement_baseline.py::test_baseline_measurement` — падает на чистом
  `origin/main` (TypeError: `_primary_promptbuilder_patch() got an unexpected
  keyword argument 'conversation_summary'`) — pre-existing, реплика старого
  промпта не обновлена под новую сигнатуру. Кандидат в отдельный fix-контур.
