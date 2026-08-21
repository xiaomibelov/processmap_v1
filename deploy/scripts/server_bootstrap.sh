#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

for cmd in docker git curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[bootstrap] missing required command: $cmd" >&2
    exit 1
  fi
done

mkdir -p workspace/processes workspace/.session_store deploy/logs
touch workspace/processes/.keep

if [ ! -f .env ]; then
  cp deploy/.env.server.example .env
  echo "[bootstrap] created .env from deploy/.env.server.example"
else
  echo "[bootstrap] existing .env kept as-is"
fi

docker compose config -q
echo "[bootstrap] docker compose config OK"
echo "[bootstrap] next: edit .env and run deploy/scripts/server_first_deploy.sh"
