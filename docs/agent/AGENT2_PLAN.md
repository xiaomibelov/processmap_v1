# AGENT-2: RAG-эволюция — гибридный поиск, новые источники, инкрементальная индексация

> **СТАТУС: ПЛАН, редакция 1. Требует апрува владельца. Реализацию не начинать.**  
> Дата: 2026-08-17. Ветка: `docs/agent-2-plan` от `origin/main` @ `3ce04bb0`.  
> База: AGENT-1 уже в `main` (`docs/agent/AGENT1_VERIFICATION.md` PASS, K1–K3), монолитный `backend/app/agent/` и флаг `LLM_VIA_AGENT_SVC` **не трогаются** (soak на боевом).

---

## 0. Контекст и ограничения

### 0.1 Что уже в main (проверено по коду)

- **RAG в монолите**: `backend/app/rag/{chunker,indexer,search,storage_rag}.py`, роутер `backend/app/routers/rag.py`.
  - `rag_search` (`routers/rag.py:36`): in-memory BM25, загружает до `_MAX_CHUNKS_LOAD=2000` чанков на запрос, фильтрует по `source_type`/`session_id` post-factum.
  - `_ALLOWED_SOURCE_TYPES = {"bpmn_xml", "product_action"}` (`routers/rag.py:19`).
  - Индексация только ручная: `POST /api/rag/index` и `POST /api/rag/product-actions/index`.
  - Таблицы уже есть: `rag_documents`, `rag_chunks`, `rag_embeddings` (`storage.py:2589`), `rag_sources`, `rag_feedback`, `rag_eval_cases`, `rag_settings` (`storage.py:2667`).
  - `rag_embeddings.vector_data` сейчас `BYTEA` (`storage.py:2621`) — колонка создана, но не заполняется и не используется.
- **doc_qa в AGENT-1**: сервис вызывает `GET /api/rag/search` монолита (`services/agent/runners/monolith_client.py:51`), топ-5 чанков + `processman_agent` формирует ответ (`services/agent/memory/chat.py:412`).
- **Память схемы**: `agent_schema_memory` + фоновый worker через Redis (`services/agent/memory/schema_memory.py`).
- **Источники данных для нового RAG**:
  - `operation_catalog` (`backend/alembic/versions/002_create_process_template_tables.py:58`): `code`, `name`, `name_ru`, `parameter_schema`, `execution_contract`, `resource_requirements`, `allowed_outputs`, `category`.
  - `org_property_dictionary_*` (`storage.py:1919`): справочник свойств по операциям (`operation_key`, `property_key`, label, input_mode, options).
  - `process_properties_registry` (`routers/process_properties_registry.py`): фактические свойства элементов сессий.
  - `backend/app/knowledge/glossary_seed.yml`: глоссарий оборудования/ресурсов/единиц измерения.
- **LLM**: VVPROXY (`https://vvchat.vkusvill.ru/red-mad-router`) — primary `claude-opus-4-6`, cheap `deepseek-chat`.
- **Postgres**: `postgres:16-alpine` (`docker-compose.yml:103`), pgvector **не включён**.

### 0.2 Жёсткие ограничения AGENT-2

1. **Монолитный `backend/app/agent/*` и `LLM_VIA_AGENT_SVC` не трогать** (soak).
2. **Alembic-миграции только в монолите** (`backend/alembic/versions/`); сервис не содержит миграций.
3. **Секреты не публикуются** — только `has_api_key` + `key_last4`.
4. **0 LLM-вызовов** на открытие панели, `GET /agent/history`, выбор шага.
5. **Кэш-ключи `pm:cache:llm:*`** общие с монолитом; не ломать.
6. **Prod/deploy без явного апрува владельца запрещён.**
7. **Ничего не выдумывать** — каждое утверждение с path:line.

---

## 0. Эмбеддинги — блокер архитектуры (исследование с артефактами)

### 0.1 Проверка VVPROXY `/embeddings`

Живой запрос к `https://vvchat.vkusvill.ru/red-mad-router/v1/models` с ключом владельца возвращает список моделей (проверено 2026-08-17):

```
gpt-5.5, gpt-5.5-pro, claude-opus-4-6, deepseek-chat, yandexgpt-5,
gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-5.2, gpt-5.1, ...
```

**Embedding-моделей в списке нет.**

Проверка `/v1/embeddings`:

