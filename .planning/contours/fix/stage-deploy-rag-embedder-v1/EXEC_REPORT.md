# EXEC_REPORT — fix/stage-deploy-rag-embedder-v1

## Что сделано

Минимальный патч `.github/workflows/deploy-stage.yml` (+51/−3), коммит `9d3805b9`
на ветке `fix/stage-deploy-rag-embedder-v1` от `origin/main = 53b51f06`:

1. **BUILD_SERVICES += rag-embedder** — sidecar собирается на stage (образ свой,
   контекст `./rag-embedder`, многостадийный: export ONNX int8 + lean runtime).
2. **UP_SERVICES += rag-embedder** — поднимается в `up -d --no-deps --force-recreate -V`;
   freshness proof автоматически покрывает его (image `processmap_stage-rag-embedder:${DEPLOY_SHA}`).
3. **Провижн .env.stage** через существующий auto-inject механизм (sed-чистка ключей
   + append, идемпотентно): `EMBEDDINGS_BASE_URL=http://rag-embedder:8000`,
   `EMBEDDINGS_ORT_THREADS=4`, `EMBEDDINGS_QUERY_TIMEOUT_SECONDS=5`,
   `EMBEDDINGS_PASSAGE_TIMEOUT_SECONDS=60`. Все значения не-секретные; секреты
   в git не попадают; `.env.stage` остаётся server-only файлом.
4. **Deploy-гейты**:
   - rag-embedder healthy-гейт: ожидание `Health.Status == healthy` (до 36×5s,
     start_period healthcheck 180s — прогрев ONNX), затем `compose exec` `/health`
     с assert `ok` и `model_loaded` (runbook §16.1 как deploy-гейт).
   - регистрация celery-задачи `processmap.rag.embed_chunks` через существующий
     `deploy/verify_celery_task.sh` (fail-loud вместо молчаливой деградации).

## Phase 0 recon (полный — в PLAN.md)

- `.env.stage`: server-only, preserve-блок workflow (копия из `/opt/processmap/app`),
  секреты — GitHub secrets; единственный механизм env-провижена workflow — auto-inject.
- EMBEDDINGS_* (по коду main): BASE_URL (api+worker), QUERY/PASSAGE_TIMEOUT (api/worker),
  ORT_THREADS (sidecar), MODEL_DIR и MODEL — запечены в образ, в env не нужны.
- Resource limits: CPU-лимит не вводим (int8 ONNX + 4 треда; cpus=2 + default-пул =
  oversubscription по BENCHMARK.md), memory 1G уместен но вне минимального патча.

## Проверки (локально, 5-plane partially — code/workspace)

- `actionlint` (rhysd/actionlint:latest) на workflow: exit 0, 0 findings.
- `docker compose --env-file .env.stage -f docker-compose.yml -f docker-compose.stage.yml
  -p processmap_stage config --quiet` с dummy env: OK; рендер rag-embedder
  (healthcheck, EMBEDDINGS_ORT_THREADS=4) и api/celery-worker (EMBEDDINGS_BASE_URL)
  подтверждён выводом `config`.
- Запрещённое соблюдено: prod-workflow не тронут, prod-хост не тронут,
  `hybrid_enabled=0` глобально не менялся, deps api/worker не менялись,
  product code не менялся.

## Не сделано (ожидает approve)

- push, PR, merge, stage-deploy, runbook §16 — STOP по контракту до явного approve.
