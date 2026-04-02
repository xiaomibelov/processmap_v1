#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG_RUN="cp/foodproc_frontend_r18_runner_${TS}"

echo
echo "== checkpoint tag (runner) =="
git tag -a "$TAG_RUN" -m "checkpoint: runner start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_RUN"

chmod +x StepR18_apply.sh
./StepR18_apply.sh