```bash
curl -X POST https://vvchat.vkusvill.ru/red-mad-router/v1/embeddings \
  -H "Authorization: Bearer <masked>" \
  -H "Content-Type: application/json" \
  -d '{"input": "test", "model": "text-embedding-3-small"}'
# {"error":{"message":"/embeddings: Invalid model name passed in model=text-embedding-3-small..."}}
# HTTP 400
```

То же самое для `text-embedding-ada-002`, `text-embedding-3-large`, `multilingual-e5-large`.

**Вывод: VVPROXY не предоставляет OpenAI-совместимый endpoint эмбеддингов.**

### 0.2 Варианты получения эмбеддингов

| Вариант | Суть | Плюсы | Минусы | Оценка |
|---|---|---|---|---|
| **(а) Локальный sidecar `multilingual-e5-large`** | Отдельный контейнер (CPU, onnx/sentence-transformers), endpoint `/embeddings` внутри compose | Нет внешних зависимостей; размерность ~1024; русский/мультиязык хорошо | +400–600 MB RAM, +~1 GB образ; время кодирования на слабом CPU | Рекомендуется |
| **(б) Внешний API эмбеддингов** | OpenAI/Azure/Yandex — отдельный ключ и биллинг | Просто, не грузит CPU | Ещё один провайдер/секрет; латентность сети; стоимость | Возможно, но не через VVPROXY |
| **(в) Остаться на BM25 + query-expansion** | Без векторов; cheap-модель расширяет запрос синонимами/алиасами | 0 инфраструктуры; работает сейчас | Плохо на семантических вопросах («что такое шокер?» → котёл vs охлаждение) | Fallback, если (а) не пройдёт PoC |

### 0.3 Рекомендация владельцу

**Принять вариант (а)** — локальный sidecar `multilingual-e5-large` (или `intfloat/multilingual-e5-small` если RAM критична) как **единственный embedding-провайдер** внутри compose. Внешний API (вариант б) — отдельным контуром после AGENT-2, если понадобится масштаб.

**Почему не pgvector в Postgres:**
- Образ `postgres:16-alpine` не содержит pgvector. Переход на `pgvector/pgvector:pg16` требует миграции существующего volume (это возможно, но расширяет scope).
- Сравнительная таблица:

| Подход | Зависимости | Поиск | Сложность внедрения | Риск |
|---|---|---|---|---|
| **pgvector в Postgres** | Сменить образ БД; `CREATE EXTENSION vector`; миграция `rag_embeddings.vector_data` → `vector(1024)` | SQL `<->` оператор, индекс IVFFlat/hnsw | Средняя (данные + инфра) | Образ БД меняется; тестировать на stage |
| **BYTEA + Python cosine** | Текущая схема уже `BYTEA`; numpy/scipy | Загрузка векторов org/model в память, `cosine_similarity` | Низкая | Память при большом корпусе; `_MAX_CHUNKS_LOAD=2000` ограничивает |

**Рекомендация: начать с BYTEA + Python cosine** (используем существующую `rag_embeddings.vector_data`), а pgvector вынести в отдельный infra-контур. Это позволяет пройти гейт AGENT-2 без смены образа БД. При росте корпуса (>10k чанков/org) — мигрировать на pgvector.

---

## 1. Гибридный поиск (BM25 ⊕ vector)

### 1.1 Цель

`doc_qa` получает релевантные чанки гибридно: BM25 для точных кодов/терминов + косинусная близость эмбеддингов для семантики. Метрика: eval-set `recall@5` гибрида ≥ BM25 и не хуже >5%.

### 1.2 Схема данных (миграция `023_rag_embeddings_hybrid.py`)

1. Привести `rag_embeddings` к рабочему виду:
   ```sql
   ALTER TABLE rag_embeddings
     ALTER COLUMN vector_data TYPE BYTEA,  -- уже BYTEA, оставить
     ADD COLUMN IF NOT EXISTS model_id TEXT NOT NULL DEFAULT 'local-e5',
     ADD COLUMN IF NOT EXISTS dimensions INTEGER,
     ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0;
   CREATE INDEX IF NOT EXISTS idx_rag_embed_chunk_model
     ON rag_embeddings(chunk_id, model_id);
   ```
