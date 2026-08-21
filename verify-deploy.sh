#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

SERVER_URL="${SERVER_URL:-https://stage.processmap.ru}"
API_URL="${API_URL:-https://stage.processmap.ru}"

echo "=== VERIFY DEPLOY ==="
echo "Server: ${SERVER_URL}"

LOCAL_HASH=$(git rev-parse --short HEAD)
echo "Local git HEAD:  ${LOCAL_HASH}"

SERVER_HASH=$(curl -fsS "${API_URL}/version" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit','unknown'))" || echo "unknown")
echo "Server /version: ${SERVER_HASH}"

echo ""
VERSION_OK=1
if [ "${LOCAL_HASH}" = "${SERVER_HASH}" ]; then
  echo "MATCH: local ${LOCAL_HASH} == server ${SERVER_HASH}"
else
  echo "FAIL: local ${LOCAL_HASH} != server ${SERVER_HASH}"
  echo "The server is on an old commit. Full rebuild + redeploy required."
  VERSION_OK=0
fi

# Agent container (AGENT-SVC): expected state — running.
# Проверка возможна только при запуске на сервере (нужен локальный docker CLI).
AGENT_OK=1
AGENT_CONTAINER="${AGENT_CONTAINER:-processmap_v1-agent-1}"
if command -v docker >/dev/null 2>&1; then
  AGENT_STATE=$(docker inspect -f '{{.State.Status}}' "${AGENT_CONTAINER}" 2>/dev/null || echo "missing")
  if [ "${AGENT_STATE}" = "running" ]; then
    echo "MATCH: agent container ${AGENT_CONTAINER} running"
  else
    echo "MISMATCH: agent container ${AGENT_CONTAINER} state=${AGENT_STATE} (expected: running)"
    AGENT_OK=0
  fi
else
  echo "SKIP: docker CLI недоступен — проверка agent container пропущена"
fi

echo ""
if [ "${VERSION_OK}" = "1" ] && [ "${AGENT_OK}" = "1" ]; then
  echo "MATCH: deploy verified"
  exit 0
else
  echo "MISMATCH: deploy verification failed (version_ok=${VERSION_OK} agent_ok=${AGENT_OK})"
  exit 1
fi
