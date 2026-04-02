#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_stepB8_unified_write_v2_start_${TS}"
git tag -a "$TAG" -m "checkpoint: step B8 v2 start (${TS})" >/dev/null 2>&1 || true

PY="$HOME/fpc_patch_stepB8_unified_write_v2.py"
cat > "$PY" <<'PY'
import re, json
from pathlib import Path

MAIN = Path("backend/app/main.py")
DOC  = Path("docs/contract_session_api.md")

s = MAIN.read_text(encoding="utf-8")

def ensure_import(line_pat: str, insert_text: str) -> None:
    global s
    if re.search(line_pat, s, flags=re.M) is None:
        # insert after __future__ block if present, else at top
        m = re.search(r"(?m)^from __future__ import .+\n+", s)
        if m:
            ins = m.end()
            s = s[:ins] + insert_text + "\n" + s[ins:]
        else:
            s = insert_text + "\n" + s

ensure_import(r"^\s*import json\s*$", "import json")
# typing imports (safe even if already there elsewhere)
if re.search(r"(?m)^\s*from typing import .*Any", s) is None and " Any" not in s:
    # best-effort: ensure Any/Dict/List/Optional available
    ensure_import(r"^\s*from typing import ", "from typing import Any, Dict, List, Optional")

# Ensure ConfigDict is available in pydantic import
if "ConfigDict" not in s:
    m = re.search(r"(?m)^from pydantic import (?P<n>.+)$", s)
    if m:
        names = [x.strip() for x in m.group("n").split(",")]
        if "ConfigDict" not in names:
            names.append("ConfigDict")
            s = s[:m.start()] + "from pydantic import " + ", ".join(names) + s[m.end():]
    else:
        s = s + "\nfrom pydantic import ConfigDict\n"

# Sanity: required helpers must exist in current codebase
if "def get_storage" not in s:
    raise SystemExit("Cannot find def get_storage in backend/app/main.py (stop to avoid breaking)")
if "def _recompute_session" not in s:
    raise SystemExit("Cannot find def _recompute_session in backend/app/main.py (stop to avoid breaking)")

# Find existing sessions endpoints (PATCH/GET/POST), tolerate {session_id}/{sid}/{id}
DEC_RE = re.compile(
    r"(?m)^(?P<indent>\s*)@(?P<obj>\w+)\.(?P<meth>get|post|patch|put)\(\s*(?P<q>['\"])(?P<path>[^'\"]+)(?P=q)(?P<rest>[^)]*)\)\s*$"
)

decorators = []
for m in DEC_RE.finditer(s):
    path = m.group("path")
    if "sessions" in path:
        decorators.append((m.start(), m.group("obj"), m.group("meth"), path))

def pick_path(meth: str, want: str) -> tuple[str,str,str]:
    # want: "single" "/sessions/{...}" or "list" "/sessions"
    for _, obj, mm, path in decorators:
        if mm != meth:
            continue
        if want == "single" and re.search(r"sessions/\{[a-zA-Z_]\w*\}", path):
            return obj, mm, path
        if want == "list" and re.search(r"sessions/?$", path):
            return obj, mm, path
    raise SystemExit(f"Cannot find {meth} sessions endpoint for {want}. Found: {decorators}")

obj_patch, _, path_patch = pick_path("patch", "single") if any(d[2]=="patch" for d in decorators) else (None,None,None)
obj_put, _, path_put = (None,None,None)
if any(d[2]=="put" for d in decorators):
    try:
        obj_put, _, path_put = pick_path("put", "single")
    except Exception:
        obj_put, path_put = None, None

obj_get_one, _, path_get_one = pick_path("get", "single")
obj_get_list, _, path_get_list = pick_path("get", "list")
obj_post, _, path_post = pick_path("post", "list")

def param_name_from_path(p: str) -> str:
    m = re.search(r"sessions/\{([a-zA-Z_]\w*)\}", p)
    if not m:
        raise SystemExit(f"Cannot extract path param from {p}")
    return m.group(1)

