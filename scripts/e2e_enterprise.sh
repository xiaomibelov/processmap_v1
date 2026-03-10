#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "${ROOT_DIR}"

APP_URL="${E2E_APP_BASE_URL:-http://127.0.0.1:4177}"
API_BASE="${E2E_API_BASE_URL:-http://127.0.0.1:18011}"
APP_PID=""
BACKEND_PID=""
BOOTSTRAP_CREATED="0"
BOOTSTRAP_PROJECT_ID=""

endpoint_up() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${url}" || true)"
  [ "${code}" != "000" ] && [ -n "${code}" ]
}

cleanup() {
  if [ "${BOOTSTRAP_CREATED}" = "1" ] && [ -n "${BOOTSTRAP_PROJECT_ID}" ]; then
    (
      cd "${ROOT_DIR}/frontend"
      E2E_API_BASE_URL="${API_BASE}" \
      E2E_ORG_ID="${E2E_ORG_ID:-}" \
      E2E_BOOTSTRAP_PROJECT_ID="${BOOTSTRAP_PROJECT_ID}" \
      node e2e/helpers/enterpriseBootstrap.mjs --cleanup >/tmp/fpc_e2e_enterprise_cleanup.log 2>&1
    ) || true
  fi
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

if ! endpoint_up "${API_BASE}/api/health"; then
  API_PORT="$(printf '%s' "${API_BASE}" | sed -E 's#^https?://[^:]+:([0-9]+).*$#\1#')"
  if ! printf '%s' "${API_PORT}" | rg -q '^[0-9]+$'; then
    API_PORT="18011"
  fi
  (
    cd "${ROOT_DIR}/backend"
    DEV_SEED_ADMIN="${DEV_SEED_ADMIN:-1}" \
    ADMIN_EMAIL="${E2E_USER:-${E2E_ADMIN_EMAIL:-admin@local}}" \
    ADMIN_PASSWORD="${E2E_PASS:-${E2E_ADMIN_PASSWORD:-admin}}" \
    PYTHONPATH=. python -m uvicorn app.main:app --host 127.0.0.1 --port "${API_PORT}" >/tmp/fpc_e2e_enterprise_backend.log 2>&1
  ) &
  BACKEND_PID="$!"
  for _ in $(seq 1 60); do
    if endpoint_up "${API_BASE}/api/health"; then
      break
    fi
    sleep 1
  done
  if ! endpoint_up "${API_BASE}/api/health"; then
    echo "[e2e_enterprise] backend is unavailable at ${API_BASE}" >&2
    if [ -f /tmp/fpc_e2e_enterprise_backend.log ]; then
      tail -n 120 /tmp/fpc_e2e_enterprise_backend.log >&2 || true
    fi
    exit 1
  fi
fi

if ! curl -fsS "${APP_URL}" >/dev/null 2>&1; then
  APP_PORT="$(printf '%s' "${APP_URL}" | sed -E 's#^https?://[^:]+:([0-9]+).*$#\1#')"
  if ! printf '%s' "${APP_PORT}" | rg -q '^[0-9]+$'; then
    APP_PORT="5177"
  fi
  (
    cd "${ROOT_DIR}/frontend"
    VITE_API_PROXY_TARGET="${API_BASE}" \
    VITE_PORT="${APP_PORT}" \
    VITE_HMR_PORT="${APP_PORT}" \
    npm run dev -- --host 127.0.0.1 --port "${APP_PORT}" >/tmp/fpc_e2e_enterprise_frontend.log 2>&1
  ) &
  APP_PID="$!"
  for _ in $(seq 1 60); do
    if curl -fsS "${APP_URL}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ! curl -fsS "${APP_URL}" >/dev/null 2>&1; then
    echo "[e2e_enterprise] frontend is unavailable at ${APP_URL}" >&2
    if [ -f /tmp/fpc_e2e_enterprise_frontend.log ]; then
      tail -n 80 /tmp/fpc_e2e_enterprise_frontend.log >&2 || true
    fi
    exit 1
  fi
fi

export E2E_PROFILE="enterprise"
export E2E_ORG_SWITCH="${E2E_ORG_SWITCH:-1}"
export E2E_ENTERPRISE="${E2E_ENTERPRISE:-1}"
export E2E_REPORTS_DELETE="${E2E_REPORTS_DELETE:-1}"
export E2E_ENTERPRISE_REPORTS_DELETE="${E2E_ENTERPRISE_REPORTS_DELETE:-$E2E_REPORTS_DELETE}"
export E2E_APP_BASE_URL="${APP_URL}"
export E2E_API_BASE_URL="${API_BASE}"

BOOTSTRAP_EXPORTS="$(
  cd "${ROOT_DIR}/frontend"
  node e2e/helpers/enterpriseBootstrap.mjs --shell
)"
eval "${BOOTSTRAP_EXPORTS}"
BOOTSTRAP_CREATED="${E2E_BOOTSTRAP_CREATED:-0}"
BOOTSTRAP_PROJECT_ID="${E2E_BOOTSTRAP_PROJECT_ID:-}"

cd "${ROOT_DIR}/frontend"

DEFAULT_SPECS=(
  e2e/accept-invite-enterprise.spec.mjs
  e2e/org-switcher.spec.mjs
  e2e/org-settings-invites-audit.spec.mjs
  e2e/reports-delete-enterprise.spec.mjs
)

CRITICAL_SMOKE_SPECS=(
  e2e/accept-invite-enterprise.spec.mjs
  e2e/org-switcher.spec.mjs
  e2e/org-settings-invites-audit.spec.mjs
  e2e/reports-delete-enterprise.spec.mjs
)

if [ "$#" -gt 0 ] && [ "$1" = "--critical-smoke" ]; then
  echo "== critical smoke: enterprise baseline =="
  npx playwright test "${CRITICAL_SMOKE_SPECS[@]}"

  echo
  echo "== critical smoke: hybrid delete/reload =="
  E2E_HYBRID_LAYER=1 E2E_HYBRID_GHOST_CHECK=0 npx playwright test e2e/hybrid-layer-delete-reload.spec.mjs

  echo
  echo "== critical smoke: hybrid basic edit/delete/reload =="
  E2E_HYBRID_LAYER=1 E2E_HYBRID_GHOST_CHECK=0 npx playwright test e2e/hybrid-basic-edit-delete-reload.spec.mjs

  echo
  echo "== critical smoke: templates add/apply =="
  E2E_TEMPLATES=1 npx playwright test e2e/templates-basic-add-apply.spec.mjs

  echo
  echo "== critical smoke: templates stencil placement =="
  E2E_TEMPLATES=1 E2E_HYBRID_LAYER=1 npx playwright test e2e/templates-hybrid-stencil-placement.spec.mjs

  echo
  echo "== critical smoke: drawio (optional env-gated) =="
  if [ "${E2E_DRAWIO_SMOKE:-0}" = "1" ]; then
    E2E_HYBRID_LAYER=1 E2E_DRAWIO=1 npx playwright test e2e/drawio-overlay-zoom-pan.spec.mjs
  else
    echo "skip: set E2E_DRAWIO_SMOKE=1 to include e2e/drawio-overlay-zoom-pan.spec.mjs"
  fi
elif [ "$#" -gt 0 ]; then
  npx playwright test "$@"
else
  npx playwright test "${DEFAULT_SPECS[@]}"
fi
