#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.edge}"
PROJECT_NAME="processmap_edge"

if [ ! -f "$ENV_FILE" ]; then
  echo "[smoke-edge] missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

docker compose --env-file "$ENV_FILE" -f docker-compose.edge.yml -p "$PROJECT_NAME" exec edge nginx -t
curl -fsSI -H "Host: ${PROD_SERVER_NAME:?PROD_SERVER_NAME is required}" "http://127.0.0.1:${EDGE_HTTP_PORT:?EDGE_HTTP_PORT is required}/" >/dev/null
if [ "${EDGE_ENABLE_STAGE:-0}" = "1" ]; then
  curl -fsSI -H "Host: ${STAGE_SERVER_NAME:?STAGE_SERVER_NAME is required}" "http://127.0.0.1:${EDGE_HTTP_PORT}/" >/dev/null
fi
echo "[smoke-edge] completed"