param = param_name_from_path(path_get_one)

# Decide object name (app/router) to use for new endpoints
OBJ = obj_patch or obj_put or obj_get_one or "app"
PATH_SINGLE = path_patch or path_put or path_get_one
PATH_LIST = path_get_list
PATH_POST = path_post

# Insert helper block once (after FastAPI app creation line)
HELPER_MARK = "Frontend contract helpers (Vite dev 5174)"
if HELPER_MARK not in s:
    helper = f'''
# --- {HELPER_MARK} ---
def _role_id_from_any(x: Any) -> Optional[str]:
    if x is None:
        return None
    if isinstance(x, str):
        v = x.strip()
        return v or None
    if isinstance(x, dict):
        for k in ("role_id","roleId","id","value","name","key"):
            if k in x and x[k] is not None:
                v = str(x[k]).strip()
                if v:
                    return v
    return None

def _norm_roles(v: Any) -> List[str]:
    if v is None:
        return []
    if isinstance(v, list):
        out: List[str] = []
        seen = set()
        for it in v:
            rid = _role_id_from_any(it)
            if not rid or rid in seen:
                continue
            seen.add(rid)
            out.append(rid)
        return out
    rid = _role_id_from_any(v)
    return [rid] if rid else []

def _notes_decode(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, str):
        txt = raw.strip()
        if not txt:
            return []
        try:
            j = json.loads(txt)
            if isinstance(j, list):
                return j
        except Exception:
            pass
        return [{{"note_id":"legacy","ts":None,"author":None,"text":txt}}]
    return []

def _notes_encode(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return json.dumps([v], ensure_ascii=False)
    if isinstance(v, list):
        return json.dumps(v, ensure_ascii=False)
    return ""

def _pick(d: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None

def _norm_nodes(v: Any) -> List[Node]:
    if v is None or not isinstance(v, list):
        return []
    out: List[Node] = []
    for it in v:
        if not isinstance(it, dict):
            continue
        nid = _pick(it, "id","node_id","nodeId")
        title = _pick(it, "title","label","name")
        if nid is None or title is None:
            continue
        payload = dict(it)
        payload["id"] = str(nid)
        payload["title"] = str(title)
        if "actor_role" not in payload and "actorRole" in payload:
            payload["actor_role"] = payload.get("actorRole")
        if "recipient_role" not in payload and "recipientRole" in payload:
            payload["recipient_role"] = payload.get("recipientRole")
        out.append(Node.model_validate(payload))
    return out

def _norm_edges(v: Any) -> List[Edge]:
    if v is None or not isinstance(v, list):
        return []
    out: List[Edge] = []
    for it in v:
        if not isinstance(it, dict):
            continue
        fr = _pick(it, "from_id","from","source_id","sourceId")
        to = _pick(it, "to_id","to","target_id","targetId")
        if fr is None or to is None:
            continue
        payload = dict(it)
        payload["from_id"] = str(fr)
        payload["to_id"] = str(to)
        out.append(Edge.model_validate(payload))
    return out

def _norm_questions(v: Any) -> List[Any]:
    if v is None or not isinstance(v, list):
        return []
    out: List[Any] = []
    for it in v:
        if isinstance(it, dict):
            payload = dict(it)
            if "question" not in payload and "text" in payload:
                payload["question"] = payload.get("text")
            if "node_id" not in payload and "nodeId" in payload:
                payload["node_id"] = payload.get("nodeId")
            out.append(payload)
    return out

def _session_api_dump(sess: Session) -> Dict[str, Any]:
    d = sess.model_dump()
    d["notes"] = _notes_decode(d.get("notes"))
    return d

class SessionWriteIn(BaseModel):
    title: Optional[str] = None
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    notes: Optional[Any] = None
    nodes: Optional[Any] = None
    edges: Optional[Any] = None
    questions: Optional[Any] = None
    model_config = ConfigDict(extra="allow")
'''
    m = re.search(r"(?m)^app\s*=\s*FastAPI\(", s)
    if not m:
        m = re.search(r"(?m)^\w+\s*=\s*FastAPI\(", s)
    if not m:
        raise SystemExit("Cannot find FastAPI app creation to insert helper block")
    ins = m.end()
    # insert after end-of-line containing FastAPI(
    line_end = s.find("\n", m.start())
    if line_end == -1:
        line_end = ins
    s = s[:line_end+1] + helper + s[line_end+1:]

