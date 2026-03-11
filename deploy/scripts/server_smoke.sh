#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${APP_ENV_FILE:-.env}"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

API_URL="${API_URL:-http://127.0.0.1:${HOST_PORT:-8011}}"
WEB_URL="${WEB_URL:-http://127.0.0.1:${FRONTEND_PORT:-5177}}"

echo "[smoke] checking web root: $WEB_URL"
curl -fsS "$WEB_URL/" >/dev/null

echo "[smoke] checking api health: $API_URL/api/health"
health_json="$(curl -fsS "$API_URL/api/health")"
python3 -c 'import json,sys; data=json.loads(sys.argv[1]); assert data.get("ok") is True, data; assert data.get("api") == "ready", data; print("[smoke] api health OK")' "$health_json"

echo "[smoke] checking public invite resolve boundary"
status="$(curl -sS -o /tmp/fpc_invite_resolve.out -w '%{http_code}' \
  -X POST "$API_URL/api/invite/resolve" \
  -H 'content-type: application/json' \
  -d '{"token":"migration_smoke_bad"}')"
body="$(cat /tmp/fpc_invite_resolve.out)"
if [ "$status" = "401" ] && printf '%s' "$body" | grep -q 'missing_bearer'; then
  echo "[smoke] invite resolve unexpectedly requires bearer" >&2
  exit 1
fi
echo "[smoke] invite resolve boundary OK (status=$status)"

if [ "${DEV_SEED_ADMIN:-0}" = "1" ] && [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "[smoke] checking seeded admin auth"
  token="$(
    curl -fsS -X POST "$API_URL/api/auth/login" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" | \
      python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))'
  )"
  test -n "$token"
  curl -fsS "$API_URL/api/auth/me" -H "Authorization: Bearer $token" >/dev/null
  curl -fsS "$API_URL/api/orgs" -H "Authorization: Bearer $token" >/dev/null
  echo "[smoke] seeded admin auth/orgs OK"
fi

echo "[smoke] completed"
