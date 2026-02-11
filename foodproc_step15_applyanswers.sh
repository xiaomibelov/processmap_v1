set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
TS="$(date +%F_%H%M%S)"
echo "== git state (before) =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
git tag -a "cp/foodproc_step15_applyanswers_before_${TS}" -m "checkpoint: before step15 applyanswers (${TS})" || true
BR="feat/step15-answers-autofill-v1"
git checkout -b "$BR" || git checkout "$BR"

echo "== write files =="
mkdir -p "backend/app"
cat > "backend/app/models.py" <<'EOF'
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


IssueType = Literal["CRITICAL", "MISSING", "VARIANT", "AMBIG", "LOSS"]


class Question(BaseModel):
    id: str
    node_id: str
    issue_type: IssueType
    question: str
    options: List[str] = Field(default_factory=list)
    target: Optional[Dict[str, Any]] = None
    status: Literal["open", "answered", "skipped"] = "open"
    answer: Optional[str] = None
    orphaned: bool = False


class Node(BaseModel):
    id: str
    type: Literal["step", "decision", "fork", "join", "loss_event", "timer", "message"] = "step"
    title: str
    actor_role: Optional[str] = None
    recipient_role: Optional[str] = None
    equipment: List[str] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    duration_min: Optional[int] = None
    qc: List[Dict[str, Any]] = Field(default_factory=list)
    exceptions: List[Dict[str, Any]] = Field(default_factory=list)
    disposition: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[str] = Field(default_factory=list)
    confidence: float = 0.0


class Edge(BaseModel):
    from_id: str
    to_id: str
    when: Optional[str] = None


class Session(BaseModel):
    id: str
    title: str
    roles: List[str] = Field(default_factory=list)
    notes: str = ""
    nodes: List[Node] = Field(default_factory=list)
    edges: List[Edge] = Field(default_factory=list)
    questions: List[Question] = Field(default_factory=list)
    mermaid: str = ""
    mermaid_simple: str = ""
    mermaid_lanes: str = ""
    normalized: Dict[str, Any] = Field(default_factory=dict)
    resources: Dict[str, Any] = Field(default_factory=dict)
    version: int = 0
EOF

mkdir -p "backend/app"
cat > "backend/app/main.py" <<'EOF'
from __future__ import annotations

import math
import os
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .ai.deepseek_client import extract_process
from .exporters.mermaid import render_mermaid
from .exporters.yaml_export import dump_yaml, session_to_process_dict
from .glossary import normalize_kind, slugify_canon, upsert_term
from .models import Node, Edge, Session
from .normalizer import load_seed_glossary, normalize_nodes
from .resources import build_resources_report
from .storage import get_storage
from .validators.coverage import build_questions
from .validators.disposition import build_disposition_questions
from .validators.loss import build_loss_questions, loss_report


app = FastAPI(title="Food Process Copilot MVP")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
WORKSPACE = Path(os.environ.get("PROCESS_WORKSPACE", "workspace/processes"))
GLOSSARY_SEED = BASE_DIR / "knowledge" / "glossary_seed.yml"

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class CreateSessionIn(BaseModel):
    title: str
    roles: Optional[List[str]] = None


class NotesIn(BaseModel):
    notes: str


class AnswerIn(BaseModel):
    question_id: str
    answer: str
    node_id: Optional[str] = None


class NodePatchIn(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    actor_role: Optional[str] = None
    recipient_role: Optional[str] = None
    equipment: Optional[List[str]] = None
    duration_min: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    disposition: Optional[Dict[str, Any]] = None


class GlossaryAddIn(BaseModel):
    kind: str
    term: str
    canon: Optional[str] = None
    title: Optional[str] = None


def _merge_nodes(existing: List[Node], extracted: List[Node]) -> List[Node]:
    by_id = {n.id: n for n in existing}
    merged: List[Node] = []
    for nn in extracted:
        old = by_id.get(nn.id)
        if not old:
            merged.append(nn)
            continue

        p = dict(old.parameters or {})
        if p.get("_manual_title"):
            nn.title = old.title
        if p.get("_manual_type"):
            nn.type = old.type
        if p.get("_manual_actor"):
            nn.actor_role = old.actor_role
        if p.get("_manual_recipient"):
            nn.recipient_role = old.recipient_role
        if p.get("_manual_equipment"):
            nn.equipment = list(old.equipment or [])
        if p.get("_manual_duration"):
            nn.duration_min = old.duration_min
        if p.get("_manual_parameters"):
            nn.parameters = dict(old.parameters or {})
        if p.get("_manual_disposition"):
            nn.disposition = dict(old.disposition or {})

        if not p.get("_manual_equipment") and old.equipment and not nn.equipment:
            nn.equipment = list(old.equipment)
        if not p.get("_manual_actor") and old.actor_role and not nn.actor_role:
            nn.actor_role = old.actor_role
        if not p.get("_manual_duration") and old.duration_min is not None and nn.duration_min is None:
            nn.duration_min = old.duration_min
        if not p.get("_manual_disposition") and old.disposition and not nn.disposition:
            nn.disposition = dict(old.disposition)

        if old.qc:
            nn.qc = list(old.qc)
        if old.exceptions:
            nn.exceptions = list(old.exceptions)

        merged.append(nn)
    return merged


def _merge_question_states(old_questions, new_questions):
    old_by_id = {q.id: q for q in (old_questions or [])}

    merged = []
    for q in new_questions:
        old = old_by_id.get(q.id)
        if old:
            q.status = old.status
            q.answer = old.answer
        q.orphaned = False
        merged.append(q)

    seen_ids = {q.id for q in merged}

    orphans = []
    for old in (old_questions or []):
        if old.id in seen_ids:
            continue
        if old.status != "answered":
            continue
        keep = old.model_copy(deep=True)
        keep.orphaned = True
        orphans.append(keep)

    merged.extend(orphans[:300])
    return merged[:900]


def _disposition_report(s: Session) -> Dict[str, Any]:
    nodes = []
    open_nodes = []
    for n in s.nodes:
        eq = list(n.equipment or [])
        if not eq:
            continue
        disp = n.disposition or {}
        eq_actions = disp.get("equipment_actions") or {}
        note = disp.get("note")
        row = {
            "id": n.id,
            "title": n.title,
            "actor_role": n.actor_role,
            "equipment": eq,
            "equipment_actions": eq_actions,
            "note": note,
        }
        nodes.append(row)
        if not isinstance(eq_actions, dict) or len(eq_actions) == 0:
            open_nodes.append({"id": n.id, "title": n.title, "equipment": eq})
    return {"nodes": nodes, "open": open_nodes, "open_count": len(open_nodes)}


def _recompute_session(s: Session) -> Session:
    seed = load_seed_glossary(GLOSSARY_SEED)
    s.normalized = normalize_nodes(s.nodes, seed)

    resources_report, conflict_questions = build_resources_report(s.nodes, s.edges)
    s.resources = resources_report

    base_questions = build_questions(s.nodes, roles=s.roles)
    disp_questions = build_disposition_questions(s.nodes)
    loss_questions = build_loss_questions(s.nodes)

    new_questions = base_questions + conflict_questions + disp_questions + loss_questions
    s.questions = _merge_question_states(s.questions, new_questions)

    s.mermaid_simple = render_mermaid(s.nodes, s.edges, roles=s.roles, mode="simple")
    s.mermaid_lanes = render_mermaid(s.nodes, s.edges, roles=s.roles, mode="lanes")
    s.mermaid = s.mermaid_lanes

    s.version += 1
    return s


@app.get("/")
def index() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/favicon.ico")
def favicon() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "favicon.ico"))


@app.post("/api/sessions")
def create_session(inp: CreateSessionIn) -> Dict[str, Any]:
    sid = uuid.uuid4().hex[:10]
    roles = inp.roles or ["cook_1", "cook_2", "brigadir", "technolog"]
    s = Session(id=sid, title=inp.title, roles=roles, version=1)
    s = _recompute_session(s)
    st = get_storage()
    st.save(s)
    return s.model_dump()


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    return s.model_dump()