def replace_endpoint_by_path(src: str, obj: str, meth: str, path: str, new_block: str) -> str:
    # locate decorator with exact obj+meth+path (but allow extra args)
    pat = re.compile(
        rf'(?m)^\s*@{re.escape(obj)}\.{meth}\(\s*(?P<q>["\']){re.escape(path)}(?P=q)[^)]*\)\s*$'
    )
    m = pat.search(src)
    if not m:
        raise SystemExit(f"Cannot find @{obj}.{meth}('{path}') endpoint")
    start = m.start()
    rest = src[m.end():]
    m2 = re.search(r"(?m)^(?:@|\w+\s*=\s*APIRouter|def )", rest)
    end = m.end() + (m2.start() if m2 else len(rest))
    return src[:start] + new_block + src[end:]

# Build endpoint blocks with correct obj/path/param name
PATCH_BLOCK = f'''
@{OBJ}.patch("{PATH_SINGLE}")
def patch_session({param}: str, inp: SessionWriteIn) -> Dict[str, Any]:
    st = get_storage()
    sid = {param}
    sess = st.load(sid)
    if not sess:
        return {{"error": "not found"}}

    payload = inp.model_dump(exclude_unset=True)

    if "title" in payload and payload["title"] is not None:
        title = str(payload["title"]).strip()
        if title:
            sess2 = st.rename(sid, title)
            if not sess2:
                return {{"error": "not found"}}
            sess = sess2

    if "roles" in payload:
        sess.roles = _norm_roles(payload.get("roles"))
        if getattr(sess, "start_role", None) and sess.roles and sess.start_role not in sess.roles:
            sess.start_role = None

    if "start_role" in payload:
        sr = payload.get("start_role")
        if sr is None or str(sr).strip() == "":
            sess.start_role = None
        else:
            sr = str(sr).strip()
            if sess.roles and sr not in sess.roles:
                return {{"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}}
            sess.start_role = sr

    if "notes" in payload:
        sess.notes = _notes_encode(payload.get("notes"))

    if "nodes" in payload:
        sess.nodes = _norm_nodes(payload.get("nodes"))
    if "edges" in payload:
        sess.edges = _norm_edges(payload.get("edges"))

    if "questions" in payload:
        sess.questions = _norm_questions(payload.get("questions"))

    sess = _recompute_session(sess)
    st.save(sess)
    return _session_api_dump(sess)
'''

PUT_BLOCK = f'''
@{OBJ}.put("{PATH_SINGLE}")
def put_session({param}: str, inp: SessionWriteIn) -> Dict[str, Any]:
    st = get_storage()
    sid = {param}
    sess = st.load(sid)
    if not sess:
        return {{"error": "not found"}}

    payload = inp.model_dump()

    if payload.get("title") is not None:
        title = str(payload["title"]).strip()
        if title:
            sess2 = st.rename(sid, title)
            if not sess2:
                return {{"error": "not found"}}
            sess = sess2

    sess.roles = _norm_roles(payload.get("roles"))
    sr = payload.get("start_role")
    if sr is None or str(sr).strip() == "":
        sess.start_role = None
    else:
        sr = str(sr).strip()
        if sess.roles and sr not in sess.roles:
            return {{"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}}
        sess.start_role = sr

    sess.notes = _notes_encode(payload.get("notes"))
    sess.nodes = _norm_nodes(payload.get("nodes"))
    sess.edges = _norm_edges(payload.get("edges"))
    sess.questions = _norm_questions(payload.get("questions"))

    sess = _recompute_session(sess)
    st.save(sess)
    return _session_api_dump(sess)
'''

