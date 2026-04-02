#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== git =="
git status -sb || true

echo
echo "== build =="
(cd frontend && npm run build)

echo
echo "== e2e baseline =="
./scripts/e2e_enterprise.sh

echo
echo "== e2e hybrid smoke (env-gated) =="
E2E_HYBRID_LAYER=1 ./scripts/e2e_enterprise.sh e2e/hybrid-basic-edit-delete-reload.spec.mjs || true

echo "DONE"
