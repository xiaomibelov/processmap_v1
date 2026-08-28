#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-processmap_v1}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT}"

# Guard: running with COMPOSE_PROJECT_NAME=app on the prod server without an explicit
# opt-in flag is forbidden. Use deploy-prod.yml workflow or runbook procedure instead.
ALLOW_PROD_LOCAL=false
if [ "${1:-}" = "--prod-local" ]; then
  ALLOW_PROD_LOCAL=true
  shift
fi
if [ "${COMPOSE_PROJECT_NAME}" = "app" ] && [ "${ALLOW_PROD_LOCAL}" != "true" ]; then
  echo "[DEPLOY] ERROR: COMPOSE_PROJECT_NAME=app looks like the production project."
  echo "[DEPLOY] Run deploy-prod.yml workflow instead, or pass --prod-local only if the runbook explicitly requires it."
  exit 1
fi

# 1. Collect build metadata
BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || echo 'dev')"
BUILD_BRANCH="$(git branch --show-current 2>/dev/null || echo 'unknown')"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BUILD_ENV="${BUILD_ENV:-prod}"

echo "[DEPLOY] BUILD_ID=${BUILD_ID} branch=${BUILD_BRANCH} env=${BUILD_ENV} project=${COMPOSE_PROJECT_NAME}"

# 2. Export build metadata so docker compose picks them up without mutating .env.
export BUILD_ID
export BUILD_BRANCH
export BUILD_TIME
export BUILD_ENV
export BUILD_HOST="${BUILD_HOST:-processmap.ru}"
export VITE_BUILD_ID="${BUILD_ID}"
export VITE_BUILD_TIME="${BUILD_TIME}"
export VITE_BUILD_BRANCH="${BUILD_BRANCH}"
export VITE_BUILD_ENV="${BUILD_ENV}"

# 2a. Regenerate frontend build-info.json so the deployed frontend shows the real SHA.
(cd frontend && node scripts/generate-build-info.mjs)

# 3. Detect if full clean build is needed (package.json / Dockerfile / docker-compose changed)
NEEDS_CLEAN=false
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -qE '(package\.json|package-lock\.json|Dockerfile|docker-compose)'; then
  NEEDS_CLEAN=true
  echo "[DEPLOY] Dependency/Docker changes detected → clean build (no cache)"
fi

# 4. Build images
if [ "$NEEDS_CLEAN" = true ]; then
  docker compose build --no-cache api frontend
else
  docker compose build --no-cache api frontend
fi

# 4b. Build agent/notifications/celery-worker с --no-cache: исключаем риск поднять
# stale-образ, в котором отсутствует свежий код сервиса. Фатально при
# падении (set -e): нельзя деплоить виду успешного обновления со
# старым агентом. Health-ожидание agent остаётся не фатальным — даём
# шанс стартовать с WARNING, но собрать обязаны.
docker compose build --no-cache agent notifications celery-worker

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
deprecate_old frontend
deprecate_old celery-worker

# 6. Start new containers
# NB: миграции БД + сиды — в entrypoint api-контейнера (backend/docker-entrypoint.sh),
# единая точка для любого пути деплоя. Здесь НЕ дублировать: прямой вызов
# `alembic -c backend/alembic.ini` не работает (в ini placeholder fpc:***@postgres).
# agent/notifications/celery-worker включены в up: иначе они теряются при редеплое
# (раньше поднимались ручным `docker compose up -d`).
docker compose up -d --build api frontend agent notifications celery-worker

# 7. Healthcheck: wait for /version 200
HEALTH_URL="http://localhost:${HOST_PORT:-8011}/version"
FRONTEND_HEALTH_URL="http://localhost:${FRONTEND_PORT:-5177}/"
HEALTH_RETRIES=0
MAX_RETRIES=30
until curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; do
  HEALTH_RETRIES=$((HEALTH_RETRIES + 1))
  if [ "$HEALTH_RETRIES" -gt "$MAX_RETRIES" ]; then
    echo "[DEPLOY] ERROR: Healthcheck failed after ${MAX_RETRIES} attempts. Rolling back..."
    docker compose stop api frontend celery-worker || true
    for svc in api frontend celery-worker; do
      latest_deprecated=$(docker ps -a --filter "name=${COMPOSE_PROJECT}-${svc}-1-deprecated-" --format '{{.Names}}' | sort | tail -1)
      if [ -n "${latest_deprecated}" ]; then
        docker rename "${latest_deprecated}" "${COMPOSE_PROJECT}-${svc}-1" || true
        docker start "${COMPOSE_PROJECT}-${svc}-1" || true
      fi
    done
    docker compose up -d --build api frontend agent notifications celery-worker || true
    exit 1
  fi
  sleep 2
done
echo "[DEPLOY] Healthcheck passed (${HEALTH_URL})"

