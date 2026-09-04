# git-proof — rag-hybrid-search-sidecar-v1

Дата снимка: 2026-09-04. Worktree: `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/feature/rag-hybrid-search-sidecar-v1`.

## Branch state

```
## feature/rag-hybrid-search-sidecar-v1...origin/main [ahead 15, behind 1]
```

- **HEAD:** `907c4118b4d2724b11227a99d47b856e9cc1f596`
- **origin/main:** `b5808ac9aa0f867c2349306a42ce6e26e30a5b1b` (`fix(bpmn): сохранение связей к data store при resync подпроцесса... (#910)`)
- **behind 1:** `origin/main` продвинулся коммитом `b5808ac9` (#910) после старта контура.
  **Rebase отложен** до мержа параллельного контура `rag-auto-index-on-version-v1`
  (план §0.1: «он первым, этот контур ребейзится; конфликты — интеграция, не перезапись»;
  точка возможного пересечения — `backend/app/rag/indexer.py`, seam у нас — один хелпер
  `_maybe_enqueue_embed`).
- Working tree: clean (см. `git status -sb` ниже — артефакты этого коммита включены).

## git log --oneline origin/main..HEAD

```
907c4118 docs(contour): TESTS.md Фазы 2 (97 passed) + STATE.json -> 2-tests-complete
cff0064f test(rag): hybrid-интеграция (sqlite-tempdir, stub sidecar) — fusion e2e, деградация sidecar/empty embeddings, regression hybrid off, admin PATCH whitelist
1fe83e77 test(rag): embeddings-клиент unit-тесты — fallback->None + WARN (conn/timeout/500/bad payload), roundtrip float32x384, cooldown после 3 неудач
15f41450 test(rag): RRF-fusion unit-тесты — порядок, веса, отсутствующие ноги, формула score max(bm25, cos*scale) с guard
0cc33b0d fix(rag): embed_chunks ignore_result=True — fire-and-forget, без result-store соединения при .delay() (быстрая деградация при недоступном celery)
71dabb90 feat(rag): validation-queries q11-q15 — periphrasis/synonym кейсы для hybrid-приёмки (§10)
8283d8bf feat(rag): sidecar rag-embedder (e5-small, /embed + /health), compose-сервис без публикации портов, EMBEDDINGS_BASE_URL в api/worker/.env.example
c48f8a92 feat(rag): wiring 023-настроек — get_rag_settings + admin SAFE-fields/derived embeddings_enabled/vector_search_enabled
22f4ed26 feat(rag): hybrid-ветка в /api/rag/search — RRF-fusion, score в BM25-шкале, деградация на keyword-only без изменений при hybrid_enabled=0
51cb13ae feat(rag): celery-задача processmap.rag.embed_chunks + seam _maybe_enqueue_embed после insert_rag_chunks
4850a66d feat(rag): embeddings-клиент sidecar (httpx, timeout, fallback->None, cooldown) + cosine/rank_by_vector/fuse_rrf (pure Python)
590b5588 feat(rag): org-scoped CRUD эмбеддингов (upsert/get/cascade-delete) + insert_rag_chunks возвращает chunk_ids
f6bbb6d5 feat(rag): rag_embeddings.dimensions и 023-колонки rag_settings (hybrid_enabled/веса/embedding_model_id)
1216b1ec docs(contour): rag-hybrid-search-sidecar-v1 — runbook включения/отката на stage (§16)
49143daf docs(contour): rag-hybrid-search-sidecar-v1 — PLAN.md (Фаза 0, hybrid keyword+vector retrieval)
```

## git status -sb

```
## feature/rag-hybrid-search-sidecar-v1...origin/main [ahead 15, behind 1]
```

(снимок сделан до коммита артефактов Фазы 3; после коммита ahead станет 16, статус идентичный по смыслу)

## git diff --stat origin/main...HEAD

```
 .../feature/rag-hybrid-search-sidecar-v1/PLAN.md   | 267 ++++++++++++++
 .../READY_FOR_EXECUTION                            |   0
 .../rag-hybrid-search-sidecar-v1/STATE.json        |  23 ++
 .../feature/rag-hybrid-search-sidecar-v1/TESTS.md  |  78 +++++
 backend/app/domains/storage/compat/repository.py   |  17 +
 backend/app/domains/storage/platform/repository.py |  15 +
 backend/app/rag/embeddings.py                      |  96 ++++++
 backend/app/rag/indexer.py                         |  22 +-
 backend/app/rag/search.py                          |  82 +++++
 backend/app/rag/storage_rag.py                     |  81 ++++-
 backend/app/rag_tasks.py                           |  54 +++
 backend/app/routers/admin.py                       |  51 +++-
 backend/app/routers/rag.py                         |  95 +++++-
 backend/tests/test_rag_embeddings_client.py        | 152 ++++++++
 backend/tests/test_rag_fusion_rrf.py               | 169 +++++++++
 backend/tests/test_rag_hybrid_api.py               | 384 +++++++++++++++++++++
 docker-compose.yml                                 |  24 ++
 rag-embedder/Dockerfile                            |  15 +
 rag-embedder/main.py                               |  52 +++
 rag-embedder/requirements.txt                      |   3 +
 tools/rag/processmap-rag-validation-queries.json   |  54 +++-
 23 files changed, 1727 insertions(+), 12 deletions(-)
```

(без учёта файлов Фазы 3: `git-proof.md`, `PR.md`, `RETRIEVAL_AB.md`, обновлённый `STATE.json`)

## Проверки

- Tests: `97 passed` — см. `TESTS.md` (команда и breakdown).
- OpenAPI-гейт: `./scripts/update_openapi.sh --no-lint` → `298 paths / 377 operations (+0/+0)`,
  diff `docs/openapi.yaml` пуст (admin rag settings отдаёт `Any`-схемы, контракт стабилен).
- Docker-команды не выполнялись (shared env rules); sidecar проверен только через stub в тестах.
