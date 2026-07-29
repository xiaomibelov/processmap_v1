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

# DB migrations + reference seeds (idempotent). Без этого после деплоя нового
# кода старые таблицы/колонки отсутствуют → 500 на API (инцидент L10N 2026-07-29:
# /api/operation-catalog 500 из-за неприменённой миграции 009 на stage).
echo "[deploy] alembic upgrade head"
docker compose exec -T api python -m alembic -c backend/alembic.ini upgrade head
echo "[deploy] reference seeds (operation catalog + dictionaries)"
docker compose exec -T api python backend/seed_operations.py
docker compose exec -T api python backend/seed_dictionaries.py

"$ROOT_DIR/deploy/scripts/server_smoke.sh"
echo "[deploy] update completed"
