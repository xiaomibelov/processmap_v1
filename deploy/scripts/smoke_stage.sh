#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.stage}"
COMPOSE_ARGS=(
  --env-file "$ENV_FILE"
  -f "$ROOT_DIR/docker-compose.yml"
  -f "$ROOT_DIR/docker-compose.stage.yml"
  -p processmap_stage
)

echo "[smoke:stage] checking running services"
docker compose "${COMPOSE_ARGS[@]}" ps api gateway postgres redis >/dev/null

echo "[smoke:stage] checking web root through internal gateway service"
docker compose "${COMPOSE_ARGS[@]}" exec -T api python3 - <<'PY'
import urllib.request

with urllib.request.urlopen("http://gateway/", timeout=10) as response:
    status = response.getcode()
    if status != 200:
        raise SystemExit(f"unexpected web status: {status}")

print("[smoke:stage] web root OK")
PY

echo "[smoke:stage] checking api health and public invite boundary"
docker compose "${COMPOSE_ARGS[@]}" exec -T api python3 - <<'PY'
import json
import os
import urllib.error
import urllib.request

API_BASE = "http://127.0.0.1:8000"

with urllib.request.urlopen(f"{API_BASE}/api/health", timeout=10) as response:
    payload = json.loads(response.read().decode("utf-8"))
    if payload.get("ok") is not True or payload.get("api") != "ready":
        raise SystemExit(f"unexpected health payload: {payload}")

request = urllib.request.Request(
    f"{API_BASE}/api/invite/resolve",
    data=b'{"token":"migration_smoke_bad"}',
    headers={"content-type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=10) as response:
        status = response.getcode()
        body = response.read().decode("utf-8")
except urllib.error.HTTPError as exc:
    status = exc.code
    body = exc.read().decode("utf-8")

if status == 401 and "missing_bearer" in body:
    raise SystemExit("invite resolve unexpectedly requires bearer")

print("[smoke:stage] api health OK")
print(f"[smoke:stage] invite resolve boundary OK (status={status})")

if os.environ.get("DEV_SEED_ADMIN") == "1" and os.environ.get("ADMIN_EMAIL") and os.environ.get("ADMIN_PASSWORD"):
    login_request = urllib.request.Request(
        f"{API_BASE}/api/auth/login",
        data=json.dumps(
            {"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]}
        ).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(login_request, timeout=10) as response:
        token = json.loads(response.read().decode("utf-8")).get("access_token")
    if not token:
        raise SystemExit("missing access token from seeded admin login")
    headers = {"Authorization": f"Bearer {token}"}
    for path in ("/api/auth/me", "/api/orgs"):
        request = urllib.request.Request(f"{API_BASE}{path}", headers=headers)
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.getcode() != 200:
                raise SystemExit(f"unexpected seeded admin status for {path}: {response.getcode()}")
    print("[smoke:stage] seeded admin auth/orgs OK")
PY

echo "[smoke:stage] completed"
