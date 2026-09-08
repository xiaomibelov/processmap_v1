#!/usr/bin/env bash
# Renew сертификата processmap.ru (webroot через gateway:80)
# и перекладывание активных файлов в certs/active/ + reload nginx.
# Cron на prod-хосте (deploy): 23 4 * * * <путь>/certbot-renew.sh >> /var/log/prod-certbot.log 2>&1
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$DIR/../.." && pwd)"
cd "$APP_DIR"

mkdir -p deploy/prod-gateway/certs/active

docker run --rm \
  -v "$APP_DIR/deploy/prod-gateway/certbot-webroot:/var/www/certbot" \
  -v "$APP_DIR/deploy/prod-gateway/certs/letsencrypt:/etc/letsencrypt" \
  certbot/certbot renew \
  --webroot -w /var/www/certbot \
  --quiet

LE_LIVE="deploy/prod-gateway/certs/letsencrypt/live/processmap.ru"
if [ -f "$LE_LIVE/fullchain.pem" ] && [ -f "$LE_LIVE/privkey.pem" ]; then
  cp -L "$LE_LIVE/fullchain.pem" deploy/prod-gateway/certs/active/fullchain.pem
  cp -L "$LE_LIVE/privkey.pem" deploy/prod-gateway/certs/active/privkey.pem
  if docker ps --format '{{.Names}}' | grep -q '^app-gateway-1$'; then
    docker exec app-gateway-1 nginx -s reload
  fi
  echo "certbot-renew: ok $(date -Is)"
else
  echo "certbot-renew: letsencrypt cert missing $(date -Is)"
fi
