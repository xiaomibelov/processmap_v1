#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/PycharmProjects/foodproc_process_copilot" || true

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_hotfix_delete_endpoints_patch_py_v2_${TS}"
git tag -a "$TAG" -m "checkpoint: hotfix delete endpoints patch py v2 (${TS})" >/dev/null 2>&1 || true

echo "== checkpoint tag =="
echo "tag $TAG"
git show -s --format='%ci %h %d %s' HEAD || true

PATCHER="scripts/_patch_delete_endpoints_v1.py"
if [ ! -f "$PATCHER" ]; then
  echo "FAIL: missing $PATCHER (it should exist after first run of the add-delete script)"
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== hotfix: remove top-level session_id reference =="
python3 - <<'PY'
from pathlib import Path
import re

p = Path("scripts/_patch_delete_endpoints_v1.py")
s = p.read_text(encoding="utf-8")

# remove exactly the bad top-level line (and possible surrounding whitespace)
pat = r'^\s*p\s*=\s*_ws_path\("sessions",\s*f"\{session_id\}\.json"\)\s*\n'
if re.search(pat, s, flags=re.M):
    s2 = re.sub(pat, "", s, count=1, flags=re.M)
    p.write_text(s2, encoding="utf-8")
    print("OK: removed bad top-level line: _ws_path(... f\"{session_id}.json\")")
else:
    # if not found, check if already removed
    if "{session_id}.json" in s:
        raise SystemExit("FAIL: still contains {session_id}.json but line pattern differs; send me the snippet around it")
    print("OK: bad line not found (already fixed?)")
PY

echo
echo "== re-run original script =="
chmod +x scripts/fpc_backend_add_delete_projects_sessions_v1.sh
./scripts/fpc_backend_add_delete_projects_sessions_v1.sh

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
