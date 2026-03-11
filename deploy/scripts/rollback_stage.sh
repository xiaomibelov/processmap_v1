#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.stage}"
REF="${2:-}"
PROJECT_NAME="processmap_stage"

if [ ! -f "$ENV_FILE" ]; then
  echo "[rollback-stage] missing env file: $ENV_FILE" >&2
  exit 1
fi

if [ -n "$REF" ]; then
  git fetch --tags --all
  git checkout "$REF"
fi

APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.stage.yml -p "$PROJECT_NAME" up -d --remove-orphans postgres redis api gateway
"$ROOT_DIR/deploy/scripts/smoke_stage.sh" "$ENV_FILE"
echo "[rollback-stage] completed"
