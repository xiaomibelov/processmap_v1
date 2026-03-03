#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

export E2E_PROFILE="enterprise"
export E2E_ORG_SWITCH="${E2E_ORG_SWITCH:-1}"
export E2E_ENTERPRISE="${E2E_ENTERPRISE:-1}"
export E2E_REPORTS_DELETE="${E2E_REPORTS_DELETE:-1}"
export E2E_ENTERPRISE_REPORTS_DELETE="${E2E_ENTERPRISE_REPORTS_DELETE:-$E2E_REPORTS_DELETE}"

cd frontend
npx playwright test \
  e2e/org-switcher.spec.mjs \
  e2e/org-settings-invites-audit.spec.mjs \
  e2e/reports-delete-enterprise.spec.mjs \
  "$@"
