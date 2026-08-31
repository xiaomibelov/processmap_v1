#!/usr/bin/env bash
set -euo pipefail

# Unit tests for scripts/prod_verify_celery_task.sh.
# Mocks docker + celery via a temp directory on PATH.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PASS=0
FAIL=0

TMPDIR="$(mktemp -d /tmp/test_prod_verify_celery.XXXXXX)"
trap 'rm -rf "${TMPDIR}"' EXIT

MOCK_DIR="${TMPDIR}/bin"
mkdir -p "${MOCK_DIR}"

# CELERY_MOCK_RESPONSE is set by each test case.
cat > "${MOCK_DIR}/celery" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
# Simulate "celery -A backend.app.celery_app inspect registered --timeout N"
printf '%s\n' "${CELERY_MOCK_RESPONSE}"
EOF
chmod +x "${MOCK_DIR}/celery"

cat > "${MOCK_DIR}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
# Just pass through to celery; container arg is ignored for the mock.
shift
celery "$@"
EOF
chmod +x "${MOCK_DIR}/docker"

export PATH="${MOCK_DIR}:${PATH}"

run_check() {
  local retries="${1:-3}"
  local delay="${2:-0}"
  "${REPO_ROOT}/deploy/verify_celery_task.sh" \
    --container "app-celery-worker-1" \
    --task "refresh_session_analytics_task" \
    --retries "${retries}" \
    --delay "${delay}" \
    --timeout 5
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local msg="$3"
  if [ "${expected}" = "${actual}" ]; then
    echo "PASS: ${msg}"
    PASS=$((PASS + 1))
  else
    echo "FAIL: ${msg} (expected '${expected}', got '${actual}')"
    FAIL=$((FAIL + 1))
  fi
}

# --- case (a): task is present in output ---
export CELERY_MOCK_RESPONSE=$'->  celery@worker: OK\n    * processmap.overlay.render_overlay_task\n    * processmap.analytics.refresh_session_analytics_task\n    * processmap.rag.index_session_bpmn_xml\n\n1 node online.'
if run_check 1 0 >/dev/null 2>&1; then
  assert_eq "0" "0" "task present -> exit 0"
else
  assert_eq "0" "1" "task present -> exit 0"
fi

# --- case (b): task list returned but task missing -> immediate fail (no retry) ---
export CELERY_MOCK_RESPONSE=$'->  celery@worker: OK\n    * processmap.overlay.render_overlay_task\n    * processmap.rag.index_session_bpmn_xml\n\n1 node online.'
attempts=0
if run_check 5 0 2>/dev/null; then
  assert_eq "1" "0" "task missing -> exit 1"
else
  assert_eq "1" "1" "task missing -> exit 1"
fi
# With retries=5 and immediate fail-fast, the script should print the mismatch
# message on the first attempt. Verify only one attempt was logged.
attempts=$(run_check 5 0 2>&1 | grep -c "inspect attempt" || true)
assert_eq "1" "${attempts}" "task missing -> fail-fast on first attempt"

# --- case (c): no nodes replied -> retry until task appears ---
NO_NODES=$'Error: No nodes replied within time constraint.\nPlease verify that the worker is running and the broker is reachable.'
WITH_TASK=$'->  celery@worker: OK\n    * processmap.analytics.refresh_session_analytics_task\n\n1 node online.'
# We need the mock to return no-nodes on first two calls and task on third.
# Use a counter file.
COUNTER_FILE="${TMPDIR}/counter"
echo 0 > "${COUNTER_FILE}"
cat > "${MOCK_DIR}/celery" <<EOF
#!/usr/bin/env bash
set -euo pipefail
count=\$(cat "${COUNTER_FILE}")
next=\$((count + 1))
echo "\${next}" > "${COUNTER_FILE}"
if [ "\${next}" -lt 3 ]; then
  printf '%s\n' "\${NO_NODES}"
else
  printf '%s\n' "\${WITH_TASK}"
fi
EOF
chmod +x "${MOCK_DIR}/celery"
# Re-create docker mock pointing to the new celery mock.
cat > "${MOCK_DIR}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
shift
celery "$@"
EOF
chmod +x "${MOCK_DIR}/docker"

NO_NODES="${NO_NODES}" WITH_TASK="${WITH_TASK}" run_check 5 0 >/dev/null 2>&1 && rc=0 || rc=1
assert_eq "0" "${rc}" "no nodes replied twice then task -> exit 0"

# --- summary ---
echo ""
echo "=== prod_verify_celery tests: ${PASS} passed, ${FAIL} failed ==="
if [ "${FAIL}" -ne 0 ]; then
  exit 1
fi
