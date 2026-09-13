#!/usr/bin/env bash
# Миграции БД ДО up (PLAN §2.5.3), НОВЫМ образом релиза.
#
# Почему не `compose run api ...`: сервис api в compose собирается из checkout
# хоста, и на момент миграций app-api:latest ещё указывает на СТАРЫЙ образ
# (retag на ghcr-образы происходит после backup). Миграции обязан гнать код
# НОВОГО релиза, иначе схему поднимет старый код и post-gate /api/health
# отловит degraded уже после переключения трафика. Поэтому — прямой
# `docker run` скачанного CI-образа ghcr.io/.../api:<sha> в сети проекта.
# Паттерн ini из backend/docker-entrypoint.sh (temp ini из DATABASE_URL);
# повторный прогон entrypoint при старте api идемпотентен (приём релиз-контура).
set -euo pipefail

IMAGE="${1:-}"
if [ -z "${IMAGE}" ]; then
  echo "usage: prod_migrate.sh <api-image>" >&2
  exit 2
fi

ENV_FILE="${ENV_FILE:-/opt/processmap/env/prod.env}"
NETWORK="${NETWORK:-app_default}"

echo "[prod-migrate] image=${IMAGE}"
docker image inspect "${IMAGE}" >/dev/null 2>&1 || { echo "FAIL: образ ${IMAGE} не скачан на хост" >&2; exit 1; }

docker run --rm \
  --network "${NETWORK}" \
  --env-file "${ENV_FILE}" \
  --entrypoint sh \
  "${IMAGE}" \
  -c '
set -euo pipefail
cd /app

# DATABASE_URL → драйвер psycopg (паттерн backend/docker-entrypoint.sh)
ALEMBIC_DB_URL="${DATABASE_URL:-postgresql://fpc:fpc@postgres:5432/processmap}"
case "$ALEMBIC_DB_URL" in
  postgresql+psycopg://*) : ;;
  postgresql://*) ALEMBIC_DB_URL="postgresql+psycopg://${ALEMBIC_DB_URL#postgresql://}" ;;
esac

TMP_INI="$(mktemp /tmp/alembic.runtime.XXXXXX.ini)"
sed "s|^sqlalchemy.url =.*|sqlalchemy.url = ${ALEMBIC_DB_URL}|" backend/alembic.ini > "$TMP_INI"

echo "[prod-migrate] db_bootstrap → alembic head"
python backend/scripts/db_bootstrap.py "$TMP_INI"
echo "[prod-migrate] migrations OK"
'

echo "[prod-migrate] done: схема БД приведена к head образа ${IMAGE}"
