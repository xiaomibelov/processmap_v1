#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)" || true

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_smoke_analytics_v1_${TS}"
git tag -a "$TAG" -m "checkpoint: smoke analytics v1 (${TS})" >/dev/null 2>&1 || true

HOST_PORT="$(grep -E '^HOST_PORT=' .env 2>/dev/null | head -n1 | cut -d= -f2)"
if [ -z "$HOST_PORT" ]; then HOST_PORT="8011"; fi
BASE="http://127.0.0.1:${HOST_PORT}"

OUT="$HOME/fpc_smoke_analytics_${TS}"
mkdir -p "$OUT"

echo "== wait api/meta (up to 30s) =="
OK=0
for i in $(seq 1 30); do
  if curl -sS "$BASE/api/meta" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 1
done
echo "meta_ready=$OK base=$BASE"
if [ "$OK" -ne 1 ]; then
  echo "FAIL: api/meta not reachable"
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== create project =="
curl -sS -H "Content-Type: application/json" \
  -d '{"title":"Analytics smoke"}' \
  "$BASE/api/projects" > "$OUT/project.json"

PROJECT_ID="$(python3 -c 'import json; print(json.load(open("'"$OUT/project.json"'")).get("id",""))' 2>/dev/null || true)"
echo "PROJECT_ID=$PROJECT_ID"
if [ -z "$PROJECT_ID" ]; then
  echo "FAIL: no PROJECT_ID"
  sed -n '1,120p' "$OUT/project.json" || true
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== create session =="
curl -sS -H "Content-Type: application/json" \
  -d '{"title":"Analytics session","roles":["cook_1","technolog"],"start_role":"cook_1","mode":"quick_skeleton"}' \
  "$BASE/api/projects/$PROJECT_ID/sessions?mode=quick_skeleton" > "$OUT/session.json"

SESSION_ID="$(python3 -c 'import json; print(json.load(open("'"$OUT/session.json"'")).get("id",""))' 2>/dev/null || true)"
echo "SESSION_ID=$SESSION_ID"
if [ -z "$SESSION_ID" ]; then
  echo "FAIL: no SESSION_ID"
  sed -n '1,160p' "$OUT/session.json" || true
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== PATCH nodes/edges (with durations) =="
cat > "$OUT/patch.json" <<'JSON'
{
  "nodes": [
    {"id":"n1","type":"task","title":"Подготовить ингредиенты","duration_min":5,"actor_role":"cook_1"},
    {"id":"n2","type":"task","title":"Смешать","duration_min":7,"actor_role":"cook_1"},
    {"id":"n3","type":"task","title":"Проверить качество","duration_min":3,"actor_role":"technolog"}
  ],
  "edges": [
    {"id":"e1","source":"n1","target":"n2"},
    {"id":"e2","source":"n2","target":"n3"}
  ]
}
JSON

HTTP_PATCH="$(curl -sS -o "$OUT/patch_resp.json" -w "%{http_code}" \
  -X PATCH "$BASE/api/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  --data-binary @"$OUT/patch.json")"
echo "PATCH http_code=$HTTP_PATCH"
sed -n '1,120p' "$OUT/patch_resp.json" || true
if [ "$HTTP_PATCH" != "200" ]; then
  echo "FAIL: patch not 200"
  echo "rollback: git checkout \"$TAG\""
  false
fi

echo
echo "== GET analytics =="
HTTP_A="$(curl -sS -o "$OUT/analytics.json" -w "%{http_code}" \
  "$BASE/api/sessions/$SESSION_ID/analytics")"
echo "GET analytics http_code=$HTTP_A"
sed -n '1,220p' "$OUT/analytics.json" || true

echo
echo "== artifacts =="
ls -lah "$OUT" | sed -n '1,120p' || true

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
