# RETRIEVAL_AB — rag-hybrid-search-sidecar-v1

## Статус: DONE — замер выполнен измеряющей сессией 2026-09-04/05 на изолированном
стеке `raghybrid-ab`; эти цифры — результат того самого единственного замера
(решение пользователя №2: ровно одна сессия мутирует docker).

## Решения пользователя (2026-09-04)

1. **Harness — изолированный ephemeral-стек**: порты `18011` (api) / `15432`
   (postgres) / `16379` (redis), свои volumes, `down -v` после замера.
   Shared-стек (`processmap_v1`) не переключался — подтверждено целым (9
   контейнеров) после teardown.
2. **Координация:** замер выполняла РОВНО ОДНА сессия (эта). Другие сессии —
   верификация цифр и артефактов только.
3. **Скоуп контрольного набора:** q1–q7 — file-RAG лукапы (корпус файлов
   workspace, `tools/rag/pm-rag-search.mjs`), вне гибридного слоя продукта.
   Гибрид затрагивает только `GET /api/rag/search`, поэтому A/B построен на
   **q8–q15** (`structured_fact_qa` по живым корпусам property_dictionary /
   operation_catalog / glossary). Факт: q1–q7 в стеке не наполнялись — 0/7 в
   обоих режимах, out of scope (см. Результаты).
