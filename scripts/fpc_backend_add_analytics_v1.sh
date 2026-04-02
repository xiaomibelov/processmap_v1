#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)" || true

set -u

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_backend_add_analytics_v1_${TS}"
git tag -a "$TAG" -m "checkpoint: before backend analytics v1 (${TS})" >/dev/null 2>&1 || true

echo "== checkpoint tag =="
git show -s --format='%ci %h %d %s' "$TAG" || true

echo
echo "== write backend/app/analytics.py =="
mkdir -p backend/app

cat > backend/app/analytics.py <<'PY'
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .models import Session, Node


def _node_role(n: Node) -> str:
    r = (n.actor_role or "").strip()
    return r if r else "unassigned"


def _node_duration_min(n: Node) -> Optional[int]:
    if getattr(n, "duration_min", None) is not None:
        try:
            return int(getattr(n, "duration_min"))
        except Exception:
            return None
    try:
        params = getattr(n, "parameters", None) or {}
        sched = (params.get("_sched") or {})
        dm = sched.get("duration_min")
        if dm is None:
            return None
        return int(dm)
    except Exception:
        return None


def _section_for_node(n: Node) -> str:
    t = (getattr(n, "title", "") or "").lower()
    ntype = getattr(n, "type", "step")

    if ntype == "timer":
        return "wait"

    qc = getattr(n, "qc", None) or []
    if qc:
        return "qc"
    if "контрол" in t or "провер" in t or "дегуст" in t or "взвес" in t:
        return "qc"

    if "мойк" in t or "сан" in t or "уборк" in t or "дезинф" in t or "утилиз" in t:
        return "clean"

    if "упак" in t or "маркир" in t or "этикет" in t:
        return "pack"

    if "жар" in t or "вар" in t or "выпек" in t or "печ" in t or "туш" in t or "кип" in t or "охлаж" in t:
        return "cook"

    if "подготов" in t or "нарез" in t or "замес" in t or "смеш" in t or "разогрев" in t or "размер" in t:
        return "prep"

    if "перед" in t or "перемест" in t or "отнести" in t or "перелож" in t:
        return "move"

    return "other"


def _build_graph_edges(session: Session) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for e in (getattr(session, "edges", None) or []):
        a = getattr(e, "from_id", None)
        b = getattr(e, "to_id", None)
        if a and b:
            out.append((str(a), str(b)))
    return out


def _critical_path_min(session: Session, durations: Dict[str, int]) -> Optional[int]:
    edges = _build_graph_edges(session)
    nodes = {n.id for n in (getattr(session, "nodes", None) or []) if getattr(n, "id", None)}

    adj: Dict[str, List[str]] = {nid: [] for nid in nodes}
    indeg: Dict[str, int] = {nid: 0 for nid in nodes}

    for a, b in edges:
        if a not in nodes or b not in nodes:
            continue
        adj[a].append(b)
        indeg[b] += 1

    q = [nid for nid in nodes if indeg[nid] == 0]
    topo: List[str] = []
    while q:
        v = q.pop()
        topo.append(v)
        for u in adj.get(v, []):
            indeg[u] -= 1
            if indeg[u] == 0:
                q.append(u)

    if len(topo) != len(nodes):
        return None

    dp: Dict[str, int] = {nid: durations.get(nid, 0) for nid in topo}
    for v in topo:
        for u in adj.get(v, []):
            cand = dp[v] + durations.get(u, 0)
            if cand > dp.get(u, 0):
                dp[u] = cand

    return max(dp.values()) if dp else 0


