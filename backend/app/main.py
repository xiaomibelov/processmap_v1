from __future__ import annotations


import math
import hashlib
import os
import re
import uuid
import io
import zipfile
import json
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, ValidationError

from .exporters.mermaid import render_mermaid
from .exporters.yaml_export import dump_yaml, session_to_process_dict
from .glossary import normalize_kind, slugify_canon, upsert_term
from .models import Node, Edge, Question, Session, Project, CreateProjectIn, UpdateProjectIn
from .analytics import compute_analytics
from .normalizer import load_seed_glossary, normalize_nodes
from .resources import build_resources_report
from .storage import get_storage, get_project_storage
from .settings import load_llm_settings, llm_status, save_llm_settings, verify_llm_settings
from .validators.coverage import build_questions
from .validators.disposition import build_disposition_questions
from .validators.loss import build_loss_questions, loss_report


app = FastAPI(title="Food Process Copilot MVP")
# --- Frontend contract helpers (Vite dev 5174) ---
def _role_id_from_any(x: Any) -> Optional[str]:
    if x is None:
        return None
    if isinstance(x, str):
        v = x.strip()
        return v or None
    if isinstance(x, dict):
        for k in ("role_id", "roleId", "id", "value", "name", "key"):
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
            if isinstance(j, dict):
                return [j]
        except Exception:
            pass
        return [{"note_id": "legacy", "ts": None, "author": None, "text": txt}]
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


def _norm_notes_by_element(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    out: Dict[str, Any] = {}
    for raw_key, raw_entry in value.items():
        key = str(raw_key or "").strip()
        if not key:
            continue
        entry = raw_entry if isinstance(raw_entry, dict) else {}
        raw_items = entry.get("items")
        if not isinstance(raw_items, list):
            raw_items = entry.get("notes") if isinstance(entry.get("notes"), list) else []

        items: List[Dict[str, Any]] = []
        for idx, raw_item in enumerate(raw_items):
            item = raw_item if isinstance(raw_item, dict) else {"text": str(raw_item or "")}
            text = str(item.get("text") or item.get("note") or "").strip()
            if not text:
                continue
            created_at = item.get("createdAt") or item.get("created_at") or item.get("ts") or int(time.time() * 1000)
            updated_at = item.get("updatedAt") or item.get("updated_at") or created_at
            note_id = str(item.get("id") or item.get("note_id") or f"note_{created_at}_{idx + 1}").strip()
            items.append(
                {
                    "id": note_id or f"note_{created_at}_{idx + 1}",
                    "text": text,
                    "createdAt": int(created_at) if str(created_at).isdigit() else created_at,
                    "updatedAt": int(updated_at) if str(updated_at).isdigit() else updated_at,
                }
            )

        if not items:
            continue

        updated_at_entry = entry.get("updatedAt") or entry.get("updated_at") or items[-1].get("updatedAt")
        out[key] = {
            "items": items,
            "updatedAt": int(updated_at_entry) if str(updated_at_entry).isdigit() else updated_at_entry,
        }

    return out


def _pick(d: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def _norm_nodes(v: Any) -> List[Node]:
    if v is None:
        return []
    if not isinstance(v, list):
        return []
    out: List[Node] = []
    for it in v:
        if not isinstance(it, dict):
            continue
        nid = _pick(it, "id", "node_id", "nodeId")
        title = _pick(it, "title", "label", "name")
        if nid is None or title is None:
            continue
        payload = dict(it)
        payload["id"] = str(nid)
        payload["title"] = str(title)
        if "actor_role" not in payload and "actorRole" in payload:
            payload["actor_role"] = payload.get("actorRole")
        if "recipient_role" not in payload and "recipientRole" in payload:
            payload["recipient_role"] = payload.get("recipientRole")
        # node_type_alias: accept some client synonyms (avoid 500 on PATCH)
        t = payload.get("type")
        if isinstance(t, str):
            tt = t.strip().lower()
            alias = {
                "task": "step",
                "action": "step",
                "activity": "step",
                "gateway": "decision",
                "xor": "decision",
                "and": "fork",
                "parallel": "fork",
            }.get(tt)
            if alias:
                payload["type"] = alias

        try:
            out.append(Node.model_validate(payload))
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=e.errors())

    return out


def _norm_edges(v: Any) -> List[Edge]:
    if v is None:
        return []
    if not isinstance(v, list):
        return []
    out: List[Edge] = []
    for it in v:
        if not isinstance(it, dict):
            continue
        fr = _pick(it, "from_id", "from", "source_id", "sourceId")
        to = _pick(it, "to_id", "to", "target_id", "targetId")
        if fr is None or to is None:
            continue
        payload = dict(it)
        payload["from_id"] = str(fr)
        payload["to_id"] = str(to)
        out.append(Edge.model_validate(payload))
    return out


def _norm_questions(v: Any) -> List[Question]:
    if v is None:
        return []
    if not isinstance(v, list):
        return []
    out: List[Question] = []
    for it in v:
        if isinstance(it, Question):
            out.append(it.model_copy(deep=True))
            continue
        if not isinstance(it, dict):
            continue
        payload = dict(it)
        if "question" not in payload and "text" in payload:
            payload["question"] = payload.get("text")
        if "node_id" not in payload and "nodeId" in payload:
            payload["node_id"] = payload.get("nodeId")
        try:
            out.append(Question.model_validate(payload))
        except ValidationError:
            continue
    return out

def _norm_prep_questions(value: Any) -> List[Dict[str, Any]]:
    if value is None:
        return []
    items = []
    if isinstance(value, list):
        items = value
    elif isinstance(value, dict):
        items = [value]
    else:
        return []

    out = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or item.get("text") or "").strip()
        if not question:
            continue
        out.append(
            {
                "id": str(item.get("id") or f"Q{idx + 1}").strip() or f"Q{idx + 1}",
                "block": str(item.get("block") or "").strip(),
                "question": question,
                "ask_to": str(item.get("ask_to") or item.get("role") or item.get("askTo") or "").strip(),
                "answer_type": str(item.get("answer_type") or item.get("answerType") or "").strip(),
                "follow_up": str(item.get("follow_up") or item.get("followUp") or "").strip(),
                "answer": str(item.get("answer") or "").strip(),
            }
        )
    return out


def _norm_interview(v: Any) -> Dict[str, Any]:
    if isinstance(v, dict):
        return dict(v)
    return {}


def _is_legacy_seed_bpmn(xml_text: str) -> bool:
    raw = (xml_text or "").strip()
    if not raw:
        return False
    try:
        root = ET.fromstring(raw)
    except Exception:
        return False

    def _ln(tag: str) -> str:
        if "}" in tag:
            return tag.rsplit("}", 1)[-1].lower()
        return tag.lower()

    counts: Dict[str, int] = {}
    for el in root.iter():
        name = _ln(str(getattr(el, "tag", "") or ""))
        counts[name] = counts.get(name, 0) + 1

    start_n = counts.get("startevent", 0)
    end_n = counts.get("endevent", 0)
    flow_n = counts.get("sequenceflow", 0)
    task_n = sum(counts.get(k, 0) for k in ("task", "usertask", "servicetask", "manualtask", "scripttask", "businessruletask", "sendtask", "receivetask"))
    gw_n = sum(counts.get(k, 0) for k in ("exclusivegateway", "parallelgateway", "inclusivegateway", "eventbasedgateway"))
    sub_n = counts.get("subprocess", 0) + counts.get("callactivity", 0)

    if start_n == 1 and end_n == 1 and gw_n == 0 and sub_n == 0:
        if task_n == 0 and flow_n <= 1:
            return True
        # Old frontend seed: Start -> "Опишите первый шаг процесса" -> End.
        if task_n == 1 and flow_n <= 2 and "опишите первый шаг процесса" in raw.lower():
            return True
    return False


