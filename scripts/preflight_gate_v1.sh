#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ts="$(date +%Y%m%d_%H%M%S)"

echo "== git snapshot =="
git status -sb || true
echo "BRANCH: $(git rev-parse --abbrev-ref HEAD)"
echo "HEAD:   $(git rev-parse --short HEAD)"

git tag "cp/preflight_gate_start_${ts}" 2>/dev/null || true

echo
echo "== unit tests (best effort) =="
tests=()
[ -d frontend/src/features/process/hybrid/actions/__tests__ ] && tests+=(frontend/src/features/process/hybrid/actions/__tests__/*.mjs)
[ -f frontend/src/features/process/stage/utils/hybridCoords.test.mjs ] && tests+=(frontend/src/features/process/stage/utils/hybridCoords.test.mjs)
if [ ${#tests[@]} -gt 0 ]; then
  node --test "${tests[@]}"
else
  echo "skip: no unit tests found in expected locations"
fi

echo
echo "== frontend build =="
(cd frontend && npm run build)

echo
echo "== e2e baseline (Redis ON best effort) =="
docker compose up -d redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo
echo "== e2e hybrid env-gated (best effort) =="
if [ -f frontend/e2e/hybrid-layer-delete-reload.spec.mjs ] || [ -f e2e/hybrid-layer-delete-reload.spec.mjs ]; then
  E2E_HYBRID_LAYER=1 ./scripts/e2e_enterprise.sh e2e/hybrid-layer-delete-reload.spec.mjs
else
  echo "skip: hybrid-layer-delete-reload.spec.mjs not found"
fi

if [ -f frontend/e2e/hybrid-basic-edit-delete-reload.spec.mjs ] || [ -f e2e/hybrid-basic-edit-delete-reload.spec.mjs ]; then
  E2E_HYBRID_LAYER=1 ./scripts/e2e_enterprise.sh e2e/hybrid-basic-edit-delete-reload.spec.mjs
else
  echo "skip: hybrid-basic-edit-delete-reload.spec.mjs not found"
fi

echo
echo "== e2e baseline (Redis OFF best effort) =="
docker compose stop redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo
echo "== DONE (PASS) =="
git tag "cp/preflight_gate_done_${ts}" 2>/dev/null || true
