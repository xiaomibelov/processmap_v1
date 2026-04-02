set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
TAG="cp/fpc_stepB8_unified_write_start_${TS}"
git tag -a "$TAG" -m "checkpoint: step B8 start (${TS})" >/dev/null 2>&1 || true

PY="$HOME/fpc_patch_stepB8_unified_write.py"
cat > "$PY" <<'PY'
import re, json
from pathlib import Path

MAIN = Path("backend/app/main.py")
DOC  = Path("docs/contract_session_api.md")

s = MAIN.read_text(encoding="utf-8")

if not re.search(r"(?m)^\s*import json\s*$", s):
    m = re.search(r"(?m)^from __future__ import .+\n+", s)
    if m:
        ins = m.end()
        s = s[:ins] + "import json\n" + s[ins:]
    else:
        s = "import json\n" + s

if "ConfigDict" not in s:
    m = re.search(r"(?m)^from pydantic import (?P<n>.+)$", s)
    if m:
        names = [x.strip() for x in m.group("n").split(",")]
        if "ConfigDict" not in names:
            names.append("ConfigDict")
            s = s[:m.start()] + "from pydantic import " + ", ".join(names) + s[m.end():]
    else:
        s = s + "\nfrom pydantic import ConfigDict\n"

HELPER_BLOCK = r'''
# --- Frontend contract helpers (Vite dev 5174) ---
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
        return [{"note_id":"legacy","ts":None,"author":None,"text":txt}]
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
    try:
        from .models import Question  # type: ignore
        Q = Question
    except Exception:
        Q = None
    out = []
    for it in v:
        if not isinstance(it, dict):
            continue
        payload = dict(it)
        if "question" not in payload and "text" in payload:
            payload["question"] = payload.get("text")
        if "node_id" not in payload and "nodeId" in payload:
            payload["node_id"] = payload.get("nodeId")
        if Q is not None:
            try:
                out.append(Q.model_validate(payload))
                continue
            except Exception:
                pass
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

if "Frontend contract helpers" not in s:
    m = re.search(r"(?m)^app\s*=\s*FastAPI\([^\n]*\)\s*$", s)
    if not m:
        m = re.search(r"(?m)^app\s*=\s*FastAPI\([^\n]*$", s)
    if not m:
        raise SystemExit("Cannot find app = FastAPI(...) line in backend/app/main.py")
    ins = m.end()
    s = s[:ins] + HELPER_BLOCK + s[ins:]

def replace_endpoint(src: str, method: str, path: str, new_block: str) -> str:
    pat = re.compile(rf'(?m)^(?P<indent>\s*)@(?P<obj>\w+)\.{method}\(\s*["\']{re.escape(path)}["\'].*\)\s*$')
    m = pat.search(src)
    if not m:
        raise SystemExit(f"Cannot find @{method}('{path}') endpoint")
    start = m.start()
    rest = src[m.end():]
    m2 = re.search(r"(?m)^(?:@|def )", rest)
    end = m.end() + (m2.start() if m2 else len(rest))
    return src[:start] + new_block + src[end:]

PATCH_BLOCK = r'''
@app.patch("/api/sessions/{id}")
def patch_session(id: str, inp: SessionWriteIn) -> Dict[str, Any]:
    st = get_storage()
    sess = st.load(id)
    if not sess:
        return {"error": "not found"}

    payload = inp.model_dump(exclude_unset=True)

    if "title" in payload and payload["title"] is not None:
        title = str(payload["title"]).strip()
        if title:
            sess2 = st.rename(id, title)
            if not sess2:
                return {"error": "not found"}
            sess = sess2

    if "roles" in payload:
        sess.roles = _norm_roles(payload.get("roles"))
        if sess.start_role and sess.roles and sess.start_role not in sess.roles:
            sess.start_role = None

    if "start_role" in payload:
        sr = payload.get("start_role")
        if sr is None or str(sr).strip() == "":
            sess.start_role = None
        else:
            sr = str(sr).strip()
            if sess.roles and sr not in sess.roles:
                return {"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}
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

PUT_BLOCK = r'''
@app.put("/api/sessions/{id}")
def put_session(id: str, inp: SessionWriteIn) -> Dict[str, Any]:
    st = get_storage()
    sess = st.load(id)
    if not sess:
        return {"error": "not found"}

    payload = inp.model_dump()

    if payload.get("title") is not None:
        title = str(payload["title"]).strip()
        if title:
            sess2 = st.rename(id, title)
            if not sess2:
                return {"error": "not found"}
            sess = sess2

    sess.roles = _norm_roles(payload.get("roles"))
    sr = payload.get("start_role")
    if sr is None or str(sr).strip() == "":
        sess.start_role = None
    else:
        sr = str(sr).strip()
        if sess.roles and sr not in sess.roles:
            return {"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}
        sess.start_role = sr

    sess.notes = _notes_encode(payload.get("notes"))
    sess.nodes = _norm_nodes(payload.get("nodes"))
    sess.edges = _norm_edges(payload.get("edges"))
    sess.questions = _norm_questions(payload.get("questions"))

    sess = _recompute_session(sess)
    st.save(sess)
    return _session_api_dump(sess)
'''

GET_ONE_BLOCK = r'''
@app.get("/api/sessions/{id}")
def get_session(id: str) -> Dict[str, Any]:
    st = get_storage()
    sess = st.load(id)
    if not sess:
        return {"error": "not found"}
    return _session_api_dump(sess)
'''

GET_LIST_BLOCK = r'''
@app.get("/api/sessions")
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

POST_BLOCK = r'''
@app.post("/api/sessions")
def create_session(inp: CreateSessionIn) -> Dict[str, Any]:
    st = get_storage()
    roles = _norm_roles(getattr(inp, "roles", None))
    sid = st.create(title=inp.title, roles=roles)
    sess = st.load(sid)
    if not sess:
        return {"error": "create failed"}
    if getattr(sess, "notes", None) is None or getattr(sess, "notes", "") == "":
        sess.notes = _notes_encode([])
        st.save(sess)
    return _session_api_dump(sess)
'''

s = replace_endpoint(s, "patch", "/api/sessions/{id}", PATCH_BLOCK)

if '@app.put("/api/sessions/{id}")' not in s:
    ins = s.find(PATCH_BLOCK.strip())
    if ins == -1:
        raise SystemExit("Cannot locate injected PATCH block to insert PUT")
    ins = ins + len(PATCH_BLOCK.strip())
    s = s[:ins] + "\n\n" + PUT_BLOCK + "\n\n" + s[ins:]

s = replace_endpoint(s, "get", "/api/sessions/{id}", GET_ONE_BLOCK)
s = replace_endpoint(s, "get", "/api/sessions", GET_LIST_BLOCK)
s = replace_endpoint(s, "post", "/api/sessions", POST_BLOCK)

MAIN.write_text(s, encoding="utf-8")

DOC.parent.mkdir(parents=True, exist_ok=True)
DOC.write_text(r'''# Session API contract (frontend bridge)

Frontend dev: http://localhost:5174

All frontend requests go to `/api/*` with `credentials: "include"` (cookie session).
CORS must allow origin `http://localhost:5174` and `allow-credentials: true` (already enabled).

## Endpoints (required)

1) `GET /api/meta` -> `200 application/json`

