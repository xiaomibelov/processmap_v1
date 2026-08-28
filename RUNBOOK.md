# Runbook: Падение прода (prod-deploy-incident)

## Цель

Быстро диагностировать split-brain деплоя, восстановить консистентность prod-контура и предотвратить ручные правки на сервере вне runbook/workflow.

## Правило нулевого шага

**Запрещён ручной запуск `deploy/deploy.sh` на сервере вне GitHub Actions workflow или явной процедуры этого runbook.**
Все исправления prod-рантайма должны выполняться через:
- `deploy-prod.yml` workflow (выравнивающий деплой);
- `rollback-prod.yml` workflow (откат на предыдущий SHA);
- процедуры этого runbook (только чтение/диагностика, не правки runtime).

## 1. Быстрая диагностика split-brain

Зайти на prod-хост (45.87.104.69) и выполнить:

```bash
# Единый источник BUILD_ID
sudo cat /opt/processmap/env/prod.env | grep -E '^(BUILD_ID|PREVIOUS_BUILD_ID)='

# Фактические SHA по контейнерам проекта app
for svc in api gateway celery-worker agent notifications frontend; do
  echo "=== ${svc} ==="
  docker inspect "app-${svc}-1" --format '{{index .Config.Labels "buildId"}} {{.Image}}' 2>/dev/null || echo "missing"
done

# Версия, которую отдаёт API
 curl -fsS https://processmap.ru/version | python3 -m json.tool

# Наличие ошибок "unregistered task" в celery-worker
docker compose \
  --env-file /opt/processmap/env/prod.env \
  -f /opt/processmap/app/docker-compose.yml \
  -f /opt/processmap/app/docker-compose.prod.yml \
  -f /opt/processmap/app/docker-compose.ssl.yml \
  -f /opt/processmap/app/docker-compose.prod.gateway.yml \
  -p app \
  logs celery-worker | grep -i "unregistered" | tail -20
```

**Критерий split-brain:**
- `BUILD_ID` в `/opt/processmap/env/prod.env` отличается от `buildId` label у части контейнеров;
- `app-celery-worker-1` или `app-agent-1` находятся на SHA, отличном от `app-api-1`/`app-gateway-1`;
- в логах `celery-worker` есть `Received unregistered task ...`.

## 2. Выравнивающий деплой (предпочтительный путь)

Если `origin/main` содержит исправление и инфраструктура здорова:

1. Открыть GitHub Actions → `Deploy to Prod`.
2. Запустить workflow от `origin/main`.
3. Дождаться:
   - окончания job `deploy`;
   - автоматического запуска `prod-deploy-verify.yml`;
   - зелёного статуса verify.

Если verify падает, workflow автоматически вызывает `rollback-prod.yml`.

## 3. Rollback на предыдущий SHA

Если выравнивающий деплой невозможен или усугубляет ситуацию:

1. Убедиться, что в `/opt/processmap/env/prod.env` есть `PREVIOUS_BUILD_ID`.
2. Открыть GitHub Actions → `Rollback Prod`.
3. Запустить workflow.
4. Проверить после отката:
   ```bash
   curl -fsS https://processmap.ru/version | python3 -m json.tool
   docker inspect app-api-1 --format '{{index .Config.Labels "buildId"}}'
   docker inspect app-celery-worker-1 --format '{{index .Config.Labels "buildId"}}'
   ```

**Важно:** `rollback-prod.yml` откатывает **все** сервисы: `api`, `gateway`, `celery-worker`, `agent`, `notifications`, `frontend`.

## 4. Ручная диагностика на сервере (только чтение)

Разрешённые команды:
- `docker ps`, `docker inspect`, `docker logs`;
- `docker compose ... logs`, `docker compose ... config`;
- `curl https://processmap.ru/version`, `curl https://processmap.ru/api/health`;
- `git status`, `git log --oneline -5`, `git diff --name-only` в `/opt/processmap/app`;
- чтение `/opt/processmap/env/prod.env`.

**Запрещено без explicit approve ops-владельца:**
- `docker compose build/up/rm` вручную;
- `git checkout` в `/opt/processmap/app` вне workflow;
- правка `.env`, `.env.stage`, `docker-compose*.yml`;
- `docker tag` / `docker image prune`;
- `deploy/deploy.sh`;
- удаление `.env.emergency-bak-*`, `docker-compose.*.bak.*`, `/home/deploy/app`.

## 5. Эскалация

Если после выравнивающего деплоя и rollback'а prod всё ещё не восстановлен:

1. Зафиксировать:
   - `BUILD_ID` и `PREVIOUS_BUILD_ID` из `/opt/processmap/env/prod.env`;
   - SHA всех контейнеров (`docker inspect ... buildId`);
   - последние 50 строк логов `app-api-1` и `app-celery-worker-1`;
   - `git status -sb` и `git log --oneline -5` в `/opt/processmap/app`.
2. Передать ops-владельцу с копией собранных данных.
3. Не пытаться чинить split-brain руками — только через pipeline из git.

## 6. Ликвидация drift'а после инцидента

Артефакты ручного восстановления убираются **только ops-процедурой** после merge этого fix-контура:

- `.env.emergency-bak-*`: сравнить с `/opt/processmap/env/prod.env`; если дублируют — удалить.
- `docker-compose.*.bak.*`: сравнить с git-версией; если не нужны — удалить.
- `/home/deploy/app`: убедиться, что он не используется runtime (ни одного compose-контейнера с project label `app` не имеет working_dir `/home/deploy/app`); удалить как orphan.

## 7. Проверка после fix

После merge `fix/prod-deploy-git-hardening` и деплоя:

```bash
# BUILD_ID единый источник
sudo cat /opt/processmap/env/prod.env | grep BUILD_ID

# Ни одного сервиса не читает /opt/processmap/app/.env для BUILD_ID
# (api, celery-worker, agent, notifications используют /opt/processmap/env/prod.env)

# Все сервисы на одном SHA
for svc in api gateway celery-worker agent notifications frontend; do
  docker inspect "app-${svc}-1" --format '{{index .Config.Labels "buildId"}}'
done

# Celery здоров — нет unregistered task
docker compose ... logs celery-worker | grep -i unregistered
```
