#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_PROJECT="processmap_v1"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT}"

# 1. Collect build metadata
BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || echo 'dev')"
BUILD_BRANCH="$(git branch --show-current 2>/dev/null || echo 'unknown')"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BUILD_ENV="${BUILD_ENV:-prod}"

# 2. Inject into .env (remove old keys first, then append)
sed -i '/^BUILD_ID=/d; /^BUILD_TIME=/d; /^BUILD_BRANCH=/d; /^BUILD_ENV=/d; /^VITE_BUILD_ID=/d; /^VITE_BUILD_TIME=/d; /^VITE_BUILD_BRANCH=/d; /^VITE_BUILD_ENV=/d' .env
{
  echo ""
  echo "# Auto-injected by deploy.sh at ${BUILD_TIME}"
  echo "BUILD_ID=${BUILD_ID}"
  echo "BUILD_TIME=${BUILD_TIME}"
  echo "BUILD_BRANCH=${BUILD_BRANCH}"
  echo "BUILD_ENV=${BUILD_ENV}"
  echo "VITE_BUILD_ID=${BUILD_ID}"
  echo "VITE_BUILD_TIME=${BUILD_TIME}"
  echo "VITE_BUILD_BRANCH=${BUILD_BRANCH}"
  echo "VITE_BUILD_ENV=${BUILD_ENV}"
} >> .env

echo "[DEPLOY] BUILD_ID=${BUILD_ID} branch=${BUILD_BRANCH} env=${BUILD_ENV}"

# 2a. Regenerate frontend build-info.json so the deployed gateway shows the real SHA.
export BUILD_ID
export BUILD_BRANCH
export BUILD_TIME
export BUILD_ENV
export BUILD_HOST="${BUILD_HOST:-clearvestnic.ru}"
node frontend/scripts/generate-build-info.mjs

# 3. Detect if full clean build is needed (package.json / Dockerfile / docker-compose changed)
NEEDS_CLEAN=false
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -qE '(package\.json|package-lock\.json|Dockerfile|docker-compose)'; then
  NEEDS_CLEAN=true
  echo "[DEPLOY] Dependency/Docker changes detected → clean build (no cache)"
fi

# 4. Build images
if [ "$NEEDS_CLEAN" = true ]; then
  docker compose build --no-cache api gateway
else
  docker compose build --no-cache api gateway
fi

# 5. Deprecate old running containers (rename so compose can create new ones)
deprecate_old() {
  local svc="$1"
  local old_container="${COMPOSE_PROJECT}-${svc}-1"
  if docker ps -q --filter "name=${old_container}" --filter "status=running" | grep -q .; then
    local ts
    ts=$(date +%s)
    docker stop "${old_container}" >/dev/null 2>&1 || true
    docker rename "${old_container}" "${old_container}-deprecated-${ts}" >/dev/null 2>&1 || true
    docker label "${old_container}-deprecated-${ts}" status=deprecated stoppedAt="${ts}" replacedBy="pending" 2>/dev/null || true
    echo "[DEPLOY] Deprecated old ${svc} → ${old_container}-deprecated-${ts}"
  fi
}

deprecate_old api
deprecate_old gateway

# 6. Start new containers
docker compose up -d api gateway

# 7. Healthcheck: wait for /version 200
HEALTH_URL="http://localhost:${HOST_PORT:-8011}/version"
HEALTH_RETRIES=0
MAX_RETRIES=30
until curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; do
  HEALTH_RETRIES=$((HEALTH_RETRIES + 1))
  if [ "$HEALTH_RETRIES" -gt "$MAX_RETRIES" ]; then
    echo "[DEPLOY] ERROR: Healthcheck failed after ${MAX_RETRIES} attempts. Rolling back..."
    docker compose stop api gateway || true
    for svc in api gateway; do
      latest_deprecated=$(docker ps -a --filter "name=${COMPOSE_PROJECT}-${svc}-1-deprecated-" --format '{{.Names}}' | sort | tail -1)
      if [ -n "${latest_deprecated}" ]; then
        docker rename "${latest_deprecated}" "${COMPOSE_PROJECT}-${svc}-1" || true
        docker start "${COMPOSE_PROJECT}-${svc}-1" || true
      fi
    done
    docker compose up -d api gateway || true
    exit 1
  fi
  sleep 2
done
echo "[DEPLOY] Healthcheck passed (${HEALTH_URL})"

# 8. Reload nginx
docker exec "${COMPOSE_PROJECT}-gateway-1" nginx -s reload 2>/dev/null || true

# 9. Tag new containers as active
docker container update --label-add status=active --label-add buildId="${BUILD_ID}" --label-add deployedAt="${BUILD_TIME}" "${COMPOSE_PROJECT}-api-1" 2>/dev/null || true
docker container update --label-add status=active --label-add buildId="${BUILD_ID}" --label-add deployedAt="${BUILD_TIME}" "${COMPOSE_PROJECT}-gateway-1" 2>/dev/null || true

# 10. Cleanup deprecated containers older than 24h
docker ps -a --filter "label=status=deprecated" --format '{{.Names}} {{.RunningFor}}' | while read -r name age; do
  if echo "$age" | grep -qE '([0-9]+ days|[0-9]+h)'; then
    echo "[DEPLOY] Removing old deprecated container: ${name} (age: ${age})"
    docker rm -f "${name}" 2>/dev/null || true
  fi
done

echo "[DEPLOY] Done. Active containers:"
docker ps --filter "label=status=active" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
