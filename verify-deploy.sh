#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

SERVER_URL="${SERVER_URL:-http://clearvestnic.ru:5177}"
API_URL="${API_URL:-http://clearvestnic.ru:8011}"

echo "=== VERIFY DEPLOY ==="
echo "Server: ${SERVER_URL}"

LOCAL_HASH=$(git rev-parse --short HEAD)
echo "Local git HEAD:  ${LOCAL_HASH}"

SERVER_HASH=$(curl -fsS "${API_URL}/version" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit','unknown'))" || echo "unknown")
echo "Server /version: ${SERVER_HASH}"

echo ""
if [ "${LOCAL_HASH}" = "${SERVER_HASH}" ]; then
  echo "MATCH: local ${LOCAL_HASH} == server ${SERVER_HASH}"
  exit 0
else
  echo "FAIL: local ${LOCAL_HASH} != server ${SERVER_HASH}"
  echo "The server is on an old commit. Full rebuild + redeploy required."
  exit 1
fi
