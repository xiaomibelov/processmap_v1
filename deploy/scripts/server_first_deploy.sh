#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "[deploy] missing .env. Run deploy/scripts/server_bootstrap.sh first." >&2
  exit 1
fi

docker compose config -q
docker compose build api frontend
docker compose up -d postgres redis
docker compose up -d api frontend gateway

"$ROOT_DIR/deploy/scripts/server_smoke.sh"
echo "[deploy] first deploy completed"
