#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_pack_backend_B8_${TS}"
git tag -a "$TAG" -m "checkpoint: pack backend B8 (${TS})" >/dev/null 2>&1 || true
echo "checkpoint tag: $TAG"

mkdir -p artifacts
ZIP="artifacts/fpc_backend_B8_pack_${TS}.zip"

zip -r "$ZIP" \
  backend/app \
  backend/requirements.txt \
  Dockerfile docker-compose.yml \
  docs/contract_session_api.md \
  -x "backend/app/**/__pycache__/*" \
  -x "backend/app/**/*.pyc" \
  -x "**/.DS_Store" \
  >/dev/null

ls -la "$ZIP"
echo "OK: $ZIP"
