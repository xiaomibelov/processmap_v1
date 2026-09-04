# BENCHMARK — fix/rag-embedder-onnx-latency-v1

Замер сравнивает embedding-сайдкар torch (до) и ONNX int8 (после) на одной
машине: apple-silicon docker VM (10 cores, контенде с shared-стеком
`processmap_v1-*` и хост-процессами), linux/arm64, CPU-only, без GPU.
Методология идентична для обеих веток: standalone-контейнер, HTTP /embed,
замер wall-time клиентом; одни и те же входные тексты; одно окно времени.

## Версии

- ДО: `raghybrid-ab-rag-embedder:latest` (torch 2.14.0+cpu, sentence-transformers 6.0.1, intfloat/multilingual-e5-small fp32, качается при старте).
- ПОСЛЕ: `onnx-bench-embedder:latest` (onnxruntime 1.29, model_int8.onnx — int8 dynamic quantization весов MatMul/Gemm, запечён при билде; токенизация tokenizers по tokenizer.json).
- Контракт ответа идентичен: model_id `local-e5-small`, dimensions 384, query:/passage: префиксы.

## Результаты standalone

Ограничение контейнера `--cpus=2.0 -m 1G` (кроме строк «no limit»):

| Метрика | torch (ДО) | ONNX default threads | ONNX threads=2 | ONNX threads=4 (no limit) |
|---|---|---|---|---|
| Старт до healthy | ~2.5–6 мин (скачивание модели) | ~20s | ~20s | ~20s |
| Cold first query, ms | 2238.2 | 961.3* | 139.8 | 209.1 |
| Warm query p50 (n=20), ms | 617.0 | 576.4 | **77.9** | 84.1 |
| Warm query min/max, ms | 456.0 / 2013.2 | 207.0 / 3511.4 | 32.3 / 390.0 | 25.6 / 271.0 |
| Batch-16 passage p50 (n=5), ms | 8033.4 | 5719.6 | **266.6** | 1194.5 |
| Batch-16 min/max, ms | 2303.2 / 11106.2 | 2925.6 / 7835.0 | 139.6 / 311.5 | 990.9 / 1748.0 |

\* ONNX делает warm-up инференс при старте (прогрев тред-пула ort), поэтому
«cold first query» у ONNX — первый внешний вызов после прогрева; у torch —
первый вызов после загрузки модели (без прогрева).

**Ключевой вывод №1 — квантование и рантайм:** ONNX int8 vs torch fp32 при
одинаковом числе тредов: query p50 77.9ms vs 617ms (**×7.9**), batch-16
266.6ms vs 8033.4ms (**×30**).

**Ключевой вывод №2 — тред-пул критичен:** onnxruntime по умолчанию берёт
число тредов = числу ядер VM (10); при лимите `--cpus=2` это даёт
oversubscription и p50 576ms (практически без выигрыша vs torch). При
согласованном `EMBEDDINGS_ORT_THREADS=2` — ×7.9/×30. **В compose для
rag-embedder выставлено `EMBEDDINGS_ORT_THREADS=4`** (сервис без лимита CPU,
4 треда — баланс против контенда на 10-ядерной VM; см. docker-compose.yml).

## Cosine drift (качество эмбеддингов)

18 идентичных текстов (чанки property_dictionary / operation_catalog /
glossary + перифразы) эмбеджены обоими пайплайнами, косинусная близость
попарно (torch fp32 vs ONNX int8):

- **mean cosine = 0.990635**
- **min cosine = 0.989020**

Дрейф на уровне int8-квантования, критичной потери близости нет
(порог практической неразличимости для ранжирования ~0.95).

## In-stack замер (raghybrid-ab, end-to-end)

Тот же isolated-стек `raghybrid-ab` (api :18011, EMBEDDINGS_ORT_THREADS=4,
без cpu-лимита у rag-embedder), раннер `/tmp/rag_ab_runner.py`, 20 повторов
на кейс (q8/q10/q12). Три окна замера подряд (VM-контенд влияет и на базовую
линию):

| Окно | BM25 avg p50 | Hybrid avg p50 | Ratio | Hybrid min |
|---|---|---|---|---|
| onnx2 (после overlap-фикса dd4d6f8a) | 36.1ms | 91.2ms | ×2.52 | 48–57ms |
| onnx_final | 24.5ms | 129.8ms | ×5.31 | 41–81ms |
| Опорное окно ДО (torch, 2026-09-04/05) | 87.2ms | 1428.8ms | ×16.4 | — |

- **Абсолютный вывод: hybrid p50 1428.8 → 91–130ms (×11–×15.7).** Latency-FAIL
  PR #912 снят по абсолютной метрике.
- **Критерий «hybrid ≤ keyword ×1.2» внутри окна НЕ выполнен** (×2.5–×5.3):
  остаточная стоимость hybrid — in-stack roundtrip эмбеддинга ~70–110ms
  (standalone-замер: 77.9ms), уже overlapped с BM25-полкой; при тихой VM
  BM25 падает до 24–36ms, и ratio растёт шумом базовой линии. Против
  опорной линии torch-окна (BM25 87.2ms) текущий hybrid 91–130ms = ×1.04–×1.49
  — на границе критерия.
- Проверено вживую: hybrid-путь зовёт сайдкар на каждый запрос (75–78
  `POST /embed` в логах за прогон), деградаций «keyword-only» в логах api нет.
- `EMBEDDINGS_ORT_THREADS=2` в стеке хуже (p50 292ms + выброс 14.3s) —
  оставлено 4 (compose default).
- hit@3: **8/8 в обоих режимах** (q14 стал PASS — следствие дрейфа векторов
  ONNX, изменившего fusion-ранжирование; дефект данных q14 не чинился).
  Secondary q1–q7: симметричный 0/7 (вне скоупа, как и ранее).

## Ограничения методологии

- Абсолютные числа — для контендеженной docker VM на рабочей машине
  разработчика; на выделенном CPU/GPU будут ниже. Выводы сравнительные
  (одна машина, одно окно, идентичная нагрузка).
- Batch-16: n=5 (дорого на torch); query: n=20.
- «Cold» у ONNX ≠ «cold» у torch (см. сноску выше).

## Ревизия критерия приёмки (2026-09-05, approve merge PR #912)

«БЫЛО: "hybrid ≤ keyword +20%". СТАЛО: "hybrid — opt-in фича (hybrid_enabled=0 по умолчанию, дефолтный путь поиска неизменен). Для включённой org бюджет: p50 hybrid ≤ 150ms на stage-железе. Факт: 91–130ms — в бюджете. Остаточная стоимость 70–110ms — CPU-floor roundtrip до sidecar; дальнейшая оптимизация (Redis-кэш query-эмбеддингов, более лёгкая модель, GPU) — отдельным контуром при наличии данных о необходимости".»
