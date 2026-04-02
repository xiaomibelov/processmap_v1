#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)" || true

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_smoke_task_alias_and_analytics_v1_${TS}"
git tag -a "$TAG" -m "checkpoint: smoke task alias + analytics v1 (${TS})" >/dev/null 2>&1 || true

OUT="$HOME/fpc_smoke_task_alias_and_analytics_${TS}"
mkdir -p "$OUT"

HOST_PORT="$(grep -E '^HOST_PORT=' .env 2>/dev/null | head -n1 | cut -d= -f2)"
if [ -z "$HOST_PORT" ]; then HOST_PORT="8000"; fi
BASE="http://127.0.0.1:${HOST_PORT}"

echo "== wait api/meta (up to 30s) =="
READY=0
for i in $(seq 1 30); do
  if curl -sS "$BASE/api/meta" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
echo "meta_ready=$READY base=$BASE"
if [ "$READY" -ne 1 ]; then
  echo "FAIL: api/meta not ready"
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== create project =="
curl -sS -o "$OUT/project.json" -X POST "$BASE/api/projects" \
  -H "content-type: application/json" \
  -d '{"title":"Smoke task alias + analytics"}' || true
PROJECT_ID="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("id",""))' "$OUT/project.json" 2>/dev/null || true)"
echo "PROJECT_ID=$PROJECT_ID"
if [ -z "$PROJECT_ID" ]; then
  echo "FAIL: cannot parse PROJECT_ID"
  sed -n '1,200p' "$OUT/project.json" || true
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== create session =="
curl -sS -o "$OUT/session.json" -X POST "$BASE/api/projects/$PROJECT_ID/sessions?mode=quick_skeleton" \
  -H "content-type: application/json" \
  -d '{"title":"Smoke session"}' || true
SESSION_ID="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("id",""))' "$OUT/session.json" 2>/dev/null || true)"
echo "SESSION_ID=$SESSION_ID"
if [ -z "$SESSION_ID" ]; then
  echo "FAIL: cannot parse SESSION_ID"
  sed -n '1,200p' "$OUT/session.json" || true
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== PATCH with type=task (must be accepted and normalized to step) =="
cat > "$OUT/patch.json" <<'JSON'
{
  "nodes": [
    {"id":"n1","type":"task","title":"Подготовить ингредиенты","actor_role":"cook_1","duration_min":5},
    {"id":"n2","type":"task","title":"Смешать","actor_role":"cook_1","duration_min":7},
    {"id":"n3","type":"task","title":"Проверить качество","actor_role":"technolog","duration_min":3}
  ],
  "edges": []
}
JSON

HTTP_P="$(curl -sS -o "$OUT/patch_resp.json" -w "%{http_code}" \
  -X PATCH "$BASE/api/sessions/$SESSION_ID" \
  -H "content-type: application/json" \
  --data-binary @"$OUT/patch.json" || true)"
echo "PATCH http_code=$HTTP_P"
if [ "$HTTP_P" != "200" ]; then
  echo "FAIL: PATCH not 200"
  sed -n '1,220p' "$OUT/patch_resp.json" || true
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== assert server normalized node types to step =="
python3 -c '
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8"))
nodes=d.get("nodes") or []
bad=[]
for n in nodes:
  t=n.get("type")
  if t != "step":
    bad.append((n.get("id"),t))
print("nodes_count=", len(nodes))
print("bad_types=", bad)
' "$OUT/patch_resp.json" 2>/dev/null || true

echo
echo "== GET analytics =="
HTTP_A="$(curl -sS -o "$OUT/analytics.json" -w "%{http_code}" \
  "$BASE/api/sessions/$SESSION_ID/analytics" || true)"
echo "GET analytics http_code=$HTTP_A"
sed -n '1,220p' "$OUT/analytics.json" || true

echo
echo "== analytics summary (if present) =="
python3 -c '
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8"))
a=d.get("analytics") or d
summary=a.get("summary") or []
for line in summary:
  print("-", line)
' "$OUT/analytics.json" 2>/dev/null || true

echo
echo "== artifacts =="
ls -lah "$OUT" | sed -n '1,120p' || true

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
