#!/usr/bin/env bash
set -euo pipefail
cd /opt/processmap-test
export COMPOSE_PROJECT_NAME=processmap_test
docker compose -p "$COMPOSE_PROJECT_NAME" logs -f --tail=150 "$@"
