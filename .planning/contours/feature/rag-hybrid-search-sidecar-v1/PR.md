# PR (draft) — feat(rag): гибридный keyword+vector поиск с embedding sidecar

> Черновик для GitHub. **Не создавать PR до:** (1) мержа `rag-auto-index-on-version-v1`
> и rebase этой ветки, (2) явного approve владельца, (3) A/B-замера по `RETRIEVAL_AB.md`
> на stage (runbook §16). См. «Что НЕ сделано» внизу.

## Кратко

Добавляет гибридный retrieval (BM25 + косинусная близость эмбеддингов с RRF-fusion)
в RAG-поиск ProcessMap. Эмбеддинги генерирует изолированный sidecar-сервис
(`rag-embedder`, sentence-transformers, multilingual-e5-small) асинхронно через Celery —
вне request-path индексации и без ML-зависимостей в api/worker. Фича выключена по
умолчанию (`hybrid_enabled=0`), включается per-org конфигом в `rag_settings` без рестарта;
при любой недоступности векторного слоя поиск прозрачно деградирует на keyword-only
байт-в-байт как сегодня.

## Мотивация

Живой кейс: «что такое шокер». Keyword-only BM25 требует лексического совпадения токенов
и мажет на перефразировках («аппарат для быстрого охлаждения», «камера шоковой заморозки»):
aliases в glossary-чанке есть, но токенов запроса в них нет. Миграция `023_rag_embeddings_hybrid`
уже положила фундамент (`rag_embeddings.dimensions`, `model_id DEFAULT 'local-e5-small'`,
`rag_settings.hybrid_enabled/vector_weight/bm25_weight/embedding_model_id`), но колонки
были orphaned: рантайм их не читал, admin-флаги `embeddings_enabled/vector_search_enabled`
были жёстко `False`. Этот контур доводит 023 до работающего состояния.

## Что изменено (по файлам)

**Код:**
- `backend/app/rag/embeddings.py` *(новый)* — httpx-клиент sidecar: `EMBEDDINGS_BASE_URL`
  (default `http://rag-embedder:8000`), timeout 3s, любой сбой → `None` + WARN, cooldown
  после 3 неудач; `encode_vector` (`array('f')` float32, без numpy).
- `backend/app/rag/search.py` — `cosine_similarity`, `rank_by_vector`, `fuse_rrf`
  (k=60, order-only; чистый Python).
- `backend/app/rag/storage_rag.py` — org-scoped CRUD эмбеддингов: `upsert_rag_embeddings`
  (идемпотентно по `chunk_id:model_id`), `get_rag_embeddings`, `get_rag_chunk_texts`;
  cascade-delete эмбеддингов в `delete_rag_chunks_for_doc`; `insert_rag_chunks` возвращает
  свежие `chunk_id`.
- `backend/app/rag/indexer.py` — seam `_maybe_enqueue_embed(chunk_ids, org_id)` после
  `insert_rag_chunks` (skip на hash-unchanged); сбой публикации логируется, не ломает индексацию.
- `backend/app/rag_tasks.py` — задача `processmap.rag.embed_chunks` (bind, max_retries=1,
  retry 10s, `ignore_result=True`): тексты чанков → sidecar (`input_type=passage`) →
  upsert с `model_id` из ответа; mismatch model_id → permanent fail.
- `backend/app/routers/rag.py` — hybrid-ветка в `GET /api/rag/search` по `hybrid_enabled`
  (см. ниже); при `hybrid_enabled=0` исходный BM25-only код-путь нетронут.
- `backend/app/domains/storage/compat/repository.py` — DDL-bootstrap: `dimensions` в
  `rag_embeddings`, 4 колонки 023 в `rag_settings` (+ALTER-гварды для старых sqlite-БД).
- `backend/app/domains/storage/platform/repository.py` — `get_rag_settings` читает
  023-колонки с дефолтами (0, 0.5, 0.5, 'local-e5-small').
- `backend/app/routers/admin.py` — whitelist `_SAFE_RAG_FIELDS` + 4 поля + валидация PATCH;
  `embeddings_enabled`/`vector_search_enabled` — derived от `hybrid_enabled` (вместо стабов False).
- `rag-embedder/` *(новый)* — FastAPI + sentence-transformers (`intfloat/multilingual-e5-small`,
  CPU, модель в памяти с старта), e5-префиксы `query:`/`passage:`, `POST /embed`, `GET /health`,
  `model_id="local-e5-small"`, DIMENSIONS=384; Dockerfile `python:3.12-slim`.
- `docker-compose.yml` — сервис `rag-embedder` (только внутренняя сеть, без публикации портов,
  healthcheck); `EMBEDDINGS_BASE_URL` в api и celery-worker; `.env.example` дополнен.

**Тесты:**
- `backend/tests/test_rag_fusion_rrf.py` (15), `test_rag_embeddings_client.py` (9),
  `test_rag_hybrid_api.py` (8) — новые; regression: `test_rag_api.py` (41),
  `test_rag_bm25.py` (10), `test_admin_rag_settings.py` (14) — зелёные.

**Прочее:**
- `tools/rag/processmap-rag-validation-queries.json` — кейсы q11–q15 (перефразы/синонимы,
  включая «шокер») для A/B-приёмки.
- `.planning/contours/feature/rag-hybrid-search-sidecar-v1/` — PLAN.md, runbook §16,
  TESTS.md, git-proof.md, RETRIEVAL_AB.md, STATE.json.