2) `GET /api/sessions` -> list of Session objects

3) `POST /api/sessions` -> creates a new session
- Input: `{ "title": string, "roles"?: roles }`
- `roles` accepts either:
  - `["cook_1", "technolog"]`
  - `[{ "role_id":"cook_1", "label":"Повар 1" }, ...]`
- Backend normalizes to `["cook_1", ...]`

4) `GET /api/sessions/{id}` -> Session

5) Unified write endpoint (Graph Editor uses ONLY this)
- `PATCH /api/sessions/{id}`: merge / partial update (also accepts full shape)
- `PUT /api/sessions/{id}`: replace whole session (frontend fallback when PATCH is not supported)

Derived fields (`mermaid*`, `normalized`, `resources`, `version`) may be ignored and recomputed by the backend.

6) `GET /api/sessions/{id}/bpmn` -> `200 application/xml` compatible with `bpmn-js`.

## Session API shape (canonical)

```json
{
  "id":"string",
  "title":"string",
  "roles":["cook_1","technolog"],
  "start_role":"cook_1|null",
  "notes":[{"note_id":"n1","ts":1700000000,"author":"user","text":"..."}],
  "nodes":[{"id":"n_10","title":"Шаг 1","type":"step","actor_role":"cook_1"}],
  "edges":[{"from_id":"n_10","to_id":"n_11","when":"далее"}],
  "questions":[],
  "mermaid":"(derived)",
  "mermaid_simple":"(derived)",
  "mermaid_lanes":"(derived)",
  "normalized":{},
  "resources":{},
  "version":0
}
```

