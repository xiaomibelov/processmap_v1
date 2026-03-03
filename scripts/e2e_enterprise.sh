#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

APP_URL="${E2E_APP_BASE_URL:-http://127.0.0.1:5177}"
APP_PID=""

cleanup() {
  if [ -n "${APP_PID}" ] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

if ! curl -fsS "${APP_URL}" >/dev/null 2>&1; then
  APP_PORT="$(printf '%s' "${APP_URL}" | sed -E 's#^https?://[^:]+:([0-9]+).*$#\1#')"
  if ! printf '%s' "${APP_PORT}" | rg -q '^[0-9]+$'; then
    APP_PORT="5177"
  fi
  (
    cd frontend
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

cd frontend
npx playwright test \
  e2e/accept-invite-enterprise.spec.mjs \
  e2e/org-switcher.spec.mjs \
  e2e/org-settings-invites-audit.spec.mjs \
  e2e/reports-delete-enterprise.spec.mjs \
  "$@"
