# Stage TLS-гейт (выделенный stage-хост)

Сервис `stage-gateway` (`docker-compose.stage.yml`) — единая точка входа
stage.processmap.ru: терминирует TLS (80 → 301, 443 → proxy во `frontend:80`
внутри docker-сети). Раньше эту роль играл ОБЩИЙ prod-гейт по SNI
(`edge_shared` / alias `stage-gateway` у frontend) — контур
`architecture/stage-separate-host` её убирает.

## Файлы

- `nginx.conf` — конфиг гейта (читается из контейнера, ro-mount).
- `certbot-webroot/` — webroot для ACME HTTP-01 (ro-mount в гейт).
- `certs/active/` — АКТИВНЫЕ файлы `fullchain.pem` / `privkey.pem`, которые читает nginx.
- `certs/letsencrypt/` — рабочая директория certbot (`/etc/letsencrypt` в контейнере).
- `certbot-renew.sh` — renew + перекладывание в `active/` + `nginx -s reload`.

## Первый выпуск (после DNS-cutover на этот хост)

До выпуска реального серта nginx стартует на самоподписанном bootstrap:

```bash
cd /opt/processmap/stage/app
mkdir -p deploy/stage-gateway/certs/active
openssl req -x509 -nodes -days 14 -newkey rsa:2048 \
  -keyout deploy/stage-gateway/certs/active/privkey.pem \
  -out deploy/stage-gateway/certs/active/fullchain.pem \
  -subj "/CN=stage.processmap.ru"
docker compose --env-file .env.stage -f docker-compose.yml -f docker-compose.stage.yml \
  -p processmap_stage up -d stage-gateway
```

ACME HTTP-01 (домен уже резолвится на этот хост):

```bash
docker run --rm \
  -v "$PWD/deploy/stage-gateway/certbot-webroot:/var/www/certbot" \
  -v "$PWD/deploy/stage-gateway/certs/letsencrypt:/etc/letsencrypt" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d stage.processmap.ru \
  --agree-tos -m <owner-email> --no-eff-email
bash deploy/stage-gateway/certbot-renew.sh   # раскладывает в active/ + reload
```

## Продление

cron (root) на stage-хосте:

```
17 4 * * * /opt/processmap/stage/app/deploy/stage-gateway/certbot-renew.sh >> /var/log/stage-certbot.log 2>&1
```

## Важно

- Гейт НЕ входит в `UP_SERVICES` CI-деплоя (`deploy-stage.yml`): деплой его не
  пересоздаёт, freshness-гейт sha-тегов его не касается (образ `nginx:1.27-alpine`).
- После правки `nginx.conf` в git: `docker compose ... up -d stage-gateway` вручную
  на stage-хосте (конфиг ro-mount, достаточно пересоздать контейнер).
- `certs/` и `certbot-webroot/` gitignored — на хосте только.
