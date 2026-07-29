#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REF="${1:-}"
if [ -n "$REF" ]; then
  git fetch --tags --all
  git checkout "$REF"
fi

docker compose config -q
docker compose build api frontend
docker compose up -d --remove-orphans postgres redis api frontend
# NB: миграции БД + сиды — в entrypoint api-контейнера (backend/docker-entrypoint.sh).
# Прямой `alembic -c backend/alembic.ini` не работает (placeholder fpc:***@postgres в ini).

"$ROOT_DIR/deploy/scripts/server_smoke.sh"
echo "[deploy] update completed"