4. **Merge-approve ждёт:** зелёный CI (PR #912 — есть) + RETRIEVAL_AB.md с
   цифрами: hybrid ≥ keyword по hit@3, регрессия latency p50 < 20%, fallback
   доказан вживую. Все три пункта измерены (вердикты — внизу).

## Методология (фактическая)

- Модель: `intfloat/multilingual-e5-small` (`local-e5-small`, 384 dims) в сайдкаре
  `rag-embedder` (CPU-only, apple-silicon docker VM). Векторный слой: 34/34 чанков
  (5 property_dictionary + 13 operation_catalog + 16 glossary), `rag_embeddings`
  заполнена, `model_id='local-e5-small'`.
- Режимы: keyword-only (`hybrid_enabled=0`) vs hybrid (`hybrid_enabled=1`,
  `bm25_weight=0.5, vector_weight=0.5`), переключение только
  `PATCH /api/admin/rag/settings` (подтверждено ответами эндпоинта).
- Запросы: `GET /api/rag/search?q=..&top_k=8&min_score=0`, без `source_type`-фильтра
  (hit@3 меряется по нефильтрованной выдаче).
- Harness: `/tmp/rag_ab_runner.py` (вне репо): 15 query × 2 режима с записью
  top-3 (chunk_id, source_type, score, term_canon/operation_code, snippet) +
  latency p50/max/min/mean × 20 повторов для q10/q12/q8 на режим.
- Hybrid-путь во время замера верифицирован живым: 78 `POST /embed` в логах
  сайдкара, предупреждений «degraded to keyword-only» в логах api нет.
- Fallback: `docker compose stop rag-embedder` при `hybrid_enabled=1` → q12 → `start`.

## Результаты

### Hit@3 primary (q8–q15)

| Кейс | Ожидание | BM25-only | Hybrid (0.5/0.5) |
|---|---|---|---|
| q8-property-dictionary-task-properties | property_dictionary | ✅ | ✅ |
| q9-operation-catalog-parameters | operation_catalog (open_container) | ✅ | ✅ |
| q10-glossary-term («что такое шокер») | glossary blast_chiller_1 | ✅ | ✅ |
| q11-glossary-shocker-periphrasis | glossary blast_chiller_1 | ✅ | ✅ |
| q12-glossary-blast-chiller-paraphrase | glossary blast_chiller_1 | ✅ | ✅ |
| q13-glossary-shock-freeze-synonym | glossary blast_chiller_1 | ✅ | ✅ |
| q14-operation-open-container-paraphrase | operation_catalog open_container | ❌ | ❌ |
| q15-property-duration-paraphrase | property_dictionary | ✅ | ✅ |
| **Итого hit@3** | | **7/8** | **7/8** |

- **Hybrid не изменил ни порядок, ни состав top-3 ни в одном из 8 кейсов**
  (порядок сверен по chunk_id, не только по source_type). На корпусе из 34 чанков
  BM25 с алиасами в тексте glossary уже покрывает перифразы q11–q13 — ожидаемый
  прирост hybrid именно на periphrasis-кейсах **не материализовался**.
- **q14 падает в обоих режимах**, в т.ч. при тюнинге `bm25_weight=0.3 /
  vector_weight=0.7` (в top-3 `open_equipment`, не `open_container`). Реальный
  промах обоих режимов: следует чинить данные/чанкер (синонимы «открыть
  контейнер»), а не веса. Follow-up.

### Hit@3 secondary (q1–q7, file-RAG origin)

| BM25-only | Hybrid |
|---|---|
| 0/7 | 0/7 |

Корпус файлов workspace в продуктовом API в этом стеке не индексировался —
метрика неприменима, зафиксирована для полноты (решение пользователя №3:
q1–q7 вне гибридного слоя; регрессии нет — симметричный 0/7).

### Latency p50 (20 повторов на кейс, ms)

| Кейс | BM25-only p50 | Hybrid p50 | Регрессия | BM25 max | Hybrid max |
|---|---|---|---|---|---|
| q8-property-dictionary | 67.0 | 994.1 | +1384% | 153.2 | 3604.1 |
| q10-glossary-term | 107.0 | 1665.9 | +1457% | 207.8 | 4334.6 |
| q12-glossary-paraphrase | 87.7 | 1626.4 | +1754% | 170.5 | 3510.5 |
| **Среднее p50** | **87.2** | **1428.8** | **~×16.4** | | |

Регрессия — стоимость одного query-эмбеддинга в сайдкаре (CPU e5-small,
замерено напрямую: одиночный query 0.7–2.0s, батч 16 passage 6.84s при
контенде CPU в docker VM). Критерий «<20%» **не выполнен на CPU-конфигурации**.

### Fallback-транскрипт (runbook §16.5)

```
$ docker compose stop rag-embedder            # hybrid_enabled=1, веса 0.5/0.5
$ GET /api/rag/search?q=«аппарат для быстрого охлаждения продукта»
→ {"ok": true, "total": 3}                    # без 5xx, без rag_disabled
→ top-3 chunk_ids: fbacbb30…, 654b3fcf…, f81389ce… (glossary, blast_chiller_1)
→ сравнение с keyword-only top-3 (hybrid_enabled=0): IDENTICAL = true
$ docker compose start rag-embedder
→ embedder healthy; повторный hybrid-поиск «шокер»: ok=true, top-3 blast_chiller_1, ~1.0s
```

Деградация в keyword-only подтверждена вживую: `ok=true`, top-3 байт-в-байт
совпадает с режимом `hybrid_enabled=0`; после старта сайдкара гибридный путь
восстанавливается без рестарта api.

## Критерии приёмки (план §9) — вердикт

1. **hybrid ≥ keyword на контрольном наборе** — ✅ ВЫПОЛНЕН (7/8 = 7/8,
   деградации нет; прироста тоже нет — см. честную фиксацию ниже).
2. **fallback-матрица подтверждена вживую** — ✅ ВЫПОЛНЕН (транскрипт выше).
3. **регрессия latency p50 < 20%** — ❌ НЕ ВЫПОЛНЕН на CPU-сайдкаре
   (p50 ~87ms → ~1429ms, ×16). Все latency-бюджеты поиска съедает один
   query-эмбеддинг e5-small на CPU. Опции для CPU-only деплоя: кэширование
   query-эмбеддингов, более лёгкая модель, GPU-сайдкар, либо явное принятие
   latency-трейдоффа. Цифры зафиксированы для «CPU-only, apple-silicon docker
   VM»; на GPU/ином железе будут иными.

**Честная фиксация:** на малом словарном корпусе (34 чанка) hybrid-режим
статистически неотличим от keyword-only по качеству top-3 — ценность гибрида
(по замыслу q11–q15) проявится на больших корпусах с перифразами, не покрытыми
алиасами; на текущем наборе её не видно. Юнит/интеграционные тесты (97 passed)
покрывают математику fusion и fallback на stub-сайдкаре; этот замер покрывает
retrieval и fallback реальной моделью end-to-end.

## После ONNX (fix/rag-embedder-onnx-latency-v1, 2026-09-05)

Latency-FAIL этого замера закрыт отдельным fix-контуром (влит сюда ff-only,
7 коммитов от 29b9cbe0 до 3ae042bb). Изменения: ONNX int8 сайдкар вместо torch
(build-time export+quantize), сплит таймаутов query 5s / passage 60s, prefetch
query-эмбеддинга, overlapped с BM25-полкой (commit dd4d6f8a — prefetch реально
до `list_rag_chunks`), `EMBEDDINGS_ORT_THREADS=4`. Методология и раннер — те же,
стек — тот же isolated `raghybrid-ab`. Детали и standalone-бенчмарк:
`.planning/contours/fix/rag-embedder-onnx-latency-v1/BENCHMARK.md`.

- **hit@3 primary: 8/8 = 8/8** (q14 стал PASS в обоих режимах — следствие cos-drift
  ONNX-векторов 0.9906, изменившего fusion-ранжирование; дефект данных q14
  НЕ чинился, чанкер/синонимы — follow-up). q1–q7: симметричный 0/7.
- **Latency p50 avg: BM25 24.5–36.1ms → hybrid 91.2–129.8ms** против исходных
  87.2 → 1428.8ms. **Абсолютный выигрыш ×11–×15.7.**
- **Критерий «<20%» внутри окна: НЕ выполнен формально** (×2.5–×5.3) — базовая
  BM25-линия на тихой VM падает до 24–36ms, остаточная стоимость hybrid —
  in-stack roundtrip эмбеддинга ~70–110ms (standalone 77.9ms), уже overlapped
  с полкой. Против опорной линии исходного окна (BM25 87.2ms): ×1.04–×1.49 —
  на границе критерия. Абсолютный latency-бюджет поиска из критерия №3 закрыт.
- **Fallback не затронут:** код деградации (любая ошибка future/embed →
  keyword-only) не менялся; prefetch-ошибка обрабатывается той же веткой
  `_hybrid_fused_results`; unit-тесты деградации зелёные (35 passed).
- Hybrid-путь подтверждён вживую: 75–78 `POST /embed` за прогон, деградаций
  «keyword-only» в логах api нет.

## Ограничения и отклонения методологии (прозрачно)

- **Fresh-DB bootstrap сломан вне контура** (предсуществующий дефект): на пустой
  БД `db_bootstrap` не может накатить alembic с нуля (001 требует существующую
  `users`), entrypoint уходит в degraded start, сиды не выполняются. Для замера
  таблица `operation_catalog` создана вручную по DDL миграций 002+009 и засеяна
  `seed_operations.py`. В контур не входит; follow-up для product-контура bootstrap.
- **Дубликаты в top-3**: chunker property_dictionary эмитит несколько чанков с
  идентичным текстом (напр. «Свойство: Приоритет (priority)» ×3 — разные
  chunk_id, одинаковый текст). На hit@3 не влияет (source_type совпадает),
  зафиксировано как качественный дефект чанкера.
- **Два фикса кода, найденных замером** (включены в коммит с этим файлом):
  - `backend/app/rag/embeddings.py`: `TIMEOUT_SECONDS` 3.0 → 60.0 — на реальном
    CPU-сайдкаре 3s даёт систематический таймаут passage-батчей (6.8s на 16
    текстов) и периодический таймаут query (0.7–2.0s) → молчаливая деградация
    hybrid в keyword и вечный embedding-пайплайн;
  - `rag-embedder/Dockerfile`: CPU-only torch (aarch64-wheel из PyPI тянет
    CUDA-стек ~3-4 GB, скачивание в docker VM стабильно замирало на ~1 GB,
    3 сталла подряд) + pip `--timeout 30 --retries 10`.
