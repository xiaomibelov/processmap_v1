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

# Allow sourcing for unit tests; run main only when executed directly.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
