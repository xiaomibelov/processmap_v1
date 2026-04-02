#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

API_BASE="${E2E_API_BASE_URL:-http://127.0.0.1:18011}"
APP_URL="${E2E_APP_BASE_URL:-http://127.0.0.1:4177}"
BACKEND_PID=""
APP_PID=""

cleanup() {
  if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [ -n "${APP_PID}" ] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

endpoint_up() {
  local url="$1"
  curl -fsS "$url" >/dev/null 2>&1
}

if ! endpoint_up "${API_BASE}/api/health"; then
  (
    cd backend
    DEV_SEED_ADMIN="${DEV_SEED_ADMIN:-1}" \
    ADMIN_EMAIL="${E2E_USER:-${E2E_ADMIN_EMAIL:-admin@local}}" \
    ADMIN_PASSWORD="${E2E_PASS:-${E2E_ADMIN_PASSWORD:-admin}}" \
    PYTHONPATH=. python -m uvicorn app.main:app --host 127.0.0.1 --port 18011 >/tmp/fpc_drawio_forensics_backend.log 2>&1
  ) &
  BACKEND_PID="$!"
  for _ in $(seq 1 60); do
    if endpoint_up "${API_BASE}/api/health"; then
      break
    fi
    sleep 1
  done
fi

if ! endpoint_up "${APP_URL}"; then
  (
    cd frontend
    VITE_API_PROXY_TARGET="${API_BASE}" \
    VITE_PORT="4177" \
    VITE_HMR_PORT="4177" \
    npm run dev -- --host 127.0.0.1 --port 4177 >/tmp/fpc_drawio_forensics_frontend.log 2>&1
  ) &
  APP_PID="$!"
  for _ in $(seq 1 60); do
    if endpoint_up "${APP_URL}"; then
      break
    fi
    sleep 1
  done
fi

cd frontend
export E2E_PROFILE="${E2E_PROFILE:-enterprise}"
export E2E_ORG_SWITCH="${E2E_ORG_SWITCH:-1}"
export E2E_ENTERPRISE="${E2E_ENTERPRISE:-1}"
export E2E_APP_BASE_URL="${APP_URL}"
export E2E_API_BASE_URL="${API_BASE}"
BOOTSTRAP_EXPORTS="$(node e2e/helpers/enterpriseBootstrap.mjs --shell)"
eval "${BOOTSTRAP_EXPORTS}"
node ../scripts/collect_drawio_forensics_v2.mjs
