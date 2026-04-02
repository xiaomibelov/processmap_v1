#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG_RUN="cp/foodproc_frontend_r10_api_import_fix_runner_${TS}"

echo
echo "== checkpoint tag (runner) =="
git tag -a "$TAG_RUN" -m "checkpoint: runner start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_RUN"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${HERE}/StepR10_fix_api_import_apply.sh"
if [ ! -f "$SCRIPT" ]; then
  SCRIPT="$(pwd)/StepR10_fix_api_import_apply.sh"
fi

echo
echo "== run =="
echo "script: $SCRIPT"

chmod +x "$SCRIPT"
"$SCRIPT"