def _overlay_interview_annotations_on_bpmn_xml(sess: Session, xml_text: str) -> str:
    raw = str(xml_text or "").strip()
    if not raw:
        return ""

    try:
        root = ET.fromstring(raw)
    except Exception:
        return raw

    def _ln(tag: str) -> str:
        if "}" in tag:
            return tag.rsplit("}", 1)[-1].lower()
        return tag.lower()

    def _ns(tag: str, fallback: str) -> str:
        t = str(tag or "")
        if t.startswith("{") and "}" in t:
            return t[1 : t.index("}")]
        return fallback

    def _safe_id(v: str) -> str:
        s = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(v or ""))
        if not s:
            s = "id"
        if not re.match(r"^[A-Za-z_]", s):
            s = f"id_{s}"
        return s

    def _norm(v: Any) -> str:
        return re.sub(r"\s+", " ", str(v or "").strip().lower())

    def _iter_local(el: ET.Element, local: str):
        q = str(local or "").lower()
        for x in el.iter():
            if _ln(str(getattr(x, "tag", "") or "")) == q:
                yield x

    proc = next((x for x in root.iter() if _ln(str(getattr(x, "tag", "") or "")) == "process"), None)
    if proc is None:
        return raw

    plane = next((x for x in root.iter() if _ln(str(getattr(x, "tag", "") or "")) == "bpmnplane"), None)

    ns_bpmn = _ns(str(getattr(proc, "tag", "") or ""), "http://www.omg.org/spec/BPMN/20100524/MODEL")
    ns_bpmndi = _ns(str(getattr(plane, "tag", "") or ""), "http://www.omg.org/spec/BPMN/20100524/DI")
    any_bounds = next(_iter_local(root, "bounds"), None)
    any_waypoint = next(_iter_local(root, "waypoint"), None)
    ns_dc = _ns(str(getattr(any_bounds, "tag", "") or ""), "http://www.omg.org/spec/DD/20100524/DC")
    ns_di = _ns(str(getattr(any_waypoint, "tag", "") or ""), "http://www.omg.org/spec/DD/20100524/DI")

    model = sess.model_dump() if hasattr(sess, "model_dump") else {}
    from .exporters.bpmn import _collect_interview_comments

    comments_raw = _collect_interview_comments(model, model.get("nodes") or [])

    node_ids: Set[str] = set()
    start_ids: List[str] = []
    end_ids: List[str] = []
    name_to_ids: Dict[str, List[str]] = {}
    allowed = {
        "startevent",
        "endevent",
        "boundaryevent",
        "intermediatecatchevent",
        "intermediatethrowevent",
        "task",
        "usertask",
        "servicetask",
        "manualtask",
        "scripttask",
        "businessruletask",
        "sendtask",
        "receivetask",
        "callactivity",
        "subprocess",
        "adhocsubprocess",
        "exclusivegateway",
        "inclusivegateway",
        "parallelgateway",
        "eventbasedgateway",
    }

    for el in root.iter():
        local = _ln(str(getattr(el, "tag", "") or ""))
        if local not in allowed:
            continue
        nid = str(el.attrib.get("id") or "").strip()
        if not nid:
            continue
        node_ids.add(nid)
        if local == "startevent":
            start_ids.append(nid)
        elif local == "endevent":
            end_ids.append(nid)
        nm = _norm(el.attrib.get("name"))
        if nm:
            name_to_ids.setdefault(nm, []).append(nid)

    comment_by_node: Dict[str, str] = {}
    for k, v in (comments_raw or {}).items():
        txt = str(v or "").strip()
        if not txt:
            continue
        key = str(k or "").strip()
        if key in node_ids:
            comment_by_node[key] = txt
    start_note = str((comments_raw or {}).get("__start__") or "").strip()
    if start_note and start_ids:
        comment_by_node[start_ids[0]] = start_note
    end_note = str((comments_raw or {}).get("__end__") or "").strip()
    if end_note and end_ids:
        comment_by_node[end_ids[0]] = end_note

    interview = model.get("interview") if isinstance(model.get("interview"), dict) else {}
    steps = interview.get("steps") if isinstance(interview.get("steps"), list) else []
    for st in steps:
        if not isinstance(st, dict):
            continue
        txt = str(st.get("comment") or st.get("note") or "").strip()
        if not txt:
            continue
        explicit = str(st.get("node_id") or st.get("nodeId") or "").strip()
        if explicit and explicit in node_ids:
            comment_by_node[explicit] = txt
            continue
        action_key = _norm(st.get("action"))
        if not action_key:
            continue
        ids = name_to_ids.get(action_key) or []
        if len(ids) == 1:
            comment_by_node[ids[0]] = txt

    # Remove previously generated FPC annotations before adding current ones.
    ann_prefix = "FPC_TextAnnotation_"
    assoc_prefix = "FPC_Association_"
    removed_ids: Set[str] = set()
    for child in list(proc):
        local = _ln(str(getattr(child, "tag", "") or ""))
        cid = str(child.attrib.get("id") or "")
        if local == "textannotation" and cid.startswith(ann_prefix):
            removed_ids.add(cid)
            proc.remove(child)
            continue
        if local == "association" and cid.startswith(assoc_prefix):
            removed_ids.add(cid)
            proc.remove(child)
            continue

    if plane is not None:
        for child in list(plane):
            local = _ln(str(getattr(child, "tag", "") or ""))
            cid = str(child.attrib.get("id") or "")
            bpmn_el = str(child.attrib.get("bpmnElement") or "")
            if local in ("bpmnshape", "bpmnedge") and (cid.startswith(ann_prefix) or cid.startswith(assoc_prefix) or bpmn_el in removed_ids):
                plane.remove(child)

    if not comment_by_node:
        try:
            return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8", errors="replace")
        except Exception:
            return raw

    used_ids = {str(el.attrib.get("id") or "").strip() for el in root.iter() if str(el.attrib.get("id") or "").strip()}

    def _alloc(prefix: str, node_id: str) -> str:
        base = f"{prefix}{_safe_id(node_id)}"
        cand = base
        n = 2
        while cand in used_ids:
            cand = f"{base}_{n}"
            n += 1
        used_ids.add(cand)
        return cand

    node_bounds: Dict[str, Dict[str, float]] = {}
    if plane is not None:
        for sh in plane:
            if _ln(str(getattr(sh, "tag", "") or "")) != "bpmnshape":
                continue
            node_id = str(sh.attrib.get("bpmnElement") or "").strip()
            if not node_id:
                continue
            bounds = next((x for x in sh if _ln(str(getattr(x, "tag", "") or "")) == "bounds"), None)
            if bounds is None:
                continue
            try:
                x = float(bounds.attrib.get("x", "0") or 0)
                y = float(bounds.attrib.get("y", "0") or 0)
                w = float(bounds.attrib.get("width", "0") or 0)
                h = float(bounds.attrib.get("height", "0") or 0)
            except Exception:
                continue
            node_bounds[node_id] = {"x": x, "y": y, "w": w, "h": h}

    for node_id, note in comment_by_node.items():
        if node_id not in node_ids:
            continue
        ann_id = _alloc(ann_prefix, node_id)
        assoc_id = _alloc(assoc_prefix, node_id)

        ann = ET.SubElement(proc, f"{{{ns_bpmn}}}textAnnotation", attrib={"id": ann_id})
        ET.SubElement(ann, f"{{{ns_bpmn}}}text").text = note
        ET.SubElement(proc, f"{{{ns_bpmn}}}association", attrib={"id": assoc_id, "sourceRef": node_id, "targetRef": ann_id})

        if plane is None:
            continue
        nb = node_bounds.get(node_id)
        if not nb:
            continue
        text_len = max(len(note), 12)
        ann_w = float(min(max(text_len * 6.8, 180.0), 420.0))
        ann_h = 56.0
        ann_x = nb["x"] + nb["w"] + 40.0
        ann_y = max(nb["y"] - 6.0, 24.0)

        ashape = ET.SubElement(
            plane,
            f"{{{ns_bpmndi}}}BPMNShape",
            attrib={"id": f"{ann_id}_di", "bpmnElement": ann_id},
        )
        ET.SubElement(
            ashape,
            f"{{{ns_dc}}}Bounds",
            attrib={"x": f"{ann_x:.1f}", "y": f"{ann_y:.1f}", "width": f"{ann_w:.1f}", "height": f"{ann_h:.1f}"},
        )

        e_di = ET.SubElement(
            plane,
            f"{{{ns_bpmndi}}}BPMNEdge",
            attrib={"id": f"{assoc_id}_di", "bpmnElement": assoc_id},
        )
        sx = nb["x"] + nb["w"]
        sy = nb["y"] + nb["h"] / 2.0
        dx = ann_x
        dy = ann_y + ann_h / 2.0
        ET.SubElement(e_di, f"{{{ns_di}}}waypoint", attrib={"x": f"{sx:.1f}", "y": f"{sy:.1f}"})
        ET.SubElement(e_di, f"{{{ns_di}}}waypoint", attrib={"x": f"{dx:.1f}", "y": f"{dy:.1f}"})

    try:
        return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8", errors="replace")
    except Exception:
        return raw


