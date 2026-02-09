from __future__ import annotations

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
from .models import Node, Edge, Session
from .storage import get_storage
from .validators.coverage import build_questions


app = FastAPI(title="Food Process Copilot MVP")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
WORKSPACE = Path(os.environ.get("PROCESS_WORKSPACE", "workspace/processes"))

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class CreateSessionIn(BaseModel):
    title: str
    roles: Optional[List[str]] = None


class NotesIn(BaseModel):
    notes: str


class AnswerIn(BaseModel):
    question_id: str
    answer: str


class NodePatchIn(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    actor_role: Optional[str] = None
    recipient_role: Optional[str] = None
    equipment: Optional[List[str]] = None
    duration_min: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    disposition: Optional[Dict[str, Any]] = None


@app.get("/")
def index() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/favicon.ico")
def favicon() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "favicon.ico"))


@app.post("/api/sessions")
def create_session(inp: CreateSessionIn) -> Dict[str, Any]:
    sid = uuid.uuid4().hex[:10]
    roles = inp.roles or ["cook_1", "cook_2", "brigadir"]
    s = Session(id=sid, title=inp.title, roles=roles, version=1)
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


@app.post("/api/sessions/{session_id}/notes")
def post_notes(session_id: str, inp: NotesIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    s.notes = inp.notes

    extracted = extract_process(s.notes)
    nodes_raw = extracted.get("nodes", [])
    edges_raw = extracted.get("edges", [])
    roles = extracted.get("roles", []) or s.roles

    nodes = [Node.model_validate(nr) for nr in nodes_raw]
    edges = [Edge.model_validate(er) for er in edges_raw]

    s.roles = roles
    s.nodes = nodes
    s.edges = edges

    s.questions = build_questions(s.nodes)
    s.mermaid = render_mermaid(s.nodes, s.edges, roles=s.roles)
    s.version += 1

    st.save(s)
    return s.model_dump()


@app.post("/api/sessions/{session_id}/answer")
def answer(session_id: str, inp: AnswerIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    q = next((x for x in s.questions if x.id == inp.question_id), None)
    if not q:
        return {"error": "question not found"}

    q.status = "answered"
    q.answer = inp.answer

    node = next((n for n in s.nodes if n.id == q.node_id), None)
    if node:
        lowq = (q.question or "").lower()
        if "куда" in lowq or "после" in lowq:
            node.disposition = {"note": inp.answer}
        elif "кто" in lowq:
            node.actor_role = inp.answer.strip()
        elif "оборуд" in lowq:
            node.equipment = [x.strip() for x in re.split(r"[,\n;]+", inp.answer) if x.strip()]
        elif q.issue_type in ("CRITICAL", "MISSING"):
            node.parameters["note"] = inp.answer
        else:
            node.exceptions.append({"note": inp.answer})

    s.questions = build_questions(s.nodes)
    s.mermaid = render_mermaid(s.nodes, s.edges, roles=s.roles)
    s.version += 1

    st.save(s)
    return s.model_dump()


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
        node.title = data["title"]
    if "type" in data:
        node.type = data["type"]
    if "actor_role" in data:
        node.actor_role = data["actor_role"] or None
    if "recipient_role" in data:
        node.recipient_role = data["recipient_role"] or None
    if "equipment" in data and data["equipment"] is not None:
        node.equipment = data["equipment"]
    if "duration_min" in data:
        node.duration_min = data["duration_min"]
    if "parameters" in data and data["parameters"] is not None:
        node.parameters = data["parameters"]
    if "disposition" in data and data["disposition"] is not None:
        node.disposition = data["disposition"]

    s.questions = build_questions(s.nodes)
    s.mermaid = render_mermaid(s.nodes, s.edges, roles=s.roles)
    s.version += 1

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
    (out_dir / "diagram.mmd").write_text(s.mermaid or "", encoding="utf-8")

    equipment = {
        "kitchen_id": "kitchen_1",
        "equipment": [
            {"id": "kotel_1", "title": "Котёл"},
            {"id": "pot_1", "title": "Кастрюля"},
            {"id": "scale_1", "title": "Весы"},
            {"id": "pan_1", "title": "Сковорода"},
            {"id": "blast_chiller_1", "title": "Камера интенсивного охлаждения"},
        ],
    }
    import yaml
    (out_dir / "equipment.yml").write_text(yaml.safe_dump(equipment, allow_unicode=True, sort_keys=False), encoding="utf-8")

    glossary = {"terms": [{"term": "котёл", "canon": "kotel_1"}, {"term": "кастрюля", "canon": "pot_1"}]}
    (out_dir / "glossary.yml").write_text(yaml.safe_dump(glossary, allow_unicode=True, sort_keys=False), encoding="utf-8")

    return {"ok": True, "exported_to": str(out_dir)}
