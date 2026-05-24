#!/usr/bin/env bash
set -euo pipefail
cd /opt/processmap-test
export COMPOSE_PROJECT_NAME=processmap_test

echo "=== SOURCE ==="
git branch --show-current
git status -sb
git rev-parse --short HEAD

echo "=== UPDATE ==="
git fetch origin
BRANCH="$(git branch --show-current)"
git pull --ff-only origin "$BRANCH"

echo "=== BUILD/UP ==="
docker compose -p "$COMPOSE_PROJECT_NAME" up -d --build

echo "=== STATUS ==="
docker compose -p "$COMPOSE_PROJECT_NAME" ps
docker compose -p "$COMPOSE_PROJECT_NAME" logs --tail=100
