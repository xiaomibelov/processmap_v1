#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== git =="
git status -sb || true

echo
echo "== unit (best-effort) =="
tests=()
[ -f frontend/src/features/process/hybrid/actions/hybridDelete.test.mjs ] && tests+=(frontend/src/features/process/hybrid/actions/hybridDelete.test.mjs)
[ -f frontend/src/features/process/hybrid/actions/hybridTransform.test.mjs ] && tests+=(frontend/src/features/process/hybrid/actions/hybridTransform.test.mjs)
[ ${#tests[@]} -gt 0 ] && node --test "${tests[@]}" || echo "skip: no hybrid action tests found"

echo
echo "== build =="
(cd frontend && npm run build)

echo
echo "== e2e (Redis ON best-effort) =="
docker compose up -d redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh
E2E_HYBRID_LAYER=1 ./scripts/e2e_enterprise.sh e2e/hybrid-basic-edit-delete-reload.spec.mjs || true

echo
echo "== e2e (Redis OFF best-effort) =="
docker compose stop redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo "DONE"
