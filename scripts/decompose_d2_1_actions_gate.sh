#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== git =="
git status -sb || true

echo
echo "== unit =="
node --test frontend/src/features/process/hybrid/actions/__tests__/*.mjs

echo
echo "== build =="
(cd frontend && npm run build)

echo "DONE"
