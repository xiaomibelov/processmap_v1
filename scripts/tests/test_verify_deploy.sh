#!/usr/bin/env bash
set -euo pipefail

# Unit tests for verify-deploy.sh helper functions.
# The script is sourced (not executed) so main() is not run.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../../verify-deploy.sh
source "${REPO_ROOT}/verify-deploy.sh"

PASS=0
FAIL=0

assert_eq() {
  local expected="$1"
  local actual="$2"
  local msg="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $msg"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $msg (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

# --- normalize_sha ---
assert_eq "9d99e8ae" "$(normalize_sha "9d99e8ae7e990992aab573f7f3a8e5d4408de139")" "normalize_sha truncates full SHA"
assert_eq "9d99e8ae" "$(normalize_sha "9d99e8ae")" "normalize_sha keeps short SHA"
assert_eq "9d99e8ae" "$(normalize_sha "9D99E8AE7E990992")" "normalize_sha lowercases and truncates"
assert_eq "abc123" "$(normalize_sha "abc123")" "normalize_sha keeps short non-8-char SHA unchanged"
assert_eq "unknown" "$(normalize_sha "unknown")" "normalize_sha keeps unknown unchanged"
assert_eq "unknown" "$(normalize_sha "")" "normalize_sha handles empty input"

# --- detect_compose_project fallback ---
# When no docker is available or no container matches, fallback is processmap_v1.
assert_eq "processmap_v1" "$(detect_compose_project)" "detect_compose_project falls back to processmap_v1"

# --- check_agent_container ---
# Stub list_compose_services to simulate agent not in stack.
list_compose_services() { printf 'api\nfrontend\ncelery-worker\n'; }
assert_eq "not_in_stack" "$(check_agent_container "app")" "check_agent_container returns not_in_stack when agent absent"

# Stub list_compose_services with agent and docker to simulate running.
list_compose_services() { printf 'api\nagent\nredis\n'; }
command() {
  if [ "$1" = "-v" ] && [ "$2" = "docker" ]; then
    return 0
  fi
  command "$@"
}
docker() {
  if [ "$1" = "inspect" ] && [ "$2" = "-f" ]; then
    echo "running"
  fi
}
assert_eq "running" "$(check_agent_container "app")" "check_agent_container returns running for healthy agent"
unset -f command docker list_compose_services

# --- summary ---
echo ""
echo "=== verify-deploy tests: ${PASS} passed, ${FAIL} failed ==="
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