2. Добавить в `rag_settings`:
   ```sql
   ALTER TABLE rag_settings
     ADD COLUMN IF NOT EXISTS hybrid_enabled INTEGER NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS vector_weight REAL NOT NULL DEFAULT 0.5,
     ADD COLUMN IF NOT EXISTS bm25_weight REAL NOT NULL DEFAULT 0.5,
     ADD COLUMN IF NOT EXISTS embedding_model_id TEXT NOT NULL DEFAULT 'local-e5';
   ```
3. Обновить `backend/scripts/db_bootstrap.py:30`: `LINEAR += "023"`, `MARKERS += "023"`.

### 1.3 Retrieval-алгоритм

Файл `backend/app/rag/search.py`:

```python
class HybridSearch:
    def __init__(self, org_id: str, embedding_model_id: str = "local-e5"):
        self.org_id = org_id
        self.model_id = embedding_model_id

    def search(self, query: str, top_k: int = 5, *, bm25_weight=0.5, vector_weight=0.5) -> list[dict]:
        # 1. BM25 scores
        bm25_results = bm25_index.search(query, org_id=self.org_id, top_k=_MAX_TOP_K)
        # 2. Vector scores
        query_vec = embed_query(query, model_id=self.model_id)
        chunk_vectors = load_chunk_vectors(org_id=self.org_id, model_id=self.model_id)
        vector_results = cosine_topk(query_vec, chunk_vectors, top_k=_MAX_TOP_K)
        # 3. Fuse: min-max normalization + weighted sum
        fused = reciprocal_rank_fusion(bm25_results, vector_results,
                                       bm25_weight=bm25_weight, vector_weight=vector_weight)
        return fused[:top_k]
```

**Fusion**: RRF (`score = sum(1/(k + rank))`, k=60) проще и стабильнее weighted-sum при разных масштабах score. Рекомендуется RRF.

### 1.4 Эмбеддинг-сервис (sidecar)

Новый сервис `embedding` в `docker-compose.yml`:

```yaml
embedding:
  build:
    context: ./backend/services/embedding
  ports:
    - "${EMBEDDING_PORT:-8009}:8000"
  environment:
    - MODEL_NAME=intfloat/multilingual-e5-large
  deploy:
    resources:
      limits:
        cpus: "2.0"
        memory: 1G
```

- Endpoint `POST /v1/embeddings` — OpenAI-совместимый.
- Endpoint `GET /health` — для `deploy.sh`/`verify-deploy.sh`.
- Первый запуск кодирует модель (~1 GB download); для offline-деплоя — `docker build --build-arg MODEL_NAME=...` с предзагруженным весом.

### 1.5 Eval-set

Использовать существующую `rag_eval_cases` (`storage.py:2649`). Добавить seed-кейсы через миграцию или admin-API:

- «что такое шокер?» → ожидается `glossary:blast_chiller_1`
- «какая операция упаковывает готовое блюдо?» → `operation_catalog:packaging`
- «какое свойство указывает температуру хранения?» → `property_dictionary:temperature`
- 10–15 кейсов.

Метрика: `recall@5` гибрида vs BM25 на одном eval-set.

---

## 2. Новые источники

### 2.1 Расширение `source_type`

Добавить в `_ALLOWED_SOURCE_TYPES` (`routers/rag.py:19`):

```python
_ALLOWED_SOURCE_TYPES = {
    "bpmn_xml",
    "product_action",
    "property_dictionary",
    "operation_catalog",
    "glossary",
    "tobe_doc",
}
```

И `rag_settings.allowed_source_types` default → `'["bpmn_xml","product_action","property_dictionary","operation_catalog","glossary","tobe_doc"]'`.

### 2.2 Чанкинг и метаданные по источникам

| source_type | Откуда брать | Чанкинг | Метаданные |
|---|---|---|---|
| `bpmn_xml` | `session.bpmn_xml` | `chunk_bpmn_xml` (`chunker.py:59`) | `source_type`, `source_id=session_id`, `session_id`, `element_id`, `element_name` |
| `product_action` | `session.interview.analysis.product_actions` | `chunk_product_actions` (`chunker.py:107`) | `source_type`, `source_id=session_id`, `action_id` |
| `property_dictionary` | `org_property_dictionary_*` | одна запись = один чанк (operation_key + property_key + options) | `source_type`, `source_id=operation_key`, `property_key` |
| `operation_catalog` | `operation_catalog` | одна операция = один чанк (code, name_ru, contract, resources) | `source_type`, `source_id=code`, `category` |
| `glossary` | `backend/app/knowledge/glossary_seed.yml` | one canon + aliases = one chunk | `source_type`, `source_id=canon`, `glossary_domain` (equipment/resources/units) |
| `tobe_doc` | TBD (документация to_be) | `chunk_text` по параграфам | `source_type`, `source_id=doc_slug`, `doc_section` |