@app.post("/api/sessions/{session_id}/recompute")
def recompute(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


@app.post("/api/glossary/add")
def glossary_add(inp: GlossaryAddIn) -> Dict[str, Any]:
    kind = normalize_kind(inp.kind)
    term = (inp.term or "").strip()
    canon = (inp.canon or "").strip() or slugify_canon(term)
    title = (inp.title or "").strip() or term
    res = upsert_term(GLOSSARY_SEED, kind, term, canon, title)
    return res


@app.post("/api/sessions/{session_id}/notes")
def post_notes(session_id: str, inp: NotesIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    s.notes = inp.notes

    extracted = extract_process(s.notes)
    nodes_raw = extracted.get("nodes", []) or []
    edges_raw = extracted.get("edges", []) or []
    roles = extracted.get("roles", []) or s.roles

    extracted_nodes = [Node.model_validate(nr) for nr in nodes_raw]
    extracted_edges = [Edge.model_validate(er) for er in edges_raw]

    s.roles = roles
    s.nodes = _merge_nodes(s.nodes, extracted_nodes)
    s.edges = extracted_edges

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


def _map_disposition_answer(answer: str) -> Optional[str]:
    a = (answer or "").strip().lower()
    if not a:
        return None
    if "остав" in a:
        return "leave"
    if "вернут" in a or "хран" in a:
        return "return_storage"
    if "мойк" in a:
        return "wash"
    if "сан" in a or "дез" in a:
        return "sanitize"
    if "утилиз" in a or "спис" in a:
        return "dispose"
    if "друго" in a:
        return "other"
    return None


def _ensure_loss_dict(node: Node) -> Dict[str, Any]:
    node.parameters = dict(node.parameters or {})
    loss = node.parameters.get("loss")
    if not isinstance(loss, dict):
        loss = {}
    node.parameters["loss"] = loss
    return loss


def _parse_equipment_list(answer: str) -> List[str]:
    items = [x.strip() for x in re.split(r"[\n,;]+", (answer or "")) if x.strip()]
    out = []
    seen = set()
    for x in items:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def _parse_minutes(answer: str) -> Optional[int]:
    t = (answer or "").strip().lower()
    if not t:
        return None

    m = re.match(r"^\s*(\d+)\s*:\s*(\d+)\s*$", t)
    if m:
        mm = int(m.group(1))
        ss = int(m.group(2))
        return int(math.ceil(mm + (ss / 60.0)))

    nums = re.findall(r"(\d+(?:[\.,]\d+)?)", t)
    if not nums:
        return None

    try:
        v = float(nums[0].replace(",", "."))
    except Exception:
        return None

    if "час" in t or "ч." in t:
        return int(math.ceil(v * 60.0))
    if "сек" in t or "s" in t:
        return int(math.ceil(v / 60.0))
    return int(math.ceil(v))


def _normalize_choice(answer: str, allowed: List[str]) -> str:
    a = (answer or "").strip()
    if not a:
        return ""
    low = a.lower()
    for opt in allowed or []:
        if (opt or "").strip().lower() == low:
            return opt
    return a


def _ensure_dict_at_path(root: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
    cur = root
    for k in keys:
        v = cur.get(k)
        if not isinstance(v, dict):
            v = {}
            cur[k] = v
        cur = v
    return cur


def _apply_target_to_node(s: Session, node: Node, q, answer: str) -> None:
    target = q.target or {}
    field = (target.get("field") or "").strip()
    mode = (target.get("mode") or "set").strip().lower()
    transform = (target.get("transform") or "text").strip().lower()

    if not field:
        node.parameters = dict(node.parameters or {})
        node.parameters.setdefault("notes", [])
        if isinstance(node.parameters.get("notes"), list):
            node.parameters["notes"].append(answer)
        node.parameters["_manual_parameters"] = True
        return

    if field == "actor_role":
        node.actor_role = _normalize_choice(answer, s.roles)
        node.parameters["_manual_actor"] = True
        return

    if field == "recipient_role":
        node.recipient_role = _normalize_choice(answer, s.roles)
        node.parameters["_manual_recipient"] = True
        return

    if field == "equipment":
        new_items = _parse_equipment_list(answer)
        if mode == "merge":
            merged = list(node.equipment or [])
            for x in new_items:
                if x not in merged:
                    merged.append(x)
            node.equipment = merged
        else:
            node.equipment = new_items
        node.parameters["_manual_equipment"] = True
        return

    if field == "duration_min":
        mins = _parse_minutes(answer)
        if mins is not None:
            node.duration_min = mins
            node.parameters["_manual_duration"] = True
        return

    if field.startswith("disposition.") or field == "disposition":
        node.disposition = dict(node.disposition or {})
        node.parameters["_manual_disposition"] = True

        if transform == "disposition_equipment_action":
            action = _map_disposition_answer(answer)
            node.disposition.setdefault("equipment_actions", {})
            if isinstance(node.disposition.get("equipment_actions"), dict) and action and action != "other":
                for eq in (node.equipment or []):
                    eqid = (eq or "").strip()
                    if eqid:
                        node.disposition["equipment_actions"][eqid] = action
            if action == "other" or not action:
                node.disposition["note"] = answer
            return

        if field == "disposition":
            node.disposition["note"] = answer
            return

        path = field.split(".")[1:]
        if not path:
            node.disposition["note"] = answer
            return

        cur = _ensure_dict_at_path(node.disposition, path[:-1]) if len(path) > 1 else node.disposition
        key = path[-1]

        if mode == "append":
            lst = cur.get(key)
            if not isinstance(lst, list):
                lst = []
            lst.append(answer)
            cur[key] = lst
        else:
            cur[key] = answer
        return

    if field.startswith("parameters."):
        node.parameters = dict(node.parameters or {})
        node.parameters["_manual_parameters"] = True
        path = field.split(".")[1:]
        if not path:
            return

        if path and path[0] == "loss":
            loss = _ensure_loss_dict(node)
            if len(path) >= 2:
                loss[path[1]] = answer
            return

        cur = _ensure_dict_at_path(node.parameters, path[:-1]) if len(path) > 1 else node.parameters
        key = path[-1]

        if transform == "minutes":
            v = _parse_minutes(answer)
            if v is None:
                v = answer
        else:
            v = answer

        if mode == "append":
            lst = cur.get(key)
            if not isinstance(lst, list):
                lst = []
            lst.append(v)
            cur[key] = lst
        else:
            cur[key] = v
        return

    node.parameters = dict(node.parameters or {})
    node.parameters.setdefault("notes", [])
    if isinstance(node.parameters.get("notes"), list):
        node.parameters["notes"].append(answer)
    node.parameters["_manual_parameters"] = True


def _apply_answer(s: Session, inp: AnswerIn) -> None:
    q = next((x for x in s.questions if x.id == inp.question_id), None)
    if not q:
        raise KeyError("question not found")

    q.status = "answered"
    q.answer = inp.answer

    node_id = (inp.node_id or q.node_id or "").strip()
    if not node_id:
        return

    node = next((n for n in s.nodes if n.id == node_id), None)
    if not node:
        return

    _apply_target_to_node(s, node, q, inp.answer)


@app.post("/api/sessions/{session_id}/answer")
def answer(session_id: str, inp: AnswerIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    try:
        _apply_answer(s, inp)
    except KeyError:
        return {"error": "question not found"}

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


@app.post("/api/sessions/{session_id}/answers")
def answer_v2(session_id: str, inp: AnswerIn) -> Dict[str, Any]:
    return answer(session_id, inp)


@app.post("/api/sessions/{session_id}/nodes/{node_id}")
def patch_node(session_id: str, node_id: str, inp: NodePatchIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    node = next((n for n in s.nodes if n.id == node_id), None)
    if not node:
        return {"error": "node not found"}

    data = inp.model_dump(exclude_unset=True)

    if "title" in data:
        node.title = data["title"] or node.title
        node.parameters["_manual_title"] = True
    if "type" in data:
        node.type = data["type"] or node.type
        node.parameters["_manual_type"] = True
    if "actor_role" in data:
        node.actor_role = data["actor_role"] or None
        node.parameters["_manual_actor"] = True
    if "recipient_role" in data:
        node.recipient_role = data["recipient_role"] or None
        node.parameters["_manual_recipient"] = True
    if "equipment" in data and data["equipment"] is not None:
        node.equipment = data["equipment"]
        node.parameters["_manual_equipment"] = True
    if "duration_min" in data:
        node.duration_min = data["duration_min"]
        node.parameters["_manual_duration"] = True
    if "parameters" in data and data["parameters"] is not None:
        node.parameters = data["parameters"]
        node.parameters["_manual_parameters"] = True
    if "disposition" in data and data["disposition"] is not None:
        node.disposition = data["disposition"]
        node.parameters["_manual_disposition"] = True

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


@app.post("/api/sessions/{session_id}/export")
def export(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    slug = f"{re.sub(r'[^a-zA-Z0-9_]+', '_', s.title.strip()).lower()}_{s.id}"
    out_dir = WORKSPACE / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    proc_yml = dump_yaml(session_to_process_dict(s))
    (out_dir / "process.yml").write_text(proc_yml, encoding="utf-8")

    (out_dir / "diagram_simple.mmd").write_text(s.mermaid_simple or "", encoding="utf-8")
    (out_dir / "diagram_lanes.mmd").write_text(s.mermaid_lanes or "", encoding="utf-8")
    (out_dir / "diagram.mmd").write_text(s.mermaid or "", encoding="utf-8")

    seed = load_seed_glossary(GLOSSARY_SEED)
    (out_dir / "glossary.yml").write_text(dump_yaml(seed), encoding="utf-8")
    (out_dir / "normalized.yml").write_text(dump_yaml(s.normalized or {}), encoding="utf-8")
    (out_dir / "resources.yml").write_text(dump_yaml(s.resources or {}), encoding="utf-8")

    disp_rep = _disposition_report(s)
    (out_dir / "disposition.yml").write_text(dump_yaml(disp_rep), encoding="utf-8")

    lr = loss_report(s.nodes)
    (out_dir / "losses.yml").write_text(dump_yaml(lr), encoding="utf-8")

    return {"ok": True, "exported_to": str(out_dir)}
EOF

mkdir -p "backend/app/validators"
cat > "backend/app/validators/coverage.py" <<'EOF'
from __future__ import annotations

import re
from typing import List, Optional

from ..models import Node, Question


HEAT_VERBS = ("включ", "нагр", "кип", "довести до кип", "варить", "подогр", "томить", "обжар", "пассиров")
TRANSFER_VERBS = ("перел", "слить", "налить", "долить", "перемест", "перелож")
MARKING_WORDS = ("маркир", "этикет", "наклей", "стикер")
LOSS_WORDS = ("списан", "списание", "потер", "брак", "утилиз")
WASH_WORDS = ("помыть", "мойка", "протереть", "санобработ", "дезинфек")


def _needs_heat_params(title: str) -> bool:
    t = (title or "").lower()
    return any(v in t for v in HEAT_VERBS)


def _needs_disposition(node: Node) -> bool:
    if node.type in ("decision", "fork", "join"):
        return False
    return not bool(node.disposition)


def _needs_actor(node: Node) -> bool:
    if node.type in ("join",):
        return False
    return not bool(node.actor_role)


def _needs_equipment(node: Node) -> bool:
    t = (node.title or "").lower()
    touches = _needs_heat_params(node.title) or any(w in t for w in TRANSFER_VERBS) or any(w in t for w in MARKING_WORDS)
    if node.type in ("loss_event", "decision", "fork", "join", "timer", "message"):
        return False
    if touches:
        return len(node.equipment) == 0
    return False


def _is_loss(node: Node) -> bool:
    t = (node.title or "").lower()
    return node.type == "loss_event" or any(w in t for w in LOSS_WORDS)


def _is_marking(node: Node) -> bool:
    t = (node.title or "").lower()
    return any(w in t for w in MARKING_WORDS)


def _is_wash(node: Node) -> bool:
    t = (node.title or "").lower()
    return any(w in t for w in WASH_WORDS)


def build_questions(nodes: List[Node], roles: Optional[List[str]] = None) -> List[Question]:
    qs: List[Question] = []

    role_opts = []
    seen_roles = set()
    for r in roles or []:
        rr = (r or "").strip()
        if not rr:
            continue
        if rr in seen_roles:
            continue
        seen_roles.add(rr)
        role_opts.append(rr)

    def add(qid: str, node_id: str, issue_type: str, question: str, options=None, target=None) -> None:
        qs.append(
            Question(
                id=qid,
                node_id=node_id,
                issue_type=issue_type,
                question=question,
                options=options or [],
                target=target,
            )
        )

    for n in nodes:
        norm = (n.parameters or {}).get("_norm") or {}
        unknown_terms = norm.get("unknown_terms") or []
        if unknown_terms:
            add(
                f"cov_norm_unknown_{n.id}",
                n.id,
                "AMBIG",
                "Нормализатор: найдены неизвестные термины. Что это за объект/ресурс/оборудование? Приведи каноническое название/ID.",
                options=[],
                target={"field": "parameters.notes", "mode": "append", "transform": "text"},
            )

        if n.type == "timer":
            if n.duration_min is None:
                add(
                    f"cov_timer_duration_{n.id}",
                    n.id,
                    "CRITICAL",
                    "Таймер: сколько минут/часов ждать? Укажи длительность (мин).",
                    options=[],
                    target={"field": "duration_min", "mode": "set", "transform": "minutes"},
                )
            if _needs_actor(n):
                add(
                    f"cov_timer_actor_{n.id}",
                    n.id,
                    "MISSING",
                    "Кто отвечает за таймер/контроль? (actor_role)",
                    options=role_opts,
                    target={"field": "actor_role", "mode": "set", "transform": "role"},
                )
            continue

        if n.type == "message":
            if not n.recipient_role:
                add(
                    f"cov_message_recipient_{n.id}",
                    n.id,
                    "MISSING",
                    "Сообщение: кому адресовано? (recipient_role)",
                    options=role_opts,
                    target={"field": "recipient_role", "mode": "set", "transform": "role"},
                )
            add(
                f"cov_message_text_{n.id}",
                n.id,
                "VARIANT",
                "Сообщение: что именно спросить/сообщить (текст/формулировка)?",
                options=[],
                target={"field": "parameters.message_text", "mode": "set", "transform": "text"},
            )
            continue

        if _needs_actor(n):
            add(
                f"cov_actor_{n.id}",
                n.id,
                "MISSING",
                "Кто выполняет этот шаг? (actor_role)",
                options=role_opts,
                target={"field": "actor_role", "mode": "set", "transform": "role"},
            )

        if _needs_equipment(n):
            add(
                f"cov_equipment_{n.id}",
                n.id,
                "MISSING",
                "Какое оборудование/инвентарь задействовано? (ID или название)",
                options=[],
                target={"field": "equipment", "mode": "merge", "transform": "equipment_list"},
            )

        if _needs_heat_params(n.title) and not (n.parameters or {}).get("heat"):
            add(
                f"cov_heat_{n.id}",
                n.id,
                "CRITICAL",
                "Нагрев/варка: какой режим/уровень (1–9), целевая температура/признак, время, критерий готовности?",
                options=[],
                target={"field": "parameters.heat", "mode": "set", "transform": "text"},
            )

        if _needs_disposition(n):
            add(
                f"cov_disposition_{n.id}",
                n.id,
                "CRITICAL",
                "После шага: куда девается продукт и инвентарь (остается/мойка/хранение/утилизация) + кто это делает?",
                options=[],
                target={"field": "disposition.note", "mode": "set", "transform": "text"},
            )

        t = (n.title or "").lower()

        if n.type == "decision":
            add(
                f"cov_decision_conditions_{n.id}",
                n.id,
                "VARIANT",
                "Условие: какие ветки? Перечисли варианты 'если X → Y' (порог/признак/критерий).",
                options=[],
                target={"field": "parameters.decision_conditions", "mode": "set", "transform": "text"},
            )

        if re.search(r"\bсильн(ый|о)\b|\bсредн(ий|е)\b|\bмедленн(о|ый)\b", t):
            add(
                f"cov_fire_scale_{n.id}",
                n.id,
                "AMBIG",
                "Огонь/темп размыто. Какая шкала на вашей плите (1–9) и какое значение?",
                options=[],
                target={"field": "parameters.fire_scale", "mode": "set", "transform": "text"},
            )

        if _is_loss(n):
            add(
                f"cov_loss_context_{n.id}",
                n.id,
                "LOSS",
                "Списание/потери: если есть нюансы (почему/кто/как обнаружили/что дальше) — допиши контекст.",
                options=[],
                target={"field": "parameters.loss_context", "mode": "set", "transform": "text"},
            )

        if _is_marking(n):
            add(
                f"cov_marking_who_{n.id}",
                n.id,
                "VARIANT",
                "Маркировка: кто делает (только бригадир?) и сколько времени на единицу/партию?",
                options=[],
                target={"field": "parameters.marking.who", "mode": "set", "transform": "text"},
            )
            add(
                f"cov_marking_what_{n.id}",
                n.id,
                "VARIANT",
                "Маркировка: что на этикетке (дата/время/партия/срок/ответственный), чем печатают, где хранят?",
                options=[],
                target={"field": "parameters.marking.what", "mode": "set", "transform": "text"},
            )

        if _is_wash(n):
            add(
                f"cov_wash_how_{n.id}",
                n.id,
                "VARIANT",
                "Мойка/санобработка: чем моем (средство), сколько времени, где сушим/храним, кто контролирует?",
                options=[],
                target={"field": "parameters.wash.how", "mode": "set", "transform": "text"},
            )
            add(
                f"cov_wash_exception_{n.id}",
                n.id,
                "VARIANT",
                "Мойка: что делаем, если нет места/очередь/оборудование занято?",
                options=[],
                target={"field": "parameters.wash.exception", "mode": "set", "transform": "text"},
            )

        if "масса" in t or "взвес" in t or "взвеш" in t:
            add(
                f"cov_weight_control_{n.id}",
                n.id,
                "VARIANT",
                "Контроль массы: целевой вес/допуск? Что делаем если больше/меньше (долив/уварка/списание)?",
                options=[],
                target={"field": "parameters.weight_control", "mode": "set", "transform": "text"},
            )

        if "раствор" in t or "растворил" in t:
            add(
                f"cov_dissolve_check_{n.id}",
                n.id,
                "VARIANT",
                "Растворение: как проверяем, что растворилось? Что делаем, если нет (мешать/температура/время)?",
                options=[],
                target={"field": "parameters.dissolve_check", "mode": "set", "transform": "text"},
            )

    return qs
EOF

mkdir -p "backend/app/validators"
cat > "backend/app/validators/disposition.py" <<'EOF'
from __future__ import annotations

from typing import List

from ..models import Node, Question


DISPOSITION_OPTIONS = [
    "Оставить на месте",
    "Вернуть на место хранения",
    "В мойку",
    "В санобработку/дезинфекцию",
    "Утилизировать/списать",
    "Другое",
]


def _needs_disposition_for_equipment(n: Node) -> bool:
    if n.type in ("decision", "fork", "join", "timer", "message"):
        return False
    eq = list(n.equipment or [])
    if not eq:
        return False
    disp = n.disposition or {}
    eq_actions = disp.get("equipment_actions") or {}
    if isinstance(eq_actions, dict) and len(eq_actions) > 0:
        return False
    return True


def build_disposition_questions(nodes: List[Node]) -> List[Question]:
    out: List[Question] = []
    for n in nodes:
        if not _needs_disposition_for_equipment(n):
            continue
        eq = [x.strip() for x in (n.equipment or []) if (x or "").strip()]
        eq_list = ", ".join(eq) if eq else "—"
        qid = f"disp_{n.id}"
        qtext = (
            f"После шага «{n.title}» что делаем с оборудованием: {eq_list}? "
            f"(выбери действие + при необходимости допиши пояснение)"
        )
        out.append(
            Question(
                id=qid,
                node_id=n.id,
                issue_type="CRITICAL",
                question=qtext,
                options=list(DISPOSITION_OPTIONS),
                target={"field": "disposition.equipment_actions", "mode": "set", "transform": "disposition_equipment_action"},
            )
        )
    return out
EOF

mkdir -p "backend/app/validators"
cat > "backend/app/validators/loss.py" <<'EOF'
from __future__ import annotations

from typing import List

from ..models import Node, Question


LOSS_WORDS = ("списан", "списание", "утилиз", "брак", "потер", "пролил", "вылил", "испор", "сгорел")


LOSS_REASON_OPTIONS = [
    "Нарушение технологии",
    "Ошибка персонала",
    "Брак сырья/поставки",
    "Переварили/сгорело/пересол",
    "Нарушение хранения/температуры",
    "Ошибка маркировки/этикетки",
    "Санитарные требования",
    "Другое",
]

RECORDED_IN_OPTIONS = [
    "Бумажный журнал",
    "1C/ERP/учётная система",
    "Таблица/Google Sheets",
    "Внутренний чат/сообщение",
    "Акт/фотофиксация",
    "Не фиксируется",
    "Другое",
]


def _is_loss(n: Node) -> bool:
    if n.type == "loss_event":
        return True
    t = (n.title or "").lower()
    return any(w in t for w in LOSS_WORDS)


def _loss_filled(n: Node) -> bool:
    p = n.parameters or {}
    loss = p.get("loss") or {}
    if not isinstance(loss, dict):
        return False
    ok = True
    ok = ok and bool((loss.get("reason") or "").strip())
    ok = ok and bool((loss.get("volume") or "").strip())
    ok = ok and bool((loss.get("approved_by") or "").strip())
    ok = ok and bool((loss.get("recorded_in") or "").strip())
    return ok


def build_loss_questions(nodes: List[Node]) -> List[Question]:
    out: List[Question] = []
    for n in nodes:
        if not _is_loss(n):
            continue

        p = n.parameters or {}
        loss = p.get("loss") if isinstance(p.get("loss"), dict) else {}
        reason = (loss.get("reason") or "").strip()
        volume = (loss.get("volume") or "").strip()
        approved_by = (loss.get("approved_by") or "").strip()
        recorded_in = (loss.get("recorded_in") or "").strip()
        evidence = (loss.get("evidence") or "").strip()

        if not reason:
            out.append(
                Question(
                    id=f"loss_reason_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Укажи причину (и при необходимости уточни).",
                    options=list(LOSS_REASON_OPTIONS),
                    target={"field": "parameters.loss.reason", "mode": "set", "transform": "text"},
                )
            )

        if not volume:
            out.append(
                Question(
                    id=f"loss_volume_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Сколько списали? (пример: 3 л, 1.5 кг, 2 шт)",
                    options=[],
                    target={"field": "parameters.loss.volume", "mode": "set", "transform": "text"},
                )
            )

        if not approved_by:
            out.append(
                Question(
                    id=f"loss_approved_by_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Кто утвердил списание? (роль/ФИО/должность)",
                    options=[],
                    target={"field": "parameters.loss.approved_by", "mode": "set", "transform": "text"},
                )
            )

        if not recorded_in:
            out.append(
                Question(
                    id=f"loss_recorded_in_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Где фиксируется списание?",
                    options=list(RECORDED_IN_OPTIONS),
                    target={"field": "parameters.loss.recorded_in", "mode": "set", "transform": "text"},
                )
            )

        if not evidence:
            out.append(
                Question(
                    id=f"loss_evidence_{n.id}",
                    node_id=n.id,
                    issue_type="MISSING",
                    question=f"Списание/потеря: «{n.title}». Какие доказательства/артефакты есть? (фото/акт/номер записи)",
                    options=[],
                    target={"field": "parameters.loss.evidence", "mode": "set", "transform": "text"},
                )
            )

    return out


def loss_report(nodes: List[Node]) -> dict:
    rows = []
    open_rows = []
    for n in nodes:
        if not _is_loss(n):
            continue
        loss = (n.parameters or {}).get("loss") or {}
        if not isinstance(loss, dict):
            loss = {}
        row = {
            "id": n.id,
            "title": n.title,
            "actor_role": n.actor_role,
            "loss": loss,
        }
        rows.append(row)
        if not _loss_filled(n):
            open_rows.append({"id": n.id, "title": n.title})
    return {"nodes": rows, "open": open_rows, "open_count": len(open_rows)}
EOF

mkdir -p "backend/app/static"
cat > "backend/app/static/app.js" <<'EOF'
let sessionId = null;
let sessionCache = null;

let overlayOpenNodeId = null;
let overlayOpenEl = null;
let overlayOpenAnchor = null;
let overlayOpenByNode = {};

function el(id) { return document.getElementById(id); }

function getLastSessionId() {
  const v = (localStorage.getItem("last_session_id") || "").trim();
  return v ? v : null;
}

function setSessionId(id) {
  sessionId = id || null;
  if (sessionId) localStorage.setItem("last_session_id", sessionId);
}

function clearSessionId() {
  sessionId = null;
  localStorage.removeItem("last_session_id");
}

function setTopbarError(msg) {
  const s = (msg || "").toString().trim();
  const meta = el("sessionMeta");
  if (meta) meta.textContent = s ? `error: ${s}` : "session: —";
}

async function api(path, method = "GET", body = null) {
  const opt = { method, headers: { "Content-Type": "application/json" } };
  if (body) opt.body = JSON.stringify(body);

  const r = await fetch(path, opt);

  const ct = (r.headers.get("content-type") || "").toLowerCase();
  let data = null;

  if (ct.includes("application/json")) {
    data = await r.json();
  } else {
    const t = await r.text();
    if (!r.ok) throw new Error(t || r.statusText);
    return t;
  }

  if (!r.ok) {
    const msg = (data && (data.detail || data.error)) ? (data.detail || data.error) : r.statusText;
    throw new Error(msg);
  }

  if (data && typeof data === "object" && data.error) {
    throw new Error(data.error);
  }

  return data;
}

function badge(type) {
  return `<span class="badge">${type}</span>`;
}

function selectedNodeIdFromHash() {
  const h = (window.location.hash || "").trim();
  const m = h.match(/node=([a-zA-Z0-9_]+)/);
  return m ? m[1] : null;
}

function setSelectedNodeId(nodeId) {
  window.location.hash = `node=${nodeId}`;
}

function getView() {
  const v = (localStorage.getItem("mermaid_view") || "lanes").trim();
  return (v === "simple") ? "simple" : "lanes";
}

function setView(v) {
  localStorage.setItem("mermaid_view", v);
}

function updateViewBtn() {
  const v = getView();
  el("btnView").textContent = (v === "lanes") ? "Вид: роли" : "Вид: простой";
}

function mermaidCodeForSession(s) {
  const v = getView();
  if (!s || !s.nodes || !s.nodes.length) return "flowchart TD\n  A[Нет шагов] --> B[Добавь заметки слева]\n";
  if (v === "simple") return s.mermaid_simple || s.mermaid || "";
  return s.mermaid_lanes || s.mermaid || "";
}

function _graphEls() {
  const wrap = el("graphWrap") || document.querySelector(".graphWrap");
  const inner = el("graphInner") || (wrap ? wrap.querySelector(".graphInner") : null);
  const overlay = el("graphOverlay") || (inner ? inner.querySelector(".graphOverlay") : null);
  return { wrap, inner, overlay };
}

function _getGraphSvg() {
  const { inner } = _graphEls();
  if (!inner) return null;
  const svg = inner.querySelector("svg");
  return svg || null;
}

function _closeOverlayPopover() {
  overlayOpenNodeId = null;
  overlayOpenAnchor = null;
  if (overlayOpenEl && overlayOpenEl.parentNode) overlayOpenEl.parentNode.removeChild(overlayOpenEl);
  overlayOpenEl = null;
}

function _buildQuestionIndex(s) {
  const idx = {};
  (s && s.questions ? s.questions : []).forEach(q => {
    if (!q) return;
    const nid = (q.node_id || '').toString().trim();
    if (!nid) return;
    if (!idx[nid]) idx[nid] = { open: [], answered: [] };
    const orphaned = !!q.orphaned;
    if (q.status === 'open' && !orphaned) idx[nid].open.push(q);
    if (q.status === 'answered') idx[nid].answered.push(q);
  });
  return idx;
}

function _groupOpenQuestionsByNode(s) {
  const idx = _buildQuestionIndex(s);
  const by = {};
  Object.keys(idx).forEach(nid => {
    const open = idx[nid].open || [];
    if (open.length) by[nid] = open;
  });
  return by;
}

function _toneForNodeQuestions(qs) {
  const types = (qs || []).map(q => (q.issue_type || "").toString().toLowerCase());
  if (types.includes("critical")) return "critical";
  if (types.includes("missing")) return "missing";
  if (types.includes("ambig")) return "ambig";
  return "ambig";
}

function _findAnchorForNode(svg, nodeId) {
  const wanted = `#node=${nodeId}`;
  const links = svg.querySelectorAll("a");
  for (const a of links) {
    const href = a.getAttribute("href") || a.getAttribute("xlink:href") || "";
    if (href === wanted) return a;
  }
  return null;
}

function _rectWithinInner(elem, inner) {
  const r = elem.getBoundingClientRect();
  const ir = inner.getBoundingClientRect();
  return {
    x: r.left - ir.left,
    y: r.top - ir.top,
    w: r.width,
    h: r.height,
    r
  };
}

function _clamp(v, a, b) {
  if (v < a) return a;
  if (v > b) return b;
  return v;
}

function _openOverlayPopover(nodeId, stats, anchorRect) {
  const { overlay, inner } = _graphEls();
  if (!overlay || !inner) return;

  _closeOverlayPopover();

  overlayOpenNodeId = nodeId;
  overlayOpenAnchor = anchorRect;

  const openQs = (stats && stats.open) ? stats.open : [];
  const answeredN = (stats && stats.answered) ? stats.answered.length : 0;

  const pop = document.createElement('div');
  pop.className = 'qPopover';
  pop.style.visibility = 'hidden';

  const title = `Узел ${nodeId}: open ${openQs.length}${answeredN ? ` • answered ${answeredN}` : ''}`;
  pop.innerHTML = `
    <div class="qPopoverTop">
      <div class="qPopoverTitle">${title}</div>
      <button class="qPopoverClose" id="qPopClose">Закрыть</button>
    </div>
    <div id="qPopList"></div>
  `;

  const list = pop.querySelector('#qPopList');

  (openQs || []).slice(0, 40).forEach(q => {
    const opts = (q.options && q.options.length) ? q.options.slice(0, 12) : [];
    const useButtons = opts.length > 0 && opts.length <= 6;

    const optButtons = useButtons
      ? `<div class="qOptRow">
          ${opts.map(o => `<button class="qOptBtn" data-act="opt" data-qid="${q.id}" data-val="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}
         </div>`
      : '';

    const optSelect = (!useButtons && opts.length)
      ? `<select data-qid="${q.id}">
           <option value="">—</option>
           ${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
         </select>`
      : '';

    const item = document.createElement('div');
    item.className = 'qPopItem';
    item.innerHTML = `
      <div class="qTop">
        <div>${badge(q.issue_type)} <span class="small" style="opacity:.85;">${q.id}</span></div>
        <div class="small" style="opacity:.65;">open</div>
      </div>
      <div class="qText">${q.question}</div>
      ${optButtons}
      <div class="qActions">
        ${optSelect}
        <input data-qid="${q.id}" placeholder="ответ..." />
        <button data-act="answer" data-qid="${q.id}">Ответить</button>
      </div>
    `;
    list.appendChild(item);
  });

  overlay.appendChild(pop);
  overlayOpenEl = pop;

  const ow = overlay.clientWidth || 600;
  const oh = overlay.clientHeight || 400;

  const pw = pop.offsetWidth || 320;
  const ph = pop.offsetHeight || 260;

  const pad = 8;

  const ax = anchorRect ? anchorRect.x : 20;
  const ay = anchorRect ? anchorRect.y : 20;
  const aw = anchorRect ? anchorRect.w : 0;
  const ah = anchorRect ? anchorRect.h : 0;

  const cand = [
    { x: ax + aw + 12, y: ay - 6 },
    { x: ax - pw - 12, y: ay - 6 },
    { x: ax + aw + 12, y: ay + ah - 22 },
    { x: ax - pw - 12, y: ay + ah - 22 },
  ];

  let chosen = null;
  for (const c of cand) {
    const okX = c.x >= pad && (c.x + pw) <= (ow - pad);
    const okY = c.y >= pad && (c.y + ph) <= (oh - pad);
    if (okX && okY) { chosen = c; break; }
  }

  let left = chosen ? chosen.x : (anchorRect ? (ax + aw + 12) : 20);
  let top = chosen ? chosen.y : (anchorRect ? (ay - 6) : 20);

  left = _clamp(left, pad, Math.max(pad, ow - pw - pad));
  top = _clamp(top, pad, Math.max(pad, oh - ph - pad));

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = 'visible';

  const closeBtn = pop.querySelector('#qPopClose');
  closeBtn.addEventListener('click', () => _closeOverlayPopover());

  pop.querySelectorAll('button[data-act="opt"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const qid = btn.getAttribute('data-qid');
      const val = btn.getAttribute('data-val') || '';
      if (!val) return;

      await api(`/api/sessions/${sessionId}/answers`, 'POST', { node_id: nodeId, question_id: qid, answer: val });
      await refresh({ keepPopoverFor: nodeId });
    });
  });

  pop.querySelectorAll('button[data-act="answer"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const qid = btn.getAttribute('data-qid');
      const inp = pop.querySelector(`input[data-qid="${qid}"]`);
      const sel = pop.querySelector(`select[data-qid="${qid}"]`);
      const val = (sel && sel.value) ? sel.value : (inp ? inp.value : '');
      if (!val) return;

      await api(`/api/sessions/${sessionId}/answers`, 'POST', { node_id: nodeId, question_id: qid, answer: val });
      await refresh({ keepPopoverFor: nodeId });
    });
  });

  setTimeout(() => {
    const onDoc = (e) => {
      if (!overlayOpenEl) return;
      const t = e.target;
      if (!t) return;
      if (overlayOpenEl.contains(t)) return;
      if (t.closest && t.closest('.nodeBadgeBtn')) return;
      _closeOverlayPopover();
      document.removeEventListener('mousedown', onDoc, true);
    };
    document.addEventListener('mousedown', onDoc, true);
  }, 0);
}


function _renderInlineQuestions(s) {
  const { overlay, inner } = _graphEls();
  if (!overlay || !inner) return;

  overlay.innerHTML = '';

  const idx = _buildQuestionIndex(s);
  overlayOpenByNode = {};
  Object.keys(idx).forEach(nid => {
    if (idx[nid] && idx[nid].open && idx[nid].open.length) overlayOpenByNode[nid] = idx[nid].open;
  });

  const svg = _getGraphSvg();
  if (!svg) return;

  const keys = Object.keys(overlayOpenByNode).slice(0, 200);
  for (const nodeId of keys) {
    const openQs = overlayOpenByNode[nodeId] || [];
    if (!openQs.length) continue;

    const stats = idx[nodeId] || { open: openQs, answered: [] };
    const answeredN = (stats.answered || []).length;

    const a = _findAnchorForNode(svg, nodeId);
    if (!a) continue;

    const tgt = a.querySelector('g') || a;
    const rect = _rectWithinInner(tgt, inner);

    const tone = _toneForNodeQuestions(openQs);

    const holder = document.createElement('div');
    holder.className = 'nodeBadge';
    holder.style.left = `${rect.x + rect.w - 10}px`;
    holder.style.top = `${rect.y - 10}px`;

    const label = answeredN ? `${answeredN}/${openQs.length}` : `${openQs.length}`;
    const title = answeredN
      ? `answered: ${answeredN} • open: ${openQs.length}`
      : `open: ${openQs.length}`;

    holder.innerHTML = `<button class="nodeBadgeBtn tone-${tone}" data-node="${nodeId}" title="${title}">${label}</button>`;
    overlay.appendChild(holder);

    const btn = holder.querySelector('button');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _openOverlayPopover(nodeId, stats, rect);
      setSelectedNodeId(nodeId);
    });
  }

  const selected = selectedNodeIdFromHash();
  if (selected && idx[selected] && idx[selected].open && idx[selected].open.length) {
    const a = _findAnchorForNode(svg, selected);
    const tgt = a ? (a.querySelector('g') || a) : null;
    if (tgt) {
      const rect = _rectWithinInner(tgt, inner);
      _openOverlayPopover(selected, idx[selected], rect);
    }
  }
}


async function renderMermaid(code) {
  const m = el("mermaid");
  const { inner } = _graphEls();
  if (inner) inner.scrollTop = inner.scrollTop;

  m.removeAttribute("data-processed");
  m.textContent = code || "flowchart TD\n  A[Нет данных] --> B[Начни вводить заметки]\n";
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

  try {
    const res = mermaid.run({ nodes: [m] });
    if (res && typeof res.then === "function") await res;
  } catch (e) {
    console.error(e);
  }
}

function renderResources(s) {
  const wrap = el("resources");
  const r = (s && s.resources) ? s.resources : null;
  if (!wrap) return;
  if (!r) {
    wrap.innerHTML = `<div class="small">Нет данных</div>`;
    return;
  }
  const eq = (r.equipment || []).slice(0, 50);
  const conflicts = (r.conflict_nodes || []).length;

  const eqHtml = eq.length
    ? eq.map(item => {
        const id = String(item.equipment_id || "");
        const intervals = item.intervals || [];
        const confs = item.conflicts || [];
        const head = `<div class="small"><b>${id}</b> • интервалов: ${intervals.length} • конфликтов: ${confs.length}</div>`;

        const confHtml = confs.slice(0, 5).map(c => {
          const a = c.a || {};
          const b = c.b || {};
          return `<div class="small" style="margin-top:4px;">
                    ${badge("VARIANT")}
                    <a class="link" href="#node=${a.node_id}">${a.node_id}</a> (${a.actor_role}, ${a.start_min}-${a.end_min})
                    ↔
                    <a class="link" href="#node=${b.node_id}">${b.node_id}</a> (${b.actor_role}, ${b.start_min}-${b.end_min})
                  </div>`;
        }).join("");

        const intsHtml = intervals.slice(0, 6).map(x => {
          return `<div class="small" style="opacity:.85;">
                    <a class="link" href="#node=${x.node_id}">${x.node_id}</a> • ${x.actor_role} • ${x.start_min}-${x.end_min} мин
                  </div>`;
        }).join("");

        return `<div style="padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:10px;margin-top:8px;">
                  ${head}
                  ${confs.length ? `<div class="small" style="margin-top:6px;opacity:.85;"><b>Конфликты (top)</b></div>${confHtml}` : ""}
                  <div class="small" style="margin-top:6px;opacity:.85;"><b>Интервалы (top)</b></div>
                  ${intsHtml || `<div class="small">—</div>`}
                </div>`;
      }).join("")
    : `<div class="small">Оборудование не задано в узлах</div>`;

  wrap.innerHTML = `
    <div class="small"><b>Оборудование</b>: ${eq.length} • конфликтных узлов: ${conflicts}</div>
    <div class="small" style="opacity:.75;">Конфликт = возможное пересечение по времени или неизвестная длительность</div>
    ${eqHtml}
  `;
}

function _parseEquipList(equipStr) {
  return (equipStr || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function _safeJsonParse(s) {
  try {
    return JSON.parse((s || "").trim() || "{}");
  } catch (e) {
    return null;
  }
}

function _renderDispositionQuickUI(equipList, dispObj) {
  const actions = [
    ["leave", "Оставить"],
    ["return_storage", "Вернуть"],
    ["wash", "Мойка"],
    ["sanitize", "Санобработка"],
    ["dispose", "Утилизация"],
  ];

  const current = (dispObj && dispObj.equipment_actions && typeof dispObj.equipment_actions === "object")
    ? dispObj.equipment_actions
    : {};

  const rows = equipList.slice(0, 8).map(eq => {
    const cur = current[eq] || "";
    const btns = actions.map(([code, label]) => {
      const active = (cur === code) ? `style="opacity:1;border:1px solid rgba(0,0,0,.25)"` : `style="opacity:.85"`;
      return `<button data-eq="${eq}" data-act="${code}" ${active}>${label}</button>`;
    }).join("");
    return `<div class="small" style="margin-top:6px;">
              <b>${eq}</b>
              <div class="row" style="margin-top:6px;gap:6px;flex-wrap:wrap;">${btns}</div>
            </div>`;
  }).join("");

  return `
    <div style="padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:10px;margin-top:8px;">
      <div class="small"><b>После шага: оборудование</b> (быстрое действие)</div>
      <div class="small" style="opacity:.75;">Клик по действию заполнит disposition.equipment_actions</div>
      ${rows || `<div class="small">Оборудование не задано</div>`}
      <div class="small" style="margin-top:10px;"><b>Комментарий</b></div>
      <input id="disp_note" class="grow" placeholder="например: протереть и оставить рядом" value="${(dispObj && dispObj.note ? String(dispObj.note) : "").replace(/"/g, "&quot;")}" />
      <div class="row" style="margin-top:8px;gap:8px;">
        <button id="disp_apply_note">Применить комментарий</button>
        <button id="disp_clear">Очистить disposition</button>
      </div>
    </div>
  `;
}

function _renderLossQuickUI(nodeType, paramsObj) {
  if (nodeType !== "loss_event") return "";
  const loss = (paramsObj && paramsObj.loss && typeof paramsObj.loss === "object") ? paramsObj.loss : {};
  const reason = loss.reason ? String(loss.reason) : "";
  const volume = loss.volume ? String(loss.volume) : "";
  const approved = loss.approved_by ? String(loss.approved_by) : "";
  const recorded = loss.recorded_in ? String(loss.recorded_in) : "";
  const evidence = loss.evidence ? String(loss.evidence) : "";

  return `
    <div style="padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:10px;margin-top:10px;">
      <div class="small"><b>Списание/потеря (loss)</b></div>

      <div class="insRow" style="margin-top:8px;">
        <label>reason</label>
        <input id="loss_reason" class="grow" value="${reason.replace(/"/g, "&quot;")}" placeholder="причина (можно текстом)" />
      </div>

      <div class="insRow">
        <label>volume</label>
        <input id="loss_volume" class="grow" value="${volume.replace(/"/g, "&quot;")}" placeholder="пример: 3 л, 1.5 кг, 2 шт" />
      </div>

      <div class="insRow">
        <label>approved</label>
        <input id="loss_approved" class="grow" value="${approved.replace(/"/g, "&quot;")}" placeholder="кто утвердил (роль/ФИО)" />
      </div>

      <div class="insRow">
        <label>recorded</label>
        <input id="loss_recorded" class="grow" value="${recorded.replace(/"/g, "&quot;")}" placeholder="где фиксируется (журнал/1C/...)"/>
      </div>

      <div class="insRow">
        <label>evidence</label>
        <input id="loss_evidence" class="grow" value="${evidence.replace(/"/g, "&quot;")}" placeholder="фото/акт/номер записи"/>
      </div>

      <div class="row" style="margin-top:8px;gap:8px;">
        <button id="loss_apply">Применить loss</button>
        <button id="loss_clear">Очистить loss</button>
      </div>
    </div>
  `;
}

function renderInspector(s) {
  const wrap = el("inspector");
  if (!wrap) return;

  if (!s || !s.nodes) {
    wrap.innerHTML = `<div class="small">Нет данных</div>`;
    return;
  }
  const nodeId = selectedNodeIdFromHash() || (s.nodes[0] ? s.nodes[0].id : null);
  if (!nodeId) {
    wrap.innerHTML = `<div class="small">Нет узлов</div>`;
    return;
  }

  const n = s.nodes.find(x => x.id === nodeId);
  if (!n) {
    wrap.innerHTML = `<div class="small">Узел не найден</div>`;
    return;
  }

  const roles = (s.roles || []).slice();
  if (!roles.includes("")) roles.unshift("");

  const typeOptions = ["step","decision","fork","join","loss_event","timer","message"];

  const sched = (n.parameters && n.parameters._sched) ? n.parameters._sched : null;
  const schedLine = sched ? `<div class="small" style="opacity:.85;">⏱ ${sched.start_min}-${sched.end_min} мин</div>` : "";

  const conflict = (n.parameters && n.parameters._res_conflict) ? `<div class="small" style="margin-top:6px;">${badge("VARIANT")} возможный конфликт оборудования</div>` : "";

  const params = JSON.stringify(n.parameters || {}, null, 2);
  const disp = JSON.stringify(n.disposition || {}, null, 2);

  const equipCsv = (n.equipment || []).join(", ");
  const equipList = _parseEquipList(equipCsv);
  const dispObj = (n.disposition && typeof n.disposition === "object") ? n.disposition : {};
  const paramsObj = (n.parameters && typeof n.parameters === "object") ? n.parameters : {};

  wrap.innerHTML = `
    <div class="small">ID: <b>${n.id}</b></div>
    ${schedLine}
    ${conflict}

    <div class="insRow">
      <label>title</label>
      <input id="ins_title" class="grow" value="${(n.title || "").replace(/"/g, "&quot;")}" />
    </div>

    <div class="insRow">
      <label>type</label>
      <select id="ins_type" class="grow">
        ${typeOptions.map(t => `<option value="${t}" ${t===n.type ? "selected" : ""}>${t}</option>`).join("")}
      </select>
    </div>

    <div class="insRow">
      <label>actor</label>
      <select id="ins_actor" class="grow">
        ${roles.map(r => `<option value="${r}" ${r=== (n.actor_role || "") ? "selected" : ""}>${r || "—"}</option>`).join("")}
      </select>
    </div>

    <div class="insRow">
      <label>equip</label>
      <input id="ins_equip" class="grow" value="${equipCsv.replace(/"/g, "&quot;")}" placeholder="kotel_1, skovoroda_1" />
    </div>

    <div class="insRow">
      <label>duration</label>
      <input id="ins_dur" class="grow" value="${n.duration_min ?? ""}" placeholder="минуты" />
    </div>

    ${_renderDispositionQuickUI(equipList, dispObj)}
    ${_renderLossQuickUI(n.type, paramsObj)}

    <div class="small" style="margin-top:10px;">parameters (JSON)</div>
    <textarea id="ins_params" class="insTextarea">${params}</textarea>

    <div class="small">disposition (JSON)</div>
    <textarea id="ins_disp" class="insTextarea">${disp}</textarea>

    <div class="insRow" style="margin-top:8px;">
      <button id="ins_save">Сохранить узел</button>
      <span class="small">клик по узлу на схеме открывает инспектор</span>
    </div>
  `;

  const saveNode = async () => {
    const payload = {};
    payload.title = document.getElementById("ins_title").value;
    payload.type = document.getElementById("ins_type").value;
    payload.actor_role = document.getElementById("ins_actor").value || null;

    const equipStr = document.getElementById("ins_equip").value || "";
    payload.equipment = _parseEquipList(equipStr);

    const durStr = (document.getElementById("ins_dur").value || "").trim();
    payload.duration_min = durStr ? parseInt(durStr, 10) : null;

    const pObj = _safeJsonParse(document.getElementById("ins_params").value);
    const dObj = _safeJsonParse(document.getElementById("ins_disp").value);
    if (pObj === null || dObj === null) {
      alert("JSON ошибка в parameters/disposition");
      return;
    }
    payload.parameters = pObj;
    payload.disposition = dObj;

    await api(`/api/sessions/${sessionId}/nodes/${n.id}`, "POST", payload);
    await refresh();
    setSelectedNodeId(n.id);
  };

  document.getElementById("ins_save").addEventListener("click", saveNode);

  wrap.querySelectorAll('button[data-eq][data-act]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const eq = btn.getAttribute("data-eq");
      const act = btn.getAttribute("data-act");
      const dispText = document.getElementById("ins_disp").value;
      const dObj = _safeJsonParse(dispText);
      if (dObj === null) {
        alert("JSON ошибка в disposition");
        return;
      }
      dObj.equipment_actions = dObj.equipment_actions && typeof dObj.equipment_actions === "object" ? dObj.equipment_actions : {};
      dObj.equipment_actions[eq] = act;
      const note = document.getElementById("disp_note").value || "";
      if (note.trim()) dObj.note = note.trim();
      document.getElementById("ins_disp").value = JSON.stringify(dObj, null, 2);
      await saveNode();
    });
  });

  const noteBtn = document.getElementById("disp_apply_note");
  if (noteBtn) {
    noteBtn.addEventListener("click", async () => {
      const dispText = document.getElementById("ins_disp").value;
      const dObj = _safeJsonParse(dispText);
      if (dObj === null) {
        alert("JSON ошибка в disposition");
        return;
      }
      const note = document.getElementById("disp_note").value || "";
      if (note.trim()) dObj.note = note.trim();
      document.getElementById("ins_disp").value = JSON.stringify(dObj, null, 2);
      await saveNode();
    });
  }

  const clearBtn = document.getElementById("disp_clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      document.getElementById("ins_disp").value = "{}";
      document.getElementById("disp_note").value = "";
      await saveNode();
    });
  }

  const lossApply = document.getElementById("loss_apply");
  if (lossApply) {
    lossApply.addEventListener("click", async () => {
      const pText = document.getElementById("ins_params").value;
      const pObj = _safeJsonParse(pText);
      if (pObj === null) {
        alert("JSON ошибка в parameters");
        return;
      }
      pObj.loss = pObj.loss && typeof pObj.loss === "object" ? pObj.loss : {};
      pObj.loss.reason = document.getElementById("loss_reason").value || "";
      pObj.loss.volume = document.getElementById("loss_volume").value || "";
      pObj.loss.approved_by = document.getElementById("loss_approved").value || "";
      pObj.loss.recorded_in = document.getElementById("loss_recorded").value || "";
      pObj.loss.evidence = document.getElementById("loss_evidence").value || "";
      document.getElementById("ins_params").value = JSON.stringify(pObj, null, 2);
      await saveNode();
    });
  }

  const lossClear = document.getElementById("loss_clear");
  if (lossClear) {
    lossClear.addEventListener("click", async () => {
      const pText = document.getElementById("ins_params").value;
      const pObj = _safeJsonParse(pText);
      if (pObj === null) {
        alert("JSON ошибка в parameters");
        return;
      }
      delete pObj.loss;
      document.getElementById("ins_params").value = JSON.stringify(pObj, null, 2);
      await saveNode();
    });
  }
}

async function refresh() {
  const { overlay } = _graphEls();
  if (!sessionId) {
    setTopbarError("нет sessionId");
    sessionCache = null;
    _closeOverlayPopover();
    if (overlay) overlay.innerHTML = "";
    await renderMermaid(mermaidCodeForSession(null));
    renderResources(null);
    renderInspector(null);
    return;
  }

  try {
    const s = await api(`/api/sessions/${sessionId}`);
    sessionCache = s;
    el("sessionMeta").textContent = `session: ${s.id} • ${s.title} • v${s.version}`;
    updateViewBtn();

    await renderMermaid(mermaidCodeForSession(s));
    renderResources(s);
    renderInspector(s);
    _renderInlineQuestions(s);
  } catch (e) {
    setTopbarError(e.message || String(e));
    throw e;
  }
}

async function autoBootstrapSession() {
  const last = getLastSessionId();
  if (last) {
    setSessionId(last);
    try {
      await refresh();
      return;
    } catch (e) {
      clearSessionId();
    }
  }

  const s = await api("/api/sessions", "POST", { title: "Новый процесс", roles: ["cook_1","cook_2","brigadir","technolog"] });
  setSessionId(s.id);
  await refresh();
}

async function newSession() {
  const title = prompt("Название процесса:", "Новый процесс");
  const t = (title || "").trim() || "Новый процесс";

  const rolesStr = prompt("Роли (через запятую):", "cook_1,cook_2,brigadir,technolog");
  const roles = (rolesStr || "").split(",").map(x => x.trim()).filter(Boolean);

  const s = await api("/api/sessions", "POST", { title: t, roles: roles.length ? roles : undefined });
  setSessionId(s.id);
  _closeOverlayPopover();
  await refresh();
}

async function sendNotes() {
  if (!sessionId) {
    await autoBootstrapSession();
  }
  const notes = el("notes").value || "";
  if (!notes.trim()) return;
  await api(`/api/sessions/${sessionId}/notes`, "POST", { notes });
  _closeOverlayPopover();
  await refresh();
}

async function exportSession() {
  if (!sessionId) {
    await autoBootstrapSession();
  }
  const r = await api(`/api/sessions/${sessionId}/export`, "POST", {});
  alert(`Экспортировано: ${r.exported_to}`);
}

el("btnNew").addEventListener("click", () => newSession().catch(e => alert(e.message || String(e))));
el("btnSend").addEventListener("click", () => sendNotes().catch(e => alert(e.message || String(e))));
el("btnExport").addEventListener("click", () => exportSession().catch(e => alert(e.message || String(e))));

el("btnView").addEventListener("click", () => {
  const v = getView();
  setView(v === "lanes" ? "simple" : "lanes");
  updateViewBtn();
  if (sessionCache) {
    renderMermaid(mermaidCodeForSession(sessionCache)).then(() => _renderInlineQuestions(sessionCache));
  }
});

window.addEventListener("hashchange", () => {
  if (sessionCache) {
    renderInspector(sessionCache);
    _renderInlineQuestions(sessionCache);
  }
});

document.addEventListener("click", (e) => {
  if (!overlayOpenEl) return;
  if (overlayOpenEl.contains(e.target)) return;
  const btn = e.target && e.target.closest ? e.target.closest(".nodeBadgeBtn") : null;
  if (btn) return;
  _closeOverlayPopover();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") _closeOverlayPopover();
});

window.addEventListener("resize", () => {
  if (sessionCache) _renderInlineQuestions(sessionCache);
});

(async () => {
  if (!localStorage.getItem("mermaid_view")) setView("lanes");
  updateViewBtn();
  try {
    await autoBootstrapSession();
  } catch (e) {
    setTopbarError(e.message || String(e));
  }
})();
EOF

mkdir -p "backend/app/static"
cat > "backend/app/static/styles.css" <<'EOF'
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background: #0b0f19; color: #e8eefc; }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); }
.brand { font-weight: 700; letter-spacing: .2px; }
.meta { display: flex; gap: 10px; align-items: center; }
button { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); color: #e8eefc; padding: 8px 10px; border-radius: 10px; cursor: pointer; }
button:hover { background: rgba(255,255,255,.12); }
.layout { display: grid; grid-template-columns: 1.1fr 1.4fr 1fr; gap: 12px; padding: 12px; }
.panel { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.10); border-radius: 16px; padding: 10px; min-height: calc(100vh - 70px); display: flex; flex-direction: column; }
.panelTitle { font-weight: 650; margin-bottom: 8px; opacity: .95; }
textarea { width: 100%; flex: 1; min-height: 280px; resize: vertical; padding: 10px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e8eefc; outline: none; }
.row { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
.hint { font-size: 12px; opacity: .7; }

.graphWrap { flex: 1; border-radius: 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.18); padding: 8px; overflow: auto; }
.graphInner { position: relative; display: inline-block; min-width: 100%; min-height: 100%; }
.graphOverlay { position: absolute; left: 0; top: 0; right: 0; bottom: 0; pointer-events: none; z-index: 3; }

.nodeBadge { position: absolute; pointer-events: auto; z-index: 4; }
.nodeBadgeBtn { padding: 3px 7px; border-radius: 999px; font-size: 11px; line-height: 1; border: 1px solid rgba(255,255,255,.20); background: rgba(255,255,255,.10); }
.nodeBadgeBtn:hover { background: rgba(255,255,255,.14); }

.nodeBadgeBtn.tone-critical { border-color: rgba(255,91,91,.65); background: rgba(255,91,91,.12); }
.nodeBadgeBtn.tone-missing { border-color: rgba(255,184,0,.65); background: rgba(255,184,0,.12); }
.nodeBadgeBtn.tone-ambig { border-color: rgba(59,130,246,.65); background: rgba(59,130,246,.12); }

.qPopover { position: absolute; width: 320px; max-height: 360px; overflow: auto; border-radius: 14px; padding: 10px; background: rgba(8,10,14,.92); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 14px 38px rgba(0,0,0,.45); pointer-events: auto; z-index: 5; }
.qPopoverTop { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 8px; }
.qPopoverTitle { font-weight: 650; font-size: 13px; opacity: .95; }
.qPopoverClose { padding: 6px 8px; border-radius: 10px; }
.qPopItem { border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); border-radius: 12px; padding: 10px; margin-top: 8px; }
.qTop { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.badge { font-size: 11px; padding: 3px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.16); opacity: .9; }
.qText { margin: 8px 0; line-height: 1.35; }
.qActions { display: flex; gap: 8px; align-items: center; }
input { flex: 1; padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e8eefc; outline: none; }
select { padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e8eefc; outline: none; }

.inspector { border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.18); border-radius: 14px; padding: 10px; min-height: 210px; }
.insRow { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.insRow label { width: 92px; font-size: 12px; opacity: .75; }
.insRow .grow { flex: 1; }
.insTextarea { width: 100%; min-height: 70px; resize: vertical; padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color: #e8eefc; outline: none; }
.small { font-size: 12px; opacity: .7; }
.link { color: #b8c7ff; text-decoration: none; }
.link:hover { text-decoration: underline; }

.qOptRow { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.qOptBtn { padding: 6px 8px; border-radius: 10px; font-size: 12px; line-height: 1; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); }
.qOptBtn:hover { background: rgba(255,255,255,.10); }
EOF

echo "== sanity =="
python -m py_compile backend/app/main.py backend/app/models.py backend/app/validators/coverage.py backend/app/validators/disposition.py backend/app/validators/loss.py || true
git diff --stat || true

echo "== commit =="
git add backend/app/main.py backend/app/models.py backend/app/validators/coverage.py backend/app/validators/disposition.py backend/app/validators/loss.py backend/app/static/app.js backend/app/static/styles.css
git commit -m "feat(step15): apply answers to node fields; inline UX v2" || true
git tag -a "cp/foodproc_step15_applyanswers_after_${TS}" -m "checkpoint: after step15 applyanswers (${TS})" || true

echo "== docker compose up =="
HOST_PORT="${HOST_PORT:-8011}"
lsof -nP -iTCP:"${HOST_PORT}" -sTCP:LISTEN || true
docker compose up -d --build

echo "== probe =="
sleep 1
curl -s -o /dev/null -w "%{http_code}
" "http://127.0.0.1:${HOST_PORT}/" || true
curl -s -o /dev/null -w "%{http_code}
" "http://127.0.0.1:${HOST_PORT}/api/sessions" || true

echo "== done =="
git status -sb || true
git show -s --format='%ci %h %d %s' HEAD || true
