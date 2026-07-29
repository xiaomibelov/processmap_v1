#!/usr/bin/env bash
# Entrypoint api-контейнера: миграции БД + справочные сиды перед стартом uvicorn.
#
# История: 2026-07-29 stage получил 500 на alembic-таблицах (деплой не
# мигрировал БД). Первая версия entrypoint упиралась в placeholder
# `fpc:***@postgres` в backend/alembic.ini → api ушёл в crash-loop (502).
# v2: URL берём из DATABASE_URL окружения (temp ini, как в regression-скрипте),
# 3 попытки с backoff; при неудаче — DEGRADED-старт (доступность важнее:
# сервис поднимается, ошибка видна в логах), БЕЗ crash-loop.
set -uo pipefail

cd /app

ALEMBIC_DB_URL="${DATABASE_URL:-postgresql://fpc:fpc@postgres:5432/processmap}"
case "$ALEMBIC_DB_URL" in
  postgresql+psycopg://*) : ;;
  postgresql://*) ALEMBIC_DB_URL="postgresql+psycopg://${ALEMBIC_DB_URL#postgresql://}" ;;
esac

TMP_INI="$(mktemp /tmp/alembic.runtime.XXXXXX.ini)"
sed "s|^sqlalchemy.url =.*|sqlalchemy.url = ${ALEMBIC_DB_URL}|" backend/alembic.ini > "$TMP_INI"

MIGRATIONS_OK=0
for attempt in 1 2 3; do
  echo "[entrypoint] db_bootstrap → alembic head (attempt ${attempt}/3)"
  if python backend/scripts/db_bootstrap.py "$TMP_INI"; then
    MIGRATIONS_OK=1
    break
  fi
  sleep 10
done

if [ "$MIGRATIONS_OK" = "1" ]; then
  echo "[entrypoint] reference seeds (operation catalog + dictionaries + kitchens)"
  python backend/seed_operations.py || echo "[entrypoint] WARN: seed_operations failed"
  python backend/seed_dictionaries.py || echo "[entrypoint] WARN: seed_dictionaries failed"
  python backend/seed_kitchens.py || echo "[entrypoint] WARN: seed_kitchens failed"
  echo "[entrypoint] demo seeds (UX1: technologist-demo + workflow demo data)"
  python backend/seed_technologist_user.py || echo "[entrypoint] WARN: seed_technologist_user failed"
  python backend/seed_demo_workflow.py || echo "[entrypoint] WARN: seed_demo_workflow failed"
else
  echo "[entrypoint] ERROR: migrations FAILED — degraded start (схема БД старше кода)"
fi

echo "[entrypoint] starting uvicorn"
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
