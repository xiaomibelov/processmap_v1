from __future__ import annotations


import math
import copy
import hashlib
import logging
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
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse

from .exporters.mermaid import render_mermaid
from .exporters.yaml_export import dump_yaml, session_to_process_dict
from .glossary import normalize_kind, slugify_canon, upsert_term
from .models import Node, Edge, Question, ReportVersion, Session, Project, CreateProjectIn, UpdateProjectIn
from .analytics import compute_analytics
from .normalizer import load_seed_glossary, normalize_nodes
from .resources import build_resources_report
from .storage import (
    Storage,
    get_storage,
    get_project_storage,
    list_user_org_memberships,
    resolve_active_org_id,
    get_user_org_role,
    get_default_org_id,
    count_org_records,
    create_org_record,
    get_org_git_mirror_config,
    list_project_memberships,
    upsert_project_membership,
    delete_project_membership,
    get_effective_project_scope,
    user_has_project_access,
    list_org_memberships,
    upsert_org_membership,
    list_org_invites,
    create_org_invite,
    get_org_invite_by_id,
    promote_regenerated_org_invite,
    preview_org_invite,
    accept_org_invite,
    revoke_org_invite,
    delete_org_invite,
    cleanup_org_invites,
    append_audit_log,
    list_audit_log,
    cleanup_audit_log,
    list_workspace_snapshot_rows,
    update_org_git_mirror_config,
    get_project_explorer_invalidation_targets,
    session_version_payload_hash,
    SESSION_PRESENCE_TTL_SECONDS,
    touch_session_presence,
    leave_session_presence,
    list_session_presence,
    prune_stale_session_presence,
)
from .settings import load_llm_settings, llm_status, save_llm_settings, verify_llm_settings
from .ai.execution_log import check_ai_rate_limit, hash_ai_input, record_ai_execution
from .ai.prompt_registry import get_active_prompt
from .redis_lock import acquire_session_lock
from .redis_cache import (
    cache_get_json,
    cache_set_json,
    explorer_invalidate_children,
    explorer_invalidate_sessions,
    invalidate_session_open,
    invalidate_tldr_session,
    session_open_cache_key,
    session_open_cache_ttl_sec,
    session_open_version_token,
    invalidate_workspace_org,
    tldr_cache_key,
    workspace_cache_key,
    workspace_filters_hash,
)
from .redis_client import runtime_status
from .error_events import get_or_create_backend_request_id
from .error_events.background import capture_backend_async_exception
from .error_events.domain import capture_backend_domain_invariant_violation
from .auto_pass_telemetry import capture_auto_pass_failed_state
from .session_status import (
    SESSION_STATUS_SET as _SESSION_STATUS_SET,
    normalize_session_status as _normalize_session_status_base,
    validate_session_status_transition as _validate_session_status_transition_base,
)
from .validators.coverage import build_questions
from .validators.disposition import build_disposition_questions
from .validators.loss import build_loss_questions, loss_report
from .rtiers import infer_rtiers, parse_bpmn_sequence_graph, resolve_inference_inputs
from .auth import (
    AuthError,
    authenticate_user,
    ensure_invited_identity,
    find_user_by_id,
    find_user_by_email,
    issue_login_tokens,
    refresh_cookie_samesite,
    refresh_cookie_secure,
    revoke_refresh_from_token,
    rotate_refresh_token,
    set_invited_identity_password,
    user_from_bearer_header,
)
from .schemas.legacy_api import (
    AiQuestionsIn,
    AnswerIn,
    AuthLoginIn,
    AuthMeOut,
    AuthTokenOut,
    BpmnMetaPatchIn,
    BpmnRestoreIn,
    BpmnXmlIn,
    CreateEdgeIn,
    CreateNodeIn,
    CreatePathReportVersionIn,
    CreateSessionIn,
    GlossaryAddIn,
    InferRtiersIn,
    InviteActivateIn,
    InvitePreviewIn,
    LlmSettingsIn,
    LlmVerifyIn,
    NodePatchIn,
    NotesExtractionPreviewIn,
    NotesIn,
    OrgCreateIn,
    OrgGitMirrorPatchIn,
    OrgPatchIn,
    OrgInviteAcceptIn,
    OrgInviteCreateIn,
    OrgMemberPatchIn,
    OrgReportBuildIn,
    ProjectMemberPatchIn,
    ProjectMemberUpsertIn,
    SessionPresenceTouchIn,
    SessionTitleQuestionsIn,
    UpdateSessionIn,
    norm_project_session_mode as _norm_project_session_mode,
)
from .legacy.request_context import (
    enterprise_error as _enterprise_error,
    extract_org_from_headers as _extract_org_from_headers,
    extract_org_from_path as _extract_org_from_path,
    request_active_org_id as _request_active_org_id,
    request_auth_user as _request_auth_user,
    request_client_ip as _request_client_ip,
    request_user_email as _request_user_email,
    request_user_meta as _request_user_meta,
)
from .services.org_invites import (
    build_invite_create_audit_meta,
    extract_invite_token,
    invite_error_to_response as _invite_error_to_response,
    invited_identity_state,
    normalize_invite_role,
    normalize_invite_ttl_days,
)
from .services.org_workspace import (
    evaluate_org_git_mirror_config,
    enterprise_require_org_member as _enterprise_require_org_member,
    enterprise_require_org_role as _enterprise_require_org_role,
    validate_org_user_assignable as _validate_org_user_assignable,
    org_role_for_request as _org_role_for_request,
    project_access_allowed as _project_access_allowed,
    project_scope_for_request as _project_scope_for_request,
    rename_org_with_validation,
    require_org_member_for_enterprise as _require_org_member_for_enterprise,
    require_org_role as _require_org_role,
)
from .services.publish_git_mirror import execute_git_mirror_publish
from .services.runtime_meta import get_runtime_build_meta
from .utils.legacy_normalization import (
    norm_edges as _norm_edges,
    norm_interview as _norm_interview,
    norm_nodes as _norm_nodes,
    norm_notes_by_element as _norm_notes_by_element,
    norm_prep_questions as _norm_prep_questions,
    norm_questions as _norm_questions,
    norm_roles as _norm_roles,
    notes_decode as _notes_decode,
    notes_encode as _notes_encode,
    pick as _pick,
)
from .utils.response_builders import (
    build_auth_me_payload,
    build_invite_activate_payload,
    build_invite_preview_payload,
    build_items_payload,
    build_items_count_payload,
)
from .startup.static_mounts import GLOSSARY_SEED, STATIC_DIR, WORKSPACE_DIR as WORKSPACE


app = FastAPI(title="Food Process Copilot MVP")
logger = logging.getLogger(__name__)

AUTH_PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/invite/preview",
    "/api/auth/invite/activate",
    "/api/invite/resolve",
    "/api/invite/activate",
    "/api/invites/accept",
    "/api/health",
    "/api/meta",
}

_ORG_WRITE_ROLES = {"org_owner", "org_admin"}
_ORG_EDITOR_ROLES = {"org_owner", "org_admin", "project_manager", "editor"}
_ORG_READ_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}
_ORG_REPORT_DELETE_ROLES = {"org_owner", "org_admin", "project_manager"}
_ORG_PROJECT_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin", "project_manager"}
_ORG_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin"}
_ORG_INVITE_MANAGE_ROLES = {"org_owner", "org_admin"}
_ORG_AUDIT_READ_ROLES = {"org_owner", "org_admin", "auditor", "project_manager"}
_ORG_TEMPLATE_WRITE_ROLES = {"org_owner", "org_admin", "project_manager"}
_WORKSPACE_ADMIN_ROLES = {"org_owner", "org_admin"}
_WORKSPACE_EDITOR_ROLES = {"org_owner", "org_admin", "project_manager", "editor"}
_WORKSPACE_VIEWER_ROLES = {"viewer", "org_viewer", "auditor"}
_RATE_LIMIT_LOCK = threading.RLock()
_RATE_LIMIT_BUCKETS: Dict[str, deque] = {}


def _clean_name(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _to_epoch_ms(value: Any) -> int:
    try:
        ts = int(value or 0)
    except Exception:
        ts = 0
    if ts <= 0:
        return 0
    # Storage persists unix seconds; UI metadata expects milliseconds.
    if ts < 10_000_000_000:
        return ts * 1000
    return ts


def _to_epoch_iso(value: Any) -> str:
    ts_ms = _to_epoch_ms(value)
    if ts_ms <= 0:
        return ""
    try:
        return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat()
    except Exception:
        return ""


def _looks_like_technical_actor_id(value: Any) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return False
    if re.fullmatch(r"[0-9a-f]{12,}", text):
        return True
    if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f-]{9,}", text):
        return True
    return False


def _build_bpmn_version_author(created_by: Any) -> Dict[str, str]:
    actor_id = str(created_by or "").strip()
    author_email = ""
    author_name = ""

    if actor_id:
        actor = find_user_by_id(actor_id)
        if isinstance(actor, dict):
            author_email = str(actor.get("email") or "").strip().lower()
            author_name = _clean_name(
                actor.get("name")
                or actor.get("full_name")
                or actor.get("display_name")
                or "",
            )
        if (not author_email) and "@" in actor_id and " " not in actor_id:
            author_email = actor_id.lower()

    display = author_name or author_email
    if not display and actor_id:
        if _looks_like_technical_actor_id(actor_id):
            display = f"Пользователь {actor_id[:8]}"
        else:
            display = actor_id
    if not display:
        display = "unknown"

    return {
        "id": actor_id,
        "name": author_name,
        "email": author_email,
        "display_name": display,
    }


def _practical_role_for_org(role_raw: Any, is_admin: bool = False) -> str:
    if bool(is_admin):
        return "admin"
    role = str(role_raw or "").strip().lower()
    if role in _WORKSPACE_ADMIN_ROLES:
        return "admin"
    if role in _WORKSPACE_EDITOR_ROLES:
        return "editor"
    return "viewer"


def _can_manage_workspace(role_raw: Any, is_admin: bool = False) -> bool:
    return _practical_role_for_org(role_raw, is_admin=is_admin) == "admin"


def _can_edit_workspace(role_raw: Any, is_admin: bool = False) -> bool:
    return _practical_role_for_org(role_raw, is_admin=is_admin) in {"admin", "editor"}


def _can_delete_workspace_content(role_raw: Any, is_admin: bool = False) -> bool:
    return _practical_role_for_org(role_raw, is_admin=is_admin) == "admin"


def _normalize_session_status(raw: Any) -> str:
    return _normalize_session_status_base(raw)


def _validate_session_status_transition(current_raw: Any, next_raw: Any, *, role_raw: Any, is_admin: bool = False) -> str:
    return _validate_session_status_transition_base(
        current_raw,
        next_raw,
        can_edit=_can_edit_workspace(role_raw, is_admin=is_admin),
        can_archive=_can_manage_workspace(role_raw, is_admin=is_admin),
    )


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
    d["publish_git_mirror"] = _extract_publish_git_mirror(d.get("interview"))
    return d


def _norm_project_sessions_view(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"", "full"}:
        return "full"
    if text == "summary":
        return "summary"
    return ""


_SESSION_PRESENCE_TTL_SECONDS = SESSION_PRESENCE_TTL_SECONDS
_SESSION_PRESENCE_CLIENT_ID_RE = re.compile(r"[^A-Za-z0-9_.:-]+")
_SESSION_PRESENCE_SURFACE_RE = re.compile(r"[^A-Za-z0-9_.:-]+")


def _normalize_session_presence_client_id(value: Any) -> str:
    text = _SESSION_PRESENCE_CLIENT_ID_RE.sub("", str(value or "").strip())
    return text[:128]


def _normalize_session_presence_surface(value: Any) -> str:
    text = _SESSION_PRESENCE_SURFACE_RE.sub("", str(value or "").strip())
    return (text[:64] or "process_stage")


def _user_is_member_of_org(user_id: str, org_id: str, *, is_admin: bool = False) -> bool:
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        return False
    if bool(is_admin):
        return True
    for row in list_user_org_memberships(uid, is_admin=is_admin):
        if str((row or {}).get("org_id") or "").strip() == oid:
            return True
    return False


_DIAGRAM_TRUTH_PATCH_KEYS = {"bpmn_meta", "interview", "nodes", "edges", "questions", "status"}
_DIAGRAM_TRUTH_PUT_CHANGED_KEYS = ["interview", "nodes", "edges", "questions", "bpmn_meta"]


def _to_non_negative_int(value: Any) -> Optional[int]:
    try:
        parsed = int(value)
    except Exception:
        return None
    if parsed < 0:
        return None
    return parsed


def _resolve_base_diagram_state_version(*, request: Request = None, payload: Dict[str, Any] | None = None) -> Optional[int]:
    body = payload if isinstance(payload, dict) else {}

    for key in ("base_diagram_state_version", "base_bpmn_xml_version", "rev"):
        parsed = _to_non_negative_int(body.get(key))
        if parsed is not None:
            return parsed

    if request is not None:
        for key in ("x-base-diagram-state-version", "x-base-bpmn-xml-version"):
            parsed = _to_non_negative_int((request.headers or {}).get(key))
            if parsed is not None:
                return parsed
        if_match = str((request.headers or {}).get("if-match") or "").strip()
        if if_match:
            if if_match.startswith("W/"):
                if_match = if_match[2:].strip()
            if if_match.startswith('"') and if_match.endswith('"') and len(if_match) >= 2:
                if_match = if_match[1:-1].strip()
            parsed_if_match = _to_non_negative_int(if_match)
            if parsed_if_match is not None:
                return parsed_if_match
        query_params = getattr(request, "query_params", {}) or {}
        for key in ("base_diagram_state_version", "base_bpmn_xml_version", "rev"):
            raw_value = query_params.get(key) if hasattr(query_params, "get") else None
            parsed = _to_non_negative_int(raw_value)
            if parsed is not None:
                return parsed

    return None


def _resolve_actor_label_from_user(user: Any, fallback_user_id: str = "") -> str:
    actor = user if isinstance(user, dict) else {}
    for key in ("name", "username", "email", "id"):
        value = str(actor.get(key) or "").strip()
        if value:
            return value
    return str(fallback_user_id or "").strip()


def _build_server_last_write_payload(sess: Session) -> Dict[str, Any]:
    changed_keys_raw = getattr(sess, "diagram_last_write_changed_keys", [])
    changed_keys = []
    if isinstance(changed_keys_raw, list):
        for item in changed_keys_raw:
            key = str(item or "").strip()
            if key:
                changed_keys.append(key)
    return {
        "actor_user_id": str(getattr(sess, "diagram_last_write_actor_user_id", "") or ""),
        "actor_label": str(getattr(sess, "diagram_last_write_actor_label", "") or ""),
        "at": int(getattr(sess, "diagram_last_write_at", 0) or 0),
        "changed_keys": changed_keys,
    }


def _diagram_state_conflict_payload(
    *,
    code: str,
    session_id: str,
    client_base_version: Optional[int],
    server_current_version: int,
    sess: Session,
) -> Dict[str, Any]:
    return {
        "code": str(code or "DIAGRAM_STATE_CONFLICT"),
        "session_id": str(session_id or ""),
        "client_base_version": client_base_version,
        "server_current_version": int(server_current_version or 0),
        "server_last_write": _build_server_last_write_payload(sess),
    }


def _require_diagram_cas_or_409(
    *,
    sess: Session,
    session_id: str,
    request: Request = None,
    client_base_version: Optional[int],
) -> None:
    # Compatibility bridge for direct function-call harnesses used in unit tests.
    # Real HTTP requests always provide `.scope`; CAS stays strict there.
    if request is None or not hasattr(request, "scope"):
        return
    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    if client_base_version is None:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_BASE_VERSION_REQUIRED",
                session_id=str(getattr(sess, "id", "") or session_id),
                client_base_version=None,
                server_current_version=current_version,
                sess=sess,
            ),
        )
    if int(client_base_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_CONFLICT",
                session_id=str(getattr(sess, "id", "") or session_id),
                client_base_version=int(client_base_version),
                server_current_version=current_version,
                sess=sess,
            ),
        )


def _mark_diagram_truth_write(
    sess: Session,
    *,
    changed_keys: List[str],
    actor_user_id: str = "",
    actor_label: str = "",
) -> None:
    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    next_version = max(0, current_version) + 1
    normalized_keys = sorted(
        {
            str(key or "").strip()
            for key in (changed_keys or [])
            if str(key or "").strip()
        }
    )
    sess.diagram_state_version = next_version
    sess.diagram_last_write_actor_user_id = str(actor_user_id or "").strip()
    sess.diagram_last_write_actor_label = str(actor_label or actor_user_id or "").strip()
    sess.diagram_last_write_at = int(time.time())
    sess.diagram_last_write_changed_keys = normalized_keys


def _resolve_actor_context(request: Request = None) -> Tuple[Dict[str, Any], str, str]:
    user = _request_auth_user(request) if request is not None else {}
    user = user if isinstance(user, dict) else {}
    actor_user_id = str(user.get("id") or "").strip()
    actor_label = _resolve_actor_label_from_user(user, actor_user_id)
    return user, actor_user_id, actor_label


_PUBLISH_GIT_MIRROR_STATES = {
    "not_attempted",
    "skipped_disabled",
    "skipped_invalid_config",
    "pending",
    "synced",
    "failed",
}


def _extract_publish_git_mirror(interview_raw: Any) -> Dict[str, Any]:
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    raw = interview.get("git_mirror_publish")
    state_src = raw if isinstance(raw, dict) else {}
    state = str(state_src.get("mirror_state") or "").strip().lower()
    if state not in _PUBLISH_GIT_MIRROR_STATES:
        state = "not_attempted"
    current_bpmn = state_src.get("current_bpmn")
    current_bpmn = current_bpmn if isinstance(current_bpmn, dict) else {}
    try:
        version_number = int(current_bpmn.get("version_number") or 0)
    except Exception:
        version_number = 0
    version_number = max(0, int(version_number))
    version_id = str(current_bpmn.get("version_id") or "").strip()
    last_error = str(state_src.get("last_error") or "").strip()
    try:
        last_attempt_at = int(state_src.get("last_attempt_at") or 0)
    except Exception:
        last_attempt_at = 0
    return {
        "state": state,
        "version_number": version_number,
        "version_id": version_id or None,
        "last_attempt_at": max(0, int(last_attempt_at)),
        "last_error": last_error or None,
    }


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


def _merge_interview_analysis_namespace(existing_raw: Any, incoming_raw: Any) -> Optional[Dict[str, Any]]:
    existing = existing_raw if isinstance(existing_raw, dict) else {}
    incoming = incoming_raw if isinstance(incoming_raw, dict) else {}
    existing_analysis = existing.get("analysis")
    incoming_has_analysis = "analysis" in incoming
    existing_obj = copy.deepcopy(existing_analysis) if isinstance(existing_analysis, dict) else None
    if not incoming_has_analysis:
        return existing_obj
    incoming_analysis = incoming.get("analysis")
    if not isinstance(incoming_analysis, dict):
        return existing_obj
    out: Dict[str, Any] = existing_obj or {}
    out.update(copy.deepcopy(incoming_analysis))
    return out