GET_ONE_BLOCK = f'''
@{obj_get_one}.get("{path_get_one}")
def get_session({param}: str) -> Dict[str, Any]:
    st = get_storage()
    sid = {param}
    sess = st.load(sid)
    if not sess:
        return {{"error": "not found"}}
    return _session_api_dump(sess)
'''

GET_LIST_BLOCK = f'''
@{obj_get_list}.get("{path_get_list}")
def list_sessions() -> List[Dict[str, Any]]:
    st = get_storage()
    items = st.list()
    out: List[Dict[str, Any]] = []
    for it in items:
        try:
            out.append(_session_api_dump(it))
        except Exception:
            if isinstance(it, dict):
                it = dict(it)
                it["notes"] = _notes_decode(it.get("notes"))
                out.append(it)
    return out
'''

POST_BLOCK = f'''
@{obj_post}.post("{path_post}")
def create_session(inp: CreateSessionIn) -> Dict[str, Any]:
    st = get_storage()
    roles = _norm_roles(getattr(inp, "roles", None))
    sid = st.create(title=inp.title, roles=roles)
    sess = st.load(sid)
    if not sess:
        return {{"error": "create failed"}}
    if getattr(sess, "notes", None) is None or getattr(sess, "notes", "") == "":
        sess.notes = _notes_encode([])
        st.save(sess)
    return _session_api_dump(sess)
'''

# Replace existing endpoints
if obj_patch and path_patch:
    s = replace_endpoint_by_path(s, obj_patch, "patch", path_patch, PATCH_BLOCK)
else:
    # If no PATCH existed, try replace PUT and later we will insert PATCH by duplicating PUT block with .patch
    raise SystemExit("No PATCH sessions endpoint found. Add one first or adjust patcher.")

# Ensure PUT exists: replace if present, else insert after PATCH block
if obj_put and path_put:
    s = replace_endpoint_by_path(s, obj_put, "put", path_put, PUT_BLOCK)
else:
    # insert PUT right after PATCH block we injected
    anchor = PATCH_BLOCK.strip()
    pos = s.find(anchor)
    if pos == -1:
        raise SystemExit("Injected PATCH block not found for PUT insertion")
    ins = pos + len(anchor)
    s = s[:ins] + "\n\n" + PUT_BLOCK + "\n\n" + s[ins:]

s = replace_endpoint_by_path(s, obj_get_one, "get", path_get_one, GET_ONE_BLOCK)
s = replace_endpoint_by_path(s, obj_get_list, "get", path_get_list, GET_LIST_BLOCK)
s = replace_endpoint_by_path(s, obj_post, "post", path_post, POST_BLOCK)

MAIN.write_text(s, encoding="utf-8")

DOC.parent.mkdir(parents=True, exist_ok=True)
DOC.write_text(r'''# Session API contract (frontend bridge)

Frontend dev: http://localhost:5174

All frontend requests go to `/api/*` with `credentials: "include"` (cookie session).
CORS must allow origin `http://localhost:5174` and `allow-credentials: true`.

## Required endpoints

- `GET /api/meta` -> `200 application/json`
- `GET /api/sessions` -> list[Session]
- `POST /api/sessions` -> Session
- `GET /api/sessions/{id}` -> Session
- `PATCH /api/sessions/{id}` -> Session (partial OR full session-shape)
- `PUT /api/sessions/{id}` -> Session (replace whole session, frontend fallback if PATCH not supported)
- `GET /api/sessions/{id}/bpmn` -> `application/xml` (bpmn-js viewer)

## Notes about input normalization

Backend accepts and normalizes:

- roles:
  - `["cook_1", ...]`
  - `[{role_id:"cook_1", label:"Повар 1"}, ...]` (also keys: roleId, id, value, name, key)
  - normalized to `["cook_1", ...]`

- start_role:
  - `"cook_1"` or null/empty to clear
  - validated to be in roles when roles are set

- notes:
  - frontend sends array of objects `[{note_id, ts, author, text}]`
  - backend stores internally as a string but API always returns list
  - legacy string notes are exposed as `[{note_id:"legacy", ts:null, author:null, text:"..."}]`

- nodes:
  - id: `id` OR `node_id` OR `nodeId`
  - title: `title` OR `label` OR `name`
  - actor_role: `actor_role` OR `actorRole`
  - recipient_role: `recipient_role` OR `recipientRole`

- edges:
  - from: `from_id` OR `from` OR `source_id` OR `sourceId`
  - to: `to_id` OR `to` OR `target_id` OR `targetId`

Derived fields (`mermaid*`, `normalized`, `resources`, `version`) may be ignored and recomputed by the backend.
''', encoding="utf-8")

