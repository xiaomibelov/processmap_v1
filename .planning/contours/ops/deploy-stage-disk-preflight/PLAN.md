# PLAN — ops/deploy-stage-disk-preflight

## Цель
Ранний гейт ENOSPC в `.github/workflows/deploy-stage.yml`: проверка свободного места (≥5 GiB) на stage-хосте ДО начала деплоя.

## Мотивация
Stage-хост (31.192.110.145) дважды падал с ENOSPC: диск 100% → ломались git lockfile и deploy, падали workflow `backend-contract / contract` и деплой. Cleanup-гигиена (cron */30, retention-скрипт) уже внедрена, но деплой до сих пор стартует вслепую.

## Задачи
1. [x] Worktree `.wt-disk-preflight`, ветка `ops/deploy-stage-disk-preflight` от `origin/main` (16f7c186).
2. [x] Изучить ssh-доступ workflow: `appleboy/ssh-action@v1.0.3`, secrets `STAGE_HOST` / `STAGE_USER` / `STAGE_SSH_KEY`.
3. [x] Добавить step `Disk preflight on stage host` (переиспользован ssh-шаблон) перед `Deploy to stage server`: `df -k /` → avail < 5242880 KiB → `exit 1` с сообщением про cleanup/cron */30.
4. [x] YAML-валидация (`python3 -c yaml.safe_load`) → OK.
5. [x] Dry-run логики гейта на симулированном `df` (PASS/FAIL подтверждены).
6. [x] Self-review → REVIEW_REPORT.md.
7. [x] Артефакты: EXEC_REPORT.md, STATE.json, evidence/ (diff, yaml-check.log).
8. [x] Push + PR (merge запрещён).

## Границы
Только additive-изменение `.github/workflows/deploy-stage.yml` (+22 строки). Product code не тронут: backend-diff = 0, frontend-diff = 0.