def compute_analytics(session: Session) -> Dict[str, Any]:
    nodes = getattr(session, "nodes", None) or []
    edges = getattr(session, "edges", None) or []
    questions = getattr(session, "questions", None) or []

    durations_int: Dict[str, int] = {}
    unknown_duration_nodes: List[str] = []

    by_role_duration: Dict[str, int] = {}
    by_role_actions: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    by_section: Dict[str, int] = {}

    for n in nodes:
        nid = n.id
        ntype = getattr(n, "type", "step")
        by_type[ntype] = by_type.get(ntype, 0) + 1

        role = _node_role(n)
        by_role_actions[role] = by_role_actions.get(role, 0) + 1

        sec = _section_for_node(n)
        by_section[sec] = by_section.get(sec, 0) + 1

        dm = _node_duration_min(n)
        if dm is None:
            unknown_duration_nodes.append(nid)
            continue

        if dm < 0:
            dm = 0
        durations_int[nid] = dm
        by_role_duration[role] = by_role_duration.get(role, 0) + dm

    total_duration_min = sum(durations_int.values())

    node_role_map = {n.id: _node_role(n) for n in nodes}
    handoff_edges: List[Dict[str, Any]] = []
    handoff_count = 0
    for e in edges:
        a = getattr(e, "from_id", None)
        b = getattr(e, "to_id", None)
        if not a or not b:
            continue
        ra = node_role_map.get(str(a), "unassigned")
        rb = node_role_map.get(str(b), "unassigned")
        if ra != rb:
            handoff_count += 1
            handoff_edges.append({"from": str(a), "to": str(b), "from_role": ra, "to_role": rb})

    open_q = [q for q in questions if getattr(q, "status", "") == "open"]
    critical_q = [q for q in open_q if getattr(q, "issue_type", "") == "CRITICAL"]

    critical_path = _critical_path_min(session, durations_int)

    summary: List[str] = []
    if critical_path is None:
        summary.append(f"Оценка длительности: {total_duration_min} мин (критический путь: N/A — цикл/не-DAG).")
    else:
        summary.append(f"Оценка длительности: {total_duration_min} мин (критический путь {critical_path} мин).")

    if nodes:
        parts = ", ".join([f"{k}={v}" for k, v in sorted(by_section.items(), key=lambda kv: (-kv[1], kv[0]))])
        summary.append(f"Действий: {len(nodes)} ({parts}).")
    else:
        summary.append("Действий: 0.")

    summary.append(f"Передач между ролями: {handoff_count}. Узлов без длительности: {len(unknown_duration_nodes)}.")
    summary.append(f"Открытых вопросов: {len(open_q)} (критических: {len(critical_q)}).")

    return {
        "session_id": session.id,
        "version": 1,
        "timing": {
            "total_duration_min": total_duration_min,
            "critical_path_min": critical_path,
            "by_role": by_role_duration,
            "unknown_duration_nodes": unknown_duration_nodes,
        },
        "actions": {
            "total": len(nodes),
            "by_type": by_type,
            "by_role": by_role_actions,
            "by_section": by_section,
        },
        "handoffs": {"count": handoff_count, "edges": handoff_edges},
        "coverage": {"open_questions": len(open_q), "critical_questions": len(critical_q)},
        "summary": summary,
    }
PY

echo
echo "== patch backend/app/models.py (add Session.analytics) =="
cat > "$HOME/_fpc_patch_models_add_analytics_v1.py" <<'PY'
import re
from pathlib import Path

p = Path("backend/app/models.py")
s = p.read_text(encoding="utf-8")

pat = r"(class Session\(BaseModel\):\n(?:[^\n]*\n)+?\s*resources:\s*Dict\[str,\s*Any\]\s*=\s*Field\(default_factory=dict\)\n)"
m = re.search(pat, s)
if not m:
    raise SystemExit("FAIL: cannot locate Session.resources block in models.py")

insert = "    analytics: Dict[str, Any] = Field(default_factory=dict)\n"
if insert in s:
    print("OK: Session.analytics already present")
else:
    pos = m.end(1)
    s = s[:pos] + insert + s[pos:]
    p.write_text(s, encoding="utf-8")
    print("OK: added Session.analytics")
PY
python3 "$HOME/_fpc_patch_models_add_analytics_v1.py"

echo
echo "== patch backend/app/main.py (compute analytics + endpoint) =="
cat > "$HOME/_fpc_patch_main_add_analytics_v1.py" <<'PY'
import re
from pathlib import Path

p = Path("backend/app/main.py")
s = p.read_text(encoding="utf-8")

if "from .analytics import compute_analytics" not in s:
    m = re.search(r"(from \.models import [^\n]+\n)", s)
    if m:
        pos = m.end(1)
        s = s[:pos] + "from .analytics import compute_analytics\n" + s[pos:]
    else:
        m2 = re.search(r"(\nimport [^\n]+\n)", s)
        if not m2:
            raise SystemExit("FAIL: cannot find insertion point for analytics import in main.py")
        pos = m2.end(1)
        s = s[:pos] + "from .analytics import compute_analytics\n" + s[pos:]

if "s.analytics = compute_analytics(s)" not in s:
    m = re.search(r"(def _recompute_session\(s: Session\) -> Session:\n(?:.|\n)*?\n\s*s\.mermaid\s*=\s*s\.mermaid_lanes\n)", s)
    if not m:
        raise SystemExit("FAIL: cannot locate _recompute_session mermaid assignment block")
    pos = m.end(1)
    s = s[:pos] + "\n\n    s.analytics = compute_analytics(s)\n" + s[pos:]

if "/api/sessions/{session_id}/analytics" not in s:
    anchor = re.search(r'@app\.get\("/api/sessions/\{session_id\}"\)\n(?:.|\n)*?\n\n', s)
    if anchor:
        pos = anchor.end(0)
    else:
        anchor = re.search(r'@app\.patch\("/api/sessions/\{session_id\}"\)\n(?:.|\n)*?\nreturn _session_api_dump\(sess\)\n\n', s)
        if not anchor:
            raise SystemExit("FAIL: cannot find insertion anchor for analytics endpoint")
        pos = anchor.end(0)

    endpoint = """
@app.get("/api/sessions/{session_id}/analytics")
def get_session_analytics(session_id: str) -> dict:
    st = get_storage()
    sess = st.load(session_id)
    if not sess:
        return {"error": "not found"}
    if not getattr(sess, "analytics", None):
        sess = _recompute_session(sess)
        st.save(sess)
    return {"session_id": sess.id, "analytics": getattr(sess, "analytics", {})}
"""
    s = s[:pos] + endpoint + s[pos:]

