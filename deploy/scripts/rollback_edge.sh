#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.edge}"
PROJECT_NAME="processmap_edge"

if [ ! -f "$ENV_FILE" ]; then
  echo "[rollback-edge] missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

RUNTIME_CONF_DIR="$ROOT_DIR/runtime/edge/nginx/conf.d"
mkdir -p "$RUNTIME_CONF_DIR"
rm -f "$RUNTIME_CONF_DIR"/*.conf
cp "$ROOT_DIR/deploy/edge/nginx/conf.d/processmap.ru.conf" "$RUNTIME_CONF_DIR/processmap.ru.conf"

docker compose --env-file "$ENV_FILE" -f docker-compose.edge.yml -p "$PROJECT_NAME" up -d edge certbot
docker compose --env-file "$ENV_FILE" -f docker-compose.edge.yml -p "$PROJECT_NAME" exec edge nginx -t
echo "[rollback-edge] restored prod-only edge config"
