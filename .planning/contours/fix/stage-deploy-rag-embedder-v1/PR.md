# PR: fix/stage-deploy-rag-embedder-v1

- **Title:** [fix] Deploy stage: rag-embedder (RAG hybrid sidecar) в BUILD/UP_SERVICES + EMBEDDINGS_* провижн + health/task гейты
- **Base:** `main`
- **Branch:** `fix/stage-deploy-rag-embedder-v1`
- **Head:** `9d3805b9`

## Проблема

PR #912 (гибридный BM25+vector поиск, squash `53b51f06`) вмержён в main, CI зелёный,
stage-деплой отработал — но включение hybrid на stage заблокировано deploy-drift:

- `rag-embedder` не входит в `BUILD_SERVICES`/`UP_SERVICES` `.github/workflows/deploy-stage.yml`
  → образ на хосте stage не собирался и сервис не поднимался;
- `.env.stage` без `EMBEDDINGS_*` (работало бы только на неявных compose-дефолтах).

При этом `docker-compose.yml` уже содержит сервис `rag-embedder` (+healthcheck), а
`api`/`celery-worker` уже объявлены `depends_on: rag-embedder` — на stage это
фантомная зависимость.

## Что меняет

Только `.github/workflows/deploy-stage.yml` (+51/−3):

1. **BUILD_SERVICES += rag-embedder** — сборка sidecar-образа (ONNX int8 e5-small,
   многостадийный Dockerfile, модель запечена при билде).
2. **UP_SERVICES += rag-embedder** — сервис поднимается деплоем; freshness proof
   (image tag == DEPLOY_SHA) покрывает его автоматически.
3. **Провижн `.env.stage`** через существующий auto-inject механизм (sed-чистка
   ключей + append, идемпотентно):
   - `EMBEDDINGS_BASE_URL=http://rag-embedder:8000`
   - `EMBEDDINGS_ORT_THREADS=4`
   - `EMBEDDINGS_QUERY_TIMEOUT_SECONDS=5`
   - `EMBEDDINGS_PASSAGE_TIMEOUT_SECONDS=60`

   Значения не-секретные (внутренний docker-network URL, треды, таймауты),
   консистентны с дефолтами `docker-compose.yml`. `EMBEDDINGS_ORT_THREADS=4` —
   по замерам контура `fix/rag-embedder-onnx-latency-v1` (BENCHMARK.md:
   threads=2 хуже — p50 292ms + выброс 14.3s; default-пул при cpu-limit —
   oversubscription, p50 576ms).
4. **Deploy-гейты**:
   - rag-embedder healthy: ожидание `Health.Status == healthy` (до 180s,
     прогрев ONNX), затем `/health` внутри контейнера с assert `ok` и
     `model_loaded` (runbook §16.1 как deploy-гейт);
   - регистрация celery-задачи `processmap.rag.embed_chunks` через существующий
     `deploy/verify_celery_task.sh` — fail-loud вместо молчаливой деградации
     на keyword-only.

## Что НЕ меняется (явные ограничения)

- PROD: `deploy-prod.yml`, prod-хост — не тронуты.
- `hybrid_enabled=0` по умолчанию — глобально без изменений; включение per-org —
   отдельный шаг по runbook §16 после деплоя (index-dictionaries → включение → smoke).
- Deps api/celery-worker, product code, compose-файлы — без изменений.
- CPU/memory-лимиты rag-embedder не вводятся (по BENCHMARK: int8 ONNX + 4 треда
  стабильны без лимита; жёсткий cpus<4 дал бы oversubscription).

## Проверки

- `actionlint` (rhysd/actionlint:latest) на workflow — 0 findings.
- `docker compose --env-file .env.stage -f docker-compose.yml -f docker-compose.stage.yml -p processmap_stage config --quiet` (dry-run с имитацией инжекта) — OK; рендер env api/celery-worker/rag-embedder подтверждён.
- Артефакты контура: `.planning/contours/fix/stage-deploy-rag-embedder-v1/` (PLAN.md — Phase 0 recon, EXEC_REPORT.md, REVIEW_REPORT.md, STATE.json).

## План после merge (stage only)

1. Merge → auto-deploy stage (push to main). Первый build rag-embedder на хосте
   stage: export-стадия тянет torch CPU + HF-модель (~5–10 мин); лимиты job 25m —
   с запасом, первый прогон наблюдать.
2. Гейты workflow сами проверят: healthy sidecar, `/health` ok+model_loaded,
   регистрацию embed_chunks, freshness по image tag.
3. Затем runbook §16 целиком (отдельный явный шаг с approve): §16.1 prereqs →
   §16.2 index-dictionaries → §16.3 `hybrid_enabled=1` на тестовой org → smoke
   (hit@3 q8–q15, спот-замер p50 ≤150ms, fallback при остановленном sidecar,
   health embedder, регрессия agent-chat).
