#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)" || true

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_diag_docker_code_mount_v1_${TS}"
git tag -a "$TAG" -m "checkpoint: diag docker code mount v1 (${TS})" >/dev/null 2>&1 || true

echo "== docker compose ps =="
docker compose ps || true

CID="$(docker compose ps -q app 2>/dev/null | head -n1 || true)"
echo
echo "== app container id =="
echo "$CID"

echo
echo "== container mounts (backend/app) =="
if [ -n "$CID" ]; then
  docker inspect "$CID" --format '{{json .Mounts}}' | python3 -c 'import json,sys; ms=json.load(sys.stdin); 
print("\n".join([f"{m.get(\"Type\")} {m.get(\"Source\")} -> {m.get(\"Destination\")}" for m in ms if "/app" in (m.get("Destination") or "") or "backend" in (m.get("Destination") or "")]))' || true
fi

echo
echo "== inside container: show main.py _norm_nodes lines =="
if [ -n "$CID" ]; then
  docker exec -i "$CID" sh -lc 'python -c "import inspect,backend.app.main as m; import re; s=inspect.getsource(m); 
print(\"has_task_alias=\", (\"task\" in s and \"step\" in s)); 
m2=re.search(r\"def _norm_nodes\\(.*?\\n\\s*return out\\n\", s, re.S); 
print(\"_norm_nodes_snippet:\\n\"+(m2.group(0) if m2 else \"<not found>\"))"' 2>&1 | sed -n '1,220p' || true
fi

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
