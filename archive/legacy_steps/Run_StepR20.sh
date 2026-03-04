#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG_RUN="cp/foodproc_frontend_r20_runner_${TS}"
git tag -a "$TAG_RUN" -m "checkpoint: foodproc frontend r20 runner (${TS})" >/dev/null 2>&1 || true
echo
echo "== checkpoint tag (runner) =="
echo "$TAG_RUN"

BR="fix/frontend-r20-bpmn-contrast-v1"
if git show-ref --verify --quiet "refs/heads/${BR}"; then
  git checkout "$BR"
else
  git checkout -b "$BR"
fi

bash ./StepR20_apply.sh
