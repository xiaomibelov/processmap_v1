#!/usr/bin/env bash
# Entrypoint api-контейнера: миграции БД + справочные сиды перед стартом uvicorn.
# Идемпотентно. Причина: деплой/рестарт по git не гарантирует применение
# alembic-миграций (инцидент 2026-07-29 — 500 /api/operation-catalog на stage).
# Падение миграций = контейнер не стартует (честный фейл вместо сломанного API;
# healthcheck деплоя откатит на предыдущий контейнер).
set -euo pipefail

cd /app

echo "[entrypoint] alembic upgrade head"
python -m alembic -c backend/alembic.ini upgrade head

echo "[entrypoint] reference seeds (operation catalog + dictionaries)"
python backend/seed_operations.py
python backend/seed_dictionaries.py

echo "[entrypoint] starting uvicorn"
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