p.write_text(s, encoding="utf-8")
print("OK: patched main.py (analytics import, recompute, endpoint)")
PY
python3 "$HOME/_fpc_patch_main_add_analytics_v1.py"

echo
echo "== patch docs/contract_session_api.md (add analytics endpoint) =="
cat > "$HOME/_fpc_patch_docs_add_analytics_v1.py" <<'PY'
from pathlib import Path

p = Path("docs/contract_session_api.md")
s = p.read_text(encoding="utf-8")

needle = "GET /api/sessions/{id}/analytics"
if needle in s:
    print("OK: docs already mention analytics")
    raise SystemExit(0)

add = """

## Analytics (backend computed)

### GET /api/sessions/{id}/analytics

Returns backend-computed analytics summary for a session.

Response:

```json
{
  "session_id": "abc123",
  "analytics": {
    "version": 1,
    "timing": {
      "total_duration_min": 45,
      "critical_path_min": 38,
      "by_role": {"cook_1": 30, "technolog": 15},
      "unknown_duration_nodes": ["n3"]
    },
    "actions": {
      "total": 12,
      "by_type": {"step": 10, "decision": 1, "timer": 1},
      "by_role": {"cook_1": 7, "technolog": 3, "unassigned": 2},
      "by_section": {"prep": 4, "cook": 3, "qc": 2, "pack": 1, "clean": 1, "other": 1}
    },
    "handoffs": {"count": 2, "edges": []},
    "coverage": {"open_questions": 5, "critical_questions": 2},
    "summary": [
      "Оценка длительности: 45 мин (критический путь 38 мин).",
      "Действий: 12 (prep=4, cook=3, qc=2).",
      "Передач между ролями: 2. Узлов без длительности: 1.",
      "Открытых вопросов: 5 (критических: 2)."
    ]
  }
}
```

Notes:
- Analytics is computed on PATCH/PUT (session recompute) and persisted into `session.analytics`.
- For older sessions without analytics, GET will trigger recompute once and save.
"""
p.write_text(s.rstrip() + "\n" + add + "\n", encoding="utf-8")
print("OK: docs updated with analytics endpoint")
PY
python3 "$HOME/_fpc_patch_docs_add_analytics_v1.py"

echo
echo "== python syntax check =="
python3 -m py_compile backend/app/main.py backend/app/models.py backend/app/analytics.py

echo
echo "== restart app =="
docker compose restart app

echo
echo "== smoke: create + patch + get analytics =="
HOST_PORT="$(grep -E '^HOST_PORT=' .env 2>/dev/null | head -n1 | cut -d= -f2)"
if [ -z "$HOST_PORT" ]; then HOST_PORT="8000"; fi
BASE="http://127.0.0.1:${HOST_PORT}"

OUT="$HOME/fpc_smoke_analytics_${TS}"
mkdir -p "$OUT"

curl -sS -X POST "$BASE/api/projects" -H "Content-Type: application/json"   --data-binary '{"title":"Analytics smoke","passport":{"language":"ru"}}' > "$OUT/project.json"
PID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id",""))' "$OUT/project.json")"
echo "PROJECT_ID=$PID"

curl -sS -X POST "$BASE/api/projects/$PID/sessions?mode=quick_skeleton" -H "Content-Type: application/json"   --data-binary '{"title":"Analytics session","roles":["cook_1","technolog"],"start_role":"cook_1"}' > "$OUT/session.json"
SID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id",""))' "$OUT/session.json")"
echo "SESSION_ID=$SID"

cat > "$OUT/patch.json" <<'JSON'
{
  "nodes": [
    {"id":"n1","type":"task","title":"Подготовить заготовки","role":"cook_1","duration_min":10},
    {"id":"n2","type":"task","title":"Проверить качество","role":"technolog","duration_min":5},
    {"id":"n3","type":"timer","title":"Ожидание","duration_min":15}
  ],
  "edges": [
    {"from_id":"n1","to_id":"n2"},
    {"from_id":"n2","to_id":"n3"}
  ]
}
JSON

HTTP_PATCH="$(curl -sS -o "$OUT/patch_resp.json" -w "%{http_code}"   -X PATCH "$BASE/api/sessions/$SID" -H "Content-Type: application/json" --data-binary @"$OUT/patch.json")"
echo "PATCH http_code=$HTTP_PATCH"
if [ "$HTTP_PATCH" != "200" ]; then
  echo "PATCH failed:"
  sed -n '1,160p' "$OUT/patch_resp.json" || true
  false
fi

HTTP_A="$(curl -sS -o "$OUT/analytics.json" -w "%{http_code}" "$BASE/api/sessions/$SID/analytics")"
echo "GET analytics http_code=$HTTP_A"
sed -n '1,220p' "$OUT/analytics.json" || true

echo
echo "== artifacts =="
ls -lah "$OUT" | sed -n '1,220p' || true

echo
echo "== git diff --stat =="
git diff --stat || true

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
