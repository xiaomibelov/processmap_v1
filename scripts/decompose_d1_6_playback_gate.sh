#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== git =="
git status -sb || true
echo "HEAD: $(git rev-parse --short HEAD)  BRANCH: $(git rev-parse --abbrev-ref HEAD)"

echo
echo "== build =="
(cd frontend && npm run build)

echo
echo "== e2e (Redis ON best-effort) =="
docker compose up -d redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh
E2E_HYBRID_LAYER=1 ./scripts/e2e_enterprise.sh e2e/hybrid-layer-delete-reload.spec.mjs

echo
echo "== e2e (Redis OFF best-effort) =="
docker compose stop redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo "DONE"
