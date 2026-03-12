#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"

run_backend() {
  echo "== backend: C1 shared/meta boundary =="
  (
    cd "${ROOT_DIR}"
    PYTHONPATH=backend python3 -m unittest backend.tests.test_bpmn_meta -q
  )
}

run_frontend_units() {
  echo "== frontend: draw.io boundary units =="
  (
    cd "${ROOT_DIR}/frontend"
    node --test \
      src/features/session-meta/sessionMetaBoundary.test.mjs \
      src/features/process/drawio/controllers/useDrawioEditorBridge.test.mjs \
      src/features/process/drawio/runtime/drawioOverlayPointerOwnership.test.mjs \
      src/features/process/drawio/runtime/useDrawioPersistHydrateBoundary.test.mjs \
      src/features/process/drawio/domain/drawioVisibilitySelectionContract.test.mjs
  )
}

run_browser_gate() {
  echo "== browser: draw.io authoritative smoke =="
  (
    cd "${ROOT_DIR}"
    E2E_DRAWIO_SMOKE="${E2E_DRAWIO_SMOKE:-1}" \
      ./scripts/e2e_enterprise.sh \
      e2e/drawio-fresh-session-closure.spec.mjs \
      e2e/drawio-overlay-runtime-entry-contract.spec.mjs \
      e2e/drawio-browser-runtime-anchoring.spec.mjs \
      e2e/drawio-stage1-boundary-smoke.spec.mjs \
      e2e/drawio-ghost-materialization-boundary.spec.mjs
  )
}

usage() {
  cat <<'EOF'
Usage:
  scripts/drawio_regression_gate.sh
    Run the repeatable backend + frontend unit/invariant gate.

  scripts/drawio_regression_gate.sh --browser
    Run backend + frontend units and the authoritative browser smoke subset.

  scripts/drawio_regression_gate.sh --browser-only
    Run only the authoritative browser smoke subset.
EOF
}

mode="units"
if [ "${1:-}" = "--browser" ]; then
  mode="browser"
elif [ "${1:-}" = "--browser-only" ]; then
  mode="browser-only"
elif [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
elif [ -n "${1:-}" ]; then
  echo "Unknown option: ${1}" >&2
  usage >&2
  exit 2
fi

if [ "${mode}" != "browser-only" ]; then
  run_backend
  run_frontend_units
fi

if [ "${mode}" = "browser" ] || [ "${mode}" = "browser-only" ]; then
  run_browser_gate
fi

echo "drawio_regression_gate: PASS"
