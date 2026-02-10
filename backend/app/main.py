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

class LLMSettingsIn(BaseModel):
    provider: str = "deepseek"
    api_key: str = ""
    base_url: str = ""


class LLMSettingsOut(BaseModel):
    provider: str
    has_key: bool
    base_url: str = ""



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

@app.get("/api/settings/llm")
def get_llm_settings() -> Dict[str, Any]:
    st = get_storage()
    provider = st.load_llm_settings().get("provider") or "deepseek"
    base_url = st.get_llm_base_url() or (st.load_llm_settings().get("base_url") or "")
    has_key = bool(st.get_llm_api_key())
    return LLMSettingsOut(provider=provider, has_key=has_key, base_url=base_url).model_dump()


@app.post("/api/settings/llm")
def set_llm_settings(inp: LLMSettingsIn) -> Dict[str, Any]:
    st = get_storage()
    provider = (inp.provider or "deepseek").strip() or "deepseek"
    api_key = (inp.api_key or "").strip()
    base_url = (inp.base_url or "").strip()
    st.save_llm_settings(provider=provider, api_key=api_key, base_url=base_url)
    provider_out = st.load_llm_settings().get("provider") or "deepseek"
    base_url_out = st.get_llm_base_url() or (st.load_llm_settings().get("base_url") or "")
    has_key = bool(st.get_llm_api_key())
    return LLMSettingsOut(provider=provider_out, has_key=has_key, base_url=base_url_out).model_dump()



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

    api_key = st.get_llm_api_key()
    base_url = st.get_llm_base_url()
    extracted = extract_process(s.notes, api_key=api_key, base_url=base_url)
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
