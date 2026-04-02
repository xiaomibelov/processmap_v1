#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG_RUN="cp/foodproc_frontend_r11_runner_${TS}"

echo
echo "== checkpoint tag (runner) =="
git tag -a "$TAG_RUN" -m "checkpoint: runner start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_RUN"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${HERE}/StepR11_apply.sh"
if [ ! -f "$SCRIPT" ]; then
  SCRIPT="$(pwd)/StepR11_apply.sh"
fi

echo
echo "== run =="
echo "script: $SCRIPT"

chmod +x "$SCRIPT"
"$SCRIPT"
