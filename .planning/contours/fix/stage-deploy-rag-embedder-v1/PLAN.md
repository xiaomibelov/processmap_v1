# PLAN — fix/stage-deploy-rag-embedder-v1

## Цель

Разблокировать включение hybrid RAG на stage: rag-embedder (ONNX int8 e5-small sidecar
из PR #912, squash `53b51f06`) должен собираться и подниматься deploy-stage.yml,
EMBEDDINGS_* — провижиниться через существующий механизм (.env.stage auto-inject),
добавить deploy-time health/task гейты. PROD не трогаем. `hybrid_enabled=0` по
умолчанию не меняется (включение — отдельный шаг по runbook §16 после approve).

## Source/runtime truth (зафиксировано)

- worktree: `processmap_v1_main_clone-worktrees/fix/stage-deploy-rag-embedder-v1`
- branch: `fix/stage-deploy-rag-embedder-v1` от `origin/main = 53b51f06` (== PR #912 squash)
- remote: `git@github.com:xiaomibelov/processmap_v1.git`; `git status` clean
- Приор-арт: `feature/rag-hybrid-search-sidecar-v1/MIRROR.md` (runbook §16,
  stage enablement BLOCKED на deploy-drift), `fix/rag-embedder-onnx-latency-v1/BENCHMARK.md`
  (ONNX int8, ORT_THREADS=4, budget p50 ≤150ms пересмотрен письменно).
- RAG preflight: facts-only, BM25 chunks пуст для этого запроса — приор-арт взят из
  артефактов контуров (MIRROR/BENCHMARK), first principles не требуются.

## Phase 0 recon (read-only) — выводы

### Механизм провижена .env.stage

1. `.env.stage` — server-only файл на хосте stage (`/opt/processmap/app/.env.stage`),
   копируется в stage worktree `/opt/processmap/stage/app` при каждом деплое
   (deploy-stage.yml, preserve-блок строк ~159–184). В git не коммитится.
2. Секреты (STAGE_HOST/STAGE_USER/STAGE_SSH_KEY) — GitHub secrets; в сам workflow
   .env.stage-контент не генерируется.
3. Единственный механизм провижена env workflow'ом — auto-inject блок
   (sed-чистка ключей + append, строки ~230–247): BUILD_ID/VITE_*/STAGE_IMAGE_TAG.
   Его и расширяем для не-секретных EMBEDDINGS_* — идемпотентно, воспроизводимо,
   секреты в git не попадают.

### Полный список EMBEDDINGS_* (по коду main = 53b51f06)

| Переменная | Кто читает | Дефолт | Нужна в .env.stage? |
|---|---|---|---|
| `EMBEDDINGS_BASE_URL` | api, celery-worker (compose env + `backend/app/rag/embeddings.py:52`) | `http://rag-embedder:8000` | да (фиксируем явно) |
| `EMBEDDINGS_QUERY_TIMEOUT_SECONDS` | api (`embeddings.py:38`) | `5.0` | да (явно, ops-контракт) |
| `EMBEDDINGS_PASSAGE_TIMEOUT_SECONDS` | celery-worker passage-батчи (`embeddings.py:42`) | `60.0` | да (явно, ops-контракт) |
| `EMBEDDINGS_ORT_THREADS` | sidecar (`rag-embedder/main.py:37`, compose `:151`) | `4` | да, **строго 4** |
| `EMBEDDINGS_MODEL_DIR` | sidecar (`main.py:20`) | `/models` (запечён в Dockerfile) | нет |
| `EMBEDDINGS_MODEL` | compose env sidecar (`docker-compose.yml:150`) | `intfloat/multilingual-e5-small` | нет (косметическая, кодом sidecar не читается — модель запечена при билде) |

Все значения не-секретные (внутренний docker-network URL, треды, таймауты).

### Resource limits для int8 ONNX на CPU (по BENCHMARK.md)

- `EMBEDDINGS_ORT_THREADS=4` — замерено: threads=2 в стеке хуже (p50 292ms +
  выброс 14.3s); default (=10 ядер VM) при лимите cpus=2.0 — oversubscription,
  p50 576ms. В compose уже дефолт 4, фиксируем явно в .env.stage.
- CPU-лимит rag-embedder НЕ добавляем (compose service сейчас без лимита —
  осознанно: int8 ONNX + 4 треда; жёсткий cpus<4 дал бы oversubscription).
- Memory: int8-веса ~50MB + onnxruntime overhead; потолок 1G был бы уместен,
  но compose-изменения вне минимального патча не вводим (бенчмарк без лимита
  памяти стабилен) — задокументировано здесь и в PR.

### Drift, который чиним

- `BUILD_SERVICES="api frontend notifications celery-worker"` (строка ~261) —
  без rag-embedder → образ не собирается.
- `UP_SERVICES` (строка ~285) — без rag-embedder → не поднимается; при этом
  api/celery-worker уже `depends_on: rag-embedder: service_started`
  (docker-compose.yml:36,64) — на stage это пока «фантомный» depends (сервис
  в стеке отсутствует, up ограничен списком).
- `.env.stage` без EMBEDDINGS_* — работало бы на compose-дефолтах, но неявно;
  фиксируем явно через auto-inject.
- compose-файлы (docker-compose.yml / docker-compose.stage.yml) rag-embedder УЖЕ
  содержат (сервис + healthcheck, PR #912) — правок не требуют.

## Патч (минимальный, только .github/workflows/deploy-stage.yml)

1. `BUILD_SERVICES` += `rag-embedder` (всегда: образ свой, контекст `./rag-embedder`).
2. `UP_SERVICES` += `rag-embedder`.
3. Auto-inject блок .env.stage: sed-чистка + append `EMBEDDINGS_BASE_URL`,
   `EMBEDDINGS_ORT_THREADS=4`, `EMBEDDINGS_QUERY_TIMEOUT_SECONDS=5`,
   `EMBEDDINGS_PASSAGE_TIMEOUT_SECONDS=60` (значения-не-секреты, дефолты
   compose-консистентны).
4. После freshness proof: гейт «rag-embedder healthy + /health ok + model_loaded»
   (docker inspect Health.Status → exec /health), и регистрация celery-задачи
   `processmap.rag.embed_chunks` через существующий `deploy/verify_celery_task.sh`
   (рядом с уже проверяемым `processmap.rag.index_session_bpmn_xml`).

Запрещённое соблюдено: prod-workflow (deploy-prod.yml и пр.) не тронуты,
prod-хост не тронут, дефолт `hybrid_enabled=0` не меняется, deps api/worker
не меняются, product code не меняется.

## Проверки

- actionlint + yamllint на изменённом workflow.
- `docker compose -f docker-compose.yml -f docker-compose.stage.yml -p processmap_stage config --quiet` с имитацией .env.stage (локально, dry-run).
- STOP перед merge: diff workflow + план деплоя → явный approve пользователя.

## Риски

- Первый build rag-embedder на хосте stage: export-стадия качает torch CPU + HF
  модель (~5–10 мин); лимиты workflow: command_timeout 20m, job 25m — с запасом,
  но первый прогон стоит посмотреть.
- api/celery-worker пересоздаются с зависимостью на rag-embedder — fallback при
  упавшем sidecar доказан тестами/замером (keyword-only, ответ успешный).
