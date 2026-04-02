cd "$(git rev-parse --show-toplevel)" || return

echo "== repo =="
git status -sb
echo "branch=$(git branch --show-current)"
echo "head=$(git rev-parse --short HEAD)"

echo
echo "== docker compose ps =="
docker compose ps || true

echo
echo "== hybrid map snapshot from sqlite =="
if docker compose ps api >/dev/null 2>&1; then
  docker compose exec -T api python - <<'PY'
import sqlite3, json
DB='/app/workspace/.session_store/processmap.sqlite3'
con=sqlite3.connect(DB)
con.row_factory=sqlite3.Row
rows=con.execute("SELECT id,title,bpmn_meta_json,bpmn_xml FROM sessions WHERE bpmn_meta_json LIKE '%hybrid_layer_by_element_id%' ORDER BY updated_at DESC LIMIT 20").fetchall()
print('sessions_with_hybrid=',len(rows))
for row in rows:
    sid=str(row['id'] or '')
    title=str(row['title'] or '')
    xml=str(row['bpmn_xml'] or '')
    try:
        meta=json.loads(row['bpmn_meta_json'] or '{}')
    except Exception:
        continue
    m=meta.get('hybrid_layer_by_element_id') or {}
    if not isinstance(m,dict):
        continue
    print(f'\\n[session] {sid} | {title} | markers={len(m)}')
    matched=0
    for eid,v in m.items():
        ok=eid in xml
        if ok:
            matched+=1
        if isinstance(v,dict):
            dx=v.get('dx', v.get('x', 0))
            dy=v.get('dy', v.get('y', 0))
        else:
            dx=0; dy=0
        print(f'  - {eid}: dx={dx} dy={dy} exists_in_xml={ok}')
    print(f'  matched_ids={matched}/{len(m)}')
con.close()
PY
else
  echo "api container not running"
fi
