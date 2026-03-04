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
import threading
import smtplib
from email.message import EmailMessage
from collections import deque
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, ValidationError

from .exporters.mermaid import render_mermaid
from .exporters.yaml_export import dump_yaml, session_to_process_dict
from .glossary import normalize_kind, slugify_canon, upsert_term
from .models import Node, Edge, Question, ReportVersion, Session, Project, CreateProjectIn, UpdateProjectIn
from .analytics import compute_analytics
from .normalizer import load_seed_glossary, normalize_nodes
from .resources import build_resources_report
from .storage import (
    get_storage,
    get_project_storage,
    push_storage_request_scope,
    pop_storage_request_scope,
    list_user_org_memberships,
    resolve_active_org_id,
    user_has_org_membership,
    get_user_org_role,
    get_default_org_id,
    create_org_record,
    list_project_memberships,
    upsert_project_membership,
    delete_project_membership,
    get_effective_project_scope,
    user_has_project_access,
    list_org_memberships,
    upsert_org_membership,
    list_org_invites,
    create_org_invite,
    accept_org_invite,
    revoke_org_invite,
    delete_org_invite,
    cleanup_org_invites,
    append_audit_log,
    list_audit_log,
    cleanup_audit_log,
    list_workspace_snapshot_rows,
    list_templates as storage_list_templates,
    get_template as storage_get_template,
    create_template as storage_create_template,
    update_template as storage_update_template,
    delete_template as storage_delete_template,
)
from .settings import load_llm_settings, llm_status, save_llm_settings, verify_llm_settings
from .validators.coverage import build_questions
from .validators.disposition import build_disposition_questions
from .validators.loss import build_loss_questions, loss_report
from .rtiers import infer_rtiers, parse_bpmn_sequence_graph, resolve_inference_inputs
from .auth import (
    AuthError,
    authenticate_user,
    find_user_by_id,
    issue_login_tokens,
    refresh_cookie_samesite,
    refresh_cookie_secure,
    revoke_refresh_from_token,
    rotate_refresh_token,
    seed_admin_user_if_enabled,
    user_from_bearer_header,
)


app = FastAPI(title="Food Process Copilot MVP")

AUTH_PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/logout",
}

_ORG_PATH_RE = re.compile(r"^/api/orgs/([^/]+)(?:/|$)")
_ORG_WRITE_ROLES = {"org_owner", "org_admin"}
_ORG_EDITOR_ROLES = {"org_owner", "org_admin", "project_manager", "editor"}
_ORG_READ_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "auditor"}
_ORG_REPORT_DELETE_ROLES = {"org_owner", "org_admin", "project_manager"}
_ORG_PROJECT_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin", "project_manager"}
_ORG_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin"}
_ORG_INVITE_MANAGE_ROLES = {"org_owner", "org_admin"}
_ORG_AUDIT_READ_ROLES = {"org_owner", "org_admin", "auditor", "project_manager"}
_ORG_TEMPLATE_CREATE_ROLES = {"org_owner", "org_admin", "project_manager"}
_ORG_TEMPLATE_MANAGE_ROLES = {"org_owner", "org_admin"}

_RATE_LIMIT_LOCK = threading.RLock()
_RATE_LIMIT_BUCKETS: Dict[str, deque] = {}


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.environ.get(name, "") or "").strip().lower()
    if not raw:
        return bool(default)
    return raw in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = str(os.environ.get(name, "") or "").strip()
    try:
        value = int(raw or default)
    except Exception:
        value = int(default)
    return value


def _rate_limit_check(key: str, limit: int, window_sec: int = 60) -> bool:
    bucket_key = str(key or "").strip()
    if not bucket_key:
        return True
    cap = max(1, int(limit or 1))
    now = int(time.time())
    with _RATE_LIMIT_LOCK:
        bucket = _RATE_LIMIT_BUCKETS.get(bucket_key)
        if bucket is None:
            bucket = deque()
            _RATE_LIMIT_BUCKETS[bucket_key] = bucket
        threshold = now - max(1, int(window_sec or 60))
        while bucket and int(bucket[0] or 0) <= threshold:
            bucket.popleft()
        if len(bucket) >= cap:
            return False
        bucket.append(now)
    return True


def _extract_org_from_path(path: str) -> str:
    src = str(path or "").strip()
    m = _ORG_PATH_RE.match(src)
    if not m:
        return ""
    return str(m.group(1) or "").strip()


def _extract_org_from_headers(request: Request) -> str:
    v = str(request.headers.get("x-org-id") or request.headers.get("x-active-org-id") or "").strip()
    return v


def _request_auth_user(request: Request) -> Dict[str, Any]:
    user = getattr(request.state, "auth_user", None)
    if isinstance(user, dict):
        return user
    return {}


def _enterprise_error(status_code: int, code: str, message: str, details: Optional[Dict[str, Any]] = None) -> JSONResponse:
    payload = {
        "error": {
            "code": str(code or "error"),
            "message": str(message or "error"),
            "details": details or {},
        },
    }
    return JSONResponse(status_code=int(status_code), content=payload)


def _request_user_meta(request: Optional[Request]) -> Tuple[str, bool]:
    if request is None:
        return "", False
    user = _request_auth_user(request)
    return str(user.get("id") or "").strip(), bool(user.get("is_admin", False))


def _request_active_org_id(request: Optional[Request]) -> str:
    if request is None:
        return get_default_org_id()
    oid = str(getattr(request.state, "active_org_id", "") or "").strip()
    return oid or get_default_org_id()


def _project_scope_for_request(request: Optional[Request], org_id: str) -> Dict[str, Any]:
    uid, is_admin = _request_user_meta(request)
    oid = str(org_id or "").strip() or get_default_org_id()
    if not uid:
        return {"mode": "all", "project_ids": [], "org_role": ""}
    return get_effective_project_scope(uid, oid, is_admin=is_admin)


def _project_access_allowed(request: Optional[Request], org_id: str, project_id: str) -> bool:
    pid = str(project_id or "").strip()
    if not pid:
        return False
    scope = _project_scope_for_request(request, org_id)
    if str(scope.get("mode") or "") == "all":
        return True
    allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
    return pid in allowed

_REPORT_LOCKS_GUARD = threading.RLock()
_REPORT_LOCKS_BY_SESSION: Dict[str, threading.RLock] = {}
_PATH_REPORT_STALE_RUNNING_SEC = max(30, int(os.environ.get("PATH_REPORT_STALE_RUNNING_SEC", "180")))
_REPORT_ACTIVE_GUARD = threading.RLock()
_REPORT_ACTIVE_IDS: Set[str] = set()


def _report_session_lock(session_id: str) -> threading.RLock:
    sid = str(session_id or "").strip()
    with _REPORT_LOCKS_GUARD:
        lock = _REPORT_LOCKS_BY_SESSION.get(sid)
        if lock is None:
            lock = threading.RLock()
            _REPORT_LOCKS_BY_SESSION[sid] = lock
        return lock


def _set_report_active(report_id: str, is_active: bool) -> None:
    rid = str(report_id or "").strip()
    if not rid:
        return
    with _REPORT_ACTIVE_GUARD:
        if is_active:
            _REPORT_ACTIVE_IDS.add(rid)
        else:
            _REPORT_ACTIVE_IDS.discard(rid)


def _is_report_active(report_id: str) -> bool:
    rid = str(report_id or "").strip()
    if not rid:
        return False
    with _REPORT_ACTIVE_GUARD:
        return rid in _REPORT_ACTIVE_IDS


def _set_refresh_cookie(resp: Response, refresh_token: str, max_age_seconds: int) -> None:
    resp.set_cookie(
        key="refresh_token",
        value=str(refresh_token or ""),
        httponly=True,
        secure=refresh_cookie_secure(),
        samesite=refresh_cookie_samesite(),
        max_age=max(1, int(max_age_seconds)),
        path="/api/auth/",
    )


def _clear_refresh_cookie(resp: Response) -> None:
    resp.delete_cookie(
        key="refresh_token",
        path="/api/auth/",
        secure=refresh_cookie_secure(),
        samesite=refresh_cookie_samesite(),
    )


def _request_client_ip(request: Request) -> str:
    headers = getattr(request, "headers", {}) or {}
    forwarded = headers.get("x-forwarded-for") if hasattr(headers, "get") else None
    if forwarded:
        return str(forwarded).split(",")[0].strip()[:120]
    client = getattr(request, "client", None)
    host = getattr(client, "host", "") if client is not None else ""
    if host:
        return str(host)[:120]
    return ""


def _auth_error_response(detail: str = "unauthorized") -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(detail or "unauthorized")})


seed_admin_user_if_enabled()

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
    d["bpmn_meta"] = _normalize_bpmn_meta(d.get("bpmn_meta"))
    return d


def _get_report_versions_by_path(interview_raw: Any) -> Dict[str, List[Dict[str, Any]]]:
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    raw = interview.get("report_versions")
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, List[Dict[str, Any]]] = {}
    for path_id_raw, versions_raw in raw.items():
        path_id = str(path_id_raw or "").strip()
        if not path_id:
            continue
        rows: List[Dict[str, Any]] = []
        for item_raw in (versions_raw or []):
            if not isinstance(item_raw, dict):
                continue
            try:
                model = ReportVersion.model_validate(item_raw)
            except Exception:
                continue
            rows.append(model.model_dump())
        rows.sort(key=lambda x: int(x.get("version") or 0))
        out[path_id] = rows
    return out


def _set_report_versions_by_path(sess: Session, by_path: Dict[str, List[Dict[str, Any]]]) -> None:
    interview = dict(getattr(sess, "interview", {}) or {})
    interview["report_versions"] = by_path
    sess.interview = interview


def _merge_interview_with_server_fields(existing_raw: Any, incoming_raw: Any) -> Dict[str, Any]:
    existing = existing_raw if isinstance(existing_raw, dict) else {}
    incoming = _norm_interview(incoming_raw)
    out = dict(incoming)
    for key in ("report_versions", "path_reports"):
        current_value = existing.get(key)
        incoming_value = incoming.get(key)
        if isinstance(current_value, dict) and current_value:
            out[key] = current_value
            continue
        if isinstance(current_value, dict) and not current_value:
            if isinstance(incoming_value, dict):
                out[key] = incoming_value
            else:
                out.pop(key, None)
            continue
        if isinstance(incoming_value, dict):
            out[key] = incoming_value
        else:
            out.pop(key, None)
    return out


def _next_report_version(by_path: Dict[str, List[Dict[str, Any]]], path_id: str) -> int:
    rows = by_path.get(path_id) or []
    max_ver = 0
    for row in rows:
        try:
            max_ver = max(max_ver, int(row.get("version") or 0))
        except Exception:
            continue
    return max_ver + 1


def _set_latest_path_report_pointer(sess: Session, path_id: str, row_raw: Any) -> None:
    pid = str(path_id or "").strip()
    row = row_raw if isinstance(row_raw, dict) else {}
    if not pid:
        return
    interview = dict(getattr(sess, "interview", {}) or {})
    latest_raw = interview.get("path_reports")
    latest_by_path = dict(latest_raw) if isinstance(latest_raw, dict) else {}
    payload_normalized = row.get("payload_normalized") or row.get("report_json") or {}
    payload_raw = row.get("payload_raw")
    latest_by_path[pid] = {
        "id": str(row.get("id") or ""),
        "version": int(row.get("version") or 0),
        "steps_hash": str(row.get("steps_hash") or ""),
        "created_at": int(row.get("created_at") or 0),
        "status": str(row.get("status") or "error"),
        "model": str(row.get("model") or "deepseek-chat"),
        "prompt_template_version": str(row.get("prompt_template_version") or "v2"),
        "payload_normalized": payload_normalized,
        "payload_raw": payload_raw if payload_raw is not None else {},
        "report_json": payload_normalized,
        "raw_json": row.get("raw_json") or (payload_raw if isinstance(payload_raw, dict) else {}),
        "report_markdown": str(row.get("report_markdown") or row.get("raw_text") or ""),
        "recommendations": row.get("recommendations_json") or payload_normalized.get("recommendations") or [],
        "missing_data": row.get("missing_data_json") or payload_normalized.get("missing_data") or [],
        "risks": row.get("risks_json") or payload_normalized.get("risks") or [],
        "warnings": row.get("warnings_json") or [],
    }
    interview["path_reports"] = latest_by_path
    sess.interview = interview


def _clear_latest_path_report_pointer(sess: Session, path_id: str) -> None:
    pid = str(path_id or "").strip()
    if not pid:
        return
    interview = dict(getattr(sess, "interview", {}) or {})
    latest_raw = interview.get("path_reports")
    latest_by_path = dict(latest_raw) if isinstance(latest_raw, dict) else {}
    if pid in latest_by_path:
        latest_by_path.pop(pid, None)
    interview["path_reports"] = latest_by_path
    sess.interview = interview


def _recompute_latest_path_report_pointer(sess: Session, path_id: str, rows_raw: Any) -> None:
    pid = str(path_id or "").strip()
    rows = list(rows_raw or [])
    if not pid:
        return
    if not rows:
        _clear_latest_path_report_pointer(sess, pid)
        return
    ordered = sorted(rows, key=lambda x: int((x or {}).get("version") or 0), reverse=True)
    _set_latest_path_report_pointer(sess, pid, ordered[0])


def _is_retryable_report_generation_error(exc: Exception) -> bool:
    msg = str(exc or "").strip().lower()
    if not msg:
        return False
    tokens = (
        "response ended prematurely",
        "incomplete read",
        "connection aborted",
        "connection reset",
        "timed out",
        "temporarily unavailable",
        "remote disconnected",
        "chunkedencodingerror",
        "read timed out",
    )
    return any(tok in msg for tok in tokens)


def _compact_path_report_payload(payload_raw: Any, *, max_steps: int = 90, notes_limit: int = 240) -> Tuple[Dict[str, Any], bool]:
    payload = payload_raw if isinstance(payload_raw, dict) else {}
    out = dict(payload)
    steps_raw = list(payload.get("steps") or []) if isinstance(payload.get("steps"), list) else []
    if not steps_raw:
        return out, False

    trimmed: List[Dict[str, Any]] = []
    for step_raw in steps_raw[:max(1, int(max_steps or 1))]:
        step = step_raw if isinstance(step_raw, dict) else {}
        item: Dict[str, Any] = {
            "order_index": int(step.get("order_index") or 0),
            "title": str(step.get("title") or "").strip(),
            "lane_name": str(step.get("lane_name") or "").strip() or None,
            "work_duration_sec": step.get("work_duration_sec"),
            "wait_duration_sec": step.get("wait_duration_sec"),
            "is_decision": bool(step.get("is_decision")),
        }
        decision = step.get("decision")
        if isinstance(decision, dict):
            item["decision"] = {
                "selected_label": str(decision.get("selected_label") or "").strip() or None,
                "condition": str(decision.get("condition") or "").strip() or None,
                "selected_flow_id": str(decision.get("selected_flow_id") or "").strip() or None,
            }
        notes = str(step.get("notes") or "").strip()
        if notes:
            item["notes"] = notes[: max(16, int(notes_limit or 16))]
        trimmed.append(item)

    changed = len(trimmed) != len(steps_raw) or any(
        str((a or {}).get("notes") or "").strip() != str((b or {}).get("notes") or "").strip()
        for a, b in zip(trimmed, steps_raw[: len(trimmed)])
    )
    if not changed:
        return out, False

    out["steps"] = trimmed
    meta = dict(out.get("_meta") or {}) if isinstance(out.get("_meta"), dict) else {}
    meta["compacted_for_llm"] = True
    meta["original_steps_count"] = len(steps_raw)
    meta["sent_steps_count"] = len(trimmed)
    out["_meta"] = meta
    return out, True


def _mark_stale_running_reports(sess: Session, now_ts: Optional[int] = None) -> bool:
    current_ts = int(now_ts or time.time())
    stale_after = max(30, int(_PATH_REPORT_STALE_RUNNING_SEC))
    by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
    changed = False

    for pid, rows_raw in list(by_path.items()):
        rows = list(rows_raw or [])
        path_changed = False
        for idx, row_raw in enumerate(rows):
            row = dict(row_raw or {})
            if str(row.get("status") or "").strip().lower() != "running":
                continue
            if _is_report_active(str(row.get("id") or "")):
                continue
            created_at = int(row.get("created_at") or 0)
            age_sec = (current_ts - created_at) if created_at > 0 else stale_after + 1
            if age_sec < stale_after:
                continue
            has_markdown = bool(str(row.get("report_markdown") or row.get("raw_text") or "").strip())
            has_structured = isinstance(row.get("report_json"), dict) and bool(row.get("report_json"))
            if has_markdown or has_structured:
                row["status"] = "ok"
                row["error_message"] = None
            else:
                row["status"] = "error"
                if not str(row.get("error_message") or "").strip():
                    row["error_message"] = "report generation interrupted (stale running state)"
            rows[idx] = row
            changed = True
            path_changed = True
        if path_changed:
            by_path[pid] = rows

    if not changed:
        return False

    _set_report_versions_by_path(sess, by_path)
    for pid, rows in by_path.items():
        ordered = sorted(rows or [], key=lambda x: int((x or {}).get("version") or 0), reverse=True)
        if ordered:
            _set_latest_path_report_pointer(sess, pid, ordered[0])
    return True


