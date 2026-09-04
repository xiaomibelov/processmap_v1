# REVIEW_REPORT — fix/stage-deploy-rag-embedder-v1 (self-review, Agent 3 дисциплина)

## Верификация по чек-листу

1. **Source/runtime truth:** worktree `processmap_v1_main_clone-worktrees/fix/stage-deploy-rag-embedder-v1`,
   ветка от `origin/main = 53b51f06` (актуальный main, PR #912 squash), diff чистый,
   1 коммит `9d3805b9`, только `.github/workflows/deploy-stage.yml` + PLAN.md. OK.
2. **Scope:** только stage-workflow. `deploy-prod.yml`, `rollback-prod.yml`,
   `deploy-stage-ref.yml` (legacy host) не изменены — проверено `git diff --name-only`.
   Product code, compose-файлы, deps api/worker — без изменений. OK.
3. **Freshness proof loop** покрывает rag-embedder автоматически (UP_SERVICES) —
   image-tag гейт `processmap_stage-rag-embedder:${DEPLOY_SHA}` сработает с первого
   деплоя; если образ не собран — `ps -q` пуст → ERROR. OK.
4. **Health-гейт:** `docker inspect ...Health.Status` цикл 36×5s = 180s + healthcheck
   start_period 180s суммарно достаточно для первого старта (ONNX-прогрев ~20s
   по BENCHMARK, запас на build-pull контенд). `compose exec -T` корректен для
   не-TTY SSH-раннера. Assert на `ok` и `model_loaded` повторяет runbook §16.1. OK.
5. **Env-провижн:** sed-чистка 4 новых ключей перед append — идемпотентность
   сохранена (повторный деплой не плодит дубли). Значения консистентны с
   compose-дефолтами (`docker compose config` подтвердил рендер). Секретов нет. OK.
6. **embed_chunks check:** verify_celery_task.sh принимает `--task` параметром,
   повторный вызов с другим именем — штатное использование скрипта. OK.
7. **actionlint** exit 0; **compose config --quiet** exit 0. OK.

## Риски (приняты, задокументированы)

- Первый build rag-embedder на хосте stage тянет torch CPU + HF-модель
  (~5–10 мин); лимиты job 25m / command_timeout 20m — с запасом, но первый
  прогон наблюдать вживую.
- `EMBEDDINGS_ORT_THREADS=4` жёстко фиксируется в .env.stage: если оператор
  захочет override — ключ будет перезаписан следующим деплоем (осознанно,
  как BUILD_*; кастом — через отдельный контур).
- `EMBEDDINGS_MODEL` в compose sidecar не читается кодом (модель запечена при
  билде) — оставлено как есть, вне скоупа.

## Вердикт

REVIEW_PASS — merge-gate: ожидает явного approve пользователя (diff + план деплоя
высланы в сессию). Prod не тронут. `hybrid_enabled=0` глобально.