def _session_api_dump(sess: Session) -> Dict[str, Any]:
    d = sess.model_dump()
    d["notes"] = _notes_decode(d.get("notes"))
    return d


def _session_graph_fingerprint(sess: Session) -> str:
    nodes = []
    for n in (getattr(sess, "nodes", None) or []):
        nid = str(getattr(n, "id", "") or "").strip()
        if not nid:
            continue
        params = getattr(n, "parameters", None) or {}
        if not isinstance(params, dict):
            params = {}
        nodes.append(
            {
                "id": nid,
                "type": str(getattr(n, "type", "") or "").strip().lower(),
                "title": str(getattr(n, "title", "") or "").strip(),
                "actor_role": str(getattr(n, "actor_role", "") or "").strip(),
                "recipient_role": str(getattr(n, "recipient_role", "") or "").strip(),
                "duration_min": getattr(n, "duration_min", None),
                "interview_step_type": str(params.get("interview_step_type") or "").strip().lower(),
            }
        )
    nodes.sort(key=lambda x: str(x.get("id") or ""))

    edges = []
    for e in (getattr(sess, "edges", None) or []):
        src = str(getattr(e, "from_id", "") or "").strip()
        dst = str(getattr(e, "to_id", "") or "").strip()
        if not src or not dst:
            continue
        edges.append(
            {
                "from_id": src,
                "to_id": dst,
                "when": str(getattr(e, "when", "") or "").strip(),
            }
        )
    edges.sort(key=lambda x: (str(x.get("from_id") or ""), str(x.get("to_id") or ""), str(x.get("when") or "")))

    roles = [str(r or "").strip() for r in (getattr(sess, "roles", None) or []) if str(r or "").strip()]
    payload = {
        "title": str(getattr(sess, "title", "") or "").strip(),
        "roles": roles,
        "start_role": str(getattr(sess, "start_role", "") or "").strip(),
        "nodes": nodes,
        "edges": edges,
    }
    packed = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(packed.encode("utf-8")).hexdigest()


# CORS (local frontend integration)
cors_env = os.getenv("CORS_ORIGINS", "").strip()
if cors_env:
    cors_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
else:
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5177",
        "http://127.0.0.1:5177",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
WORKSPACE = Path(os.environ.get("PROCESS_WORKSPACE", "workspace/processes"))

# == delete helpers (projects/sessions) ==
def _ws_path(*parts: str) -> Path:
    # workspace is mounted to /app/workspace in docker; on host it is ./workspace
    return Path("workspace").joinpath(*parts)

def _canon_path(p: Path) -> str:
    try:
        return str(p.resolve())
    except Exception:
        return str(p)

def _session_storage_dirs() -> list[Path]:
    out: list[Path] = []
    try:
        st = get_storage()
        base = getattr(st, "base_dir", None)
        if isinstance(base, Path):
            out.append(base)
    except Exception:
        pass
    out.append(_ws_path("sessions"))  # legacy fallback

    uniq: list[Path] = []
    seen = set()
    for p in out:
        k = _canon_path(p)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)
    return uniq

def _project_storage_dirs() -> list[Path]:
    out: list[Path] = []
    try:
        ps = get_project_storage()
        root = getattr(ps, "root", None)
        if isinstance(root, Path):
            out.append(root)
    except Exception:
        pass
    out.append(_ws_path("projects"))  # legacy fallback

    uniq: list[Path] = []
    seen = set()
    for p in out:
        k = _canon_path(p)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)
    return uniq

def _safe_unlink(p: Path) -> bool:
    try:
        if p.exists():
            p.unlink()
            return True
    except Exception:
        return False
    return False

def _iter_session_files() -> list[Path]:
    out: list[Path] = []
    seen = set()
    for base in _session_storage_dirs():
        if not base.exists() or not base.is_dir():
            continue
        for fp in sorted(base.glob("*.json")):
            k = _canon_path(fp)
            if k in seen:
                continue
            seen.add(k)
            out.append(fp)
    return out

def _delete_session_files(session_id: str) -> int:
    deleted = 0
    sid = str(session_id)

    try:
        if get_storage().delete(sid):
            deleted += 1
    except Exception:
        pass

    for base in _session_storage_dirs():
        p = base / f"{sid}.json"
        if _safe_unlink(p):
            deleted += 1

    for fp in _iter_session_files():
        if fp.name == f"{sid}.json":
            continue
        try:
            txt = fp.read_text(encoding="utf-8")
        except Exception:
            continue
        if (f'"id":"{sid}"' not in txt) and (f'"id": "{sid}"' not in txt):
            continue
        try:
            d = json.loads(txt)
        except Exception:
            continue
        if isinstance(d, dict) and str(d.get("id")) == sid:
            if _safe_unlink(fp):
                deleted += 1
    return deleted

def _delete_project_files(project_id: str) -> int:
    deleted = 0
    pid = str(project_id)
    for base in _project_storage_dirs():
        p = base / f"{pid}.json"
        if _safe_unlink(p):
            deleted += 1
    return deleted

def _delete_sessions_by_project(project_id: str) -> list[str]:
    pid = str(project_id)
    session_ids: set[str] = set()

    for fp in _iter_session_files():
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        if str(d.get("project_id")) != pid:
            continue
        sid = d.get("id")
        if sid is not None:
            session_ids.add(str(sid))

    try:
        st = get_storage()
        for raw in st.list(limit=500, project_id=pid):
            sid = raw.get("id")
            if sid is not None:
                session_ids.add(str(sid))
    except Exception:
        pass

    deleted_ids: list[str] = []
    for sid in sorted(session_ids):
        if _delete_session_files(sid) > 0:
            deleted_ids.append(sid)
    return deleted_ids

GLOSSARY_SEED = BASE_DIR / "knowledge" / "glossary_seed.yml"

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class CreateSessionIn(BaseModel):
    title: str
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    ai_prep_questions: Optional[List[Dict[str, Any]]] = None

    model_config = ConfigDict(extra="allow")



