#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== git =="
git status -sb || true

echo
echo "== unit (best effort) =="
tests=()
[ -f frontend/src/lib/apiRoutes.test.mjs ] && tests+=(frontend/src/lib/apiRoutes.test.mjs)
[ -f frontend/src/lib/apiClient.test.mjs ] && tests+=(frontend/src/lib/apiClient.test.mjs)
[ ${#tests[@]} -gt 0 ] && node --test "${tests[@]}" || echo "skip: no api unit tests"

echo
echo "== build =="
(cd frontend && npm run build)

echo
echo "== e2e baseline (Redis ON best effort) =="
docker compose up -d redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo
echo "== e2e baseline (Redis OFF best effort) =="
docker compose stop redis >/dev/null 2>&1 || true
./scripts/e2e_enterprise.sh

echo "DONE"
