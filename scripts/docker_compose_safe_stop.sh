#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${ROOT_DIR}"

USER_PROJECT_NAME="${1:-}"

wait_for_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open -a "Docker" >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 90); do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

detect_project_name() {
  if [ -n "${USER_PROJECT_NAME}" ]; then
    printf "%s\n" "${USER_PROJECT_NAME}"
    return 0
  fi
  if [ -n "${COMPOSE_PROJECT_NAME:-}" ]; then
    printf "%s\n" "${COMPOSE_PROJECT_NAME}"
    return 0
  fi
  local compose_file="${ROOT_DIR}/docker-compose.yml"
  local name=""
  if command -v python3 >/dev/null 2>&1; then
    name="$(
      docker compose ls --format json 2>/dev/null | python3 - "${compose_file}" <<'PY'
import json, sys
compose_file = sys.argv[1]
raw = sys.stdin.read().strip()
if not raw:
    print("")
    raise SystemExit(0)
try:
    rows = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)
for row in rows:
    cfg = str(row.get("ConfigFiles") or "")
    if compose_file in cfg:
        print(str(row.get("Name") or "").strip())
        raise SystemExit(0)
print("")
PY
    )"
  fi
  if [ -n "${name}" ]; then
    printf "%s\n" "${name}"
    return 0
  fi
  basename "${ROOT_DIR}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-'
}

if ! wait_for_docker; then
  echo "Docker daemon is unavailable." >&2
  exit 1
fi

PROJECT_NAME="$(detect_project_name)"
echo "Project: ${PROJECT_NAME}"

echo "Step 1/3: docker compose down --remove-orphans"
docker compose down --remove-orphans || true

echo "Step 2/3: fallback cleanup by compose label"
docker ps -aq --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  | xargs -r docker rm -f >/dev/null 2>&1 || true
docker network ls -q --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  | xargs -r docker network rm >/dev/null 2>&1 || true

echo "Step 3/3: verify leftovers"
LEFT_CONTAINERS="$(docker ps -aq --filter "label=com.docker.compose.project=${PROJECT_NAME}")"
LEFT_NETWORKS="$(docker network ls -q --filter "label=com.docker.compose.project=${PROJECT_NAME}")"

if [ -n "${LEFT_CONTAINERS}" ] || [ -n "${LEFT_NETWORKS}" ]; then
  echo "Leftovers still exist for project=${PROJECT_NAME}" >&2
  [ -n "${LEFT_CONTAINERS}" ] && echo "containers: ${LEFT_CONTAINERS}" >&2
  [ -n "${LEFT_NETWORKS}" ] && echo "networks: ${LEFT_NETWORKS}" >&2
  exit 2
fi

echo "OK: compose project ${PROJECT_NAME} is stopped."