class UpdateSessionIn(BaseModel):
    title: Optional[str] = None
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    notes: Optional[Any] = None
    notes_by_element: Optional[Any] = None
    interview: Optional[Any] = None
    nodes: Optional[Any] = None
    edges: Optional[Any] = None
    questions: Optional[Any] = None

    # frontend часто шлёт derived поля (mermaid*, normalized, resources, version)
    # бек имеет право игнорировать и пересчитывать их.
    model_config = ConfigDict(extra="allow")

# -----------------------------
# Project Sessions: mode contract
# -----------------------------
ALLOWED_PROJECT_SESSION_MODES = ("quick_skeleton", "deep_audit")

def _norm_project_session_mode(mode: str | None) -> str | None:
    if mode is None:
        return None
    m = str(mode).strip().lower()
    if not m:
        return None
    aliases = {
        "quick": "quick_skeleton",
        "qs": "quick_skeleton",
        "skeleton": "quick_skeleton",
        "deep": "deep_audit",
        "da": "deep_audit",
        "audit": "deep_audit",
    }
    m = aliases.get(m, m)
    if m not in ALLOWED_PROJECT_SESSION_MODES:
        return None
    return m





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




class CreateNodeIn(BaseModel):
    id: Optional[str] = None
    title: str
    type: str = "step"
    actor_role: Optional[str] = None
    recipient_role: Optional[str] = None
    equipment: Optional[List[str]] = None
    duration_min: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    disposition: Optional[Dict[str, Any]] = None


class CreateEdgeIn(BaseModel):
    from_id: str
    to_id: str
    when: Optional[str] = None


class GlossaryAddIn(BaseModel):
    kind: str
    term: str
    canon: Optional[str] = None
    title: Optional[str] = None




class LlmSettingsIn(BaseModel):
    api_key: str = ""
    base_url: str = ""


class LlmVerifyIn(BaseModel):
    api_key: str = ""
    base_url: str = ""


class AiQuestionsIn(BaseModel):
    limit: int = 10
    mode: str = "strict"
    reset: bool = False
    node_id: Optional[str] = None
    step_id: Optional[str] = None


class SessionTitleQuestionsIn(BaseModel):
    title: str
    prompt: str = ""
    min_questions: int = 15
    max_questions: int = 20


class BpmnXmlIn(BaseModel):
    xml: str = ""

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

    keep_llm = [q for q in (s.questions or []) if (getattr(q, 'id', '') or '').startswith('llm_')]
    new_questions = new_questions + keep_llm

    seen = set()
    dedup = []
    for q in new_questions:
        qid = getattr(q, 'id', None)
        if not qid or qid in seen:
            continue
        seen.add(qid)
        dedup.append(q)
    new_questions = dedup

    s.questions = _merge_question_states(s.questions, new_questions)

    s.mermaid_simple = render_mermaid(s.nodes, s.edges, roles=s.roles, mode="simple")
    s.mermaid_lanes = render_mermaid(s.nodes, s.edges, roles=s.roles, mode="lanes")
    s.mermaid = s.mermaid_lanes


    s.analytics = compute_analytics(s)

    s.version += 1
    return s


@app.get("/")
def index():
    idx_file = STATIC_DIR / "index.html"
    if idx_file.exists():
        return FileResponse(str(idx_file))
    return {"ok": True, "service": "foodproc_process_copilot"}


@app.get("/favicon.ico")
def favicon():
    ico = STATIC_DIR / "favicon.ico"
    if ico.exists():
        return FileResponse(str(ico))
    return Response(status_code=204)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/sessions")
def create_session(inp: CreateSessionIn) -> Dict[str, Any]:
    st = get_storage()

    roles = _norm_roles(getattr(inp, "roles", None))
    if not roles:
        roles = ["cook_1", "technolog"]

    sr = getattr(inp, "start_role", None)
    if sr is not None and str(sr).strip() != "":
        sr = str(sr).strip()
        if sr not in roles:
            return {"error": "start_role must be one of roles", "start_role": sr, "roles": roles}
    else:
        sr = None

    prep_questions = _norm_prep_questions(getattr(inp, "ai_prep_questions", None))

    sid = uuid.uuid4().hex[:10]
    sess = Session(
        id=sid,
        title=inp.title,
        roles=roles,
        start_role=sr,
        interview={"prep_questions": prep_questions},
        notes=_notes_encode([]),
        notes_by_element={},
        nodes=[],
        edges=[],
        questions=[],
        mermaid="",
        mermaid_simple="",
        mermaid_lanes="",
        normalized={},
        resources={},
        version=1,
    )
    sess = _recompute_session(sess)
    st.save(sess)
    return _session_api_dump(sess)




@app.get("/api/projects/{project_id}/sessions")
def list_project_sessions(project_id: str, mode: str | None = None):
    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        raise HTTPException(status_code=422, detail="invalid mode; allowed: quick_skeleton, deep_audit")
    ps = get_project_storage()
    if ps.load(project_id) is None:
        raise HTTPException(status_code=404, detail="project not found")

    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        raise HTTPException(status_code=422, detail="invalid mode; allowed: quick_skeleton, deep_audit")

    st = get_storage()
    out = []
    for item in st.list():
        sess = item
        # allow storage.list() to return ids or dicts defensively
        if isinstance(item, str):
            sess = st.load(item)
        elif isinstance(item, dict):
            try:
                # best-effort parse via pydantic model
                sess = Session.model_validate(item)
            except Exception:
                sess = None
        if sess is None:
            continue

        if getattr(sess, "project_id", None) != project_id:
            continue
        if mode is not None and (getattr(sess, "mode", None) or None) != mode:
            continue
        out.append(_session_api_dump(sess))
    return out
@app.post("/api/projects/{project_id}/sessions")
def create_project_session(project_id: str, inp: CreateSessionIn, mode: str | None = Query(default="quick_skeleton")):
    ps = get_project_storage()
    if ps.load(project_id) is None:
        raise HTTPException(status_code=404, detail="project not found")

    st = get_storage()
    title = getattr(inp, "title", None) or "process"
    roles = _norm_roles(getattr(inp, "roles", None))
    sr = getattr(inp, "start_role", None)
    if sr is not None and str(sr).strip() != "":
        sr = str(sr).strip()
        if roles and sr not in roles:
            return {"error": "start_role must be one of roles", "start_role": sr, "roles": roles}
    else:
        sr = None
    prep_questions = _norm_prep_questions(getattr(inp, "ai_prep_questions", None))
    # prefer storage-native create signature if it supports project_id/mode
    try:
        sid = st.create(title=title, roles=roles, start_role=sr, project_id=project_id, mode=mode)
        sess = st.load(sid)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        if prep_questions:
            sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
            st.save(sess)
        return _session_api_dump(sess)
    except TypeError:
        # fallback: create base session then attach fields
        sid = st.create(title=title, roles=roles, start_role=sr)
        sess = st.load(sid)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        if hasattr(sess, "project_id"):
            sess.project_id = project_id
        if hasattr(sess, "mode"):
            sess.mode = mode
        if prep_questions:
            sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        st.save(sess)
        return _session_api_dump(sess)
