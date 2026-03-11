#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.prod}"
REF="${2:-}"
PROJECT_NAME="processmap_prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "[rollback-prod] missing env file: $ENV_FILE" >&2
  exit 1
fi

if [ -n "$REF" ]; then
  git fetch --tags --all
  git checkout "$REF"
fi

APP_ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml -p "$PROJECT_NAME" up -d --remove-orphans postgres redis api gateway
"$ROOT_DIR/deploy/scripts/smoke_prod.sh" "$ENV_FILE"
echo "[rollback-prod] completed"