## Input compatibility (aliases accepted)

### roles
- strings: `["cook_1", ...]`
- objects: `[{role_id:"cook_1", label:"..."}, ...]`
- also accepted keys inside role object: `roleId`, `id`, `value`, `name`, `key`

### notes
- frontend sends array: `[{note_id, ts, author, text}]`
- backend stores internally as string but API always returns list
- legacy string notes are returned as `[{note_id:"legacy", ts:null, author:null, text:"<old>"}]`

### nodes
- id: `id` OR `node_id` OR `nodeId`
- title: `title` OR `label` OR `name`
- actor_role: `actor_role` OR `actorRole`
- recipient_role: `recipient_role` OR `recipientRole`

### edges
- from: `from_id` OR `from` OR `source_id` OR `sourceId`
- to: `to_id` OR `to` OR `target_id` OR `targetId`
''', encoding="utf-8")

print("OK patched", str(MAIN), "and", str(DOC))
PY

python3 "$PY"

echo
echo "== py_compile =="
python -m py_compile backend/app/main.py 2>&1 | sed -n '1,200p' || true

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
  exit 1
fi

echo
echo "== smoke: create session with roles as objects =="
RESP="$(curl -sS -X POST "http://127.0.0.1:${HOST_PORT}/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"title":"b8_smoke","roles":[{"role_id":"cook_1","label":"Повар 1"},{"role_id":"technolog","label":"Технолог"}]}')"
echo "$RESP" | sed -n '1,140p'
SID="$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')"
echo "SID=$SID"

echo
echo "== smoke: PATCH full-ish shape (aliases + notes array) =="
PAYLOAD='{
  "roles":[{"role_id":"cook_1","label":"Повар 1"},{"role_id":"technolog","label":"Технолог"}],
  "start_role":"cook_1",
  "notes":[{"note_id":"n1","ts":1700000000,"author":"user","text":"заметка 1"}],
  "nodes":[{"node_id":"n_10","label":"Шаг 1","type":"step","actor_role":"cook_1"},{"id":"n_11","title":"Шаг 2","type":"step","actorRole":"technolog"}],
  "edges":[{"from":"n_10","to":"n_11","when":"далее"}]
}'
curl -sS -X PATCH "http://127.0.0.1:${HOST_PORT}/api/sessions/${SID}" -H "Content-Type: application/json" -d "$PAYLOAD" | sed -n '1,240p' || true

echo
echo "== smoke: PUT replace (frontend fallback) =="
curl -sS -X PUT "http://127.0.0.1:${HOST_PORT}/api/sessions/${SID}" -H "Content-Type: application/json" -d "$PAYLOAD" | sed -n '1,240p' || true

echo
echo "== smoke: GET session (notes must be array) =="
curl -sS "http://127.0.0.1:${HOST_PORT}/api/sessions/${SID}" | sed -n '1,240p' || true

echo
echo "== smoke: BPMN head =="
curl -sS "http://127.0.0.1:${HOST_PORT}/api/sessions/${SID}/bpmn" | head -n 5 || true

echo
echo "== git diff --stat =="
git diff --stat || true

git add backend/app/main.py docs/contract_session_api.md
git status -sb || true
git commit -m "feat(backend): unified session write (PATCH+PUT) + frontend contract" || true

TAG2="cp/fpc_stepB8_unified_write_done_${TS}"
git tag -a "$TAG2" -m "checkpoint: step B8 done (${TS})" >/dev/null 2>&1 || true

echo
echo "== rollback =="
echo "git checkout \"$TAG\""