print("Detected endpoints:")
print("PATCH:", (obj_patch, path_patch))
print("PUT:", (obj_put, path_put))
print("GET1:", (obj_get_one, path_get_one))
print("GETL:", (obj_get_list, path_get_list))
print("POST:", (obj_post, path_post))
PY

python3 "$PY"

echo
echo "== py_compile =="
python -m py_compile backend/app/main.py 2>&1 | sed -n '1,220p' || true

echo
echo "== docker compose up -d --build =="
docker compose up -d --build

HOST_PORT="$(grep -E '^HOST_PORT=' .env 2>/dev/null | head -n1 | cut -d= -f2 | tr -d '[:space:]' || true)"
if [ -z "${HOST_PORT:-}" ]; then HOST_PORT="8011"; fi

echo
echo "== wait /health 200 =="
OK=0
for i in $(seq 1 30); do
  CODE="$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${HOST_PORT}/health" 2>/dev/null || echo 000)"
  echo "try=$i http=$CODE"
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  sleep 0.4
done
if [ "$OK" -ne 1 ]; then
  echo "FAIL: /health did not become 200"
  docker compose logs --tail 200 --no-color app 2>&1 | sed -n '1,260p' || true
  false
fi

echo
echo "== smoke: create session (roles as objects) =="
RESP="$(curl -sS -X POST "http://127.0.0.1:${HOST_PORT}/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"title":"b8v2_smoke","roles":[{"role_id":"cook_1","label":"Повар 1"},{"role_id":"technolog","label":"Технолог"}]}')"
echo "$RESP" | sed -n '1,200p'
SID="$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')"
echo "SID=$SID"

echo
echo "== smoke: PATCH (aliases + notes array) =="
PAYLOAD='{
  "roles":[{"role_id":"cook_1","label":"Повар 1"},{"role_id":"technolog","label":"Технолог"}],
  "start_role":"cook_1",
  "notes":[{"note_id":"n1","ts":1700000000,"author":"user","text":"заметка 1"}],
  "nodes":[{"node_id":"n_10","label":"Шаг 1","type":"step","actor_role":"cook_1"},{"id":"n_11","title":"Шаг 2","type":"step","actorRole":"technolog"}],
  "edges":[{"from":"n_10","to":"n_11","when":"далее"}]
}'
curl -sS -X PATCH "http://127.0.0.1:${HOST_PORT}/api/sessions/${SID}" -H "Content-Type: application/json" -d "$PAYLOAD" | sed -n '1,260p' || true

echo
echo "== smoke: PUT (fallback) =="
curl -sS -X PUT "http://127.0.0.1:${HOST_PORT}/api/sessions/${SID}" -H "Content-Type: application/json" -d "$PAYLOAD" | sed -n '1,260p' || true

echo
echo "== smoke: GET session (notes must be array) =="
curl -sS "http://127.0.0.1:${HOST_PORT}/api/sessions/${SID}" | sed -n '1,260p' || true

echo
echo "== git diff --stat =="
git diff --stat || true

git add backend/app/main.py docs/contract_session_api.md
git status -sb || true
git commit -m "feat(backend): unified session write (PATCH+PUT) + input normalization" || true

TAG2="cp/fpc_stepB8_unified_write_v2_done_${TS}"
git tag -a "$TAG2" -m "checkpoint: step B8 v2 done (${TS})" >/dev/null 2>&1 || true

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
