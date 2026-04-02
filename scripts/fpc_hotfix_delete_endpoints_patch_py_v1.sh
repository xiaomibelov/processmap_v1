#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/PycharmProjects/foodproc_process_copilot" || true

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_hotfix_delete_endpoints_patch_py_v1_${TS}"
git tag -a "$TAG" -m "checkpoint: hotfix delete endpoints patch py (${TS})" >/dev/null 2>&1 || true

echo "== checkpoint tag =="
echo "tag $TAG"
git show -s --format='%ci %h %d %s' HEAD || true

PATCHER="scripts/_patch_delete_endpoints_v1.py"

if [ ! -f "$PATCHER" ]; then
  echo "FAIL: missing $PATCHER (run scripts/fpc_backend_add_delete_projects_sessions_v1.sh once to generate it)"
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== hotfix: remove f-string for helper block =="
python3 - <<'PY'
from pathlib import Path

p = Path("scripts/_patch_delete_endpoints_v1.py")
s = p.read_text(encoding="utf-8")

old = "helper = f\"\"\""
new = "helper = \"\"\""

if old not in s:
    # if already fixed, be explicit
    if new in s:
        print("OK: already fixed (helper is not an f-string)")
    else:
        raise SystemExit("FAIL: cannot find helper = f\"\"\" marker")
else:
    s = s.replace(old, new, 1)
    p.write_text(s, encoding="utf-8")
    print("OK: patched helper block to non-f-string")
PY

echo
echo "== re-run original script =="
chmod +x scripts/fpc_backend_add_delete_projects_sessions_v1.sh
./scripts/fpc_backend_add_delete_projects_sessions_v1.sh

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
