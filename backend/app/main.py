from __future__ import annotations
import os, re, uuid
from pathlib import Path
from typing import Any, Dict
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

class NotesIn(BaseModel):
    notes: str

class AnswerIn(BaseModel):
    question_id: str
    answer: str

@app.get("/")
def index() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.post("/api/sessions")
def create_session(inp: CreateSessionIn) -> Dict[str, Any]:
    sid = uuid.uuid4().hex[:10]
    s = Session(id=sid, title=inp.title, roles=["cook_1", "cook_2"], version=1)
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
    nodes = [Node.model_validate(nr) for nr in extracted.get("nodes", [])]
    edges = [Edge.model_validate(er) for er in extracted.get("edges", [])]
    s.roles = extracted.get("roles", []) or s.roles
    s.nodes = nodes
    s.edges = edges
    s.questions = build_questions(s.nodes)
    s.mermaid = render_mermaid(s.nodes, s.edges)
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
        lowq = q.question.lower()
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
    s.mermaid = render_mermaid(s.nodes, s.edges)
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
    (out_dir / "process.yml").write_text(dump_yaml(session_to_process_dict(s)), encoding="utf-8")
    (out_dir / "diagram.mmd").write_text(s.mermaid or "", encoding="utf-8")
    equipment = {"kitchen_id": "kitchen_1","equipment":[
        {"id":"kotel_1","title":"Котёл"},
        {"id":"pot_1","title":"Кастрюля"},
        {"id":"scale_1","title":"Весы"},
        {"id":"pan_1","title":"Сковорода"},
        {"id":"blast_chiller_1","title":"Камера интенсивного охлаждения"},
    ]}
    import yaml
    (out_dir / "equipment.yml").write_text(yaml.safe_dump(equipment, allow_unicode=True, sort_keys=False), encoding="utf-8")
    glossary = {"terms":[{"term":"котёл","canon":"kotel_1"},{"term":"кастрюля","canon":"pot_1"}]}
    (out_dir / "glossary.yml").write_text(yaml.safe_dump(glossary, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return {"ok": True, "exported_to": str(out_dir)}