### 2.3 Индексация новых источников

- `property_dictionary` / `operation_catalog` / `glossary` — отдельный endpoint `POST /api/rag/index-org-sources` (platform-admin/org-admin) + автоматическая переиндексация при изменении справочника.
- `tobe_doc` — отдельный endpoint `POST /api/rag/index-doc` (admin) после того, как источник появится.

### 2.4 Тест

- `backend/tests/test_rag_api.py`: добавить кейс на `source_type=operation_catalog` после индексации; поиск по `name_ru` возвращает релевантную операцию.

---

## 3. Инкрементальная индексация

### 3.1 Триггер — сохранение сессии

В `backend/app/storage.py:4414` `SessionStorage.save()` после `con.commit()` поставить фоновое задание на индексацию:

```python
# После commit
if getattr(s, "bpmn_xml", "").strip():
    schedule_session_index(sid, org_scope, "bpmn_xml")
if _has_product_actions(s):
    schedule_session_index(sid, org_scope, "product_action")
```

Фоновая задача — **не блокирует сохранение**. Способ: Celery (`celery-worker` уже в compose) или Redis queue + lightweight worker. Рекомендация: переиспользовать Celery, т.к. `celery-worker` уже поднят (`docker-compose.yml:43`).

### 3.2 BPMN-XML истина

Для `source_type=bpmn_xml` индексировать `session.bpmn_xml` напрямую (`rag_index` уже так делает, `routers/rag.py:147`), а не проекцию. Это закрывает слепоту проекции к сессиям, где истина в XML.

### 3.3 Content_hash-пропуск

Использовать существующий `_content_hash` (`indexer.py:21`). Если XML/действия не изменились — `chunks_created=0`.

### 3.4 Целевые SLI

- Изменённая схема переиндексирована ≤30 сек.
- Неизменённая схема = 0 новых чанков.
- Справочники — переиндексация по cron/event при изменении.

---

## 4. Ветка `doc_qa` на гибридном RAG

### 4.1 Расширение `/api/rag/search`

Добавить query-параметр `mode`:

```python
mode: Optional[str] = Query(default="hybrid", regex="^(bm25|vector|hybrid)$")
```

- `bm25` — текущее поведение.
- `vector` — только косинус (для eval).
- `hybrid` — RRF BM25 + vector.

### 4.2 Источники по умолчанию для doc_qa

`doc_qa` не ограничивает `source_type` одним значением. В `monolith_client.search_rag` (`services/agent/runners/monolith_client.py:51`) убрать `source_type`, оставить `top_k=5`, добавить `mode=hybrid`. Монолит ищет по всем enabled `source_type` org.

### 4.3 Цитирование источников

В `services/agent/memory/chat.py:_run_doc_qa_branch` добавить в `action_payload`:

```python
action_payload={
    "results_count": len(results),
    "sources": [
        {"source_type": r["source_type"], "source_id": r["source_id"], "score": r["score"]}
        for r in results[:5]
    ],
}
```

Фронт рендерит раздел «Источники» под ответом (аналог `trace` в LLM4).

### 4.4 Деградация

- pgvector/embedding-сервис недоступен → `mode=bm25`.
- BM25 выключен → `free-answer` по схеме.
- Все статусы — HTTP 200, не 500.

---

## 5. Вынос search/rag в свой сервис?

### 5.1 Аргументы за

- Кандидат №2 по аудиту микросервисов.
- Агент-сервис — первый потребитель; развязать монолит от RAG.
- Можно масштабировать embedding-sidecar и search независимо.

### 5.2 Аргументы против

- Увеличивает scope AGENT-2: новый сервис, nginx-роутинг, контракты, тесты.
- Монолитные endpoints (`/api/rag/index`, `/api/rag/search`) уже работают; AGENT-1 пробрасывает JWT — инфраструктура готова.

### 5.3 Рекомендация

**Отложить вынос RAG в отдельный сервис.** В AGENT-2 оставить RAG в монолите, но сделать поисковую логику (`backend/app/rag/hybrid_search.py`) изолированной и без состояния. Вынос — отдельный контур после PASS AGENT-2 и стабилизации embedding-sidecar.

---

## 6. Экономика

