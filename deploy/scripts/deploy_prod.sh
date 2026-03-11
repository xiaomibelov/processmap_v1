#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.prod}"
PROJECT_NAME="processmap_prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy-prod] missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

mkdir -p runtime/prod/workspace/processes runtime/prod/workspace/.session_store runtime/prod/postgres
docker network inspect "${EDGE_NETWORK_NAME:?EDGE_NETWORK_NAME is required}" >/dev/null 2>&1 || docker network create "${EDGE_NETWORK_NAME}"

APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml -p "$PROJECT_NAME" config -q
APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml -p "$PROJECT_NAME" build api gateway
APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml -p "$PROJECT_NAME" up -d postgres redis api gateway

"$ROOT_DIR/deploy/scripts/smoke_prod.sh" "$ENV_FILE"
echo "[deploy-prod] completed"
