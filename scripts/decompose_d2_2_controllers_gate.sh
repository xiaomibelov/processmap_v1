#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== git =="
git status -sb || true

echo
echo "== unit (actions) =="
if ls frontend/src/features/process/hybrid/actions/__tests__/*.mjs >/dev/null 2>&1; then
  node --test frontend/src/features/process/hybrid/actions/__tests__/*.mjs
else
  echo "skip: no action tests"
fi

echo
echo "== build =="
(cd frontend && npm run build)

echo
echo "== e2e baseline (Redis ON best-effort) =="
docker compose up -d redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo
echo "== e2e hybrid smoke (env-gated) =="
E2E_HYBRID_LAYER=1 ./scripts/e2e_enterprise.sh e2e/hybrid-basic-edit-delete-reload.spec.mjs

echo
echo "== e2e baseline (Redis OFF best-effort) =="
docker compose stop redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo "DONE"
