#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== root =="
pwd

echo "== git =="
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  git status -sb || true
  git show -s --format='%ci %h %d %s' HEAD || true
else
  echo "git metadata unavailable; continuing without repository-specific actions"
fi

if [ ! -f .env ]; then
  echo "missing .env; copy .env.example to .env before running docker compose" >&2
  exit 1
fi

echo "== port =="
grep -E '^(HOST_PORT|FRONTEND_PORT)=' .env || true

echo "== up =="
docker compose up --build