def _merge_interview_with_server_fields(existing_raw: Any, incoming_raw: Any) -> Dict[str, Any]:
    existing = existing_raw if isinstance(existing_raw, dict) else {}
    incoming = _norm_interview(incoming_raw)
    out = dict(incoming)
    analysis = _merge_interview_analysis_namespace(existing, incoming)
    if analysis is not None:
        out["analysis"] = analysis
    else:
        out.pop("analysis", None)
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


def _preserve_current_interview_analysis_before_save(
    st: Storage,
    sess: Session,
    *,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> None:
    sid = str(getattr(sess, "id", "") or "").strip()
    if not sid:
        return
    current = st.load(sid, org_id=org_id, is_admin=is_admin)
    if not current:
        return
    analysis = _merge_interview_analysis_namespace(
        getattr(sess, "interview", {}),
        getattr(current, "interview", {}),
    )
    interview = dict(getattr(sess, "interview", {}) or {})
    if analysis is not None:
        interview["analysis"] = analysis
    else:
        interview.pop("analysis", None)
    sess.interview = interview


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
        _preserve_current_interview_analysis_before_save(st, sess, org_id=org, is_admin=admin)
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
        _preserve_current_interview_analysis_before_save(st, sess, org_id=org, is_admin=admin)
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


def _path_report_warning_codes(row_raw: Any) -> List[str]:
    row = row_raw if isinstance(row_raw, dict) else {}
    out: List[str] = []
    seen: Set[str] = set()
    for item in row.get("warnings_json") or []:
        code = ""
        if isinstance(item, dict):
            code = str(item.get("code") or "").strip()
        else:
            code = str(item or "").strip()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out[:20]


def _emit_path_report_domain_anomaly(
    report_row: Dict[str, Any],
    *,
    session_id: str,
    path_id: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    request_id: Optional[str] = None,
    route: Optional[str] = None,
    error_code: str = "path_report_generation_failed",
    error_class: str = "",
) -> Optional[Dict[str, Any]]:
    row = report_row if isinstance(report_row, dict) else {}
    if str(row.get("status") or "").strip().lower() != "error":
        return None
    sid = str(session_id or row.get("session_id") or "").strip()
    pid = str(path_id or row.get("path_id") or "").strip()
    rid = str(row.get("id") or row.get("report_id") or "").strip()
    code = str(error_code or "path_report_generation_failed").strip() or "path_report_generation_failed"
    return capture_backend_domain_invariant_violation(
        domain="path_report",
        invariant_name=code,
        message=f"Path report final semantic failure: {code}",
        severity="error",
        user_id=str(user_id or "").strip() or None,
        org_id=str(org_id or "").strip() or None,
        session_id=sid or None,
        project_id=str(project_id or "").strip() or None,
        route=str(route or "").strip() or (f"/api/sessions/{sid}/paths/{pid}/reports" if sid and pid else None),
        request_id=str(request_id or "").strip() or None,
        correlation_id=rid or None,
        context_json={
            "operation": "path_report_generation",
            "report_id": rid,
            "report_version_id": rid,
            "path_id": pid,
            "version": int(row.get("version") or 0),
            "steps_hash": str(row.get("steps_hash") or "").strip(),
            "status": str(row.get("status") or "").strip().lower(),
            "error_code": code,
            "error_class": str(error_class or "").strip(),
            "model": str(row.get("model") or "").strip(),
            "prompt_template_version": str(row.get("prompt_template_version") or "").strip(),
            "warning_codes": _path_report_warning_codes(row),
        },
    )


def _path_report_scope(
    *,
    org_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Dict[str, str]:
    return {
        "org_id": str(org_id or get_default_org_id()).strip(),
        "workspace_id": "",
        "project_id": str(project_id or "").strip(),
        "session_id": str(session_id or "").strip(),
    }


def _path_report_active_prompt(module_id: str, scope: Dict[str, Any]) -> Dict[str, Any]:
    candidates = [
        ("session", str((scope or {}).get("session_id") or "").strip()),
        ("project", str((scope or {}).get("project_id") or "").strip()),
        ("workspace", str((scope or {}).get("workspace_id") or "").strip()),
        ("org", str((scope or {}).get("org_id") or "").strip()),
        ("global", ""),
    ]
    for scope_level, scope_id in candidates:
        if scope_level != "global" and not scope_id:
            continue
        try:
            item = get_active_prompt(module_id=module_id, scope_level=scope_level, scope_id=scope_id)
        except Exception:
            continue
        if isinstance(item, dict) and str(item.get("template") or "").strip():
            return item
    return {}


def _record_path_report_ai_execution_safe(**kwargs: Any) -> None:
    try:
        record_ai_execution(**kwargs)
    except Exception:
        logging.getLogger(__name__).warning("failed to record path report ai execution", exc_info=True)


def _run_path_report_generation_async(
    session_id: str,
    path_id: str,
    report_id: str,
    request_payload_json: Dict[str, Any],
    prompt_template_version: str,
    model_name: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    request_id: Optional[str] = None,
    route: Optional[str] = None,
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
    module_id = "ai.path_report"
    scope = _path_report_scope(org_id=org_scope, project_id=project_id, session_id=sid)
    actor_user_id = str(user_id or "").strip()
    execution_id = f"ai_path_report_{rid}"
    active_prompt = _path_report_active_prompt(module_id, scope)
    system_prompt = str(active_prompt.get("template") or "").strip()
    prompt_id = str(active_prompt.get("prompt_id") or "").strip()
    prompt_version = str(active_prompt.get("version") or "").strip()
    input_payload = {
        "endpoint": str(route or f"/api/sessions/{sid}/paths/{pid}/reports"),
        "session_id": sid,
        "path_id": pid,
        "report_id": rid,
        "prompt_template_version": prompt_ver,
        "steps_count": len(payload.get("steps") or []) if isinstance(payload.get("steps"), list) else 0,
    }
    started_at = time.time()
    created_at = int(started_at)

    def _record_runtime(
        *,
        status: str,
        output_summary: str = "",
        error_code: str = "",
        error_message: str = "",
        usage: Optional[Dict[str, Any]] = None,
    ) -> None:
        finished_at = int(time.time()) if status in {"success", "error", "cancelled"} else 0
        latency_ms = int(max(0.0, time.time() - started_at) * 1000)
        _record_path_report_ai_execution_safe(
            execution_id=execution_id,
            module_id=module_id,
            actor_user_id=actor_user_id,
            scope=scope,
            provider="deepseek",
            model=fallback_model,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            status=status,
            input_payload=input_payload,
            output_summary=output_summary,
            usage=usage if isinstance(usage, dict) else {},
            latency_ms=latency_ms,
            error_code=error_code,
            error_message=error_message,
            created_at=created_at,
            finished_at=finished_at,
        )

    try:
        def _finish_error(message: str, *, error_code: str = "path_report_generation_failed", error_class: str = "") -> None:
            text = str(message or "deepseek failed")

            def _apply(row: Dict[str, Any]) -> None:
                row["status"] = "error"
                row["error_message"] = text
                row["warnings_json"] = row.get("warnings_json") or []

            patched = _patch_report_version_row(sid, pid, rid, _apply, org_id=org_scope, is_admin=True)
            if isinstance(patched, dict):
                _emit_path_report_domain_anomaly(
                    patched,
                    session_id=sid,
                    path_id=pid,
                    org_id=org_scope,
                    user_id=user_id,
                    project_id=project_id,
                    request_id=request_id,
                    route=route,
                    error_code=error_code,
                    error_class=error_class,
                )
            _record_runtime(
                status="error",
                output_summary=f"path_id={pid} report_id={rid}",
                error_code=error_code,
                error_message=text,
                usage={"path_id": pid, "report_id": rid},
            )

        llm = load_llm_settings()
        api_key = str(llm.get("api_key") or "").strip()
        base_url = str(llm.get("base_url") or "").strip()
        if not api_key:
            _finish_error("deepseek api_key is not set", error_code="missing_api_key")
            return

        try:
            rate = check_ai_rate_limit(module_id=module_id, actor_user_id=actor_user_id, scope=scope)
        except Exception:
            rate = {"allowed": True}
        if not bool(rate.get("allowed", rate.get("ok", True))):
            _finish_error("ai_rate_limit_exceeded", error_code="ai_rate_limit_exceeded")
            return

        _record_runtime(
            status="running",
            output_summary=f"path_id={pid} report_id={rid}",
            usage={"path_id": pid, "report_id": rid},
        )

        try:
            from .ai.deepseek_questions import generate_path_report
        except Exception as e:
            _finish_error(
                f"deepseek questions module not available: {e}",
                error_code="module_unavailable",
                error_class=type(e).__name__,
            )
            return

        try:
            report_result = generate_path_report(
                payload=payload,
                api_key=api_key,
                base_url=base_url,
                prompt_template_version=prompt_ver,
                system_prompt=system_prompt,
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
                        system_prompt=system_prompt,
                    )
                    used_compact_retry = True
                except Exception as second_error:
                    _finish_error(
                        f"deepseek failed: {second_error}",
                        error_code="provider_failed_after_compact_retry",
                        error_class=type(second_error).__name__,
                    )
                    return
            else:
                _finish_error(
                    f"deepseek failed: {first_error}",
                    error_code="provider_failed",
                    error_class=type(first_error).__name__,
                )
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
        _record_runtime(
            status="success",
            output_summary=f"path_id={pid} report_id={rid} warnings={len(report_result.get('warnings') or [])}",
            usage={
                "path_id": pid,
                "report_id": rid,
                "used_compact_retry": bool(used_compact_retry),
            },
        )
    finally:
        _set_report_active(rid, False)


def _run_path_report_generation_with_capture(
    *,
    session_id: str,
    path_id: str,
    report_id: str,
    request_payload_json: Dict[str, Any],
    prompt_template_version: str,
    model_name: str,
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    request_id: Optional[str] = None,
    route: Optional[str] = None,
) -> None:
    try:
        _run_path_report_generation_async(
            session_id=session_id,
            path_id=path_id,
            report_id=report_id,
            request_payload_json=request_payload_json,
            prompt_template_version=prompt_template_version,
            model_name=model_name,
            org_id=org_id,
            user_id=user_id,
            project_id=project_id,
            request_id=request_id,
            route=route,
        )
    except Exception as exc:
        capture_backend_async_exception(
            exc,
            task_name="path_report_generation",
            execution_scope="background",
            org_id=str(org_id or "").strip() or None,
            session_id=str(session_id or "").strip() or None,
            project_id=str(project_id or "").strip() or None,
            request_id=str(request_id or "").strip() or None,
            correlation_id=str(report_id or "").strip() or None,
            context_json={
                "path_id": str(path_id or "").strip(),
                "report_id": str(report_id or "").strip(),
                "prompt_template_version": str(prompt_template_version or "").strip(),
                "model_name": str(model_name or "").strip(),
            },
        )
        raise


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
            _preserve_current_interview_analysis_before_save(st, sess, org_id=org, is_admin=admin)
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
_PATH_TIER_ALIASES: Dict[str, str] = {
    "IDEAL": "P0",
    "ИДЕАЛЬНЫЙ": "P0",
    "ИДЕАЛЬНАЯ": "P0",
    "ALTERNATIVE": "P1",
    "АЛЬТЕРНАТИВНЫЙ": "P1",
    "АЛЬТЕРНАТИВНАЯ": "P1",
    "RECOVERY": "P1",
    "ВОССТАНОВЛЕНИЕ": "P1",
    "ESCALATION": "P2",
    "FAILURE": "P2",
    "FAIL": "P2",
    "НЕУСПЕХ": "P2",
    "ЭСКАЛАЦИЯ": "P2",
}


def _primitive_path_value(value: Any, keys: Tuple[str, ...] = ("value", "key", "code", "tier", "path")) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value or "").strip()
    if isinstance(value, dict):
        for key in keys:
            if key not in value:
                continue
            nested = _primitive_path_value(value.get(key), keys)
            if nested:
                return nested
    return ""


def _normalize_flow_tier(value: Any) -> Optional[str]:
    txt = _primitive_path_value(value).upper()
    if txt in _FLOW_TIERS:
        return txt
    if txt in _PATH_TIER_ALIASES:
        return _PATH_TIER_ALIASES[txt]
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
    code = _primitive_path_value(value).upper()
    if code in _NODE_PATH_CODE_SET:
        return code
    if code in _PATH_TIER_ALIASES:
        return _PATH_TIER_ALIASES[code]
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
    raw = _primitive_path_value(
        value,
        ("key", "value", "sequence_key", "sequenceKey", "id"),
    ).lower()
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


def _normalize_drawio_meta(value: Any) -> Dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    try:
        opacity = float(raw.get("opacity", 1.0))
    except Exception:
        opacity = 1.0
    if not math.isfinite(opacity):
        opacity = 1.0
    page_raw = raw.get("page") if isinstance(raw.get("page"), dict) else {}
    transform_raw = raw.get("transform") if isinstance(raw.get("transform"), dict) else {}
    try:
        page_index = int(page_raw.get("index", 0))
    except Exception:
        page_index = 0
    try:
        tx = float(transform_raw.get("x", 0))
    except Exception:
        tx = 0.0
    try:
        ty = float(transform_raw.get("y", 0))
    except Exception:
        ty = 0.0
    if not math.isfinite(tx):
        tx = 0.0
    if not math.isfinite(ty):
        ty = 0.0
    doc_xml = str(raw.get("doc_xml") or "").strip()
    if not doc_xml.lower().startswith("<mxfile"):
        doc_xml = ""
    svg_cache = str(raw.get("svg_cache") or "").strip()
    layers_raw = raw.get("drawio_layers_v1")
    if not isinstance(layers_raw, list):
        layers_raw = raw.get("layers_v1")
    if not isinstance(layers_raw, list):
        layers_raw = raw.get("layers")
    if not isinstance(layers_raw, list):
        layers_raw = []
    layers: List[Dict[str, Any]] = []
    seen_layer_ids: Set[str] = set()
    for idx, layer_raw in enumerate(layers_raw):
        layer = layer_raw if isinstance(layer_raw, dict) else {}
        layer_id = str(layer.get("id") or f"DL{idx + 1}").strip()
        if not layer_id or layer_id in seen_layer_ids:
            continue
        seen_layer_ids.add(layer_id)
        try:
            layer_opacity = float(layer.get("opacity", 1.0))
        except Exception:
            layer_opacity = 1.0
        if not math.isfinite(layer_opacity):
            layer_opacity = 1.0
        layers.append(
            {
                "id": layer_id,
                "name": str(layer.get("name") or (f"Layer {idx + 1}" if idx > 0 else "Default")).strip() or layer_id,
                "visible": layer.get("visible") is not False,
                "locked": bool(layer.get("locked")),
                "opacity": round(max(0.05, min(1.0, layer_opacity)), 3),
            }
        )
    if not layers:
        layers = [
            {
                "id": "DL1",
                "name": "Default",
                "visible": True,
                "locked": False,
                "opacity": 1.0,
            }
        ]
        seen_layer_ids = {"DL1"}
    active_layer_id = str(raw.get("active_layer_id") or raw.get("activeLayerId") or "").strip()
    if not active_layer_id or active_layer_id not in seen_layer_ids:
        active_layer_id = layers[0]["id"]

    elements_raw = raw.get("drawio_elements_v1")
    if not isinstance(elements_raw, list):
        elements_raw = raw.get("elements_v1")
    if not isinstance(elements_raw, list):
        elements_raw = raw.get("elements")
    if not isinstance(elements_raw, list):
        elements_raw = []
    elements: List[Dict[str, Any]] = []
    seen_element_ids: Set[str] = set()
    for idx, row_raw in enumerate(elements_raw):
        row = row_raw if isinstance(row_raw, dict) else {}
        element_id = str(row.get("id") or "").strip()
        if not element_id or element_id in seen_element_ids:
            continue
        seen_element_ids.add(element_id)
        layer_id = str(row.get("layer_id") or row.get("layerId") or active_layer_id).strip()
        if layer_id not in seen_layer_ids:
            layer_id = active_layer_id
        try:
            element_opacity = float(row.get("opacity", 1.0))
        except Exception:
            element_opacity = 1.0
        if not math.isfinite(element_opacity):
            element_opacity = 1.0
        try:
            offset_x = float(row.get("offset_x", row.get("offsetX", 0.0)))
        except Exception:
            offset_x = 0.0
        try:
            offset_y = float(row.get("offset_y", row.get("offsetY", 0.0)))
        except Exception:
            offset_y = 0.0
        try:
            z_index = int(row.get("z_index", idx))
        except Exception:
            z_index = idx
        if not math.isfinite(offset_x):
            offset_x = 0.0
        if not math.isfinite(offset_y):
            offset_y = 0.0
        element_entry: Dict[str, Any] = {
            "id": element_id,
            "layer_id": layer_id,
            "visible": row.get("visible") is not False,
            "locked": bool(row.get("locked")),
            "deleted": bool(row.get("deleted")),
            "opacity": round(max(0.05, min(1.0, element_opacity)), 3),
            "offset_x": round(offset_x, 3),
            "offset_y": round(offset_y, 3),
            "z_index": max(0, z_index),
        }
        row_type = str(row.get("type") or "").strip().lower()
        if row_type == "note":
            text_present = "text" in row
            label_present = "label" in row
            if text_present:
                note_text_raw = row.get("text")
            elif label_present:
                note_text_raw = row.get("label")
            else:
                note_text_raw = "Заметка"
            if note_text_raw is None:
                note_text = "Заметка"
            else:
                note_text = str(note_text_raw)
            try:
                note_width = float(row.get("width", 160))
            except Exception:
                note_width = 160.0
            try:
                note_height = float(row.get("height", 120))
            except Exception:
                note_height = 120.0
            if not math.isfinite(note_width):
                note_width = 160.0
            if not math.isfinite(note_height):
                note_height = 120.0
            note_style_raw = row.get("style") if isinstance(row.get("style"), dict) else {}
            note_style = {
                "bg_color": str(note_style_raw.get("bg_color") or "").strip() or "#fef08a",
                "border_color": str(note_style_raw.get("border_color") or "").strip() or "#ca8a04",
                "text_color": str(note_style_raw.get("text_color") or "").strip() or "#1f2937",
            }
            element_entry.update(
                {
                    "type": "note",
                    "text": note_text,
                    "width": int(round(max(80.0, min(1600.0, note_width)))),
                    "height": int(round(max(56.0, min(1600.0, note_height)))),
                    "style": note_style,
                }
            )
        elements.append(element_entry)
    return {
        "enabled": bool(raw.get("enabled")),
        "locked": bool(raw.get("locked")),
        "opacity": round(max(0.05, min(1.0, opacity)), 3),
        "last_saved_at": str(raw.get("last_saved_at") or "").strip(),
        "doc_xml": doc_xml,
        "svg_cache": svg_cache,
        "page": {
            "index": max(0, page_index),
        },
        "transform": {
            "x": round(tx, 3),
            "y": round(ty, 3),
        },
        "drawio_layers_v1": layers,
        "drawio_elements_v1": elements,
        "active_layer_id": active_layer_id,
    }


def _drawio_payload_size(value: Any) -> int:
    normalized = _normalize_drawio_meta(value)
    return (
        len(str(normalized.get("doc_xml") or ""))
        + len(str(normalized.get("svg_cache") or ""))
        + len(normalized.get("drawio_elements_v1") or [])
        + len(normalized.get("drawio_layers_v1") or [])
    )


def _normalize_auto_pass_v1(value: Any) -> Dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    schema_version = str(raw.get("schema_version") or "").strip() or "auto_pass_v1.1"
    graph_hash = str(raw.get("graph_hash") or "").strip()
    generated_at = str(raw.get("generated_at") or "").strip()
    run_id = str(raw.get("run_id") or "").strip()
    status = str(raw.get("status") or "").strip().lower()
    if status not in {"queued", "running", "done", "failed"}:
        status = ""
    error_code = str(raw.get("error_code") or "").strip()
    error_message = str(raw.get("error_message") or "").strip()
    limits_raw = raw.get("limits") if isinstance(raw.get("limits"), dict) else {}
    summary_raw = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    variants_raw = raw.get("variants") if isinstance(raw.get("variants"), list) else []
    debug_failed_raw = (
        raw.get("debug_failed_variants") if isinstance(raw.get("debug_failed_variants"), list) else []
    )
    warnings_raw = raw.get("warnings") if isinstance(raw.get("warnings"), list) else []

    limits = {
        "max_variants": max(1, min(_robot_meta_as_non_negative_int(limits_raw.get("max_variants"), 500), 5000)),
        "max_steps": max(10, min(_robot_meta_as_non_negative_int(limits_raw.get("max_steps"), 2000), 20000)),
        "max_visits_per_node": max(1, min(_robot_meta_as_non_negative_int(limits_raw.get("max_visits_per_node"), 2), 10)),
    }
    mode = str(limits_raw.get("mode") or "all").strip().lower()
    limits["mode"] = "all" if mode != "all" else mode

    def _normalize_task_steps(variant: Dict[str, Any]) -> List[Dict[str, Any]]:
        source_steps = variant.get("task_steps")
        if not isinstance(source_steps, list):
            source_steps = variant.get("steps") if isinstance(variant.get("steps"), list) else []
        steps: List[Dict[str, Any]] = []
        for step_raw in source_steps[:2000]:
            step = step_raw if isinstance(step_raw, dict) else {}
            node_id = str(step.get("node_id") or "").strip()
            if not node_id:
                continue
            duration_raw = step.get("duration_s")
            duration_s = None
            if duration_raw is not None:
                try:
                    duration_val = int(duration_raw)
                    if duration_val >= 0:
                        duration_s = duration_val
                except Exception:
                    duration_s = None
            steps.append(
                {
                    "node_id": node_id,
                    "name": str(step.get("name") or node_id).strip() or node_id,
                    "duration_s": duration_s,
                    "kind": str(step.get("kind") or "task").strip() or "task",
                    "bpmn_type": str(step.get("bpmn_type") or "").strip(),
                }
            )
        return steps

    def _normalize_gateway_choices(variant: Dict[str, Any]) -> List[Dict[str, Any]]:
        source_choices = variant.get("gateway_choices")
        if not isinstance(source_choices, list):
            source_choices = variant.get("choices") if isinstance(variant.get("choices"), list) else []
        choices: List[Dict[str, Any]] = []
        for choice_raw in source_choices[:2000]:
            choice = choice_raw if isinstance(choice_raw, dict) else {}
            gateway_id = str(choice.get("gateway_id") or "").strip()
            flow_id = str(choice.get("flow_id") or "").strip()
            if not gateway_id or not flow_id:
                continue
            choices.append(
                {
                    "gateway_id": gateway_id,
                    "flow_id": flow_id,
                    "label": str(choice.get("label") or flow_id).strip() or flow_id,
                }
            )
        return choices

    def _normalize_detail_rows(variant: Dict[str, Any]) -> List[Dict[str, Any]]:
        rows_raw = variant.get("detail_rows") if isinstance(variant.get("detail_rows"), list) else []
        rows: List[Dict[str, Any]] = []
        for row_raw in rows_raw[:4000]:
            if not isinstance(row_raw, dict):
                continue
            kind = str(row_raw.get("kind") or "").strip()
            if kind not in {"task", "gateway_choice", "teleport", "end_event"}:
                continue
            row = {"kind": kind}
            if kind in {"task", "end_event"}:
                node_id = str(row_raw.get("node_id") or "").strip()
                if not node_id:
                    continue
                row["node_id"] = node_id
                row["name"] = str(row_raw.get("name") or node_id).strip() or node_id
                if kind == "task":
                    try:
                        d = row_raw.get("duration_s")
                        row["duration_s"] = int(d) if d is not None and int(d) >= 0 else None
                    except Exception:
                        row["duration_s"] = None
                    row["step_kind"] = str(row_raw.get("step_kind") or "task").strip() or "task"
                    row["bpmn_type"] = str(row_raw.get("bpmn_type") or "").strip()
            elif kind == "gateway_choice":
                gateway_id = str(row_raw.get("gateway_id") or "").strip()
                flow_id = str(row_raw.get("flow_id") or "").strip()
                if not gateway_id or not flow_id:
                    continue
                row["gateway_id"] = gateway_id
                row["flow_id"] = flow_id
                row["label"] = str(row_raw.get("label") or flow_id).strip() or flow_id
            elif kind == "teleport":
                row["from"] = str(row_raw.get("from") or "").strip()
                row["to"] = str(row_raw.get("to") or "").strip()
                row["flow_id"] = str(row_raw.get("flow_id") or "").strip()
            rows.append(row)
        return rows

    def _normalize_variant(variant_raw: Any, idx: int) -> Dict[str, Any]:
        variant = variant_raw if isinstance(variant_raw, dict) else {}
        variant_id = str(variant.get("variant_id") or f"V{idx + 1:03d}").strip() or f"V{idx + 1:03d}"
        task_steps = _normalize_task_steps(variant)
        gateway_choices = _normalize_gateway_choices(variant)
        detail_rows = _normalize_detail_rows(variant)
        end_event_id = str(variant.get("end_event_id") or "").strip()
        variant_status = str(variant.get("status") or "").strip().lower()
        if variant_status not in {"done", "failed"}:
            variant_status = "done" if end_event_id else "failed"
        end_reached_raw = variant.get("end_reached")
        end_reached = bool(end_reached_raw) if end_reached_raw is not None else bool(end_event_id)
        error_raw = variant.get("error") if isinstance(variant.get("error"), dict) else {}
        error: Dict[str, str] = {}
        if variant_status != "done":
            error = {
                "code": str(error_raw.get("code") or "UNKNOWN").strip() or "UNKNOWN",
                "message": str(error_raw.get("message") or "").strip(),
            }
        teleport_raw = variant.get("teleport") if isinstance(variant.get("teleport"), dict) else {}
        teleport = {
            "used": bool(teleport_raw.get("used")),
            "from": str(teleport_raw.get("from") or "").strip(),
            "to": str(teleport_raw.get("to") or "").strip(),
            "flow_id": str(teleport_raw.get("flow_id") or "").strip(),
        }
        known_duration = 0
        unknown_duration = 0
        for step in task_steps:
            d = step.get("duration_s")
            if isinstance(d, int):
                known_duration += max(0, d)
            else:
                unknown_duration += 1
        total_steps = max(0, int(variant.get("total_steps") or len(task_steps)))
        total_duration = max(0, int(variant.get("total_duration_s") or known_duration))
        unknown_duration_count = max(0, int(variant.get("unknown_duration_count") or unknown_duration))
        out_variant = {
            "variant_id": variant_id,
            "status": variant_status,
            "end_reached": bool(end_reached),
            "end_event_id": end_event_id,
            "task_steps": task_steps,
            "gateway_choices": gateway_choices,
            "detail_rows": detail_rows,
            "teleport": teleport,
            "error": error,
            "steps": task_steps,
            "choices": gateway_choices,
            "total_steps": total_steps,
            "total_duration_s": total_duration,
            "unknown_duration_count": unknown_duration_count,
        }
        return out_variant

    all_variants = [_normalize_variant(v, idx) for idx, v in enumerate(variants_raw)]
    complete_variants = [
        v
        for v in all_variants
        if str(v.get("status") or "").lower() == "done"
        and bool(v.get("end_reached"))
        and str(v.get("end_event_id") or "").strip()
    ]
    failed_variants = [
        v
        for v in all_variants
        if v not in complete_variants
    ]
    debug_failed_variants = [_normalize_variant(v, idx) for idx, v in enumerate(debug_failed_raw)]
    if not debug_failed_variants and failed_variants:
        debug_failed_variants = failed_variants

    warnings: List[Dict[str, str]] = []
    for warning_raw in warnings_raw[:200]:
        if isinstance(warning_raw, dict):
            code = str(warning_raw.get("code") or "").strip()
            msg = str(warning_raw.get("message") or "").strip()
            if code or msg:
                warnings.append({"code": code, "message": msg})
            continue
        txt = str(warning_raw or "").strip()
        if txt:
            warnings.append({"code": "warning", "message": txt})

    total_done = len(complete_variants)
    total_failed = max(
        _robot_meta_as_non_negative_int(summary_raw.get("total_variants_failed"), len(debug_failed_variants)),
        len(debug_failed_variants),
    )
    total_variants = max(
        _robot_meta_as_non_negative_int(summary_raw.get("total_variants"), total_done),
        total_done,
    )
    failed_reasons_raw = summary_raw.get("failed_reasons") if isinstance(summary_raw.get("failed_reasons"), dict) else {}
    failed_reasons: Dict[str, int] = {}
    for code_raw, count_raw in failed_reasons_raw.items():
        code = str(code_raw or "").strip()
        if not code:
            continue
        failed_reasons[code] = max(0, _robot_meta_as_non_negative_int(count_raw, 0))

    if not status:
        status = "done" if total_done > 0 else "failed"
    if status == "done" and total_done <= 0:
        status = "failed"
    if status != "failed":
        error_code = ""
        error_message = ""
    if status == "failed" and not error_code and total_done <= 0:
        error_code = "NO_COMPLETE_PATH_TO_END"
        error_message = error_message or "No complete path reaches EndEvent of main process"

    out = {
        "schema_version": schema_version,
        "status": status,
        "run_id": run_id,
        "error_code": error_code,
        "error_message": error_message,
        "graph_hash": graph_hash,
        "generated_at": generated_at,
        "limits": limits,
        "summary": {
            "total_variants": total_variants,
            "total_variants_done": total_done,
            "total_variants_failed": total_failed,
            "failed_reasons": failed_reasons,
            "truncated": bool(summary_raw.get("truncated")),
        },
        "variants": complete_variants,
        "debug_failed_variants": debug_failed_variants,
        "warnings": warnings,
    }
    if (
        not graph_hash
        and not generated_at
        and not complete_variants
        and not debug_failed_variants
        and not warnings
        and not status
    ):
        return {}
    return out


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
    drawio = _normalize_drawio_meta(raw.get("drawio"))
    auto_pass_v1 = _normalize_auto_pass_v1(raw.get("auto_pass_v1"))

    out = {
        "version": version,
        "flow_meta": flow_meta,
        "node_path_meta": node_path_meta,
        "robot_meta_by_element_id": robot_meta_by_element_id,
        "hybrid_layer_by_element_id": hybrid_layer_by_element_id,
        "hybrid_v2": hybrid_v2,
        "drawio": drawio,
    }
    if auto_pass_v1:
        out["auto_pass_v1"] = auto_pass_v1
    for key_raw, value_raw in raw.items():
        key = str(key_raw or "").strip()
        if not key or key in out or key == "auto_pass_v1":
            continue
        try:
            out[key] = json.loads(json.dumps(value_raw, ensure_ascii=False))
        except Exception:
            continue
    return out


def _capture_persisted_auto_pass_failed_state(
    sess: Session,
    *,
    request: Request = None,
    route: str = "",
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    bpmn_meta = _normalize_bpmn_meta(getattr(sess, "bpmn_meta", {}))
    auto_pass = bpmn_meta.get("auto_pass_v1") if isinstance(bpmn_meta, dict) else {}
    if not isinstance(auto_pass, dict) or str(auto_pass.get("status") or "").strip().lower() != "failed":
        return None
    req_id: Optional[str] = None
    if request is not None:
        req_id, _ = get_or_create_backend_request_id(request)
    auth_user = _request_auth_user(request) if request is not None else {}
    actor_id = str(user_id or "").strip()
    if not actor_id and isinstance(auth_user, dict):
        actor_id = str(auth_user.get("id") or "").strip()
    actor_id = actor_id or str(getattr(sess, "updated_by", "") or getattr(sess, "created_by", "") or "").strip()
    oid = str(org_id or getattr(sess, "org_id", "") or get_default_org_id()).strip()
    sid = str(getattr(sess, "id", "") or "").strip()
    return capture_auto_pass_failed_state(
        auto_pass,
        session_id=sid or None,
        project_id=str(getattr(sess, "project_id", "") or "").strip() or None,
        user_id=actor_id or None,
        org_id=oid or None,
        route=route or (f"/api/sessions/{sid}" if sid else "/api/sessions/{session_id}"),
        request_id=req_id,
        run_id=str(auto_pass.get("run_id") or "").strip() or None,
        job_id=str(auto_pass.get("job_id") or "").strip() or None,
        operation="auto_pass_persisted_state",
        dedupe=True,
    )


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
    redis = runtime_status(force_ping=True)
    mode = str(redis.get("mode") or "UNKNOWN").upper()
    overall_status = "ok" if mode == "ON" else ("incident" if mode == "ERROR" else "degraded")
    return {
        "ok": True,
        "status": overall_status,
        "redis": redis,
    }


@app.get("/api/health")
def api_health():
    payload = health()
    payload["api"] = "ready"
    return payload


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
    return build_auth_me_payload(
        user_id=user_id,
        email=str(user.get("email") or ""),
        is_admin=is_admin,
        active_org_id=active_org_id,
        default_org_id=get_default_org_id(),
        orgs=memberships,
    )


@app.post("/api/auth/invite/preview")
@app.post("/api/invite/resolve")
def auth_invite_preview(inp: InvitePreviewIn, request: Request):
    token = extract_invite_token(inp)
    if not token:
        return _enterprise_error(422, "validation_error", "token is required")
    try:
        invite = preview_org_invite(token)
    except ValueError as exc:
        return _invite_error_to_response(str(exc or "").strip().lower())

    identity = find_user_by_email(str(invite.get("email") or "").strip().lower())
    return build_invite_preview_payload(
        invite,
        identity_state=invited_identity_state(identity),
        single_org_mode=count_org_records() <= 1,
    )


@app.post("/api/auth/invite/activate")
@app.post("/api/invite/activate")
def auth_invite_activate(inp: InviteActivateIn, request: Request):
    token = extract_invite_token(inp)
    password = str(getattr(inp, "password", "") or "")
    password_confirm = str(getattr(inp, "password_confirm", "") or "")
    if not token:
        return _enterprise_error(422, "validation_error", "token is required")
    if not password:
        return _enterprise_error(422, "validation_error", "password_required")
    if len(password) < 8:
        return _enterprise_error(422, "validation_error", "password_too_short")
    if password_confirm and password_confirm != password:
        return _enterprise_error(422, "validation_error", "password_mismatch")

    accept_limit = max(1, _env_int("RL_ACCEPT_PER_MIN", 30))
    ip_key = str(_request_client_ip(request) or "ip_unknown")
    if not _rate_limit_check(f"auth:invite_activate:{ip_key}", accept_limit, 60):
        return _enterprise_error(429, "too_many_requests", "too_many_requests")

    try:
        invite = preview_org_invite(token)
    except ValueError as exc:
        return _invite_error_to_response(str(exc or "").strip().lower())

    invited_email = str(invite.get("email") or "").strip().lower()
    identity = find_user_by_email(invited_email)
    if isinstance(identity, dict):
        if bool(identity.get("is_active", False)) and str(identity.get("password_hash") or "").strip():
            return _invite_error_to_response("identity_already_active")
    try:
        base_identity = ensure_invited_identity(invited_email)
        accepted = accept_org_invite(
            str(invite.get("org_id") or "") or None,
            token,
            accepted_by=str(base_identity.get("id") or ""),
            accepted_email=invited_email,
        )
        activated_user = set_invited_identity_password(invited_email, password)
    except (ValueError, AuthError) as exc:
        return _invite_error_to_response(str(exc or "").strip().lower())

    issued = issue_login_tokens(
        user=activated_user,
        user_agent=request.headers.get("user-agent", ""),
        ip=_request_client_ip(request),
    )
    max_age = max(1, int(issued.get("refresh_expires_at", 0)) - int(time.time()))
    payload = build_invite_activate_payload(
        issued=issued,
        accepted=accepted,
        activated_user=activated_user,
        invited_email=invited_email,
    )
    _audit_log_safe(
        request,
        org_id=str(accepted.get("org_id") or get_default_org_id()),
        action="invite.activate",
        entity_type="org_invite",
        entity_id=str(accepted.get("id") or ""),
        status="ok",
        meta={
            "email": invited_email,
            "role": str(accepted.get("role") or ""),
            "team_name": str(accepted.get("team_name") or ""),
            "subgroup_name": str(accepted.get("subgroup_name") or ""),
        },
    )
    resp = JSONResponse(status_code=200, content=payload)
    _set_refresh_cookie(resp, str(issued.get("refresh_token") or ""), max_age)
    return resp


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
    _invalidate_session_caches(sess, org_id=getattr(sess, "org_id", "") or get_default_org_id())
    return _session_api_dump(sess)




@app.get("/api/projects/{project_id}/sessions")
def list_project_sessions(project_id: str, mode: str | None = None, view: str | None = None, request: Request = None):
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")
    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        raise HTTPException(status_code=422, detail="invalid mode; allowed: quick_skeleton, deep_audit")
    view_mode = _norm_project_sessions_view(view)
    if not view_mode:
        raise HTTPException(status_code=422, detail="invalid view; allowed: summary, full")
    st = get_storage()
    if view_mode == "summary":
        return st.list_project_session_summaries(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
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
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    st = get_storage()
    title = _clean_name(getattr(inp, "title", None) or "process") or "process"
    sibling_titles = {
        _clean_name(str((row or {}).get("title") or ""))
        for row in st.list(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
    }
    if title in sibling_titles:
        raise HTTPException(status_code=409, detail="session title already exists")
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
        _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
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
        _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
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
    sid = str(getattr(sess, "id", "") or session_id).strip()
    version_token = session_open_version_token(sess)
    cache_key = session_open_cache_key(sid, version_token)
    cached = cache_get_json(cache_key)
    if isinstance(cached, dict):
        logger.info(
            "session_open_cache: hit session_id=%s version=%s",
            sid,
            version_token,
        )
        return cached
    logger.info(
        "session_open_cache: miss session_id=%s version=%s",
        sid,
        version_token,
    )
    payload = _session_api_dump(sess)
    if cache_set_json(cache_key, payload, ttl_sec=session_open_cache_ttl_sec()):
        logger.info(
            "session_open_cache: write session_id=%s version=%s",
            sid,
            version_token,
        )
    return payload


@app.post("/api/sessions/{session_id}/presence")
def touch_session_presence_api(
    session_id: str,
    inp: SessionPresenceTouchIn,
    request: Request = None,
) -> Dict[str, Any]:
    user_id, is_admin = _request_user_meta(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    client_id = _normalize_session_presence_client_id(getattr(inp, "client_id", ""))
    if not client_id:
        raise HTTPException(status_code=422, detail="client_id is required")
    surface = _normalize_session_presence_surface(getattr(inp, "surface", "process_stage"))
    sid = str(getattr(sess, "id", "") or session_id).strip()
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    org_id = str(oid or getattr(sess, "org_id", "") or get_default_org_id()).strip()
    active_org_id = _request_active_org_id(request) if request is not None else org_id
    if active_org_id and org_id and active_org_id != org_id:
        raise HTTPException(status_code=404, detail="session not found")
    if not _user_is_member_of_org(user_id, org_id, is_admin=is_admin):
        raise HTTPException(status_code=404, detail="session not found")
    now = int(time.time())
    touch_session_presence(
        sid,
        user_id,
        client_id,
        org_id=org_id,
        project_id=project_id,
        surface=surface,
        now_ts=now,
    )
    prune_stale_session_presence(ttl_seconds=_SESSION_PRESENCE_TTL_SECONDS, now_ts=now)
    active_users = list_session_presence(
        sid,
        org_id=org_id,
        project_id=project_id,
        ttl_seconds=_SESSION_PRESENCE_TTL_SECONDS,
        now_ts=now,
        current_user_id=user_id,
    )
    return {
        "ok": True,
        "session_id": sid,
        "ttl_seconds": _SESSION_PRESENCE_TTL_SECONDS,
        "active_users": active_users,
    }


@app.delete("/api/sessions/{session_id}/presence")
def leave_session_presence_api(
    session_id: str,
    inp: SessionPresenceTouchIn,
    request: Request = None,
) -> Dict[str, Any]:
    user_id, is_admin = _request_user_meta(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    client_id = _normalize_session_presence_client_id(getattr(inp, "client_id", ""))
    if not client_id:
        raise HTTPException(status_code=422, detail="client_id is required")
    sid = str(getattr(sess, "id", "") or session_id).strip()
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    org_id = str(oid or getattr(sess, "org_id", "") or get_default_org_id()).strip()
    active_org_id = _request_active_org_id(request) if request is not None else org_id
    if active_org_id and org_id and active_org_id != org_id:
        raise HTTPException(status_code=404, detail="session not found")
    if not _user_is_member_of_org(user_id, org_id, is_admin=is_admin):
        raise HTTPException(status_code=404, detail="session not found")
    removed = leave_session_presence(
        sid,
        user_id,
        client_id,
        org_id=org_id,
        project_id=project_id,
    )
    prune_stale_session_presence(ttl_seconds=_SESSION_PRESENCE_TTL_SECONDS)
    return {
        "ok": True,
        "session_id": sid,
        "removed": removed,
    }


@app.get("/api/sessions/{session_id}/tldr")
def get_session_tldr(session_id: str, request: Request = None) -> Dict[str, Any]:
    sess, _, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    sid = str(getattr(sess, "id", "") or session_id).strip()
    cached = cache_get_json(tldr_cache_key(sid))
    if isinstance(cached, dict):
        return cached
    payload = _build_session_tldr_payload(sess)
    cache_set_json(tldr_cache_key(sid), payload, ttl_sec=60)
    return payload


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
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    role = _org_role_for_request(request, oid) if request is not None and oid else ("org_admin" if effective_is_admin else "")

    data = inp.model_dump(exclude_unset=True)
    diagram_changed_keys = sorted({key for key in data.keys() if key in _DIAGRAM_TRUTH_PATCH_KEYS})
    diagram_write_requested = len(diagram_changed_keys) > 0
    client_base_diagram_state_version = _resolve_base_diagram_state_version(request=request, payload=data)
    if diagram_write_requested:
        _require_diagram_cas_or_409(
            sess=sess,
            session_id=session_id,
            request=request,
            client_base_version=client_base_diagram_state_version,
        )

    handled = False
    need_recompute = False
    publish_requested = False
    auto_pass_state_write_requested = False

    if "title" in data and data["title"] is not None:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        title = _clean_name(data["title"])
        if title:
            sibling_titles = {
                _clean_name(str((row or {}).get("title") or ""))
                for row in st.list(project_id=str(getattr(sess, "project_id", "") or "").strip(), limit=500, org_id=oid, is_admin=True)
                if str((row or {}).get("id") or "").strip() != str(session_id).strip()
            }
            if title in sibling_titles:
                raise HTTPException(status_code=409, detail="session title already exists")
            sess2 = st.rename(session_id, title, user_id=user_id, is_admin=True)
            if not sess2:
                return {"error": "not found"}
            sess = sess2
            handled = True

    if "roles" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.roles = _norm_roles(data.get("roles"))
        if sess.start_role and sess.roles and sess.start_role not in sess.roles:
            sess.start_role = None
        handled = True
        need_recompute = True

    if "start_role" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
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
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.notes = _notes_encode(data.get("notes"))
        handled = True
        need_recompute = True

    if "notes_by_element" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.notes_by_element = _norm_notes_by_element(data.get("notes_by_element"))
        handled = True

    if "interview" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.interview = _merge_interview_with_server_fields(sess.interview, data.get("interview"))
        handled = True

    if "status" in data:
        next_status = _validate_session_status_transition(
            (sess.interview or {}).get("status"),
            data.get("status"),
            role_raw=role,
            is_admin=effective_is_admin,
        )
        sess.interview = {**(sess.interview or {}), "status": next_status}
        publish_requested = next_status == "ready"
        handled = True

    if "nodes" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.nodes = _norm_nodes(data.get("nodes"))
        handled = True
        need_recompute = True

    if "edges" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.edges = _norm_edges(data.get("edges"))
        handled = True
        need_recompute = True

    if "questions" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        sess.questions = _norm_questions(data.get("questions"))
        handled = True
        need_recompute = True

    if "bpmn_meta" in data:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
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
            auto_pass_state_write_requested = "auto_pass_v1" in incoming_meta
            raw_bpmn_meta = {
                **current_meta,
                **incoming_meta,
                "version": incoming_meta.get("version", current_meta.get("version", 1)),
                "flow_meta": incoming_meta.get("flow_meta", current_meta.get("flow_meta", {})),
                "node_path_meta": incoming_meta.get("node_path_meta", current_meta.get("node_path_meta", {})),
                "robot_meta_by_element_id": incoming_meta.get(
                    "robot_meta_by_element_id",
                    current_meta.get("robot_meta_by_element_id", {}),
                ),
                "camunda_extensions_by_element_id": incoming_meta.get(
                    "camunda_extensions_by_element_id",
                    current_meta.get("camunda_extensions_by_element_id", {}),
                ),
                "presentation_by_element_id": incoming_meta.get(
                    "presentation_by_element_id",
                    current_meta.get("presentation_by_element_id", {}),
                ),
                "execution_plans": incoming_meta.get(
                    "execution_plans",
                    current_meta.get("execution_plans", []),
                ),
                "hybrid_layer_by_element_id": incoming_meta.get(
                    "hybrid_layer_by_element_id",
                    current_meta.get("hybrid_layer_by_element_id", {}),
                ),
                "hybrid_v2": incoming_meta.get(
                    "hybrid_v2",
                    current_meta.get("hybrid_v2", {}),
                ),
                "drawio": incoming_meta.get(
                    "drawio",
                    current_meta.get("drawio", {}),
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
    if diagram_write_requested:
        _mark_diagram_truth_write(
            sess,
            changed_keys=diagram_changed_keys,
            actor_user_id=user_id,
            actor_label=_resolve_actor_label_from_user(user, user_id),
        )
    st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
    if auto_pass_state_write_requested:
        _capture_persisted_auto_pass_failed_state(
            sess,
            request=request,
            route=f"/api/sessions/{session_id}",
            org_id=oid,
            user_id=user_id,
        )

    if publish_requested:
        interview_pending = dict(getattr(sess, "interview", {}) or {})
        mirror_pending = interview_pending.get("git_mirror_publish")
        if not isinstance(mirror_pending, dict):
            mirror_pending = {}
        mirror_pending = {
            **mirror_pending,
            "schema_version": "git_mirror_publish_v1",
            "mirror_state": "pending",
            "last_attempt_at": int(time.time()),
            "last_error": None,
        }
        interview_pending["git_mirror_publish"] = mirror_pending
        sess.interview = interview_pending
        st.save(sess, user_id=user_id, org_id=oid, is_admin=True)

        mirror_result = execute_git_mirror_publish(
            sess,
            org_id=oid or str(getattr(sess, "org_id", "") or get_default_org_id()),
            user_id=user_id,
        )
        next_interview = mirror_result.get("interview")
        if isinstance(next_interview, dict):
            sess.interview = next_interview
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
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
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
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    user = _request_auth_user(request) if request is not None else {}
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if not _can_delete_workspace_content(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    _invalidate_explorer_children_for_project(pid, oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    st = get_storage()
    related = st.list(project_id=pid, limit=500, org_id=oid, is_admin=True)
    deleted_sessions: list[str] = []
    for row in related:
        sid = str((row or {}).get("id") or "").strip()
        if not sid:
            continue
        if st.delete(sid, org_id=oid, is_admin=True):
            deleted_sessions.append(sid)
            _invalidate_tldr_cache_for_session(sid)
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
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    return {"ok": True, "project_id": pid, "deleted_sessions": deleted_sessions}


@app.delete("/api/sessions/{session_id}")
def delete_session_api(session_id: str, request: Request = None):
    sid = str(session_id or "").strip()
    if not sid:
        return {"ok": False, "error": "session_not_found", "session_id": str(session_id)}
    sess, oid, _ = _legacy_load_session_scoped(sid, request)
    if not sess:
        return {"ok": False, "error": "session_not_found", "session_id": sid}
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    user = _request_auth_user(request) if request is not None else {}
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if not _can_delete_workspace_content(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
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
    _invalidate_session_caches(sess, session_id=sid, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
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
    client_base_diagram_state_version = _resolve_base_diagram_state_version(request=request, payload=data)
    _require_diagram_cas_or_409(
        sess=sess,
        session_id=session_id,
        request=request,
        client_base_version=client_base_diagram_state_version,
    )

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
    auto_pass_state_write_requested = (
        isinstance(data.get("bpmn_meta"), dict)
        and "auto_pass_v1" in data.get("bpmn_meta")
    )
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
    _mark_diagram_truth_write(
        sess,
        changed_keys=list(_DIAGRAM_TRUTH_PUT_CHANGED_KEYS),
        actor_user_id=user_id,
        actor_label=_resolve_actor_label_from_user(user, user_id),
    )
    st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
    if auto_pass_state_write_requested:
        _capture_persisted_auto_pass_failed_state(
            sess,
            request=request,
            route=f"/api/sessions/{session_id}",
            org_id=oid,
            user_id=user_id,
        )
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
    _invalidate_session_caches(sess, org_id=oid or getattr(sess, "org_id", "") or get_default_org_id())
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


_AI_QUESTIONS_ELEMENT_MODES = {"sequential", "node_step", "one_by_one"}


def _ai_questions_module_id(mode: str, inp: AiQuestionsIn) -> str:
    normalized_mode = str(mode or "").strip().lower()
    if normalized_mode in _AI_QUESTIONS_ELEMENT_MODES:
        return "ai.questions.element"
    return "ai.questions.session"


def _ai_questions_scope(s: Session) -> Dict[str, str]:
    return {
        "org_id": str(getattr(s, "org_id", "") or get_default_org_id()).strip(),
        "workspace_id": "",
        "project_id": str(getattr(s, "project_id", "") or "").strip(),
        "session_id": str(getattr(s, "id", "") or "").strip(),
    }


def _ai_questions_actor_user_id(request: Request, s: Session) -> str:
    try:
        _user, actor_user_id, _actor_label = _resolve_actor_context(request)
    except Exception:
        actor_user_id = ""
    return (
        str(actor_user_id or "").strip()
        or str(getattr(s, "updated_by", "") or "").strip()
        or str(getattr(s, "created_by", "") or "").strip()
        or str(getattr(s, "owner_user_id", "") or "").strip()
    )


def _ai_questions_active_prompt(module_id: str, scope: Dict[str, Any]) -> Dict[str, Any]:
    candidates = [
        ("session", str((scope or {}).get("session_id") or "").strip()),
        ("project", str((scope or {}).get("project_id") or "").strip()),
        ("workspace", str((scope or {}).get("workspace_id") or "").strip()),
        ("org", str((scope or {}).get("org_id") or "").strip()),
        ("global", ""),
    ]
    for scope_level, scope_id in candidates:
        if scope_level != "global" and not scope_id:
            continue
        try:
            item = get_active_prompt(module_id=module_id, scope_level=scope_level, scope_id=scope_id)
        except Exception:
            continue
        if isinstance(item, dict) and str(item.get("template") or "").strip():
            return item
    return {}


def _record_ai_questions_execution_safe(**kwargs: Any) -> None:
    try:
        record_ai_execution(**kwargs)
    except Exception:
        logging.getLogger(__name__).warning("failed to record ai questions execution", exc_info=True)


@app.post("/api/sessions/{session_id}/ai/questions")
def ai_questions(session_id: str, inp: AiQuestionsIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    llm = load_llm_settings()
    api_key = (llm.get("api_key") or "").strip()
    base_url = (llm.get("base_url") or "").strip()
    model_name = str(llm.get("model") or "deepseek-chat").strip() or "deepseek-chat"

    limit = int(inp.limit or 10)
    if limit < 1:
        limit = 1
    if limit > 10:
        limit = 10

    mode = (inp.mode or "strict").strip().lower()
    if mode not in ("strict", "soft", "sequential", "node_step", "one_by_one"):
        mode = "strict"

    module_id = _ai_questions_module_id(mode, inp)
    scope = _ai_questions_scope(s)
    actor_user_id = _ai_questions_actor_user_id(request, s)
    input_payload = {
        "endpoint": "POST /api/sessions/{session_id}/ai/questions",
        "session_id": str(session_id or ""),
        "mode": mode,
        "limit": limit,
        "reset": bool(getattr(inp, "reset", False)),
        "node_id": str(getattr(inp, "node_id", "") or "").strip(),
        "step_id": str(getattr(inp, "step_id", "") or "").strip(),
    }
    started_at = time.time()
    created_at = int(started_at)
    active_prompt = _ai_questions_active_prompt(module_id, scope)
    system_prompt = str(active_prompt.get("template") or "").strip()
    prompt_id = str(active_prompt.get("prompt_id") or "").strip()
    prompt_version = str(active_prompt.get("version") or "").strip()

    def _finish(
        response: Dict[str, Any],
        *,
        status: str,
        output_summary: str = "",
        error_code: str = "",
        error_message: str = "",
        usage: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        finished_at = int(time.time())
        latency_ms = int(max(0.0, time.time() - started_at) * 1000)
        _record_ai_questions_execution_safe(
            module_id=module_id,
            actor_user_id=actor_user_id,
            scope=scope,
            provider="deepseek",
            model=model_name,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            status=status,
            input_payload=input_payload,
            output_summary=output_summary,
            usage=usage if isinstance(usage, dict) else {},
            latency_ms=latency_ms,
            error_code=error_code,
            error_message=error_message,
            created_at=created_at,
            finished_at=finished_at,
        )
        return response

    if not api_key:
        return _finish(
            {"error": "deepseek api_key is not set"},
            status="error",
            output_summary="missing provider api key",
            error_code="missing_api_key",
            error_message="deepseek api_key is not set",
        )

    try:
        rate = check_ai_rate_limit(module_id=module_id, actor_user_id=actor_user_id, scope=scope)
    except Exception:
        rate = {"allowed": True}
    if not bool(rate.get("allowed", rate.get("ok", True))):
        return _finish(
            {
                "error": "ai_rate_limit_exceeded",
                "rate_limit": {
                    "limit": int(rate.get("limit") or 0),
                    "window_sec": int(rate.get("window_sec") or 0),
                    "reset_at": int(rate.get("reset_at") or 0),
                },
            },
            status="error",
            output_summary="rate limit blocked",
            error_code="ai_rate_limit_exceeded",
            error_message="ai_rate_limit_exceeded",
        )

    try:
        from .ai.deepseek_questions import (
            generate_llm_questions,
            generate_llm_questions_for_node,
            collect_node_ids_in_bpmn_order,
            extract_node_xml_snippet,
        )
    except Exception as e:
        return _finish(
            {"error": f"deepseek questions module not available: {e}"},
            status="error",
            output_summary="deepseek questions module unavailable",
            error_code="module_unavailable",
            error_message=str(e),
        )

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
                return _finish(
                    {"error": "node not found", "node_id": requested_node_id},
                    status="error",
                    output_summary="node not found",
                    error_code="node_not_found",
                    error_message=requested_node_id,
                )
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
                _preserve_current_interview_analysis_before_save(st, s)
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
                return _finish(
                    out,
                    status="success",
                    output_summary=f"reused questions for node {requested_node_id}",
                )
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
            _preserve_current_interview_analysis_before_save(st, s)
            st.save(s)
            out = _session_api_dump(s)
            out["llm_step"] = {
                "status": "completed",
                "processed": len(processed_order),
                "total": len(ordered),
                "remaining": 0,
                "skipped_existing": skipped_existing,
            }
            return _finish(
                out,
                status="success",
                output_summary="sequential questions completed without provider call",
            )

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
                    system_prompt=system_prompt,
                )
            except Exception as e:
                return _finish(
                    {"error": f"deepseek failed: {e}"},
                    status="error",
                    output_summary="deepseek provider failed",
                    error_code="provider_error",
                    error_message=str(e),
                )
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
        _preserve_current_interview_analysis_before_save(st, s)
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
        return _finish(
            out,
            status="success",
            output_summary=f"generated={generated} node_id={nid}",
        )

    try:
        new_qs = generate_llm_questions(
            s,
            api_key=api_key,
            base_url=base_url,
            limit=limit,
            mode=mode,
            system_prompt=system_prompt,
        )
    except Exception as e:
        return _finish(
            {"error": f"deepseek failed: {e}"},
            status="error",
            output_summary="deepseek provider failed",
            error_code="provider_error",
            error_message=str(e),
        )

    if new_qs:
        existing_ids = {q.id for q in (s.questions or []) if getattr(q, "id", None)}
        for q in new_qs:
            if q.id not in existing_ids:
                (s.questions or []).append(q)
                existing_ids.add(q.id)

    s = _recompute_session(s)
    _preserve_current_interview_analysis_before_save(st, s)
    st.save(s)
    return _finish(
        s.model_dump(),
        status="success",
        output_summary=f"generated={len(new_qs or [])} mode={mode}",
    )


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
    user_id = ""
    request_id = ""
    route = f"/api/sessions/{sid}/paths/{pid}/reports"
    if request is not None:
        user_id = str(_request_user_meta(request)[0] or "").strip()
        request_id = get_or_create_backend_request_id(request)[0]
        request_path = str(getattr(getattr(request, "url", None), "path", "") or "").strip()
        if request_path:
            route = request_path
    project_id = str(getattr(s, "project_id", "") or "").strip()
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
        _preserve_current_interview_analysis_before_save(st, s, org_id=org_scope, is_admin=admin)
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
        _invalidate_session_caches(s, session_id=sid, org_id=str(getattr(s, "org_id", "") or oid or get_default_org_id()))

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
        "user_id": user_id,
        "project_id": project_id,
        "request_id": request_id,
        "route": route,
    }
    if sync_mode:
        _run_path_report_generation_with_capture(**worker_kwargs)
    else:
        worker = threading.Thread(
            target=_run_path_report_generation_with_capture,
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
        _preserve_current_interview_analysis_before_save(st, s, org_id=org_scope, is_admin=admin)
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
        _preserve_current_interview_analysis_before_save(st, sess, org_id=org_scope, is_admin=admin)
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
    _invalidate_session_caches(session_id=sid, org_id=oid or get_default_org_id())
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
    _invalidate_session_caches(
        session_id=str((deleted or {}).get("session_id") or ""),
        org_id=oid or get_default_org_id(),
    )
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
def post_notes(session_id: str, inp: NotesIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

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
    _mark_diagram_truth_write(
        s,
        changed_keys=["notes", "roles", "start_role", "nodes", "edges", "questions"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()


_NOTES_EXTRACTION_MODULE_ID = "ai.process.extract_from_notes"


def _notes_preview_scope(sess: Session, org_id: Optional[str] = None) -> Dict[str, str]:
    return {
        "org_id": str(org_id or getattr(sess, "org_id", "") or get_default_org_id()).strip(),
        "workspace_id": "",
        "project_id": str(getattr(sess, "project_id", "") or "").strip(),
        "session_id": str(getattr(sess, "id", "") or "").strip(),
    }


def _record_notes_preview_execution_safe(**kwargs: Any) -> None:
    try:
        record_ai_execution(**kwargs)
    except Exception:
        logging.getLogger(__name__).warning("failed to record notes extraction ai execution", exc_info=True)


def _safe_model_dump(value: Any) -> Dict[str, Any]:
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
            return dumped if isinstance(dumped, dict) else {}
        except Exception:
            return {}
    return dict(value or {}) if isinstance(value, dict) else {}


def _safe_model_dump_list(values: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in values or []:
        dumped = _safe_model_dump(item)
        if dumped:
            out.append(dumped)
    return out


def _entity_key(value: Any) -> str:
    row = _safe_model_dump(value)
    if not row and isinstance(value, dict):
        row = value
    if row:
        return str(row.get("id") or row.get("question_id") or row.get("from_id") or "").strip()
    return ""


def _stable_entity_signature(value: Any) -> str:
    row = _safe_model_dump(value)
    if not row and isinstance(value, dict):
        row = value
    try:
        return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except Exception:
        return str(row)


def _edge_key(value: Any) -> str:
    row = _safe_model_dump(value)
    if not row and isinstance(value, dict):
        row = value
    return f"{str(row.get('from_id') or '').strip()}->{str(row.get('to_id') or '').strip()}"


def _list_diff_by_id(current: Any, candidate: Any) -> Dict[str, Any]:
    current_rows = list(current or [])
    candidate_rows = list(candidate or [])
    current_by_id = {_entity_key(item): item for item in current_rows if _entity_key(item)}
    candidate_by_id = {_entity_key(item): item for item in candidate_rows if _entity_key(item)}
    added: List[str] = []
    updated: List[str] = []
    unchanged: List[str] = []
    for item_id, cand in candidate_by_id.items():
        cur = current_by_id.get(item_id)
        if cur is None:
            added.append(item_id)
        elif _stable_entity_signature(cur) == _stable_entity_signature(cand):
            unchanged.append(item_id)
        else:
            updated.append(item_id)
    removed = [item_id for item_id in current_by_id.keys() if item_id not in candidate_by_id]
    return {
        "added": sorted(added),
        "updated": sorted(updated),
        "unchanged": sorted(unchanged),
        "removed": sorted(removed),
        "added_count": len(added),
        "updated_count": len(updated),
        "unchanged_count": len(unchanged),
        "removed_count": len(removed),
    }


def _edge_diff(current: Any, candidate: Any) -> Dict[str, Any]:
    current_rows = list(current or [])
    candidate_rows = list(candidate or [])
    current_keys = {_edge_key(item) for item in current_rows if _edge_key(item)}
    candidate_keys = {_edge_key(item) for item in candidate_rows if _edge_key(item)}
    return {
        "added": sorted(candidate_keys - current_keys),
        "removed": sorted(current_keys - candidate_keys),
        "unchanged": sorted(candidate_keys & current_keys),
        "added_count": len(candidate_keys - current_keys),
        "removed_count": len(current_keys - candidate_keys),
        "unchanged_count": len(candidate_keys & current_keys),
    }


def _role_diff(current_roles: Any, candidate_roles: Any) -> Dict[str, Any]:
    current = set(_norm_roles(current_roles))
    candidate = set(_norm_roles(candidate_roles))
    return {
        "added": sorted(candidate - current),
        "removed": sorted(current - candidate),
        "unchanged": sorted(candidate & current),
        "added_count": len(candidate - current),
        "removed_count": len(current - candidate),
        "unchanged_count": len(candidate & current),
    }


def _redact_notes_preview_message(message: Any, *, api_key: str = "", base_url: str = "") -> str:
    text = str(message or "").strip()
    for secret in (api_key,):
        secret_text = str(secret or "")
        if secret_text:
            text = text.replace(secret_text, "[redacted]")
    if base_url:
        text = text.replace(f"Bearer {base_url}", "Bearer [redacted]")
    return text


def _sanitize_notes_preview_warnings(warnings: Any, *, api_key: str = "", base_url: str = "") -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for item in warnings or []:
        row = item if isinstance(item, dict) else {"code": "warning", "message": str(item or "")}
        code = str(row.get("code") or "warning").strip() or "warning"
        message = _redact_notes_preview_message(row.get("message"), api_key=api_key, base_url=base_url)
        out.append({"code": code, "message": message})
    return out


def _notes_preview_response_from_extraction(
    *,
    sess: Session,
    notes_text: str,
    extraction: Dict[str, Any],
    input_hash: str,
    warnings: List[Dict[str, str]],
) -> Dict[str, Any]:
    extracted = extraction if isinstance(extraction, dict) else {}
    nodes_raw = extracted.get("nodes", []) or []
    edges_raw = extracted.get("edges", []) or []
    extracted_roles = _norm_roles(extracted.get("roles", []))
    current_roles = _norm_roles(getattr(sess, "roles", None))
    candidate_roles = current_roles if current_roles else extracted_roles

    current_start_role = str(getattr(sess, "start_role", "") or "").strip()
    candidate_start_role = current_start_role
    if candidate_roles:
        if not candidate_start_role or candidate_start_role not in candidate_roles:
            candidate_start_role = candidate_roles[0]
    else:
        candidate_start_role = ""

    candidate_nodes = [Node.model_validate(nr) for nr in nodes_raw]
    candidate_edges = [Edge.model_validate(er) for er in edges_raw]
    proposed_nodes = _merge_nodes(list(getattr(sess, "nodes", []) or []), candidate_nodes)

    preview_sess = copy.deepcopy(sess)
    preview_sess.roles = list(candidate_roles)
    preview_sess.start_role = candidate_start_role or None
    preview_sess.nodes = list(proposed_nodes)
    preview_sess.edges = list(candidate_edges)
    preview_sess = _recompute_session(preview_sess)
    candidate_questions = list(getattr(preview_sess, "questions", []) or [])

    base_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    return {
        "ok": True,
        "module_id": _NOTES_EXTRACTION_MODULE_ID,
        "status": "preview",
        "source": str((extracted.get("_source") or "")).strip() or "unknown",
        "input_hash": input_hash,
        "current_diagram_state_version": base_version,
        "candidate_roles": list(candidate_roles),
        "candidate_start_role": candidate_start_role or None,
        "candidate_nodes": _safe_model_dump_list(candidate_nodes),
        "candidate_edges": _safe_model_dump_list(candidate_edges),
        "candidate_questions": _safe_model_dump_list(candidate_questions),
        "warnings": warnings,
        "diff": {
            "notes": {
                "changed": str(notes_text or "") != str(getattr(sess, "notes", "") or ""),
                "current_length": len(str(getattr(sess, "notes", "") or "")),
                "candidate_length": len(str(notes_text or "")),
            },
            "roles": _role_diff(getattr(sess, "roles", []) or [], candidate_roles),
            "start_role": {
                "current": current_start_role or None,
                "candidate": candidate_start_role or None,
                "changed": (current_start_role or "") != (candidate_start_role or ""),
            },
            "nodes": _list_diff_by_id(getattr(sess, "nodes", []) or [], candidate_nodes),
            "edges": _edge_diff(getattr(sess, "edges", []) or [], candidate_edges),
            "questions": _list_diff_by_id(getattr(sess, "questions", []) or [], candidate_questions),
        },
    }


@app.post("/api/sessions/{session_id}/notes/extraction-preview")
def post_notes_extraction_preview(
    session_id: str,
    inp: NotesExtractionPreviewIn,
    request: Request = None,
) -> Dict[str, Any]:
    sess, org_id, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}

    _, actor_user_id, _ = _resolve_actor_context(request)
    scope = _notes_preview_scope(sess, org_id=org_id)
    notes_text = str(getattr(inp, "notes", "") or "")
    llm = load_llm_settings()
    api_key = str(llm.get("api_key") or "").strip()
    base_url = str(llm.get("base_url") or "").strip()
    model_name = str(llm.get("model") or "deepseek-chat").strip() or "deepseek-chat"
    input_hash = hash_ai_input(
        {
            "endpoint": "POST /api/sessions/{session_id}/notes/extraction-preview",
            "session_id": str(getattr(sess, "id", "") or session_id),
            "notes": notes_text,
        }
    )
    input_payload = {
        "endpoint": "POST /api/sessions/{session_id}/notes/extraction-preview",
        "session_id": str(getattr(sess, "id", "") or session_id),
        "notes_len": len(notes_text),
        "options": sorted((getattr(inp, "options", None) or {}).keys()) if isinstance(getattr(inp, "options", None), dict) else [],
    }
    started_at = time.time()
    created_at = int(started_at)

    def _finish(
        response: Dict[str, Any],
        *,
        status: str,
        output_summary: str = "",
        error_code: str = "",
        error_message: str = "",
        usage: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        finished_at = int(time.time())
        latency_ms = int(max(0.0, time.time() - started_at) * 1000)
        _record_notes_preview_execution_safe(
            module_id=_NOTES_EXTRACTION_MODULE_ID,
            actor_user_id=actor_user_id,
            scope=scope,
            provider="deepseek",
            model=model_name,
            status=status,
            input_payload=input_payload,
            input_hash=input_hash,
            output_summary=output_summary,
            usage=usage if isinstance(usage, dict) else {},
            latency_ms=latency_ms,
            error_code=error_code,
            error_message=_redact_notes_preview_message(error_message, api_key=api_key, base_url=base_url),
            created_at=created_at,
            finished_at=finished_at,
        )
        return response

    try:
        rate = check_ai_rate_limit(module_id=_NOTES_EXTRACTION_MODULE_ID, actor_user_id=actor_user_id, scope=scope)
    except Exception:
        rate = {"allowed": True}
    if not bool(rate.get("allowed", rate.get("ok", True))):
        return _finish(
            {
                "error": "ai_rate_limit_exceeded",
                "module_id": _NOTES_EXTRACTION_MODULE_ID,
                "input_hash": input_hash,
                "rate_limit": {
                    "limit": int(rate.get("limit") or 0),
                    "window_sec": int(rate.get("window_sec") or 0),
                    "reset_at": int(rate.get("reset_at") or 0),
                },
            },
            status="error",
            output_summary="rate limit blocked",
            error_code="ai_rate_limit_exceeded",
            error_message="ai_rate_limit_exceeded",
        )

    try:
        from .ai.deepseek_client import extract_process_preview
    except Exception as exc:
        message = _redact_notes_preview_message(exc, api_key=api_key, base_url=base_url)
        return _finish(
            {"error": f"deepseek client module not available: {message}", "module_id": _NOTES_EXTRACTION_MODULE_ID, "input_hash": input_hash},
            status="error",
            output_summary="notes extraction module unavailable",
            error_code="module_unavailable",
            error_message=message,
        )

    warnings: List[Dict[str, str]] = []
    base_version = _resolve_base_diagram_state_version(request=request, payload=inp.model_dump(exclude_unset=True))
    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    if base_version is not None and int(base_version) != current_version:
        warnings.append(
            {
                "code": "diagram_state_version_mismatch",
                "message": "Preview was generated against the current session, but the submitted base diagram version is stale.",
            }
        )

    try:
        preview = extract_process_preview(notes_text, api_key=api_key, base_url=base_url)
        source = str((preview or {}).get("source") or "fallback").strip().lower()
        if source not in {"llm", "fallback"}:
            source = "fallback"
        extracted = dict((preview or {}).get("result") or {})
        extracted["_source"] = source
        warnings.extend(_sanitize_notes_preview_warnings((preview or {}).get("warnings"), api_key=api_key, base_url=base_url))
        response = _notes_preview_response_from_extraction(
            sess=sess,
            notes_text=notes_text,
            extraction=extracted,
            input_hash=input_hash,
            warnings=warnings,
        )
        response["source"] = source
        summary = (
            f"source={source} "
            f"nodes={len(response.get('candidate_nodes') or [])} "
            f"edges={len(response.get('candidate_edges') or [])} "
            f"questions={len(response.get('candidate_questions') or [])}"
        )
        return _finish(
            response,
            status="success",
            output_summary=summary,
            usage={
                "source": source,
                "candidate_nodes": len(response.get("candidate_nodes") or []),
                "candidate_edges": len(response.get("candidate_edges") or []),
                "candidate_questions": len(response.get("candidate_questions") or []),
                "warnings": len(warnings),
            },
        )
    except Exception as exc:
        message = _redact_notes_preview_message(exc, api_key=api_key, base_url=base_url)
        return _finish(
            {"error": f"notes extraction preview failed: {message}", "module_id": _NOTES_EXTRACTION_MODULE_ID, "input_hash": input_hash},
            status="error",
            output_summary="notes extraction preview failed",
            error_code="preview_failed",
            error_message=message,
        )


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
def answer(session_id: str, inp: AnswerIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    try:
        _apply_answer(s, inp)
    except KeyError:
        return {"error": "question not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["questions", "nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()


@app.post("/api/sessions/{session_id}/answers")
def answer_v2(session_id: str, inp: AnswerIn, request: Request = None) -> Dict[str, Any]:
    return answer(session_id, inp, request=request)


@app.post("/api/sessions/{session_id}/nodes/{node_id}")
def patch_node(session_id: str, node_id: str, inp: NodePatchIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    node = next((n for n in s.nodes if n.id == node_id), None)
    if not node:
        return {"error": "node not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

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
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()


@app.post("/api/sessions/{session_id}/nodes")
def add_node(session_id: str, inp: CreateNodeIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

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
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()


@app.delete("/api/sessions/{session_id}/nodes/{node_id}")
def delete_node(session_id: str, node_id: str, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(request=request),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    before_n = len(s.nodes)
    s.nodes = [n for n in s.nodes if n.id != node_id]
    if len(s.nodes) == before_n:
        return {"error": "node not found"}

    s.edges = [e for e in s.edges if e.from_id != node_id and e.to_id != node_id]

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes", "edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()


@app.post("/api/sessions/{session_id}/edges")
def add_edge(session_id: str, inp: CreateEdgeIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    if not any(n.id == inp.from_id for n in s.nodes):
        return {"error": "from_id not found", "from_id": inp.from_id}
    if not any(n.id == inp.to_id for n in s.nodes):
        return {"error": "to_id not found", "to_id": inp.to_id}

    exists = any((e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None)) for e in s.edges)
    if exists:
        return {"error": "edge already exists"}

    s.edges.append(Edge(from_id=inp.from_id, to_id=inp.to_id, when=inp.when))

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()


@app.delete("/api/sessions/{session_id}/edges")
def delete_edge(session_id: str, inp: CreateEdgeIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    before = len(s.edges)
    s.edges = [
        e for e in s.edges
        if not (e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None))
    ]
    if len(s.edges) == before:
        return {"error": "edge not found"}

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
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
    drawio = dict(current.get("drawio") or {})
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
            "drawio": drawio,
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
def session_bpmn_meta_patch(session_id: str, inp: BpmnMetaPatchIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    inp_payload = inp.model_dump(exclude_unset=True)
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(request=request, payload=inp_payload),
    )
    user = _request_auth_user(request) if request is not None else {}
    actor_user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    actor_label = _resolve_actor_label_from_user(user, actor_user_id)

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
    drawio = dict(current.get("drawio") or {})

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

    if isinstance(inp.drawio, dict):
        replaced = _normalize_bpmn_meta(
            {"version": current.get("version", 1), "drawio": inp.drawio},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        drawio = dict(replaced.get("drawio") or {})

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
            **current,
            "version": current.get("version", 1),
            "flow_meta": flow_meta,
            "node_path_meta": node_path_meta,
            "robot_meta_by_element_id": robot_meta_by_element_id,
            "hybrid_layer_by_element_id": hybrid_layer_by_element_id,
            "hybrid_v2": hybrid_v2,
            "drawio": drawio,
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
        _mark_diagram_truth_write(
            s,
            changed_keys=["bpmn_meta"],
            actor_user_id=actor_user_id,
            actor_label=actor_label,
        )
        st.save(s)
    return normalized


@app.post("/api/sessions/{session_id}/bpmn_meta/infer_rtiers")
def session_bpmn_meta_infer_rtiers(session_id: str, inp: InferRtiersIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    inp_payload = inp.model_dump(exclude_unset=True)
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(request=request, payload=inp_payload),
    )
    user = _request_auth_user(request) if request is not None else {}
    actor_user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    actor_label = _resolve_actor_label_from_user(user, actor_user_id)

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
        _mark_diagram_truth_write(
            s,
            changed_keys=["bpmn_meta"],
            actor_user_id=actor_user_id,
            actor_label=actor_label,
        )
        st.save(s)
    return {"meta": normalized_meta, "inference": inference}






@app.get("/api/sessions/{session_id}/bpmn")
def session_bpmn_export(
    session_id: str,
    raw: int = Query(0, description="1 = return stored bpmn_xml as-is (no regenerate/overlay)"),
    include_overlay: int = Query(1, description="1 = overlay interview annotations (ignored when raw=1)"),
    request: Request = None,
):
    st = get_storage()
    s, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not s:
        return Response(content="not found", media_type="text/plain", status_code=404)

    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""

    xml_stored = str(getattr(s, "bpmn_xml", "") or "")
    has_graph = len(getattr(s, "nodes", []) or []) > 0 or len(getattr(s, "edges", []) or []) > 0
    current_graph_fp = _session_graph_fingerprint(s)
    stored_graph_fp = str(getattr(s, "bpmn_graph_fingerprint", "") or "").strip()
    raw_mode = bool(int(raw or 0))
    overlay_mode = bool(int(include_overlay or 0))

    def _persist_regenerated(xml_text: str) -> None:
        previous_xml = str(getattr(s, "bpmn_xml", "") or "")
        regenerated_xml = str(xml_text or "")
        current_diagram_state_version = int(getattr(s, "diagram_state_version", 0) or 0)
        s.bpmn_xml = str(xml_text or "")
        s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
        s.bpmn_graph_fingerprint = current_graph_fp
        _mark_diagram_truth_write(
            s,
            changed_keys=["bpmn_xml"],
            actor_user_id=user_id,
            actor_label=_resolve_actor_label_from_user(user, user_id) or "system:export_regenerate",
        )
        _create_bpmn_revision_snapshot_if_needed(
            storage=st,
            session=s,
            previous_xml=previous_xml,
            next_xml=regenerated_xml,
            source_action="export_regenerate",
            created_by=user_id,
            org_id=oid,
            diagram_state_version=current_diagram_state_version + 1,
        )
        st.save(s, user_id=user_id, org_id=oid, is_admin=True)

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


_USER_FACING_BPMN_VERSION_ACTIONS = {
    "publish_manual_save",
    "manual_publish",
    "manual_publish_revision",
    "import_bpmn",
    "restore_bpmn",
    "restore_revision",
    "restore_bpmn_version",
    "session.bpmn_restore",
}


def _bpmn_version_row_is_user_facing(row: Dict[str, Any] | None) -> bool:
    if not isinstance(row, dict):
        return False
    return str(row.get("source_action") or "").strip().lower() in _USER_FACING_BPMN_VERSION_ACTIONS


def _latest_user_facing_bpmn_version(
    storage: Storage,
    session_id: str,
    *,
    org_id: Optional[str] = None,
    include_xml: bool = True,
) -> Optional[Dict[str, Any]]:
    for row in storage.list_bpmn_versions(session_id, org_id=org_id, limit=1000, include_xml=include_xml):
        if _bpmn_version_row_is_user_facing(row):
            return row
    return None


def _create_bpmn_revision_snapshot_if_needed(
    *,
    storage: Storage,
    session: Session,
    previous_xml: Any,
    next_xml: Any,
    source_action: str,
    created_by: str = "",
    org_id: Optional[str] = None,
    import_note: str = "",
    diagram_state_version: int,
) -> Optional[Dict[str, Any]]:
    prev = str(previous_xml or "")
    nxt = str(next_xml or "")
    if not nxt.strip():
        return None
    action = str(source_action or "").strip().lower() or "manual_save"
    session_id = str(getattr(session, "id", "") or "").strip()
    session_hash = session_version_payload_hash(session)
    should_snapshot = prev != nxt
    if action == "publish_manual_save":
        latest_user_version = _latest_user_facing_bpmn_version(storage, session_id, org_id=org_id, include_xml=True)
        latest_hash = str((latest_user_version or {}).get("session_payload_hash") or "").strip()
        latest_xml = str((latest_user_version or {}).get("bpmn_xml") or "")
        should_snapshot = (
            should_snapshot
            or not latest_user_version
            or not latest_hash
            or latest_hash != session_hash
            or latest_xml != nxt
        )
    if not should_snapshot:
        return None
    return storage.create_bpmn_version_snapshot(
        session_id,
        bpmn_xml=nxt,
        source_action=action,
        diagram_state_version=max(0, int(diagram_state_version or 0)),
        session_payload_hash=session_hash,
        session_version=int(getattr(session, "version", 0) or 0),
        session_updated_at=int(getattr(session, "updated_at", 0) or 0),
        created_by=created_by,
        org_id=org_id,
        import_note=import_note,
    )


@app.put("/api/sessions/{session_id}/bpmn")
def session_bpmn_save(session_id: str, inp: BpmnXmlIn, request: Request = None) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None

    sess_pre, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess_pre:
        return {"error": "not found"}
    role = _org_role_for_request(request, oid) if request is not None and oid else ("org_admin" if effective_is_admin else "")
    if not _can_edit_workspace(role, is_admin=effective_is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    xml = str(inp.xml or "")
    if not xml.strip():
        return {"error": "xml is empty"}
    source_action = str(inp.source_action or "").strip().lower()
    import_note = str(inp.import_note or "").strip()
    client_base_diagram_state_version = _resolve_base_diagram_state_version(
        request=request,
        payload=inp.model_dump(exclude_unset=True),
    )

    lock = acquire_session_lock(session_id, ttl_ms=15000)
    if not lock.acquired:
        raise HTTPException(status_code=423, detail="Session is being updated, retry")

    try:
        st = get_storage()
        s, oid_locked, _ = _legacy_load_session_scoped(session_id, request)
        if not s:
            return {"error": "not found"}
        _require_diagram_cas_or_409(
            sess=s,
            session_id=session_id,
            request=request,
            client_base_version=client_base_diagram_state_version,
        )
        previous_xml = str(getattr(s, "bpmn_xml", "") or "")
        current_diagram_state_version = int(getattr(s, "diagram_state_version", 0) or 0)
        bpmn_version_snapshot = None

        flow_ctx = _collect_sequence_flow_meta(xml)
        flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
        node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()
        current_meta = _normalize_bpmn_meta(
            getattr(s, "bpmn_meta", {}),
            allowed_flow_ids=flow_ids,
            allowed_node_ids=node_ids,
        )
        auto_pass_state_write_requested = False
        if isinstance(inp.bpmn_meta, dict):
            incoming_meta = inp.bpmn_meta
            auto_pass_state_write_requested = "auto_pass_v1" in incoming_meta
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

            incoming_drawio = incoming_meta.get("drawio")
            current_drawio = current_meta.get("drawio", {})
            if isinstance(incoming_drawio, dict):
                incoming_drawio_size = _drawio_payload_size(incoming_drawio)
                current_drawio_size = _drawio_payload_size(current_drawio)
                merged_drawio = current_drawio if incoming_drawio_size <= 0 < current_drawio_size else incoming_drawio
            else:
                merged_drawio = current_drawio

            raw_bpmn_meta = {
                **current_meta,
                **incoming_meta,
                "version": incoming_meta.get("version", current_meta.get("version", 1)),
                "flow_meta": incoming_meta.get("flow_meta", current_meta.get("flow_meta", {})),
                "node_path_meta": incoming_meta.get("node_path_meta", current_meta.get("node_path_meta", {})),
                "robot_meta_by_element_id": incoming_meta.get(
                    "robot_meta_by_element_id",
                    current_meta.get("robot_meta_by_element_id", {}),
                ),
                "camunda_extensions_by_element_id": incoming_meta.get(
                    "camunda_extensions_by_element_id",
                    current_meta.get("camunda_extensions_by_element_id", {}),
                ),
                "presentation_by_element_id": incoming_meta.get(
                    "presentation_by_element_id",
                    current_meta.get("presentation_by_element_id", {}),
                ),
                "execution_plans": incoming_meta.get(
                    "execution_plans",
                    current_meta.get("execution_plans", []),
                ),
                "hybrid_layer_by_element_id": merged_hybrid_layer,
                "hybrid_v2": merged_hybrid_v2,
                "drawio": merged_drawio,
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
        changed_keys = ["bpmn_meta"]
        if previous_xml != xml:
            changed_keys.insert(0, "bpmn_xml")
        _mark_diagram_truth_write(
            s,
            changed_keys=changed_keys,
            actor_user_id=user_id,
            actor_label=_resolve_actor_label_from_user(user, user_id),
        )
        bpmn_version_snapshot = _create_bpmn_revision_snapshot_if_needed(
            storage=st,
            session=s,
            previous_xml=previous_xml,
            next_xml=xml,
            source_action=source_action,
            created_by=user_id,
            org_id=oid_locked,
            import_note=import_note,
            diagram_state_version=current_diagram_state_version + 1,
        )
        st.save(s, user_id=user_id, org_id=oid_locked, is_admin=True)
        if auto_pass_state_write_requested:
            _capture_persisted_auto_pass_failed_state(
                s,
                request=request,
                route=f"/api/sessions/{session_id}/bpmn",
                org_id=oid_locked,
                user_id=user_id,
            )
        _invalidate_session_caches(s, session_id=session_id, org_id=getattr(s, "org_id", "") or get_default_org_id())
        out = {
            "ok": True,
            "session_id": s.id,
            "bytes": len(xml),
            "version": s.bpmn_xml_version,
            "diagram_state_version": int(getattr(s, "diagram_state_version", 0) or 0),
        }
        if bpmn_version_snapshot is not None:
            out["bpmn_version_snapshot"] = bpmn_version_snapshot
        return out
    finally:
        lock.release()


@app.get("/api/sessions/{session_id}/bpmn/versions")
def session_bpmn_versions_list(
    session_id: str,
    request: Request = None,
    limit: int = Query(100, description="Max versions to return"),
    include_xml: int = Query(0, description="1 = include bpmn_xml payload"),
) -> Dict[str, Any]:
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    st = get_storage()
    include_xml_mode = int(include_xml or 0) == 1
    rows = st.list_bpmn_versions(
        str(getattr(sess, "id", "") or session_id),
        org_id=oid,
        limit=limit,
        include_xml=include_xml_mode,
    )
    user_facing_version_numbers = st.list_bpmn_version_numbers_by_source_actions(
        str(getattr(sess, "id", "") or session_id),
        org_id=oid,
        source_actions=_USER_FACING_BPMN_VERSION_ACTIONS,
    )
    user_facing_number_by_storage_version = {
        int(version_number or 0): index + 1
        for index, version_number in enumerate(user_facing_version_numbers)
        if int(version_number or 0) > 0
    }
    items: List[Dict[str, Any]] = []
    for row in rows:
        created_at = int(row.get("created_at") or 0)
        author = _build_bpmn_version_author(row.get("created_by"))
        storage_version_number = int(row.get("version_number") or 0)
        user_facing_revision_number = int(user_facing_number_by_storage_version.get(storage_version_number) or 0)
        item = {
            "id": str(row.get("id") or ""),
            "session_id": str(row.get("session_id") or ""),
            "version_number": storage_version_number,
            "user_facing_revision_number": user_facing_revision_number,
            "revision_display_number": user_facing_revision_number,
            "diagram_state_version": int(row.get("diagram_state_version") or 0),
            "session_payload_hash": str(row.get("session_payload_hash") or ""),
            "session_version": int(row.get("session_version") or 0),
            "session_updated_at": int(row.get("session_updated_at") or 0),
            "source_action": str(row.get("source_action") or ""),
            "import_note": str(row.get("import_note") or ""),
            "created_at": created_at,
            "created_at_ms": _to_epoch_ms(created_at),
            "created_at_iso": _to_epoch_iso(created_at),
            "created_by": str(row.get("created_by") or ""),
            "author_id": author.get("id", ""),
            "author_name": author.get("name", ""),
            "author_email": author.get("email", ""),
            "author_display": author.get("display_name", ""),
            "author": author,
        }
        if include_xml_mode:
            item["bpmn_xml"] = str(row.get("bpmn_xml") or "")
        items.append(item)
    current_session_payload_hash = session_version_payload_hash(sess)
    latest_user_version = _latest_user_facing_bpmn_version(
        st,
        str(getattr(sess, "id", "") or session_id),
        org_id=oid,
        include_xml=False,
    )
    latest_session_payload_hash = str((latest_user_version or {}).get("session_payload_hash") or "").strip()
    return {
        "ok": True,
        "session_id": str(getattr(sess, "id", "") or session_id),
        "count": len(items),
        "user_facing_count": len(user_facing_version_numbers),
        "latest_user_facing_revision_number": len(user_facing_version_numbers),
        "current_session_payload_hash": current_session_payload_hash,
        "current_session_version": int(getattr(sess, "version", 0) or 0),
        "current_session_updated_at": int(getattr(sess, "updated_at", 0) or 0),
        "latest_user_version_session_payload_hash": latest_session_payload_hash,
        "has_session_changes_since_latest_bpmn_version": (
            bool(current_session_payload_hash)
            and (not latest_session_payload_hash or latest_session_payload_hash != current_session_payload_hash)
        ),
        "items": items,
    }


@app.get("/api/sessions/{session_id}/bpmn/versions/{version_id}")
def session_bpmn_version_detail(session_id: str, version_id: str, request: Request = None) -> Dict[str, Any]:
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    st = get_storage()
    row = st.get_bpmn_version(
        str(getattr(sess, "id", "") or session_id),
        version_id,
        org_id=oid,
    )
    if not row:
        return {"error": "bpmn_version_not_found", "version_id": str(version_id or "")}
    created_at = int(row.get("created_at") or 0)
    author = _build_bpmn_version_author(row.get("created_by"))
    item = {
        "id": str(row.get("id") or ""),
        "session_id": str(row.get("session_id") or ""),
        "version_number": int(row.get("version_number") or 0),
        "diagram_state_version": int(row.get("diagram_state_version") or 0),
        "session_payload_hash": str(row.get("session_payload_hash") or ""),
        "session_version": int(row.get("session_version") or 0),
        "session_updated_at": int(row.get("session_updated_at") or 0),
        "source_action": str(row.get("source_action") or ""),
        "import_note": str(row.get("import_note") or ""),
        "created_at": created_at,
        "created_at_ms": _to_epoch_ms(created_at),
        "created_at_iso": _to_epoch_iso(created_at),
        "created_by": str(row.get("created_by") or ""),
        "author_id": author.get("id", ""),
        "author_name": author.get("name", ""),
        "author_email": author.get("email", ""),
        "author_display": author.get("display_name", ""),
        "author": author,
        "bpmn_xml": str(row.get("bpmn_xml") or ""),
    }
    return {
        "ok": True,
        "session_id": str(getattr(sess, "id", "") or session_id),
        "item": item,
    }


@app.post("/api/sessions/{session_id}/bpmn/restore/{version_id}")
def session_bpmn_restore(
    session_id: str,
    version_id: str,
    inp: BpmnRestoreIn | None = None,
    request: Request = None,
) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None

    sess_pre, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess_pre:
        return {"error": "not found"}
    role = _org_role_for_request(request, oid) if request is not None and oid else ("org_admin" if effective_is_admin else "")
    if not _can_edit_workspace(role, is_admin=effective_is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    vid = str(version_id or "").strip()
    if not vid:
        return {"error": "missing_version_id"}
    restore_payload = inp.model_dump(exclude_unset=True) if isinstance(inp, BpmnRestoreIn) else {}
    client_base_diagram_state_version = _resolve_base_diagram_state_version(request=request, payload=restore_payload)

    lock = acquire_session_lock(session_id, ttl_ms=15000)
    if not lock.acquired:
        raise HTTPException(status_code=423, detail="Session is being updated, retry")

    try:
        st = get_storage()
        s, oid_locked, _ = _legacy_load_session_scoped(session_id, request)
        if not s:
            return {"error": "not found"}
        _require_diagram_cas_or_409(
            sess=s,
            session_id=session_id,
            request=request,
            client_base_version=client_base_diagram_state_version,
        )

        version_row = st.get_bpmn_version(
            str(getattr(s, "id", "") or session_id),
            vid,
            org_id=oid_locked,
        )
        if not version_row:
            return {"error": "bpmn_version_not_found", "version_id": vid}

        xml = str(version_row.get("bpmn_xml") or "")
        if not xml.strip():
            return {"error": "bpmn_version_xml_empty", "version_id": vid}
        previous_xml = str(getattr(s, "bpmn_xml", "") or "")
        current_diagram_state_version = int(getattr(s, "diagram_state_version", 0) or 0)
        restored_snapshot = None

        flow_ctx = _collect_sequence_flow_meta(xml)
        flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
        node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()

        current_meta = _normalize_bpmn_meta(
            getattr(s, "bpmn_meta", {}),
            allowed_flow_ids=flow_ids,
            allowed_node_ids=node_ids,
        )

        s.bpmn_xml = xml
        s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
        s.bpmn_graph_fingerprint = _session_graph_fingerprint(s)
        normalized_meta = _normalize_bpmn_meta(
            current_meta,
            allowed_flow_ids=flow_ids,
            allowed_node_ids=node_ids,
        )
        normalized_meta["flow_meta"] = _enforce_gateway_tier_constraints(
            dict(normalized_meta.get("flow_meta") or {}),
            outgoing_by_source=flow_ctx.get("outgoing_by_source"),
            gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
        )
        s.bpmn_meta = normalized_meta
        changed_keys = ["bpmn_meta"]
        if previous_xml != xml:
            changed_keys.insert(0, "bpmn_xml")
        _mark_diagram_truth_write(
            s,
            changed_keys=changed_keys,
            actor_user_id=user_id,
            actor_label=_resolve_actor_label_from_user(user, user_id),
        )
        restored_snapshot = _create_bpmn_revision_snapshot_if_needed(
            storage=st,
            session=s,
            previous_xml=previous_xml,
            next_xml=xml,
            source_action="restore_bpmn_version",
            created_by=user_id,
            org_id=oid_locked,
            diagram_state_version=current_diagram_state_version + 1,
        )
        st.save(s, user_id=user_id, org_id=oid_locked, is_admin=True)
        _invalidate_session_caches(s, session_id=session_id, org_id=getattr(s, "org_id", "") or get_default_org_id())
        _audit_log_safe(
            request,
            org_id=oid_locked or str(getattr(s, "org_id", "") or get_default_org_id()),
            action="session.bpmn_restore",
            entity_type="session",
            entity_id=str(getattr(s, "id", "") or session_id),
            project_id=str(getattr(s, "project_id", "") or ""),
            session_id=str(getattr(s, "id", "") or session_id),
            meta={
                "version_id": str(version_row.get("id") or ""),
                "version_number": int(version_row.get("version_number") or 0),
            },
        )
        restored_created_at = int(version_row.get("created_at") or 0)
        restored_author = _build_bpmn_version_author(version_row.get("created_by"))
        return {
            "ok": True,
            "session_id": str(getattr(s, "id", "") or session_id),
            "version": int(getattr(s, "bpmn_xml_version", 0) or 0),
            "diagram_state_version": int(getattr(s, "diagram_state_version", 0) or 0),
            "bytes": len(xml),
            "bpmn_xml": xml,
            "bpmn_version_snapshot": restored_snapshot,
            "restored_version": {
                "id": str(version_row.get("id") or ""),
                "version_number": int(version_row.get("version_number") or 0),
                "source_action": str(version_row.get("source_action") or ""),
                "import_note": str(version_row.get("import_note") or ""),
                "created_at": restored_created_at,
                "created_at_ms": _to_epoch_ms(restored_created_at),
                "created_at_iso": _to_epoch_iso(restored_created_at),
                "created_by": str(version_row.get("created_by") or ""),
                "author_id": restored_author.get("id", ""),
                "author_name": restored_author.get("name", ""),
                "author_email": restored_author.get("email", ""),
                "author_display": restored_author.get("display_name", ""),
                "author": restored_author,
            },
        }
    finally:
        lock.release()


@app.delete("/api/sessions/{session_id}/bpmn")
def session_bpmn_clear(session_id: str, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(request=request),
    )
    user = _request_auth_user(request) if request is not None else {}
    actor_user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    actor_label = _resolve_actor_label_from_user(user, actor_user_id)
    previous_xml = str(getattr(s, "bpmn_xml", "") or "")
    current_diagram_state_version = int(getattr(s, "diagram_state_version", 0) or 0)
    cleared_snapshot: Optional[Dict[str, Any]] = None
    if previous_xml.strip():
        cleared_snapshot = st.create_bpmn_version_snapshot(
            str(getattr(s, "id", "") or session_id),
            bpmn_xml=previous_xml,
            source_action="clear_bpmn",
            diagram_state_version=current_diagram_state_version + 1,
            created_by=actor_user_id,
            org_id=str(getattr(s, "org_id", "") or get_default_org_id()),
        )

    s.bpmn_xml = ""
    s.bpmn_xml_version = 0
    s.bpmn_graph_fingerprint = ""
    s.bpmn_meta = _normalize_bpmn_meta({})
    _mark_diagram_truth_write(
        s,
        changed_keys=["bpmn_xml", "bpmn_meta"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    _invalidate_session_caches(s, session_id=session_id, org_id=getattr(s, "org_id", "") or get_default_org_id())
    out = {
        "ok": True,
        "session_id": s.id,
        "diagram_state_version": int(getattr(s, "diagram_state_version", 0) or 0),
    }
    if isinstance(cleared_snapshot, dict):
        out["bpmn_version_snapshot"] = cleared_snapshot
    return out

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
def api_meta(response: Response):
    response.headers["Cache-Control"] = "no-store"
    redis = runtime_status(force_ping=True)
    return {
        "api_version": 2,
        "features": {
            "bpmn": True,
            "export_zip": True,
            "graph_edit": True,
            "projects": True, "project_sessions": True,
            "redis": bool(redis.get("mode") == "ON"),
        },
        "redis": {
            "mode": redis.get("mode"),
            "state": redis.get("state"),
            "degraded": bool(redis.get("degraded")),
            "incident": bool(redis.get("incident")),
            "required": bool(redis.get("required")),
        },
        "runtime": get_runtime_build_meta(),
    }


# -----------------------------
# Enterprise org endpoints (dual-mode with legacy routes)
# -----------------------------


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


def _resolve_invite_base_url(request: Optional[Request], *, explicit_base_url: str = "") -> str:
    configured = str(explicit_base_url or os.environ.get("APP_BASE_URL") or os.environ.get("PUBLIC_BASE_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    return ""


def _build_invite_link(base_url: str, token: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    invite_token = str(token or "").strip()
    if not invite_token:
        return f"{base}/accept-invite" if base else "/accept-invite"
    return f"{base}/accept-invite?token={invite_token}"


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


def _request_org_candidates(request: Optional[Request], preferred_org_id: str) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()

    def _push(org_id_raw: Any) -> None:
        org_id = str(org_id_raw or "").strip()
        if not org_id or org_id in seen:
            return
        seen.add(org_id)
        out.append(org_id)

    _push(preferred_org_id)
    if request is not None:
        user_id, is_admin = _request_user_meta(request)
        if user_id:
            for row in list_user_org_memberships(user_id, is_admin=is_admin):
                if isinstance(row, dict):
                    _push(row.get("org_id"))
    if not out:
        _push(get_default_org_id())
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
    proj: Optional[Project] = None
    resolved_oid = oid
    for org_candidate in _request_org_candidates(request, oid):
        proj = ps.load(pid, org_id=(org_candidate or None), is_admin=True)
        if proj:
            resolved_oid = org_candidate
            break
    if not proj:
        return None, oid, None
    scope = _project_scope_for_request(
        request,
        resolved_oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id(),
    )
    allowed = _scope_allowed_project_ids(scope)
    if allowed and str(getattr(proj, "id", "") or "").strip() not in allowed:
        return None, resolved_oid, scope
    return proj, (resolved_oid or str(getattr(proj, "org_id", "") or "").strip() or get_default_org_id()), scope


def _legacy_load_session_scoped(
    session_id: str,
    request: Optional[Request] = None,
) -> Tuple[Optional[Session], str, Optional[Dict[str, Any]]]:
    oid = _request_active_org_id(request) if request is not None else ""
    sid = str(session_id or "").strip()
    if not sid:
        return None, oid, None
    st = get_storage()
    sess: Optional[Session] = None
    resolved_oid = oid
    for org_candidate in _request_org_candidates(request, oid):
        sess = st.load(sid, org_id=(org_candidate or None), is_admin=True)
        if sess:
            resolved_oid = org_candidate
            break
    if not sess:
        return None, oid, None
    scope = _project_scope_for_request(
        request,
        resolved_oid or str(getattr(sess, "org_id", "") or "").strip() or get_default_org_id(),
    )
    allowed = _scope_allowed_project_ids(scope)
    project_id = str(getattr(sess, "project_id", "") or "").strip()
    if allowed and project_id and project_id not in allowed:
        return None, resolved_oid, scope
    return sess, (resolved_oid or str(getattr(sess, "org_id", "") or "").strip() or get_default_org_id()), scope


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


def _workspace_attention_markers_info(bpmn_meta_raw: Any, user_id: str) -> Dict[str, Any]:
    try:
        bpmn_meta = json.loads(str(bpmn_meta_raw or "{}"))
        if not isinstance(bpmn_meta, dict):
            bpmn_meta = {}
    except Exception:
        bpmn_meta = {}
    markers_raw = bpmn_meta.get("attention_markers")
    markers = markers_raw if isinstance(markers_raw, list) else []
    show_on_workspace = bpmn_meta.get("attention_show_on_workspace")
    show_flag = bool(show_on_workspace is not False)
    uid = str(user_id or "").strip()
    unresolved = 0
    unread = 0
    for marker_raw in markers:
        marker = marker_raw if isinstance(marker_raw, dict) else {}
        if not str(marker.get("id") or "").strip():
            continue
        if bool(marker.get("is_checked")):
            continue
        unresolved += 1
        seen_by = marker.get("last_seen_at_by_user")
        seen_by_map = seen_by if isinstance(seen_by, dict) else {}
        seen_raw = seen_by_map.get(uid) if uid else None
        try:
            seen_ts = int(seen_raw or 0)
        except Exception:
            seen_ts = 0
        if seen_ts <= 0:
            unread += 1
    return {
        "show_on_workspace": show_flag,
        "unresolved_count": int(unresolved),
        "workspace_count": int(unresolved if show_flag else 0),
        "unread_count": int(unread),
    }


def _workspace_session_status(
    *,
    reports_versions: int,
    version: int,
    bpmn_xml_version: int,
    interview_raw: Any,
) -> str:
    if int(reports_versions or 0) > 0:
        derived = "ready"
    else:
        derived = ""
        if int(version or 0) > 0 or int(bpmn_xml_version or 0) > 0:
            derived = "in_progress"
        interview = interview_raw if isinstance(interview_raw, dict) else {}
        if interview and not derived:
            derived = "in_progress"
        if not derived:
            derived = "draft"
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    manual = _normalize_session_status(interview.get("status"))
    return manual or derived


def _as_dict_obj(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list_obj(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _safe_json_dict(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(str(raw or "{}"))
    except Exception:
        parsed = {}
    return parsed if isinstance(parsed, dict) else {}


def _workspace_collect_dod_artifacts(
    *,
    row: Dict[str, Any],
    interview: Dict[str, Any],
    reports_versions: int,
    attention_count: int,
) -> Dict[str, Any]:
    bpmn_meta = _safe_json_dict(row.get("bpmn_meta_json"))
    notes_by_element = _safe_json_dict(row.get("notes_by_element_json"))
    notes_raw = str(row.get("notes") or "").strip()

    # Paths/coverage artifacts from interview graph/path spec.
    path_candidates = [
        interview.get("report_paths_spec"),
        interview.get("paths_spec"),
        interview.get("paths"),
        interview.get("path_specs"),
        interview.get("path_tiers"),
        interview.get("node_path_assignments"),
        interview.get("happy_path"),
    ]
    path_hits = 0
    for candidate in path_candidates:
        if isinstance(candidate, dict) and len(candidate) > 0:
            path_hits += 1
        elif isinstance(candidate, list) and len(candidate) > 0:
            path_hits += 1
        elif isinstance(candidate, str) and candidate.strip():
            path_hits += 1

    interview_steps = _as_list_obj(interview.get("steps"))
    interview_timeline = _as_list_obj(interview.get("timeline"))
    interview_graph_nodes = _as_list_obj(interview.get("graph_nodes"))
    interview_questions = _as_list_obj(interview.get("questions"))
    interview_answers = _as_list_obj(interview.get("answers"))

    robot_meta = _as_dict_obj(bpmn_meta.get("robot_meta_by_element_id"))
    robot_meta_count = len(robot_meta)

    hybrid_doc = _as_dict_obj(bpmn_meta.get("hybrid_v2"))
    hybrid_elements = _as_list_obj(hybrid_doc.get("elements"))
    hybrid_edges = _as_list_obj(hybrid_doc.get("edges"))
    hybrid_count = len(hybrid_elements) + len(hybrid_edges)

    drawio = _as_dict_obj(bpmn_meta.get("drawio"))
    drawio_enabled = bool(drawio.get("enabled")) or bool(str(drawio.get("doc_xml") or "").strip()) or bool(str(drawio.get("svg_cache") or "").strip())

    notes_items_count = 0
    notes_summary_count = 0
    for entry_raw in notes_by_element.values():
        entry = _as_dict_obj(entry_raw)
        note_text = str(entry.get("note") or entry.get("text") or "").strip()
        summary_text = str(entry.get("summary") or entry.get("summary_text") or entry.get("tldr") or "").strip()
        if note_text:
            notes_items_count += 1
        if summary_text:
            notes_summary_count += 1

    has_interview_data = bool(
        interview_steps
        or interview_timeline
        or interview_graph_nodes
        or interview_questions
        or interview_answers
        or interview
    )
    has_bpmn = int(row.get("bpmn_xml_version") or 0) > 0
    has_paths = path_hits > 0
    has_interview = has_interview_data
    has_reports = int(reports_versions or 0) > 0
    has_robotmeta = robot_meta_count > 0
    has_hybrid = hybrid_count > 0 or drawio_enabled
    has_notes_reviewed = notes_summary_count > 0 or notes_items_count > 0 or bool(notes_raw) or (
        int(attention_count or 0) == 0 and (has_interview or has_reports)
    )

    dod_snapshot = _as_dict_obj(interview.get("dod_snapshot"))
    dod_summary = _as_dict_obj(dod_snapshot.get("summary"))
    dod_snapshot_pct_raw = dod_summary.get("dodPct")
    try:
        dod_snapshot_pct = int(dod_snapshot_pct_raw) if dod_snapshot_pct_raw is not None else None
    except Exception:
        dod_snapshot_pct = None
    if isinstance(dod_snapshot_pct, int) and (dod_snapshot_pct < 0 or dod_snapshot_pct > 100):
        dod_snapshot_pct = None

    return {
        "bpmn_present": has_bpmn,
        "paths_mapped": has_paths,
        "interview_filled": has_interview,
        "ai_report_created": has_reports,
        "robotmeta_filled": has_robotmeta,
        "hybrid_or_drawio_present": has_hybrid,
        "notes_reviewed": has_notes_reviewed,
        "bpmn_xml_version": int(row.get("bpmn_xml_version") or 0),
        "version": int(row.get("version") or 0),
        "reports_versions": int(reports_versions or 0),
        "needs_attention": int(attention_count or 0),
        "path_artifacts_count": int(path_hits),
        "interview_steps_count": int(len(interview_steps) or len(interview_timeline) or len(interview_graph_nodes)),
        "robotmeta_count": int(robot_meta_count),
        "hybrid_items_count": int(hybrid_count),
        "drawio_enabled": bool(drawio_enabled),
        "notes_items_count": int(notes_items_count),
        "notes_summary_count": int(notes_summary_count),
        "notes_text_present": bool(notes_raw),
        "dod_snapshot_pct": dod_snapshot_pct,
    }


def _resolved_org_for_cache(org_id: Any) -> str:
    return str(org_id or "").strip() or get_default_org_id()


def _invalidate_workspace_cache_for_org(org_id: Any) -> None:
    invalidate_workspace_org(_resolved_org_for_cache(org_id))


def _invalidate_tldr_cache_for_session(session_id: Any) -> None:
    sid = str(session_id or "").strip()
    if not sid:
        return
    invalidate_tldr_session(sid)


def _invalidate_session_open_cache_for_session(session_id: Any) -> None:
    sid = str(session_id or "").strip()
    if not sid:
        return
    invalidate_session_open(sid)


def _invalidate_explorer_children_for_project(project_id: Any, org_id: Any) -> None:
    pid = str(project_id or "").strip()
    oid = _resolved_org_for_cache(org_id)
    if not pid or not oid:
        return
    try:
        targets = get_project_explorer_invalidation_targets(oid, pid)
    except Exception:
        targets = None
    if not targets:
        return
    wid = str(targets.get("workspace_id") or "").strip()
    for folder_id in (targets.get("children_folder_ids") or []):
        explorer_invalidate_children(oid, wid, str(folder_id or ""))


def _invalidate_session_caches(session_obj: Any = None, *, session_id: Any = None, org_id: Any = None) -> None:
    sid = str(session_id or getattr(session_obj, "id", "") or "").strip()
    oid = _resolved_org_for_cache(org_id or getattr(session_obj, "org_id", ""))
    project_id = str(getattr(session_obj, "project_id", "") or "").strip()
    _invalidate_workspace_cache_for_org(oid)
    if project_id:
        explorer_invalidate_sessions(project_id)
        _invalidate_explorer_children_for_project(project_id, oid)
    if sid:
        _invalidate_session_open_cache_for_session(sid)
        _invalidate_tldr_cache_for_session(sid)


def _extract_report_summary_text(report_row: Dict[str, Any]) -> str:
    row = report_row if isinstance(report_row, dict) else {}
    payload = row.get("payload_normalized")
    if not isinstance(payload, dict):
        payload = row.get("report_json")
    if not isinstance(payload, dict):
        payload = {}
    summary_raw = payload.get("summary")
    lines: List[str] = []
    if isinstance(summary_raw, list):
        for item in summary_raw:
            text = str(item or "").strip()
            if text:
                lines.append(text)
    elif summary_raw is not None:
        text = str(summary_raw or "").strip()
        if text:
            lines.append(text)
    return "\n".join(lines).strip()


def _build_session_tldr_payload(session_obj: Any) -> Dict[str, Any]:
    sid = str(getattr(session_obj, "id", "") or "").strip()
    interview = getattr(session_obj, "interview", {})
    by_path = _get_report_versions_by_path(interview)
    latest_row: Dict[str, Any] = {}
    latest_key: Tuple[int, int] = (0, 0)
    for rows in by_path.values():
        if not isinstance(rows, list):
            continue
        for row in rows:
            item = row if isinstance(row, dict) else {}
            key = (int(item.get("created_at") or 0), int(item.get("version") or 0))
            if key > latest_key:
                latest_key = key
                latest_row = item

    report_summary = _extract_report_summary_text(latest_row)
    notes_map_raw = getattr(session_obj, "notes_by_element", {})
    notes_map = notes_map_raw if isinstance(notes_map_raw, dict) else {}
    notes_summaries: List[str] = []
    notes_updated_at = 0
    for entry_raw in notes_map.values():
        entry = entry_raw if isinstance(entry_raw, dict) else {}
        text = str(entry.get("summary") or entry.get("tldr") or entry.get("summary_text") or "").strip()
        if text:
            notes_summaries.append(text)
        try:
            notes_updated_at = max(
                notes_updated_at,
                int(entry.get("summaryUpdatedAt") or entry.get("summary_updated_at") or 0),
                int(entry.get("updatedAt") or entry.get("updated_at") or 0),
            )
        except Exception:
            pass

    if report_summary:
        summary_text = report_summary
        source_kind = "report_version.summary"
        updated_at = int(latest_row.get("created_at") or 0)
    elif notes_summaries:
        summary_text = "\n".join(notes_summaries[:4]).strip()
        source_kind = "notes_by_element.summary"
        updated_at = int(notes_updated_at or 0)
    else:
        summary_text = ""
        source_kind = "notes_by_element.live"
        updated_at = 0

    report_id = str(latest_row.get("id") or "").strip()
    path_id = str(latest_row.get("path_id") or "").strip()
    return {
        "session_id": sid,
        "summary": summary_text,
        "source_kind": source_kind,
        "updated_at": updated_at,
        "report_version_id": report_id or None,
        "path_id": path_id or None,
    }


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
    if status_filter and status_filter not in _SESSION_STATUS_SET:
        return _enterprise_error(422, "validation_error", "status must be draft|in_progress|review|ready|archived")
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
    uid, is_admin = _request_user_meta(request)
    role_l = str(role or "").strip().lower()

    scope = _project_scope_for_request(request, oid)
    allowed_projects = _scope_allowed_project_ids(scope)
    selected_project_id = str(project_id or "").strip()
    if selected_project_id and allowed_projects and selected_project_id not in allowed_projects:
        return _enterprise_error(404, "not_found", "not_found")

    owner_filter_ids = _workspace_parse_owner_ids(owner_ids)
    workspace_cache_payload = {
        "uid": uid,
        "is_admin": bool(is_admin),
        "role": role_l,
        "group_by": group,
        "q": str(q or "").strip(),
        "owner_ids": owner_filter_ids,
        "project_id": selected_project_id,
        "status": status_filter,
        "updated_from": int(updated_from or 0) if updated_from is not None else None,
        "updated_to": int(updated_to or 0) if updated_to is not None else None,
        "needs_attention": int(needs_attention) if needs_attention is not None else None,
        "limit": lim,
        "offset": off,
        "allowed_projects": sorted(allowed_projects) if allowed_projects else [],
    }
    cache_key = workspace_cache_key(
        _resolved_org_for_cache(oid),
        workspace_filters_hash(workspace_cache_payload),
    )
    cached_payload = cache_get_json(cache_key)
    if isinstance(cached_payload, dict):
        return cached_payload

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
        member_uid = str(row.get("user_id") or "").strip()
        if not member_uid:
            continue
        member_by_user[member_uid] = {
            "id": member_uid,
            "email": str(row.get("email") or "").strip().lower(),
            "name": str(row.get("email") or member_uid).strip(),
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
        markers_info = _workspace_attention_markers_info(row.get("bpmn_meta_json"), uid)
        marker_workspace_count = int(markers_info.get("workspace_count") or 0)
        marker_unread_count = int(markers_info.get("unread_count") or 0)
        combined_attention_count = int(attention_count) + marker_workspace_count
        dod_artifacts = _workspace_collect_dod_artifacts(
            row=row,
            interview=interview,
            reports_versions=reports_versions,
            attention_count=combined_attention_count,
        )
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
            if needs_filter == 1 and combined_attention_count <= 0:
                continue
            if needs_filter == 0 and combined_attention_count > 0:
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
            "needs_attention": int(combined_attention_count),
            "attention_unread": int(marker_unread_count),
            "attention_markers_count": int(marker_workspace_count),
            "attention_markers_unread": int(marker_unread_count),
            "attention_show_on_workspace": bool(markers_info.get("show_on_workspace") is not False),
            "version": int(row.get("version") or 0),
            "bpmn_xml_version": int(row.get("bpmn_xml_version") or 0),
            "dod_artifacts": dod_artifacts,
            "dod_snapshot_pct": dod_artifacts.get("dod_snapshot_pct"),
            "can_view": True,
            "can_edit": _can_edit_workspace(role_l, is_admin=is_admin),
            "can_manage": _can_manage_workspace(role_l, is_admin=is_admin),
        }
        sessions_all.append(session)
        project_counts[pid] = int(project_counts.get(pid, 0) or 0) + 1
        if owner_id:
            user_session_counts[owner_id] = int(user_session_counts.get(owner_id, 0) or 0) + 1

    sessions_all.sort(key=lambda item: (int(item.get("updated_at") or 0), str(item.get("id") or "")), reverse=True)
    total = len(sessions_all)
    summary = {
        "total": int(total),
        "draft": 0,
        "in_progress": 0,
        "review": 0,
        "ready": 0,
        "archived": 0,
        "attention": 0,
    }
    for item in sessions_all:
        status_key = str(item.get("status") or "").strip().lower()
        if status_key not in _SESSION_STATUS_SET:
            status_key = "draft"
        summary[status_key] = int(summary.get(status_key, 0) or 0) + 1
        summary["attention"] = int(summary.get("attention", 0) or 0) + int(item.get("needs_attention") or 0)
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
            "workspace_id": str(row.get("workspace_id") or "").strip(),
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

    result = {
        "org": {"id": oid, "name": org_name, "role": role_l},
        "group_by": group,
        "users": users_out,
        "projects": projects_out,
        "summary": summary,
        "sessions": sessions_page,
        "page": {"limit": lim, "offset": off, "total": total},
    }
    cache_set_json(cache_key, result, ttl_sec=30)
    return result


def list_orgs_endpoint(request: Request) -> Dict[str, Any]:
    user = _request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    active_org_id = str(getattr(request.state, "active_org_id", "") or "").strip() or resolve_active_org_id(user_id, is_admin=is_admin)
    items = list_user_org_memberships(user_id, is_admin=is_admin)
    return build_items_payload(items, active_org_id=active_org_id, default_org_id=get_default_org_id())


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


@app.patch("/api/orgs/{org_id}")
def patch_org_endpoint(org_id: str, inp: OrgPatchIn, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_role(request, oid, _ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    if not _can_manage_workspace(role, is_admin=is_admin):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    name = _clean_name(getattr(inp, "name", ""))
    if not name:
        return _enterprise_error(422, "validation_error", "name is required")
    try:
        org = rename_org_with_validation(oid, name)
    except ValueError as exc:
        marker = str(exc or "").strip().lower()
        if "exists" in marker:
            return _enterprise_error(409, "conflict", "workspace_name_exists")
        if "not found" in marker:
            return _enterprise_error(404, "not_found", "not_found")
        return _enterprise_error(422, "validation_error", str(exc))
    _audit_log_safe(
        request,
        org_id=oid,
        action="org.rename",
        entity_type="org",
        entity_id=oid,
        meta={"name": name, "actor_user_id": uid},
    )
    _invalidate_workspace_cache_for_org(oid)
    return org


@app.get("/api/orgs/{org_id}/git-mirror")
def get_org_git_mirror_endpoint(org_id: str, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_member(request, oid)
    if err is not None:
        return err
    _uid, is_admin = _request_user_meta(request)
    role_l = str(role or "").strip().lower()
    if not (is_admin or _is_role_allowed(role_l, _ORG_READ_ROLES)):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")
    try:
        config = get_org_git_mirror_config(oid)
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")
    return {"ok": True, "org_id": oid, "config": config}


@app.patch("/api/orgs/{org_id}/git-mirror")
def patch_org_git_mirror_endpoint(org_id: str, inp: OrgGitMirrorPatchIn, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_role(request, oid, _ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    uid, is_admin = _request_user_meta(request)
    if not _can_manage_workspace(role, is_admin=is_admin):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")

    try:
        current = get_org_git_mirror_config(oid)
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")

    patch = inp.model_dump(exclude_unset=True)
    candidate = {
        "git_mirror_enabled": bool(current.get("git_mirror_enabled")),
        "git_provider": current.get("git_provider"),
        "git_repository": current.get("git_repository"),
        "git_branch": current.get("git_branch"),
        "git_base_path": current.get("git_base_path"),
    }
    if "git_mirror_enabled" in patch:
        candidate["git_mirror_enabled"] = bool(patch.get("git_mirror_enabled"))
    if "git_provider" in patch:
        candidate["git_provider"] = patch.get("git_provider")
    if "git_repository" in patch:
        candidate["git_repository"] = patch.get("git_repository")
    if "git_branch" in patch:
        candidate["git_branch"] = patch.get("git_branch")
    if "git_base_path" in patch:
        candidate["git_base_path"] = patch.get("git_base_path")

    evaluated = evaluate_org_git_mirror_config(candidate)
    try:
        saved = update_org_git_mirror_config(
            oid,
            git_mirror_enabled=bool(evaluated.get("git_mirror_enabled")),
            git_provider=evaluated.get("git_provider"),
            git_repository=evaluated.get("git_repository"),
            git_branch=evaluated.get("git_branch"),
            git_base_path=evaluated.get("git_base_path"),
            git_health_status=evaluated.get("git_health_status"),
            git_health_message=evaluated.get("git_health_message"),
            git_updated_by=uid,
        )
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")

    _audit_log_safe(
        request,
        org_id=oid,
        action="org.git_mirror_update",
        entity_type="org",
        entity_id=oid,
        meta={
            "actor_user_id": uid,
            "git_mirror_enabled": bool(saved.get("git_mirror_enabled")),
            "git_provider": str(saved.get("git_provider") or ""),
            "git_repository": str(saved.get("git_repository") or ""),
            "git_branch": str(saved.get("git_branch") or ""),
            "git_base_path": str(saved.get("git_base_path") or ""),
            "git_health_status": str(saved.get("git_health_status") or "unknown"),
        },
    )
    _invalidate_workspace_cache_for_org(oid)
    return {"ok": True, "org_id": oid, "config": saved}


@app.post("/api/orgs/{org_id}/git-mirror/validate")
def validate_org_git_mirror_endpoint(org_id: str, inp: OrgGitMirrorPatchIn, request: Request) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    role, err = _enterprise_require_org_role(request, oid, _ORG_MEMBER_MANAGE_ROLES)
    if err is not None:
        return err
    _uid, is_admin = _request_user_meta(request)
    if not _can_manage_workspace(role, is_admin=is_admin):
        return _enterprise_error(403, "forbidden", "insufficient_permissions")

    try:
        current = get_org_git_mirror_config(oid)
    except ValueError:
        return _enterprise_error(404, "not_found", "not_found")

    patch = inp.model_dump(exclude_unset=True)
    candidate = {
        "git_mirror_enabled": bool(current.get("git_mirror_enabled")),
        "git_provider": current.get("git_provider"),
        "git_repository": current.get("git_repository"),
        "git_branch": current.get("git_branch"),
        "git_base_path": current.get("git_base_path"),
    }
    if "git_mirror_enabled" in patch:
        candidate["git_mirror_enabled"] = bool(patch.get("git_mirror_enabled"))
    if "git_provider" in patch:
        candidate["git_provider"] = patch.get("git_provider")
    if "git_repository" in patch:
        candidate["git_repository"] = patch.get("git_repository")
    if "git_branch" in patch:
        candidate["git_branch"] = patch.get("git_branch")
    if "git_base_path" in patch:
        candidate["git_base_path"] = patch.get("git_base_path")

    evaluated = evaluate_org_git_mirror_config(candidate)
    return {"ok": True, "org_id": oid, "config": evaluated}


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
    return build_items_count_payload(items, org_id=oid)


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
    _invalidate_workspace_cache_for_org(oid)
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
def list_org_project_sessions(org_id: str, project_id: str, request: Request, mode: str | None = None, view: str | None = None) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    _, _, err = _enterprise_require_project_access(request, oid, project_id)
    if err is not None:
        return err
    raw_mode = mode
    mode = _norm_project_session_mode(mode)
    if raw_mode is not None and mode is None:
        return _enterprise_error(422, "validation_error", "invalid mode; allowed: quick_skeleton, deep_audit")
    view_mode = _norm_project_sessions_view(view)
    if not view_mode:
        return _enterprise_error(422, "validation_error", "invalid view; allowed: summary, full")
    ps = get_project_storage()
    if ps.load(project_id, org_id=oid, is_admin=True) is None:
        return _enterprise_error(404, "not_found", "not_found")
    st = get_storage()
    if view_mode == "summary":
        return st.list_project_session_summaries(project_id=project_id, mode=mode, limit=500, org_id=oid, is_admin=True)
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
    _invalidate_session_caches(sess, org_id=oid)
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
    return build_items_count_payload(items)


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


def _with_invite_links(items_raw: Any, *, base_url: str) -> List[Dict[str, Any]]:
    rows = items_raw if isinstance(items_raw, list) else []
    out: List[Dict[str, Any]] = []
    for row_raw in rows:
        row = dict(row_raw or {}) if isinstance(row_raw, dict) else {}
        token = str(row.get("invite_key") or "").strip()
        status = str(row.get("status") or "").strip().lower()
        row["invite_link"] = _build_invite_link(base_url, token) if (token and status == "pending") else ""
        out.append(row)
    return out


def _pick_current_org_invite(items_raw: Any) -> Dict[str, Any]:
    rows = items_raw if isinstance(items_raw, list) else []
    for row_raw in rows:
        row = row_raw if isinstance(row_raw, dict) else {}
        status = str(row.get("status") or "").strip().lower()
        token = str(row.get("invite_key") or "").strip()
        if status == "pending" and token:
            return dict(row)
    return {}


@app.get("/api/orgs/{org_id}/invites")
@app.get("/api/admin/organizations/{org_id}/invites")
def list_org_invites_endpoint(org_id: str, request: Request):
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    base_url = _resolve_invite_base_url(
        request,
        explicit_base_url=str(_invite_email_config().get("base_url") or ""),
    )
    items = _with_invite_links(list_org_invites(oid, include_inactive=True), base_url=base_url)
    current_invite = _pick_current_org_invite(items)
    return build_items_count_payload(items, current_invite=current_invite)


@app.post("/api/orgs/{org_id}/invites")
@app.post("/api/admin/organizations/{org_id}/invites")
def create_org_invite_endpoint(org_id: str, inp: OrgInviteCreateIn, request: Request):
    oid = str(org_id or "").strip()
    _, err = _enterprise_require_org_role(request, oid, _ORG_INVITE_MANAGE_ROLES)
    if err is not None:
        return err
    email = str(getattr(inp, "email", "") or "").strip().lower()
    full_name = str(getattr(inp, "full_name", "") or "").strip()
    job_title = str(getattr(inp, "job_title", "") or "").strip()
    regenerate = bool(getattr(inp, "regenerate", False))
    try:
        normalized_invite_role = normalize_invite_role(getattr(inp, "role", "viewer"))
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    if not email or "@" not in email:
        return _enterprise_error(422, "validation_error", "valid email is required")
    invite_limit = max(1, _env_int("RL_INVITES_PER_MIN", 20))
    ip_key = str(_request_client_ip(request) or "ip_unknown")
    if not _rate_limit_check(f"invites:create:{oid}:{ip_key}", invite_limit, 60):
        return _enterprise_error(429, "too_many_requests", "too_many_requests")
    uid, is_admin = _request_user_meta(request)
    if not uid:
        return _enterprise_error(401, "unauthorized", "unauthorized")
    ttl_days = normalize_invite_ttl_days(getattr(inp, "ttl_days", 0), _invite_ttl_hours_default())
    email_delivery = _invite_email_enabled()
    staged_regenerate = bool(regenerate and email_delivery)
    if email_delivery:
        ready, reason, _ = _invite_email_config_ready()
        if not ready:
            print(f"[INVITE_EMAIL] unavailable reason={reason}")
            return _enterprise_error(503, "service_unavailable", "invite_email_unavailable")
    try:
        # Identity is pre-created by admin; end-user only activates password on invite redemption.
        ensure_invited_identity(email)
        created = create_org_invite(
            oid,
            email,
            created_by=uid,
            full_name=full_name,
            job_title=job_title,
            role=normalized_invite_role,
            ttl_days=ttl_days,
            regenerate=(regenerate and not staged_regenerate),
            activate_now=(not staged_regenerate),
        )
    except ValueError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    except AuthError as exc:
        return _enterprise_error(422, "validation_error", str(exc))
    token = str(created.pop("token", "") or "")
    response_payload: Dict[str, Any] = {"invite": created}
    invite_base_url = _resolve_invite_base_url(
        request,
        explicit_base_url=str(_invite_email_config().get("base_url") or ""),
    )
    if email_delivery:
        ok_cfg, _, cfg = _invite_email_config_ready()
        if not ok_cfg:
            _ = delete_org_invite(oid, str(created.get("id") or ""))
            return _enterprise_error(503, "service_unavailable", "invite_email_unavailable")
        invite_link = _build_invite_link(
            _resolve_invite_base_url(
                request,
                explicit_base_url=str(cfg.get("base_url") or ""),
            ),
            token,
        )
        try:
            _send_org_invite_email(
                to_email=email,
                org_name=str(created.get("org_name") or created.get("org_id") or oid),
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
                meta={
                    "email": email,
                    "role": str(created.get("role") or ""),
                    "full_name": full_name,
                    "job_title": job_title,
                    "invite_mode": "one_time",
                    "reason": "smtp_send_failed",
                },
            )
            return _enterprise_error(502, "upstream_error", "invite_email_send_failed")
        if staged_regenerate:
            promoted = promote_regenerated_org_invite(
                oid,
                email,
                str(created.get("id") or ""),
                actor=uid,
            )
            if not promoted:
                _ = delete_org_invite(oid, str(created.get("id") or ""))
                return _enterprise_error(500, "server_error", "invite_regenerate_finalize_failed")
            refreshed = get_org_invite_by_id(oid, str(created.get("id") or ""))
            if refreshed:
                created = refreshed
                response_payload["invite"] = refreshed
        response_payload["delivery"] = "email"
    else:
        expose_token = _should_reveal_invite_token(request)
        if expose_token and token:
            response_payload["invite_key"] = token
            response_payload["invite_token"] = token
            response_payload["invite_link"] = _build_invite_link(invite_base_url, token)
        response_payload["delivery"] = "token"
    audit_meta = build_invite_create_audit_meta(
        email=email,
        role=str(created.get("role") or ""),
        full_name=full_name,
        job_title=job_title,
        delivery=str(response_payload.get("delivery") or "token"),
        is_admin=bool(is_admin),
    )
    audit_meta["regenerate"] = regenerate
    _audit_log_safe(
        request,
        org_id=oid,
        action="invite.create",
        entity_type="org_invite",
        entity_id=str(created.get("id") or ""),
        status="ok",
        meta=audit_meta,
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
        if marker in {"invite_not_found"}:
            return _enterprise_error(404, "not_found", "not_found")
        if marker == "invite_revoked":
            return _enterprise_error(409, "conflict", "invite_revoked")
        if marker == "invite_expired":
            return _enterprise_error(410, "gone", "invite_expired")
        if marker in {"invite_already_accepted", "invite_used", "invite_email_mismatch"}:
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
@app.post("/api/admin/organizations/{org_id}/invites/{invite_id}/revoke")
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
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    oid = _request_active_org_id(request) if request is not None else ""
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if oid and not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    st = get_project_storage()
    title = _clean_name(inp.title)
    if not title:
        raise HTTPException(status_code=422, detail="title required")
    sibling_titles = {
        _clean_name(getattr(item, "title", ""))
        for item in st.list(org_id=(oid or None), is_admin=True)
    }
    if title in sibling_titles:
        raise HTTPException(status_code=409, detail="project title already exists")
    executor_user_id = _validate_org_user_assignable(oid or get_default_org_id(), getattr(inp, "executor_user_id", ""))
    pid = st.create(
        title=title,
        passport=inp.passport,
        user_id=user_id,
        org_id=(oid or None),
        executor_user_id=executor_user_id,
    )
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
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    _invalidate_explorer_children_for_project(pid, oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
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
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    proj, oid, _ = _legacy_load_project_scoped(project_id, request)
    st = get_project_storage()
    if not proj:
        raise HTTPException(status_code=404, detail="not found")
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    payload = inp.model_dump(exclude_unset=True)

    if "title" in payload and payload["title"] is not None:
        t = _clean_name(payload["title"])
        if t:
            sibling_titles = {
                _clean_name(getattr(item, "title", ""))
                for item in st.list(org_id=(oid or None), is_admin=True)
                if str(getattr(item, "id", "") or "").strip() != str(getattr(proj, "id", "") or project_id).strip()
            }
            if t in sibling_titles:
                raise HTTPException(status_code=409, detail="project title already exists")
            proj.title = t

    if "passport" in payload and payload["passport"] is not None:
        if not isinstance(payload["passport"], dict):
            raise HTTPException(status_code=400, detail="passport must be an object")
        merged = dict(proj.passport or {})
        merged.update(payload["passport"])
        proj.passport = merged

    if "executor_user_id" in payload:
        proj.executor_user_id = _validate_org_user_assignable(oid or get_default_org_id(), payload.get("executor_user_id")) or None

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
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    _invalidate_explorer_children_for_project(str(getattr(proj, "id", "") or project_id), oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
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
    _invalidate_workspace_cache_for_org(oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    _invalidate_explorer_children_for_project(str(getattr(proj, "id", "") or project_id), oid or str(getattr(proj, "org_id", "") or get_default_org_id()))
    return proj.model_dump()


def _build_legacy_route_export() -> Tuple[APIRoute, ...]:
    return tuple(route for route in app.router.routes if isinstance(route, APIRoute))


LEGACY_ROUTE_EXPORT: Tuple[APIRoute, ...] = _build_legacy_route_export()


def export_legacy_routes() -> Tuple[APIRoute, ...]:
    return LEGACY_ROUTE_EXPORT
