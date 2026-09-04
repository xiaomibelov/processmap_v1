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

## Ограничения методологии

- Абсолютные числа — для контендеженной docker VM на рабочей машине
  разработчика; на выделенном CPU/GPU будут ниже. Выводы сравнительные
  (одна машина, одно окно, идентичная нагрузка).
- Batch-16: n=5 (дорого на torch); query: n=20.
- «Cold» у ONNX ≠ «cold» у torch (см. сноску выше).
