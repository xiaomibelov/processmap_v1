#!/usr/bin/env bash
set -euo pipefail
cd /opt/processmap-test
export COMPOSE_PROJECT_NAME=processmap_test
echo "=== GIT ==="
git branch --show-current
git rev-parse --short HEAD
git status -sb
echo
echo "=== DOCKER ==="
docker compose -p "$COMPOSE_PROJECT_NAME" ps
echo
echo "=== PORTS ==="
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E 'processmap_test|NAMES' || true
