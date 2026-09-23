# Runbook: STAGE-окружение ProcessMap

Хост: `ssh stage` = root@31.192.110.145 (алиас из ~/.ssh/config, ключ ~/.ssh/kimi_stage_31,
установлен 2026-09-23). Работает и `ssh deploy@31.192.110.145` (тот же ключ, deploy в
docker-группе). Sudo не нужен (root по ключу).
Актуализировано 2026-09-23: stage — ОТДЕЛЬНЫЙ хост (ранее жил на общем с prod хосте
45.87.104.69). На prod-хосте осталось сломанное зеркало `processmap_stage-*` (без БД/redis,
crash-loop, трафик не обслуживает) — это НЕ stage, выводы по нему запрещены.

## Идентичность окружения

- Compose-проект: `processmap_stage` (10 контейнеров).
- Собственный checkout: `/opt/processmap/stage/app`
  (compose: `docker-compose.yml` + `docker-compose.stage.yml`; env: `.env.stage`).
- Gateway: собственный контейнер `processmap_stage-stage-gateway-1`, публикует `80/443` хоста
  (nginx-конфиг `/etc/nginx/conf.d/default.conf` внутри контейнера, SNI `stage.processmap.ru`).
  Общего gateway с prod больше нет.
- Сеть: `processmap_stage_default` (внутренние alias `postgres`, `redis`).

## Контейнеры stage (10)

| Контейнер | Роль | Порты |
|---|---|---|
| processmap_stage-frontend-1 | фронт (nginx внутри, 80; 5177 внутренний) | не опубликован на хост |
| processmap_stage-api-1 | FastAPI backend | не опубликован |
| processmap_stage-agent-1 | AI-agent | 8000 внутр. |
| processmap_stage-rag-embedder-1 | RAG embedder | — |
| processmap_stage-notifications-1 | notifications | `28008->8000` |
| processmap_stage-celery-worker-1 | celery | — |
| processmap_stage-postgres-1 | БД stage (user `stage_fpc`, db `processmap_stage`) | 5432 внутр. |
| processmap_stage-redis-1 | cache/jobs | 6379 внутр. |
| processmap_stage-kanboard-1 | kanboard stage | не опубликован |
| processmap_stage-stage-gateway-1 | nginx gateway, TLS termination | `80->80`, `443->443` хоста |

Важно: порт 5177 на хосте НЕ опубликован — проверять только HTTPS через
stage.processmap.ru, не `localhost:5177`.

## Healthcheck-эндпоинты

- `https://stage.processmap.ru/` — фронт, ожидание 200.
- `https://stage.processmap.ru/version` — JSON `{commit, buildTime, branch, env}` от api через gateway.
- `https://stage.processmap.ru/api/health` — health backend.
- 502 на /version при 200 на / — backend (api) упал, gateway жив.

## Логи

- `docker logs processmap_stage-<svc>-1 --tail N [--since 1h]`
- Отдельного файла stage-deploy.log на хосте нет (проверено 2026-09-23): деплой — через
  `deploy.sh` / `stage-update.sh` из app dir; наблюдать `docker logs` контейнеров.
- `/var/log/stage-certbot.log` — renewal сертификата (cron 17:04).

## Команды (только stage)

```bash
# Статус
docker ps -a --filter name=^processmap_stage-

# Restart одного сервиса (автономно)
docker restart processmap_stage-api-1

# Restart через compose (аккуратно: указывать ТОЛЬКО stage-файлы и project)
cd /opt/processmap/stage/app && docker compose -p processmap_stage \
  -f docker-compose.yml -f docker-compose.stage.yml restart api

# Deploy stage (ТОЛЬКО после approve)
/opt/processmap/stage/app/deploy/deploy.sh [REF]
/opt/processmap/stage/app/stage-update.sh                    # альтернатива, см. README/RUNBOOK на хосте

# Очистка диска (автономно, аналог cron */30)
/opt/processmap/bin/docker-cleanup.sh
```

## SSL

Cert Let's Encrypt для stage.processmap.ru; renewal: cron `17 4 * * *` →
`/opt/processmap/stage/app/deploy/stage-gateway/certbot-renew.sh` (лог `/var/log/stage-certbot.log`).
Проверка:
`echo | openssl s_client -connect stage.processmap.ru:443 -servername stage.processmap.ru | openssl x509 -noout -dates`

## Cron на хосте (контекст, не трогать)

- `17 4 * * *` — certbot-renew.sh (stage-gateway).
- `*/30 * * * *` — `/opt/processmap/bin/docker-cleanup.sh`.

## Ресурсы хоста (2026-09-23)

- RAM 3.9GB (занято ~2.4GB) — заметно меньше prod; OOM-симптомы проверять первыми.
- Диск `/` 58GB, занято ~46%.
