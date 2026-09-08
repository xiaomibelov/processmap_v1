# Prod TLS-гейт (standalone, паритет со stage-gateway)

Сервис `gateway` (`docker-compose.prod.standalone-gateway.yml`, override поверх
`docker-compose.yml`) — единая точка входа processmap.ru: терминирует TLS
(80 → 301, 443 → proxy во `frontend:80` внутри docker-сети). Контейнер сохраняет
имя `app-gateway-1`.

Заменяет кастомную сборку `processmap-gateway:dev` (Dockerfile.gateway.prod
пересобирал фронтенд внутри гейта) — статику теперь отдаёт `app-frontend-1`,
гейт — тонкий официальный `nginx:1.27-alpine`. Побочный фикс: host snap-certbot
обновлял серт `authenticator = standalone` и падал на занятом :80; renew теперь
идёт webroot'ом через гейт.

## Файлы

- `nginx.conf` — конфиг гейта (ro-mount).
- `certbot-webroot/` — webroot для ACME HTTP-01 (ro-mount в гейт).
- `certs/active/` — АКТИВНЫЕ `fullchain.pem` / `privkey.pem`, которые читает nginx.
- `certs/letsencrypt/` — рабочая директория certbot (`/etc/letsencrypt` в контейнере).
- `certbot-renew.sh` — renew + перекладывание в `active/` + `nginx -s reload`.

## Миграция (с действующим сертификатом, короткое окно переключения)

Полный сценарий — в `.planning/contours/architecture/prod-standalone-gateway/PLAN.md` §5.
Сводка:

1. Сид `certs/active/` из действующего `/etc/letsencrypt/live/processmap.ru`
   (чтение root-only файлов — через `docker run -v /etc/letsencrypt:/le:ro`, процесс в контейнере root).
2. `docker rename app-gateway-1 app-gateway-1-pre-standalone`.
3. `docker compose --env-file /opt/processmap/env/prod.env -f docker-compose.yml \
     -f docker-compose.prod.yml -f docker-compose.prod.standalone-gateway.yml \
     -p app up -d gateway`.
4. Проверки: `https://processmap.ru/version` (== SHA main), `/api/health` 200,
   HSTS-заголовок, `/technologist/workspace` → 301 `/app`, SSE `/agent/stream`.
5. Зелёно → `docker rm app-gateway-1-pre-standalone`.

**Rollback:** `docker rm -f app-gateway-1 && docker rename app-gateway-1-pre-standalone app-gateway-1 && docker start app-gateway-1`.

## Продление

cron (deploy) на prod-хосте:

```
23 4 * * * /opt/processmap/app/deploy/prod-gateway/certbot-renew.sh >> /var/log/prod-certbot.log 2>&1
```

Проверка: `bash deploy/prod-gateway/certbot-renew.sh` вручную (первая реальная
прогонка; `renew --dry-run` через dockerized certbot не требует остановки гейта).

## Важно

- Конфиг из git подхватывается штатным `deploy-prod.yml` (файл входит в checkout
  и `up -d` прода).
- `certs/` и `certbot-webroot/` gitignored — на хосте только.
- Host snap-certbot (`/etc/letsencrypt/renewal/*.conf`) после миграции не нужен
  для processmap.ru — дизейблится отдельным cleanup-контуром.
