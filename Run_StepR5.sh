#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG_RUN="cp/foodproc_frontend_r5_runner_${TS}"

echo
echo "== checkpoint tag (runner) =="
git tag -a "$TAG_RUN" -m "checkpoint: runner start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_RUN"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${HERE}/StepR5_apply.sh"
if [ ! -f "$SCRIPT" ]; then
  SCRIPT="$(pwd)/StepR5_apply.sh"
fi

echo
echo "== run =="
echo "script: $SCRIPT"

if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: StepR5_apply.sh not found next to runner or in repo root."
  echo "Put StepR5_apply.sh next to this runner (or into repo root) and re-run."
  false
fi

chmod +x "$SCRIPT"
"$SCRIPT"
