#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.stage}"
PROJECT_NAME="processmap_stage"

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy-stage] missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

mkdir -p runtime/stage/workspace/processes runtime/stage/workspace/.session_store runtime/stage/postgres
docker network inspect "${EDGE_NETWORK_NAME:?EDGE_NETWORK_NAME is required}" >/dev/null 2>&1 || docker network create "${EDGE_NETWORK_NAME}"

APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.stage.yml -p "$PROJECT_NAME" config -q
APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.stage.yml -p "$PROJECT_NAME" build api gateway
APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.stage.yml -p "$PROJECT_NAME" up -d postgres redis api gateway

"$ROOT_DIR/deploy/scripts/smoke_stage.sh" "$ENV_FILE"
echo "[deploy-stage] completed"
