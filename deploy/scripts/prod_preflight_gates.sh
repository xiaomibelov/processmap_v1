#!/usr/bin/env bash
# Preflight-гейты прод-деплоя (PLAN §2.2): fail-fast ДО любых изменений на хосте.
# Исполняется на прод-хосте по SSH (job gates workflow deploy-prod.yml).
# Любой BLOCKED = exit 1, job красный, на хосте ничего не менялось.
set -euo pipefail

APP_DIR="/opt/processmap/app"
ENV_FILE="/opt/processmap/env/prod.env"
PROD_BASE_URL="https://processmap.ru"
MIN_DISK_AVAIL_KB=$((8 * 1024 * 1024))  # 8GB: БД 2.7GB + образы

fail() {
  echo "PREFLIGHT FAIL: $*" >&2
  exit 1
}

echo "=== [preflight 1/5] pristine checkout: ${APP_DIR} ==="
[ -d "${APP_DIR}/.git" ] || fail "${APP_DIR} не является git-checkout"
DIRTY="$(git -C "${APP_DIR}" status --porcelain || true)"
if [ -n "${DIRTY}" ]; then
  echo "${DIRTY}" >&2
  fail "checkout dirty — зафиксируйте/уберите изменения (релиз-контур: 365 dirty-файлов были BLOCKED'ом)"
fi
CHECKOUT_SHA="$(git -C "${APP_DIR}" rev-parse HEAD)"
echo "OK: checkout pristine, HEAD=${CHECKOUT_SHA}"

echo "=== [preflight 2/5] alembic: single head + unique revision ids ==="
ALEMBIC_OUT="$(docker exec app-api-1 sh -c 'cd /app/backend && python -m alembic -c alembic.ini heads' 2>&1)" \
  || fail "alembic heads не выполнился: ${ALEMBIC_OUT}"
echo "${ALEMBIC_OUT}"
HEAD_COUNT="$(printf '%s\n' "${ALEMBIC_OUT}" | grep -c ' (head)' || true)"
[ "${HEAD_COUNT}" = "1" ] || fail "alembic heads=${HEAD_COUNT}, ожидается ровно 1 (дубли revision id / несколько голов)"
DUP_REVISIONS="$(docker exec app-api-1 sh -c 'grep -rh "^revision = " backend/alembic/versions/ | sort | uniq -d' || true)"
[ -z "${DUP_REVISIONS}" ] || fail "дубли revision id в backend/alembic/versions: ${DUP_REVISIONS}"
echo "OK: single head, revision ids unique"

echo "=== [preflight 3/5] 3-way drift: served == env == checkout ==="
SERVED_SHA="$(curl -fsS -m 15 "${PROD_BASE_URL}/version" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("commit",""))' || true)"
[ -n "${SERVED_SHA}" ] || fail "${PROD_BASE_URL}/version недоступен или не содержит commit"
ENV_SHA="$(grep -E '^BUILD_ID=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- || true)"
[ -n "${ENV_SHA}" ] || fail "BUILD_ID не найден в ${ENV_FILE}"
echo "served  =${SERVED_SHA}"
echo "env     =${ENV_SHA}"
echo "checkout=${CHECKOUT_SHA}"
[ "${SERVED_SHA}" = "${ENV_SHA}" ] || fail "served (${SERVED_SHA}) != env (${ENV_SHA}) — есть незавершённое окно деплоя?"
[ "${ENV_SHA}" = "${CHECKOUT_SHA}" ] || fail "env (${ENV_SHA}) != checkout HEAD (${CHECKOUT_SHA})"
echo "OK: drift отсутствует"

echo "=== [preflight 4/5] диск: containerd/docker store, порог 8GB avail ==="
if [ -d /var/lib/containerd ]; then
  DISK_TARGET="/var/lib/containerd"
else
  DISK_TARGET="/var/lib/docker"
  echo "WARN: /var/lib/containerd отсутствует — fallback на ${DISK_TARGET} (docker store, пометка в логе)"
fi
AVAIL_KB="$(df -k "${DISK_TARGET}" | awk 'NR==2 {print $4}')"
[ -n "${AVAIL_KB}" ] || fail "df по ${DISK_TARGET} не отдал avail"
echo "${DISK_TARGET}: avail=${AVAIL_KB}KB"
[ "${AVAIL_KB}" -ge "${MIN_DISK_AVAIL_KB}" ] || fail "свободного места < 8GB (avail=${AVAIL_KB}KB)"
echo "OK: диск >= 8GB avail"

echo "=== [preflight 5/5] гигиена: cleanup-cron ==="
crontab -l 2>/dev/null | grep -q 'docker-cleanup' \
  || fail "cleanup-cron (docker-cleanup) не найден в crontab — образы/логи заполнят диск"
echo "OK: cleanup-cron на месте"

echo "PREFLIGHT: все гейты зелёные"
