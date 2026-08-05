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


_R_TIER_ALGO_VERSION = "rtier_v1"


def _infer_and_merge_rtiers(
    *,
    sess: Session,
    scope_start_id: str,
    success_end_ids: Any,
    fail_end_ids: Any,
) -> Dict[str, Any]:
    import app._legacy_main as _lm
    xml_text = str(getattr(sess, "bpmn_xml", "") or "")
    has_xml = bool(xml_text.strip())
    flow_ctx = _lm._collect_sequence_flow_meta(xml_text)
    flow_ids = set(flow_ctx.get("flow_ids") or set()) if isinstance(flow_ctx, dict) else set()
    node_ids = set(flow_ctx.get("node_ids") or set()) if isinstance(flow_ctx, dict) else set()
    if not has_xml or not flow_ids:
        return {
            "meta": _lm._normalize_bpmn_meta(getattr(sess, "bpmn_meta", {})),
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

    current = _lm._normalize_bpmn_meta(
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

    flow_meta = _lm._enforce_gateway_tier_constraints(
        flow_meta,
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )
    normalized_meta = _lm._normalize_bpmn_meta(
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
    normalized_meta["flow_meta"] = _lm._enforce_gateway_tier_constraints(
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


def session_bpmn_meta_get(session_id: str) -> Dict[str, Any]:
    import app._legacy_main as _lm
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return {"error": "not found"}

    has_xml = bool(str(getattr(s, "bpmn_xml", "") or "").strip())
    flow_ctx = _lm._collect_sequence_flow_meta(str(getattr(s, "bpmn_xml", "") or ""))
    flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
    node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()
    normalized = _lm._normalize_bpmn_meta(
        getattr(s, "bpmn_meta", {}),
        allowed_flow_ids=flow_ids if has_xml else None,
        allowed_node_ids=node_ids if has_xml else None,
    )
    normalized["flow_meta"] = _lm._enforce_gateway_tier_constraints(
        dict(normalized.get("flow_meta") or {}),
        outgoing_by_source=flow_ctx.get("outgoing_by_source"),
        gateway_mode_by_node=flow_ctx.get("gateway_mode_by_node"),
    )
    if normalized != getattr(s, "bpmn_meta", {}):
        s.bpmn_meta = normalized
        st.save(s)
    return normalized


def session_bpmn_meta_patch(session_id: str, inp: BpmnMetaPatchIn, request: Request = None) -> Dict[str, Any]:
    import app._legacy_main as _lm
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
    flow_ctx = _lm._collect_sequence_flow_meta(str(getattr(s, "bpmn_xml", "") or ""))
    flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
    node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()
    flow_source_by_id = flow_ctx.get("flow_source_by_id") if isinstance(flow_ctx, dict) else {}
    outgoing_by_source = flow_ctx.get("outgoing_by_source") if isinstance(flow_ctx, dict) else {}
    gateway_mode_by_node = flow_ctx.get("gateway_mode_by_node") if isinstance(flow_ctx, dict) else {}

    current = _lm._normalize_bpmn_meta(
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
        replaced = _lm._normalize_bpmn_meta(
            {"version": current.get("version", 1), "flow_meta": inp.flow_meta},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        flow_meta = dict(replaced.get("flow_meta") or {})

    if isinstance(inp.node_path_meta, dict):
        replaced = _lm._normalize_bpmn_meta(
            {"version": current.get("version", 1), "node_path_meta": inp.node_path_meta},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        node_path_meta = dict(replaced.get("node_path_meta") or {})

    if isinstance(inp.robot_meta_by_element_id, dict):
        replaced = _lm._normalize_bpmn_meta(
            {"version": current.get("version", 1), "robot_meta_by_element_id": inp.robot_meta_by_element_id},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        robot_meta_by_element_id = dict(replaced.get("robot_meta_by_element_id") or {})

    if isinstance(inp.hybrid_layer_by_element_id, dict):
        replaced = _lm._normalize_bpmn_meta(
            {"version": current.get("version", 1), "hybrid_layer_by_element_id": inp.hybrid_layer_by_element_id},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        hybrid_layer_by_element_id = dict(replaced.get("hybrid_layer_by_element_id") or {})

    if isinstance(inp.hybrid_v2, dict):
        replaced = _lm._normalize_bpmn_meta(
            {"version": current.get("version", 1), "hybrid_v2": inp.hybrid_v2},
            allowed_flow_ids=flow_ids if has_xml else None,
            allowed_node_ids=node_ids if has_xml else None,
        )
        hybrid_v2 = dict(replaced.get("hybrid_v2") or {})

    if isinstance(inp.drawio, dict):
        replaced = _lm._normalize_bpmn_meta(
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

    flow_meta = _lm._enforce_gateway_tier_constraints(
        flow_meta,
        outgoing_by_source=outgoing_by_source,
        gateway_mode_by_node=gateway_mode_by_node,
    )

    normalized = _lm._normalize_bpmn_meta(
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
    normalized["flow_meta"] = _lm._enforce_gateway_tier_constraints(
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


def session_bpmn_meta_infer_rtiers(session_id: str, inp: InferRtiersIn, request: Request = None) -> Dict[str, Any]:
    import app._legacy_main as _lm
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
    normalized_meta = _lm._normalize_bpmn_meta(meta)
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


def session_bpmn_export(
    session_id: str,
    raw: int = Query(0, description="1 = return stored bpmn_xml as-is (no regenerate/overlay)"),
    include_overlay: int = Query(1, description="1 = overlay interview annotations (ignored when raw=1)"),
    zoom: float = Query(1.0),
    pan_x: float = Query(0.0),
    pan_y: float = Query(0.0),
    request: Request = None,
):
    import app._legacy_main as _lm
    st = get_storage()
    s, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not s:
        return Response(content="not found", media_type="text/plain", status_code=404)

    raw_mode = bool(int(raw or 0))
    overlay_mode = bool(int(include_overlay or 0))
    if overlay_mode and not raw_mode:
        result = get_overlay(session_id, zoom, pan_x, pan_y)
        if result.status == 200:
            return Response(content=result.body, media_type="application/xml", headers={"Cache-Control": "max-age=60"})
        if result.status == 202:
            return JSONResponse(content=result.body, status_code=202)
        if result.status == 503:
            return JSONResponse(content=result.body, status_code=503, headers={"Retry-After": "2"})

    xml_stored = str(getattr(s, "bpmn_xml", "") or "")
    has_graph = len(getattr(s, "nodes", []) or []) > 0 or len(getattr(s, "edges", []) or []) > 0
    current_graph_fp = _lm._session_graph_fingerprint(s)
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


def session_overlays(session_id: str, request: Request = None):
    s, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not s:
        raise HTTPException(status_code=404, detail="not found")
    from .overlay_cache import get_overlays_json
    return JSONResponse(content=get_overlays_json(session_id))


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


def session_bpmn_save(session_id: str, inp: BpmnXmlIn, request: Request = None) -> Dict[str, Any]:
    import app._legacy_main as _lm
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None

    sess_pre, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess_pre:
        raise_session_not_found(session_id)
    role = _org_role_for_request(request, oid) if request is not None and oid else ("org_admin" if effective_is_admin else "")
    if not _lm._can_edit_workspace(role, is_admin=effective_is_admin):
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

        flow_ctx = _lm._collect_sequence_flow_meta(xml)
        normalized_meta, auto_pass_state_write_requested = _lm._merge_and_normalize_bpmn_meta(
            getattr(s, "bpmn_meta", {}),
            inp.bpmn_meta,
            xml,
            flow_ctx,
        )
        s.bpmn_xml = xml
        s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
        s.activity_count = _lm._count_bpmn_activities(xml)
        s.bpmn_graph_fingerprint = _lm._session_graph_fingerprint(s)
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
                        parent.activity_count = _lm._count_bpmn_activities(new_parent_xml)
                        parent.bpmn_graph_fingerprint = _lm._session_graph_fingerprint(parent)
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
                        _lm.logger.info(
                            "subprocess_parent_synced: child=%s parent=%s element=%s bytes_before=%d bytes_after=%d",
                            session_id,
                            parent_session_id,
                            element_id_in_parent,
                            len(previous_parent_xml),
                            len(new_parent_xml),
                        )
            except Exception as exc:
                _lm.logger.warning(
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
            _lm._capture_persisted_auto_pass_failed_state(
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


def session_bpmn_restore(
    session_id: str,
    version_id: str,
    inp: BpmnRestoreIn | None = Body(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    import app._legacy_main as _lm
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None

    sess_pre, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess_pre:
        raise_session_not_found(session_id)
    role = _org_role_for_request(request, oid) if request is not None and oid else ("org_admin" if effective_is_admin else "")
    if not _lm._can_edit_workspace(role, is_admin=effective_is_admin):
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

        flow_ctx = _lm._collect_sequence_flow_meta(xml)
        flow_ids = flow_ctx.get("flow_ids") if isinstance(flow_ctx, dict) else set()
        node_ids = flow_ctx.get("node_ids") if isinstance(flow_ctx, dict) else set()

        current_meta = _lm._normalize_bpmn_meta(
            getattr(s, "bpmn_meta", {}),
            allowed_flow_ids=flow_ids,
            allowed_node_ids=node_ids,
        )

        s.bpmn_xml = xml
        s.bpmn_xml_version = int(getattr(s, "version", 0) or 0)
        s.bpmn_graph_fingerprint = _lm._session_graph_fingerprint(s)
        normalized_meta = _lm._normalize_bpmn_meta(
            current_meta,
            allowed_flow_ids=flow_ids,
            allowed_node_ids=node_ids,
        )
        normalized_meta["flow_meta"] = _lm._enforce_gateway_tier_constraints(
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


def session_bpmn_clear(session_id: str, request: Request = None) -> Dict[str, Any]:
    import app._legacy_main as _lm
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
    s.bpmn_meta = _lm._normalize_bpmn_meta({})
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