## Как работает hybrid

1. Кандидатное множество — те же org-scoped чанки, что грузятся для BM25 (≤ `_MAX_CHUNKS_LOAD=2000`).
2. Query-эмбеддинг — один дешёвый вызов sidecar (`input_type=query`, таймаут 3s) в request-path;
   недоступен → сразу keyword-only.
3. Две полки на одном множестве: BM25-ranking (как сегодня, без min_score) и vector-ranking
   (косинус к эмбеддингам активной `model_id`; чанки без эмбеддинга в полку не попадают).
4. **RRF задаёт только порядок:** `fused(c) = w_bm25/(k+rank_bm25) + w_vec/(k+rank_vec)`,
   k=60, веса из `rag_settings`.
5. **Score — в BM25-шкале** для обратной совместимости с `min_score`
   (`monolith_client.search_rag` шлёт `min_score=0.1`): `score = max(bm25, cos·scale)`,
   `scale = max bm25 по кандидатам` (guard: пустая BM25-полка → scale=1.0). Существующий
   фильтр `score > min_score` и post-filters (source_type/session) применяются без изменений.
6. Эмбеддинги чанков — не в request-path: enqueue после `insert_rag_chunks`, worker ходит
   в sidecar и upsert'ит (`vector_data` = `array('f')` float32 LE, `dimensions=384`).

## Конфигурация

- `rag_settings` (per-org): `hybrid_enabled` (0/1, default 0), `bm25_weight`, `vector_weight`
  (default 0.5/0.5), `embedding_model_id` (default 'local-e5-small').
- Admin: `PATCH /api/admin/rag/settings` принимает новые поля (валидация: веса ≥ 0 числа,
  model_id непустая строка); `embeddings_enabled`/`vector_search_enabled` — derived,
  по-прежнему read-only (invariant).
- Env: `EMBEDDINGS_BASE_URL` (api, celery-worker), `EMBEDDINGS_MODEL` (sidecar).

## Fallback-матрица

| Условие | Поведение |
|---|---|
| `hybrid_enabled=0` (дефолт) | BM25-only, идентично сегодня |
| sidecar недоступен / timeout / cooldown | BM25-only + WARN, ответ успешный |
| у чанков нет embeddings / model_id mismatch | векторная нога пустая/частичная, RRF устойчив |
| `rag_embeddings` пустая | BM25-only |
| Агент (`monolith_client`) | без изменений — всё server-side |

## Тестирование

`97 passed` (команда и breakdown — в `.planning/.../TESTS.md`):
- unit: RRF-порядок/веса/отсутствующие ноги/формула score; клиент (fallback→None + WARN,
  roundtrip float32×384, cooldown);
- integration (sqlite-tempdir, stub sidecar): перефраз «аппарат для быстрой заморозки
  продуктов» (нулевое лексическое пересечение) → glossary `blast_chiller_1` top-1 при
  hybrid on; **деградация byte-identical**: hybrid-on-degraded (sidecar down / embeddings
  пусты) ≡ hybrid-off побайтово (chunk_id + score); hybrid-off → 0 вызовов sidecar;
  admin PATCH whitelist/persist/reject.
- OpenAPI-гейт: `update_openapi.sh --no-lint` → +0 paths/+0 operations, diff пуст.

## Раскатка

Дефолт выключен — нулевое влияние до включения. Включение/откат на stage — конфигом в БД
без рестарта, пошагово: runbook §16 (`PLAN.md` → «Runbook stage»): prereqs → реиндексация
словарей (`POST /api/rag/index-dictionaries` заполняет `rag_embeddings`) →
`PATCH {"hybrid_enabled": 1, ...}` → smoke-запросы → A/B. Мгновенный откат —
`PATCH {"hybrid_enabled": 0}` (поиск возвращается к keyword-only байт-в-байт).

## Out of scope

- `backend/services/agent/**`, frontend — не трогались; hybrid прозрачен server-side.
- Триггер переиндексации при версионировании — контур `rag-auto-index-on-version-v1`;
  интеграция через единый seam `_maybe_enqueue_embed` (их мерж первым, наш rebase).
- pgvector/ANN — не требуются (корпуса ≤2000 чанков, cosine на чистом Python).

## Риски

- Пересечение с `rag-auto-index-on-version-v1` в `indexer.py` — минимизировано узким seam.
- Latency query-embedding в request-path: in-docker RTT + кэш модели; критерий <20% —
  проверяется A/B; при сбое — keyword-only без ожидания (короткий таймаут + cooldown).
- `min_score`-семантика: score векторных находок приведён к BM25-шкале (§«Как работает»),
  regression-тестами фиксировано.

## Что НЕ сделано / требует follow-up

1. **A/B-замер retrieval (RETRIEVAL_AB.md) — PENDING.** Критерий приёмки
   «hybrid ≥ keyword на контрольном наборе» **не измерен end-to-end** — требуется живой
   sidecar (docker stack, env-lock). Выполняется при включении на stage по runbook §16
   до approve мержа.
2. **Rebase** после мержа `rag-auto-index-on-version-v1` (ветка behind origin/main
   на `b5808ac9`, см. git-proof.md).
3. Live-проверка sidecar `rag-embedder` (health, /embed на реальной модели) — первый
   шаг runbook §16.1 после деплоя.
