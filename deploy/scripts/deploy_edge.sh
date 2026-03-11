#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.edge}"
PROJECT_NAME="processmap_edge"

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy-edge] missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

RUNTIME_CONF_DIR="$ROOT_DIR/runtime/edge/nginx/conf.d"
mkdir -p "$RUNTIME_CONF_DIR" "${ACME_WEBROOT_DIR:?ACME_WEBROOT_DIR is required}" "${LETSENCRYPT_DIR:?LETSENCRYPT_DIR is required}"
rm -f "$RUNTIME_CONF_DIR"/*.conf

test -f "${LETSENCRYPT_DIR}/live/${PROD_SERVER_NAME:?PROD_SERVER_NAME is required}/fullchain.pem"
test -f "${LETSENCRYPT_DIR}/live/${PROD_SERVER_NAME}/privkey.pem"
cp "$ROOT_DIR/deploy/edge/nginx/conf.d/processmap.ru.conf" "$RUNTIME_CONF_DIR/processmap.ru.conf"

if [ "${EDGE_ENABLE_STAGE:-0}" = "1" ]; then
  test -f "${LETSENCRYPT_DIR}/live/${STAGE_SERVER_NAME:?STAGE_SERVER_NAME is required}/fullchain.pem"
  test -f "${LETSENCRYPT_DIR}/live/${STAGE_SERVER_NAME}/privkey.pem"
  cp "$ROOT_DIR/deploy/edge/nginx/conf.d/stage.processmap.ru.conf" "$RUNTIME_CONF_DIR/stage.processmap.ru.conf"
fi

docker network inspect "${EDGE_NETWORK_NAME:?EDGE_NETWORK_NAME is required}" >/dev/null 2>&1 || docker network create "${EDGE_NETWORK_NAME}"

docker compose --env-file "$ENV_FILE" -f docker-compose.edge.yml -p "$PROJECT_NAME" config -q
docker compose --env-file "$ENV_FILE" -f docker-compose.edge.yml -p "$PROJECT_NAME" up -d edge certbot

"$ROOT_DIR/deploy/scripts/smoke_edge.sh" "$ENV_FILE"
echo "[deploy-edge] completed"