# 7a. Endpoint regression scan (НЕ фатально): автозапуск после успешного healthcheck'а.
# Машинный токен — ENDPOINT_CHECK_DEPLOY_TOKEN (env или .env; в репозитории не хранить).
# 409 (scan already running) и дебаунс — штатно, деплой не валится.
if [ -z "${ENDPOINT_CHECK_DEPLOY_TOKEN:-}" ] && [ -f .env ]; then
  # Значение в .env может быть обёрнуто в двойные кавычки — снимаем их.
  ENDPOINT_CHECK_DEPLOY_TOKEN="$(grep -E '^ENDPOINT_CHECK_DEPLOY_TOKEN=' .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)"
fi
if [ -n "${ENDPOINT_CHECK_DEPLOY_TOKEN:-}" ]; then
  SCAN_HTTP="$(curl -sS -o /tmp/endpoint_check_run.json -w '%{http_code}' --max-time 10 \
    -X POST "http://localhost:${HOST_PORT:-8011}/api/admin/endpoint-check/run" \
    -H "X-Deploy-Token: ${ENDPOINT_CHECK_DEPLOY_TOKEN}" 2>/dev/null || echo 'curl_failed')"
  case "${SCAN_HTTP}" in
    202) echo "[DEPLOY] Endpoint scan triggered: $(cat /tmp/endpoint_check_run.json 2>/dev/null || true)" ;;
    200) echo "[DEPLOY] Endpoint scan skipped (run_on_deploy disabled): $(cat /tmp/endpoint_check_run.json 2>/dev/null || true)" ;;
    409) echo "[DEPLOY] Endpoint scan already running (409) — штатно, пропускаем." ;;
    *)   echo "[DEPLOY] Endpoint scan trigger returned ${SCAN_HTTP} — не фатально, деплой продолжается." ;;
  esac
else
  echo "[DEPLOY] ENDPOINT_CHECK_DEPLOY_TOKEN не задан — автозапуск сканера пропущен."
fi

# 7b. Agent health (НЕ фатально): fallback — монолит с LLM_VIA_AGENT_SVC=0 рабочий,
# поэтому нездоровый agent = warning, а не rollback.
wait_svc_health() {
  local svc="$1"
  local container="${COMPOSE_PROJECT}-${svc}-1"
  local tries=0
  local status
  while [ "$tries" -lt 15 ]; do
    status=$(docker inspect -f '{{.State.Health.Status}}' "${container}" 2>/dev/null || echo "missing")
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    if [ "$status" = "missing" ]; then
      return 1
    fi
    tries=$((tries + 1))
    sleep 2
  done
  return 1
}

if wait_svc_health agent; then
  AGENT_HEALTH_BODY=$(docker exec "${COMPOSE_PROJECT}-agent-1" \
    python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())" 2>/dev/null || echo "")
  if echo "${AGENT_HEALTH_BODY}" | grep -q '"service":"agent"'; then
    echo "[DEPLOY] Agent healthcheck passed (${AGENT_HEALTH_BODY})"
  else
    echo "[DEPLOY] WARNING: agent healthy, но /health вернул неожиданное тело: ${AGENT_HEALTH_BODY:-<empty>}"
  fi
else
  echo "[DEPLOY] WARNING: agent container НЕ healthy — продолжаю (монолит работает с LLM_VIA_AGENT_SVC=0)"
fi

# 8. Reload nginx
docker exec "${COMPOSE_PROJECT}-frontend-1" nginx -s reload 2>/dev/null || true

# 9. Tag new containers as active
docker container update --label-add status=active --label-add buildId="${BUILD_ID}" --label-add deployedAt="${BUILD_TIME}" "${COMPOSE_PROJECT}-api-1" 2>/dev/null || true
docker container update --label-add status=active --label-add buildId="${BUILD_ID}" --label-add deployedAt="${BUILD_TIME}" "${COMPOSE_PROJECT}-frontend-1" 2>/dev/null || true

# 10. Cleanup deprecated containers older than 24h
docker ps -a --filter "label=status=deprecated" --format '{{.Names}} {{.RunningFor}}' | while read -r name age; do
  if echo "$age" | grep -qE '([0-9]+ days|[0-9]+h)'; then
    echo "[DEPLOY] Removing old deprecated container: ${name} (age: ${age})"
    docker rm -f "${name}" 2>/dev/null || true
  fi
done

echo "[DEPLOY] Done. Active containers:"
docker ps --filter "label=status=active" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 11. Явный итог по здоровью всех сервисов контура деплоя
echo "[DEPLOY] Health summary:"
for svc in api frontend agent notifications celery-worker; do
  svc_health=$(docker inspect -f '{{.State.Health.Status}}' "${COMPOSE_PROJECT}-${svc}-1" 2>/dev/null || echo "not-running")
  echo "[DEPLOY]   ${svc}: ${svc_health}"
done