def _patch_report_version_row(
    session_id: str,
    path_id: str,
    report_id: str,
    patch_fn: Callable[[Dict[str, Any]], None],
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    sid = str(session_id or "").strip()
    pid = str(path_id or "").strip()
    rid = str(report_id or "").strip()
    if not sid or not pid or not rid:
        return None

    st = get_storage()
    org = str(org_id or "").strip() or None
    admin = bool(is_admin) if is_admin is not None else None
    lock = _report_session_lock(sid)
    with lock:
        sess = st.load(sid, org_id=org, is_admin=admin)
        if not sess:
            return None

        by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
        rows = list(by_path.get(pid) or [])
        target_idx = -1
        target_row: Dict[str, Any] = {}
        for idx, row in enumerate(rows):
            if str((row or {}).get("id") or "").strip() == rid:
                target_idx = idx
                target_row = dict(row or {})
                break
        if target_idx < 0:
            return None

        patch_fn(target_row)
        rows[target_idx] = target_row
        by_path[pid] = rows
        _set_report_versions_by_path(sess, by_path)
        _set_latest_path_report_pointer(sess, pid, target_row)
        st.save(sess, org_id=org, is_admin=admin)
        return target_row


def _delete_report_version_row(
    session_id: str,
    path_id: str,
    report_id: str,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    sid = str(session_id or "").strip()
    pid = str(path_id or "").strip()
    rid = str(report_id or "").strip()
    if not sid or not pid or not rid:
        return None

    st = get_storage()
    org = str(org_id or "").strip() or None
    admin = bool(is_admin) if is_admin is not None else None
    lock = _report_session_lock(sid)
    with lock:
        sess = st.load(sid, org_id=org, is_admin=admin)
        if not sess:
            return None
        by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
        rows = list(by_path.get(pid) or [])
        target_idx = -1
        deleted_row: Dict[str, Any] = {}
        for idx, row in enumerate(rows):
            if str((row or {}).get("id") or "").strip() != rid:
                continue
            target_idx = idx
            deleted_row = dict(row or {})
            break
        if target_idx < 0:
            return None

        rows.pop(target_idx)
        if rows:
            by_path[pid] = rows
        else:
            by_path.pop(pid, None)
        _set_report_versions_by_path(sess, by_path)
        _recompute_latest_path_report_pointer(sess, pid, rows)
        st.save(sess, org_id=org, is_admin=admin)
        return deleted_row


def _delete_report_version_global(
    report_id: str,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    session_ids: Optional[Set[str]] = None,
) -> Optional[Dict[str, Any]]:
    rid = str(report_id or "").strip()
    if not rid:
        return None

    st = get_storage()
    org = str(org_id or "").strip() or None
    admin = bool(is_admin) if is_admin is not None else None
    allowed_sessions = {str(item or "").strip() for item in (session_ids or set()) if str(item or "").strip()}
    for raw in st.list(limit=5000, org_id=org, is_admin=admin):
        sid = str((raw or {}).get("id") or "").strip()
        if not sid:
            continue
        if allowed_sessions and sid not in allowed_sessions:
            continue
        sess = st.load(sid, org_id=org, is_admin=admin)
        if not sess:
            continue
        by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
        for pid, rows in by_path.items():
            for row in (rows or []):
                if str((row or {}).get("id") or "").strip() == rid:
                    deleted = _delete_report_version_row(sid, pid, rid, org_id=org, is_admin=admin)
                    if not deleted:
                        return None
                    return {"session_id": sid, "path_id": pid, "deleted": deleted}
    return None


def _run_path_report_generation_async(
    session_id: str,
    path_id: str,
    report_id: str,
    request_payload_json: Dict[str, Any],
    prompt_template_version: str,
    model_name: str,
    org_id: Optional[str] = None,
) -> None:
    sid = str(session_id or "").strip()
    pid = str(path_id or "").strip()
    rid = str(report_id or "").strip()
    payload = request_payload_json if isinstance(request_payload_json, dict) else {}
    prompt_ver = str(prompt_template_version or "v2").strip() or "v2"
    fallback_model = str(model_name or "deepseek-chat").strip() or "deepseek-chat"
    org_scope = str(org_id or "").strip() or None
    if not sid or not pid or not rid:
        return
    _set_report_active(rid, True)

    try:
        def _finish_error(message: str) -> None:
            text = str(message or "deepseek failed")

            def _apply(row: Dict[str, Any]) -> None:
                row["status"] = "error"
                row["error_message"] = text
                row["warnings_json"] = row.get("warnings_json") or []

            _patch_report_version_row(sid, pid, rid, _apply, org_id=org_scope, is_admin=True)

        llm = load_llm_settings()
        api_key = str(llm.get("api_key") or "").strip()
        base_url = str(llm.get("base_url") or "").strip()
        if not api_key:
            _finish_error("deepseek api_key is not set")
            return

        try:
            from .ai.deepseek_questions import generate_path_report
        except Exception as e:
            _finish_error(f"deepseek questions module not available: {e}")
            return

        try:
            report_result = generate_path_report(
                payload=payload,
                api_key=api_key,
                base_url=base_url,
                prompt_template_version=prompt_ver,
            )
            used_compact_retry = False
        except Exception as first_error:
            report_result = None
            used_compact_retry = False
            compact_payload, compact_changed = _compact_path_report_payload(payload)
            if _is_retryable_report_generation_error(first_error) and compact_changed:
                try:
                    report_result = generate_path_report(
                        payload=compact_payload,
                        api_key=api_key,
                        base_url=base_url,
                        prompt_template_version=prompt_ver,
                    )
                    used_compact_retry = True
                except Exception as second_error:
                    _finish_error(f"deepseek failed: {second_error}")
                    return
            else:
                _finish_error(f"deepseek failed: {first_error}")
                return

        if used_compact_retry and isinstance(report_result, dict):
            warnings = list(report_result.get("warnings") or [])
            if "payload_compacted_retry" not in warnings:
                warnings.append("payload_compacted_retry")
            report_result = {**report_result, "warnings": warnings}

        def _apply_success(row: Dict[str, Any]) -> None:
            payload_normalized = report_result.get("payload_normalized") or report_result.get("report_json") or {}
            payload_raw = report_result.get("payload_raw")
            row["status"] = "ok"
            row["model"] = str(report_result.get("model") or fallback_model)
            row["prompt_template_version"] = str(report_result.get("prompt_template_version") or prompt_ver)
            row["report_markdown"] = str(report_result.get("report_markdown") or report_result.get("raw_text") or "")
            row["payload_normalized"] = payload_normalized
            row["payload_raw"] = payload_raw if payload_raw is not None else {}
            row["report_json"] = payload_normalized
            row["raw_json"] = report_result.get("raw_json") or (payload_raw if isinstance(payload_raw, dict) else {})
            row["recommendations_json"] = payload_normalized.get("recommendations") or report_result.get("recommendations") or []
            row["missing_data_json"] = payload_normalized.get("missing_data") or report_result.get("missing_data") or []
            row["risks_json"] = payload_normalized.get("risks") or report_result.get("risks") or []
            row["warnings_json"] = report_result.get("warnings") or []
            row["error_message"] = None
            row["raw_text"] = str(report_result.get("raw_text") or "")

        _patch_report_version_row(sid, pid, rid, _apply_success, org_id=org_scope, is_admin=True)
    finally:
        _set_report_active(rid, False)


def _find_report_version(sess: Session, report_id: str) -> Optional[Dict[str, Any]]:
    rid = str(report_id or "").strip()
    if not rid:
        return None
    by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
    for versions in by_path.values():
        for row in versions:
            if str(row.get("id") or "").strip() == rid:
                return row
    return None


def _find_report_version_global(
    report_id: str,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    session_ids: Optional[Set[str]] = None,
) -> Optional[Dict[str, Any]]:
    rid = str(report_id or "").strip()
    if not rid:
        return None

    st = get_storage()
    org = str(org_id or "").strip() or None
    admin = bool(is_admin) if is_admin is not None else None
    allowed_sessions = {str(item or "").strip() for item in (session_ids or set()) if str(item or "").strip()}
    for raw in st.list(limit=5000, org_id=org, is_admin=admin):
        sid = str((raw or {}).get("id") or "").strip()
        if not sid:
            continue
        if allowed_sessions and sid not in allowed_sessions:
            continue
        sess = st.load(sid, org_id=org, is_admin=admin)
        if not sess:
            continue
        if _mark_stale_running_reports(sess):
            st.save(sess, org_id=org, is_admin=admin)
        found = _find_report_version(sess, rid)
        if found:
            return found
    return None


def _ln_tag(tag: str) -> str:
    if "}" in str(tag or ""):
        return str(tag).rsplit("}", 1)[-1].lower()
    return str(tag or "").lower()


def _collect_sequence_flow_meta(xml_text: str) -> Dict[str, Any]:
    raw = str(xml_text or "").strip()
    if not raw:
        return {
            "flow_ids": set(),
            "node_ids": set(),
            "flow_source_by_id": {},
            "flow_target_by_id": {},
            "outgoing_by_source": {},
            "gateway_mode_by_node": {},
        }

    try:
        root = ET.fromstring(raw)
    except Exception:
        return {
            "flow_ids": set(),
            "node_ids": set(),
            "flow_source_by_id": {},
            "flow_target_by_id": {},
            "outgoing_by_source": {},
            "gateway_mode_by_node": {},
        }

    flow_node_kinds = {
        "startevent",
        "endevent",
        "boundaryevent",
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
        "eventbasedgateway",
        "parallelgateway",
        "intermediatecatchevent",
        "intermediatethrowevent",
        "intermediateevent",
    }
    node_ids: Set[str] = set()
    gateway_mode_by_node: Dict[str, str] = {}
    gateway_type_map = {
        "exclusivegateway": "xor",
        "inclusivegateway": "inclusive",
        "parallelgateway": "parallel",
        "eventbasedgateway": "event",
    }
    for el in root.iter():
        local = _ln_tag(str(getattr(el, "tag", "") or ""))
        if local in flow_node_kinds:
            node_id = str(el.attrib.get("id") or "").strip()
            if node_id:
                node_ids.add(node_id)
        mode = gateway_type_map.get(local)
        if not mode:
            continue
        node_id = str(el.attrib.get("id") or "").strip()
        if not node_id:
            continue
        gateway_mode_by_node[node_id] = mode

    flow_ids: Set[str] = set()
    flow_source_by_id: Dict[str, str] = {}
    flow_target_by_id: Dict[str, str] = {}
    outgoing_by_source: Dict[str, List[str]] = {}
    for el in root.iter():
        if _ln_tag(str(getattr(el, "tag", "") or "")) != "sequenceflow":
            continue
        flow_id = str(el.attrib.get("id") or "").strip()
        source_id = str(el.attrib.get("sourceRef") or "").strip()
        target_id = str(el.attrib.get("targetRef") or "").strip()
        if not flow_id or not source_id or not target_id:
            continue
        flow_ids.add(flow_id)
        flow_source_by_id[flow_id] = source_id
        flow_target_by_id[flow_id] = target_id
        outgoing_by_source.setdefault(source_id, []).append(flow_id)

    return {
        "flow_ids": flow_ids,
        "node_ids": node_ids,
        "flow_source_by_id": flow_source_by_id,
        "flow_target_by_id": flow_target_by_id,
        "outgoing_by_source": outgoing_by_source,
        "gateway_mode_by_node": gateway_mode_by_node,
    }


_FLOW_TIERS: Set[str] = {"P0", "P1", "P2"}
_R_FLOW_TIERS: Set[str] = {"R0", "R1", "R2"}
_NODE_PATH_CODES: Tuple[str, ...] = ("P0", "P1", "P2")
_NODE_PATH_CODE_SET: Set[str] = set(_NODE_PATH_CODES)
_NODE_PATH_SOURCE_SET: Set[str] = {"manual", "color_auto"}
_FLOW_META_R_SOURCE_SET: Set[str] = {"manual", "inferred"}


def _normalize_flow_tier(value: Any) -> Optional[str]:
    txt = str(value or "").strip().upper()
    if txt in _FLOW_TIERS:
        return txt
    return None


def _normalize_r_flow_tier(value: Any) -> Optional[str]:
    txt = str(value or "").strip().upper()
    if txt in _R_FLOW_TIERS:
        return txt
    return None


def _normalize_flow_meta_r_source(value: Any) -> str:
    src = str(value or "").strip().lower()
    if src in _FLOW_META_R_SOURCE_SET:
        return src
    return ""


def _normalize_flow_meta_entry(entry_raw: Any) -> Optional[Dict[str, Any]]:
    entry = entry_raw if isinstance(entry_raw, dict) else {}
    tier = _entry_to_flow_tier(entry_raw)
    rtier = _normalize_r_flow_tier(entry.get("rtier"))

    out: Dict[str, Any] = {}
    if tier:
        out["tier"] = tier
    if rtier:
        out["rtier"] = rtier
        source = _normalize_flow_meta_r_source(entry.get("source"))
        out["source"] = source or "manual"

        scope_start_id = str(entry.get("scopeStartId", entry.get("scope_start_id")) or "").strip()
        if scope_start_id:
            out["scopeStartId"] = scope_start_id

        algo_version = str(entry.get("algoVersion", entry.get("algo_version")) or "").strip()
        if algo_version:
            out["algoVersion"] = algo_version

        computed_at_iso = str(entry.get("computedAtIso", entry.get("computed_at_iso")) or "").strip()
        if computed_at_iso:
            out["computedAtIso"] = computed_at_iso

        reason = str(entry.get("reason") or "").strip()
        if reason:
            out["reason"] = reason

    return out or None


def _normalize_node_path_code(value: Any) -> Optional[str]:
    code = str(value or "").strip().upper()
    if code in _NODE_PATH_CODE_SET:
        return code
    return None


def _normalize_node_paths(value: Any) -> List[str]:
    raw_list = value if isinstance(value, list) else [value]
    seen: Set[str] = set()
    out: List[str] = []
    for item in raw_list:
        code = _normalize_node_path_code(item)
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    order_index = {code: idx for idx, code in enumerate(_NODE_PATH_CODES)}
    out.sort(key=lambda code: order_index.get(code, 99))
    return out


def _normalize_sequence_key(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    compact = re.sub(r"\s+", "_", raw)
    compact = re.sub(r"[^a-z0-9_\-]+", "_", compact)
    compact = re.sub(r"_+", "_", compact).strip("_")
    return compact[:64]


def _normalize_node_path_source(value: Any) -> str:
    src = str(value or "").strip().lower()
    if src in _NODE_PATH_SOURCE_SET:
        return src
    return "manual"


def _normalize_node_path_entry(entry_raw: Any) -> Optional[Dict[str, Any]]:
    entry = entry_raw if isinstance(entry_raw, dict) else {}
    paths = _normalize_node_paths(entry.get("paths", entry.get("path")))
    if not paths:
        tier_as_path = _normalize_node_path_code(entry.get("tier"))
        if tier_as_path:
            paths = [tier_as_path]
    if not paths:
        return None
    sequence_key = _normalize_sequence_key(entry.get("sequence_key", entry.get("sequenceKey")))
    source = _normalize_node_path_source(entry.get("source"))
    out: Dict[str, Any] = {
        "paths": paths,
        "source": source,
    }
    if sequence_key:
        out["sequence_key"] = sequence_key
    return out


def _robot_meta_as_text(value: Any) -> str:
    return str(value or "").strip()


def _robot_meta_as_nullable_text(value: Any) -> Optional[str]:
    text = _robot_meta_as_text(value)
    return text or None


def _robot_meta_as_non_negative_int(value: Any, fallback: int) -> int:
    try:
        num = int(round(float(value)))
    except Exception:
        num = int(fallback)
    return max(num, 0)


def _robot_meta_as_nullable_non_negative_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        num = int(round(float(value)))
    except Exception:
        return None
    return max(num, 0)


def _stable_robot_meta_value(value: Any) -> Any:
    if isinstance(value, list):
        return [_stable_robot_meta_value(item) for item in value]
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key in sorted(value.keys(), key=lambda x: str(x)):
            out[str(key)] = _stable_robot_meta_value(value[key])
        return out
    return value


def _normalize_robot_meta_v1(entry_raw: Any) -> Optional[Dict[str, Any]]:
    entry = entry_raw if isinstance(entry_raw, dict) else {}
    exec_raw = entry.get("exec") if isinstance(entry.get("exec"), dict) else {}
    retry_raw = exec_raw.get("retry") if isinstance(exec_raw.get("retry"), dict) else {}
    mat_raw = entry.get("mat") if isinstance(entry.get("mat"), dict) else {}
    qc_raw = entry.get("qc") if isinstance(entry.get("qc"), dict) else {}

    mode = str(exec_raw.get("mode") or "").strip().lower()
    if mode not in {"human", "machine", "hybrid"}:
        mode = "human"

    executor = _robot_meta_as_text(exec_raw.get("executor") or "manual_ui") or "manual_ui"
    action_key = _robot_meta_as_nullable_text(exec_raw.get("action_key"))
    timeout_sec = _robot_meta_as_nullable_non_negative_int(exec_raw.get("timeout_sec"))
    max_attempts = _robot_meta_as_non_negative_int(retry_raw.get("max_attempts"), 1)
    backoff_sec = _robot_meta_as_non_negative_int(retry_raw.get("backoff_sec"), 0)

    inputs = entry_raw.get("mat", {}).get("inputs") if isinstance(entry_raw, dict) and isinstance(entry_raw.get("mat"), dict) else None
    outputs = entry_raw.get("mat", {}).get("outputs") if isinstance(entry_raw, dict) and isinstance(entry_raw.get("mat"), dict) else None
    checks = qc_raw.get("checks")

    return {
        "robot_meta_version": "v1",
        "exec": {
            "mode": mode,
            "executor": executor,
            "action_key": action_key,
            "timeout_sec": timeout_sec,
            "retry": {
                "max_attempts": max_attempts,
                "backoff_sec": backoff_sec,
            },
        },
        "mat": {
            "from_zone": _robot_meta_as_nullable_text(mat_raw.get("from_zone")),
            "to_zone": _robot_meta_as_nullable_text(mat_raw.get("to_zone")),
            "inputs": _stable_robot_meta_value(inputs) if isinstance(inputs, list) else [],
            "outputs": _stable_robot_meta_value(outputs) if isinstance(outputs, list) else [],
        },
        "qc": {
            "critical": bool(qc_raw.get("critical")),
            "checks": _stable_robot_meta_value(checks) if isinstance(checks, list) else [],
        },
    }


def _normalize_robot_meta_map(
    value: Any,
    *,
    allowed_node_ids: Optional[Set[str]] = None,
) -> Dict[str, Dict[str, Any]]:
    raw = value if isinstance(value, dict) else {}
    out: Dict[str, Dict[str, Any]] = {}
    for element_id_raw in sorted(raw.keys(), key=lambda x: str(x)):
        element_id = str(element_id_raw or "").strip()
        if not element_id:
            continue
        if allowed_node_ids is not None and element_id not in allowed_node_ids:
            continue
        normalized_entry = _normalize_robot_meta_v1(raw.get(element_id_raw))
        if not normalized_entry:
            continue
        out[element_id] = normalized_entry
    return out


def _normalize_hybrid_layer_map(
    value: Any,
    *,
    allowed_node_ids: Optional[Set[str]] = None,
) -> Dict[str, Dict[str, float]]:
    raw = value if isinstance(value, dict) else {}
    out: Dict[str, Dict[str, float]] = {}
    for element_id_raw in sorted(raw.keys(), key=lambda x: str(x)):
        element_id = str(element_id_raw or "").strip()
        if not element_id:
            continue
        # Hybrid layer UI can carry anchors that temporarily do not resolve in the
        # current BPMN graph snapshot; keep them to avoid silent data loss.
        _ = allowed_node_ids
        row = raw.get(element_id_raw) if isinstance(raw.get(element_id_raw), dict) else {}
        try:
            dx = float(row.get("dx", row.get("x", 0)))
        except Exception:
            dx = 0.0
        try:
            dy = float(row.get("dy", row.get("y", 0)))
        except Exception:
            dy = 0.0
        if not math.isfinite(dx):
            dx = 0.0
        if not math.isfinite(dy):
            dy = 0.0
        out[element_id] = {
            "dx": round(dx, 3),
            "dy": round(dy, 3),
        }
    return out


def _normalize_hybrid_v2(value: Any) -> Dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    layers_raw = raw.get("layers") if isinstance(raw.get("layers"), list) else []
    layers: List[Dict[str, Any]] = []
    seen_layer_ids: Set[str] = set()
    for idx, layer_raw in enumerate(layers_raw):
        layer = layer_raw if isinstance(layer_raw, dict) else {}
        layer_id = str(layer.get("id") or "").strip() or f"L{idx + 1}"
        if not layer_id or layer_id in seen_layer_ids:
            continue
        seen_layer_ids.add(layer_id)
        try:
            opacity = float(layer.get("opacity", 1.0))
        except Exception:
            opacity = 1.0
        if not math.isfinite(opacity):
            opacity = 1.0
        layers.append({
            "id": layer_id,
            "name": str(layer.get("name") or "").strip() or ("Hybrid" if layer_id == "L1" else f"Layer {idx + 1}"),
            "visible": layer.get("visible") is not False,
            "locked": bool(layer.get("locked")),
            "opacity": round(max(0.1, min(1.0, opacity)), 3),
        })
    if not layers:
        layers = [{
            "id": "L1",
            "name": "Hybrid",
            "visible": True,
            "locked": False,
            "opacity": 1.0,
        }]
        seen_layer_ids = {"L1"}

    elements_raw = raw.get("elements") if isinstance(raw.get("elements"), list) else []
    elements: List[Dict[str, Any]] = []
    seen_element_ids: Set[str] = set()
    for idx, element_raw in enumerate(elements_raw):
        element = element_raw if isinstance(element_raw, dict) else {}
        element_id = str(element.get("id") or "").strip() or f"E{idx + 1}"
        if not element_id or element_id in seen_element_ids:
            continue
        seen_element_ids.add(element_id)
        layer_id = str(element.get("layer_id") or element.get("layerId") or "").strip() or "L1"
        if layer_id not in seen_layer_ids:
            layer_id = "L1"
        element_type = str(element.get("type") or "").strip().lower()
        if element_type not in {"rect", "text", "note"}:
            element_type = "note"
        try:
            x = float(element.get("x", 120))
        except Exception:
            x = 120.0
        try:
            y = float(element.get("y", 120))
        except Exception:
            y = 120.0
        try:
            w = float(element.get("w", 180 if element_type == "text" else 200))
        except Exception:
            w = 180.0
        try:
            h = float(element.get("h", 34 if element_type == "text" else 70))
        except Exception:
            h = 70.0
        style_raw = element.get("style") if isinstance(element.get("style"), dict) else {}
        try:
            radius = float(style_raw.get("radius", 8))
        except Exception:
            radius = 8.0
        try:
            font_size = float(style_raw.get("fontSize", 12))
        except Exception:
            font_size = 12.0
        elements.append({
            "id": element_id,
            "layer_id": layer_id,
            "type": element_type,
            "x": round(x, 3) if math.isfinite(x) else 120.0,
            "y": round(y, 3) if math.isfinite(y) else 120.0,
            "w": round(max(36.0, min(2200.0, w if math.isfinite(w) else 180.0)), 3),
            "h": round(max(20.0, min(1200.0, h if math.isfinite(h) else 70.0)), 3),
            "text": str(element.get("text") or "").strip(),
            "style": {
                "stroke": str(style_raw.get("stroke") or "#334155").strip() or "#334155",
                "fill": str(style_raw.get("fill") or ("#fff7d6" if element_type == "note" else "#f8fafc")).strip() or "#f8fafc",
                "radius": round(max(0.0, min(24.0, radius if math.isfinite(radius) else 8.0)), 3),
                "fontSize": int(max(10, min(24, round(font_size if math.isfinite(font_size) else 12.0)))),
            },
        })

    edge_raw_list = raw.get("edges") if isinstance(raw.get("edges"), list) else []
    edges: List[Dict[str, Any]] = []
    seen_edge_ids: Set[str] = set()
    for idx, edge_raw in enumerate(edge_raw_list):
        edge = edge_raw if isinstance(edge_raw, dict) else {}
        edge_id = str(edge.get("id") or "").strip() or f"A{idx + 1}"
        if not edge_id or edge_id in seen_edge_ids:
            continue
        seen_edge_ids.add(edge_id)
        layer_id = str(edge.get("layer_id") or edge.get("layerId") or "").strip() or "L1"
        if layer_id not in seen_layer_ids:
            layer_id = "L1"
        from_raw = edge.get("from") if isinstance(edge.get("from"), dict) else {}
        to_raw = edge.get("to") if isinstance(edge.get("to"), dict) else {}
        from_id = str(from_raw.get("element_id") or from_raw.get("elementId") or "").strip()
        to_id = str(to_raw.get("element_id") or to_raw.get("elementId") or "").strip()
        if from_id not in seen_element_ids or to_id not in seen_element_ids:
            continue
        style_raw = edge.get("style") if isinstance(edge.get("style"), dict) else {}
        try:
            stroke_width = float(style_raw.get("width", 2))
        except Exception:
            stroke_width = 2.0
        waypoints_raw = edge.get("waypoints") if isinstance(edge.get("waypoints"), list) else []
        waypoints: List[Dict[str, float]] = []
        for point_raw in waypoints_raw:
            point = point_raw if isinstance(point_raw, dict) else {}
            try:
                px = float(point.get("x"))
                py = float(point.get("y"))
            except Exception:
                continue
            if not math.isfinite(px) or not math.isfinite(py):
                continue
            waypoints.append({"x": round(px, 3), "y": round(py, 3)})
        edges.append({
            "id": edge_id,
            "layer_id": layer_id,
            "type": "arrow",
            "from": {
                "element_id": from_id,
                "anchor": str(from_raw.get("anchor") or "auto").strip() or "auto",
            },
            "to": {
                "element_id": to_id,
                "anchor": str(to_raw.get("anchor") or "auto").strip() or "auto",
            },
            "waypoints": waypoints,
            "style": {
                "stroke": str(style_raw.get("stroke") or "#2563eb").strip() or "#2563eb",
                "width": round(max(1.0, min(8.0, stroke_width if math.isfinite(stroke_width) else 2.0)), 3),
            },
        })

    valid_hybrid_ids: Set[str] = set(seen_element_ids) | set(seen_edge_ids)
    bindings_raw = raw.get("bindings") if isinstance(raw.get("bindings"), list) else []
    bindings: List[Dict[str, Any]] = []
    seen_binding_keys: Set[str] = set()
    for binding_raw in bindings_raw:
        binding = binding_raw if isinstance(binding_raw, dict) else {}
        hybrid_id = str(binding.get("hybrid_id") or binding.get("hybridId") or "").strip()
        bpmn_id = str(binding.get("bpmn_id") or binding.get("bpmnId") or "").strip()
        kind = str(binding.get("kind") or "node").strip().lower()
        if kind not in {"node", "edge"}:
            kind = "node"
        if not hybrid_id or not bpmn_id or hybrid_id not in valid_hybrid_ids:
            continue
        dedupe_key = f"{hybrid_id}::{bpmn_id}::{kind}"
        if dedupe_key in seen_binding_keys:
            continue
        seen_binding_keys.add(dedupe_key)
        bindings.append({
            "hybrid_id": hybrid_id,
            "bpmn_id": bpmn_id,
            "kind": kind,
        })

    view_raw = raw.get("view") if isinstance(raw.get("view"), dict) else {}
    mode = str(view_raw.get("mode") or "view").strip().lower()
    if mode not in {"view", "edit"}:
        mode = "view"
    tool = str(view_raw.get("tool") or "select").strip().lower()
    if tool not in {"select", "rect", "text", "arrow", "note"}:
        tool = "select"
    active_layer_id = str(view_raw.get("active_layer_id") or view_raw.get("activeLayerId") or "L1").strip() or "L1"
    if active_layer_id not in seen_layer_ids:
        active_layer_id = layers[0]["id"]
    view = {
        "mode": mode,
        "active_layer_id": active_layer_id,
        "tool": tool,
        "peek": bool(view_raw.get("peek")),
    }

    return {
        "schema_version": 2,
        "layers": layers,
        "elements": elements,
        "edges": edges,
        "bindings": bindings,
        "view": view,
    }


def _hybrid_v2_payload_size(value: Any) -> int:
    normalized = _normalize_hybrid_v2(value)
    elements = normalized.get("elements") if isinstance(normalized.get("elements"), list) else []
    edges = normalized.get("edges") if isinstance(normalized.get("edges"), list) else []
    bindings = normalized.get("bindings") if isinstance(normalized.get("bindings"), list) else []
    return len(elements) + len(edges) + len(bindings)


def _entry_to_flow_tier(entry_raw: Any) -> Optional[str]:
    if isinstance(entry_raw, dict):
        tier = _normalize_flow_tier(entry_raw.get("tier"))
        if tier:
            return tier
        happy_raw = entry_raw.get("happy")
        if happy_raw is True:
            return "P0"
        if isinstance(happy_raw, (int, float)) and bool(happy_raw):
            return "P0"
        if isinstance(happy_raw, str) and str(happy_raw).strip().lower() in {"1", "true", "yes", "on"}:
            return "P0"
        return None
    if isinstance(entry_raw, bool):
        return "P0" if entry_raw else None
    if isinstance(entry_raw, (int, float)):
        return "P0" if bool(entry_raw) else None
    return None


def _normalize_bpmn_meta(
    value: Any,
    *,
    allowed_flow_ids: Optional[Set[str]] = None,
    allowed_node_ids: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    version_raw = raw.get("version")
    try:
        version = int(version_raw) if version_raw is not None else 1
    except Exception:
        version = 1
    if version <= 0:
        version = 1

    flow_meta_raw = raw.get("flow_meta")
    if not isinstance(flow_meta_raw, dict):
        flow_meta_raw = {}

    flow_meta: Dict[str, Dict[str, Any]] = {}
    for flow_id_raw, entry_raw in flow_meta_raw.items():
        flow_id = str(flow_id_raw or "").strip()
        if not flow_id:
            continue
        if allowed_flow_ids is not None and flow_id not in allowed_flow_ids:
            continue
        normalized_flow_entry = _normalize_flow_meta_entry(entry_raw)
        if not normalized_flow_entry:
            continue
        flow_meta[flow_id] = normalized_flow_entry

    node_meta_raw = raw.get("node_path_meta")
    if not isinstance(node_meta_raw, dict):
        node_meta_raw = {}
    node_path_meta: Dict[str, Dict[str, Any]] = {}
    for node_id_raw, entry_raw in node_meta_raw.items():
        node_id = str(node_id_raw or "").strip()
        if not node_id:
            continue
        if allowed_node_ids is not None and node_id not in allowed_node_ids:
            continue
        normalized_entry = _normalize_node_path_entry(entry_raw)
        if not normalized_entry:
            continue
        node_path_meta[node_id] = normalized_entry

    robot_meta_by_element_id = _normalize_robot_meta_map(
        raw.get("robot_meta_by_element_id"),
        allowed_node_ids=allowed_node_ids,
    )
    hybrid_layer_by_element_id = _normalize_hybrid_layer_map(
        raw.get("hybrid_layer_by_element_id"),
        allowed_node_ids=allowed_node_ids,
    )
    hybrid_v2 = _normalize_hybrid_v2(raw.get("hybrid_v2"))

    return {
        "version": version,
        "flow_meta": flow_meta,
        "node_path_meta": node_path_meta,
        "robot_meta_by_element_id": robot_meta_by_element_id,
        "hybrid_layer_by_element_id": hybrid_layer_by_element_id,
        "hybrid_v2": hybrid_v2,
    }


def _enforce_gateway_tier_constraints(
    flow_meta: Dict[str, Dict[str, Any]],
    *,
    outgoing_by_source: Optional[Dict[str, List[str]]] = None,
    gateway_mode_by_node: Optional[Dict[str, str]] = None,
) -> Dict[str, Dict[str, Any]]:
    base: Dict[str, Dict[str, Any]] = {}
    for flow_id_raw, entry_raw in (flow_meta or {}).items():
        flow_id = str(flow_id_raw or "").strip()
        if not flow_id:
            continue
        normalized_entry = _normalize_flow_meta_entry(entry_raw)
        if not normalized_entry:
            continue
        base[flow_id] = normalized_entry

    outgoing_map = outgoing_by_source or {}
    mode_map = gateway_mode_by_node or {}
    if not outgoing_map or not mode_map:
        return base

    for source_id, siblings_raw in outgoing_map.items():
        if str(mode_map.get(source_id) or "") != "xor":
            continue
        siblings = [str(fid or "").strip() for fid in (siblings_raw or []) if str(fid or "").strip()]
        if not siblings:
            continue
        for tier_key in ("P0", "P1"):
            matched = [fid for fid in siblings if _normalize_flow_tier((base.get(fid) or {}).get("tier")) == tier_key]
            if len(matched) <= 1:
                continue
            keep = sorted(matched)[0]
            for fid in matched:
                if fid != keep:
                    existing = dict(base.get(fid) or {})
                    existing.pop("tier", None)
                    if existing.get("rtier"):
                        base[fid] = existing
                    else:
                        base.pop(fid, None)
    return base


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
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-Org-Id", "X-Active-Org-Id"],
)


@app.middleware("http")
async def auth_guard_middleware(request: Request, call_next):
    path = str(request.url.path or "")
    scope_tokens = None
    if request.method.upper() == "OPTIONS":
        return await call_next(request)
    if not path.startswith("/api"):
        return await call_next(request)
    if path in AUTH_PUBLIC_PATHS:
        scope_tokens = push_storage_request_scope("", False, "")
        try:
            return await call_next(request)
        finally:
            pop_storage_request_scope(scope_tokens)

    try:
        user = user_from_bearer_header(request.headers.get("authorization", ""))
        request.state.auth_user = user
        user_id = str(user.get("id") or "").strip()
        is_admin = bool(user.get("is_admin", False))
        path_org_id = _extract_org_from_path(path)
        header_org_id = _extract_org_from_headers(request)

        allow_non_member = bool(path_org_id and path.rstrip("/").endswith("/invites/accept"))
        if path_org_id and (not allow_non_member) and not user_has_org_membership(user_id, path_org_id, is_admin=is_admin):
            return JSONResponse(status_code=404, content={"detail": "not found"})

        requested_org_id = path_org_id or header_org_id
        active_org_id = resolve_active_org_id(user_id, requested_org_id=requested_org_id, is_admin=is_admin)
        request.state.active_org_id = active_org_id
        request.state.org_memberships = list_user_org_memberships(user_id, is_admin=is_admin)
        scope_tokens = push_storage_request_scope(user_id, is_admin, active_org_id)
    except AuthError as e:
        return _auth_error_response(str(e))

    try:
        return await call_next(request)
    finally:
        pop_storage_request_scope(scope_tokens)


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


class AuthLoginIn(BaseModel):
    email: str
    password: str


class AuthTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthMeOut(BaseModel):
    id: str
    email: str
    is_admin: bool = False
    active_org_id: str = ""
    default_org_id: str = ""
    orgs: List[Dict[str, Any]] = []


class OrgCreateIn(BaseModel):
    name: str
    id: Optional[str] = None


class ProjectMemberUpsertIn(BaseModel):
    user_id: str
    role: str


class ProjectMemberPatchIn(BaseModel):
    role: str


class OrgMemberPatchIn(BaseModel):
    role: str


class OrgInviteCreateIn(BaseModel):
    email: str
    role: str
    ttl_days: Optional[int] = 7


class OrgInviteAcceptIn(BaseModel):
    token: str


class TemplateCreateIn(BaseModel):
    scope: str = "personal"
    org_id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    template_type: str = "bpmn_selection_v1"
    payload: Dict[str, Any]
    created_from_session_id: Optional[str] = None


class TemplatePatchIn(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


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
    bpmn_meta: Optional[Any] = None

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
    bpmn_meta: Optional[Dict[str, Any]] = None


class BpmnMetaPatchIn(BaseModel):
    flowId: Optional[str] = None
    happy: Optional[bool] = None
    tier: Optional[str] = None
    rtier: Optional[str] = None
    updates: Optional[List[Dict[str, Any]]] = None
    flow_meta: Optional[Dict[str, Any]] = None
    node_id: Optional[str] = None
    paths: Optional[List[str]] = None
    sequence_key: Optional[str] = None
    source: Optional[str] = None
    node_updates: Optional[List[Dict[str, Any]]] = None
    node_path_meta: Optional[Dict[str, Any]] = None
    robot_element_id: Optional[str] = None
    robot_meta: Optional[Dict[str, Any]] = None
    remove_robot_meta: Optional[bool] = None
    robot_updates: Optional[List[Dict[str, Any]]] = None
    robot_meta_by_element_id: Optional[Dict[str, Any]] = None
    hybrid_layer_by_element_id: Optional[Dict[str, Any]] = None
    hybrid_v2: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(extra="allow")


class InferRtiersIn(BaseModel):
    scopeStartId: Optional[str] = None
    successEndIds: Optional[List[str]] = None
    failEndIds: Optional[List[str]] = None


class CreatePathReportVersionIn(BaseModel):
    steps_hash: str
    request_payload_json: Dict[str, Any]
    prompt_template_version: str = "v2"

    model_config = ConfigDict(extra="allow")


class OrgReportBuildIn(CreatePathReportVersionIn):
    path_id: str


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


@app.post("/api/auth/login", response_model=AuthTokenOut)
def auth_login(inp: AuthLoginIn, request: Request):
    login_limit = max(1, _env_int("RL_LOGIN_PER_MIN", 30))
    ip_key = str(_request_client_ip(request) or "ip_unknown")
    if not _rate_limit_check(f"login:{ip_key}", login_limit, 60):
        raise HTTPException(status_code=429, detail="too_many_requests")
    try:
        user = authenticate_user(inp.email, inp.password)
    except AuthError:
        raise HTTPException(status_code=401, detail="invalid_credentials")

    issued = issue_login_tokens(
        user=user,
        user_agent=request.headers.get("user-agent", ""),
        ip=_request_client_ip(request),
    )
    max_age = max(1, int(issued.get("refresh_expires_at", 0)) - int(time.time()))
    payload = {
        "access_token": str(issued.get("access_token") or ""),
        "token_type": "bearer",
    }
    try:
        uid = str(user.get("id") or "").strip()
        oid = resolve_active_org_id(
            uid,
            requested_org_id=_extract_org_from_headers(request),
            is_admin=bool(user.get("is_admin", False)),
        )
        if uid and oid:
            append_audit_log(
                actor_user_id=uid,
                org_id=oid,
                action="login",
                entity_type="auth",
                entity_id=uid,
                status="ok",
                meta={"ip": _request_client_ip(request), "user_agent": str(request.headers.get("user-agent") or "")[:180]},
            )
    except Exception:
        pass
    resp = JSONResponse(status_code=200, content=payload)
    _set_refresh_cookie(resp, str(issued.get("refresh_token") or ""), max_age)
    return resp


@app.post("/api/auth/refresh", response_model=AuthTokenOut)
def auth_refresh(request: Request):
    refresh_token = str(request.cookies.get("refresh_token") or "").strip()
    if not refresh_token:
        resp = JSONResponse(status_code=401, content={"detail": "missing_refresh_token"})
        _clear_refresh_cookie(resp)
        return resp

    try:
        rotated = rotate_refresh_token(
            refresh_token,
            user_agent=request.headers.get("user-agent", ""),
            ip=_request_client_ip(request),
        )
    except AuthError as e:
        resp = JSONResponse(status_code=401, content={"detail": str(e)})
        _clear_refresh_cookie(resp)
        return resp

    max_age = max(1, int(rotated.get("refresh_expires_at", 0)) - int(time.time()))
    payload = {
        "access_token": str(rotated.get("access_token") or ""),
        "token_type": "bearer",
    }
    resp = JSONResponse(status_code=200, content=payload)
    _set_refresh_cookie(resp, str(rotated.get("refresh_token") or ""), max_age)
    return resp


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    refresh_token = str(request.cookies.get("refresh_token") or "").strip()
    if refresh_token:
        revoke_refresh_from_token(refresh_token)
    resp = JSONResponse(status_code=200, content={"ok": True})
    _clear_refresh_cookie(resp)
    return resp


@app.get("/api/auth/me", response_model=AuthMeOut)
def auth_me(request: Request):
    user = getattr(request.state, "auth_user", None)
    if not isinstance(user, dict):
        try:
            user = user_from_bearer_header(request.headers.get("authorization", ""))
        except AuthError:
            raise HTTPException(status_code=401, detail="unauthorized")
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    memberships = list_user_org_memberships(user_id, is_admin=is_admin)
    requested_org_id = _extract_org_from_headers(request)
    active_org_id = resolve_active_org_id(user_id, requested_org_id=requested_org_id, is_admin=is_admin)
    return {
        "id": user_id,
        "email": str(user.get("email") or ""),
        "is_admin": is_admin,
        "active_org_id": active_org_id,
        "default_org_id": get_default_org_id(),
        "orgs": memberships,
    }


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
def list_project_sessions(project_id: str, mode: str | None = None, request: Request = None):
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")
    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        raise HTTPException(status_code=422, detail="invalid mode; allowed: quick_skeleton, deep_audit")
    st = get_storage()
    rows = st.list(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
    out = []
    for row in rows:
        if isinstance(row, dict):
            out.append(_session_api_dump(Session.model_validate(row)))
    return out


@app.post("/api/projects/{project_id}/sessions")
def create_project_session(project_id: str, inp: CreateSessionIn, mode: str | None = Query(default="quick_skeleton"), request: Request = None):
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    if proj is None:
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
        sid = st.create(title=title, roles=roles, start_role=sr, project_id=project_id, mode=mode, user_id=user_id, org_id=oid)
        sess = st.load(sid, org_id=oid, is_admin=True)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        if prep_questions:
            sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
            st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
        _audit_log_safe(
            request,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            action="session.create",
            entity_type="session",
            entity_id=str(getattr(sess, "id", "") or sid),
            project_id=project_id,
            session_id=str(getattr(sess, "id", "") or sid),
            meta={"mode": str(getattr(sess, "mode", "") or ""), "title": str(getattr(sess, "title", "") or "")},
        )
        return _session_api_dump(sess)
    except TypeError:
        # fallback: create base session then attach fields
        sid = st.create(title=title, roles=roles, start_role=sr, user_id=user_id, org_id=oid)
        sess = st.load(sid, org_id=oid, is_admin=True)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        if hasattr(sess, "project_id"):
            sess.project_id = project_id
        if hasattr(sess, "mode"):
            sess.mode = mode
        if prep_questions:
            sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
        _audit_log_safe(
            request,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            action="session.create",
            entity_type="session",
            entity_id=str(getattr(sess, "id", "") or sid),
            project_id=project_id,
            session_id=str(getattr(sess, "id", "") or sid),
            meta={"mode": str(getattr(sess, "mode", "") or ""), "title": str(getattr(sess, "title", "") or ""), "fallback": True},
        )
        return _session_api_dump(sess)


@app.get("/api/sessions")
def list_sessions(q: Optional[str] = None, limit: int = 200, request: Request = None) -> Dict[str, Any]:
    oid = _request_active_org_id(request) if request is not None else ""
    scope = _project_scope_for_request(request, oid or get_default_org_id())
    allowed = _scope_allowed_project_ids(scope)
    st = get_storage()
    items = st.list(query=q, limit=min(max(int(limit), 1), 500), org_id=(oid or None), is_admin=True)
    if allowed:
        items = [
            item for item in items
            if str((item or {}).get("project_id") or "").strip() in allowed
        ]
    return {"items": items, "count": len(items)}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str, request: Request = None) -> Dict[str, Any]:
    sess, _, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    return _session_api_dump(sess)


@app.get("/api/sessions/{session_id}/analytics")
def get_session_analytics(session_id: str, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    if not getattr(sess, "analytics", None):
        sess = _recompute_session(sess)
        st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
    return {"session_id": sess.id, "analytics": getattr(sess, "analytics", {})}


@app.patch("/api/sessions/{session_id}")
def patch_session(session_id: str, inp: UpdateSessionIn, request: Request = None) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
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
        sess.interview = _merge_interview_with_server_fields(sess.interview, data.get("interview"))
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

    if "bpmn_meta" in data:
        sess_xml = str(getattr(sess, "bpmn_xml", "") or "")
        flow_ctx = _collect_sequence_flow_meta(sess_xml)
        flow_ids = flow_ctx.get("flow_ids")
        node_ids = flow_ctx.get("node_ids")
        current_meta = _normalize_bpmn_meta(
            getattr(sess, "bpmn_meta", {}),
            allowed_flow_ids=flow_ids if sess_xml.strip() else None,
            allowed_node_ids=node_ids if sess_xml.strip() else None,
        )
        incoming_meta = data.get("bpmn_meta")
        if isinstance(incoming_meta, dict):
            raw_bpmn_meta = {
                "version": incoming_meta.get("version", current_meta.get("version", 1)),
                "flow_meta": incoming_meta.get("flow_meta", current_meta.get("flow_meta", {})),
                "node_path_meta": incoming_meta.get("node_path_meta", current_meta.get("node_path_meta", {})),
                "robot_meta_by_element_id": incoming_meta.get(
                    "robot_meta_by_element_id",
                    current_meta.get("robot_meta_by_element_id", {}),
                ),
                "hybrid_layer_by_element_id": incoming_meta.get(
                    "hybrid_layer_by_element_id",
                    current_meta.get("hybrid_layer_by_element_id", {}),
                ),
                "hybrid_v2": incoming_meta.get(
                    "hybrid_v2",
                    current_meta.get("hybrid_v2", {}),
                ),
            }
        else:
            raw_bpmn_meta = current_meta
        normalized_meta = _normalize_bpmn_meta(
            raw_bpmn_meta,
            allowed_flow_ids=flow_ids if sess_xml.strip() else None,
            allowed_node_ids=node_ids if sess_xml.strip() else None,
        )
        normalized_meta["flow_meta"] = _enforce_gateway_tier_constraints(
            dict(normalized_meta.get("flow_meta") or {}),
            outgoing_by_source=flow_ctx.get("outgoing_by_source"),
            gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
        )
        sess.bpmn_meta = normalized_meta
        handled = True

    # игнорируем любые extra поля без ошибки
    if need_recompute:
        sess = _recompute_session(sess)
    st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.update",
        entity_type="session",
        entity_id=str(getattr(sess, "id", "") or session_id),
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=str(getattr(sess, "id", "") or session_id),
        meta={"keys": sorted(list(data.keys()))},
    )
    return _session_api_dump(sess)


@app.delete("/api/projects/{project_id}")
def delete_project_api(project_id: str, request: Request = None):
    pid = str(project_id or "").strip()
    if not pid:
        return {"ok": False, "error": "project_not_found", "project_id": str(project_id), "deleted_sessions": []}
    proj, oid, _ = _legacy_load_project_scoped(pid, request)
    ps = get_project_storage()
    if proj is None:
        return {"ok": False, "error": "project_not_found", "project_id": pid, "deleted_sessions": []}
    st = get_storage()
    related = st.list(project_id=pid, limit=500, org_id=oid, is_admin=True)
    deleted_sessions: list[str] = []
    for row in related:
        sid = str((row or {}).get("id") or "").strip()
        if not sid:
            continue
        if st.delete(sid, org_id=oid, is_admin=True):
            deleted_sessions.append(sid)
    deleted_project = ps.delete(pid, org_id=oid, is_admin=True)
    if not deleted_project:
        return {"ok": False, "error": "project_not_found", "project_id": pid, "deleted_sessions": deleted_sessions}
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.delete",
        entity_type="project",
        entity_id=pid,
        project_id=pid,
        meta={"deleted_sessions": deleted_sessions},
    )
    return {"ok": True, "project_id": pid, "deleted_sessions": deleted_sessions}


@app.delete("/api/sessions/{session_id}")
def delete_session_api(session_id: str, request: Request = None):
    sid = str(session_id or "").strip()
    if not sid:
        return {"ok": False, "error": "session_not_found", "session_id": str(session_id)}
    sess, oid, _ = _legacy_load_session_scoped(sid, request)
    if not sess:
        return {"ok": False, "error": "session_not_found", "session_id": sid}
    st = get_storage()
    deleted = st.delete(sid, org_id=oid, is_admin=True)
    if not deleted:
        return {"ok": False, "error": "session_not_found", "session_id": sid}
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.delete",
        entity_type="session",
        entity_id=sid,
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=sid,
    )
    return {"ok": True, "session_id": sid, "deleted_files": 1}


@app.put("/api/sessions/{session_id}")
def put_session(session_id: str, inp: UpdateSessionIn, request: Request = None) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
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
    sess.interview = _merge_interview_with_server_fields(sess.interview, data.get("interview"))
    sess.nodes = _norm_nodes(data.get("nodes"))
    sess.edges = _norm_edges(data.get("edges"))
    sess.questions = _norm_questions(data.get("questions"))
    sess_xml = str(getattr(sess, "bpmn_xml", "") or "")
    flow_ctx = _collect_sequence_flow_meta(sess_xml)
    flow_ids = flow_ctx.get("flow_ids")
    node_ids = flow_ctx.get("node_ids")
    raw_bpmn_meta = data.get("bpmn_meta") if data.get("bpmn_meta") is not None else getattr(sess, "bpmn_meta", {})
    normalized_meta = _normalize_bpmn_meta(
        raw_bpmn_meta,
        allowed_flow_ids=flow_ids if sess_xml.strip() else None,
        allowed_node_ids=node_ids if sess_xml.strip() else None,
    )
    normalized_meta["flow_meta"] = _enforce_gateway_tier_constraints(
        dict(normalized_meta.get("flow_meta") or {}),
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )
    sess.bpmn_meta = normalized_meta

    sess = _recompute_session(sess)
    st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
        action="session.update",
        entity_type="session",
        entity_id=str(getattr(sess, "id", "") or session_id),
        project_id=str(getattr(sess, "project_id", "") or ""),
        session_id=str(getattr(sess, "id", "") or session_id),
        meta={"put": True},
    )
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


def _report_version_summary(row_raw: Any) -> Dict[str, Any]:
    row = row_raw if isinstance(row_raw, dict) else {}
    error_message = str(row.get("error_message") or "").strip()
    return {
        "id": str(row.get("id") or ""),
        "version": int(row.get("version") or 0),
        "created_at": int(row.get("created_at") or 0),
        "status": str(row.get("status") or "error"),
        "steps_hash": str(row.get("steps_hash") or ""),
        "provider": "deepseek",
        "error": error_message or None,
        "model": str(row.get("model") or "deepseek-chat"),
        "prompt_template_version": str(row.get("prompt_template_version") or "v2"),
    }


def _report_version_detail_payload(row_raw: Any) -> Dict[str, Any]:
    found = row_raw if isinstance(row_raw, dict) else {}
    payload_normalized = found.get("payload_normalized") or found.get("report_json") or {}
    payload_raw = found.get("payload_raw")
    return {
        "id": str(found.get("id") or ""),
        "session_id": str(found.get("session_id") or ""),
        "path_id": str(found.get("path_id") or ""),
        "version": int(found.get("version") or 0),
        "steps_hash": str(found.get("steps_hash") or ""),
        "created_at": int(found.get("created_at") or 0),
        "status": str(found.get("status") or "error"),
        "model": str(found.get("model") or "deepseek-chat"),
        "prompt_template_version": str(found.get("prompt_template_version") or "v2"),
        "request_payload_json": found.get("request_payload_json") or {},
        "payload_normalized": payload_normalized,
        "payload_raw": payload_raw if payload_raw is not None else {},
        "report_json": payload_normalized,
        "raw_json": found.get("raw_json") or (payload_raw if isinstance(payload_raw, dict) else {}),
        "report_markdown": str(found.get("report_markdown") or found.get("raw_text") or ""),
        "recommendations_json": found.get("recommendations_json") or payload_normalized.get("recommendations") or [],
        "missing_data_json": found.get("missing_data_json") or payload_normalized.get("missing_data") or [],
        "risks_json": found.get("risks_json") or payload_normalized.get("risks") or [],
        "warnings_json": found.get("warnings_json") or [],
        "error_message": found.get("error_message"),
    }


def _resolve_report_scope(
    *,
    request: Optional[Request] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Tuple[str, Optional[bool]]:
    oid = str(org_id or "").strip()
    if not oid and request is not None:
        oid = _request_active_org_id(request)
    admin = bool(is_admin) if is_admin is not None else None
    return oid, admin


def _create_path_report_version_core(
    session_id: str,
    path_id: str,
    inp: CreatePathReportVersionIn,
    *,
    request: Optional[Request] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    st = get_storage()
    sid = str(session_id or "").strip()
    oid, admin = _resolve_report_scope(request=request, org_id=org_id, is_admin=is_admin)
    org_scope = oid or None
    s = st.load(sid, org_id=org_scope, is_admin=admin)
    if not s:
        return {"error": "not found"}

    pid = str(path_id or "").strip()
    if not pid:
        return {"error": "path_id is required"}

    steps_hash = str(getattr(inp, "steps_hash", "") or "").strip()
    if not steps_hash:
        return {"error": "steps_hash is required"}

    request_payload_json = inp.request_payload_json if isinstance(inp.request_payload_json, dict) else {}
    prompt_template_version = str(getattr(inp, "prompt_template_version", "") or "v2").strip() or "v2"

    llm = load_llm_settings()
    model_name = str(llm.get("model") or "deepseek-chat").strip() or "deepseek-chat"
    lock = _report_session_lock(sid)
    with lock:
        s = st.load(sid, org_id=org_scope, is_admin=admin)
        if not s:
            return {"error": "not found"}
        by_path = _get_report_versions_by_path(getattr(s, "interview", {}))
        version_no = _next_report_version(by_path, pid)
        report_id = f"rpt_{uuid.uuid4().hex[:12]}"
        created_at = int(time.time())
        running_row = ReportVersion(
            id=report_id,
            session_id=str(s.id),
            path_id=pid,
            version=version_no,
            steps_hash=steps_hash,
            created_at=created_at,
            status="running",
            model=model_name,
            prompt_template_version=prompt_template_version,
            request_payload_json=request_payload_json,
            payload_normalized={},
            payload_raw={},
            report_json={},
            raw_json={},
            report_markdown="",
            recommendations_json=[],
            missing_data_json=[],
            risks_json=[],
            warnings_json=[],
            error_message=None,
        ).model_dump()
        by_path.setdefault(pid, []).append(running_row)
        _set_report_versions_by_path(s, by_path)
        _set_latest_path_report_pointer(s, pid, running_row)
        st.save(s, org_id=org_scope, is_admin=admin)
        _audit_log_safe(
            request,
            org_id=str(getattr(s, "org_id", "") or oid or get_default_org_id()),
            action="report.build",
            entity_type="report_version",
            entity_id=report_id,
            project_id=str(getattr(s, "project_id", "") or ""),
            session_id=str(getattr(s, "id", "") or sid),
            meta={"path_id": pid, "steps_hash": steps_hash, "status": "running"},
        )

    sync_mode_env = str(os.environ.get("PATH_REPORT_SYNC_MODE") or "").strip().lower() in {"1", "true", "yes"}
    sync_mode = bool(sync_mode_env and request is None)
    worker_kwargs = {
        "session_id": str(sid),
        "path_id": pid,
        "report_id": report_id,
        "request_payload_json": request_payload_json,
        "prompt_template_version": prompt_template_version,
        "model_name": model_name,
        "org_id": org_scope,
    }
    if sync_mode:
        _run_path_report_generation_async(**worker_kwargs)
    else:
        worker = threading.Thread(
            target=_run_path_report_generation_async,
            kwargs=worker_kwargs,
            daemon=True,
            name=f"path-report-{report_id}",
        )
        worker.start()

    return {
        "ok": True,
        "report": running_row,
        "summary": _report_version_summary(running_row),
        "queued": True,
    }


def _list_path_report_versions_core(
    session_id: str,
    path_id: str,
    *,
    steps_hash: str = "",
    request: Optional[Request] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    st = get_storage()
    oid, admin = _resolve_report_scope(request=request, org_id=org_id, is_admin=is_admin)
    org_scope = oid or None
    s = st.load(str(session_id or "").strip(), org_id=org_scope, is_admin=admin)
    if not s:
        return []
    if _mark_stale_running_reports(s):
        st.save(s, org_id=org_scope, is_admin=admin)
    pid = str(path_id or "").strip()
    if not pid:
        return []
    by_path = _get_report_versions_by_path(getattr(s, "interview", {}))
    rows = list(by_path.get(pid) or [])
    hash_filter = str(steps_hash or "").strip()
    if hash_filter:
        rows = [row for row in rows if str((row or {}).get("steps_hash") or "").strip() == hash_filter]
    rows.sort(key=lambda x: int(x.get("version") or 0), reverse=True)
    return [_report_version_summary(row) for row in rows]


def _get_path_report_version_detail_core(
    session_id: str,
    path_id: str,
    report_id: str,
    *,
    request: Optional[Request] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    st = get_storage()
    oid, admin = _resolve_report_scope(request=request, org_id=org_id, is_admin=is_admin)
    org_scope = oid or None
    sess = st.load(str(session_id or "").strip(), org_id=org_scope, is_admin=admin)
    if not sess:
        return {"error": "not found"}
    if _mark_stale_running_reports(sess):
        st.save(sess, org_id=org_scope, is_admin=admin)
    pid = str(path_id or "").strip()
    rid = str(report_id or "").strip()
    if not pid or not rid:
        return {"error": "not found"}
    by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
    for row in list(by_path.get(pid) or []):
        if str((row or {}).get("id") or "").strip() != rid:
            continue
        return _report_version_detail_payload(row)
    return {"error": "not found"}


def _delete_path_report_version_core(
    session_id: str,
    path_id: str,
    report_id: str,
    *,
    request: Optional[Request] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Response:
    sid = str(session_id or "").strip()
    pid = str(path_id or "").strip()
    rid = str(report_id or "").strip()
    if not sid or not pid or not rid:
        raise HTTPException(status_code=404, detail="not found")
    oid, admin = _resolve_report_scope(request=request, org_id=org_id, is_admin=is_admin)
    deleted = _delete_report_version_row(sid, pid, rid, org_id=(oid or None), is_admin=admin)
    if not deleted:
        raise HTTPException(status_code=404, detail="not found")
    if request is not None:
        st = get_storage()
        sess = st.load(sid, org_id=(oid or None), is_admin=admin)
        _audit_log_safe(
            request,
            org_id=str(getattr(sess, "org_id", "") or oid or get_default_org_id()),
            action="report.delete",
            entity_type="report_version",
            entity_id=rid,
            project_id=str(getattr(sess, "project_id", "") or ""),
            session_id=sid,
            meta={"path_id": pid},
        )
    return Response(status_code=204)


@app.post("/api/sessions/{session_id}/paths/{path_id}/reports")
@app.post("/api/sessions/{session_id}/paths/{path_id}/reports/")
@app.post("/api/sessions/{session_id}/path/{path_id}/reports")
@app.post("/api/sessions/{session_id}/path/{path_id}/reports/")
def create_path_report_version(
    session_id: str,
    path_id: str,
    inp: CreatePathReportVersionIn,
    request: Request = None,
) -> Dict[str, Any]:
    if request is not None:
        sess, oid, _ = _legacy_load_session_scoped(session_id, request)
        if not sess:
            return {"error": "not found"}
        return _create_path_report_version_core(
            str(getattr(sess, "id", "") or session_id),
            path_id,
            inp,
            request=request,
            org_id=oid,
            is_admin=True,
        )
    return _create_path_report_version_core(session_id, path_id, inp, request=request)


@app.get("/api/sessions/{session_id}/paths/{path_id}/reports")
@app.get("/api/sessions/{session_id}/paths/{path_id}/reports/")
@app.get("/api/sessions/{session_id}/path/{path_id}/reports")
@app.get("/api/sessions/{session_id}/path/{path_id}/reports/")
def list_path_report_versions(
    session_id: str,
    path_id: str,
    steps_hash: str = "",
    request: Request = None,
) -> List[Dict[str, Any]]:
    if request is not None:
        sess, oid, _ = _legacy_load_session_scoped(session_id, request)
        if not sess:
            return []
        return _list_path_report_versions_core(
            str(getattr(sess, "id", "") or session_id),
            path_id,
            steps_hash=steps_hash,
            request=request,
            org_id=oid,
            is_admin=True,
        )
    return _list_path_report_versions_core(session_id, path_id, steps_hash=steps_hash, request=request)


@app.get("/api/reports/{report_id}")
def get_report_version(report_id: str, request: Request = None) -> Dict[str, Any]:
    oid = _request_active_org_id(request) if request is not None else ""
    session_ids = _accessible_session_ids_for_request(request, oid)
    found = _find_report_version_global(report_id, org_id=(oid or None), is_admin=True, session_ids=session_ids)
    if not found:
        return {"error": "not found"}
    return _report_version_detail_payload(found)


@app.get("/api/sessions/{session_id}/paths/{path_id}/reports/{report_id}")
@app.get("/api/sessions/{session_id}/paths/{path_id}/reports/{report_id}/")
@app.get("/api/sessions/{session_id}/path/{path_id}/reports/{report_id}")
@app.get("/api/sessions/{session_id}/path/{path_id}/reports/{report_id}/")
def get_path_report_version_detail(session_id: str, path_id: str, report_id: str, request: Request = None) -> Dict[str, Any]:
    if request is not None:
        sess, oid, _ = _legacy_load_session_scoped(session_id, request)
        if not sess:
            return {"error": "not found"}
        return _get_path_report_version_detail_core(
            str(getattr(sess, "id", "") or session_id),
            path_id,
            report_id,
            request=request,
            org_id=oid,
            is_admin=True,
        )
    return _get_path_report_version_detail_core(session_id, path_id, report_id, request=request)


@app.delete("/api/reports/{report_id}")
@app.delete("/api/reports/{report_id}/")
def delete_report_version(report_id: str, request: Request = None) -> Response:
    rid = str(report_id or "").strip()
    if not rid:
        raise HTTPException(status_code=404, detail="not found")
    oid = _request_active_org_id(request) if request is not None else ""
    session_ids = _accessible_session_ids_for_request(request, oid)
    found = _find_report_version_global(rid, org_id=(oid or None), is_admin=True, session_ids=session_ids)
    deleted = _delete_report_version_global(rid, org_id=(oid or None), is_admin=True, session_ids=session_ids)
    if not deleted:
        raise HTTPException(status_code=404, detail="not found")
    if found and request is not None:
        _audit_log_safe(
            request,
            org_id=oid or get_default_org_id(),
            action="report.delete",
            entity_type="report_version",
            entity_id=rid,
            project_id=str((found or {}).get("project_id") or ""),
            session_id=str((found or {}).get("session_id") or ""),
            meta={"path_id": str((found or {}).get("path_id") or "")},
        )
    return Response(status_code=204)


@app.delete("/api/sessions/{session_id}/paths/{path_id}/reports/{report_id}")
@app.delete("/api/sessions/{session_id}/paths/{path_id}/reports/{report_id}/")
@app.delete("/api/sessions/{session_id}/path/{path_id}/reports/{report_id}")
@app.delete("/api/sessions/{session_id}/path/{path_id}/reports/{report_id}/")
def delete_path_report_version(session_id: str, path_id: str, report_id: str, request: Request = None) -> Response:
    if request is not None:
        sess, oid, _ = _legacy_load_session_scoped(session_id, request)
        if not sess:
            raise HTTPException(status_code=404, detail="not found")
        return _delete_path_report_version_core(
            str(getattr(sess, "id", "") or session_id),
            path_id,
            report_id,
            request=request,
            org_id=oid,
            is_admin=True,
        )
    return _delete_path_report_version_core(session_id, path_id, report_id, request=request)


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


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    txt = str(value or "").strip().lower()
    if txt in {"1", "true", "yes", "on"}:
        return True
    if txt in {"0", "false", "no", "off", ""}:
        return False
    return bool(value)


_R_TIER_ALGO_VERSION = "rtier_v1"


def _infer_and_merge_rtiers(
    *,
    sess: Session,
    scope_start_id: str,
    success_end_ids: Any,
    fail_end_ids: Any,
) -> Dict[str, Any]:
    xml_text = str(getattr(sess, "bpmn_xml", "") or "")
    has_xml = bool(xml_text.strip())
    flow_ctx = _collect_sequence_flow_meta(xml_text)
    flow_ids = set(flow_ctx.get("flow_ids") or set()) if isinstance(flow_ctx, dict) else set()
    node_ids = set(flow_ctx.get("node_ids") or set()) if isinstance(flow_ctx, dict) else set()
    if not has_xml or not flow_ids:
        return {
            "meta": _normalize_bpmn_meta(getattr(sess, "bpmn_meta", {})),
            "inference": {
                "applied": False,
                "reason": "missing_bpmn_xml",
                "scopeStartId": "",
                "successEndIds": [],
                "failEndIds": [],
                "updatedFlowIds": [],
                "manualPreservedFlowIds": [],
                "inferredFlowCount": 0,
            },
        }

    graph = parse_bpmn_sequence_graph(xml_text)
    resolved = resolve_inference_inputs(
        graph,
        scope_start_id=scope_start_id,
        success_end_ids=success_end_ids,
        fail_end_ids=fail_end_ids,
    )
    resolved_scope_start_id = str(resolved.get("scope_start_id") or "").strip()
    resolved_success_end_ids = [str(x or "").strip() for x in (resolved.get("success_end_ids") or []) if str(x or "").strip()]
    resolved_fail_end_ids = [str(x or "").strip() for x in (resolved.get("fail_end_ids") or []) if str(x or "").strip()]

    inferred = infer_rtiers(
        {
            "bpmnXml": xml_text,
            "scopeStartId": resolved_scope_start_id,
            "successEndIds": resolved_success_end_ids,
            "failEndIds": resolved_fail_end_ids,
        }
    )

    current = _normalize_bpmn_meta(
        getattr(sess, "bpmn_meta", {}),
        allowed_flow_ids=flow_ids,
        allowed_node_ids=node_ids,
    )
    flow_meta = dict(current.get("flow_meta") or {})
    node_path_meta = dict(current.get("node_path_meta") or {})
    robot_meta_by_element_id = dict(current.get("robot_meta_by_element_id") or {})
    hybrid_layer_by_element_id = dict(current.get("hybrid_layer_by_element_id") or {})
    hybrid_v2 = dict(current.get("hybrid_v2") or {})
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    manual_preserved_flow_ids: List[str] = []
    updated_flow_ids: List[str] = []
    for flow_id in sorted(flow_ids):
        existing = dict(flow_meta.get(flow_id) or {})
        existing_rtier = _normalize_r_flow_tier(existing.get("rtier"))
        existing_source = _normalize_flow_meta_r_source(existing.get("source"))

        if existing_rtier and existing_source == "manual":
            manual_preserved_flow_ids.append(flow_id)
            normalized_existing = _normalize_flow_meta_entry(existing)
            if normalized_existing:
                flow_meta[flow_id] = normalized_existing
            else:
                flow_meta.pop(flow_id, None)
            continue

        inferred_row = inferred.get(flow_id) if isinstance(inferred, dict) else None
        if isinstance(inferred_row, dict):
            rtier = _normalize_r_flow_tier(inferred_row.get("rtier"))
            if rtier:
                existing["rtier"] = rtier
                existing["source"] = "inferred"
                if resolved_scope_start_id:
                    existing["scopeStartId"] = resolved_scope_start_id
                else:
                    existing.pop("scopeStartId", None)
                existing["algoVersion"] = _R_TIER_ALGO_VERSION
                existing["computedAtIso"] = now_iso
                reason = str(inferred_row.get("reason") or "").strip()
                if reason:
                    existing["reason"] = reason
                else:
                    existing.pop("reason", None)
                updated_flow_ids.append(flow_id)
        elif existing_source == "inferred":
            existing.pop("rtier", None)
            existing.pop("source", None)
            existing.pop("scopeStartId", None)
            existing.pop("algoVersion", None)
            existing.pop("computedAtIso", None)
            existing.pop("reason", None)
            updated_flow_ids.append(flow_id)

        normalized_entry = _normalize_flow_meta_entry(existing)
        if normalized_entry:
            flow_meta[flow_id] = normalized_entry
        else:
            flow_meta.pop(flow_id, None)

    flow_meta = _enforce_gateway_tier_constraints(
        flow_meta,
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )
    normalized_meta = _normalize_bpmn_meta(
        {
            "version": current.get("version", 1),
            "flow_meta": flow_meta,
            "node_path_meta": node_path_meta,
            "robot_meta_by_element_id": robot_meta_by_element_id,
            "hybrid_layer_by_element_id": hybrid_layer_by_element_id,
            "hybrid_v2": hybrid_v2,
        },
        allowed_flow_ids=flow_ids,
        allowed_node_ids=node_ids,
    )
    normalized_meta["flow_meta"] = _enforce_gateway_tier_constraints(
        dict(normalized_meta.get("flow_meta") or {}),
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )

    return {
        "meta": normalized_meta,
        "inference": {
            "applied": True,
            "scopeStartId": resolved_scope_start_id,
            "successEndIds": resolved_success_end_ids,
            "failEndIds": resolved_fail_end_ids,
            "updatedFlowIds": sorted(set(updated_flow_ids)),
            "manualPreservedFlowIds": sorted(set(manual_preserved_flow_ids)),
            "inferredFlowCount": len([fid for fid, row in (inferred or {}).items() if _normalize_r_flow_tier((row or {}).get("rtier"))]),
            "algoVersion": _R_TIER_ALGO_VERSION,
            "computedAtIso": now_iso,
        },
    }


@app.get("/api/sessions/{session_id}/bpmn_meta")
def session_bpmn_meta_get(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    has_xml = bool(str(getattr(s, "bpmn_xml", "") or "").strip())
    flow_ctx = _collect_sequence_flow_meta(str(getattr(s, "bpmn_xml", "") or ""))
    flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
    node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()
    normalized = _normalize_bpmn_meta(
        getattr(s, "bpmn_meta", {}),
        allowed_flow_ids=flow_ids if has_xml else None,
        allowed_node_ids=node_ids if has_xml else None,
    )
    normalized["flow_meta"] = _enforce_gateway_tier_constraints(
        dict(normalized.get("flow_meta") or {}),
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )
    if normalized != getattr(s, "bpmn_meta", {}):
        s.bpmn_meta = normalized
        st.save(s)
    return normalized


@app.patch("/api/sessions/{session_id}/bpmn_meta")
def session_bpmn_meta_patch(session_id: str, inp: BpmnMetaPatchIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    has_xml = bool(str(getattr(s, "bpmn_xml", "") or "").strip())
    flow_ctx = _collect_sequence_flow_meta(str(getattr(s, "bpmn_xml", "") or ""))
    flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
    node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()
    flow_source_by_id = flow_ctx.get("flow_source_by_id") if isinstance(flow_ctx, dict) else {}
    outgoing_by_source = flow_ctx.get("outgoing_by_source") if isinstance(flow_ctx, dict) else {}
    gateway_mode_by_node = flow_ctx.get("gateway_mode_by_node") if isinstance(flow_ctx, dict) else {}

    current = _normalize_bpmn_meta(
        getattr(s, "bpmn_meta", {}),
        allowed_flow_ids=flow_ids if has_xml else None,
        allowed_node_ids=node_ids if has_xml else None,
    )
    flow_meta = dict(current.get("flow_meta") or {})
    node_path_meta = dict(current.get("node_path_meta") or {})
    robot_meta_by_element_id = dict(current.get("robot_meta_by_element_id") or {})
    hybrid_layer_by_element_id = dict(current.get("hybrid_layer_by_element_id") or {})
    hybrid_v2 = dict(current.get("hybrid_v2") or {})

    if isinstance(inp.flow_meta, dict):
        replaced = _normalize_bpmn_meta(
            {"version": current.get("version", 1), "flow_meta": inp.flow_meta},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        flow_meta = dict(replaced.get("flow_meta") or {})

    if isinstance(inp.node_path_meta, dict):
        replaced = _normalize_bpmn_meta(
            {"version": current.get("version", 1), "node_path_meta": inp.node_path_meta},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        node_path_meta = dict(replaced.get("node_path_meta") or {})

    if isinstance(inp.robot_meta_by_element_id, dict):
        replaced = _normalize_bpmn_meta(
            {"version": current.get("version", 1), "robot_meta_by_element_id": inp.robot_meta_by_element_id},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        robot_meta_by_element_id = dict(replaced.get("robot_meta_by_element_id") or {})

    if isinstance(inp.hybrid_layer_by_element_id, dict):
        replaced = _normalize_bpmn_meta(
            {"version": current.get("version", 1), "hybrid_layer_by_element_id": inp.hybrid_layer_by_element_id},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        hybrid_layer_by_element_id = dict(replaced.get("hybrid_layer_by_element_id") or {})

    if isinstance(inp.hybrid_v2, dict):
        replaced = _normalize_bpmn_meta(
            {"version": current.get("version", 1), "hybrid_v2": inp.hybrid_v2},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        hybrid_v2 = dict(replaced.get("hybrid_v2") or {})

    def apply_update(update_raw: Dict[str, Any]) -> None:
        update = update_raw if isinstance(update_raw, dict) else {}
        flow_id = str(update.get("flowId", update.get("flow_id")) or "").strip()
        if not flow_id:
            return
        if has_xml and flow_id not in flow_ids:
            return
        existing = dict(flow_meta.get(flow_id) or {})

        has_tier = "tier" in update
        has_happy = "happy" in update
        if has_tier or has_happy:
            tier_raw = update.get("tier")
            happy_raw = update.get("happy")
            tier = _normalize_flow_tier(tier_raw)
            if tier is None:
                if has_tier and tier_raw is None and not has_happy:
                    tier = None
                elif has_happy:
                    tier = "P0" if _coerce_bool(happy_raw) else None
                elif has_tier:
                    tier = None

            source_id = str((flow_source_by_id or {}).get(flow_id) or "").strip()
            if tier in {"P0", "P1"} and source_id and str((gateway_mode_by_node or {}).get(source_id) or "") == "xor":
                for sibling_flow_id in (outgoing_by_source or {}).get(source_id, []) or []:
                    fid = str(sibling_flow_id or "").strip()
                    if not fid:
                        continue
                    sibling = dict(flow_meta.get(fid) or {})
                    existing_tier = _normalize_flow_tier(sibling.get("tier"))
                    if existing_tier != tier:
                        continue
                    sibling.pop("tier", None)
                    normalized_sibling = _normalize_flow_meta_entry(sibling)
                    if normalized_sibling:
                        flow_meta[fid] = normalized_sibling
                    else:
                        flow_meta.pop(fid, None)

            if tier:
                existing["tier"] = tier
            else:
                existing.pop("tier", None)

        has_rtier = "rtier" in update
        if has_rtier:
            rtier = _normalize_r_flow_tier(update.get("rtier"))
            if rtier:
                existing["rtier"] = rtier
                src = _normalize_flow_meta_r_source(update.get("source")) or _normalize_flow_meta_r_source(existing.get("source")) or "manual"
                existing["source"] = src
            else:
                existing.pop("rtier", None)
                existing.pop("source", None)
                existing.pop("scopeStartId", None)
                existing.pop("algoVersion", None)
                existing.pop("computedAtIso", None)
                existing.pop("reason", None)

        if "source" in update and existing.get("rtier"):
            src = _normalize_flow_meta_r_source(update.get("source"))
            if src:
                existing["source"] = src
            else:
                existing.pop("source", None)
        if "scopeStartId" in update or "scope_start_id" in update:
            val = str(update.get("scopeStartId", update.get("scope_start_id")) or "").strip()
            if val and existing.get("rtier"):
                existing["scopeStartId"] = val
            else:
                existing.pop("scopeStartId", None)
        if "algoVersion" in update or "algo_version" in update:
            val = str(update.get("algoVersion", update.get("algo_version")) or "").strip()
            if val and existing.get("rtier"):
                existing["algoVersion"] = val
            else:
                existing.pop("algoVersion", None)
        if "computedAtIso" in update or "computed_at_iso" in update:
            val = str(update.get("computedAtIso", update.get("computed_at_iso")) or "").strip()
            if val and existing.get("rtier"):
                existing["computedAtIso"] = val
            else:
                existing.pop("computedAtIso", None)
        if "reason" in update:
            val = str(update.get("reason") or "").strip()
            if val and existing.get("rtier"):
                existing["reason"] = val
            else:
                existing.pop("reason", None)

        normalized_entry = _normalize_flow_meta_entry(existing)
        if normalized_entry:
            flow_meta[flow_id] = normalized_entry
        else:
            flow_meta.pop(flow_id, None)

    for update in (inp.updates or []):
        if not isinstance(update, dict):
            continue
        apply_update(update)

    inp_payload = inp.model_dump(exclude_unset=True)
    direct_update: Dict[str, Any] = {}
    for key in ("flowId", "flow_id", "tier", "happy", "rtier", "source", "scopeStartId", "scope_start_id", "algoVersion", "algo_version", "computedAtIso", "computed_at_iso", "reason"):
        if key in inp_payload:
            direct_update[key] = inp_payload.get(key)
    if direct_update and str(direct_update.get("flowId", direct_update.get("flow_id")) or "").strip():
        apply_update(direct_update)

    def apply_node_update(node_id_raw: Any, paths_raw: Any, sequence_key_raw: Any, source_raw: Any) -> None:
        node_id = str(node_id_raw or "").strip()
        if not node_id:
            return
        if has_xml and node_id not in node_ids:
            return
        existing = node_path_meta.get(node_id) if isinstance(node_path_meta.get(node_id), dict) else {}
        candidate = {
            "paths": existing.get("paths") if paths_raw is None else paths_raw,
            "sequence_key": existing.get("sequence_key") if sequence_key_raw is None else sequence_key_raw,
            "source": existing.get("source") if source_raw is None else source_raw,
        }
        normalized_entry = _normalize_node_path_entry(candidate)
        if not normalized_entry:
            node_path_meta.pop(node_id, None)
            return
        node_path_meta[node_id] = normalized_entry

    for node_update in (inp.node_updates or []):
        if not isinstance(node_update, dict):
            continue
        apply_node_update(
            node_update.get("node_id", node_update.get("nodeId")),
            node_update.get("paths"),
            node_update.get("sequence_key", node_update.get("sequenceKey")),
            node_update.get("source"),
        )

    if inp.node_id is not None or inp.paths is not None or inp.sequence_key is not None or inp.source is not None:
        apply_node_update(inp.node_id, inp.paths, inp.sequence_key, inp.source)

    def apply_robot_update(element_id_raw: Any, robot_meta_raw: Any, remove_raw: Any = False) -> None:
        element_id = str(element_id_raw or "").strip()
        if not element_id:
            return
        if has_xml and element_id not in node_ids:
            return
        remove = bool(remove_raw)
        if remove or robot_meta_raw is None:
            robot_meta_by_element_id.pop(element_id, None)
            return
        normalized_entry = _normalize_robot_meta_v1(robot_meta_raw)
        if not normalized_entry:
            robot_meta_by_element_id.pop(element_id, None)
            return
        robot_meta_by_element_id[element_id] = normalized_entry

    for robot_update in (inp.robot_updates or []):
        if not isinstance(robot_update, dict):
            continue
        apply_robot_update(
            robot_update.get("element_id", robot_update.get("elementId")),
            robot_update.get("robot_meta", robot_update.get("robotMeta")),
            robot_update.get("remove", robot_update.get("delete")),
        )

    if inp.robot_element_id is not None or inp.robot_meta is not None or inp.remove_robot_meta is not None:
        apply_robot_update(inp.robot_element_id, inp.robot_meta, inp.remove_robot_meta)

    if "robotElementId" in inp_payload or "robot_element_id" in inp_payload:
        apply_robot_update(
            inp_payload.get("robotElementId", inp_payload.get("robot_element_id")),
            inp_payload.get("robotMeta", inp_payload.get("robot_meta")),
            inp_payload.get("removeRobotMeta", inp_payload.get("remove_robot_meta")),
        )

    flow_meta = _enforce_gateway_tier_constraints(
        flow_meta,
        outgoing_by_source=outgoing_by_source,
        gateway_mode_by_node=gateway_mode_by_node,
    )

    normalized = _normalize_bpmn_meta(
        {
            "version": current.get("version", 1),
            "flow_meta": flow_meta,
            "node_path_meta": node_path_meta,
            "robot_meta_by_element_id": robot_meta_by_element_id,
            "hybrid_layer_by_element_id": hybrid_layer_by_element_id,
            "hybrid_v2": hybrid_v2,
        },
        allowed_flow_ids=flow_ids if has_xml else None,
        allowed_node_ids=node_ids if has_xml else None,
    )
    normalized["flow_meta"] = _enforce_gateway_tier_constraints(
        dict(normalized.get("flow_meta") or {}),
        outgoing_by_source=outgoing_by_source,
        gateway_mode_by_node=gateway_mode_by_node,
    )
    if normalized != getattr(s, "bpmn_meta", {}):
        s.bpmn_meta = normalized
        st.save(s)
    return normalized


@app.post("/api/sessions/{session_id}/bpmn_meta/infer_rtiers")
def session_bpmn_meta_infer_rtiers(session_id: str, inp: InferRtiersIn) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    merged = _infer_and_merge_rtiers(
        sess=s,
        scope_start_id=str(inp.scopeStartId or "").strip(),
        success_end_ids=inp.successEndIds,
        fail_end_ids=inp.failEndIds,
    )
    meta = merged.get("meta") if isinstance(merged, dict) else {}
    inference = merged.get("inference") if isinstance(merged, dict) else {}
    normalized_meta = _normalize_bpmn_meta(meta)
    if normalized_meta != getattr(s, "bpmn_meta", {}):
        s.bpmn_meta = normalized_meta
        st.save(s)
    return {"meta": normalized_meta, "inference": inference}






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

    flow_ctx = _collect_sequence_flow_meta(xml)
    flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
    node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()
    current_meta = _normalize_bpmn_meta(
        getattr(s, "bpmn_meta", {}),
        allowed_flow_ids=flow_ids,
        allowed_node_ids=node_ids,
    )
    if isinstance(inp.bpmn_meta, dict):
        incoming_meta = inp.bpmn_meta
        incoming_hybrid_layer = incoming_meta.get("hybrid_layer_by_element_id")
        current_hybrid_layer = current_meta.get("hybrid_layer_by_element_id", {})
        if isinstance(incoming_hybrid_layer, dict):
            if not incoming_hybrid_layer and isinstance(current_hybrid_layer, dict) and current_hybrid_layer:
                merged_hybrid_layer = current_hybrid_layer
            else:
                merged_hybrid_layer = incoming_hybrid_layer
        else:
            merged_hybrid_layer = current_hybrid_layer

        incoming_hybrid_v2 = incoming_meta.get("hybrid_v2")
        current_hybrid_v2 = current_meta.get("hybrid_v2", {})
        if isinstance(incoming_hybrid_v2, dict):
            incoming_v2_size = _hybrid_v2_payload_size(incoming_hybrid_v2)
            current_v2_size = _hybrid_v2_payload_size(current_hybrid_v2)
            merged_hybrid_v2 = current_hybrid_v2 if incoming_v2_size <= 0 < current_v2_size else incoming_hybrid_v2
        else:
            merged_hybrid_v2 = current_hybrid_v2

        raw_bpmn_meta = {
            "version": incoming_meta.get("version", current_meta.get("version", 1)),
            "flow_meta": incoming_meta.get("flow_meta", current_meta.get("flow_meta", {})),
            "node_path_meta": incoming_meta.get("node_path_meta", current_meta.get("node_path_meta", {})),
            "robot_meta_by_element_id": incoming_meta.get(
                "robot_meta_by_element_id",
                current_meta.get("robot_meta_by_element_id", {}),
            ),
            "hybrid_layer_by_element_id": merged_hybrid_layer,
            "hybrid_v2": merged_hybrid_v2,
        }
    else:
        raw_bpmn_meta = current_meta
    s.bpmn_xml = xml
    s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
    s.bpmn_graph_fingerprint = _session_graph_fingerprint(s)
    normalized_meta = _normalize_bpmn_meta(
        raw_bpmn_meta,
        allowed_flow_ids=flow_ids,
        allowed_node_ids=node_ids,
    )
    normalized_meta["flow_meta"] = _enforce_gateway_tier_constraints(
        dict(normalized_meta.get("flow_meta") or {}),
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )
    s.bpmn_meta = normalized_meta
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
    s.bpmn_meta = _normalize_bpmn_meta({})
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

    sidecar_name = f"session_{s.id}.bpmnmeta.json"
    sidecar_payload = _normalize_bpmn_meta(getattr(s, "bpmn_meta", {}))
    (out_dir / sidecar_name).write_text(
        json.dumps(sidecar_payload, ensure_ascii=False, indent=2),
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

    return {"ok": True, "exported_to": str(out_dir), "bpmn_meta_file": sidecar_name}


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
# Enterprise org endpoints (dual-mode with legacy routes)
# -----------------------------

def _org_role_for_request(request: Request, org_id: str) -> str:
    user = _request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    role = get_user_org_role(user_id, org_id, is_admin=is_admin)
    return str(role or "")


def _require_org_member_for_enterprise(request: Request, org_id: str) -> str:
    oid = str(org_id or "").strip()
    user = _request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    if not oid:
        raise HTTPException(status_code=404, detail="not found")
    if not user_has_org_membership(user_id, oid, is_admin=is_admin):
        raise HTTPException(status_code=404, detail="not found")
    return _org_role_for_request(request, oid)


def _require_org_role(request: Request, org_id: str, allowed: Set[str]) -> str:
    role = _require_org_member_for_enterprise(request, org_id)
    if role not in allowed:
        raise HTTPException(status_code=403, detail="forbidden")
    return role


def _enterprise_require_org_member(request: Request, org_id: str) -> Tuple[Optional[str], Optional[JSONResponse]]:
    oid = str(org_id or "").strip()
    if not oid:
        return None, _enterprise_error(404, "not_found", "not_found")
    uid, is_admin = _request_user_meta(request)
    if not uid:
        return None, _enterprise_error(401, "unauthorized", "unauthorized")
    if not user_has_org_membership(uid, oid, is_admin=is_admin):
        return None, _enterprise_error(404, "not_found", "not_found")
    role = str(get_user_org_role(uid, oid, is_admin=is_admin) or "").strip().lower()
    if role not in _ORG_READ_ROLES and not is_admin:
        return None, _enterprise_error(403, "forbidden", "insufficient_permissions")
    return role, None


def _enterprise_require_org_role(request: Request, org_id: str, allowed: Set[str]) -> Tuple[Optional[str], Optional[JSONResponse]]:
    role, err = _enterprise_require_org_member(request, org_id)
    if err is not None:
        return None, err
    if str(role or "").strip().lower() not in {str(x or "").strip().lower() for x in allowed}:
        return None, _enterprise_error(403, "forbidden", "insufficient_permissions")
    return role, None


def _enterprise_require_project_access(
    request: Request,
    org_id: str,
    project_id: str,
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[JSONResponse]]:
    role, err = _enterprise_require_org_member(request, org_id)
    if err is not None:
        return None, None, err
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    if not pid:
        return None, None, _enterprise_error(404, "not_found", "not_found")
    scope = _project_scope_for_request(request, oid)
    if str(scope.get("mode") or "") != "all":
        allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
        if pid not in allowed:
            return None, None, _enterprise_error(404, "not_found", "not_found")
    return role, scope, None


def _session_access_from_request(
    request: Optional[Request],
    session_id: str,
    *,
    org_id: Optional[str] = None,
) -> Tuple[Optional[Session], Optional[Dict[str, Any]], Optional[JSONResponse]]:
    sid = str(session_id or "").strip()
    if not sid:
        return None, None, _enterprise_error(404, "not_found", "not_found")
    st = get_storage()
    oid = str(org_id or "").strip() or _request_active_org_id(request)
    sess = st.load(sid, org_id=oid, is_admin=True)
    if not sess:
        return None, None, _enterprise_error(404, "not_found", "not_found")
    scope = _project_scope_for_request(request, oid)
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if project_id and str(scope.get("mode") or "") != "all":
        allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
        if project_id not in allowed:
            return None, None, _enterprise_error(404, "not_found", "not_found")
    return sess, scope, None


def _scope_allowed_project_ids(scope_raw: Any) -> Set[str]:
    scope = scope_raw if isinstance(scope_raw, dict) else {}
    if str(scope.get("mode") or "") == "all":
        return set()
    return {
        str(item or "").strip()
        for item in (scope.get("project_ids") or [])
        if str(item or "").strip()
    }


def _is_role_allowed(role_raw: Any, allowed: Set[str]) -> bool:
    role = str(role_raw or "").strip().lower()
    return role in {str(item or "").strip().lower() for item in allowed}


def _request_user_email(request: Optional[Request]) -> str:
    user = _request_auth_user(request) if request is not None else {}
    email = str((user or {}).get("email") or "").strip().lower()
    if email:
        return email
    uid = str((user or {}).get("id") or "").strip()
    if not uid:
        return ""
    row = find_user_by_id(uid)
    return str((row or {}).get("email") or "").strip().lower()


def _invite_email_enabled() -> bool:
    return _env_bool("INVITE_EMAIL_ENABLED", default=False)


def _invite_ttl_hours_default() -> int:
    return max(1, _env_int("INVITE_TTL_HOURS", 72))


def _audit_retention_days() -> int:
    return max(1, _env_int("AUDIT_RETENTION_DAYS", 90))


def _invite_cleanup_keep_days() -> int:
    return max(1, _env_int("INVITE_CLEANUP_KEEP_DAYS", 30))


def _invite_email_config() -> Dict[str, Any]:
    return {
        "host": str(os.environ.get("SMTP_HOST", "") or "").strip(),
        "port": max(1, _env_int("SMTP_PORT", 587)),
        "user": str(os.environ.get("SMTP_USER", "") or "").strip(),
        "password": str(os.environ.get("SMTP_PASS", "") or ""),
        "from": str(os.environ.get("SMTP_FROM", "") or "").strip(),
        "tls": _env_bool("SMTP_TLS", default=True),
        "base_url": str(os.environ.get("APP_BASE_URL", "") or "").strip(),
    }


def _invite_email_config_ready() -> Tuple[bool, str, Dict[str, Any]]:
    cfg = _invite_email_config()
    missing: List[str] = []
    for key in ("host", "port", "from", "base_url"):
        val = cfg.get(key)
        if not val:
            missing.append(key)
    if missing:
        return False, f"invite_email_config_missing:{','.join(missing)}", cfg
    return True, "", cfg


def _validate_invite_email_config_on_boot() -> None:
    if not _invite_email_enabled():
        return
    ok, reason, _ = _invite_email_config_ready()
    if not ok:
        print(f"[INVITE_EMAIL] boot_warning reason={reason}")


def _build_invite_link(base_url: str, token: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    return f"{base}/accept-invite?token={token}"


def _send_org_invite_email(
    *,
    to_email: str,
    org_name: str,
    role: str,
    invite_link: str,
    expires_at: int,
) -> None:
    cfg = _invite_email_config()
    host = str(cfg.get("host") or "").strip()
    port = int(cfg.get("port") or 587)
    sender = str(cfg.get("from") or "").strip()
    username = str(cfg.get("user") or "").strip()
    password = str(cfg.get("password") or "")
    use_tls = bool(cfg.get("tls"))

    msg = EmailMessage()
    msg["Subject"] = f"ProcessMap invite: {org_name}"
    msg["From"] = sender
    msg["To"] = str(to_email or "").strip().lower()
    expires_dt = datetime.fromtimestamp(int(expires_at or 0), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    body = (
        f"Вы приглашены в организацию \"{org_name}\".\n\n"
        f"Роль: {role}\n"
        f"Ссылка для принятия приглашения:\n{invite_link}\n\n"
        f"Срок действия: {expires_dt}\n"
    )
    msg.set_content(body)

    with smtplib.SMTP(host=host, port=port, timeout=20) as smtp:
        if use_tls:
            smtp.starttls()
        if username and password:
            smtp.login(username, password)
        smtp.send_message(msg)


_validate_invite_email_config_on_boot()


def _should_reveal_invite_token(request: Optional[Request]) -> bool:
    raw = str(os.environ.get("FPC_ENTERPRISE_INVITE_TOKEN_EXPOSE", "") or "").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    user = _request_auth_user(request) if request is not None else {}
    return bool((user or {}).get("is_admin", False))


def _audit_log_safe(
    request: Optional[Request],
    *,
    org_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    status: str = "ok",
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    uid, _ = _request_user_meta(request)
    if not uid:
        return
    try:
        append_audit_log(
            actor_user_id=uid,
            org_id=str(org_id or "").strip() or _request_active_org_id(request),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id or "").strip() or "-",
            status=status,
            project_id=project_id,
            session_id=session_id,
            meta=meta if isinstance(meta, dict) else {},
        )
    except Exception as exc:
        print(f"[AUDIT] write_failed action={action} entity={entity_type}:{entity_id} err={exc}")


def _enrich_members_with_email(items_raw: Any) -> List[Dict[str, Any]]:
    items = items_raw if isinstance(items_raw, list) else []
    out: List[Dict[str, Any]] = []
    for row_raw in items:
        row = dict(row_raw or {}) if isinstance(row_raw, dict) else {}
        uid = str(row.get("user_id") or "").strip()
        if uid:
            found = find_user_by_id(uid) or {}
            email = str(found.get("email") or "").strip().lower()
            if email:
                row["email"] = email
        out.append(row)
    return out


def _legacy_load_project_scoped(
    project_id: str,
    request: Optional[Request] = None,
) -> Tuple[Optional[Project], str, Optional[Dict[str, Any]]]:
    oid = _request_active_org_id(request) if request is not None else ""
    pid = str(project_id or "").strip()
    if not pid:
        return None, oid, None
    ps = get_project_storage()
    proj = ps.load(pid, org_id=(oid or None), is_admin=True)
    if not proj:
        return None, oid, None
    scope = _project_scope_for_request(request, oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id())
    allowed = _scope_allowed_project_ids(scope)
    if allowed and str(getattr(proj, "id", "") or "").strip() not in allowed:
        return None, oid, scope
    return proj, (oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id()), scope


def _legacy_load_session_scoped(
    session_id: str,
    request: Optional[Request] = None,
) -> Tuple[Optional[Session], str, Optional[Dict[str, Any]]]:
    oid = _request_active_org_id(request) if request is not None else ""
    sid = str(session_id or "").strip()
    if not sid:
        return None, oid, None
    st = get_storage()
    sess = st.load(sid, org_id=(oid or None), is_admin=True)
    if not sess:
        return None, oid, None
    scope = _project_scope_for_request(request, oid or str(getattr(sess, "org_id", "") or "").strip() or get_default_org_id())
    allowed = _scope_allowed_project_ids(scope)
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if allowed and project_id and project_id not in allowed:
        return None, oid, scope
    return sess, (oid or str(getattr(sess, "org_id", "") or "").strip() or get_default_org_id()), scope


def _enterprise_manage_project_members_guard(
    request: Request,
    org_id: str,
    project_id: str,
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[JSONResponse]]:
    role, scope, err = _enterprise_require_project_access(request, org_id, project_id)
    if err is not None:
        return None, None, err
    if not _is_role_allowed(role, _ORG_PROJECT_MEMBER_MANAGE_ROLES):
        return None, None, _enterprise_error(403, "forbidden", "insufficient_permissions")
    return role, scope, None


def _accessible_session_ids_for_request(
    request: Optional[Request],
    org_id: str,
) -> Set[str]:
    oid = str(org_id or "").strip()
    if not oid and request is not None:
        oid = _request_active_org_id(request)
    org_scope = oid or None
    scope = _project_scope_for_request(request, oid or get_default_org_id())
    allowed_projects = _scope_allowed_project_ids(scope)
    st = get_storage()
    rows = st.list(limit=5000, org_id=org_scope, is_admin=True)
    out: Set[str] = set()
    for row in rows:
        sid = str((row or {}).get("id") or "").strip()
        if not sid:
            continue
        project_id = str((row or {}).get("project_id") or "").strip()
        if allowed_projects and project_id and project_id not in allowed_projects:
            continue
        out.add(sid)
    return out


def _workspace_parse_owner_ids(raw: str) -> List[str]:
    out: List[str] = []
    for part in str(raw or "").split(","):
        value = str(part or "").strip()
        if value:
            out.append(value)
    return sorted(set(out))


def _workspace_reports_count(interview_raw: Any) -> int:
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    by_path = _get_report_versions_by_path(interview)
    total = 0
    for rows in by_path.values():
        if isinstance(rows, list):
            total += len(rows)
    return int(total)


def _workspace_needs_attention_count(interview_raw: Any) -> int:
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    candidates = [
        interview.get("needs_attention"),
        interview.get("needs_attention_count"),
        interview.get("attention_count"),
        interview.get("attention_total"),
        interview.get("missing_count"),
    ]
    for raw in candidates:
        try:
            value = int(raw or 0)
        except Exception:
            value = 0
        if value > 0:
            return value
    attention_items = interview.get("attention_items")
    if isinstance(attention_items, list):
        return len(attention_items)
    return 0


def _workspace_session_status(
    *,
    reports_versions: int,
    version: int,
    bpmn_xml_version: int,
    interview_raw: Any,
) -> str:
    if int(reports_versions or 0) > 0:
        return "ready"
    if int(version or 0) > 0 or int(bpmn_xml_version or 0) > 0:
        return "in_progress"
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    if interview:
        return "in_progress"
    return "draft"


@app.get("/api/enterprise/workspace")
def enterprise_workspace(
    request: Request,
    group_by: str = Query(default="users"),
    q: str = Query(default=""),
    owner_ids: str = Query(default=""),
    project_id: str = Query(default=""),
    status: str = Query(default=""),
    updated_from: int | None = Query(default=None),
    updated_to: int | None = Query(default=None),
    needs_attention: int | None = Query(default=None),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
) -> Dict[str, Any]:
    group = str(group_by or "").strip().lower() or "users"
    if group not in {"users", "projects"}:
        return _enterprise_error(422, "validation_error", "group_by must be users|projects")
    status_filter = str(status or "").strip().lower()
    if status_filter and status_filter not in {"draft", "in_progress", "ready"}:
        return _enterprise_error(422, "validation_error", "status must be draft|in_progress|ready")
    try:
        lim = max(1, min(int(limit or 50), 200))
    except Exception:
        lim = 50
    try:
        off = max(0, int(offset or 0))
    except Exception:
        off = 0

    oid = _request_active_org_id(request)
    role, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    role_l = str(role or "").strip().lower()

    scope = _project_scope_for_request(request, oid)
    allowed_projects = _scope_allowed_project_ids(scope)
    selected_project_id = str(project_id or "").strip()
    if selected_project_id and allowed_projects and selected_project_id not in allowed_projects:
        return _enterprise_error(404, "not_found", "not_found")

    owner_filter_ids = _workspace_parse_owner_ids(owner_ids)
    snapshot = list_workspace_snapshot_rows(
        oid,
        allowed_project_ids=sorted(allowed_projects) if allowed_projects else None,
        q=str(q or "").strip(),
        owner_ids=owner_filter_ids if owner_filter_ids else None,
        updated_from=updated_from,
        updated_to=updated_to,
    )
    raw_projects = snapshot.get("projects")
    if not isinstance(raw_projects, list):
        raw_projects = []
    raw_sessions = snapshot.get("sessions")
    if not isinstance(raw_sessions, list):
        raw_sessions = []

    memberships = _enrich_members_with_email(list_org_memberships(oid))
    org_name = ""
    member_by_user: Dict[str, Dict[str, Any]] = {}
    for row in memberships:
        uid = str(row.get("user_id") or "").strip()
        if not uid:
            continue
        member_by_user[uid] = {
            "id": uid,
            "email": str(row.get("email") or "").strip().lower(),
            "name": str(row.get("email") or uid).strip(),
            "role": str(row.get("role") or "").strip().lower(),
        }
        if not org_name:
            org_name = str(row.get("org_name") or row.get("name") or "").strip()

    sessions_all: List[Dict[str, Any]] = []
    project_counts: Dict[str, int] = {}
    user_session_counts: Dict[str, int] = {}
    for row_raw in raw_sessions:
        row = row_raw if isinstance(row_raw, dict) else {}
        pid = str(row.get("project_id") or "").strip()
        if selected_project_id and pid != selected_project_id:
            continue
        owner_id = str(row.get("owner_user_id") or row.get("created_by") or "").strip()
        interview = {}
        try:
            interview = json.loads(str(row.get("interview_json") or "{}"))
            if not isinstance(interview, dict):
                interview = {}
        except Exception:
            interview = {}
        reports_versions = _workspace_reports_count(interview)
        attention_count = _workspace_needs_attention_count(interview)
        session_status = _workspace_session_status(
            reports_versions=reports_versions,
            version=int(row.get("version") or 0),
            bpmn_xml_version=int(row.get("bpmn_xml_version") or 0),
            interview_raw=interview,
        )
        if status_filter and session_status != status_filter:
            continue
        if needs_attention is not None:
            try:
                needs_filter = int(needs_attention)
            except Exception:
                needs_filter = -1
            if needs_filter == 1 and attention_count <= 0:
                continue
            if needs_filter == 0 and attention_count > 0:
                continue
        owner_info = member_by_user.get(owner_id) or {}
        if owner_id and owner_id not in member_by_user:
            found = find_user_by_id(owner_id) or {}
            email = str(found.get("email") or "").strip().lower()
            owner_info = {
                "id": owner_id,
                "email": email,
                "name": email or owner_id,
                "role": "",
            }
            member_by_user[owner_id] = owner_info
        session = {
            "id": str(row.get("id") or ""),
            "name": str(row.get("title") or row.get("id") or "").strip(),
            "project_id": pid,
            "owner_id": owner_id,
            "owner": str(owner_info.get("email") or owner_id or "").strip(),
            "updated_at": int(row.get("updated_at") or 0),
            "created_at": int(row.get("created_at") or 0),
            "status": session_status,
            "reports_versions": int(reports_versions),
            "needs_attention": int(attention_count),
            "can_view": True,
            "can_edit": role_l in _ORG_EDITOR_ROLES,
            "can_manage": role_l in _ORG_PROJECT_MEMBER_MANAGE_ROLES,
        }
        sessions_all.append(session)
        project_counts[pid] = int(project_counts.get(pid, 0) or 0) + 1
        if owner_id:
            user_session_counts[owner_id] = int(user_session_counts.get(owner_id, 0) or 0) + 1

    sessions_all.sort(key=lambda item: (int(item.get("updated_at") or 0), str(item.get("id") or "")), reverse=True)
    total = len(sessions_all)
    sessions_page = sessions_all[off:off + lim]

    user_project_counts: Dict[str, int] = {}
    projects_out: List[Dict[str, Any]] = []
    for row_raw in raw_projects:
        row = row_raw if isinstance(row_raw, dict) else {}
        pid = str(row.get("id") or "").strip()
        if selected_project_id and pid != selected_project_id:
            continue
        owner_id = str(row.get("owner_user_id") or row.get("created_by") or "").strip()
        owner_info = member_by_user.get(owner_id) or {}
        if owner_id and owner_id not in member_by_user:
            found = find_user_by_id(owner_id) or {}
            email = str(found.get("email") or "").strip().lower()
            owner_info = {
                "id": owner_id,
                "email": email,
                "name": email or owner_id,
                "role": "",
            }
            member_by_user[owner_id] = owner_info
        if int(project_counts.get(pid, 0) or 0) <= 0 and total > 0:
            continue
        if owner_id:
            user_project_counts[owner_id] = int(user_project_counts.get(owner_id, 0) or 0) + 1
        projects_out.append({
            "id": pid,
            "name": str(row.get("title") or pid).strip(),
            "owner_id": owner_id,
            "owner": str(owner_info.get("email") or owner_id or "").strip(),
            "updated_at": int(row.get("updated_at") or 0),
            "created_at": int(row.get("created_at") or 0),
            "session_count": int(project_counts.get(pid, 0) or 0),
        })
    projects_out.sort(key=lambda item: (int(item.get("updated_at") or 0), str(item.get("name") or "")), reverse=True)

    users_out: List[Dict[str, Any]] = []
    for uid, info in member_by_user.items():
        if total > 0 and int(user_session_counts.get(uid, 0) or 0) <= 0 and int(user_project_counts.get(uid, 0) or 0) <= 0:
            continue
        users_out.append({
            "id": uid,
            "name": str(info.get("name") or info.get("email") or uid),
            "email": str(info.get("email") or ""),
            "role": str(info.get("role") or "").strip().lower(),
            "project_count": int(user_project_counts.get(uid, 0) or 0),
            "session_count": int(user_session_counts.get(uid, 0) or 0),
        })
    users_out.sort(key=lambda item: (str(item.get("name") or "").lower(), str(item.get("id") or "")))

    if not org_name:
        org_name = oid

    return {
        "org": {"id": oid, "name": org_name, "role": role_l},
        "group_by": group,
        "users": users_out,
        "projects": projects_out,
        "sessions": sessions_page,
        "page": {"limit": lim, "offset": off, "total": total},
    }


@app.get("/api/orgs")
def list_orgs_endpoint(request: Request) -> Dict[str, Any]:
    user = _request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    active_org_id = str(getattr(request.state, "active_org_id", "") or "").strip() or resolve_active_org_id(user_id, is_admin=is_admin)
    items = list_user_org_memberships(user_id, is_admin=is_admin)
    return {
        "items": items,
        "active_org_id": active_org_id,
        "default_org_id": get_default_org_id(),
    }


@app.post("/api/orgs")
def create_org_endpoint(inp: OrgCreateIn, request: Request) -> Dict[str, Any]:
    user = _request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    current_org_id = str(getattr(request.state, "active_org_id", "") or "").strip()
    current_role = _org_role_for_request(request, current_org_id) if current_org_id else ""
    if not is_admin and current_role not in _ORG_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="forbidden")
    name = str(getattr(inp, "name", "") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    org = create_org_record(name=name, created_by=user_id, org_id=getattr(inp, "id", None))
    return org


@app.get("/api/orgs/{org_id}/members")
def list_org_members_endpoint(org_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    role_l = str(role or "").strip().lower()
    if not (is_admin or _is_role_allowed(role_l, {"org_owner", "org_admin", "auditor"})):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    items = _enrich_members_with_email(list_org_memberships(oid))
    return {"items": items, "count": len(items), "org_id": oid}


@app.patch("/api/orgs/{org_id}/members/{user_id}")
def patch_org_member_endpoint(org_id: str, user_id: str, inp: OrgMemberPatchIn, request: Request):
    oid = str(org_id or "").strip()
    uid = str(user_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    if not uid:
        return _enterprise_error(422, "validation_error", "user_id is required")
    role = str(getattr(inp, "role", "") or "").strip()
    if not role:
        return _enterprise_error(422, "validation_error", "role is required")
    try:
        row = upsert_org_membership(oid, uid, role)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="member.role_change",
        entity_type="org_membership",
        entity_id=f"{oid}:{uid}",
        meta={"target_user_id": uid, "role": str(row.get('role') or '')},
    )
    return row


@app.get("/api/orgs/{org_id}/projects")
def list_org_projects(org_id: str, request: Request) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    scope = _project_scope_for_request(request, oid)
    st = get_project_storage()
    items = st.list(org_id=oid, is_admin=True)
    if str(scope.get("mode") or "") != "all":
        allowed = {str(item or "").strip() for item in (scope.get("project_ids") or []) if str(item or "").strip()}
        items = [proj for proj in items if str(getattr(proj, "id", "") or "").strip() in allowed]
    return [p.model_dump() for p in items]


@app.post("/api/orgs/{org_id}/projects")
def create_org_project(org_id: str, inp: CreateProjectIn, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_WRITE_ROLES)
    if err is not None:
        return err
    title = str(getattr(inp, "title", "") or "").strip()
    if not title:
        return _enterprise_error(422, "validation_error", "title required")
    passport = inp.passport if isinstance(inp.passport, dict) else {}
    user = _request_auth_user(request)
    uid = str(user.get("id") or "").strip()
    st = get_project_storage()
    pid = st.create(title=title, passport=passport, user_id=uid, org_id=oid)
    proj = st.load(pid, org_id=oid, is_admin=True)
    if not proj:
        return _enterprise_error(404, "not_found", "not_found")
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.create",
        entity_type="project",
        entity_id=pid,
        project_id=pid,
        meta={"title": str(getattr(proj, "title", "") or title)},
    )
    return proj.model_dump()


@app.get("/api/orgs/{org_id}/projects/{project_id}")
def get_org_project(org_id: str, project_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    _, _, err = _enterprise_require_project_access(request, oid, project_id)
    if err is not None:
        return err
    st = get_project_storage()
    proj = st.load(project_id, org_id=oid, is_admin=True)
    if not proj:
        return _enterprise_error(404, "not_found", "not_found")
    return proj.model_dump()


@app.get("/api/orgs/{org_id}/projects/{project_id}/sessions")
def list_org_project_sessions(org_id: str, project_id: str, request: Request, mode: str | None = None) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    _, _, err = _enterprise_require_project_access(request, oid, project_id)
    if err is not None:
        return err
    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        return _enterprise_error(422, "validation_error", "invalid mode; allowed: quick_skeleton, deep_audit")
    ps = get_project_storage()
    if ps.load(project_id, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    st = get_storage()
    rows = st.list(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
    out: List[Dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            out.append(_session_api_dump(Session.model_validate(row)))
    return out


@app.post("/api/orgs/{org_id}/projects/{project_id}/sessions")
def create_org_project_session(
    org_id: str,
    project_id: str,
    inp: CreateSessionIn,
    request: Request,
    mode: str | None = Query(default="quick_skeleton"),
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, scope, err = _enterprise_require_project_access(request, oid, project_id)
    if err is not None:
        return err
    if str(role or "").strip().lower() not in _ORG_EDITOR_ROLES:
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        return _enterprise_error(422, "validation_error", "invalid mode; allowed: quick_skeleton, deep_audit")
    ps = get_project_storage()
    scope_obj = scope if isinstance(scope, dict) else {}
    if str(scope_obj.get("mode") or "") != "all":
        allowed = {str(item or "").strip() for item in (scope_obj.get("project_ids") or []) if str(item or "").strip()}
        if str(project_id or "").strip() not in allowed:
            return _enterprise_error(404, "not_found", "not_found")
    if ps.load(project_id, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    roles = _norm_roles(getattr(inp, "roles", None))
    sr = getattr(inp, "start_role", None)
    if sr is not None and str(sr).strip() != "":
        sr = str(sr).strip()
        if roles and sr not in roles:
            return _enterprise_error(422, "validation_error", "start_role must be one of roles")
    else:
        sr = None
    prep_questions = _norm_prep_questions(getattr(inp, "ai_prep_questions", None))
    user = _request_auth_user(request)
    uid = str(user.get("id") or "").strip()
    st = get_storage()
    sid = st.create(
        title=str(getattr(inp, "title", "") or "process"),
        roles=roles,
        start_role=sr,
        project_id=project_id,
        mode=mode,
        user_id=uid,
        org_id=oid,
    )
    sess = st.load(sid, org_id=oid)
    if not sess:
        return _enterprise_error(404, "not_found", "not_found")
    if prep_questions:
        sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        st.save(sess, user_id=uid, org_id=oid)
        sess = st.load(sid, org_id=oid) or sess
    _audit_log_safe(
        request,
        org_id=oid,
        action="session.create",
        entity_type="session",
        entity_id=str(getattr(sess, "id", "") or sid),
        project_id=project_id,
        session_id=str(getattr(sess, "id", "") or sid),
        meta={"title": str(getattr(sess, "title", "") or ""), "mode": str(getattr(sess, "mode", "") or "")},
    )
    return _session_api_dump(sess)


@app.get("/api/orgs/{org_id}/projects/{project_id}/members")
def list_org_project_members(org_id: str, project_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    _, _, err = _enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    ps = get_project_storage()
    if ps.load(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    items = list_project_memberships(oid, project_id=pid)
    return {"items": items, "count": len(items)}


@app.post("/api/orgs/{org_id}/projects/{project_id}/members")
def create_org_project_member(org_id: str, project_id: str, inp: ProjectMemberUpsertIn, request: Request):
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    _, _, err = _enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    ps = get_project_storage()
    if ps.load(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    user_id = str(getattr(inp, "user_id", "") or "").strip()
    role = str(getattr(inp, "role", "") or "").strip()
    if not user_id or not role:
        return _enterprise_error(422, "validation_error", "user_id and role are required")
    try:
        row = upsert_project_membership(oid, pid, user_id, role)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.member.add",
        entity_type="project_membership",
        entity_id=f"{oid}:{pid}:{user_id}",
        project_id=pid,
        meta={"target_user_id": user_id, "role": str(row.get("role") or role)},
    )
    return row


@app.patch("/api/orgs/{org_id}/projects/{project_id}/members/{user_id}")
def patch_org_project_member(org_id: str, project_id: str, user_id: str, inp: ProjectMemberPatchIn, request: Request):
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    uid = str(user_id or "").strip()
    _, _, err = _enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    ps = get_project_storage()
    if ps.load(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    role = str(getattr(inp, "role", "") or "").strip()
    if not uid or not role:
        return _enterprise_error(422, "validation_error", "role is required")
    try:
        row = upsert_project_membership(oid, pid, uid, role)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.member.role_change",
        entity_type="project_membership",
        entity_id=f"{oid}:{pid}:{uid}",
        project_id=pid,
        meta={"target_user_id": uid, "role": str(row.get("role") or role)},
    )
    return row


@app.delete("/api/orgs/{org_id}/projects/{project_id}/members/{user_id}")
def delete_org_project_member(org_id: str, project_id: str, user_id: str, request: Request):
    oid = str(org_id or "").strip()
    pid = str(project_id or "").strip()
    uid = str(user_id or "").strip()
    _, _, err = _enterprise_manage_project_members_guard(request, oid, pid)
    if err is not None:
        return err
    ps = get_project_storage()
    if ps.load(pid, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    deleted = delete_project_membership(oid, pid, uid)
    if not deleted:
        return _enterprise_error(404, "not_found", "not_found")
    _audit_log_safe(
        request,
        org_id=oid,
        action="project.member.delete",
        entity_type="project_membership",
        entity_id=f"{oid}:{pid}:{uid}",
        project_id=pid,
        meta={"target_user_id": uid},
    )
    return Response(status_code=204)


def _normalize_template_scope(raw: Any) -> str:
    scope = str(raw or "").strip().lower()
    if scope in {"personal", "org"}:
        return scope
    return ""


def _normalize_template_payload(raw: Any) -> Dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    ids: List[str] = []
    seen: Set[str] = set()
    raw_ids = payload.get("bpmn_element_ids")
    for item in raw_ids if isinstance(raw_ids, list) else []:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        ids.append(value)
    refs: List[Dict[str, Any]] = []
    seen_refs: Set[str] = set()
    raw_refs = payload.get("bpmn_element_refs")
    for ref_raw in raw_refs if isinstance(raw_refs, list) else []:
        ref = ref_raw if isinstance(ref_raw, dict) else {}
        ref_id = str(ref.get("id") or "").strip()
        if not ref_id or ref_id in seen_refs or (ids and ref_id not in seen):
            continue
        seen_refs.add(ref_id)
        kind = str(ref.get("kind") or "node").strip().lower()
        if kind not in {"node", "edge"}:
            kind = "node"
        normalized_ref = {
            "id": ref_id,
            "kind": kind,
            "name": str(ref.get("name") or "").strip(),
            "type": str(ref.get("type") or "").strip(),
            "lane_name": str(ref.get("lane_name") or ref.get("laneName") or ref.get("lane") or "").strip(),
        }
        if kind == "node":
            incoming_count = ref.get("incoming_count", ref.get("incomingCount"))
            outgoing_count = ref.get("outgoing_count", ref.get("outgoingCount"))
            try:
                incoming_count = int(incoming_count) if incoming_count is not None else None
            except Exception:
                incoming_count = None
            try:
                outgoing_count = int(outgoing_count) if outgoing_count is not None else None
            except Exception:
                outgoing_count = None
            if isinstance(incoming_count, int) and incoming_count >= 0:
                normalized_ref["incoming_count"] = incoming_count
            if isinstance(outgoing_count, int) and outgoing_count >= 0:
                normalized_ref["outgoing_count"] = outgoing_count
            incoming_names: List[str] = []
            outgoing_names: List[str] = []
            seen_in: Set[str] = set()
            seen_out: Set[str] = set()
            for raw_name in ref.get("incoming_names") or ref.get("incomingNames") or []:
                value = str(raw_name or "").strip()
                if not value or value in seen_in:
                    continue
                seen_in.add(value)
                incoming_names.append(value)
            for raw_name in ref.get("outgoing_names") or ref.get("outgoingNames") or []:
                value = str(raw_name or "").strip()
                if not value or value in seen_out:
                    continue
                seen_out.add(value)
                outgoing_names.append(value)
            if incoming_names:
                normalized_ref["incoming_names"] = incoming_names
            if outgoing_names:
                normalized_ref["outgoing_names"] = outgoing_names
        if kind == "edge":
            source_id = str(
                ref.get("source_id") or ref.get("sourceId") or ref.get("from_id") or ref.get("fromId") or ref.get("source") or ref.get("from") or ""
            ).strip()
            target_id = str(
                ref.get("target_id") or ref.get("targetId") or ref.get("to_id") or ref.get("toId") or ref.get("target") or ref.get("to") or ""
            ).strip()
            source_name = str(
                ref.get("source_name") or ref.get("sourceName") or ref.get("from_name") or ref.get("fromName") or ""
            ).strip()
            target_name = str(
                ref.get("target_name") or ref.get("targetName") or ref.get("to_name") or ref.get("toName") or ""
            ).strip()
            if source_id:
                normalized_ref["source_id"] = source_id
            if target_id:
                normalized_ref["target_id"] = target_id
            if source_name:
                normalized_ref["source_name"] = source_name
            if target_name:
                normalized_ref["target_name"] = target_name
        refs.append(normalized_ref)
    return {
        "bpmn_element_ids": ids,
        "bpmn_element_refs": refs,
        "bpmn_fingerprint": str(payload.get("bpmn_fingerprint") or "").strip(),
    }


@app.get("/api/templates")
def list_templates_endpoint(
    request: Request,
    scope: str = Query(default="personal"),
    org_id: str = Query(default=""),
    q: str = Query(default=""),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
):
    uid, _ = _request_user_meta(request)
    if not uid:
        return _enterprise_error(401, "unauthorized", "unauthorized")
    tpl_scope = _normalize_template_scope(scope)
    if not tpl_scope:
        return _enterprise_error(422, "validation_error", "scope must be personal|org")
    oid = ""
    if tpl_scope == "org":
        oid = str(org_id or "").strip() or _request_active_org_id(request)
        _, err = _enterprise_require_org_member(request, oid)
        if err is not None:
            return err
    try:
        rows = storage_list_templates(
            scope=tpl_scope,
            user_id=uid,
            org_id=oid,
            q=str(q or "").strip(),
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    items = rows.get("items")
    if not isinstance(items, list):
        items = []
    return {
        "items": items,
        "scope": tpl_scope,
        "org_id": oid,
        "page": {
            "limit": int(rows.get("limit") or 0),
            "offset": int(rows.get("offset") or 0),
            "total": int(rows.get("total") or 0),
        },
    }


@app.post("/api/templates")
def create_template_endpoint(inp: TemplateCreateIn, request: Request):
    uid, is_admin = _request_user_meta(request)
    if not uid:
        return _enterprise_error(401, "unauthorized", "unauthorized")
    tpl_scope = _normalize_template_scope(getattr(inp, "scope", ""))
    if not tpl_scope:
        return _enterprise_error(422, "validation_error", "scope must be personal|org")
    payload = _normalize_template_payload(getattr(inp, "payload", {}))
    if not isinstance(payload.get("bpmn_element_ids"), list) or not payload.get("bpmn_element_ids"):
        return _enterprise_error(422, "validation_error", "payload.bpmn_element_ids is required")
    oid = ""
    role = ""
    if tpl_scope == "org":
        oid = str(getattr(inp, "org_id", "") or "").strip() or _request_active_org_id(request)
        role, err = _enterprise_require_org_member(request, oid)
        if err is not None:
            return err
        if not (is_admin or _is_role_allowed(role, _ORG_TEMPLATE_CREATE_ROLES)):
            return _enterprise_error(403, "forbidden", "insufficient_permissions")
    try:
        created = storage_create_template(
            scope=tpl_scope,
            org_id=oid if tpl_scope == "org" else None,
            owner_user_id=uid,
            name=str(getattr(inp, "name", "") or "").strip(),
            description=str(getattr(inp, "description", "") or "").strip(),
            template_type=str(getattr(inp, "template_type", "") or "").strip() or "bpmn_selection_v1",
            payload=payload,
            created_from_session_id=str(getattr(inp, "created_from_session_id", "") or "").strip(),
        )
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    if tpl_scope == "org":
        _audit_log_safe(
            request,
            org_id=oid,
            action="template.create",
            entity_type="template",
            entity_id=str(created.get("id") or "").strip(),
            status="ok",
            meta={
                "scope": "org",
                "owner_user_id": uid,
                "name": str(created.get("name") or "").strip(),
                "role": str(role or "").strip(),
            },
        )
    return created


@app.patch("/api/templates/{template_id}")
def patch_template_endpoint(template_id: str, inp: TemplatePatchIn, request: Request):
    uid, is_admin = _request_user_meta(request)
    if not uid:
        return _enterprise_error(401, "unauthorized", "unauthorized")
    tid = str(template_id or "").strip()
    if not tid:
        return _enterprise_error(404, "not_found", "not_found")
    current = storage_get_template(tid)
    if not current:
        return _enterprise_error(404, "not_found", "not_found")
    scope = _normalize_template_scope(current.get("scope"))
    owner = str(current.get("owner_user_id") or "").strip()
    org_id_value = str(current.get("org_id") or "").strip()
    can_manage = bool(is_admin) or uid == owner
    role = ""
    if scope == "org":
        role, err = _enterprise_require_org_member(request, org_id_value)
        if err is not None:
            return err
        can_manage = can_manage or _is_role_allowed(role, _ORG_TEMPLATE_MANAGE_ROLES)
    if not can_manage:
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    name = getattr(inp, "name", None)
    description = getattr(inp, "description", None)
    if name is None and description is None:
        return current
    try:
        updated = storage_update_template(tid, name=name, description=description)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    if not updated:
        return _enterprise_error(404, "not_found", "not_found")
    if scope == "org":
        _audit_log_safe(
            request,
            org_id=org_id_value,
            action="template.update",
            entity_type="template",
            entity_id=tid,
            status="ok",
            meta={
                "name": str(updated.get("name") or "").strip(),
                "owner_user_id": owner,
                "role": str(role or "").strip(),
            },
        )
    return updated


@app.delete("/api/templates/{template_id}")
def delete_template_endpoint(template_id: str, request: Request):
    uid, is_admin = _request_user_meta(request)
    if not uid:
        return _enterprise_error(401, "unauthorized", "unauthorized")
    tid = str(template_id or "").strip()
    if not tid:
        return _enterprise_error(404, "not_found", "not_found")
    current = storage_get_template(tid)
    if not current:
        return _enterprise_error(404, "not_found", "not_found")
    scope = _normalize_template_scope(current.get("scope"))
    owner = str(current.get("owner_user_id") or "").strip()
    org_id_value = str(current.get("org_id") or "").strip()
    can_manage = bool(is_admin) or uid == owner
    role = ""
    if scope == "org":
        role, err = _enterprise_require_org_member(request, org_id_value)
        if err is not None:
            return err
        can_manage = can_manage or _is_role_allowed(role, _ORG_TEMPLATE_MANAGE_ROLES)
    if not can_manage:
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    deleted = storage_delete_template(tid)
    if not deleted:
        return _enterprise_error(404, "not_found", "not_found")
    if scope == "org":
        _audit_log_safe(
            request,
            org_id=org_id_value,
            action="template.delete",
            entity_type="template",
            entity_id=tid,
            status="ok",
            meta={"owner_user_id": owner, "role": str(role or "").strip()},
        )
    return Response(status_code=204)


@app.get("/api/orgs/{org_id}/invites")
def list_org_invites_endpoint(org_id: str, request: Request):
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    items = list_org_invites(oid, include_inactive=True)
    return {"items": items, "count": len(items)}


@app.post("/api/orgs/{org_id}/invites")
def create_org_invite_endpoint(org_id: str, inp: OrgInviteCreateIn, request: Request):
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    email = str(getattr(inp, "email", "") or "").strip().lower()
    role = str(getattr(inp, "role", "") or "").strip()
    ttl_days = int(getattr(inp, "ttl_days", 7) or 7)
    if not email or "@" not in email:
        return _enterprise_error(422, "validation_error", "valid email is required")
    if not role:
        return _enterprise_error(422, "validation_error", "role is required")
    invite_limit = max(1, _env_int("RL_INVITES_PER_MIN", 20))
    ip_key = str(_request_client_ip(request) or "ip_unknown")
    if not _rate_limit_check(f"invites:create:{oid}:{ip_key}", invite_limit, 60):
        return _enterprise_error(429, "too_many_requests", "too_many_requests")
    uid, is_admin = _request_user_meta(request)
    if not uid:
        return _enterprise_error(401, "unauthorized", "unauthorized")
    ttl_days = 0
    try:
        ttl_days = int(getattr(inp, "ttl_days", 0) or 0)
    except Exception:
        ttl_days = 0
    if ttl_days <= 0:
        ttl_days = max(1, int(math.ceil(float(_invite_ttl_hours_default()) / 24.0)))
    ttl_days = max(1, min(ttl_days, 60))
    email_delivery = _invite_email_enabled()
    if email_delivery:
        ready, reason, _ = _invite_email_config_ready()
        if not ready:
            print(f"[INVITE_EMAIL] unavailable reason={reason}")
            return _enterprise_error(503, "service_unavailable", "invite_email_unavailable")
    try:
        created = create_org_invite(oid, email, role, created_by=uid, ttl_days=ttl_days)
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    token = str(created.pop("token", "") or "")
    response_payload: Dict[str, Any] = {"invite": created}
    if email_delivery:
        ok_cfg, _, cfg = _invite_email_config_ready()
        if not ok_cfg:
            _ = delete_org_invite(oid, str(created.get("id") or ""))
            return _enterprise_error(503, "service_unavailable", "invite_email_unavailable")
        invite_link = _build_invite_link(str(cfg.get("base_url") or ""), token)
        try:
            _send_org_invite_email(
                to_email=email,
                org_name=str(created.get("org_id") or oid),
                role=str(created.get("role") or "viewer"),
                invite_link=invite_link,
                expires_at=int(created.get("expires_at") or 0),
            )
        except Exception:
            _ = delete_org_invite(oid, str(created.get("id") or ""))
            _audit_log_safe(
                request,
                org_id=oid,
                action="invite.create",
                entity_type="org_invite",
                entity_id=str(created.get("id") or ""),
                status="fail",
                meta={"email": email, "role": str(created.get("role") or ""), "reason": "smtp_send_failed"},
            )
            return _enterprise_error(502, "upstream_error", "invite_email_send_failed")
        response_payload["delivery"] = "email"
    else:
        expose_token = _should_reveal_invite_token(request)
        if expose_token and token:
            response_payload["invite_token"] = token
            cfg = _invite_email_config()
            base_url = str(cfg.get("base_url") or "").strip()
            response_payload["invite_link"] = _build_invite_link(base_url, token) if base_url else f"/app/org?tab=invites&org_id={oid}&token={token}"
        response_payload["delivery"] = "token"
    _audit_log_safe(
        request,
        org_id=oid,
        action="invite.create",
        entity_type="org_invite",
        entity_id=str(created.get("id") or ""),
        status="ok",
        meta={"email": email, "role": str(created.get("role") or ""), "delivery": str(response_payload.get("delivery") or "token"), "is_admin": bool(is_admin)},
    )
    return response_payload


def _accept_org_invite_response(request: Request, *, org_id: Optional[str], token: str):
    oid = str(org_id or "").strip()
    uid, _ = _request_user_meta(request)
    if not uid:
        return _enterprise_error(401, "unauthorized", "unauthorized")
    accept_limit = max(1, _env_int("RL_ACCEPT_PER_MIN", 30))
    ip_key = str(_request_client_ip(request) or "ip_unknown")
    if not _rate_limit_check(f"invites:accept:{ip_key}", accept_limit, 60):
        return _enterprise_error(429, "too_many_requests", "too_many_requests")
    token = str(token or "").strip()
    if not token:
        return _enterprise_error(422, "validation_error", "token is required")
    email = _request_user_email(request)
    if not email:
        return _enterprise_error(404, "not_found", "user_email_not_found")
    try:
        accepted = accept_org_invite(oid or None, token, accepted_by=uid, accepted_email=email)
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        audit_org = oid or _request_active_org_id(request)
        _audit_log_safe(
            request,
            org_id=audit_org,
            action="invite.accept",
            entity_type="org_invite",
            entity_id="-",
            status="fail",
            meta={"reason": marker or "validation_error"},
        )
        if marker in {"invite_not_found", "invite_revoked"}:
            return _enterprise_error(404, "not_found", "not_found")
        if marker == "invite_expired":
            return _enterprise_error(410, "gone", "invite_expired")
        if marker in {"invite_already_accepted", "invite_email_mismatch"}:
            return _enterprise_error(409, "conflict", marker)
        return _enterprise_error(422, "validation_error", marker or "validation_error")
    accepted_org = str(accepted.get("org_id") or oid or "").strip()
    _audit_log_safe(
        request,
        org_id=accepted_org or _request_active_org_id(request),
        action="invite.accept",
        entity_type="org_invite",
        entity_id=str(accepted.get("id") or ""),
        status="ok",
        meta={"email": email, "role": str(accepted.get("role") or "")},
    )
    return {"invite": accepted, "membership": {"org_id": accepted_org, "user_id": uid, "role": str(accepted.get("role") or "viewer")}}


@app.post("/api/orgs/{org_id}/invites/accept")
def accept_org_invite_endpoint(org_id: str, inp: OrgInviteAcceptIn, request: Request):
    oid = str(org_id or "").strip()
    token = str(getattr(inp, "token", "") or "").strip()
    return _accept_org_invite_response(request, org_id=oid, token=token)


@app.post("/api/invites/accept")
def accept_invite_endpoint(inp: OrgInviteAcceptIn, request: Request):
    token = str(getattr(inp, "token", "") or "").strip()
    return _accept_org_invite_response(request, org_id=None, token=token)


@app.post("/api/orgs/{org_id}/invites/{invite_id}/revoke")
def revoke_org_invite_endpoint(org_id: str, invite_id: str, request: Request):
    oid = str(org_id or "").strip()
    iid = str(invite_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    uid, _ = _request_user_meta(request)
    deleted = revoke_org_invite(oid, iid, revoked_by=uid)
    if not deleted:
        return _enterprise_error(404, "not_found", "not_found")
    _audit_log_safe(
        request,
        org_id=oid,
        action="invite.revoke",
        entity_type="org_invite",
        entity_id=iid,
        status="ok",
    )
    return Response(status_code=204)


@app.post("/api/orgs/{org_id}/invites/cleanup")
def cleanup_org_invites_endpoint(org_id: str, request: Request, keep_days: int = 0):
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    keep = int(keep_days or 0)
    if keep <= 0:
        keep = _invite_cleanup_keep_days()
    deleted = cleanup_org_invites(oid, keep_days=keep)
    _audit_log_safe(
        request,
        org_id=oid,
        action="invite.cleanup",
        entity_type="org_invite",
        entity_id=f"cleanup:{oid}",
        status="ok",
        meta={"deleted": int(deleted or 0), "keep_days": int(keep)},
    )
    return {"ok": True, "org_id": oid, "deleted": int(deleted or 0), "keep_days": int(keep)}


@app.get("/api/orgs/{org_id}/audit")
def list_org_audit_endpoint(
    org_id: str,
    request: Request,
    limit: int = 100,
    action: str = "",
    project_id: str = "",
    session_id: str = "",
    status: str = "",
):
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    role_l = str(role or "").strip().lower()
    if not (is_admin or _is_role_allowed(role_l, _ORG_AUDIT_READ_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    scope = _project_scope_for_request(request, oid)
    requested_project = str(project_id or "").strip()
    if requested_project and str(scope.get("mode") or "") != "all":
        allowed = _scope_allowed_project_ids(scope)
        if requested_project not in allowed:
            return _enterprise_error(404, "not_found", "not_found")
    rows = list_audit_log(
        oid,
        limit=limit,
        action=action,
        project_id=requested_project or None,
        session_id=str(session_id or "").strip() or None,
        status=str(status or "").strip() or None,
    )
    if str(scope.get("mode") or "") != "all":
        allowed = _scope_allowed_project_ids(scope)
        filtered: List[Dict[str, Any]] = []
        for row in rows:
            pid = str((row or {}).get("project_id") or "").strip()
            if not pid or pid in allowed:
                filtered.append(row)
        rows = filtered
    for row in rows:
        actor_id = str((row or {}).get("actor_user_id") or "").strip()
        if actor_id:
            actor = find_user_by_id(actor_id) or {}
            email = str(actor.get("email") or "").strip().lower()
            if email:
                row["actor_email"] = email
    _ = uid
    return {"items": rows, "count": len(rows)}


@app.post("/api/orgs/{org_id}/audit/cleanup")
def cleanup_org_audit_endpoint(org_id: str, request: Request, retention_days: int = 0):
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    retention = int(retention_days or 0)
    if retention <= 0:
        retention = _audit_retention_days()
    deleted = cleanup_audit_log(oid, retention_days=retention)
    _audit_log_safe(
        request,
        org_id=oid,
        action="audit.cleanup",
        entity_type="audit_log",
        entity_id=f"cleanup:{oid}",
        status="ok",
        meta={"deleted": int(deleted or 0), "retention_days": int(retention)},
    )
    return {"ok": True, "org_id": oid, "deleted": int(deleted or 0), "retention_days": int(retention)}


@app.get("/api/orgs/{org_id}/sessions/{session_id}/reports/versions")
def list_org_session_report_versions(
    org_id: str,
    session_id: str,
    request: Request,
    path_id: str = "",
    steps_hash: str = "",
):
    oid = str(org_id or "").strip()
    sess, _, err = _session_access_from_request(request, session_id, org_id=oid)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    role = str((_project_scope_for_request(request, oid) or {}).get("org_role") or "").strip().lower()
    if not (is_admin or _is_role_allowed(role, _ORG_READ_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    pid = str(path_id or "").strip()
    if not pid:
        return _enterprise_error(422, "validation_error", "path_id is required")
    rows = _list_path_report_versions_core(
        session_id=str(getattr(sess, "id", "") or session_id),
        path_id=pid,
        steps_hash=steps_hash,
        request=request,
        org_id=oid,
        is_admin=True,
    )
    _ = uid
    return rows


@app.post("/api/orgs/{org_id}/sessions/{session_id}/reports/build")
def build_org_session_report(
    org_id: str,
    session_id: str,
    inp: OrgReportBuildIn,
    request: Request,
):
    oid = str(org_id or "").strip()
    sess, scope, err = _session_access_from_request(request, session_id, org_id=oid)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    role = str(((scope if isinstance(scope, dict) else {}).get("org_role") or "")).strip().lower()
    if not (is_admin or _is_role_allowed(role, _ORG_EDITOR_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    path_id = str(getattr(inp, "path_id", "") or "").strip()
    if not path_id:
        return _enterprise_error(422, "validation_error", "path_id is required")
    created = _create_path_report_version_core(
        session_id=str(getattr(sess, "id", "") or session_id),
        path_id=path_id,
        inp=CreatePathReportVersionIn(
            steps_hash=str(getattr(inp, "steps_hash", "") or ""),
            request_payload_json=(getattr(inp, "request_payload_json", {}) or {}),
            prompt_template_version=str(getattr(inp, "prompt_template_version", "v2") or "v2"),
        ),
        request=request,
        org_id=oid,
        is_admin=True,
    )
    if isinstance(created, dict) and created.get("error"):
        marker = str(created.get("error") or "").strip().lower()
        if "required" in marker or "invalid" in marker or "missing" in marker:
            return _enterprise_error(422, "validation_error", str(created.get("error") or "validation_error"))
        return _enterprise_error(404, "not_found", "not_found")
    _ = uid
    return created


@app.get("/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}")
def get_org_session_report_version(
    org_id: str,
    session_id: str,
    version_id: str,
    request: Request,
    path_id: str = "",
):
    oid = str(org_id or "").strip()
    sess, scope, err = _session_access_from_request(request, session_id, org_id=oid)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    role = str(((scope if isinstance(scope, dict) else {}).get("org_role") or "")).strip().lower()
    if not (is_admin or _is_role_allowed(role, _ORG_READ_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    pid = str(path_id or "").strip()
    rid = str(version_id or "").strip()
    if not rid:
        return _enterprise_error(404, "not_found", "not_found")
    if not pid:
        by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
        for candidate_pid, rows in by_path.items():
            if any(str((row or {}).get("id") or "").strip() == rid for row in (rows or [])):
                pid = str(candidate_pid or "").strip()
                break
    if not pid:
        return _enterprise_error(404, "not_found", "not_found")
    detail = _get_path_report_version_detail_core(
        session_id=str(getattr(sess, "id", "") or session_id),
        path_id=pid,
        report_id=rid,
        request=request,
        org_id=oid,
        is_admin=True,
    )
    if isinstance(detail, dict) and detail.get("error"):
        return _enterprise_error(404, "not_found", "not_found")
    _ = uid
    return detail


@app.delete("/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}")
def delete_org_session_report_version(
    org_id: str,
    session_id: str,
    version_id: str,
    request: Request,
    path_id: str = "",
):
    oid = str(org_id or "").strip()
    sess, scope, err = _session_access_from_request(request, session_id, org_id=oid)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    role = str(((scope if isinstance(scope, dict) else {}).get("org_role") or "")).strip().lower()
    if not (is_admin or _is_role_allowed(role, _ORG_REPORT_DELETE_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    pid = str(path_id or "").strip()
    rid = str(version_id or "").strip()
    if not rid:
        return _enterprise_error(404, "not_found", "not_found")
    if not pid:
        by_path = _get_report_versions_by_path(getattr(sess, "interview", {}))
        for candidate_pid, rows in by_path.items():
            if any(str((row or {}).get("id") or "").strip() == rid for row in (rows or [])):
                pid = str(candidate_pid or "").strip()
                break
    if not pid:
        return _enterprise_error(404, "not_found", "not_found")
    try:
        response = _delete_path_report_version_core(
            session_id=str(getattr(sess, "id", "") or session_id),
            path_id=pid,
            report_id=rid,
            request=request,
            org_id=oid,
            is_admin=True,
        )
    except HTTPException as exc:
        if int(exc.status_code or 0) == 404:
            return _enterprise_error(404, "not_found", "not_found")
        return _enterprise_error(422, "validation_error", str(exc.detail or "validation_error"))
    _ = uid
    return response


# -----------------------------
# Epic #1: Projects + Process Passport
# -----------------------------

@app.get("/api/projects")
def list_projects(request: Request = None) -> list[dict]:
    oid = _request_active_org_id(request) if request is not None else ""
    scope = _project_scope_for_request(request, oid or get_default_org_id())
    allowed = _scope_allowed_project_ids(scope)
    st = get_project_storage()
    items = st.list(org_id=(oid or None), is_admin=True)
    if allowed:
        items = [proj for proj in items if str(getattr(proj, "id", "") or "").strip() in allowed]
    return [p.model_dump() for p in items]


@app.post("/api/projects")
def create_project(inp: CreateProjectIn, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    oid = _request_active_org_id(request) if request is not None else ""
    st = get_project_storage()
    pid = st.create(title=inp.title, passport=inp.passport, user_id=user_id, org_id=(oid or None))
    proj = st.load(pid, org_id=(oid or None), is_admin=True)
    if not proj:
        raise HTTPException(status_code=500, detail="create failed")
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.create",
        entity_type="project",
        entity_id=pid,
        project_id=pid,
        meta={"title": str(getattr(proj, "title", "") or "")},
    )
    return proj.model_dump()


@app.get("/api/projects/{project_id}")
def get_project(project_id: str, request: Request = None) -> dict:
    proj, _, _ = _legacy_load_project_scoped(project_id, request)
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    return proj.model_dump()


@app.patch("/api/projects/{project_id}")
def patch_project(project_id: str, inp: UpdateProjectIn, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    st = get_project_storage()
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

    st.save(proj, user_id=user_id, org_id=oid, is_admin=True)
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.update",
        entity_type="project",
        entity_id=str(getattr(proj, "id", "") or project_id),
        project_id=str(getattr(proj, "id", "") or project_id),
        meta={"title": str(getattr(proj, "title", "") or "")},
    )
    return proj.model_dump()


@app.put("/api/projects/{project_id}")
def put_project(project_id: str, inp: CreateProjectIn, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    st = get_project_storage()
    if not proj:
        raise HTTPException(status_code=404, detail="not found")

    t = str(inp.title).strip()
    if not t:
        raise HTTPException(status_code=400, detail="title required")
    if not isinstance(inp.passport, dict):
        raise HTTPException(status_code=400, detail="passport must be an object")

    proj.title = t
    proj.passport = inp.passport or {}
    st.save(proj, user_id=user_id, org_id=oid, is_admin=True)
    _audit_log_safe(
        request,
        org_id=oid or str(getattr(proj, "org_id", "") or get_default_org_id()),
        action="project.update",
        entity_type="project",
        entity_id=str(getattr(proj, "id", "") or project_id),
        project_id=str(getattr(proj, "id", "") or project_id),
        meta={"title": str(getattr(proj, "title", "") or ""), "put": True},
    )
    return proj.model_dump()