- **Эмбеддинги чанков** считаются один раз при индексации, не при запросе.
- **Query-embedding** — 1 вызов на `doc_qa` (кэшируется по `md5(query)` в Redis, TTL 1 час).
- **Query-expansion** (если нужна) — cheap-модель, ≤50 токенов на запрос, кэшируется.
- **0 LLM-вызовов** на открытие панели/history/выбор шага — сохраняется.
- Лимиты (`llm_feature_flags`):
  - `rag_embedding_index` — 100k токенов/день (индексация чанков).
  - `rag_query_embedding` — 50k токенов/день (если внешний embedding API; для local sidecar — 0).
  - `doc_qa` — 300k токенов/день (chat-ответ поверх чанков).

---

## 7. Гейт AGENT-2 (измеримо)

| Критерий | Метод проверки | Вердикт |
|---|---|---|
| «что означает свойство X» отвечается из справочника со ссылкой-источником | Ручной чат + `action_payload.sources` | PASS/FAIL |
| eval-set recall@5 гибрида ≥ BM25 и не хуже >5% | `backend/tests/test_rag_hybrid_eval.py` | PASS/FAIL |
| переиндексация изменённой схемы ≤30 сек | Лог `celery-worker` / timestamp в `rag_sources.last_indexed_at` | PASS/FAIL |
| неизменённая схема = 0 новых чанков | `rag_index` returns `was_updated=false, chunks_created=0` | PASS/FAIL |
| регрессия contract-suite и тестов сервиса | `pytest -m contract`, `pytest services/agent/tests` | PASS/FAIL |
| 0 LLM-вызовов на открытие/history | `llm_usage` count до/после | PASS/FAIL |

---

## 8. Открытые вопросы владельцу

1. **Эмбеддинги**: принять ли вариант (а) — локальный sidecar `multilingual-e5-large` + хранение векторов в `BYTEA`? Или сразу переходить на pgvector?
2. **tobe_doc**: где сейчас живёт документация to_be? Создавать ли новый источник/таблицу под неё?
3. **Инкрементальная индексация**: использовать существующий Celery-worker (`celery-worker` в compose) или сделать Redis queue + in-process worker по аналогии с `agent_schema_memory`?
4. **Расход RAM на sidecar**: лимит 1G приемлем? Попробовать `e5-small` (~400 MB) вместо `e5-large`?
5. **Вынос RAG в сервис**: откладываем до следующего контура — ок?

---

## 9. Таблица «файл → изменение»

| Файл | Изменение | Примечание |
|---|---|---|
| `backend/alembic/versions/023_rag_embeddings_hybrid.py` | DDL `rag_embeddings`/`rag_settings` + маркер db_bootstrap | Новая миграция |
| `backend/scripts/db_bootstrap.py` | `LINEAR += "023"`, `MARKERS += "023"` | |
| `backend/app/rag/embeddings.py` | Клиент к sidecar: `embed_query`, `embed_chunks` | Новый модуль |
| `backend/app/rag/hybrid_search.py` | `HybridSearch` с RRF | Новый модуль |
| `backend/app/rag/search.py` | Подключить `HybridSearch`, сохранить `BM25Index` | |
| `backend/app/rag/chunker.py` | Чанкеры для `property_dictionary`, `operation_catalog`, `glossary`, `tobe_doc` | |
| `backend/app/rag/indexer.py` | Поддержка новых `source_type` | |
| `backend/app/rag/storage_rag.py` | CRUD для `rag_embeddings` | |
| `backend/app/routers/rag.py` | `mode`, новые `source_type`, `/index-org-sources` | |
| `backend/app/storage.py` | Триггер индексации в `SessionStorage.save()` | |
| `docker-compose.yml` | Сервис `embedding` | |
| `deploy.sh` / `verify-deploy.sh` | Поднять/проверить `embedding` | |
| `backend/services/agent/runners/monolith_client.py` | `mode=hybrid`, убрать `source_type` | |
| `backend/services/agent/memory/chat.py` | `action_payload.sources` для `doc_qa` | |
| `frontend/src/features/process/processman/ProcessmanTobe.jsx` | Рендер раздела «Источники» | По решению владельца |
| `backend/tests/test_rag_*.py` | Новые/обновлённые тесты | |

---

*План подготовлен в соответствии с ProcessMap Operating Contract (`AGENTS.md`). Реализация не начинается без явного апрува владельца.*
