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

from fastapi import FastAPI, HTTPException, Query, Request, Response, Body
from pydantic import BaseModel
from fastapi.routing import APIRoute
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse

from .exporters.mermaid import render_mermaid
from .migration_state import get_migration_state
from .exporters.yaml_export import dump_yaml, session_to_process_dict
from .glossary import normalize_kind, slugify_canon, upsert_term
from .models import Node, Edge, Question, ReportVersion, Session, Project, CreateProjectIn, UpdateProjectIn
from .analytics import compute_analytics
from .analytics_read_model import refresh_analytics_for_session
from .camunda_meta_utils import extract_camunda_extensions_from_bpmn_xml
from .normalizer import load_seed_glossary, normalize_nodes
from .resources import build_resources_report
from .storage import (
    Storage,
    SessionTitleConflictError,
    _is_integrity_error,
    get_storage,
    get_project_storage,
    list_user_org_memberships,
    list_user_groups,
    resolve_active_org_id,
    get_user_org_role,
    get_default_org_id,
    count_org_records,
    create_org_record,
    get_org_git_mirror_config,
    is_org_active,
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
from .ai.prompt_registry import get_active_prompt, seed_existing_ai_prompts
from .redis_lock import acquire_session_lock
from .cache import session_cache
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
from .auth import (  # noqa: F401  # re-export facade (PR-6 auth)
    AUTH_PUBLIC_PATHS,
    _RATE_LIMIT_BUCKETS,
    _RATE_LIMIT_LOCK,
    _clear_refresh_cookie,
    _rate_limit_check,
    _set_refresh_cookie,
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
    NotesExtractionApplyIn,
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
from .overlay_cache import get_overlay, invalidate_overlay
from . import overlay_cache
from . import storage as _storage_mod
from .services import auth_service as _auth_service
from .services.audit import _audit_log_safe
from .services.auth_service import (  # noqa: F401  # re-export facade (PR-6 auth)
    auth_invite_activate,
    auth_invite_preview,
    auth_login,
    auth_logout,
    auth_me,
    auth_refresh,
)
from .utils.auth_helpers import set_refresh_cookie, clear_refresh_cookie
from .utils.session_helpers import (
    _build_server_last_write_payload,
    _mark_diagram_truth_write,
    _require_diagram_cas_or_409,
    _resolve_actor_context,
    _resolve_base_diagram_state_version,
    _save_session_with_cas,
    raise_session_not_found,
)
from .shared.text_utils import (  # noqa: F401  # re-export facade (PR-5)
    _clean_name,
    _to_epoch_ms,
    _looks_like_technical_actor_id,
    _resolve_actor_label_from_user,
    _redact_notes_preview_message,
    _ln_tag,
    _ws_path,
    _canon_path,
    _primitive_path_value,
    _normalize_sequence_key,
)
from .shared.coerce import (  # noqa: F401  # re-export facade (PR-5)
    _env_bool,
    _env_int,
    _coerce_bool,
    _to_non_negative_int,
    _as_dict_obj,
    _as_list_obj,
    _safe_json_dict,
    _norm_project_sessions_view,
    _normalize_session_status,
    _notes_apply_flag,
    _llm_question_status_to_interview,
    _is_retryable_report_generation_error,
    _request_client_ip,
    _auth_error_response,
    _ensure_dict_at_path,
)
from .shared.entities import (  # noqa: F401  # re-export facade (PR-5)
    _safe_model_dump,
    _safe_model_dump_list,
    _entity_key,
    _stable_entity_signature,
    _list_diff_by_id,
    _role_diff,
    _edge_identity,
    _merge_nodes,
    _merge_hybrid_layer,
    _ensure_loss_dict,
)
from .shared.robot_meta import (  # noqa: F401  # re-export facade (PR-5)
    _robot_meta_as_text,
    _robot_meta_as_nullable_text,
    _robot_meta_as_non_negative_int,
    _robot_meta_as_nullable_non_negative_int,
    _stable_robot_meta_value,
    _normalize_robot_meta_v1,
    _normalize_robot_meta_map,
    _is_legacy_seed_bpmn,
)
from .shared.payloads import (  # noqa: F401  # re-export facade (PR-5)
    _set_latest_path_report_pointer,
    _clear_latest_path_report_pointer,
    _report_version_summary,
    _report_version_detail_payload,
    _workspace_needs_attention_count,
    _workspace_parse_owner_ids,
    _build_invite_link,
    _pick_current_org_invite,
    _with_invite_links,
)
from .orgs import (  # noqa: F401  # re-export facade (PR-7 orgs)
    _ORG_AUDIT_READ_ROLES,
    _ORG_EDITOR_ROLES,
    _ORG_INVITE_MANAGE_ROLES,
    _ORG_MEMBER_MANAGE_ROLES,
    _ORG_READ_ROLES,
    _ORG_REPORT_DELETE_ROLES,
    _ORG_WRITE_ROLES,
    _accept_org_invite_response,
    _audit_retention_days,
    _enrich_members_with_email,
    _invalidate_workspace_cache_for_org,
    _invite_cleanup_keep_days,
    _invite_email_config,
    _invite_email_config_ready,
    _invite_email_enabled,
    _invite_ttl_hours_default,
    _request_org_candidates,
    _require_org_active_for_writes,
    _resolved_org_for_cache,
    _resolve_invite_base_url,
    _send_org_invite_email,
    _should_reveal_invite_token,
    _user_is_member_of_org,
    _validate_invite_email_config_on_boot,
    accept_invite_endpoint,
    accept_org_invite_endpoint,
    build_org_session_report,
    cleanup_org_audit_endpoint,
    cleanup_org_invites_endpoint,
    create_org_endpoint,
    create_org_invite_endpoint,
    create_org_project,
    create_org_project_member,
    create_org_project_session,
    delete_org_project_member,
    delete_org_session_report_version,
    get_org_git_mirror_endpoint,
    get_org_project,
    get_org_session_report_version,
    list_org_audit_endpoint,
    list_org_invites_endpoint,
    list_org_members_endpoint,
    list_org_project_members,
    list_org_project_sessions,
    list_org_projects,
    list_org_session_report_versions,
    list_orgs_endpoint,
    patch_org_endpoint,
    patch_org_member_endpoint,
    patch_org_project_member,
    revoke_org_invite_endpoint,
)
from .projects import (  # noqa: F401  # re-export facade (PR-8 projects)
    _invalidate_explorer_children_for_project,
    _legacy_load_project_scoped,
    create_project,
    create_project_session,
    delete_project_api,
    get_project,
    list_project_sessions,
    list_projects,
    patch_project,
    put_project,
)
from .sessions_core import (  # noqa: F401  # re-export facade (PR-9 sessions-core)
    _SESSION_PRESENCE_CLIENT_ID_RE,
    _SESSION_PRESENCE_SURFACE_RE,
    _SESSION_PRESENCE_TTL_SECONDS,
    _broadcast_session_deleted,
    _invalidate_session_caches,
    _invalidate_session_open_cache_for_session,
    _invalidate_tldr_cache_for_session,
    _legacy_load_session_scoped,
    _normalize_session_presence_client_id,
    _normalize_session_presence_surface,
    _session_api_dump,
    create_session,
    delete_session_api,
    get_session,
    leave_session_presence_api,
    patch_session,
    patch_session,
    put_session,
    touch_session_presence_api,
)
from .services.session_recompute import _merge_question_states, _recompute_session  # noqa: F401  # re-export facade (PR-pre)
from .notes_extraction import (  # noqa: F401  # re-export facade (PR-10A notes-extraction)
    _NOTES_EXTRACTION_MODULE_ID,
    _edge_diff,
    _edge_key,
    _entity_list_signature,
    _merge_selected_edges,
    _merge_selected_nodes,
    _notes_apply_require_cas,
    _notes_preview_response_from_extraction,
    _notes_preview_scope,
    _record_notes_preview_execution_safe,
    _sanitize_notes_preview_warnings,
    post_notes,
    post_notes_extraction_apply,
    post_notes_extraction_preview,
)
from .ai_questions import (  # noqa: F401  # re-export facade (PR-10B ai-questions)
    _AI_QUESTIONS_ELEMENT_MODES,
    _ai_questions_actor_user_id,
    _ai_questions_active_prompt,
    _ai_questions_module_id,
    _ai_questions_scope,
    _collect_node_llm_questions,
    _merge_interview_analysis_namespace,
    _preserve_current_interview_analysis_before_save,
    _prune_node_llm_questions,
    _record_ai_questions_execution_safe,
    _sync_interview_ai_questions_for_node,
    ai_questions,
)
from .ai.process_analysis import llm_process_analysis  # noqa: F401  # LLM1
from .session_answers import (  # noqa: F401  # re-export facade (PR-10C session-answers)
    _apply_answer,
    _apply_target_to_node,
    _map_disposition_answer,
    answer,
    answer_v2,
)
from .sessions_graph import (  # noqa: F401  # re-export facade (PR-11 sessions-graph)
    add_edge,
    add_node,
    delete_edge,
    delete_node,
    get_session_graph,
    patch_node,
)
# /api/auth/* handler implementations live in app/services/auth_service.py (PR-6);
# they are re-registered on this app below (see "auth" route registrations).


app = FastAPI(title="Food Process Copilot MVP")
from .metrics import start_polling
start_polling(overlay_cache.r)
logger = logging.getLogger(__name__)
_auth_logger = logging.getLogger("auth_debug")

_ORG_PROJECT_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin", "project_manager"}
_ORG_TEMPLATE_WRITE_ROLES = {"org_owner", "org_admin", "project_manager"}
_WORKSPACE_ADMIN_ROLES = {"org_owner", "org_admin"}
_WORKSPACE_EDITOR_ROLES = {"org_owner", "org_admin", "project_manager", "editor"}
_WORKSPACE_VIEWER_ROLES = {"viewer", "org_viewer", "auditor"}


def _to_epoch_iso(value: Any) -> str:
    ts_ms = _to_epoch_ms(value)
    if ts_ms <= 0:
        return ""
    try:
        return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat()
    except Exception:
        return ""


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


  # DEPRECATED: moved to utils/authz.py
def _practical_role_for_org(role_raw: Any, is_admin: bool = False) -> str:
    if bool(is_admin):
        return "admin"
    role = str(role_raw or "").strip().lower()
    if role in _WORKSPACE_ADMIN_ROLES:
        return "admin"
    if role in _WORKSPACE_EDITOR_ROLES:
        return "editor"
    return "viewer"


  # DEPRECATED: moved to utils/authz.py
def _can_manage_workspace(role_raw: Any, is_admin: bool = False) -> bool:
    return _practical_role_for_org(role_raw, is_admin=is_admin) == "admin"


  # DEPRECATED: moved to utils/authz.py
def _can_edit_workspace(role_raw: Any, is_admin: bool = False) -> bool:
    return _practical_role_for_org(role_raw, is_admin=is_admin) in {"admin", "editor"}




  # DEPRECATED: moved to utils/authz.py
def _can_delete_workspace_content(role_raw: Any, is_admin: bool = False) -> bool:
    return _practical_role_for_org(role_raw, is_admin=is_admin) == "admin"


def _validate_session_status_transition(current_raw: Any, next_raw: Any, *, role_raw: Any, is_admin: bool = False) -> str:
    return _validate_session_status_transition_base(
        current_raw,
        next_raw,
        can_edit=_can_edit_workspace(role_raw, is_admin=is_admin),
        can_archive=_can_manage_workspace(role_raw, is_admin=is_admin),
    )


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


def _compute_overlays_json(sess: Session, xml_text: str) -> list[dict[str, Any]]:
    xml = _overlay_interview_annotations_on_bpmn_xml(sess, xml_text)
    if not xml:
        return []
    try:
        root = ET.fromstring(xml)
    except Exception:
        return []
    ns_map: dict[str, str] = {}
    for el in root.iter():
        tag = str(getattr(el, "tag", "") or "")
        if tag.startswith("{") and "}" in tag:
            uri = tag[1:tag.index("}")]
            if "bpmn" not in ns_map and "omg.org/spec/BPMN/20100524/MODEL" in uri:
                ns_map["bpmn"] = uri
            if "bpmndi" not in ns_map and "omg.org/spec/BPMN/20100524/DI" in uri:
                ns_map["bpmndi"] = uri
            if "dc" not in ns_map and "omg.org/spec/DD/20100524/DC" in uri:
                ns_map["dc"] = uri
    texts: dict[str, str] = {}
    for el in root.iter():
        tag = str(getattr(el, "tag", "") or "")
        local = tag.rsplit("}", 1)[-1] if "}" in tag else tag
        if local == "textAnnotation":
            ann_id = str(el.attrib.get("id") or "")
            if ann_id.startswith("FPC_TextAnnotation_"):
                t = el.find(f"{{{ns_map.get('bpmn', '')}}}text") if ns_map.get("bpmn") else None
                texts[ann_id] = (t.text or "") if t is not None else ""
    overlays: list[dict[str, Any]] = []
    for el in root.iter():
        tag = str(getattr(el, "tag", "") or "")
        local = tag.rsplit("}", 1)[-1] if "}" in tag else tag
        if local == "BPMNShape":
            bpmn_el = str(el.attrib.get("bpmnElement") or "")
            if bpmn_el.startswith("FPC_TextAnnotation_"):
                bounds = None
                for ch in el:
                    ch_tag = str(getattr(ch, "tag", "") or "")
                    ch_local = ch_tag.rsplit("}", 1)[-1] if "}" in ch_tag else ch_tag
                    if ch_local == "Bounds":
                        bounds = ch
                        break
                if bounds is not None:
                    overlays.append({
                        "id": bpmn_el,
                        "node_id": bpmn_el.replace("FPC_TextAnnotation_", ""),
                        "x": float(bounds.attrib.get("x", "0") or 0),
                        "y": float(bounds.attrib.get("y", "0") or 0),
                        "width": float(bounds.attrib.get("width", "0") or 0),
                        "height": float(bounds.attrib.get("height", "0") or 0),
                        "text": texts.get(bpmn_el, ""),
                        "style": {"bg": "#fff9c4", "color": "#333", "fontSize": 12, "border": "1px solid #fbc02d"},
                        "meta": {},
                    })
    return overlays












_DIAGRAM_TRUTH_PATCH_KEYS = {"bpmn_meta", "interview", "nodes", "edges", "questions"}
_DIAGRAM_TRUTH_PUT_CHANGED_KEYS = ["interview", "nodes", "edges", "questions", "bpmn_meta"]


def _reject_draft_graph_write_on_xml_session(sess: Session, explicit_data: Dict[str, Any]) -> None:
    """Audit P6: the nodes/edges draft model is dead for BPMN-XML-truth sessions
    (truth lives in bpmn_xml; nodes_json/edges_json stay empty). Previously such
    writes returned 200 but were silently dropped. Reject them explicitly so
    API consumers do not mistake a no-op for persistence.
    Sessions without bpmn_xml keep the legacy draft-model behavior.
    """
    xml = str(getattr(sess, "bpmn_xml", "") or "").strip()
    if not xml:
        return
    requested = [key for key in ("nodes", "edges") if explicit_data.get(key)]
    if not requested:
        return
    raise HTTPException(
        status_code=409,
        detail={
            "code": "DRAFT_GRAPH_READ_ONLY_XML_TRUTH",
            "session_id": str(getattr(sess, "id", "") or ""),
            "keys": requested,
            "message": "nodes/edges are not persisted for BPMN-XML sessions; use PUT /api/sessions/{id}/bpmn",
        },
    )


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


def _next_report_version(by_path: Dict[str, List[Dict[str, Any]]], path_id: str) -> int:
    rows = by_path.get(path_id) or []
    max_ver = 0
    for row in rows:
        try:
            max_ver = max(max_ver, int(row.get("version") or 0))
        except Exception:
            continue
    return max_ver + 1


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


_BPMN_ACTIVITY_TAGS: Set[str] = {
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
}


def _count_bpmn_activities(xml_text: str) -> int:
    """Count BPMN activity elements (tasks + callActivity + subProcess)."""
    raw = str(xml_text or "").strip()
    if not raw:
        return 0
    try:
        root = ET.fromstring(raw)
    except Exception:
        return 0
    count = 0
    for el in root.iter():
        if _ln_tag(str(getattr(el, "tag", "") or "")) in _BPMN_ACTIVITY_TAGS:
            count += 1
    return count


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


def _merge_hybrid_v2(current: Any, incoming: Any) -> Any:
    if isinstance(incoming, dict):
        incoming_size = _hybrid_v2_payload_size(incoming)
        current_size = _hybrid_v2_payload_size(current)
        if incoming_size <= 0 < current_size:
            return current
        return incoming
    return current


def _merge_drawio(current: Any, incoming: Any) -> Any:
    if isinstance(incoming, dict):
        incoming_size = _drawio_payload_size(incoming)
        current_size = _drawio_payload_size(current)
        if incoming_size <= 0 < current_size:
            return current
        return incoming
    return current


def _merge_and_normalize_bpmn_meta(
    current_meta: Any,
    incoming_meta: Any,
    xml_text: str,
    flow_ctx: Dict[str, Any],
) -> Tuple[Dict[str, Any], bool]:
    """Merge incoming bpmn_meta on top of current meta and normalize.

    Uses the XML payload as the authoritative source for Camunda extension
    properties. Returns the normalized meta dict and a flag indicating whether
    the caller requested an auto-pass state write.
    """
    xml_str = str(xml_text or "").strip()
    flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
    node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()
    allowed_flow_ids = flow_ids if xml_str else None
    allowed_node_ids = node_ids if xml_str else None

    current_meta = _normalize_bpmn_meta(
        current_meta,
        allowed_flow_ids=allowed_flow_ids,
        allowed_node_ids=allowed_node_ids,
    )

    auto_pass_state_write_requested = False
    if isinstance(incoming_meta, dict):
        auto_pass_state_write_requested = "auto_pass_v1" in incoming_meta
        raw_bpmn_meta = {
            **current_meta,
            **incoming_meta,
            "version": incoming_meta.get("version", current_meta.get("version", 1)),
            "flow_meta": incoming_meta.get("flow_meta", current_meta.get("flow_meta", {})),
            "node_path_meta": incoming_meta.get(
                "node_path_meta", current_meta.get("node_path_meta", {})
            ),
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
            "hybrid_layer_by_element_id": _merge_hybrid_layer(
                current_meta.get("hybrid_layer_by_element_id", {}),
                incoming_meta.get("hybrid_layer_by_element_id"),
            ),
            "hybrid_v2": _merge_hybrid_v2(
                current_meta.get("hybrid_v2", {}),
                incoming_meta.get("hybrid_v2"),
            ),
            "drawio": _merge_drawio(
                current_meta.get("drawio", {}),
                incoming_meta.get("drawio"),
            ),
        }
    else:
        raw_bpmn_meta = current_meta

    normalized_meta = _normalize_bpmn_meta(
        raw_bpmn_meta,
        allowed_flow_ids=allowed_flow_ids,
        allowed_node_ids=allowed_node_ids,
    )
    normalized_meta["flow_meta"] = _enforce_gateway_tier_constraints(
        dict(normalized_meta.get("flow_meta") or {}),
        outgoing_by_source=flow_ctx.get("outgoing_by_source") if isinstance(flow_ctx, dict) else {},
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node") if isinstance(flow_ctx, dict) else {},
    )
    # Properties are derived from the XML payload, not from sidecar bpmn_meta.
    normalized_meta.pop("camunda_extensions_by_element_id", None)
    if xml_str:
        normalized_meta["camunda_extensions_by_element_id"] = extract_camunda_extensions_from_bpmn_xml(xml_str)
    return normalized_meta, auto_pass_state_write_requested


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
    # F3: degraded-старт entrypoint (миграции не применились) виден наружу.
    # ok=False — версия БД точно старше head; ok=None — неизвестно (не PG),
    # статус НЕ понижаем.
    migrations = get_migration_state()
    if migrations.get("ok") is False and overall_status == "ok":
        overall_status = "degraded"
    return {
        "ok": True,
        "status": overall_status,
        "redis": redis,
        "migrations": migrations,
    }


@app.get("/api/health")
def api_health():
    payload = health()
    payload["api"] = "ready"
    return payload


@app.get("/health/overlay-cache")
def health_overlay_cache():
    from fastapi.responses import JSONResponse
    from .celery_app import app as celery_app
    from .overlay_cache import r as redis_client
    from .storage import _get_pg_pool
    checks={"redis":"fail","celery":"fail","postgres":"fail"}
    try:redis_client.ping();checks["redis"]="ok"
    except Exception:pass
    try:active=celery_app.control.inspect(timeout=2).active()or{};checks["celery"]="ok"if len(active)>0 else"fail"
    except Exception:pass
    try:
        pool=_get_pg_pool()
        with pool.connection() as con:
            con.execute("SELECT 1")
            con.commit()
        checks["postgres"]="ok"
    except Exception:pass
    degraded=any(v=="fail"for v in checks.values())
    return JSONResponse(content={**checks,"degraded":degraded},status_code=503 if degraded else 200)


@app.get("/metrics")
def metrics_endpoint():
    from .metrics import metrics
    return Response(content=metrics(), media_type="text/plain")


# /api/auth/* handlers live in app/services/auth_service.py (PR-6 auth) and are
# re-registered here so LEGACY_ROUTE_EXPORT keeps the same routes, methods,
# registration order and endpoint objects as before the extraction.
app.post("/api/auth/login", response_model=AuthTokenOut)(auth_login)
app.post("/api/auth/refresh", response_model=AuthTokenOut)(auth_refresh)
app.post("/api/auth/logout")(auth_logout)
app.get("/api/auth/me", response_model=AuthMeOut)(auth_me)
app.post("/api/invite/resolve")(auth_invite_preview)
app.post("/api/auth/invite/preview")(auth_invite_preview)
app.post("/api/invite/activate")(auth_invite_activate)
app.post("/api/auth/invite/activate")(auth_invite_activate)


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
# /api/sessions/* handler implementations live in app/sessions_core.py
# (PR-9 sessions-core) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.post("/api/sessions")(create_session)




# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.


@app.get("/api/sessions/{session_id}/tldr")
  # DEPRECATED: moved to routers/sessions.py + session_service.py
def get_session_tldr(session_id: str, request: Request = None) -> Dict[str, Any]:
    sess, _, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise_session_not_found(session_id)
    sid = str(getattr(sess, "id", "") or session_id).strip()
    cached = cache_get_json(tldr_cache_key(sid))
    if isinstance(cached, dict):
        return cached
    payload = _build_session_tldr_payload(sess)
    cache_set_json(tldr_cache_key(sid), payload, ttl_sec=60)
    return payload


@app.get("/api/sessions/{session_id}/analytics")
  # DEPRECATED: moved to routers/sessions.py + session_service.py
def get_session_analytics(session_id: str, request: Request = None) -> dict:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        raise_session_not_found(session_id)
    if not getattr(sess, "analytics", None):
        sess = _recompute_session(sess)
        st.save(sess, user_id=user_id, org_id=oid, is_admin=True)
    return {"session_id": sess.id, "analytics": getattr(sess, "analytics", {})}


# /api/sessions/* handler implementations live in app/sessions_core.py
# (PR-9 sessions-core) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.patch("/api/sessions/{session_id}")(patch_session)


# /api/projects/* handler implementations live in app/projects.py (PR-8 projects)
# and are re-registered here so LEGACY_ROUTE_EXPORT keeps the same routes,
# methods, registration order and endpoint objects as before the extraction.
app.delete("/api/projects/{project_id}")(delete_project_api)


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.


# /api/sessions/* handler implementations live in app/sessions_core.py
# (PR-9 sessions-core) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.delete("/api/sessions/{session_id}")(delete_session_api)


# /api/sessions/* handler implementations live in app/sessions_core.py
# (PR-9 sessions-core) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.put("/api/sessions/{session_id}")(put_session)

@app.post("/api/sessions/{session_id}/recompute")
  # DEPRECATED: moved to routers/sessions.py + session_service.py
def recompute(session_id: str) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}
    s = _recompute_session(s)
    st.save(s)
    try:
        refresh_analytics_for_session(session_id, str(getattr(s, "org_id", "") or get_default_org_id()))
    except Exception:
        pass
    return s.model_dump()


# /api/sessions/* handler implementations live in app/ai_questions.py
# (PR-10B ai-questions) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.post("/api/sessions/{session_id}/ai/questions")(ai_questions)

# LLM1 — анализ процесса через LLM-гейтвей (complete_cached, feature=process_analysis)
app.post("/api/sessions/{session_id}/llm/analysis")(llm_process_analysis)


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

    prompt_item: Dict[str, Any] = {}
    try:
        seed_existing_ai_prompts()
        prompt_item = _ai_questions_active_prompt(
            "ai.questions.prep",
            {
                "org_id": get_default_org_id(),
                "project_id": str(getattr(inp, "project_id", "") or "").strip(),
            },
        )
    except Exception:
        prompt_item = {}
    prompt_template = str((prompt_item or {}).get("template") or "")

    try:
        result = generate_session_title_questions(
            title=title,
            api_key=api_key,
            base_url=base_url,
            prompt_template=prompt_template,
            min_questions=min_questions,
            max_questions=max_questions,
        )
        if isinstance(result, dict):
            result.setdefault("module_id", "ai.questions.prep")
            result.setdefault("prompt_source", "registry" if prompt_template else "code_fallback")
            if prompt_item:
                result.setdefault("prompt_id", str(prompt_item.get("prompt_id") or ""))
                result.setdefault("prompt_version", str(prompt_item.get("version") or ""))
        return result
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


# /api/sessions/* handler implementations live in app/notes_extraction.py
# (PR-10A notes-extraction) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.post("/api/sessions/{session_id}/notes")(post_notes)
app.post("/api/sessions/{session_id}/notes/extraction-apply")(post_notes_extraction_apply)
app.post("/api/sessions/{session_id}/notes/extraction-preview")(post_notes_extraction_preview)


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


# /api/sessions/* handler implementations live in app/session_answers.py
# (PR-10C session-answers) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.post("/api/sessions/{session_id}/answer")(answer)
app.post("/api/sessions/{session_id}/answers")(answer_v2)




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


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
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


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
@app.patch("/api/sessions/{session_id}/bpmn_meta")
def session_bpmn_meta_patch(session_id: str, inp: BpmnMetaPatchIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    # Scoped load (как у session_bpmn_save): plain st.load() без request-scope
    # даёт ложный not-found для сессий с owner_user_id.
    s, _, _ = _legacy_load_session_scoped(session_id, request)
    if not s:
        raise_session_not_found(session_id)
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


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
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






# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
@app.get("/api/sessions/{session_id}/bpmn")
def session_bpmn_export(
    session_id: str,
    raw: int = Query(0, description="1 = return stored bpmn_xml as-is (no regenerate/overlay)"),
    include_overlay: int = Query(1, description="1 = overlay interview annotations (ignored when raw=1)"),
    zoom: float = Query(1.0),
    pan_x: float = Query(0.0),
    pan_y: float = Query(0.0),
    request: Request = None,
):
    st = get_storage()
    s, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not s:
        return Response(content="not found", media_type="text/plain", status_code=404)

    raw_mode = bool(int(raw or 0))
    overlay_mode = bool(int(include_overlay or 0))
    if overlay_mode and not raw_mode:
        result = get_overlay(session_id, zoom, pan_x, pan_y, request=request)
        if result.status == 200:
            return Response(content=result.body, media_type="application/xml", headers={"Cache-Control": "max-age=60"})
        if result.status == 202:
            return JSONResponse(content=result.body, status_code=202)
        if result.status == 503:
            return JSONResponse(content=result.body, status_code=503, headers={"Retry-After": "2"})

    xml_stored = str(getattr(s, "bpmn_xml", "") or "")
    has_graph = len(getattr(s, "nodes", []) or []) > 0 or len(getattr(s, "edges", []) or []) > 0
    current_graph_fp = _session_graph_fingerprint(s)
    stored_graph_fp = str(getattr(s, "bpmn_graph_fingerprint", "") or "").strip()
    raw_mode = bool(int(raw or 0))
    overlay_mode = bool(int(include_overlay or 0))

    # Audit P5: GET /bpmn is READ-ONLY. When the stored fingerprint diverges,
    # the XML is regenerated in memory and returned, but NEVER persisted here
    # (the old `_persist_regenerated` wrote to the DB from a read request
    # without lock/CAS/cache-invalidation and created export_regenerate
    # revisions). Persistence happens only on explicit save paths.

    if raw_mode:
        if xml_stored.strip():
            xml = xml_stored
        elif not has_graph:
            xml = ""
        else:
            from .exporters.bpmn import export_session_to_bpmn_xml
            xml = export_session_to_bpmn_xml(s)
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


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
@app.get("/api/sessions/{session_id}/overlays")
def session_overlays(session_id: str, request: Request = None):
    s, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not s:
        raise HTTPException(status_code=404, detail="not found")
    from .overlay_cache import get_overlays_json
    return JSONResponse(content=get_overlays_json(session_id, request=request))


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


def _plan_bpmn_revision_snapshot_if_needed(
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
    """Decide whether a bpmn_versions snapshot is needed and return a plan dict
    suitable for ``Storage.save(..., bpmn_snapshot=...)`` (inserted in the same
    transaction as the session row — audit P4). Returns None when no snapshot
    is needed.
    """
    prev = str(previous_xml or "")
    nxt = str(next_xml or "")
    if not nxt.strip():
        return None
    action = str(source_action or "").strip().lower() or "manual_save"
    # Property-only saves do not create user-facing BPMN revision snapshots.
    if action.startswith("property_"):
        return None
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
    return {
        "bpmn_xml": nxt,
        "source_action": action,
        "diagram_state_version": max(0, int(diagram_state_version or 0)),
        "session_payload_hash": session_hash,
        "session_version": int(getattr(session, "version", 0) or 0),
        "session_updated_at": int(getattr(session, "updated_at", 0) or 0),
        "created_by": str(created_by or ""),
        "org_id": str(org_id or ""),
        "import_note": str(import_note or ""),
    }


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
    plan = _plan_bpmn_revision_snapshot_if_needed(
        storage=storage,
        session=session,
        previous_xml=previous_xml,
        next_xml=next_xml,
        source_action=source_action,
        created_by=created_by,
        org_id=org_id,
        import_note=import_note,
        diagram_state_version=diagram_state_version,
    )
    if plan is None:
        return None
    return storage.create_bpmn_version_snapshot(
        str(getattr(session, "id", "") or "").strip(),
        bpmn_xml=plan["bpmn_xml"],
        source_action=plan["source_action"],
        diagram_state_version=plan["diagram_state_version"],
        session_payload_hash=plan["session_payload_hash"],
        session_version=plan["session_version"],
        session_updated_at=plan["session_updated_at"],
        created_by=plan["created_by"],
        org_id=org_id,
        import_note=plan["import_note"],
    )


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
@app.put("/api/sessions/{session_id}/bpmn")
def session_bpmn_save(session_id: str, inp: BpmnXmlIn, request: Request = None) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None

    sess_pre, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess_pre:
        raise_session_not_found(session_id)
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
            raise_session_not_found(session_id)
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
        normalized_meta, auto_pass_state_write_requested = _merge_and_normalize_bpmn_meta(
            getattr(s, "bpmn_meta", {}),
            inp.bpmn_meta,
            xml,
            flow_ctx,
        )
        s.bpmn_xml = xml
        s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
        s.activity_count = _count_bpmn_activities(xml)
        s.bpmn_graph_fingerprint = _session_graph_fingerprint(s)
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
        bpmn_version_snapshot = _plan_bpmn_revision_snapshot_if_needed(
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

        # Sync child BPMN back into the parent subprocess XML so that parent export
        # does not contain a stale fragment.  This is best-effort: if the parent is
        # being edited concurrently the update may be skipped, but the child save
        # itself still succeeds.
        parent_session_id = str(getattr(s, "parent_session_id", "") or "").strip()
        element_id_in_parent = str(getattr(s, "element_id_in_parent", "") or "").strip()
        parent_synced = False
        if parent_session_id and element_id_in_parent:
            try:
                from app.services.bpmn_navigation import re_embed_child_xml_into_parent
                parent = st.load(parent_session_id, user_id=user_id, org_id=oid_locked, is_admin=True)
                if parent:
                    parent_xml = str(getattr(parent, "bpmn_xml", "") or "")
                    new_parent_xml = re_embed_child_xml_into_parent(parent_xml, element_id_in_parent, xml)
                    if new_parent_xml and new_parent_xml != parent_xml:
                        previous_parent_xml = parent_xml
                        parent.bpmn_xml = new_parent_xml
                        parent.bpmn_xml_version = int(getattr(parent, "version", 0) or 0)
                        parent.activity_count = _count_bpmn_activities(new_parent_xml)
                        parent.bpmn_graph_fingerprint = _session_graph_fingerprint(parent)
                        _mark_diagram_truth_write(
                            parent,
                            changed_keys=["bpmn_xml"],
                            actor_user_id=user_id,
                            actor_label=_resolve_actor_label_from_user(user, user_id),
                        )
                        st.save(parent, user_id=user_id, org_id=oid_locked, is_admin=True)
                        _invalidate_session_caches(
                            parent,
                            session_id=parent.id,
                            org_id=getattr(parent, "org_id", "") or get_default_org_id(),
                        )
                        parent_synced = True
                        logger.info(
                            "subprocess_parent_synced: child=%s parent=%s element=%s bytes_before=%d bytes_after=%d",
                            session_id,
                            parent_session_id,
                            element_id_in_parent,
                            len(previous_parent_xml),
                            len(new_parent_xml),
                        )
            except Exception as exc:
                logger.warning(
                    "subprocess_parent_sync_failed: child=%s parent=%s element=%s error=%s",
                    session_id,
                    parent_session_id,
                    element_id_in_parent,
                    exc,
                    exc_info=True,
                )

        # SQL-CAS + snapshot in one transaction (audit P2/P4): a concurrent
        # writer between the in-memory CAS check and this write yields 409
        # instead of a silent last-writer-wins overwrite.
        _save_session_with_cas(
            st,
            s,
            client_base_version=client_base_diagram_state_version,
            user_id=user_id,
            org_id=oid_locked,
            is_admin=True,
            bpmn_snapshot=bpmn_version_snapshot,
        )
        try:
            invalidate_overlay(session_id)
        except Exception:
            pass
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
            "parent_session_id": parent_session_id,
            "element_id_in_parent": element_id_in_parent,
            "parent_synced": parent_synced,
        }
        if bpmn_version_snapshot is not None:
            out["bpmn_version_snapshot"] = bpmn_version_snapshot
        return out
    finally:
        lock.release()


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
@app.get("/api/sessions/{session_id}/bpmn/versions")
def session_bpmn_versions_list(
    session_id: str,
    request: Request = None,
    limit: int = Query(10, description="Max versions to return"),
    offset: int = Query(0, description="Offset for pagination"),
    include_xml: int = Query(0, description="1 = include bpmn_xml payload"),
    include_technical: bool = Query(False, description="Include technical versions"),
) -> Dict[str, Any]:
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    try:
        limit = int(limit)
    except Exception:
        limit = 10
    try:
        offset = int(offset)
    except Exception:
        offset = 0
    try:
        include_xml = int(include_xml)
    except Exception:
        include_xml = 0
    include_technical = bool(include_technical)
    st = get_storage()
    sid = str(getattr(sess, "id", "") or session_id)
    include_xml_mode = include_xml == 1
    rows = st.list_bpmn_versions(
        sid,
        org_id=oid,
        limit=limit,
        offset=offset,
        include_xml=include_xml_mode,
        include_technical=include_technical,
    )
    user_facing_version_numbers = st.list_bpmn_version_numbers_by_source_actions(
        sid,
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

    if include_technical:
        total_count = st.count_bpmn_versions(sid, org_id=oid)
        user_facing_count = len(user_facing_version_numbers)
    else:
        total_count = st.count_bpmn_versions(
            sid,
            org_id=oid,
            source_actions=_USER_FACING_BPMN_VERSION_ACTIONS,
        )
        user_facing_count = total_count

    current_offset = max(0, offset)
    has_more = (current_offset + len(items)) < total_count

    current_session_payload_hash = session_version_payload_hash(sess)
    latest_user_version = _latest_user_facing_bpmn_version(
        st,
        sid,
        org_id=oid,
        include_xml=False,
    )
    latest_session_payload_hash = str((latest_user_version or {}).get("session_payload_hash") or "").strip()
    return {
        "ok": True,
        "session_id": sid,
        "count": len(items),
        "total_count": total_count,
        "has_more": has_more,
        "offset": current_offset,
        "limit": max(1, int(limit or 10)),
        "user_facing_count": user_facing_count,
        "latest_user_facing_revision_number": user_facing_count,
        "current_session_payload_hash": current_session_payload_hash,
        "current_session_version": int(getattr(sess, "version", 0) or 0),
        "current_session_updated_at": int(getattr(sess, "updated_at", 0) or 0),
        "latest_user_version_session_payload_hash": latest_session_payload_hash,
        "has_session_changes_since_latest_bpmn_version": (
            bool(current_session_payload_hash)
            and (not latest_session_payload_hash or latest_session_payload_hash != current_session_payload_hash)
        ),
        "items": items,
        "versions": items,
    }


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
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


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
@app.post("/api/sessions/{session_id}/bpmn/restore/{version_id}")
def session_bpmn_restore(
    session_id: str,
    version_id: str,
    inp: BpmnRestoreIn | None = Body(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None

    sess_pre, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess_pre:
        raise_session_not_found(session_id)
    role = _org_role_for_request(request, oid) if request is not None and oid else ("org_admin" if effective_is_admin else "")
    if not _can_edit_workspace(role, is_admin=effective_is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    vid = str(version_id or "").strip()
    if not vid:
        return {"error": "missing_version_id"}
    restore_payload = inp.model_dump(exclude_unset=True) if isinstance(inp, BaseModel) else {}
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
        # Properties are derived from the XML payload, not from sidecar bpmn_meta.
        # After restore, re-derive camunda extensions from the RESTORED xml so the
        # registry and analytics reflect the restored version, not the pre-restore
        # (current) diagram whose bpmn_meta was carried in via current_meta above.
        normalized_meta.pop("camunda_extensions_by_element_id", None)
        if xml.strip():
            normalized_meta["camunda_extensions_by_element_id"] = extract_camunda_extensions_from_bpmn_xml(xml)
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
        restored_snapshot = _plan_bpmn_revision_snapshot_if_needed(
            storage=st,
            session=s,
            previous_xml=previous_xml,
            next_xml=xml,
            source_action="restore_bpmn_version",
            created_by=user_id,
            org_id=oid_locked,
            diagram_state_version=current_diagram_state_version + 1,
        )
        # SQL-CAS + snapshot in one transaction (audit P2/P4).
        _save_session_with_cas(
            st,
            s,
            client_base_version=client_base_diagram_state_version,
            user_id=user_id,
            org_id=oid_locked,
            is_admin=True,
            bpmn_snapshot=restored_snapshot,
        )
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


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
@app.delete("/api/sessions/{session_id}/bpmn")
def session_bpmn_clear(session_id: str, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)
    client_base_diagram_state_version = _resolve_base_diagram_state_version(request=request)
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=client_base_diagram_state_version,
    )
    user = _request_auth_user(request) if request is not None else {}
    actor_user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    actor_label = _resolve_actor_label_from_user(user, actor_user_id)
    previous_xml = str(getattr(s, "bpmn_xml", "") or "")
    current_diagram_state_version = int(getattr(s, "diagram_state_version", 0) or 0)
    cleared_snapshot: Optional[Dict[str, Any]] = None
    if previous_xml.strip():
        # Snapshot of the pre-clear XML, inserted in the same transaction as
        # the clearing save (audit P4).
        cleared_snapshot = {
            "bpmn_xml": previous_xml,
            "source_action": "clear_bpmn",
            "diagram_state_version": current_diagram_state_version + 1,
            "session_payload_hash": "",
            "session_version": int(getattr(s, "version", 0) or 0),
            "session_updated_at": int(getattr(s, "updated_at", 0) or 0),
            "created_by": actor_user_id,
            "org_id": str(getattr(s, "org_id", "") or get_default_org_id()),
            "import_note": "",
        }

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
    _save_session_with_cas(
        st,
        s,
        client_base_version=client_base_diagram_state_version,
        bpmn_snapshot=cleared_snapshot,
    )
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
  # DEPRECATED: moved to routers/sessions.py + session_service.py
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
  # DEPRECATED: moved to routers/sessions.py + session_service.py
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


  # DEPRECATED: moved to utils/authz.py
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


  # DEPRECATED: moved to utils/authz.py
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


  # DEPRECATED: moved to utils/authz.py
def _scope_allowed_project_ids(scope_raw: Any) -> Set[str]:
    scope = scope_raw if isinstance(scope_raw, dict) else {}
    if str(scope.get("mode") or "") == "all":
        return set()
    return {
        str(item or "").strip()
        for item in (scope.get("project_ids") or [])
        if str(item or "").strip()
    }


  # DEPRECATED: moved to utils/authz.py
def _is_role_allowed(role_raw: Any, allowed: Set[str]) -> bool:
    role = str(role_raw or "").strip().lower()
    return role in {str(item or "").strip().lower() for item in allowed}






  # DEPRECATED: moved to utils/authz.py
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


  # DEPRECATED: moved to utils/authz.py
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


def _workspace_reports_count(interview_raw: Any) -> int:
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    by_path = _get_report_versions_by_path(interview)
    total = 0
    for rows in by_path.values():
        if isinstance(rows, list):
            total += len(rows)
    return int(total)


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








def _workspace_id_for_project(project_id: str) -> str:
    pid = str(project_id or "").strip()
    if not pid:
        return ""
    try:
        ps = get_project_storage()
        proj = ps.load(pid)
        if proj:
            return str(getattr(proj, "workspace_id", "") or "").strip()
    except Exception as exc:
        logger.warning("_workspace_id_for_project failed for %s: %s", pid, exc)
    return ""




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


# /api/orgs/* handler implementations live in app/orgs.py (PR-7 orgs) and are
# re-registered here so LEGACY_ROUTE_EXPORT keeps the same routes, methods,
# registration order and endpoint objects as before the extraction.
app.post("/api/orgs")(create_org_endpoint)
app.patch("/api/orgs/{org_id}")(patch_org_endpoint)
app.get("/api/orgs/{org_id}/git-mirror")(get_org_git_mirror_endpoint)
app.patch("/api/orgs/{org_id}/members/{user_id}")(patch_org_member_endpoint)
app.get("/api/orgs/{org_id}/projects")(list_org_projects)
app.post("/api/orgs/{org_id}/projects")(create_org_project)
app.get("/api/orgs/{org_id}/projects/{project_id}")(get_org_project)
app.get("/api/orgs/{org_id}/projects/{project_id}/sessions")(list_org_project_sessions)
app.post("/api/orgs/{org_id}/projects/{project_id}/sessions")(create_org_project_session)
app.get("/api/orgs/{org_id}/projects/{project_id}/members")(list_org_project_members)
app.post("/api/orgs/{org_id}/projects/{project_id}/members")(create_org_project_member)
app.patch("/api/orgs/{org_id}/projects/{project_id}/members/{user_id}")(patch_org_project_member)
app.delete("/api/orgs/{org_id}/projects/{project_id}/members/{user_id}")(delete_org_project_member)
app.get("/api/admin/organizations/{org_id}/invites")(list_org_invites_endpoint)
app.get("/api/orgs/{org_id}/invites")(list_org_invites_endpoint)
app.post("/api/admin/organizations/{org_id}/invites")(create_org_invite_endpoint)
app.post("/api/orgs/{org_id}/invites")(create_org_invite_endpoint)
app.post("/api/orgs/{org_id}/invites/accept")(accept_org_invite_endpoint)
app.post("/api/invites/accept")(accept_invite_endpoint)
app.post("/api/admin/organizations/{org_id}/invites/{invite_id}/revoke")(revoke_org_invite_endpoint)
app.post("/api/orgs/{org_id}/invites/{invite_id}/revoke")(revoke_org_invite_endpoint)
app.post("/api/orgs/{org_id}/invites/cleanup")(cleanup_org_invites_endpoint)
app.get("/api/orgs/{org_id}/audit")(list_org_audit_endpoint)
app.post("/api/orgs/{org_id}/audit/cleanup")(cleanup_org_audit_endpoint)
app.get("/api/orgs/{org_id}/sessions/{session_id}/reports/versions")(list_org_session_report_versions)
app.post("/api/orgs/{org_id}/sessions/{session_id}/reports/build")(build_org_session_report)
app.get("/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}")(get_org_session_report_version)
app.delete("/api/orgs/{org_id}/sessions/{session_id}/reports/{version_id}")(delete_org_session_report_version)


# -----------------------------
# Epic #1: Projects + Process Passport
# -----------------------------

# /api/projects/* handler implementations live in app/projects.py (PR-8 projects)
# and are re-registered here so LEGACY_ROUTE_EXPORT keeps the same routes,
# methods, registration order and endpoint objects as before the extraction.
app.get("/api/projects")(list_projects)
app.post("/api/projects")(create_project)
app.get("/api/projects/{project_id}")(get_project)
app.patch("/api/projects/{project_id}")(patch_project)
app.put("/api/projects/{project_id}")(put_project)


def _build_legacy_route_export() -> Tuple[APIRoute, ...]:
    return tuple(route for route in app.router.routes if isinstance(route, APIRoute))


LEGACY_ROUTE_EXPORT: Tuple[APIRoute, ...] = _build_legacy_route_export()


def export_legacy_routes() -> Tuple[APIRoute, ...]:
    return LEGACY_ROUTE_EXPORT

# ── Wire overlay_cache stubs ──
from .exporters.bpmn import _collect_interview_comments
from . import overlay_cache as _oc_mod

def _wired_fetch_session_bpmn(sid: str, request=None) -> str:
    s = _legacy_load_session_scoped(sid, request)[0]
    return str(getattr(s, "bpmn_xml", "") or "")

def _wired_fetch_annotations(sid: str, request=None) -> list:
    s = _legacy_load_session_scoped(sid, request)[0]
    model = s.model_dump() if hasattr(s, "model_dump") else {}
    return _collect_interview_comments(model, model.get("nodes") or [])

def _wired_compute_overlays_json(sid: str, request=None) -> list[dict[str, Any]]:
    s = _legacy_load_session_scoped(sid, request)[0]
    if not s:
        return []
    xml = str(getattr(s, "bpmn_xml", "") or "")
    if not xml:
        return []
    return _compute_overlays_json(s, xml)

def _wired_render_overlay_xml(sid: str, bpmn_xml: str, request=None) -> str:
    s = _legacy_load_session_scoped(sid, request)[0]
    if not s:
        return bpmn_xml
    return _overlay_interview_annotations_on_bpmn_xml(s, bpmn_xml)

_oc_mod.fetch_session_bpmn = _wired_fetch_session_bpmn
_oc_mod.fetch_annotations = _wired_fetch_annotations
_oc_mod.compute_overlays_json = _wired_compute_overlays_json
_oc_mod.render_overlay_xml = _wired_render_overlay_xml




# list_project_sessions / create_project_session implementations live in
# app/projects.py (PR-8 projects); the route decorator is re-registered below.


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
app.post("/api/projects/{project_id}/sessions")(create_project_session)


# DEPRECATED: session routes moved to routers/sessions.py — kept for backward compatibility during migration.
# /api/sessions/* handler implementations live in app/sessions_core.py
# (PR-9 sessions-core) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.get("/api/sessions/{session_id}")(get_session)


# /api/sessions/* handler implementations live in app/sessions_core.py
# (PR-9 sessions-core) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.post("/api/sessions/{session_id}/presence")(touch_session_presence_api)


# /api/sessions/* handler implementations live in app/sessions_core.py
# (PR-9 sessions-core) and are re-registered here so LEGACY_ROUTE_EXPORT
# keeps the same routes, methods, registration order and endpoint objects
# as before the extraction.
app.delete("/api/sessions/{session_id}/presence")(leave_session_presence_api)


# Legacy test compatibility re-exports (router/service split).
# Only back-fill symbols that were removed from this module; do not shadow
# existing legacy implementations to avoid recursion.
try:
    if 'auth_invite_activate' not in globals():
        from app.services.auth_service import (  # noqa: F401
            auth_invite_activate,
            auth_invite_preview,
            auth_login,
            auth_logout,
            auth_me,
            auth_refresh,
        )
    if 'cleanup_org_audit_endpoint' not in globals():
        from app.routers.org import (
            cleanup_org_audit_endpoint,
            get_org_git_mirror_endpoint,
            list_org_audit_endpoint,
            patch_org_endpoint,
            patch_org_git_mirror_endpoint,
        )  # noqa: F401
    if 'patch_org_git_mirror_endpoint' not in globals():
        from app.routers.org import patch_org_git_mirror_endpoint  # noqa: F401
    if 'create_session' not in globals():
        from app.routers.sessions import create_session  # noqa: F401
    if 'create_org_project' not in globals():
        from app.services.org_service import create_org_project, get_org_project  # noqa: F401
    if 'create_project' not in globals():
        from app.services.project_service import create_project, list_projects, patch_project  # noqa: F401
    _session_reexports = {
        'add_edge', 'add_node', 'create_project_session', 'delete_edge', 'delete_node',
        'get_session', 'list_project_sessions', 'patch_node',
    }
    # Per-name back-fill: never shadow legacy implementations that still live
    # in this module (session_service delegates some of them back here).
    _missing_session_reexports = _session_reexports - set(globals())
    if _missing_session_reexports:
        from app.services import session_service as _session_service_mod
        for _reexport_name in _missing_session_reexports:
            globals()[_reexport_name] = getattr(_session_service_mod, _reexport_name)
except Exception:  # pragma: no cover
    pass
