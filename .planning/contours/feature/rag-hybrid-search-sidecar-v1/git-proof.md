# git-proof — rag-hybrid-search-sidecar-v1

Дата снимка: 2026-09-04 (после rebase на мерж параллельного контура). Worktree:
`/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/feature/rag-hybrid-search-sidecar-v1`.

## Branch state (после rebase)

```
## feature/rag-hybrid-search-sidecar-v1...origin/main [ahead 16]
```

- **HEAD:** `ab356904424d42d8baf11e23fd8d03ee77885c3e`
- **origin/main (baseline):** `4fff681d1edf7000ce30b376a1b77bd7c09e1766`
  (`feat(rag): автоиндексация BPMN в RAG по созданию версии (bpmn_versions) (#911)` —
  мерж контура `rag-auto-index-on-version-v1`)
- **Rebase выполнен 2026-09-04:** `git rebase origin/main`, 16/16 коммитов,
  **конфликтов 0** (auto-merge). Бывший behind-1 (`b5808ac9` #910) вошёл в базу вместе с #911.
- **Интеграция двух контуров** (аддитивная, без перезаписи):
  - их цепочка: `create_bpmn_version_snapshot`/`_storage_save` →
    `_enqueue_rag_index_after_version` (`compat/repository.py`) →
    `index_session_bpmn_xml.delay`;
  - наш seam: `index_document` → `insert_rag_chunks` → `_maybe_enqueue_embed`
    (`rag/indexer.py`) → `embed_chunks.delay`;
  - итоговая цепочка: **version → index task → index_document → insert → embed enqueue** —
    оба контура выжили; новых call-site'ов `insert_rag_chunks` вне `index_document`
    у соседнего контура нет (их коммит: «indexer.py / storage_rag.py не тронуты»),
    поэтому единый seam покрывает все их новые триггеры.

## git log --oneline origin/main..HEAD

```
ab356904 docs(contour): Фаза 3 — draft PR (PR.md), git-proof, RETRIEVAL_AB methodology (PENDING), STATE -> 3-draft-pr-complete
50a721c7 docs(contour): TESTS.md Фазы 2 (97 passed) + STATE.json -> 2-tests-complete
b450bdb7 test(rag): hybrid-интеграция (sqlite-tempdir, stub sidecar) — fusion e2e, деградация sidecar/empty embeddings, regression hybrid off, admin PATCH whitelist
c7ebbf20 test(rag): embeddings-клиент unit-тесты — fallback->None + WARN (conn/timeout/500/bad payload), roundtrip float32x384, cooldown после 3 неудач
39ac4bc9 test(rag): RRF-fusion unit-тесты — порядок, веса, отсутствующие ноги, формула score max(bm25, cos*scale) с guard
eeb2492b fix(rag): embed_chunks ignore_result=True — fire-and-forget, без result-store соединения при .delay() (быстрая деградация при недоступном celery)
3293b6a5 feat(rag): validation-queries q11-q15 — periphrasis/synonym кейсы для hybrid-приёмки (§10)
2315bbcb feat(rag): sidecar rag-embedder (e5-small, /embed + /health), compose-сервис без публикации портов, EMBEDDINGS_BASE_URL в api/worker/.env.example
9df8aaf6 feat(rag): wiring 023-настроек — get_rag_settings + admin SAFE-fields/derived embeddings_enabled/vector_search_enabled
377534c4 feat(rag): hybrid-ветка в /api/rag/search — RRF-fusion, score в BM25-шкале, деградация на keyword-only без изменений при hybrid_enabled=0
ef1234ae feat(rag): celery-задача processmap.rag.embed_chunks + seam _maybe_enqueue_embed после insert_rag_chunks
0c9f261a feat(rag): embeddings-клиент sidecar (httpx, timeout, fallback->None, cooldown) + cosine/rank_by_vector/fuse_rrf (pure Python)
08fed98f feat(rag): org-scoped CRUD эмбеддингов (upsert/get/cascade-delete) + insert_rag_chunks возвращает chunk_ids
26bf3e17 feat(rag): DDL-bootstrap — rag_embeddings.dimensions и 023-колонки rag_settings (hybrid_enabled/веса/embedding_model_id)
7c3faeae docs(contour): rag-hybrid-search-sidecar-v1 — runbook включения/отката на stage (§16)
8c83b2e3 docs(contour): rag-hybrid-search-sidecar-v1 — PLAN.md (Фаза 0, hybrid keyword+vector retrieval)
```

## git status -sb

```
## feature/rag-hybrid-search-sidecar-v1...origin/main [ahead 16]
```

(снимок до коммита обновления STATE.json/git-proof интеграционного шага; после него ahead=17)

## git diff --stat origin/main...HEAD

```
26 files changed, 2050 insertions(+), 12 deletions(-)
```

Ключевые группы: `backend/app/rag/{embeddings,search,storage_rag,indexer}.py`,
`backend/app/rag_tasks.py`, `backend/app/routers/{rag,admin}.py`,
`backend/app/domains/storage/{compat,platform}/repository.py` (DDL 023 + интеграция с #911),
3 новых тестовых файла (705 строк), `docker-compose.yml`, `rag-embedder/`,
`tools/rag/processmap-rag-validation-queries.json` (q11–q15), `.planning`-артефакты.

## Проверки (после rebase)

- **Tests:** `104 passed, 6 warnings in 1039.79s` — полный набор:
  `test_rag_api.py` (41) + `test_rag_bm25.py` (10) + `test_rag_fusion_rrf.py` (15) +
  `test_rag_embeddings_client.py` (9) + `test_rag_hybrid_api.py` (8) +
  `test_admin_rag_settings.py` (14) + **`test_rag_auto_index_on_version.py` (7, контур #911)** —
  cross-contour regressions не выявлено, интеграционных багов нет, фиксов не потребовалось.
- **OpenAPI-гейт:** endpoint-изменений нет (search-ветка внутри существующего хендлера,
  admin отдаёт Any-схемы) → спека не меняется.
- Docker-команды не выполнялись; push не выполнялся.
