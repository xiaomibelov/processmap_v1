#!/usr/bin/env bash
set -euo pipefail

# Robust check that a Celery worker has registered a given task.
# Intended for use in prod-deploy-verify.yml.
#
# Usage:
#   ./scripts/prod_verify_celery_task.sh \
#     --container app-celery-worker-1 \
#     --task refresh_session_analytics_task \
#     --retries 10 \
#     --delay 3 \
#     --timeout 10

CONTAINER=""
TASK_NAME=""
MAX_RETRIES=10
RETRY_DELAY=3
INSPECT_TIMEOUT=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container)
      CONTAINER="$2"
      shift 2
      ;;
    --task)
      TASK_NAME="$2"
      shift 2
      ;;
    --retries)
      MAX_RETRIES="$2"
      shift 2
      ;;
    --delay)
      RETRY_DELAY="$2"
      shift 2
      ;;
    --timeout)
      INSPECT_TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "ERROR: unknown argument $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "${CONTAINER}" || -z "${TASK_NAME}" ]]; then
  echo "ERROR: --container and --task are required" >&2
  exit 2
fi

registered="false"

for attempt in $(seq 1 "${MAX_RETRIES}"); do
  echo "[prod-verify-celery] inspect attempt ${attempt}/${MAX_RETRIES}..."
  INSPECT_OUTPUT=$(docker exec "${CONTAINER}" \
    celery -A backend.app.celery_app inspect registered \
    --timeout "${INSPECT_TIMEOUT}" 2>&1) || true
  echo "${INSPECT_OUTPUT}"

  if echo "${INSPECT_OUTPUT}" | grep -q "${TASK_NAME}"; then
    echo "OK: ${TASK_NAME} is registered"
    registered="true"
    break
  fi

  # If celery could not reach the worker, retry (transient connectivity).
  if echo "${INSPECT_OUTPUT}" | grep -qi "No nodes replied\|timed out\|timeout"; then
    if [[ "${attempt}" -lt "${MAX_RETRIES}" ]]; then
      echo "[prod-verify-celery] worker not reachable yet, waiting ${RETRY_DELAY}s..."
      sleep "${RETRY_DELAY}"
      continue
    fi
  fi

  # If we got a real task list but the expected task is missing, fail
  # immediately — this is a genuine image/task mismatch, not a race.
  if echo "${INSPECT_OUTPUT}" | grep -qE '^\s+\* '; then
    echo "ERROR: ${TASK_NAME} not found in registered celery tasks (real mismatch)"
    exit 1
  fi

  if [[ "${attempt}" -lt "${MAX_RETRIES}" ]]; then
    echo "[prod-verify-celery] unexpected inspect output, waiting ${RETRY_DELAY}s..."
    sleep "${RETRY_DELAY}"
  fi
done

if [[ "${registered}" != "true" ]]; then
  echo "ERROR: ${TASK_NAME} not registered in celery worker after ${MAX_RETRIES} attempts"
  exit 1
fi
