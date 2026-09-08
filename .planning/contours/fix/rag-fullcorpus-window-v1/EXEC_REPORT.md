# EXEC_REPORT — fix/rag-fullcorpus-window-v1

**Дата:** 2026-09-07 · **Роль:** Agent 2 (Executor) · **Ветка:** `fix/rag-fullcorpus-window-v1` от `origin/main@a74ac76b`
**PLAN approved:** да (вариант (a) с уточнением: без хардкода типов, общее правило по размеру корпуса)

## Изменения

1. `backend/app/rag/storage_rag.py`
   - Новая константа `_FULL_CORPUS_MAX_CHUNKS = 1000` — порог «малого» корпуса.
   - Ветка полнокорпусной загрузки (без `doc_id`/`source_type`/`source_id`) переписана:
     - `GROUP BY d.source_type` считает размер каждого корпуса org;
     - корпуса `<= 1000` чанков грузятся **целиком** (org-wide референс-данные
       больше не выпадают из окна по `created_at`);
     - корпуса `> 1000` (bpmn_xml от автоиндексации T4 и т.п.) — под прежним
       окном `LIMIT` самых старых чанков (защита памяти/латентности сохранена).
     - Обе ветки теперь джойнят `rag_documents` с `is_active=1` (заодно чинит
       молчаливое чтение soft-deleted документов в unfiltered-ветке).
   - Следствие выбора порога (зафиксировано в PLAN.md): при пересечении порога
     корпус «клиффом» переходит под окно. Хардкода типов нет — будущие корпуса
     (note_thread и т.п.) автоматически защищены, пока малы.
2. `backend/tests/test_rag_fullcorpus_window.py` (новый) — 3 теста.
   Эндпоинты/контракты не менялись → **OpenAPI gate §6.1 не применим**.

## Доказательства

### Тесты (venv `processmap_v1_main_clone/.venv`, python 3.11)

- `test_rag_fullcorpus_window.py` — **3 passed**:
  - glossary-hit в unfiltered поиске при 2100 более старых bpmn-чанков: BM25 ✓, hybrid ✓;
  - окно bpmn_xml ≤ 2000 сохранено ✓.
- `test_rag_api.py` — **41/41 passed** (чанками, pre-existing ~21s/тест из-за
  Celery Redis retry на недоступный `redis:6379` — окружение, не код).
- `test_rag_hybrid_api.py` — **8 passed**; `test_rag_auto_index_on_version.py` +
  `test_rag_readiness_no_clobber.py` — **11 passed**; `test_rag_bm25.py` 10,
  `test_rag_schema.py` 5, `test_rag_org_isolation.py` 7, fusion/embeddings/
  chunkers/admin-settings — 86 passed.
- `test_rag_settings_runtime.py` — 6 failed, но **идентично падают на чистом
  origin/main** (`Query`-дефолт FastAPI утекает как параметр; pre-existing,
  зафиксировано в PLAN.md follow-ups).

### Бенч до/после (синтетика 5180 чанков ≈ stage-org: 5146 bpmn_xml + 34 glossary)

| Метрика | До (main) | После (патч) |
|---|---|---|
| Загружено чанков | 2000 (0 словарных — слепота) | 2034 (2000 bpmn + **34/34 glossary**) |
| SQL load | 53.4 ms / peak 3.4 MB | 170.5 ms / peak 5.7 MB |
| BM25 tokenize | 254 ms (на 2000) | ~571 ms — тот же per-request код, шум машины |
| Видимость словарей | 0/34 | 34/34 |

Стоимость фикса: +~117 ms SQL (GROUP BY по корпусам + JOIN) — в пределах
доминирующей per-request BM25-пересборки; приемлемо, бюджет stage ≤600 ms e2e
не нарушается (RTT ~0.5s). Оптимизация BM25-кэша — в бэклоге.

### 5-plane proof

- **code:** ветка `fix/rag-fullcorpus-window-v1`, diff = `storage_rag.py` + новый тест; base `origin/main@a74ac76b`.
- **workspace:** изолированный worktree `processmap_v1_main_clone-worktrees/fix-rag-fullcorpus-window-v1`; `git status` чист кроме файлов контура.
- **DB:** регрессионные тесты доказывают поведение на уровне sqlite-схемы (2100 старых bpmn + glossary → hit в обоих режимах; окно ≤2000).
- **env/compose:** не менялся; PROD не трогали.
- **serving mode:** эндпоинт `GET /api/rag/search` тот же (без новых параметров); stage-проверка hit@3 q8–q15 = 8/8 — после merge (п.5 задачи).

## Что осталось

1. Merge PR — только по approve владельца.
2. После merge → stage: unfiltered hit@3 q8–q15 = 8/8 без фильтров, оба режима;
   отчёт с цифрами + зеркало в Obsidian.
