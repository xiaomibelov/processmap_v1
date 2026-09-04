# PLAN — rag-hybrid-search-sidecar-v1

## 0. Source / runtime truth (зафиксировано 2026-09-04)

- **Worktree:** `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/feature/rag-hybrid-search-sidecar-v1`
- **Ветка:** `feature/rag-hybrid-search-sidecar-v1`, создана от `origin/main`
- **HEAD == origin/main:** `37a55e410f10dc5d54492140af53dc47961f14fa` (включает fix-волну: `fix(agent): structured_fact_qa ищет справочники без session-scope (#906)`, дубль-alembic-033 #905, workspace-explorer #903)
- **Working tree:** clean (`git diff --name-only` = 0 файлов)
- **RAG preflight:** `node tools/rag/pm-rag-agent-preflight.mjs` — НЕДОСТУПЕН (`node` отсутствует на хосте). Docker-вариант `pm-rag-search.mjs` — выполнен, prior art учтён (см. §13). Зафиксировано, продолжаем.
- **Параллельный контур:** `rag-auto-index-on-version-v1` — worktree существует (`p0-work-worktrees/feature-rag-auto-index-on-version-v1`), ветка == `origin/main`, коммитов нет, артефактов нет → ещё в планировании. Порядок мержа: он первым, этот контур ребейзится; конфликты — интеграция, не перезапись (точка возможного пересечения: `backend/app/rag/indexer.py`).

## 1. Контур

- **Тип:** feature
- **Название:** rag-hybrid-search-sidecar-v1
- **AGENT_RUN_ID:** `kimi-agent-4-20260904T160735`

## 2. Контекст и мотивация

После `rag-dictionaries-coverage-v1` (в main: chunkers для `property_dictionary` / `operation_catalog` / `glossary`, `_ALLOWED_SOURCE_TYPES` расширен) и `fix/structured-fact-qa-runtime-v2` (#906: structured_fact_qa ищет org-wide корпуса без session-scope) retrieval — чистый BM25 (`backend/app/rag/search.py`, custom, k1=1.5/b=0.75). Живой кейс: «что такое шокер» — keyword-only мажет на перефразировках («камера шоковой заморозки», «аппарат для быстрого охлаждения»), т.к. aliases в glossary-чанке есть, но BM25 требует лексического совпадения токенов. Миграция `023_rag_embeddings_hybrid` фундамент уже положила: `rag_embeddings.dimensions`, `model_id DEFAULT 'local-e5-small'`, индекс `(chunk_id, model_id)`, колонки `rag_settings.hybrid_enabled / vector_weight / bm25_weight / embedding_model_id` — до рантайма не доведены (orphaned: `get_rag_settings` их не читает, admin-стабы `embeddings_enabled/vector_search_enabled` жёстко False).

## 3. Цели (по постановке)

1. **Hybrid retrieval:** keyword (BM25) + vector (cosine) с fusion-ранжированием, веса конфигурируемые per-org.
2. **Embedding sidecar:** генерация/обновление эмбеддингов асинхронно (при индексации/реиндексации через Celery), НЕ в request-path сохранения документов.
3. **Fallback:** vector-слой недоступен/пуст → прозрачная деградация на keyword-only, без ошибок агента.
4. **Validation-набор:** добавить в `tools/rag/processmap-rag-validation-queries.json` кейсы на перефразировки и синонимы, включая «шокер» (periphrasis → glossary).

## 4. OUT of scope (по постановке)

- Триггер индексации при версионировании — контур `rag-auto-index-on-version-v1` (хук у нас — точка интеграции, не дублирование).
- Промпт-стек и роутер агента (`backend/services/agent/...`) — не трогаем; hybrid прозрачен server-side (`monolith_client.search_rag` без изменений).
- Frontend — не трогаем.
- pgvector / ANN-индексы — не требуются (корпуса ≤2000 чанков, см. §6).

## 5. Фактическое устройство (evidence, из investigation)

| Факт | Где | Плановое следствие |
|---|---|---|
| BM25 custom, индекс строится per-request из DB | `backend/app/rag/search.py` (87 строк) | vector-leg переиспользует те же загруженные чанки |
| `_MAX_CHUNKS_LOAD = 2000`, session/source_type post-filter | `backend/app/routers/rag.py:25,65-81` | граница корпуса для in-memory cosine |
| Embedding-хуки: dedup по content_hash → skip; after `insert_rag_chunks` | `backend/app/rag/indexer.py:47-53,88` | enqueue Celery-задачи; cascade-delete эмбеддингов в `delete_rag_chunks_for_doc` |
| `rag_embeddings`: `vector_data BYTEA`, нет numpy/pgvector; никто не пишет | `backend/app/domains/storage/compat/repository.py:2151`; grep-verified | сериализация `array('f')` (float32 LE), cosine на чистом Python; никаких новых тяжёлых deps в api/worker |
| Celery готов: `app/celery_app.py`, worker-сервис есть, **beat-контейнера нет** | `docker-compose.yml:44-68` | sidecar-триггер — `.delay()` из пути индексации, не расписание |
| LLM-инфра: DeepSeek/gateway — только chat-completions | `app/ai/*` | embeddings — отдельный HTTP sidecar, не LLM gateway |
| `rag_settings` per-org + admin `_SAFE_RAG_FIELDS`, стабы False | `platform/repository.py:153`, `admin.py:1853-1858,1930-1952` | wiring 023-колонок: `get_rag_settings` + whitelist (внутри скоупа «конфиг весов/fusion») |
| Тесты: sqlite-tempdir + `importlib.reload(app.storage)` + `_DummyRequest` | `backend/tests/test_rag_api.py:26-39` | новые тесты — по тому же паттерну |
| Открытый OpenAPI-гейт | `scripts/update_openapi.sh`, CI `spec-drift` | при изменении admin-эндпоинтов — обновить `docs/openapi.yaml` |

## 6. Архитектура

### 6.1 Компоненты

```
index path (API /api/rag/index, /index-dictionaries, index-all)
  └─ indexer.index_document()
       ├─ dedup (content_hash) → unchanged → return (embedding-skip)
       ├─ delete_rag_chunks_for_doc()  + NEW delete_rag_embeddings_for_doc()
       ├─ insert_rag_chunks()
       └─ NEW enqueue_embed_chunks.delay(chunk_ids)   ← Celery, вне request-path ответа

celery-worker
  └─ task processmap.rag.embed_chunks
       └─ POST {EMBEDDINGS_BASE_URL}/embed  (sidecar)
       └─ upsert_rag_embeddings(chunk_id, org_id, model_id, float32-bytes, dimensions)

search path (GET /api/rag/search)
  └─ rag_settings.hybrid_enabled?
       ├─ 0/off → BM25-only (сегодняшнее поведение, байт-в-байт)
       └─ 1/on  → BM25 rank + vector rank → RRF-fusion → min_score-фильтр → post-filters (session/source_type как сегодня)
```

### 6.2 Fusion (RRF с конфигурируемыми весами)

- Две полки ранжирования на одном кандидатном множестве (org-scoped чанки, загруженные для BM25 — векторные к ним джойнятся по `chunk_id` из `rag_embeddings` для активной `model_id`).
- RRF: `fused(c) = w_bm25 · 1/(k + rank_bm25(c)) + w_vec · 1/(k + rank_vec(c))`, `k=60` (константа), `w_bm25/w_vec` — из `rag_settings` (дефолты 0.5/0.5 из 023). Отсутствующие кандидаты в полке не участвуют.
- **min_score-совместимость** (критично: `monolith_client.search_rag` шлёт `min_score=0.1` по умолчанию): RRF-ранкинг используется только для **порядка**; в `score` результата пишется `max(bm25_score, cos_sim · scale)`, где `scale = max bm25_score по кандидатам` (оценочная шкала). Тогда keyword-only hits получают прежние score, vector-only hits — сопоставимую шкалу, и фильтр `score > min_score` не отсекает векторные находки.
- `min_score` фильтр применяется после fusion к обоим ногам (как сегодня — к BM25-ноге), поведение при `hybrid_enabled=0` не меняется.

### 6.3 Embedding sidecar (env/compose plane)

- **Новый compose-сервис `rag-embedder`**: минимальный FastAPI-образ + `sentence-transformers`, модель **`intfloat/multilingual-e5-small`** (~120 МБ, CPU, мультиязычная — критично для RU-перефразировок). `model_id` в БД — ровно `'local-e5-small'` (совместимость с DEFAULT из 023). Порт внутренний (docker network), наружу не публикуется.
- **Контракт:** `POST /embed {"texts": [...]} → {"embeddings": [[...]], "model_id": "local-e5-small", "dimensions": 384}`; `GET /health`.
- **Backend-конфиг:** `EMBEDDINGS_BASE_URL` (env, дефолт `http://rag-embedder:8000`), таймаут ~3 с, `pybreaker`-стиль защиты по аналогии с существующими клиентами.
- Почему не sentence-transformers в api/worker напрямую: тяжёлая зависимость (torch) в каждом api/worker-контейнере; sidecar изолирует, масштабируется отдельно и падает безболезненно (fallback). Prior art из review-отчётов соседних контуров фиксировал «No embeddings/vector DB/package install» как инвариант — sidecar сохраняет дух инварианта (прод-код backend не обрастает ML-deps).

### 6.4 Хранение поверх 023

- `vector_data` — `array('f').tobytes()` (float32 LE), `dimensions=384`. Новая миграция **не требуется**; DDL-фундамент есть. Если при реализации обнаружится нужда (например, колонка `updated_at` на embeddings) — миграция 024 строго поверх 023, линейная цепочка (урок инцидента duplicate-033, T07).
- Новые storage-функции: `upsert_rag_embeddings(rows)`, `get_rag_embeddings(org_id, model_id, chunk_ids)`, `delete_rag_embeddings_for_doc(doc_id)` (cascade в `delete_rag_chunks_for_doc`); все org-scoped по образцу `storage_rag.py`.

### 6.5 Fallback-матрица

| Условие | Поведение |
|---|---|
| `hybrid_enabled=0` (дефолт) | BM25-only, идентично сегодня |
| sidecar недоступен / таймаут / breaker open | BM25-only + WARN-лог; ответ успешный |
| у чанков нет embeddings / model_id mismatch | BM25-only для затронутых кандидатов (нога вектора просто пустая) |
| `rag_embeddings` пустая таблица | BM25-only |
| Агент (`monolith_client`) | без изменений — всё server-side |

### 6.6 Конфигурация

- `get_rag_settings` (platform/repository.py:153) расширяется чтением 023-колонок с дефолтами `hybrid_enabled=0, vector_weight=0.5, bm25_weight=0.5, embedding_model_id='local-e5-small'`.
- Admin whitelist `_SAFE_RAG_FIELDS` дополняется этими полями; инвариантные стабы `embeddings_enabled/vector_search_enabled` (admin.py:1857-1858) заменяются чтением реальных значений. **OpenAPI-гейт:** изменение admin-эндпоинта → `./scripts/update_openapi.sh` + `redocly lint` = 0 errors, `docs/openapi.yaml` в коммите.

## 7. Изменения по файлам (минимальный дифф)

**IN (product code):**
- `backend/app/rag/search.py` — + `fuse_rrf(bm25_ranked, vec_ranked, w_bm25, w_vec, k=60)`; + cosine-нога `rank_by_vector(chunks, embeddings, query_vec)` (чистый Python).
- `backend/app/rag/embeddings.py` **(новый)** — HTTP-клиент sidecar (httpx, таймаут, ошибки→None), `get_query_embedding(q)`, `get_embeddings_for_texts(texts)`.
- `backend/app/rag/indexer.py` — enqueue embed после `insert_rag_chunks`; cascade delete embeddings.
- `backend/app/rag/storage_rag.py` — CRUD эмбеддингов (§6.4).
- `backend/app/routers/rag.py` — wiring fusion в `rag_search` по `hybrid_enabled`; query-embedding в request-path (это допустимо: запрет касался **генерации/обновления** документных эмбеддингов; query-embed — дешёвый вызов sidecar с кэшем).
- `backend/app/rag_tasks.py` — новая Celery-задача `processmap.rag.embed_chunks`.
- `backend/app/domains/storage/platform/repository.py` — `get_rag_settings` + 023-колонки.
- `backend/app/admin.py` — `_SAFE_RAG_FIELDS` + снятие стабов (если endpoint меняется — OpenAPI-гейт).
- `docker-compose.yml` — сервис `rag-embedder` (+ `.env.example`).
- `tools/rag/processmap-rag-validation-queries.json` — новые кейсы (§10).

**OUT:** всё в §4 плюс любые изменения в `backend/services/agent/**` и frontend.

## 8. Фазы реализации

- **Фаза 1 (код, после approve):** storage-CRUD → embeddings-client → celery-task → indexer hooks → fusion в search/routers → settings wiring → compose sidecar → validation-queries. Строго по порядку, минимальными коммитами.
- **Фаза 2 (тесты):**
  - unit: `test_rag_fusion_rrf.py` (RRF math, веса, отсутствующие ноги), `test_rag_embeddings_client.py` (fallback→None при недоступности);
  - integration по паттерну `test_rag_api.py` (sqlite-tempdir): keyword+vector fusion end-to-end с stub-sidecar; деградация (embeddings пусто / sidecar 500 → keyword отвечает, `ok=true`);
  - regression: существующие rag-тесты зелёные; `hybrid_enabled=0` → поведение байт-в-байт.
- **Фаза 3 (PR):** draft PR на русском, без merge. Артефакты: `PR.md`, `RETRIEVAL_AB.md`, `TESTS.md`, `git-proof.md`.

## 9. A/B-замер (RETRIEVAL_AB.md)

- **Набор:** расширенные validation-queries (§10) — keyword-only vs hybrid (`hybrid_enabled` переключается через admin-настройку/org, переиндексация тем же `POST /api/rag/index-dictionaries`).
- **Метрика:** hit@k (k=3) по `expected_sources`/`expected_terms`; плюс latency поиска (p50) — критерий «не деградирует >20%».
- **Harness:** локальный compose-стек под `tools/pm-env-lock.sh acquire` (shared env mutex, AGENTS.md §10); python-runner по образцу `validate_retrieval.py` контура dictionaries (sqlite-вариант для unit, compose-вариант для A/B).
- **Критерий приёмки:** hybrid ≥ keyword на контрольном наборе (ожидаемый прирост именно на periphrasis-кейсах), fallback работает, latency-регрессия <20%.

## 10. Новые validation-кейсы (tools/rag/processmap-rag-validation-queries.json)

Схема — существующая (v1.1.2), `query_type: "structured_fact_qa"`. Минимум:

| id | query | expected_sources | Суть |
|---|---|---|---|
| q11-glossary-shocker-periphrasis | что такое шокер | glossary | прямой «шокер»-кейс (term_canon=blast_chiller_1) — baseline |
| q12-glossary-blast-chiller-paraphrase | аппарат для быстрого охлаждения продукта | glossary | перефраз без слова «шокер» — keyword-only мажет |
| q13-glossary-shock-freeze-synonym | камера шоковой заморозки | glossary | синонимичное словообразование |
| q14-operation-open-container-paraphrase | как открыть контейнер в процессе | operation_catalog | перефраз open_container |
| q15-property-duration-paraphrase | сколько времени длится задача по умолчанию | property_dictionary | перефраз duration/default_value |

## 11. Доказательная модель (5-plane proof, чек-лист на финал)

1. **code:** ветка/коммиты с фиксом, diffstat, `hybrid_enabled=0` default.
2. **workspace:** этот worktree, clean tree, rebase после мержа `rag-auto-index-on-version-v1`.
3. **DB:** `rag_embeddings` заполнены (row counts per org/model_id), `vector_data` валидный float32, `dimensions=384`.
4. **env/compose:** сервис `rag-embedder` healthy в стеке `processmap_v1`; worker консьюмит задачи; без beat (не нужен).
5. **serving mode:** `GET /api/rag/search` с hybrid on/off против живого стека; A/B-таблица в `RETRIEVAL_AB.md`.

## 12. Риски

| Риск | Митигация |
|---|---|
| Пересечение с `rag-auto-index-on-version-v1` в `indexer.py` | хук — узкая точка (enqueue после insert); их мерж первым, наш rebase; конфликт = интеграция обоих хуков |
| Query-embedding в request-path добавляет latency | sidecar in-docker RTT ~5-30 мс + кэш модели в памяти; критерий <20%; при сбое — keyword-only без ожидания (короткий таймаут) |
| `min_score`-семантика сломает векторные находки | §6.2: RRF только для ранга, score — в шкале BM25 |
| sentence-transformers/torch в контейнере | изолировано в sidecar; api/worker deps не меняются |
| A/B без прода | локальный compose-стек, seeded dictionaries (glossary seed уже в backend) |
| OpenAPI drift | §6.6 гейт обязателен при изменении admin-эндпоинта |

## 13. Prior art (RAG, docker-поиск по индексу)

- Review-отчёты контуров `processmap-agent-rag-coverage-and-validation-hardening-v1` / `processmap-agent-rag-bm25-manifest-search-v1` фиксировали инвариант «No embeddings/vector DB/package install» → сохраняем через sidecar-изоляцию.
- `audit/save-decomposition/_RAW_NOTES_AI_RAG_ADMIN_SAVE_PATHS.md` — подтверждает устройство `index_document` (hash-dedup, chunk, upsert) — хуки выбраны в точках, не меняющих контракт.
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RUNTIME_NAVIGATION.md` — rag_settings-gating (enabled/top_k/max_top_k/min_score) — расширяем, не ломаем.

## 14. Артефакты контура

- `PLAN.md` (этот файл) — Фаза 0
- Далее: `RETRIEVAL_AB.md`, `TESTS.md`, `PR.md`, `git-proof.md`, `STATE.json`, `AGENT_RUN_ID`, флаг `READY_FOR_EXECUTION`
- Mirror в Obsidian: попытка `tools/pm-agent-mirror-report.sh` (ожидается failure на этой машине — фиксируем причину, mirror дублируется записью в vault при завершении, как в dictionaries-контуре).

## 15. Завершение

- STOP после Фазы 0 → approve пользователя, далее Фазы 1-3.
- Никаких merge / deploy / PR-merge без явного approve. PROD не трогать. Stage — только после approve как отдельный шаг.

## 16. Runbook stage — включение и откат (письменная процедура, дополнение по approve)

Фича включается конфигом в БД, **без рестарта сервисов и без передеплоя**. Действия выполняются с токеном admin/org-admin соответствующей org (настройки per-org, таблица `rag_settings`).

### 16.1 Prereqs (после деплоя контура на stage)

1. Sidecar поднят: `docker compose ps rag-embedder` → `healthy`; `curl -sf http://localhost:<внутренний порт>/health` (через exec в сети стека) → OK.
2. Worker жив: `docker compose ps celery-worker` → Up; в логах нет ошибок импорта задачи `processmap.rag.embed_chunks`.
3. Миграции применены (023 и ранее — цепочка целая, дублей revision нет).

### 16.2 Наполнение векторного слоя (однократно, до включения)

Для каждой org, где включаем hybrid:

```bash
# 1) Реиндексация корпусов -> enqueue embed-задачи -> rag_embeddings заполняется
curl -s -X POST https://stage.processmap.ru/api/rag/index-dictionaries \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'

# 2) Проверка, что эмбеддинги записались (ожидание: worker отработал за секунды)
#    ожидаем rows > 0 для model_id='local-e5-small'
```

Порядок строгий: сначала §16.2, потом §16.3. Включать hybrid на пустом векторном слое бессмысленно (деградация на keyword-only прозрачна, но цель — векторная нога).

### 16.3 Включение

```bash
# Веса по умолчанию 0.5/0.5; при перефраз-нагруженном трафике можно vector_weight=0.6
curl -s -X PATCH https://stage.processmap.ru/api/admin/rag/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"hybrid_enabled": 1, "bm25_weight": 0.5, "vector_weight": 0.5}'
```

Smoke сразу после включения:

```bash
# 1) Прямой кейс (baseline)
curl -s "https://stage.processmap.ru/api/rag/search?q=что такое шокер&source_type=glossary&top_k=3" -H "Authorization: Bearer $TOKEN"
# 2) Перефраз (признак, что векторная нога работает)
curl -s "https://stage.processmap.ru/api/rag/search?q=аппарат для быстрого охлаждения продукта&source_type=glossary&top_k=3" -H "Authorization: Bearer $TOKEN"
```

Ожидание: оба запроса возвращают glossary-чанк `term_canon=blast_chiller_1` в top-3; `ok=true`. Затем A/B и latency-замер по §9 (RETRIEVAL_AB.md).

### 16.4 Откат (rollback)

**Мгновенный конфиг-откат (основной путь):**

```bash
curl -s -X PATCH https://stage.processmap.ru/api/admin/rag/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"hybrid_enabled": 0}'
```

Эффект: search path возвращается к keyword-only **байт-в-байт** (кодовая ветка та же, что до фичи); рестарты не нужны; эмбеддинги в БД не мешают и не участвуют в поиске.

**Если sidecar сам является источником проблем** (съел CPU/падает с ошибками):

```bash
docker compose stop rag-embedder
# поиск автоматически деградирует на keyword-only (WARN в логах api), ответы агенту успешные
docker compose start rag-embedder   # восстановление
```

**Полный откат данных (только если требуется освободить место / сбросить слой):**

```sql
TRUNCATE TABLE rag_embeddings;  -- опционально; на поведение при hybrid_enabled=0 не влияет
```

**Восстановление после отката:** повторить §16.2 → §16.3.

### 16.5 Контрольные точки

| Проверка | Как | Норма |
|---|---|---|
| Векторный слой заполнен | count `rag_embeddings` per org/model_id | > 0 до включения |
| Fallback жив | `docker compose stop rag-embedder` → search ok=true | keyword-only без 5xx |
| Откат чистый | после `hybrid_enabled=0` diff ответов vs до фичи | идентичен на контрольных запросах |
| Latency | p50 search до/после | регрессия <20% |
