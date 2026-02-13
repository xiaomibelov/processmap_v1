#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)" || true

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_diag_docker_code_mount_v5_${TS}"
git tag -a "$TAG" -m "checkpoint: diag docker code mount v5 (${TS})" >/dev/null 2>&1 || true

echo "== docker compose ps =="
docker compose ps || true

CID="$(docker compose ps -q app 2>/dev/null | head -n1 || true)"
echo
echo "== app container id =="
echo "$CID"

OUT="$HOME/fpc_diag_mounts_${TS}"
mkdir -p "$OUT"

INSPECT_JSON="$OUT/inspect.json"
INSPECT_ERR="$OUT/inspect.err"

echo
echo "== docker inspect to file =="
if [ -n "$CID" ]; then
  docker inspect "$CID" >"$INSPECT_JSON" 2>"$INSPECT_ERR"
  RC=$?
else
  RC=99
fi
echo "docker_inspect_rc=$RC"
echo "inspect_json_bytes=$(wc -c <"$INSPECT_JSON" 2>/dev/null | tr -d ' ' || echo 0)"
echo "inspect_err_bytes=$(wc -c <"$INSPECT_ERR" 2>/dev/null | tr -d ' ' || echo 0)"

echo
echo "== docker inspect stderr (first 120 lines) =="
sed -n '1,120p' "$INSPECT_ERR" 2>/dev/null || true

echo
echo "== docker inspect stdout head (first 20 lines) =="
sed -n '1,20p' "$INSPECT_JSON" 2>/dev/null || true

echo
echo "== container mounts (filtered) =="
if [ -s "$INSPECT_JSON" ]; then
  python3 -c '
import json,sys
p=sys.argv[1]
arr=json.load(open(p,"r",encoding="utf-8"))
doc=arr[0] if arr else {}
ms=doc.get("Mounts") or []
if not ms:
    print("NO_MOUNTS")
for m in ms:
    t=m.get("Type")
    src=m.get("Source")
    dst=m.get("Destination")
    if not dst:
        continue
    if ("/app" in dst) or ("backend" in dst) or ("frontend" in dst) or ("/workspace" in dst):
        print(f"{t} {src} -> {dst}")
' "$INSPECT_JSON" 2>&1 | sed -n '1,220p' || true
else
  echo "SKIP: inspect json is empty"
fi

echo
echo "== inside container: show _norm_nodes snippet =="
if [ -n "$CID" ]; then
  docker exec -i "$CID" sh -lc 'python -c "import inspect,backend.app.main as m; import re; s=inspect.getsource(m);
print(\"has_task_alias=\", (\"\\\"task\\\": \\\"step\\\"\" in s));
m2=re.search(r\"def _norm_nodes\\(.*?\\n\\s*return out\\n\", s, re.S);
print(\"_norm_nodes_snippet:\\n\"+(m2.group(0) if m2 else \"<not found>\"))"' 2>&1 | sed -n '1,220p' || true
fi

echo
echo "== artifacts =="
ls -lah "$OUT" | sed -n '1,120p' || true

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
