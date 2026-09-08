#!/usr/bin/env bash
# Renew сертификата stage.processmap.ru (webroot через stage-gateway:80)
# и перекладывание активных файлов в certs/active/ + reload nginx.
# Cron на stage-хосте (root): 17 4 * * * <путь>/certbot-renew.sh >> /var/log/stage-certbot.log 2>&1
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$DIR/../../.." && pwd)"
cd "$APP_DIR"

mkdir -p deploy/stage-gateway/certs/active

docker run --rm \
  -v "$APP_DIR/deploy/stage-gateway/certbot-webroot:/var/www/certbot" \
  -v "$APP_DIR/deploy/stage-gateway/certs/letsencrypt:/etc/letsencrypt" \
  certbot/certbot renew \
  --webroot -w /var/www/certbot \
  --quiet

LE_LIVE="deploy/stage-gateway/certs/letsencrypt/live/stage.processmap.ru"
if [ -f "$LE_LIVE/fullchain.pem" ] && [ -f "$LE_LIVE/privkey.pem" ]; then
  cp -L "$LE_LIVE/fullchain.pem" deploy/stage-gateway/certs/active/fullchain.pem
  cp -L "$LE_LIVE/privkey.pem" deploy/stage-gateway/certs/active/privkey.pem
  if docker ps --format '{{.Names}}' | grep -q '^processmap_stage-stage-gateway-1$'; then
    docker exec processmap_stage-stage-gateway-1 nginx -s reload
  fi
  echo "certbot-renew: ok $(date -Is)"
else
  echo "certbot-renew: letsencrypt cert missing (DNS ещё не переключён?) $(date -Is)"
fi
