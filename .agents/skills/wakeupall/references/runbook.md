# Runbook: оба окружения ProcessMap (read-only обзор)

Два РАЗНЫХ хоста (актуализировано 2026-09-23; ранее оба окружения жили на одном хосте):

| | PROD | STAGE |
|---|---|---|
| Хост | 45.87.104.69 (`ssh deploy@45.87.104.69`, sudo нет) | 31.192.110.145 (`ssh stage` = root, ключ ~/.ssh/kimi_stage_31; доступен и deploy той же ключом) |
| Compose-проект | `app` | `processmap_stage` |
| App dir | `/opt/processmap/app` | `/opt/processmap/stage/app` |
| Compose-файлы | docker-compose.yml + prod.yml + ssl.yml + prod.gateway.yml | docker-compose.yml + stage.yml |
| Env-файл | `.env` | `.env.stage` |
| URL | https://processmap.ru | https://stage.processmap.ru |
| Контейнеры | `app-*` (9) | `processmap_stage-*` (10) |
| Хост-порты | 443 (app-gateway-1), 8008 (notifications), 3001 (kanboard) | 80/443 (stage-gateway-1), 28008 (notifications) |
| Gateway | `app-gateway-1` (общий nginx, SNI processmap.ru) | собственный `processmap_stage-stage-gateway-1` (SNI stage.processmap.ru) |
| RAM | ~7.9GB | ~3.9GB |

ВНИМАНИЕ: на prod-хосте 45.87.104.69 лежит мёртвое зеркало `processmap_stage-*`
(без БД/redis, crash-loop, трафик не обслуживает). Это НЕ stage — stage только на
31.192.110.145. Вывод «stage down» по контейнерам на prod-хосте недопустим.

Общих сущностей между хостами больше нет. Каждый хост имеет свой docker-демон, диск, память,
SSL-сертификат и cron:

- PROD: watchdog `*/30 * * * *` (`/opt/processmap/bin/processmap-availability-watchdog.sh`),
  cleanup `30 4 * * *` (`~/docker-cleanup.sh`); логи `/opt/processmap/logs/`.
- STAGE: certbot-renew `17 4 * * *` (`/opt/processmap/stage/app/deploy/stage-gateway/certbot-renew.sh`),
  cleanup `*/30 * * * *` (`/opt/processmap/bin/docker-cleanup.sh`); лог `/var/log/stage-certbot.log`.

Важно: порт 5177 на хостах НЕ опубликован ни у одного окружения (внутренний порт контейнеров
frontend). Наружная проверка — только HTTPS через домены.

## Health-эндпоинты

| Окружение | URL | Ожидание |
|---|---|---|
| prod | https://processmap.ru/ | 200 |
| prod | https://processmap.ru/api/health | 200 |
| prod | https://processmap.ru/version | JSON {commit, branch:"main", env:"prod"} |
| stage | https://stage.processmap.ru/ | 200 |
| stage | https://stage.processmap.ru/version | JSON {commit, ...} |
| stage | https://stage.processmap.ru/api/health | 200 |

Паттерн "фронт 200, /version 502" = упал backend (api), gateway и frontend живы.

## Контейнеры

PROD (`app-` на 45.87.104.69): gateway, frontend, api, agent, notifications, celery-worker, postgres, redis, kanboard.
STAGE (`processmap_stage-` на 31.192.110.145): frontend, api, agent, rag-embedder, notifications,
celery-worker, postgres (user `stage_fpc`, db `processmap_stage`), redis, kanboard, stage-gateway.

## Куда чинить

- Проблемы только stage (`processmap_stage-*`, stage.processmap.ru) → скилл **wakeupstage**.
- Проблемы prod (`app-*`, processmap.ru) → скилл **wakeupprod**.
- Проблемы своего хоста (диск/память/cron) → окружение, которому хост принадлежит.
