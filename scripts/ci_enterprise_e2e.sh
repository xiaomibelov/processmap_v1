#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "${ROOT_DIR}"

API_BASE="${E2E_API_BASE_URL:-http://127.0.0.1:18011}"
APP_BASE="${E2E_APP_BASE_URL:-http://127.0.0.1:4177}"
BACKEND_PID=""

endpoint_up() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${url}" || true)"
  [ "${code}" != "000" ] && [ -n "${code}" ]
}

cleanup() {
  if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

if ! endpoint_up "${API_BASE}/api/health"; then
  API_PORT="$(printf '%s' "${API_BASE}" | sed -E 's#^https?://[^:]+:([0-9]+).*$#\1#')"
  if ! printf '%s' "${API_PORT}" | rg -q '^[0-9]+$'; then
    API_PORT="8011"
  fi
  (
    cd "${ROOT_DIR}/backend"
    DEV_SEED_ADMIN="${DEV_SEED_ADMIN:-1}" \
    ADMIN_EMAIL="${E2E_USER:-${E2E_ADMIN_EMAIL:-admin@local}}" \
    ADMIN_PASSWORD="${E2E_PASS:-${E2E_ADMIN_PASSWORD:-admin}}" \
    PYTHONPATH=. python -m uvicorn app.main:app --host 127.0.0.1 --port "${API_PORT}" >/tmp/fpc_ci_enterprise_backend.log 2>&1
  ) &
  BACKEND_PID="$!"
  for _ in $(seq 1 60); do
    if endpoint_up "${API_BASE}/api/health"; then
      break
    fi
    sleep 1
  done
  if ! endpoint_up "${API_BASE}/api/health"; then
    echo "[ci_enterprise_e2e] backend is unavailable at ${API_BASE}" >&2
    if [ -f /tmp/fpc_ci_enterprise_backend.log ]; then
      tail -n 120 /tmp/fpc_ci_enterprise_backend.log >&2 || true
    fi
    exit 1
  fi
fi

export E2E_API_BASE_URL="${API_BASE}"
export E2E_APP_BASE_URL="${APP_BASE}"
export E2E_PROFILE="enterprise"
export E2E_ORG_SWITCH="${E2E_ORG_SWITCH:-1}"
export E2E_ENTERPRISE="${E2E_ENTERPRISE:-1}"
export E2E_REPORTS_DELETE="${E2E_REPORTS_DELETE:-1}"
export E2E_ENTERPRISE_REPORTS_DELETE="${E2E_ENTERPRISE_REPORTS_DELETE:-${E2E_REPORTS_DELETE:-1}}"

if [ "$#" -gt 0 ]; then
  ./scripts/e2e_enterprise.sh "$@"
  exit $?
fi

echo "== e2e critical smoke suite (8-9 specs) =="
if ! ./scripts/e2e_enterprise.sh --critical-smoke; then
  echo "retry: critical smoke suite"
  ./scripts/e2e_enterprise.sh --critical-smoke
fi

echo
echo "ci_enterprise_e2e: PASS"
