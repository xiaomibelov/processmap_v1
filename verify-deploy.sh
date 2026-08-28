#!/usr/bin/env bash
set -euo pipefail

# Verify that the locally checked-out commit matches the deployed API /version
# and that expected containers are running.
#
# Environment overrides:
#   SERVER_URL    - external URL for status messages
#   API_URL       - URL to query /version
#   AGENT_CONTAINER - explicit agent container name (skips auto-detection)

# normalize_sha <sha>
# Returns the first 8 hex chars of a git SHA so short and full SHAs can be
# compared safely. Non-hex input is returned unchanged.
normalize_sha() {
  local sha="${1:-unknown}"
  # Strip leading/trailing whitespace and lowercase.
  sha=$(printf '%s' "$sha" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
  if [[ "$sha" =~ ^[0-9a-f]{8,}$ ]]; then
    echo "${sha:0:8}"
  else
    echo "$sha"
  fi
}

# detect_compose_project
# Finds the compose project name of a running container whose working-dir label
# matches the current directory. Falls back to "processmap_v1" for local dev.
detect_compose_project() {
  local pwd_abs
  pwd_abs=$(pwd)
  local project=""
  if command -v docker >/dev/null 2>&1; then
    # Use any running container from this compose working directory.
    project=$(docker ps -q \
      --filter "label=com.docker.compose.project.working_dir=${pwd_abs}" 2>/dev/null \
      | head -n 1 \
      | xargs -r docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null \
      || true)
  fi
  if [ -z "$project" ]; then
    project="processmap_v1"
  fi
  echo "$project"
}

# list_compose_services
# Lists service names defined in the current compose project (base file only).
list_compose_services() {
  if command -v docker >/dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    docker compose config --services 2>/dev/null || true
  fi
}

# check_agent_container <project>
# Returns 0/1 via stdout: "running", "missing", "not_in_stack", or other state.
check_agent_container() {
  local project="$1"
  local agent_container="${project}-agent-1"
  if ! command -v docker >/dev/null 2>&1; then
    echo "no_docker"
    return
  fi
  # If agent is not defined in the compose stack, treat as intentionally absent.
  if ! list_compose_services | grep -qx "agent"; then
    echo "not_in_stack"
    return
  fi
  docker inspect -f '{{.State.Status}}' "${agent_container}" 2>/dev/null || echo "missing"
}

main() {
  cd "$(dirname "$0")"

  SERVER_URL="${SERVER_URL:-https://stage.processmap.ru}"
  API_URL="${API_URL:-https://stage.processmap.ru}"

  echo "=== VERIFY DEPLOY ==="
  echo "Server: ${SERVER_URL}"

  LOCAL_HASH=$(git rev-parse --short HEAD)
  LOCAL_HASH_NORM=$(normalize_sha "$LOCAL_HASH")
  echo "Local git HEAD:  ${LOCAL_HASH_NORM}"

  SERVER_HASH=$(curl -fsS "${API_URL}/version" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit','unknown'))" || echo "unknown")
  SERVER_HASH_NORM=$(normalize_sha "$SERVER_HASH")
  echo "Server /version: ${SERVER_HASH_NORM}"

  echo ""
  VERSION_OK=1
  if [ "${LOCAL_HASH_NORM}" = "${SERVER_HASH_NORM}" ]; then
    echo "MATCH: local ${LOCAL_HASH_NORM} == server ${SERVER_HASH_NORM}"
  else
    echo "FAIL: local ${LOCAL_HASH_NORM} != server ${SERVER_HASH_NORM}"
    echo "The server is on an old commit. Full rebuild + redeploy required."
    VERSION_OK=0
  fi

  echo ""
  AGENT_OK=1
  AGENT_CONTAINER="${AGENT_CONTAINER:-}"
  if [ -z "$AGENT_CONTAINER" ]; then
    PROJECT=$(detect_compose_project)
    AGENT_STATE=$(check_agent_container "$PROJECT")
  else
    PROJECT="manual"
    AGENT_STATE=$(docker inspect -f '{{.State.Status}}' "${AGENT_CONTAINER}" 2>/dev/null || echo "missing")
  fi

  case "${AGENT_STATE}" in
    running)
      echo "MATCH: agent container running (project=${PROJECT})"
      ;;
    not_in_stack)
      echo "WARN: agent service is not defined in the active compose stack (project=${PROJECT}); skipping agent check"
      ;;
    no_docker)
      echo "SKIP: docker CLI недоступен — проверка agent container пропущена"
      ;;
    missing)
      echo "MISMATCH: agent container for project ${PROJECT} is missing (expected: running)"
      AGENT_OK=0
      ;;
    *)
      echo "MISMATCH: agent container for project ${PROJECT} state=${AGENT_STATE} (expected: running)"
      AGENT_OK=0
      ;;
  esac

  echo ""
  if [ "${VERSION_OK}" = "1" ] && [ "${AGENT_OK}" = "1" ]; then
    echo "MATCH: deploy verified"
    exit 0
  else
    echo "MISMATCH: deploy verification failed (version_ok=${VERSION_OK} agent_ok=${AGENT_OK})"
    exit 1
  fi
}

# require_compose_project_app
# Fail-fast guard used by deploy scripts: production project name must be 'app'.
require_compose_project_app() {
  local project="${1:-${COMPOSE_PROJECT_NAME:-}}"
  if [ "${project}" != "app" ]; then
    echo "ERROR: COMPOSE_PROJECT_NAME must be 'app', got '${project}'"
    return 1
  fi
  echo "OK: COMPOSE_PROJECT_NAME=app"
}

# get_expected_services <env>
# Returns the canonical list of services that must be rebuilt/recreated together.
get_expected_services() {
  local env="${1:-dev}"
  if [ "${env}" = "prod" ]; then
    printf 'api\ngateway\ncelery-worker\nagent\nnotifications\nfrontend\n'
  else
    printf 'api\nfrontend\nagent\nnotifications\ncelery-worker\n'
  fi
}

# check_service_sha_consistency <project> <expected_sha>
# Checks that running containers for the expected prod services report a matching SHA.
# Uses buildId container label when available; otherwise warns.
check_service_sha_consistency() {
  local project="$1"
  local expected_sha="$2"
  local expected_short
  expected_short=$(normalize_sha "${expected_sha}")
  local all_ok=1

  if ! command -v docker >/dev/null 2>&1; then
    echo "SKIP: docker CLI unavailable — service SHA consistency check skipped"
    return 0
  fi

  echo "=== service SHA consistency (project=${project}) ==="
  for svc in api celery-worker agent notifications frontend; do
    local container="${project}-${svc}-1"
    local state
    state=$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || echo "missing")
    if [ "${state}" = "missing" ]; then
      echo "MISMATCH: ${svc} container ${container} is missing"
      all_ok=0
      continue
    fi
    local build_id_label
    build_id_label=$(docker inspect -f '{{index .Config.Labels "buildId"}}' "${container}" 2>/dev/null || echo "")
    if [ -n "${build_id_label}" ]; then
      local label_short
      label_short=$(normalize_sha "${build_id_label}")
      if [ "${label_short}" = "${expected_short}" ]; then
        echo "MATCH: ${svc} buildId=${build_id_label}"
      else
        echo "MISMATCH: ${svc} buildId=${build_id_label} (expected ${expected_sha})"
        all_ok=0
      fi
    else
      echo "WARN: ${svc} has no buildId label (manual verification required)"
    fi
  done

  if [ "${all_ok}" = "1" ]; then
    return 0
  fi
  return 1
}

# Allow sourcing for unit tests; run main only when executed directly.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