@app.get("/api/sessions")
def list_sessions(q: Optional[str] = None, limit: int = 200) -> Dict[str, Any]:
    st = get_storage()
    items = st.list(query=q, limit=min(max(int(limit), 1), 500))
    return {"items": items, "count": len(items)}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    sess = st.load(session_id)
    if not sess:
        return {"error": "not found"}
    return _session_api_dump(sess)


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
@app.patch("/api/sessions/{session_id}")
def patch_session(session_id: str, inp: UpdateSessionIn) -> Dict[str, Any]:
    st = get_storage()
    sess = st.load(session_id)
    if not sess:
        return {"error": "not found"}

    data = inp.model_dump(exclude_unset=True)

    handled = False
    need_recompute = False

    if "title" in data and data["title"] is not None:
        title = str(data["title"]).strip()
        if title:
            sess2 = st.rename(session_id, title)
            if not sess2:
                return {"error": "not found"}
            sess = sess2
            handled = True

    if "roles" in data:
        sess.roles = _norm_roles(data.get("roles"))
        if sess.start_role and sess.roles and sess.start_role not in sess.roles:
            sess.start_role = None
        handled = True
        need_recompute = True

    if "start_role" in data:
        sr = data.get("start_role")
        if sr is None or str(sr).strip() == "":
            sess.start_role = None
        else:
            sr = str(sr).strip()
            if sess.roles and sr not in sess.roles:
                return {"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}
            sess.start_role = sr
        handled = True
        need_recompute = True

    if "notes" in data:
        sess.notes = _notes_encode(data.get("notes"))
        handled = True
        need_recompute = True

    if "notes_by_element" in data:
        sess.notes_by_element = _norm_notes_by_element(data.get("notes_by_element"))
        handled = True

    if "interview" in data:
        sess.interview = _norm_interview(data.get("interview"))
        handled = True

    if "nodes" in data:
        sess.nodes = _norm_nodes(data.get("nodes"))
        handled = True
        need_recompute = True

    if "edges" in data:
        sess.edges = _norm_edges(data.get("edges"))
        handled = True
        need_recompute = True

    if "questions" in data:
        sess.questions = _norm_questions(data.get("questions"))
        handled = True
        need_recompute = True

    # игнорируем любые extra поля без ошибки
    if need_recompute:
        sess = _recompute_session(sess)
    st.save(sess)
    return _session_api_dump(sess)


@app.delete("/api/projects/{project_id}")
def delete_project_api(project_id: str):
    deleted_sessions = _delete_sessions_by_project(project_id)
    deleted_projects = _delete_project_files(project_id)
    if deleted_projects == 0:
        return {"ok": False, "error": "project_not_found", "project_id": str(project_id), "deleted_sessions": deleted_sessions}
    return {"ok": True, "project_id": str(project_id), "deleted_sessions": deleted_sessions}

@app.delete("/api/sessions/{session_id}")
def delete_session_api(session_id: str):
    deleted = _delete_session_files(session_id)
    if deleted == 0:
        return {"ok": False, "error": "session_not_found", "session_id": str(session_id)}
    return {"ok": True, "session_id": str(session_id), "deleted_files": deleted}


@app.put("/api/sessions/{session_id}")
def put_session(session_id: str, inp: UpdateSessionIn) -> Dict[str, Any]:
    st = get_storage()
    sess = st.load(session_id)
    if not sess:
        return {"error": "not found"}

    data = inp.model_dump()

    if data.get("title") is not None:
        title = str(data["title"]).strip()
        if title:
            sess2 = st.rename(session_id, title)
            if not sess2:
                return {"error": "not found"}
            sess = sess2

    sess.roles = _norm_roles(data.get("roles"))

    sr = data.get("start_role")
    if sr is None or str(sr).strip() == "":
        sess.start_role = None
    else:
        sr = str(sr).strip()
        if sess.roles and sr not in sess.roles:
            return {"error": "start_role must be one of roles", "start_role": sr, "roles": sess.roles}
        sess.start_role = sr

    sess.notes = _notes_encode(data.get("notes"))
    sess.notes_by_element = _norm_notes_by_element(data.get("notes_by_element"))
    sess.interview = _norm_interview(data.get("interview"))
    sess.nodes = _norm_nodes(data.get("nodes"))
    sess.edges = _norm_edges(data.get("edges"))
    sess.questions = _norm_questions(data.get("questions"))

    sess = _recompute_session(sess)
    st.save(sess)
    return _session_api_dump(sess)

@app.post("/api/sessions/{session_id}/recompute")
def recompute(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()



def _collect_node_llm_questions(s: Session, node_id: str) -> List[Question]:
    nid = str(node_id or "").strip()
    if not nid:
        return []
    return [
        q
        for q in (s.questions or [])
        if str(getattr(q, "id", "") or "").startswith("llm_")
        and str(getattr(q, "node_id", "") or "").strip() == nid
    ]


def _prune_node_llm_questions(s: Session, node_id: str, keep_max: int = 5) -> List[Question]:
    nid = str(node_id or "").strip()
    if not nid:
        return []
    keep = max(int(keep_max or 0), 1)
    kept_for_node: List[Question] = []
    next_questions: List[Question] = []
    for q in (s.questions or []):
        is_node_llm = str(getattr(q, "id", "") or "").startswith("llm_") and str(getattr(q, "node_id", "") or "").strip() == nid
        if not is_node_llm:
            next_questions.append(q)
            continue
        if len(kept_for_node) < keep:
            kept_for_node.append(q)
            next_questions.append(q)
    s.questions = next_questions
    return kept_for_node


def _llm_question_status_to_interview(status: Any) -> str:
    s = str(status or "").strip().lower()
    if s == "answered":
        return "подтверждено"
    if s == "open":
        return "уточнить"
    return "неизвестно"


def _sync_interview_ai_questions_for_node(
    s: Session,
    node_id: str,
    *,
    preferred_step_id: str = "",
    keep_max: int = 5,
) -> Dict[str, Any]:
    nid = str(node_id or "").strip()
    preferred_sid = str(preferred_step_id or "").strip()
    keep = max(int(keep_max or 0), 1)

    iv = dict(getattr(s, "interview", {}) or {})
    steps = iv.get("steps")
    if not isinstance(steps, list):
        steps = []

    step_ids: List[str] = []
    seen_sid: Set[str] = set()

    def _add_step_id(sid: str) -> None:
        sid = str(sid or "").strip()
        if not sid or sid in seen_sid:
            return
        seen_sid.add(sid)
        step_ids.append(sid)

    if preferred_sid:
        _add_step_id(preferred_sid)

    for st in steps:
        if not isinstance(st, dict):
            continue
        sid = str(st.get("id") or "").strip()
        st_node = str(st.get("node_id") or st.get("nodeId") or "").strip()
        if not sid:
            continue
        if nid and st_node == nid:
            _add_step_id(sid)

    llm_for_node = _collect_node_llm_questions(s, nid)[:keep]
    normalized_items: List[Dict[str, Any]] = []
    for q in llm_for_node:
        txt = str(getattr(q, "question", "") or "").strip()
        if not txt:
            continue
        normalized_items.append(
            {
                "id": str(getattr(q, "id", "") or "").strip(),
                "text": txt,
                "status": _llm_question_status_to_interview(getattr(q, "status", "")),
                "on_diagram": False,
            }
        )

    ai_map_raw = iv.get("ai_questions")
    ai_map: Dict[str, List[Dict[str, Any]]] = dict(ai_map_raw) if isinstance(ai_map_raw, dict) else {}

    for sid in step_ids:
        existing = ai_map.get(sid)
        if not isinstance(existing, list):
            existing = []
        keep_on_diagram: Dict[str, bool] = {}
        keep_status: Dict[str, str] = {}
        for it in existing:
            if not isinstance(it, dict):
                continue
            iid = str(it.get("id") or "").strip()
            itxt = str(it.get("text") or it.get("question") or "").strip()
            key = iid or itxt.lower()
            if not key:
                continue
            keep_on_diagram[key] = bool(it.get("on_diagram"))
            stxt = str(it.get("status") or "").strip()
            if stxt:
                keep_status[key] = stxt

        merged: List[Dict[str, Any]] = []
        for it in normalized_items:
            iid = str(it.get("id") or "").strip()
            itxt = str(it.get("text") or "").strip()
            key = iid or itxt.lower()
            row = dict(it)
            if key in keep_on_diagram:
                row["on_diagram"] = keep_on_diagram[key]
            if key in keep_status and row.get("status") == "уточнить":
                row["status"] = keep_status[key]
            merged.append(row)
        ai_map[sid] = merged[:keep]

    iv["ai_questions"] = ai_map
    s.interview = iv

    primary_sid = step_ids[0] if step_ids else ""
    step_questions = ai_map.get(primary_sid) if primary_sid else []
    if not isinstance(step_questions, list):
        step_questions = []
    return {
        "step_id": primary_sid or None,
        "step_ids": step_ids,
        "step_questions": step_questions[:keep],
        "node_questions_count": len(normalized_items),
    }


@app.post("/api/sessions/{session_id}/ai/questions")
def ai_questions(session_id: str, inp: AiQuestionsIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    llm = load_llm_settings()
    api_key = (llm.get("api_key") or "").strip()
    base_url = (llm.get("base_url") or "").strip()
    if not api_key:
        return {"error": "deepseek api_key is not set"}

    limit = int(inp.limit or 10)
    if limit < 1:
        limit = 1
    if limit > 10:
        limit = 10

    mode = (inp.mode or "strict").strip().lower()
    if mode not in ("strict", "soft", "sequential", "node_step", "one_by_one"):
        mode = "strict"

    try:
        from .ai.deepseek_questions import (
            generate_llm_questions,
            generate_llm_questions_for_node,
            collect_node_ids_in_bpmn_order,
            extract_node_xml_snippet,
        )
    except Exception as e:
        return {"error": f"deepseek questions module not available: {e}"}

    if mode in ("sequential", "node_step", "one_by_one"):
        known = {str(getattr(n, "id", "") or "").strip() for n in (s.nodes or []) if str(getattr(n, "id", "") or "").strip()}
        ordered = collect_node_ids_in_bpmn_order(str(getattr(s, "bpmn_xml", "") or ""), known)
        for n in (s.nodes or []):
            nid = str(getattr(n, "id", "") or "").strip()
            if nid and nid not in ordered:
                ordered.append(nid)

        state = dict(getattr(s, "ai_llm_state", {}) or {})
        if bool(getattr(inp, "reset", False)):
            state = {}
        processed_old = [str(x).strip() for x in (state.get("processed_node_ids") or []) if str(x).strip()]
        processed_set = set(processed_old)
        requested_node_id = str(getattr(inp, "node_id", "") or "").strip()
        requested_step_id = str(getattr(inp, "step_id", "") or "").strip()

        llm_count_by_node: Dict[str, int] = {}
        for q in (s.questions or []):
            if not str(getattr(q, "id", "") or "").startswith("llm_"):
                continue
            qnid = str(getattr(q, "node_id", "") or "").strip()
            if not qnid:
                continue
            llm_count_by_node[qnid] = int(llm_count_by_node.get(qnid, 0)) + 1

        skipped_existing = 0
        selected_node = None
        if requested_node_id:
            selected_node = next((n for n in (s.nodes or []) if str(getattr(n, "id", "") or "").strip() == requested_node_id), None)
            if selected_node is None:
                return {"error": "node not found", "node_id": requested_node_id}
            if requested_node_id not in ordered:
                ordered.append(requested_node_id)
            existing_requested = _prune_node_llm_questions(s, requested_node_id, keep_max=5)
            if len(existing_requested) >= 5:
                processed_set.add(requested_node_id)
                processed_order = [nid for nid in ordered if nid in processed_set]
                remaining = len([x for x in ordered if x not in processed_set])
                sync = _sync_interview_ai_questions_for_node(
                    s,
                    requested_node_id,
                    preferred_step_id=requested_step_id,
                    keep_max=5,
                )
                state["processed_node_ids"] = processed_order
                state["last_node_id"] = requested_node_id
                state["last_status"] = "processed"
                state["updated_at"] = int(time.time())
                s.ai_llm_state = state
                st.save(s)
                out = _session_api_dump(s)
                questions_for_step = sync.get("step_questions") if isinstance(sync, dict) else []
                if not isinstance(questions_for_step, list):
                    questions_for_step = []
                out["llm_step"] = {
                    "status": "processed",
                    "node_id": requested_node_id,
                    "node_title": str(getattr(selected_node, "title", "") or requested_node_id),
                    "requested_node_id": requested_node_id,
                    "step_id": sync.get("step_id") if isinstance(sync, dict) else None,
                    "step_ids": sync.get("step_ids") if isinstance(sync, dict) else [],
                    "generated": 0,
                    "reused": True,
                    "questions": questions_for_step,
                    "new_questions": [],
                    "existing_questions_returned": len(questions_for_step),
                    "processed": len(processed_order),
                    "total": len(ordered),
                    "remaining": remaining,
                    "skipped_existing": skipped_existing,
                }
                return out
        else:
            for nid in ordered:
                if nid in processed_set:
                    continue
                if int(llm_count_by_node.get(nid, 0)) >= 5:
                    processed_set.add(nid)
                    skipped_existing += 1
                    continue
                selected_node = next((n for n in (s.nodes or []) if str(getattr(n, "id", "") or "").strip() == nid), None)
                if selected_node is not None:
                    break

        if selected_node is None:
            processed_order = [nid for nid in ordered if nid in processed_set]
            state["processed_node_ids"] = processed_order
            state["last_status"] = "completed"
            state["updated_at"] = int(time.time())
            s.ai_llm_state = state
            st.save(s)
            out = _session_api_dump(s)
            out["llm_step"] = {
                "status": "completed",
                "processed": len(processed_order),
                "total": len(ordered),
                "remaining": 0,
                "skipped_existing": skipped_existing,
            }
            return out

        node_xml = extract_node_xml_snippet(str(getattr(s, "bpmn_xml", "") or ""), str(getattr(selected_node, "id", "") or ""))
        existing_for_node_before = _collect_node_llm_questions(s, str(getattr(selected_node, "id", "") or ""))
        remain_for_node = max(0, 5 - len(existing_for_node_before))
        if remain_for_node <= 0:
            new_qs = []
        else:
            try:
                new_qs = generate_llm_questions_for_node(
                    s,
                    selected_node,
                    api_key=api_key,
                    base_url=base_url,
                    limit=min(limit, remain_for_node, 5),
                    node_xml=node_xml,
                )
            except Exception as e:
                return {"error": f"deepseek failed: {e}"}
        generated = 0
        added_questions: List[Dict[str, Any]] = []
        existing_ids = {q.id for q in (s.questions or []) if getattr(q, "id", None)}
        for q in (new_qs or []):
            if q.id in existing_ids:
                continue
            (s.questions or []).append(q)
            existing_ids.add(q.id)
            generated += 1
            added_questions.append(q.model_dump())

        nid = str(getattr(selected_node, "id", "") or "").strip()
        _prune_node_llm_questions(s, nid, keep_max=5)
        if nid:
            processed_set.add(nid)
        processed_order = [x for x in ordered if x in processed_set]
        remaining = len([x for x in ordered if x not in processed_set])

        node_results = state.get("node_results")
        if not isinstance(node_results, dict):
            node_results = {}
        node_results[nid] = {
            "node_title": str(getattr(selected_node, "title", "") or nid),
            "generated": generated,
            "ts": int(time.time()),
            "mode": "node_step" if requested_node_id else "sequential",
        }
        state["node_results"] = node_results
        state["processed_node_ids"] = processed_order
        state["last_node_id"] = nid
        state["last_status"] = "processed"
        state["updated_at"] = int(time.time())
        s.ai_llm_state = state

        s = _recompute_session(s)
        sync = _sync_interview_ai_questions_for_node(
            s,
            nid,
            preferred_step_id=requested_step_id,
            keep_max=5,
        )
        st.save(s)
        out = _session_api_dump(s)
        llm_questions_for_step = sync.get("step_questions") if isinstance(sync, dict) else []
        if not isinstance(llm_questions_for_step, list):
            llm_questions_for_step = []
        out["llm_step"] = {
            "status": "processed",
            "node_id": nid,
            "node_title": str(getattr(selected_node, "title", "") or nid),
            "requested_node_id": requested_node_id or None,
            "step_id": sync.get("step_id") if isinstance(sync, dict) else None,
            "step_ids": sync.get("step_ids") if isinstance(sync, dict) else [],
            "generated": generated,
            "reused": generated == 0,
            "questions": llm_questions_for_step,
            "new_questions": added_questions,
            "existing_questions_returned": max(len(llm_questions_for_step) - generated, 0),
            "processed": len(processed_order),
            "total": len(ordered),
            "remaining": remaining,
            "skipped_existing": skipped_existing,
        }
        return out

    try:
        new_qs = generate_llm_questions(
            s,
            api_key=api_key,
            base_url=base_url,
            limit=limit,
            mode=mode,
        )
    except Exception as e:
        return {"error": f"deepseek failed: {e}"}

    if new_qs:
        existing_ids = {q.id for q in (s.questions or []) if getattr(q, "id", None)}
        for q in new_qs:
            if q.id not in existing_ids:
                (s.questions or []).append(q)
                existing_ids.add(q.id)

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


@app.post("/api/llm/session-title/questions")
def llm_session_title_questions(inp: SessionTitleQuestionsIn) -> Dict[str, Any]:
    title = str(inp.title or "").strip()
    if not title:
        return {"error": "title is required"}

    llm = load_llm_settings()
    api_key = (llm.get("api_key") or "").strip()
    base_url = (llm.get("base_url") or "").strip()
    if not api_key:
        return {"error": "deepseek api_key is not set"}

    min_questions = min(max(int(inp.min_questions or 15), 1), 25)
    max_questions = min(max(int(inp.max_questions or 20), 1), 25)
    if min_questions > max_questions:
        min_questions = max_questions

    try:
        from .ai.deepseek_questions import generate_session_title_questions
    except Exception as e:
        return {"error": f"deepseek questions module not available: {e}"}

    try:
        return generate_session_title_questions(
            title=title,
            api_key=api_key,
            base_url=base_url,
            prompt_template=str(inp.prompt or ""),
            min_questions=min_questions,
            max_questions=max_questions,
        )
    except Exception as e:
        return {"error": f"deepseek failed: {e}"}


@app.post("/api/glossary/add")
def glossary_add(inp: GlossaryAddIn) -> Dict[str, Any]:
    kind = normalize_kind(inp.kind)
    term = (inp.term or "").strip()
    canon = (inp.canon or "").strip() or slugify_canon(term)
    title = (inp.title or "").strip() or term
    res = upsert_term(GLOSSARY_SEED, kind, term, canon, title)
    return res



@app.get("/api/settings/llm")
def get_llm_settings() -> Dict[str, Any]:
    return llm_status()


@app.post("/api/settings/llm")
def post_llm_settings(inp: LlmSettingsIn) -> Dict[str, Any]:
    return save_llm_settings(api_key=inp.api_key, base_url=inp.base_url)


@app.post("/api/settings/llm/verify")
def post_llm_verify(inp: LlmVerifyIn) -> Dict[str, Any]:
    return verify_llm_settings(api_key=inp.api_key, base_url=inp.base_url)


@app.post("/api/sessions/{session_id}/notes")
def post_notes(session_id: str, inp: NotesIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    s.notes = inp.notes

    llm = load_llm_settings()
    try:
        from .ai.deepseek_client import extract_process
    except Exception as e:
        return {"error": f"deepseek client module not available: {e}"}

    try:
        extracted = extract_process(
            s.notes,
            api_key=llm.get("api_key", ""),
            base_url=llm.get("base_url", ""),
        )
    except Exception as e:
        return {"error": f"deepseek failed: {e}"}

    nodes_raw = extracted.get("nodes", []) or []
    edges_raw = extracted.get("edges", []) or []
    existing_roles = _norm_roles(getattr(s, "roles", None))
    extracted_roles = _norm_roles(extracted.get("roles", []))
    roles = existing_roles if existing_roles else extracted_roles

    extracted_nodes = [Node.model_validate(nr) for nr in nodes_raw]
    extracted_edges = [Edge.model_validate(er) for er in edges_raw]

    s.roles = roles
    sr = str(getattr(s, "start_role", "") or "").strip()
    if roles:
        if not sr or sr not in roles:
            s.start_role = roles[0]
    else:
        s.start_role = None

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


@app.post("/api/sessions/{session_id}/nodes")
def add_node(session_id: str, inp: CreateNodeIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    node_id = (inp.id or "").strip() or f"n_{uuid.uuid4().hex[:8]}"
    if any(n.id == node_id for n in s.nodes):
        return {"error": "node already exists", "node_id": node_id}

    node = Node(
        id=node_id,
        title=inp.title,
        type=inp.type or "step",
        actor_role=inp.actor_role,
        recipient_role=inp.recipient_role,
        equipment=list(inp.equipment or []),
        parameters=dict(inp.parameters or {}),
        duration_min=inp.duration_min,
        disposition=dict(inp.disposition or {}),
        qc=[],
        exceptions=[],
        evidence=[],
        confidence=0.0,
    )
    s.nodes.append(node)

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


@app.delete("/api/sessions/{session_id}/nodes/{node_id}")
def delete_node(session_id: str, node_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    before_n = len(s.nodes)
    s.nodes = [n for n in s.nodes if n.id != node_id]
    if len(s.nodes) == before_n:
        return {"error": "node not found"}

    s.edges = [e for e in s.edges if e.from_id != node_id and e.to_id != node_id]

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


@app.post("/api/sessions/{session_id}/edges")
def add_edge(session_id: str, inp: CreateEdgeIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    if not any(n.id == inp.from_id for n in s.nodes):
        return {"error": "from_id not found", "from_id": inp.from_id}
    if not any(n.id == inp.to_id for n in s.nodes):
        return {"error": "to_id not found", "to_id": inp.to_id}

    exists = any((e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None)) for e in s.edges)
    if exists:
        return {"error": "edge already exists"}

    s.edges.append(Edge(from_id=inp.from_id, to_id=inp.to_id, when=inp.when))

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()


@app.delete("/api/sessions/{session_id}/edges")
def delete_edge(session_id: str, inp: CreateEdgeIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    before = len(s.edges)
    s.edges = [
        e for e in s.edges
        if not (e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None))
    ]
    if len(s.edges) == before:
        return {"error": "edge not found"}

    s = _recompute_session(s)
    st.save(s)
    return s.model_dump()






@app.get("/api/sessions/{session_id}/bpmn")
def session_bpmn_export(
    session_id: str,
    raw: int = Query(0, description="1 = return stored bpmn_xml as-is (no regenerate/overlay)"),
    include_overlay: int = Query(1, description="1 = overlay interview annotations (ignored when raw=1)"),
):
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return Response(content="not found", media_type="text/plain", status_code=404)

    xml_stored = str(getattr(s, "bpmn_xml", "") or "")
    has_graph = len(getattr(s, "nodes", []) or []) > 0 or len(getattr(s, "edges", []) or []) > 0
    current_graph_fp = _session_graph_fingerprint(s)
    stored_graph_fp = str(getattr(s, "bpmn_graph_fingerprint", "") or "").strip()
    raw_mode = bool(int(raw or 0))
    overlay_mode = bool(int(include_overlay or 0))

    def _persist_regenerated(xml_text: str) -> None:
        s.bpmn_xml = str(xml_text or "")
        s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
        s.bpmn_graph_fingerprint = current_graph_fp
        st.save(s)

    if raw_mode:
        if xml_stored.strip():
            xml = xml_stored
        elif not has_graph:
            xml = ""
        else:
            from .exporters.bpmn import export_session_to_bpmn_xml
            xml = export_session_to_bpmn_xml(s)
            _persist_regenerated(xml)
    else:
        if xml_stored.strip():
            # Auto-upgrade old start->end skeletons for fresh sessions with empty graph.
            should_regenerate = False
            if _is_legacy_seed_bpmn(xml_stored) and len(getattr(s, "nodes", []) or []) == 0 and len(getattr(s, "edges", []) or []) == 0:
                should_regenerate = True
            # Keep XML consistent with Interview graph updates:
            # if graph fingerprint changed, regenerate XML from nodes/edges.
            elif has_graph and (not stored_graph_fp or stored_graph_fp != current_graph_fp):
                should_regenerate = True

            if should_regenerate:
                from .exporters.bpmn import export_session_to_bpmn_xml
                xml = export_session_to_bpmn_xml(s)
                _persist_regenerated(xml)
            else:
                xml = xml_stored
        else:
            # Do not auto-generate a starter BPMN for brand-new empty sessions.
            # The user creates the first diagram manually (or imports BPMN).
            if not has_graph:
                xml = ""
            else:
                from .exporters.bpmn import export_session_to_bpmn_xml
                xml = export_session_to_bpmn_xml(s)
                _persist_regenerated(xml)

    # Keep imported BPMN layout intact, but overlay Interview annotations only when requested.
    if (not raw_mode) and overlay_mode:
        xml = _overlay_interview_annotations_on_bpmn_xml(s, xml)

    title = getattr(s, "title", None) or getattr(s, "name", None) or "process"
    title = re.sub(r"[^a-zA-Z0-9_\-]+", "_", str(title)).strip("_")
    if not title:
        title = "process"
    filename = f"{title}.bpmn"
    return Response(
        content=xml,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.put("/api/sessions/{session_id}/bpmn")
def session_bpmn_save(session_id: str, inp: BpmnXmlIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    xml = str(inp.xml or "")
    if not xml.strip():
        return {"error": "xml is empty"}

    s.bpmn_xml = xml
    s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
    s.bpmn_graph_fingerprint = _session_graph_fingerprint(s)
    st.save(s)
    return {"ok": True, "session_id": s.id, "bytes": len(xml), "version": s.bpmn_xml_version}


@app.delete("/api/sessions/{session_id}/bpmn")
def session_bpmn_clear(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    s.bpmn_xml = ""
    s.bpmn_xml_version = 0
    s.bpmn_graph_fingerprint = ""
    st.save(s)
    return {"ok": True, "session_id": s.id}

@app.get("/api/sessions/{session_id}/export")
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

    try:
        from .exporters.bpmn import export_session_to_bpmn_xml
        (out_dir / "process.bpmn").write_text(export_session_to_bpmn_xml(s), encoding="utf-8")
    except Exception as e:
        (out_dir / "process.bpmn").write_text(
            f'<?xml version="1.0" encoding="UTF-8"?><error>{e}</error>',
            encoding="utf-8",
        )

    seed = load_seed_glossary(GLOSSARY_SEED)
    (out_dir / "glossary.yml").write_text(dump_yaml(seed), encoding="utf-8")
    (out_dir / "normalized.yml").write_text(dump_yaml(s.normalized or {}), encoding="utf-8")
    (out_dir / "resources.yml").write_text(dump_yaml(s.resources or {}), encoding="utf-8")

    disp_rep = _disposition_report(s)
    (out_dir / "disposition.yml").write_text(dump_yaml(disp_rep), encoding="utf-8")

    lr = loss_report(s.nodes)
    (out_dir / "losses.yml").write_text(dump_yaml(lr), encoding="utf-8")

    return {"ok": True, "exported_to": str(out_dir)}


@app.get("/api/sessions/{session_id}/export.zip")
def export_zip(session_id: str):
    res = export(session_id)
    if not isinstance(res, dict) or res.get("error"):
        msg = str(res.get("error") if isinstance(res, dict) else "not found")
        return Response(content=msg, media_type="text/plain", status_code=404)

    out_dir = Path(res.get("exported_to") or "")
    if not out_dir.exists():
        return Response(content="export dir not found", media_type="text/plain", status_code=500)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(out_dir.glob("*"), key=lambda x: x.name):
            if p.is_file():
                zf.write(p, arcname=p.name)

    buf.seek(0)

    st = get_storage()
    s = st.load(session_id)
    title = getattr(s, "title", None) if s else None
    title = re.sub(r"[^a-zA-Z0-9_\-]+", "_", str(title or "process")).strip("_") or "process"
    filename = f"{title}.zip"

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )

@app.get("/api/meta")
def api_meta():
    return {
        "api_version": 2,
        "features": {
            "bpmn": True,
            "export_zip": True,
            "graph_edit": True,
            "projects": True, "project_sessions": True,
        },
    }


# -----------------------------
# Epic #1: Projects + Process Passport
# -----------------------------

@app.get("/api/projects")
def list_projects() -> list[dict]:
    st = get_project_storage()
    items = st.list()
    return [p.model_dump() for p in items]


@app.post("/api/projects")
def create_project(inp: CreateProjectIn) -> dict:
    st = get_project_storage()
    pid = st.create(title=inp.title, passport=inp.passport)
    proj = st.load(pid)
    if not proj:
        raise HTTPException(status_code=500, detail="create failed")
    return proj.model_dump()


@app.get("/api/projects/{project_id}")
def get_project(project_id: str) -> dict:
    st = get_project_storage()
    proj = st.load(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    return proj.model_dump()


@app.patch("/api/projects/{project_id}")
def patch_project(project_id: str, inp: UpdateProjectIn) -> dict:
    st = get_project_storage()
    proj = st.load(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")

    payload = inp.model_dump(exclude_unset=True)

    if "title" in payload and payload["title"] is not None:
        t = str(payload["title"]).strip()
        if t:
            proj.title = t

    if "passport" in payload and payload["passport"] is not None:
        if not isinstance(payload["passport"], dict):
            raise HTTPException(status_code=400, detail="passport must be an object")
        merged = dict(proj.passport or {})
        merged.update(payload["passport"])
        proj.passport = merged

    st.save(proj)
    return proj.model_dump()


@app.put("/api/projects/{project_id}")
def put_project(project_id: str, inp: CreateProjectIn) -> dict:
    st = get_project_storage()
    proj = st.load(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")

    t = str(inp.title).strip()
    if not t:
        raise HTTPException(status_code=400, detail="title required")
    if not isinstance(inp.passport, dict):
        raise HTTPException(status_code=400, detail="passport must be an object")

    proj.title = t
    proj.passport = inp.passport or {}
    st.save(proj)
    return proj.model_dump()
