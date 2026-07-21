from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field
from starlette.responses import Response

from .. import _legacy_main
from ..utils.authz import is_role_allowed, scope_allowed_project_ids
from ..ai.execution_log import list_ai_executions
from ..ai.module_catalog import ai_module_catalog_payload, ai_provider_settings_summary
from ..ai.prompt_registry import (
    activate_prompt_version,
    archive_prompt_version,
    create_prompt_draft,
    get_active_prompt,
    get_prompt_detail,
    list_prompt_versions,
    seed_existing_ai_prompts,
)
from ..auto_pass_jobs import redis_queue_enabled
from ..auth import AuthError, create_user, find_user_by_id, list_users as list_auth_users, update_user
from ..error_events import redact_context_json
from ..redis_client import get_client, runtime_status
from ..session_analytics import get_session_analytics_summary, get_session_analytics_top
from ..settings import load_llm_settings, save_llm_settings, verify_llm_settings
from ..storage import (
    count_audit_log,
    count_error_events,
    delete_org_membership,
    delete_admin_entity_permission,
    get_error_event,
    get_project_storage,
    get_storage,
    get_user_org_role,
    list_admin_entity_permissions,
    list_audit_log,
    list_error_events,
    list_org_groups,
    list_org_invites,
    list_org_memberships,
    list_org_records,
    list_org_workspace_folders,
    list_org_workspaces,
    list_templates,
    list_user_org_memberships,
    list_users_group_memberships,
    set_admin_invite_permissions,
    get_admin_invite_permissions,
    set_org_active,
    upsert_admin_entity_permission,
    upsert_org_membership,
    _connect,
    _admin_entity_permission_defaults,
    _admin_entity_permission_keys,
)

router = APIRouter()

_ADMIN_ALLOWED_ROLES = {"org_owner", "org_admin", "project_manager", "auditor"}
_TELEMETRY_READ_ROLES = {"org_owner", "org_admin", "auditor"}
_ADMIN_USER_ROLE_ALIASES = {
    "admin": "org_admin",
    "editor": "editor",
    "org_admin": "org_admin",
    "org_owner": "org_admin",
    "project_manager": "editor",
    "viewer": "org_viewer",
    "org_viewer": "org_viewer",
    "auditor": "org_viewer",
}


class AdminUserPermissionSet(BaseModel):
    view: bool = True
    create: bool = False
    edit: bool = False
    export: bool = False
    delete: bool = False
    manage_users: bool = False


class AdminUserMembershipIn(BaseModel):
    org_id: str
    role: str = "org_viewer"
    permissions: Optional[AdminUserPermissionSet] = None


class AdminUserCreateBody(BaseModel):
    email: str
    password: str
    full_name: str = ""
    job_title: str = ""
    is_admin: bool = False
    is_active: bool = True
    memberships: List[AdminUserMembershipIn] = Field(default_factory=list)


class AdminUserPatchBody(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    memberships: Optional[List[AdminUserMembershipIn]] = None


class AdminAiPromptDraftBody(BaseModel):
    module_id: str
    version: str
    template: str
    variables_schema: Dict[str, Any] = Field(default_factory=dict)
    output_schema: Dict[str, Any] = Field(default_factory=dict)
    scope_level: str = "global"
    scope_id: str = ""


class AdminAiProviderSettingsBody(BaseModel):
    api_key: str = ""
    base_url: str = ""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _autopass_used_fallback(autopass_raw: Dict[str, Any], bpmn_meta_raw: Dict[str, Any]) -> bool:
    autopass = _as_dict(autopass_raw)
    bpmn_meta = _as_dict(bpmn_meta_raw)
    execution = _as_text(autopass.get("execution")).lower()
    if execution.startswith("sync_fallback"):
        return True
    if bool(bpmn_meta.get("redis_fallback")):
        return True
    redis_meta_mode = _as_text(_as_dict(bpmn_meta.get("redis")).get("mode")).lower()
    return redis_meta_mode in {"fallback", "degraded", "off"}


def _session_redis_mode(*, redis_runtime: Dict[str, Any], bpmn_meta_raw: Dict[str, Any], autopass_raw: Dict[str, Any]) -> str:
    runtime_mode = _as_text(redis_runtime.get("mode")).upper()
    if runtime_mode in {"FALLBACK", "ERROR"}:
        return runtime_mode
    if _autopass_used_fallback(autopass_raw, bpmn_meta_raw):
        return "FALLBACK"
    return "ON"


_PUBLISH_GIT_MIRROR_DASHBOARD_STATES = (
    "not_attempted",
    "skipped_disabled",
    "skipped_invalid_config",
    "pending",
    "synced",
    "failed",
)


def _collect_publish_git_mirror_metrics(*, sessions: List[Dict[str, Any]], meta_map: Dict[str, Any]) -> Dict[str, Any]:
    counts: Counter[str] = Counter({state: 0 for state in _PUBLISH_GIT_MIRROR_DASHBOARD_STATES})
    published_bpmn_versions = 0
    latest_attempt_at = 0
    latest_result_state = "not_attempted"
    latest_result_session_id = ""
    latest_result_version_number = 0
    latest_result_version_id = ""
    latest_result_error = ""

    for session in sessions:
        row = _as_dict(session)
        sid = _as_text(row.get("id"))
        if not sid:
            continue
        meta_entry = _as_dict(meta_map.get(sid))
        publish_mirror = _legacy_main._extract_publish_git_mirror(_as_dict(meta_entry.get("interview")))
        state = _as_text(publish_mirror.get("state")).lower()
        if state not in counts:
            state = "not_attempted"
        counts[state] += 1

        version_number = max(0, _as_int(publish_mirror.get("version_number"), 0))
        published_bpmn_versions += version_number

        attempt_at = max(0, _as_int(publish_mirror.get("last_attempt_at"), 0))
        if attempt_at < latest_attempt_at:
            continue
        if attempt_at == 0 and latest_attempt_at > 0:
            continue
        latest_attempt_at = attempt_at
        latest_result_state = state
        latest_result_session_id = sid
        latest_result_version_number = version_number
        latest_result_version_id = _as_text(publish_mirror.get("version_id"))
        latest_result_error = _as_text(publish_mirror.get("last_error"))

    return {
        "published_bpmn_versions": int(published_bpmn_versions),
        "not_attempted": int(counts.get("not_attempted", 0)),
        "skipped_disabled": int(counts.get("skipped_disabled", 0)),
        "skipped_invalid_config": int(counts.get("skipped_invalid_config", 0)),
        "pending": int(counts.get("pending", 0)),
        "mirrored_to_git": int(counts.get("synced", 0)),
        "failed": int(counts.get("failed", 0)),
        "latest_attempt_at": int(latest_attempt_at),
        "latest_result_state": latest_result_state,
        "latest_result_session_id": latest_result_session_id,
        "latest_result_version_number": int(latest_result_version_number),
        "latest_result_version_id": latest_result_version_id,
        "latest_result_error": latest_result_error,
    }


def _admin_context(
    request: Request,
) -> Tuple[Optional[str], bool, Optional[str], Optional[str], Optional[Dict[str, Any]], Optional[Response]]:
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return None, False, None, None, None, _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    oid = _legacy_main._request_active_org_id(request)
    role, err = _legacy_main._enterprise_require_org_member(request, oid)
    if err is not None:
        return None, False, None, None, None, err
    role_l = _as_text(role).lower()
    if not (is_admin or is_role_allowed(role_l, _ADMIN_ALLOWED_ROLES)):
        return None, False, None, None, None, _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
    scope = _legacy_main._project_scope_for_request(request, oid)
    return uid, bool(is_admin), oid, role_l, scope, None


def _platform_admin_context(request: Request) -> Tuple[Optional[str], Optional[str], Optional[Response]]:
    uid, is_admin = _legacy_main._request_user_meta(request)
    if not uid:
        return None, None, _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    if not is_admin:
        return None, None, _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
    oid = _legacy_main._request_active_org_id(request)
    return uid, oid, None


def _telemetry_read_context(
    request: Request,
) -> Tuple[Optional[str], bool, Optional[str], Optional[str], Optional[Response]]:
    uid, is_admin, oid, role, _scope, err = _admin_context(request)
    if err is not None:
        return None, False, None, None, err
    if not (bool(is_admin) or is_role_allowed(role, _TELEMETRY_READ_ROLES)):
        return None, False, None, None, _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
    return uid, bool(is_admin), oid, role, None


def _normalize_admin_membership_role(raw: Any) -> str:
    key = _as_text(raw).lower()
    normalized = _ADMIN_USER_ROLE_ALIASES.get(key, "")
    if not normalized:
        raise ValueError("role must be org_admin, editor or org_viewer")
    return normalized


def _normalize_admin_memberships(
    rows: List[AdminUserMembershipIn], *, allow_empty: bool = False
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for item in rows:
        org_id = _as_text(getattr(item, "org_id", ""))
        if not org_id:
            raise ValueError("org_id is required")
        if org_id in seen:
            continue
        role = _normalize_admin_membership_role(getattr(item, "role", "org_viewer"))
        permissions = getattr(item, "permissions", None)
        permissions_dict: Optional[Dict[str, bool]] = None
        if permissions is not None:
            permissions_dict = {
                "view": bool(getattr(permissions, "view", True)),
                "create": bool(getattr(permissions, "create", False)),
                "edit": bool(getattr(permissions, "edit", False)),
                "export": bool(getattr(permissions, "export", False)),
                "delete": bool(getattr(permissions, "delete", False)),
                "manage_users": bool(getattr(permissions, "manage_users", False)),
            }
        out.append({"org_id": org_id, "role": role, "permissions": permissions_dict})
        seen.add(org_id)
    if not out and not allow_empty:
        raise ValueError("at least one organization membership is required")
    if not out:
        return []
    known_org_ids = {str(row.get("id") or "") for row in list_org_records()}
    missing = [row["org_id"] for row in out if row["org_id"] not in known_org_ids]
    if missing:
        raise ValueError(f"unknown org_id: {missing[0]}")
    return out


def _seed_admin_ai_prompts_error() -> Optional[Response]:
    try:
        seed_existing_ai_prompts()
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))
    return None


def _org_name_by_id() -> Dict[str, str]:
    return {
        str(row.get("id") or ""): _as_text(row.get("name") or row.get("id"))
        for row in list_org_records()
    }


def _membership_payload_for_user(user_id: str, *, org_name_by_id: Dict[str, str]) -> List[Dict[str, Any]]:
    rows = list_user_org_memberships(user_id, is_admin=False)
    items: List[Dict[str, Any]] = []
    for row in rows:
        org_id = _as_text(row.get("org_id"))
        role = _as_text(row.get("role") or "org_viewer") or "org_viewer"
        items.append(
            {
                "org_id": org_id,
                "org_name": _as_text(org_name_by_id.get(org_id) or row.get("name") or org_id),
                "role": role,
                "permissions": row.get("permissions") if isinstance(row.get("permissions"), dict) else None,
                "created_at": _as_int(row.get("created_at"), 0),
            }
        )
    return items


def _user_payload(row: Dict[str, Any], *, org_name_by_id: Dict[str, str], groups_by_user: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> Dict[str, Any]:
    user = _as_dict(row)
    user_id = _as_text(user.get("id"))
    memberships = _membership_payload_for_user(user_id, org_name_by_id=org_name_by_id)
    groups = list(groups_by_user.get(user_id, [])) if groups_by_user else []
    return {
        "id": user_id,
        "email": _as_text(user.get("email")).lower(),
        "full_name": _as_text(user.get("full_name")),
        "job_title": _as_text(user.get("job_title")),
        "is_active": bool(user.get("is_active", False)),
        "is_admin": bool(user.get("is_admin", False)),
        "created_at": _as_int(user.get("created_at"), 0),
        "memberships": memberships,
        "groups": groups,
    }


def _error_event_admin_item(row_raw: Dict[str, Any]) -> Dict[str, Any]:
    row = _as_dict(row_raw)
    context = redact_context_json(_as_dict(row.get("context_json")))
    return {
        "id": _as_text(row.get("id")),
        "schema_version": _as_int(row.get("schema_version"), 1),
        "occurred_at": _as_int(row.get("occurred_at"), 0),
        "ingested_at": _as_int(row.get("ingested_at"), 0),
        "source": _as_text(row.get("source")),
        "event_type": _as_text(row.get("event_type")),
        "severity": _as_text(row.get("severity") or "error").lower() or "error",
        "message": _as_text(row.get("message")),
        "user_id": _as_text(row.get("user_id")),
        "org_id": _as_text(row.get("org_id")),
        "session_id": _as_text(row.get("session_id")),
        "project_id": _as_text(row.get("project_id")),
        "route": _as_text(row.get("route")),
        "runtime_id": _as_text(row.get("runtime_id")),
        "tab_id": _as_text(row.get("tab_id")),
        "request_id": _as_text(row.get("request_id")),
        "correlation_id": _as_text(row.get("correlation_id")),
        "app_version": _as_text(row.get("app_version")),
        "git_sha": _as_text(row.get("git_sha")),
        "fingerprint": _as_text(row.get("fingerprint")),
        "context_json": context,
    }


def _replace_user_memberships(user_id: str, memberships: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    current = {
        _as_text(row.get("org_id")): row
        for row in list_user_org_memberships(user_id, is_admin=False)
        if _as_text(row.get("org_id"))
    }
    next_map = {_as_text(row.get("org_id")): row for row in memberships if _as_text(row.get("org_id"))}
    for org_id in list(current.keys()):
        if org_id not in next_map:
            delete_org_membership(org_id, user_id)
    for org_id, row in next_map.items():
        upsert_org_membership(
            org_id,
            user_id,
            _as_text(row.get("role") or "org_viewer"),
            row.get("permissions"),
        )
    return list_user_org_memberships(user_id, is_admin=False)


def _org_aggregate_item(
    *,
    org_row: Dict[str, Any],
    role: str,
    active_org_id: str,
) -> Dict[str, Any]:
    org_id = _as_text(org_row.get("org_id") or org_row.get("id"))
    sessions = get_storage().list(limit=5000, org_id=(org_id or None), is_admin=True)
    projects = get_project_storage().list(org_id=(org_id or None), is_admin=True)
    memberships = list_org_memberships(org_id)
    pending_invites = list_org_invites(org_id, include_inactive=False)
    return {
        "org_id": org_id,
        "id": org_id,
        "name": _as_text(org_row.get("name") or org_row.get("org_name") or org_id),
        "role": _as_text(role or org_row.get("role") or "org_viewer") or "org_viewer",
        "members_count": len(memberships),
        "projects_count": len(projects),
        "active_sessions_count": sum(1 for item in sessions if _as_text(_as_dict(item).get("status")).lower() == "in_progress"),
        "pending_invites_count": len(pending_invites),
        "is_active_context": org_id == _as_text(active_org_id),
        "is_active": bool(org_row.get("is_active", True)),
    }


def _workspace_payload(
    request: Request,
    *,
    q: str = "",
    status: str = "",
    owner_ids: str = "",
    project_id: str = "",
    updated_from: int | None = None,
    updated_to: int | None = None,
    needs_attention: int | None = None,
    limit: int = 500,
    offset: int = 0,
) -> Tuple[Optional[Dict[str, Any]], Optional[Response]]:
    payload = _legacy_main.enterprise_workspace(
        request=request,
        group_by="users",
        q=_as_text(q),
        owner_ids=_as_text(owner_ids),
        project_id=_as_text(project_id),
        status=_as_text(status),
        updated_from=updated_from,
        updated_to=updated_to,
        needs_attention=needs_attention,
        limit=max(1, min(int(limit), 500)),
        offset=max(0, int(offset)),
    )
    if isinstance(payload, Response):
        return None, payload
    if not isinstance(payload, dict):
        return None, _legacy_main._enterprise_error(500, "admin_workspace_invalid_payload", "invalid workspace payload")
    return payload, None


def _project_title_by_id(project_rows: List[Dict[str, Any]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for row in project_rows:
        item = _as_dict(row)
        pid = _as_text(item.get("id"))
        if not pid:
            continue
        out[pid] = _as_text(item.get("name") or item.get("title") or pid) or pid
    return out


def _session_meta_map(
    *,
    org_id: str,
    scope_raw: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    st = _legacy_main.get_storage()
    rows = st.list(limit=5000, org_id=(org_id or None), is_admin=True)
    scope = scope_raw if isinstance(scope_raw, dict) else {}
    allowed_ids = set(scope_allowed_project_ids(scope))
    out: Dict[str, Dict[str, Any]] = {}
    for raw in rows:
        item = _as_dict(raw)
        sid = _as_text(item.get("id"))
        if not sid:
            continue
        project_id = _as_text(item.get("project_id"))
        if allowed_ids and project_id and project_id not in allowed_ids:
            continue
        out[sid] = item
    return out


def _extract_gateway_choices_summary(auto_pass_raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    counts: Dict[str, Counter[str]] = defaultdict(Counter)
    variants = _as_list(auto_pass_raw.get("variants"))
    for variant_raw in variants:
        variant = _as_dict(variant_raw)
        for choice_raw in _as_list(variant.get("gateway_choices") or variant.get("choices")):
            choice = _as_dict(choice_raw)
            gid = _as_text(choice.get("gateway_id"))
            if not gid:
                continue
            label = _as_text(choice.get("label") or choice.get("flow_id") or "selected")
            counts[gid][label] += 1
    out: List[Dict[str, Any]] = []
    for gateway_id, counter in counts.items():
        top = counter.most_common(1)[0] if counter else ("", 0)
        out.append(
            {
                "gateway_id": gateway_id,
                "top_choice": top[0],
                "top_choice_count": int(top[1]),
                "choices_total": int(sum(counter.values())),
            }
        )
    out.sort(key=lambda row: (_as_text(row.get("gateway_id")), -_as_int(row.get("choices_total"), 0)))
    return out[:30]


def _session_row_for_admin(
    *,
    session: Dict[str, Any],
    project_title_by_id: Dict[str, str],
    org_name: str,
    meta_entry: Dict[str, Any],
    redis_runtime: Dict[str, Any],
) -> Dict[str, Any]:
    row = _as_dict(session)
    sid = _as_text(row.get("id"))
    project_id = _as_text(row.get("project_id"))
    bpmn_meta = _as_dict(meta_entry.get("bpmn_meta"))
    quality = _as_dict(bpmn_meta.get("quality"))
    autopass = _as_dict(bpmn_meta.get("auto_pass_v1"))
    warnings_count = _as_int(_as_dict(row.get("dod_artifacts")).get("needs_attention"), _as_int(row.get("needs_attention"), 0))
    errors_count = _as_int(quality.get("errors"), 0)
    publish_mirror = _legacy_main._extract_publish_git_mirror(_as_dict(meta_entry.get("interview")))
    return {
        "session_id": sid,
        "org_id": _as_text(row.get("org_id")),
        "org_name": org_name,
        "project_id": project_id,
        "project_name": _as_text(project_title_by_id.get(project_id) or project_id or "—"),
        "owner_id": _as_text(row.get("owner_id")),
        "status": _as_text(row.get("status") or "draft"),
        "updated_at": _as_int(row.get("updated_at"), 0),
        "bpmn_status": "ok" if bool(_as_dict(row.get("dod_artifacts")).get("bpmn_present")) else "missing",
        "interview_status": "ok" if bool(_as_dict(row.get("dod_artifacts")).get("interview_filled")) else "missing",
        "paths_status": "ok" if bool(_as_dict(row.get("dod_artifacts")).get("paths_mapped")) else "missing",
        "autopass_status": _as_text(row.get("autopass_status") or autopass.get("status") or "idle"),
        "reports_doc_status": "ok" if bool(_as_dict(row.get("dod_artifacts")).get("ai_report_created")) else "missing",
        "redis_mode": _session_redis_mode(redis_runtime=redis_runtime, bpmn_meta_raw=bpmn_meta, autopass_raw=autopass),
        "warnings_count": max(0, warnings_count),
        "errors_count": max(0, errors_count),
        "publish_git_mirror_state": _as_text(publish_mirror.get("state") or "not_attempted"),
        "publish_git_mirror_version_number": max(0, _as_int(publish_mirror.get("version_number"), 0)),
        "publish_git_mirror_version_id": _as_text(publish_mirror.get("version_id")),
        "publish_git_mirror_last_error": _as_text(publish_mirror.get("last_error")),
    }


@router.get("/api/admin/dashboard")
def admin_dashboard(request: Request) -> Any:
    uid, _is_admin, oid, _role, scope, err = _admin_context(request)
    if err is not None:
        return err
    workspace, ws_err = _workspace_payload(request, limit=500, offset=0)
    if ws_err is not None:
        return ws_err
    org = _as_dict(workspace.get("org"))
    sessions = [_as_dict(item) for item in _as_list(workspace.get("sessions"))]
    projects = [_as_dict(item) for item in _as_list(workspace.get("projects"))]
    meta_map = _session_meta_map(org_id=oid or "", scope_raw=scope or {})
    templates_my = list_templates(scope="personal", owner_user_id=uid or "", org_id="", limit=1000)
    templates_org = list_templates(scope="org", owner_user_id="", org_id=oid or "", limit=1000)
    audit_items = list_audit_log(oid or "", limit=30)
    redis_runtime = runtime_status(force_ping=True)
    publish_git_mirror = _collect_publish_git_mirror_metrics(sessions=sessions, meta_map=meta_map)
    publish_latest_attempt_at = _as_int(publish_git_mirror.get("latest_attempt_at"), 0)
    publish_latest_attempt_at_iso = (
        datetime.fromtimestamp(publish_latest_attempt_at, tz=timezone.utc).isoformat()
        if publish_latest_attempt_at > 0
        else ""
    )

    autopass_runs = 0
    autopass_done = 0
    autopass_failed = 0
    failed_jobs = 0
    lock_busy_total = 0
    duration_sum = 0
    duration_count = 0
    save_latency_sum = 0
    save_latency_count = 0
    activity_counts: Dict[str, int] = defaultdict(int)
    attention_rows: List[Dict[str, Any]] = []
    reports_ready = 0
    doc_ready = 0
    for session in sessions:
        sid = _as_text(session.get("id"))
        meta_entry = _as_dict(meta_map.get(sid))
        bpmn_meta = _as_dict(meta_entry.get("bpmn_meta"))
        auto = _as_dict(bpmn_meta.get("auto_pass_v1"))
        auto_status = _as_text(auto.get("status")).lower()
        if auto_status:
            autopass_runs += 1
        if auto_status in {"done", "completed"}:
            autopass_done += 1
        if auto_status == "failed":
            autopass_failed += 1
            failed_jobs += 1
        lock_busy_total += _as_int(auto.get("lock_busy_count"), 0)
        duration_s = _as_int(auto.get("duration_s"), 0)
        if duration_s > 0:
            duration_sum += duration_s
            duration_count += 1
        latency = _as_int(_as_dict(bpmn_meta.get("persist")).get("avg_save_ms"), 0)
        if latency > 0:
            save_latency_sum += latency
            save_latency_count += 1
        dod_artifacts = _as_dict(session.get("dod_artifacts"))
        if bool(dod_artifacts.get("ai_report_created")) or _as_int(dod_artifacts.get("reports_versions"), 0) > 0:
            reports_ready += 1
        if _as_int(_as_dict(bpmn_meta.get("doc")).get("version"), 0) > 0:
            doc_ready += 1
        updated = _as_int(session.get("updated_at"), 0)
        if updated > 0:
            day_key = datetime.fromtimestamp(updated, tz=timezone.utc).strftime("%Y-%m-%d")
            activity_counts[day_key] += 1
        warnings_count = _as_int(session.get("needs_attention"), 0)
        if warnings_count > 0:
            attention_rows.append(
                {
                    "session_id": sid,
                    "session_name": _as_text(session.get("name") or sid),
                    "project_id": _as_text(session.get("project_id")),
                    "warnings_count": warnings_count,
                    "updated_at": updated,
                }
            )
    autopass_success_rate = int(round((autopass_done / autopass_runs) * 100)) if autopass_runs > 0 else None
    avg_save_latency_ms = int(round(save_latency_sum / save_latency_count)) if save_latency_count > 0 else None

    queue_depth = 0
    queue_enabled = redis_queue_enabled()
    if queue_enabled:
        client = get_client()
        if client is not None:
            try:
                queue_depth = _as_int(client.llen("pm:auto_pass:queue"), 0)
            except Exception:
                queue_depth = 0
    redis_mode = _as_text(redis_runtime.get("mode")).upper() or "UNKNOWN"
    if redis_mode == "ON":
        any_session_fallback = any(
            _autopass_used_fallback(
                _as_dict(_as_dict(meta_map.get(_as_text(session.get("id")))).get("bpmn_meta")).get("auto_pass_v1"),
                _as_dict(_as_dict(meta_map.get(_as_text(session.get("id")))).get("bpmn_meta")),
            )
            for session in sessions
        )
        if any_session_fallback:
            redis_mode = "FALLBACK"

    points = []
    for key in sorted(activity_counts.keys())[-10:]:
        points.append({"date": key, "count": int(activity_counts.get(key, 0))})
    autopass_outcomes = {
        "runs": autopass_runs,
        "done": autopass_done,
        "failed": autopass_failed,
        "success_rate_pct": autopass_success_rate,
    }
    template_rows = [
        *[_as_dict(item) for item in templates_my],
        *[_as_dict(item) for item in templates_org],
    ]
    active_templates = 0
    cross_session_templates = 0
    broken_anchor_templates = 0
    for template in template_rows:
        usage = _as_int(template.get("usage_count"), _as_int(template.get("apply_count"), 0))
        if usage > 0:
            active_templates += 1
        template_type = _as_text(template.get("template_type")).lower()
        if template_type in {"bpmn_fragment_v1", "hybrid_stencil_v1"}:
            cross_session_templates += 1
        if template_type == "bpmn_selection_v1" and not _as_list(template.get("bpmn_element_ids")):
            broken_anchor_templates += 1
    reports_pending = max(0, len(sessions) - reports_ready)
    completion_rate_pct = int(round((reports_ready / len(sessions)) * 100)) if sessions else None
    recent_failures = []
    for session in sessions:
        sid = _as_text(session.get("id"))
        meta_entry = _as_dict(meta_map.get(sid))
        auto = _as_dict(_as_dict(meta_entry.get("bpmn_meta")).get("auto_pass_v1"))
        if _as_text(auto.get("status")).lower() == "failed":
            recent_failures.append(
                {
                    "id": sid,
                    "kind": "autopass",
                    "title": _as_text(session.get("name") or sid),
                    "message": _as_text(auto.get("error_message") or auto.get("error") or "AutoPass failed"),
                }
            )
    recent_failures.extend(
        {
            "id": _as_text(item.get("id")),
            "kind": "audit",
            "title": _as_text(item.get("action") or "audit.fail"),
            "message": _as_text(item.get("meta", {}).get("error") if isinstance(item.get("meta"), dict) else item.get("status") or "failed"),
        }
        for item in audit_items
        if _as_text(item.get("status")).lower() == "fail"
    )
    recent_failures = recent_failures[:20]
    attention_rows.sort(key=lambda row: int(row.get("warnings_count") or 0), reverse=True)
    audit_recent = [
        {
            "id": _as_text(item.get("id")),
            "ts": _as_int(item.get("ts"), 0),
            "actor": _as_text(item.get("actor_user_id")),
            "action": _as_text(item.get("action")),
            "status": _as_text(item.get("status")),
        }
        for item in audit_items[:20]
    ]
    return {
        "ok": True,
        "generated_at": _now_iso(),
        "org": {
            "id": _as_text(org.get("id") or oid),
            "name": _as_text(org.get("name") or oid),
        },
        "kpis": {
            "organizations": len(_as_list(getattr(request.state, "org_memberships", []) or [])),
            "projects": len(projects),
            "active_sessions": sum(1 for row in sessions if _as_text(row.get("status")).lower() == "in_progress"),
            "autopass_success_rate_pct": autopass_success_rate,
            "failed_jobs": failed_jobs,
            "avg_save_latency_ms": avg_save_latency_ms,
            "published_bpmn_versions": _as_int(publish_git_mirror.get("published_bpmn_versions"), 0),
            "mirrored_to_git": _as_int(publish_git_mirror.get("mirrored_to_git"), 0),
            "mirror_failed": _as_int(publish_git_mirror.get("failed"), 0),
        },
        "charts": {
            "sessions_activity": points,
            "autopass_outcomes": autopass_outcomes,
            "report_doc_health": {
                "reports_ready": reports_ready,
                "doc_ready": doc_ready,
                "pending": reports_pending,
                "completion_rate_pct": completion_rate_pct,
            },
        },
        "jobs_health": {
            "queue_depth": queue_depth,
            "autopass_runs": autopass_runs,
            "autopass_done": autopass_done,
            "autopass_failed": autopass_failed,
            "lock_busy_total": lock_busy_total,
            "avg_duration_s": int(round(duration_sum / duration_count)) if duration_count > 0 else 0,
        },
        "requires_attention": attention_rows[:20],
        "recent_failures": recent_failures,
        "recent_audit": audit_recent,
        "template_usage": {
            "total_templates": len(template_rows),
            "active_templates": active_templates,
            "cross_session_templates": cross_session_templates,
            "broken_anchor_templates": broken_anchor_templates,
        },
        "publish_git_mirror": {
            **publish_git_mirror,
            "latest_attempt_at_iso": publish_latest_attempt_at_iso,
            "org_mirror_enabled": bool(org.get("git_mirror_enabled")),
            "org_mirror_health_status": _as_text(org.get("git_health_status") or "unknown").lower() or "unknown",
        },
        "redis_health": {
            "mode": redis_mode,
            "state": _as_text(redis_runtime.get("state")),
            "queue_enabled": bool(queue_enabled),
            "queue_depth": queue_depth,
            "lock_busy_total": lock_busy_total,
            "degraded": bool(redis_mode == "FALLBACK"),
            "incident": bool(redis_mode == "ERROR"),
            "required": bool(redis_runtime.get("required")),
            "configured": bool(redis_runtime.get("configured")),
            "available": bool(redis_runtime.get("available")),
            "reason": _as_text(redis_runtime.get("reason")),
        },
    }


class OrgStatusPatchIn(BaseModel):
    is_active: bool


@router.get("/api/admin/orgs")
def admin_orgs(request: Request) -> Any:
    uid, is_admin, oid, role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    memberships = _as_list(getattr(request.state, "org_memberships", []) or [])
    items = [
        _org_aggregate_item(
            org_row=_as_dict(row),
            role=_as_text(_as_dict(row).get("role") or "org_viewer"),
            active_org_id=oid or "",
        )
        for row in memberships
    ]
    return {
        "ok": True,
        "active_org_id": oid,
        "actor": {"user_id": uid, "is_admin": bool(is_admin), "role": role},
        "items": items,
        "count": len(items),
    }


@router.patch("/api/admin/orgs/{org_id}/status")
def admin_patch_org_status(org_id: str, body: OrgStatusPatchIn, request: Request) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    try:
        org = set_org_active(org_id, body.is_active)
    except ValueError as e:
        return _legacy_main._enterprise_error(404, "not_found", str(e))
    return {"ok": True, "item": org}


@router.get("/api/admin/ai/modules")
def admin_ai_modules(request: Request) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    return ai_module_catalog_payload()


@router.get("/api/admin/ai/provider-settings")
def admin_ai_provider_settings(request: Request) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    return {"ok": True, "provider_settings": ai_provider_settings_summary()}


@router.post("/api/admin/ai/provider-settings")
def admin_save_ai_provider_settings(body: AdminAiProviderSettingsBody, request: Request) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    current = load_llm_settings()
    api_key = _as_text(body.api_key) or _as_text(current.get("api_key"))
    saved = save_llm_settings(api_key=api_key, base_url=body.base_url or _as_text(current.get("base_url")))
    return {
        "ok": True,
        "provider_settings": {
            "provider": "DeepSeek",
            "provider_id": "deepseek",
            "has_api_key": bool(saved.get("has_api_key")),
            "base_url": _as_text(saved.get("base_url")),
            "source": "settings_file",
            "verify_supported": True,
            "admin_managed": True,
        },
    }


@router.post("/api/admin/ai/provider-settings/verify")
def admin_verify_ai_provider_settings(body: AdminAiProviderSettingsBody, request: Request) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    result = verify_llm_settings(api_key=body.api_key, base_url=body.base_url)
    if not bool(result.get("ok")) and not bool(result.get("has_api_key")):
        result = {**result, "error": "AI_PROVIDER_NOT_CONFIGURED"}
    elif not bool(result.get("ok")):
        result = {**result, "error_code": "AI_PROVIDER_VERIFY_FAILED"}
    result.pop("api_key", None)
    return {"ok": True, "result": result}


@router.get("/api/admin/ai/executions")
def admin_ai_executions(
    request: Request,
    module_id: str = Query(default=""),
    status: str = Query(default=""),
    actor_user_id: str = Query(default=""),
    org_id: str = Query(default=""),
    workspace_id: str = Query(default=""),
    project_id: str = Query(default=""),
    session_id: str = Query(default=""),
    created_from: int = Query(default=0),
    created_to: int = Query(default=0),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
) -> Any:
    _uid, is_admin, active_org_id, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    requested_org_id = _as_text(org_id)
    effective_org_id = requested_org_id if bool(is_admin) and requested_org_id else _as_text(active_org_id)
    return list_ai_executions(
        org_id=effective_org_id,
        module_id=module_id,
        status=status,
        actor_user_id=actor_user_id,
        workspace_id=workspace_id,
        project_id=project_id,
        session_id=session_id,
        created_from=max(0, _as_int(created_from, 0)),
        created_to=max(0, _as_int(created_to, 0)),
        limit=max(1, min(_as_int(limit, 50), 200)),
        offset=max(0, _as_int(offset, 0)),
    )


@router.get("/api/admin/ai/prompts")
def admin_ai_prompts(
    request: Request,
    module_id: str = Query(default=""),
    status: str = Query(default=""),
    scope_level: str = Query(default=""),
    scope_id: str = Query(default=""),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    try:
        return list_prompt_versions(
            module_id=module_id,
            status=status,
            scope_level=scope_level,
            scope_id=scope_id,
            limit=max(1, min(_as_int(limit, 50), 200)),
            offset=max(0, _as_int(offset, 0)),
        )
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))


@router.get("/api/admin/ai/prompts/active")
def admin_ai_active_prompt(
    request: Request,
    module_id: str = Query(default=""),
    scope_level: str = Query(default="global"),
    scope_id: str = Query(default=""),
) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    try:
        item = get_active_prompt(module_id=module_id, scope_level=scope_level, scope_id=scope_id)
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))
    if not item:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    return {"ok": True, "item": item}


@router.post("/api/admin/ai/prompts/seed")
def admin_seed_ai_prompts(request: Request) -> Any:
    """Explicitly seed built-in AI prompts. Must not be called from GET endpoints."""
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    seed_err = _seed_admin_ai_prompts_error()
    if seed_err is not None:
        return seed_err
    return seed_existing_ai_prompts(actor_user_id=_uid or "admin_seed")


@router.get("/api/admin/ai/prompts/{prompt_id}")
def admin_ai_prompt_detail(prompt_id: str, request: Request) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    item = get_prompt_detail(prompt_id)
    if not item:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    return {"ok": True, "item": item}


@router.post("/api/admin/ai/prompts", status_code=201)
def admin_create_ai_prompt(body: AdminAiPromptDraftBody, request: Request) -> Any:
    uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    try:
        item = create_prompt_draft(
            module_id=body.module_id,
            version=body.version,
            template=body.template,
            variables_schema=body.variables_schema,
            output_schema=body.output_schema,
            created_by=uid or "",
            scope_level=body.scope_level,
            scope_id=body.scope_id,
        )
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))
    except Exception as exc:
        return _legacy_main._enterprise_error(409, "conflict", str(exc))
    return {"ok": True, "item": item}


@router.post("/api/admin/ai/prompts/{prompt_id}/activate")
def admin_activate_ai_prompt(prompt_id: str, request: Request) -> Any:
    uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    try:
        item = activate_prompt_version(prompt_id, actor_user_id=uid or "")
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message else 422
        code = "not_found" if status_code == 404 else "validation_error"
        return _legacy_main._enterprise_error(status_code, code, message)
    return {"ok": True, "item": item}


@router.post("/api/admin/ai/prompts/{prompt_id}/archive")
def admin_archive_ai_prompt(prompt_id: str, request: Request) -> Any:
    uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    try:
        item = archive_prompt_version(prompt_id, actor_user_id=uid or "")
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message else 422
        code = "not_found" if status_code == 404 else "validation_error"
        return _legacy_main._enterprise_error(status_code, code, message)
    return {"ok": True, "item": item}


@router.get("/api/admin/users")
def admin_users(request: Request) -> Any:
    _uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    org_name_by_id = _org_name_by_id()
    users = list_auth_users()
    user_ids = [_as_text(row.get("id")) for row in users if _as_text(row.get("id"))]
    groups_by_user = list_users_group_memberships(user_ids)
    items = [_user_payload(row, org_name_by_id=org_name_by_id, groups_by_user=groups_by_user) for row in users]
    return {
        "ok": True,
        "items": items,
        "count": len(items),
    }


@router.post("/api/admin/users", status_code=201)
def admin_create_user(body: AdminUserCreateBody, request: Request) -> Any:
    actor_id, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    try:
        memberships = _normalize_admin_memberships(list(body.memberships or []), allow_empty=bool(body.is_admin))
        created = create_user(
            body.email,
            body.password,
            is_admin=bool(body.is_admin),
            is_active=bool(body.is_active),
            full_name=_as_text(body.full_name),
            job_title=_as_text(body.job_title),
        )
        _replace_user_memberships(_as_text(created.get("id")), memberships)
    except AuthError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))
    _legacy_main._audit_log_safe(
        request,
        org_id=_as_text(memberships[0].get("org_id")) if memberships else (_oid or ""),
        action="admin.user_create",
        entity_type="user",
        entity_id=_as_text(created.get("id")),
        meta={"email": _as_text(created.get("email")), "actor_user_id": actor_id, "is_admin": bool(created.get("is_admin"))},
    )
    created_groups = list_users_group_memberships([_as_text(created.get("id"))])
    return {
        "ok": True,
        "item": _user_payload(created, org_name_by_id=_org_name_by_id(), groups_by_user=created_groups),
    }


@router.patch("/api/admin/users/{user_id}")
def admin_patch_user(user_id: str, body: AdminUserPatchBody, request: Request) -> Any:
    actor_id, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    uid = _as_text(user_id)
    if not uid:
        return _legacy_main._enterprise_error(422, "validation_error", "user_id is required")
    memberships: Optional[List[Dict[str, str]]] = None
    try:
        updated = update_user(
            uid,
            email=body.email,
            password=body.password if body.password is not None and _as_text(body.password) else None,
            is_admin=body.is_admin,
            is_active=body.is_active,
            full_name=body.full_name,
            job_title=body.job_title,
        )
        if body.memberships is not None:
            memberships = _normalize_admin_memberships(
                list(body.memberships or []),
                allow_empty=bool(body.is_admin if body.is_admin is not None else updated.get("is_admin")),
            )
            _replace_user_memberships(uid, memberships)
    except AuthError as exc:
        marker = _as_text(exc).lower()
        status = 404 if marker == "user_not_found" else 422
        code = "not_found" if status == 404 else "validation_error"
        return _legacy_main._enterprise_error(status, code, str(exc))
    except ValueError as exc:
        return _legacy_main._enterprise_error(422, "validation_error", str(exc))
    _legacy_main._audit_log_safe(
        request,
        org_id=_as_text((memberships or [{}])[0].get("org_id")) if memberships is not None else "",
        action="admin.user_update",
        entity_type="user",
        entity_id=uid,
        meta={"actor_user_id": actor_id, "is_admin": bool(updated.get("is_admin"))},
    )
    updated_groups = list_users_group_memberships([_as_text(updated.get("id"))])
    return {
        "ok": True,
        "item": _user_payload(updated, org_name_by_id=_org_name_by_id(), groups_by_user=updated_groups),
    }


@router.get("/api/admin/projects")
def admin_projects(
    request: Request,
    q: str = Query(default=""),
    limit: int = Query(default=20),
    offset: int = Query(default=0),
) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    lim = max(1, min(int(limit or 20), 50))
    off = max(0, int(offset or 0))
    workspace, ws_err = _workspace_payload(request, q=q, limit=5000, offset=0)
    if ws_err is not None:
        return ws_err
    projects = [_as_dict(item) for item in _as_list(workspace.get("projects"))]
    sessions = _as_list(workspace.get("sessions"))
    sessions_by_project: Dict[str, int] = defaultdict(int)
    for row in sessions:
        item = _as_dict(row)
        sessions_by_project[_as_text(item.get("project_id"))] += 1
    items = []
    for row in projects:
        pid = _as_text(row.get("id"))
        items.append(
            {
                "project_id": pid,
                "name": _as_text(row.get("name") or row.get("title") or pid),
                "owner_id": _as_text(row.get("owner_id")),
                "owner": _as_text(row.get("owner")),
                "updated_at": _as_int(row.get("updated_at"), 0),
                "session_count": _as_int(sessions_by_project.get(pid), 0),
            }
        )
    items.sort(key=lambda row: (-_as_int(row.get("updated_at"), 0), _as_text(row.get("project_id"))))
    total = len(items)
    paged = items[off:off + lim]
    return {
        "ok": True,
        "items": paged,
        "count": total,
        "page": {"limit": lim, "offset": off, "total": total},
    }


@router.get("/api/admin/sessions")
def admin_sessions(
    request: Request,
    q: str = Query(default=""),
    status: str = Query(default=""),
    owner_ids: str = Query(default=""),
    updated_from: int = Query(default=0),
    updated_to: int = Query(default=0),
    needs_attention: int = Query(default=-1),
    limit: int = Query(default=20),
    offset: int = Query(default=0),
) -> Any:
    _uid, _is_admin, _oid, _role, scope, err = _admin_context(request)
    if err is not None:
        return err
    lim = max(1, min(_as_int(limit, 20), 50))
    off = max(0, _as_int(offset, 0))
    needs_attention_raw = _as_int(needs_attention, -1)
    needs_attention_value = None if needs_attention_raw < 0 else needs_attention_raw
    updated_from_raw = _as_int(updated_from, 0)
    updated_to_raw = _as_int(updated_to, 0)
    workspace, ws_err = _workspace_payload(
        request,
        q=q,
        status=status,
        owner_ids=owner_ids,
        updated_from=(updated_from_raw if updated_from_raw > 0 else None),
        updated_to=(updated_to_raw if updated_to_raw > 0 else None),
        needs_attention=needs_attention_value,
        limit=lim,
        offset=off,
    )
    if ws_err is not None:
        return ws_err
    org = _as_dict(workspace.get("org"))
    sessions = [_as_dict(item) for item in _as_list(workspace.get("sessions"))]
    projects = [_as_dict(item) for item in _as_list(workspace.get("projects"))]
    project_titles = _project_title_by_id(projects)
    meta_map = _session_meta_map(org_id=_as_text(org.get("id")), scope_raw=scope or {})
    redis_runtime = runtime_status(force_ping=True)

    items = [
        _session_row_for_admin(
            session=session,
            project_title_by_id=project_titles,
            org_name=_as_text(org.get("name") or org.get("id")),
            meta_entry=_as_dict(meta_map.get(_as_text(session.get("id")))),
            redis_runtime=redis_runtime,
        )
        for session in sessions
    ]
    return {
        "ok": True,
        "org": {"id": _as_text(org.get("id")), "name": _as_text(org.get("name"))},
        "items": items,
        "count": _as_int(_as_dict(workspace.get("page")).get("total"), len(items)),
        "page": {
            "limit": lim,
            "offset": off,
            "total": _as_int(_as_dict(workspace.get("page")).get("total"), len(items)),
        },
    }


@router.get("/api/admin/sessions/{session_id}")
def admin_session_detail(session_id: str, request: Request) -> Any:
    uid, is_admin, oid, role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    sess, _scope_row, access_err = _legacy_main._session_access_from_request(request, session_id, org_id=oid)
    if access_err is not None:
        return access_err
    if sess is None:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")

    interview = _as_dict(getattr(sess, "interview", {}))
    bpmn_meta = _as_dict(getattr(sess, "bpmn_meta", {}))
    notes_by_element = _as_dict(getattr(sess, "notes_by_element", {}))
    markers_info = _legacy_main._workspace_attention_markers_info(json.dumps(bpmn_meta, ensure_ascii=False), uid or "")
    reports_versions = _legacy_main._workspace_reports_count(interview)
    needs_attention = _legacy_main._workspace_needs_attention_count(interview) + _as_int(markers_info.get("workspace_count"), 0)
    dod_artifacts = _legacy_main._workspace_collect_dod_artifacts(
        row={
            "bpmn_xml_version": int(getattr(sess, "bpmn_xml_version", 0) or 0),
            "version": int(getattr(sess, "version", 0) or 0),
            "bpmn_meta_json": bpmn_meta,
            "notes_by_element_json": notes_by_element,
            "notes": _as_text(getattr(sess, "notes", "")),
        },
        interview=interview,
        reports_versions=reports_versions,
        attention_count=needs_attention,
    )
    session_status = _legacy_main._workspace_session_status(
        reports_versions=reports_versions,
        version=int(getattr(sess, "version", 0) or 0),
        bpmn_xml_version=int(getattr(sess, "bpmn_xml_version", 0) or 0),
        interview_raw=interview,
    )
    auto_pass = _as_dict(bpmn_meta.get("auto_pass_v1"))
    auto_summary = _as_dict(auto_pass.get("summary"))
    failed_reasons = _as_dict(auto_summary.get("failed_reasons"))
    diagnostics = _as_dict(bpmn_meta.get("diagnostics"))
    drawio = _as_dict(bpmn_meta.get("drawio"))
    template_diag = _as_dict(bpmn_meta.get("template_diagnostics"))
    quality = _as_dict(bpmn_meta.get("quality"))
    redis_runtime = runtime_status(force_ping=True)
    session_audit = list_audit_log(oid or "", limit=120, session_id=_as_text(session_id))
    project_id = _as_text(getattr(sess, "project_id", ""))
    project_name = project_id
    try:
        project_obj = _legacy_main.get_project_storage().load(project_id, org_id=(oid or None), is_admin=True) if project_id else None
        if project_obj is not None:
            project_name = _as_text(getattr(project_obj, "title", "") or project_id)
    except Exception:
        project_name = project_id
    publish_mirror = _legacy_main._extract_publish_git_mirror(interview)

    detail = {
        "session_id": _as_text(getattr(sess, "id", session_id)),
        "title": _as_text(getattr(sess, "title", session_id)),
        "org_id": _as_text(getattr(sess, "org_id", oid)),
        "org_name": _as_text(oid),
        "project_id": project_id,
        "project_name": project_name,
        "owner_id": _as_text(getattr(sess, "owner_user_id", "")),
        "status": _as_text(session_status),
        "updated_at": _as_int(getattr(sess, "updated_at", 0), 0),
        "created_at": _as_int(getattr(sess, "created_at", 0), 0),
        "publish_git_mirror_state": _as_text(publish_mirror.get("state") or "not_attempted"),
        "publish_git_mirror_version_number": max(0, _as_int(publish_mirror.get("version_number"), 0)),
        "publish_git_mirror_version_id": _as_text(publish_mirror.get("version_id")),
        "publish_git_mirror_last_error": _as_text(publish_mirror.get("last_error")),
        "tabs": {
            "overview": {
                "summary": {
                    "session_id": _as_text(getattr(sess, "id", session_id)),
                    "title": _as_text(getattr(sess, "title", "")),
                    "status": _as_text(session_status),
                    "updated_at": _as_int(getattr(sess, "updated_at", 0), 0),
                },
                "health": {
                    "bpmn": bool(dod_artifacts.get("bpmn_present")),
                    "interview": bool(dod_artifacts.get("interview_filled")),
                    "paths": bool(dod_artifacts.get("paths_mapped")),
                    "autopass": _as_text(auto_pass.get("status") or "idle"),
                    "reports": bool(dod_artifacts.get("ai_report_created")),
                    "doc": bool(_as_int(_as_dict(bpmn_meta.get("doc")).get("version"), 0) > 0),
                },
                "warnings_errors": {
                    "warnings_count": int(max(0, needs_attention)),
                    "errors_count": int(max(0, _as_int(quality.get("errors"), 0))),
                    "autopass_error": _as_text(auto_pass.get("error_message") or auto_pass.get("error")),
                },
                "quick_links": {
                    "org": f"/admin/orgs?org_id={_as_text(getattr(sess, 'org_id', oid))}",
                    "project": f"/admin/projects?project_id={project_id}",
                    "editor": f"/app?project={project_id}&session={_as_text(getattr(sess, 'id', session_id))}",
                },
            },
            "paths_bpmn": {
                "bpmn_xml_version": _as_int(getattr(sess, "bpmn_xml_version", 0), 0),
                "version": _as_int(getattr(sess, "version", 0), 0),
                "graph_fingerprint": _as_text(getattr(sess, "bpmn_graph_fingerprint", "")),
                "paths_mapped": bool(dod_artifacts.get("paths_mapped")),
                "path_artifacts_count": _as_int(dod_artifacts.get("path_artifacts_count"), 0),
            },
            "autopass": {
                "last_run": _as_text(auto_pass.get("generated_at")),
                "run_id": _as_text(auto_pass.get("run_id")),
                "overwrite_semantics": "overwrite_on_start",
                "status": _as_text(auto_pass.get("status") or "idle"),
                "done_failed_filtered": {
                    "total_variants_done": _as_int(auto_summary.get("total_variants_done"), 0),
                    "total_variants_failed": _as_int(auto_summary.get("total_variants_failed"), 0),
                    "filtered_total": _as_int(auto_summary.get("total_variants"), 0) - _as_int(auto_summary.get("total_variants_done"), 0),
                },
                "end_event_validation": {
                    "ok": _as_int(auto_summary.get("total_variants_done"), 0) > 0 and _as_text(auto_pass.get("status")).lower() in {"done", "completed"},
                    "failed_reason": _as_text(auto_pass.get("error_code") or auto_pass.get("error") or ""),
                },
                "gateway_choices_summary": _extract_gateway_choices_summary(auto_pass),
                "filtered_reason": failed_reasons,
            },
            "reports_doc": {
                "reports_versions": int(reports_versions),
                "doc_version": _as_int(_as_dict(bpmn_meta.get("doc")).get("version"), 0),
                "doc_ready": _as_int(_as_dict(bpmn_meta.get("doc")).get("version"), 0) > 0,
            },
            "diagnostics": {
                "save_retry_history": _as_list(diagnostics.get("save_retry_history")),
                "lock_busy_history": _as_list(diagnostics.get("lock_busy_history")),
                "drawio_warnings": _as_list(drawio.get("warnings") or drawio.get("import_warnings")),
                "template_apply_warnings": _as_list(template_diag.get("warnings")),
                "raw": {
                    "quality": quality,
                    "redis_fallback": bool(bpmn_meta.get("redis_fallback")),
                    "auto_pass": auto_pass,
                    "redis_runtime": redis_runtime,
                },
            },
            "audit": {
                "count": len(session_audit),
                "items": session_audit,
            },
        },
        "actor": {"user_id": uid, "is_admin": bool(is_admin), "role": role},
    }
    return {"ok": True, "item": detail}


@router.get("/api/admin/jobs")
def admin_jobs(request: Request) -> Any:
    _uid, _is_admin, oid, _role, scope, err = _admin_context(request)
    if err is not None:
        return err
    meta_map = _session_meta_map(org_id=oid or "", scope_raw=scope or {})
    items = []
    summary = {"queued": 0, "running": 0, "failed": 0, "completed": 0}
    lock_busy_total = 0
    duration_sum = 0
    duration_count = 0
    redis_runtime = runtime_status(force_ping=True)
    for sid, session in meta_map.items():
        bpmn_meta = _as_dict(session.get("bpmn_meta"))
        auto = _as_dict(bpmn_meta.get("auto_pass_v1"))
        auto_status = _as_text(auto.get("status")).lower()
        if auto_status:
            items.append(
                {
                    "job_type": "autopass",
                    "job_id": _as_text(auto.get("job_id") or f"autopass_{sid}"),
                    "session_id": sid,
                    "status": auto_status,
                    "run_id": _as_text(auto.get("run_id")),
                    "retries": _as_int(auto.get("retry_count"), 0),
                    "lock_busy": _as_int(auto.get("lock_busy_count"), 0),
                    "duration_s": _as_int(auto.get("duration_s"), 0),
                    "last_error": _as_text(auto.get("error_message") or auto.get("error")),
                    "updated_at": _as_text(auto.get("generated_at")),
                }
            )
            if auto_status in {"queued", "pending"}:
                summary["queued"] += 1
            elif auto_status in {"running"}:
                summary["running"] += 1
            elif auto_status in {"done", "completed"}:
                summary["completed"] += 1
            elif auto_status in {"failed", "error"}:
                summary["failed"] += 1
            lock_busy_total += _as_int(auto.get("lock_busy_count"), 0)
            dur = _as_int(auto.get("duration_s"), 0)
            if dur > 0:
                duration_sum += dur
                duration_count += 1
        reports_versions = _as_int(_as_dict(session.get("dod_artifacts")).get("reports_versions"), _as_int(session.get("reports_versions"), 0))
        if reports_versions > 0:
            items.append(
                {
                    "job_type": "report_doc",
                    "job_id": f"report_{sid}",
                    "session_id": sid,
                    "status": "completed",
                    "run_id": "",
                    "retries": 0,
                    "lock_busy": 0,
                    "duration_s": 0,
                    "last_error": "",
                    "updated_at": _as_int(session.get("updated_at"), 0),
                }
            )
    items.sort(key=lambda row: (_as_text(row.get("updated_at"))), reverse=True)
    queue_depth = 0
    queue_enabled = redis_queue_enabled()
    if queue_enabled:
        client = get_client()
        if client is not None:
            try:
                queue_depth = _as_int(client.llen("pm:auto_pass:queue"), 0)
            except Exception:
                queue_depth = 0
    return {
        "ok": True,
        "summary": {
            **summary,
            "total": len(items),
            "avg_duration_s": int(round(duration_sum / duration_count)) if duration_count > 0 else 0,
            "lock_busy_total": lock_busy_total,
        },
        "queue_health": {
            "enabled": bool(queue_enabled),
            "queue_depth": int(queue_depth),
            "mode": _as_text(redis_runtime.get("mode")).upper() or "UNKNOWN",
            "state": _as_text(redis_runtime.get("state")),
            "degraded": bool(redis_runtime.get("degraded")),
            "incident": bool(redis_runtime.get("incident")),
            "reason": _as_text(redis_runtime.get("reason")),
        },
        "items": items,
        "count": len(items),
    }


@router.get("/api/admin/agent-runs")
def admin_agent_runs(request: Request) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    root = _as_text(os.environ.get("PROCESSMAP_REPO_ROOT")) or "/opt/processmap-test"
    run_state_dir = os.path.join(root, ".agents", "run-state")
    runs: List[Dict[str, Any]] = []
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if os.path.isdir(run_state_dir):
        for entry in os.listdir(run_state_dir):
            run_path = os.path.join(run_state_dir, entry)
            if not os.path.isdir(run_path):
                continue
            run_id = entry
            cid_path = os.path.join(run_path, "CID")
            contour_id = ""
            try:
                with open(cid_path, "r", encoding="utf-8") as f:
                    contour_id = _as_text(f.read())
            except Exception:
                contour_id = ""
            stop_requested = os.path.exists(os.path.join(run_path, "STOP_REQUESTED"))
            agents: List[Dict[str, Any]] = []
            last_activity_at = 0
            scripts_dir = os.path.join(run_path, "scripts")
            if os.path.isdir(scripts_dir):
                for script_name in os.listdir(scripts_dir):
                    m = re.match(r"agent-(\d+)-(\d+)\.sh$", script_name)
                    if m:
                        agents.append({"agent": m.group(1), "pid": m.group(2), "highlight": False})
            for log_name in os.listdir(run_path):
                m = re.match(r"kimi-agent-(\d+)-(\d+)\.log$", log_name)
                if m:
                    log_path = os.path.join(run_path, log_name)
                    try:
                        mtime = int(os.path.getmtime(log_path))
                    except Exception:
                        mtime = 0
                    if mtime > last_activity_at:
                        last_activity_at = mtime
                    agent_num = m.group(1)
                    for a in agents:
                        if a["agent"] == agent_num:
                            break
                    else:
                        agents.append({"agent": agent_num, "pid": "", "highlight": False})
            for token_name in os.listdir(run_path):
                m = re.match(r"highlight-agent-(\d+)\.token$", token_name)
                if m:
                    agent_num = m.group(1)
                    for a in agents:
                        if a["agent"] == agent_num:
                            a["highlight"] = True
                            break
                    else:
                        agents.append({"agent": agent_num, "pid": "", "highlight": True})
            agents.sort(key=lambda a: _as_int(a.get("agent"), 0))
            if stop_requested:
                status = "stopping"
            elif last_activity_at > 0 and (now_ts - last_activity_at) <= 300:
                status = "active"
            else:
                status = "completed"
            runs.append(
                {
                    "run_id": run_id,
                    "contour_id": contour_id,
                    "status": status,
                    "stop_requested": stop_requested,
                    "started_at": last_activity_at,
                    "last_activity_at": last_activity_at,
                    "agents": agents,
                }
            )
    runs.sort(key=lambda r: (-_as_int(r.get("last_activity_at"), 0), _as_text(r.get("run_id"))))
    return {
        "ok": True,
        "generated_at": _now_iso(),
        "runs": runs,
        "count": len(runs),
    }


@router.get("/api/admin/agent-runs/{run_id}")
def admin_agent_run_detail(request: Request, run_id: str) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    root = _as_text(os.environ.get("PROCESSMAP_REPO_ROOT")) or "/opt/processmap-test"
    run_path = os.path.join(root, ".agents", "run-state", run_id)
    if not os.path.isdir(run_path):
        return {"ok": False, "error": "run_not_found", "run_id": run_id}

    cid_path = os.path.join(run_path, "CID")
    contour_id = ""
    try:
        with open(cid_path, "r", encoding="utf-8") as f:
            contour_id = _as_text(f.read())
    except Exception:
        contour_id = ""

    stop_requested = os.path.exists(os.path.join(run_path, "STOP_REQUESTED"))
    now_ts = int(datetime.now(timezone.utc).timestamp())

    agents: List[Dict[str, Any]] = []
    last_activity_at = 0

    scripts_dir = os.path.join(run_path, "scripts")
    if os.path.isdir(scripts_dir):
        for script_name in os.listdir(scripts_dir):
            m = re.match(r"agent-(\d+)-(\d+)\.sh$", script_name)
            if m:
                agents.append({"agent": m.group(1), "pid": m.group(2), "highlight": False, "log": ""})

    for log_name in os.listdir(run_path):
        m = re.match(r"kimi-agent-(\d+)-(\d+)\.log$", log_name)
        if m:
            log_path = os.path.join(run_path, log_name)
            try:
                mtime = int(os.path.getmtime(log_path))
            except Exception:
                mtime = 0
            if mtime > last_activity_at:
                last_activity_at = mtime
            agent_num = m.group(1)
            log_text = ""
            try:
                with open(log_path, "r", encoding="utf-8", errors="replace") as lf:
                    log_text = lf.read()
            except Exception:
                log_text = ""
            for a in agents:
                if a["agent"] == agent_num:
                    a["log"] = log_text
                    break
            else:
                agents.append({"agent": agent_num, "pid": "", "highlight": False, "log": log_text})

    for token_name in os.listdir(run_path):
        m = re.match(r"highlight-agent-(\d+)\.token$", token_name)
        if m:
            agent_num = m.group(1)
            for a in agents:
                if a["agent"] == agent_num:
                    a["highlight"] = True
                    break
            else:
                agents.append({"agent": agent_num, "pid": "", "highlight": True, "log": ""})

    agents.sort(key=lambda a: _as_int(a.get("agent"), 0))

    if stop_requested:
        status = "stopping"
    elif last_activity_at > 0 and (now_ts - last_activity_at) <= 300:
        status = "active"
    else:
        status = "completed"

    contour_dir = os.path.join(root, ".planning", "contours", contour_id)
    markers: Dict[str, Any] = {}
    marker_names = [
        "AGENT_RUN_ID", "READY_FOR_EXECUTION", "WORKER_STARTED", "WORKER_DONE",
        "WORKER_REPORT.md", "REVIEW_STARTED", "REVIEW_PASS", "CHANGES_REQUESTED",
        "REVIEW_REPORT.md", "EXEC_BLOCKED.md", "REVIEW_BLOCKED.md", "REWORK_REQUEST.md",
    ]
    if os.path.isdir(contour_dir):
        for name in marker_names:
            path = os.path.join(contour_dir, name)
            markers[name] = {"exists": os.path.exists(path), "mtime": int(os.path.getmtime(path)) if os.path.exists(path) else 0}

    return {
        "ok": True,
        "run_id": run_id,
        "contour_id": contour_id,
        "status": status,
        "stop_requested": stop_requested,
        "started_at": last_activity_at,
        "last_activity_at": last_activity_at,
        "agents": agents,
        "markers": markers,
    }


@router.get("/api/admin/error-events")
def admin_error_events(
    request: Request,
    session_id: str = Query(default=""),
    request_id: str = Query(default=""),
    correlation_id: str = Query(default=""),
    user_id: str = Query(default=""),
    org_id: str = Query(default=""),
    runtime_id: str = Query(default=""),
    event_type: str = Query(default=""),
    source: str = Query(default=""),
    severity: str = Query(default=""),
    occurred_from: int = Query(default=0),
    occurred_to: int = Query(default=0),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
    order: str = Query(default="asc"),
) -> Any:
    _uid, is_admin, active_org_id, _role, err = _telemetry_read_context(request)
    if err is not None:
        return err
    requested_org_id = _as_text(org_id)
    effective_org_id = requested_org_id or _as_text(active_org_id)
    if requested_org_id and requested_org_id != _as_text(active_org_id) and not bool(is_admin):
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
    if not effective_org_id:
        return _legacy_main._enterprise_error(422, "validation_error", "org_id is required")

    lim = max(1, min(_as_int(limit, 50), 100))
    off = max(0, _as_int(offset, 0))
    sort_order = "desc" if _as_text(order).lower() == "desc" else "asc"
    from_ts_raw = _as_int(occurred_from, 0)
    to_ts_raw = _as_int(occurred_to, 0)
    filters = {
        "session_id": _as_text(session_id) or None,
        "request_id": _as_text(request_id) or None,
        "correlation_id": _as_text(correlation_id) or None,
        "user_id": _as_text(user_id) or None,
        "org_id": effective_org_id,
        "runtime_id": _as_text(runtime_id) or None,
        "event_type": _as_text(event_type).lower() or None,
        "source": _as_text(source).lower() or None,
        "severity": _as_text(severity).lower() or None,
        "occurred_from": from_ts_raw if from_ts_raw > 0 else None,
        "occurred_to": to_ts_raw if to_ts_raw > 0 else None,
    }
    total = count_error_events(**filters)
    rows = list_error_events(
        **filters,
        limit=lim,
        offset=off,
        order=sort_order,
    )
    return {
        "ok": True,
        "items": [_error_event_admin_item(row) for row in rows],
        "count": int(total),
        "page": {"limit": lim, "offset": off, "total": int(total), "order": sort_order},
        "filters": filters,
        "timeline": {"deduped": False, "order": sort_order},
    }


@router.get("/api/admin/error-events/{event_id}")
def admin_error_event_detail(event_id: str, request: Request) -> Any:
    _uid, is_admin, active_org_id, _role, err = _telemetry_read_context(request)
    if err is not None:
        return err
    row = get_error_event(event_id)
    if not row:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    event_org_id = _as_text(row.get("org_id"))
    if not bool(is_admin) and event_org_id != _as_text(active_org_id):
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    return {
        "ok": True,
        "item": _error_event_admin_item(row),
    }


@router.get("/api/admin/analytics/sessions/summary")
def admin_analytics_sessions_summary(
    request: Request,
    refresh: str = Query(default=""),
) -> Any:
    _uid, _is_admin, active_org_id, _role, err = _telemetry_read_context(request)
    if err is not None:
        return err
    org_id = _as_text(active_org_id) or "org_default"
    refresh_flag = _as_text(refresh).lower() in {"1", "true", "yes"}
    payload = get_session_analytics_summary(org_id=org_id, refresh=refresh_flag)
    return {"ok": True, **payload}


@router.get("/api/admin/analytics/sessions/top")
def admin_analytics_sessions_top(
    request: Request,
    sort_by: str = Query(default="version_count"),
    sort_order: str = Query(default="desc"),
    filter_author: str = Query(default=""),
    page: int = Query(default=1),
    page_size: int = Query(default=20),
) -> Any:
    _uid, _is_admin, active_org_id, _role, err = _telemetry_read_context(request)
    if err is not None:
        return err
    org_id = _as_text(active_org_id) or "org_default"
    payload = get_session_analytics_top(
        org_id=org_id,
        sort_by=sort_by,
        sort_order=sort_order,
        filter_author=filter_author,
        page=page,
        page_size=page_size,
    )
    return {"ok": True, **payload}


@router.get("/api/admin/audit")
def admin_audit(
    request: Request,
    q: str = Query(default=""),
    status: str = Query(default=""),
    action: str = Query(default=""),
    session_id: str = Query(default=""),
    project_id: str = Query(default=""),
    updated_from: int = Query(default=0),
    updated_to: int = Query(default=0),
    limit: int = Query(default=20),
    offset: int = Query(default=0),
) -> Any:
    _uid, _is_admin, oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    lim = max(1, min(_as_int(limit, 20), 50))
    off = max(0, _as_int(offset, 0))
    q_value = _as_text(q).lower() or None
    updated_from_raw = _as_int(updated_from, 0)
    updated_to_raw = _as_int(updated_to, 0)
    from_ts = updated_from_raw if updated_from_raw > 0 else None
    to_ts = updated_to_raw if updated_to_raw > 0 else None
    total = count_audit_log(
        oid or "",
        action=_as_text(action) or None,
        project_id=_as_text(project_id) or None,
        session_id=_as_text(session_id) or None,
        status=_as_text(status).lower() or None,
        q=q_value,
        updated_from=from_ts,
        updated_to=to_ts,
    )
    rows = list_audit_log(
        oid or "",
        limit=lim,
        offset=off,
        action=_as_text(action) or None,
        project_id=_as_text(project_id) or None,
        session_id=_as_text(session_id) or None,
        status=_as_text(status).lower() or None,
        q=q_value,
        updated_from=from_ts,
        updated_to=to_ts,
    )
    status_counts = Counter(_as_text(_as_dict(item).get("status")).lower() or "unknown" for item in rows)
    actors = {_as_text(_as_dict(item).get("actor_user_id")) for item in rows if _as_text(_as_dict(item).get("actor_user_id"))}
    return {
        "ok": True,
        "summary": {
            "total": int(total),
            "ok": int(status_counts.get("ok", 0)),
            "failed": int(status_counts.get("fail", 0)),
            "unique_actors": len(actors),
        },
        "items": rows,
        "count": int(total),
        "page": {"limit": lim, "offset": off, "total": int(total)},
    }


# ── RAG admin settings ────────────────────────────────────────────────────────

_SAFE_RAG_FIELDS = {
    "enabled", "indexing_enabled", "default_top_k", "max_top_k",
    "default_min_score", "allowed_source_types", "show_technical_fragments",
}
_INVARIANT_RAG_FIELDS = {
    "read_only_mode", "auto_apply_enabled", "embeddings_enabled", "vector_search_enabled",
}
_KNOWN_RAG_SOURCE_TYPES = {"bpmn_xml", "product_action", "note_thread"}


def _rag_settings_defaults(org_id: str) -> Dict[str, Any]:
    return {
        "org_id": org_id,
        "enabled": True,
        "indexing_enabled": True,
        "default_top_k": 10,
        "max_top_k": 50,
        "default_min_score": None,
        "allowed_source_types": ["bpmn_xml", "product_action"],
        "show_technical_fragments": False,
        "updated_at": None,
        "updated_by": None,
    }


def _rag_settings_load(con: Any, org_id: str) -> Dict[str, Any]:
    row = con.execute(
        "SELECT * FROM rag_settings WHERE org_id=? LIMIT 1", [org_id]
    ).fetchone()
    if not row:
        return _rag_settings_defaults(org_id)
    d = dict(row)
    try:
        source_types = json.loads(d.get("allowed_source_types") or '["bpmn_xml","product_action"]')
    except Exception:
        source_types = ["bpmn_xml", "product_action"]
    return {
        "org_id": d["org_id"],
        "enabled": bool(d.get("enabled", 1)),
        "indexing_enabled": bool(d.get("indexing_enabled", 1)),
        "default_top_k": int(d.get("default_top_k", 10)),
        "max_top_k": int(d.get("max_top_k", 50)),
        "default_min_score": d.get("default_min_score"),
        "allowed_source_types": source_types,
        "show_technical_fragments": bool(d.get("show_technical_fragments", 0)),
        "updated_at": d.get("updated_at") or None,
        "updated_by": d.get("updated_by") or None,
    }


def _rag_status_counts(con: Any, org_id: str) -> Dict[str, int]:
    def _cnt(sql: str, params: list) -> int:
        row = con.execute(sql, params).fetchone()
        return int(row[0]) if row else 0

    sources = _cnt("SELECT COUNT(*) FROM rag_sources WHERE org_id=?", [org_id])
    documents = _cnt("SELECT COUNT(*) FROM rag_documents WHERE org_id=?", [org_id])
    active_docs = _cnt("SELECT COUNT(*) FROM rag_documents WHERE org_id=? AND is_active=1", [org_id])
    chunks = _cnt("SELECT COUNT(*) FROM rag_chunks WHERE org_id=?", [org_id])
    try:
        feedback = _cnt("SELECT COUNT(*) FROM rag_feedback WHERE org_id=?", [org_id])
    except Exception:
        feedback = 0
    try:
        eval_cases = _cnt("SELECT COUNT(*) FROM rag_eval_cases WHERE org_id=?", [org_id])
    except Exception:
        eval_cases = 0
    return {
        "sources_count": sources,
        "documents_count": documents,
        "active_documents_count": active_docs,
        "chunks_count": chunks,
        "feedback_count": feedback,
        "eval_cases_count": eval_cases,
    }


@router.get("/api/admin/rag/settings")
def admin_rag_get_settings(request: Request) -> Any:
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    org_id = _as_text(oid)
    with _connect() as con:
        settings = _rag_settings_load(con, org_id)
        status = _rag_status_counts(con, org_id)
    return {
        "ok": True,
        "settings": {
            **settings,
            "read_only_mode": True,
            "auto_apply_enabled": False,
            "embeddings_enabled": False,
            "vector_search_enabled": False,
        },
        "status": status,
    }


@router.patch("/api/admin/rag/settings")
async def admin_rag_patch_settings(request: Request) -> Any:
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    org_id = _as_text(oid)
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    for field in _INVARIANT_RAG_FIELDS:
        if field in body:
            return _legacy_main._enterprise_error(
                400, "invalid_field", f"field '{field}' is invariant and cannot be changed"
            )

    unknown = set(body.keys()) - _SAFE_RAG_FIELDS
    if unknown:
        return _legacy_main._enterprise_error(
            400, "unknown_field", f"unknown fields: {sorted(unknown)}"
        )

    patch: Dict[str, Any] = {}

    if "enabled" in body:
        patch["enabled"] = 1 if body["enabled"] else 0
    if "indexing_enabled" in body:
        patch["indexing_enabled"] = 1 if body["indexing_enabled"] else 0
    if "show_technical_fragments" in body:
        patch["show_technical_fragments"] = 1 if body["show_technical_fragments"] else 0

    if "default_top_k" in body:
        try:
            v = int(body["default_top_k"])
        except (TypeError, ValueError):
            return _legacy_main._enterprise_error(400, "invalid_value", "default_top_k must be an integer")
        if v < 1:
            return _legacy_main._enterprise_error(400, "invalid_value", "default_top_k must be >= 1")
        patch["default_top_k"] = v

    if "max_top_k" in body:
        try:
            v = int(body["max_top_k"])
        except (TypeError, ValueError):
            return _legacy_main._enterprise_error(400, "invalid_value", "max_top_k must be an integer")
        if v > 100:
            return _legacy_main._enterprise_error(400, "invalid_value", "max_top_k must be <= 100")
        patch["max_top_k"] = v

    if "default_min_score" in body:
        val = body["default_min_score"]
        if val is not None:
            try:
                val = float(val)
            except (TypeError, ValueError):
                return _legacy_main._enterprise_error(400, "invalid_value", "default_min_score must be a number or null")
            if val < 0:
                return _legacy_main._enterprise_error(400, "invalid_value", "default_min_score must be >= 0")
        patch["default_min_score"] = val

    if "allowed_source_types" in body:
        types = body["allowed_source_types"]
        if not isinstance(types, list) or not all(isinstance(t, str) and t in _KNOWN_RAG_SOURCE_TYPES for t in types):
            return _legacy_main._enterprise_error(
                400, "invalid_value",
                f"allowed_source_types must be a list of known types: {sorted(_KNOWN_RAG_SOURCE_TYPES)}"
            )
        patch["allowed_source_types"] = json.dumps(types)

    if not patch:
        return {"ok": True, "updated": False}

    import time as _time
    now = int(_time.time())
    patch["updated_at"] = now
    patch["updated_by"] = _as_text(uid)

    with _connect() as con:
        current = _rag_settings_load(con, org_id)
        dtk = patch.get("default_top_k", current["default_top_k"])
        mtk = patch.get("max_top_k", current["max_top_k"])
        if mtk < dtk:
            return _legacy_main._enterprise_error(
                400, "invalid_value", "max_top_k must be >= default_top_k"
            )

        cols = ", ".join(f"{k}=?" for k in patch)
        vals = list(patch.values()) + [org_id]
        updated = con.execute(f"UPDATE rag_settings SET {cols} WHERE org_id=?", vals).rowcount
        if updated == 0:
            con.execute(
                """INSERT INTO rag_settings
                   (org_id, enabled, indexing_enabled, default_top_k, max_top_k,
                    default_min_score, allowed_source_types, show_technical_fragments,
                    updated_at, updated_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                [
                    org_id,
                    patch.get("enabled", 1),
                    patch.get("indexing_enabled", 1),
                    patch.get("default_top_k", 10),
                    patch.get("max_top_k", 50),
                    patch.get("default_min_score"),
                    patch.get("allowed_source_types", '["bpmn_xml","product_action"]'),
                    patch.get("show_technical_fragments", 0),
                    now,
                    _as_text(uid),
                ],
            )
        con.commit()
        settings = _rag_settings_load(con, org_id)

    return {
        "ok": True,
        "updated": True,
        "settings": {
            **settings,
            "read_only_mode": True,
            "auto_apply_enabled": False,
            "embeddings_enabled": False,
            "vector_search_enabled": False,
        },
    }


# ── Admin Permissions (Organizations tab) ───────────────────────────────────

class AdminPermissionUpdate(BaseModel):
    role: str
    permissions: Dict[str, bool] = Field(default_factory=dict)


class AdminPermissionBulkItem(BaseModel):
    entity_type: str
    entity_id: str
    role: str
    permissions: Dict[str, bool] = Field(default_factory=dict)


class AdminPermissionBulkBody(BaseModel):
    updates: List[AdminPermissionBulkItem] = Field(default_factory=list)


_ADMIN_PERMISSION_ROLES = ("org_owner", "org_admin", "editor", "project_manager", "org_viewer", "auditor")
_ADMIN_PERMISSION_ENTITY_TYPES = ("users", "sessions", "folders", "workspaces", "analytics")


def _admin_permission_allowed(role: Optional[str]) -> bool:
    return _as_text(role).lower() in {"org_owner", "org_admin"}


@router.get("/api/admin/permissions")
def admin_permissions_list(
    request: Request,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    stored = list_admin_entity_permissions(oid, entity_type=entity_type, entity_id=entity_id)
    defaults: Dict[str, Dict[str, Dict[str, bool]]] = {}
    for etype in _ADMIN_PERMISSION_ENTITY_TYPES:
        defaults[etype] = {}
        for r in _ADMIN_PERMISSION_ROLES:
            defaults[etype][r] = _admin_entity_permission_defaults(etype, r)

    overrides: Dict[str, List[Dict[str, Any]]] = {}
    for row in stored:
        etype = _as_text(row.get("entity_type"))
        overrides.setdefault(etype, []).append(row)

    return {
        "ok": True,
        "defaults": defaults,
        "overrides": overrides,
        "items": stored,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }


@router.get("/api/admin/permissions/entities")
def admin_permissions_entities(
    request: Request,
    entity_type: str,
    workspace_id: Optional[str] = None,
):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    entities: List[Dict[str, Any]] = []
    if entity_type == "workspaces":
        entities = [{"id": r["id"], "name": r["name"]} for r in list_org_workspaces(oid)]
    elif entity_type == "folders":
        entities = [{"id": r["id"], "name": r["name"], "workspace_id": r.get("workspace_id", ""), "parent_id": r.get("parent_id", "")} for r in list_org_workspace_folders(oid, workspace_id=workspace_id)]
    elif entity_type == "sessions":
        rows = get_storage().list(limit=5000, org_id=oid, is_admin=True)
        entities = [
            {"id": _as_text(r.get("id")), "name": _as_text(r.get("title") or r.get("id")), "project_id": _as_text(r.get("project_id")), "workspace_id": _as_text(r.get("workspace_id", ""))}
            for r in rows
        ]
    elif entity_type == "analytics":
        entities = [{"id": "dk", "name": "Demand Knowledge"}, {"id": "fk", "name": "Food Knowledge"}]

    stored = list_admin_entity_permissions(oid, entity_type=entity_type)
    overrides = {(r["entity_id"], r["role"]): r["permissions"] for r in stored}

    return {
        "ok": True,
        "entity_type": entity_type,
        "entities": entities,
        "overrides": overrides,
    }


@router.patch("/api/admin/permissions/{entity_type}/{entity_id}")
def admin_permissions_patch(
    request: Request,
    entity_type: str,
    entity_id: str,
    body: AdminPermissionUpdate,
):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    result = upsert_admin_entity_permission(
        org_id=oid,
        entity_type=entity_type,
        entity_id=entity_id,
        role=body.role,
        permissions=body.permissions,
        updated_by=uid or "",
    )
    _legacy_main._audit_log_safe(
        request,
        org_id=oid,
        action="admin.permissions.update",
        entity_type=entity_type,
        entity_id=entity_id,
        meta={"role": body.role, "permissions": result["permissions"]},
    )
    return {"ok": True, "item": result}


@router.post("/api/admin/permissions/bulk")
def admin_permissions_bulk(
    request: Request,
    body: AdminPermissionBulkBody,
):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    updated: List[Dict[str, Any]] = []
    for item in body.updates:
        result = upsert_admin_entity_permission(
            org_id=oid,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            role=item.role,
            permissions=item.permissions,
            updated_by=uid or "",
        )
        updated.append(result)

    _legacy_main._audit_log_safe(
        request,
        org_id=oid,
        action="admin.permissions.bulk_update",
        entity_type="permissions",
        entity_id="bulk",
        meta={"count": len(updated)},
    )
    return {"ok": True, "updated": updated}


class AdminMatrixPermissionUpdate(BaseModel):
    permissions: Dict[str, bool] = Field(default_factory=dict)


class AdminMatrixBulkItem(BaseModel):
    principal_type: str
    principal_id: str
    entity_type: str
    entity_id: str
    permissions: Dict[str, bool] = Field(default_factory=dict)


class AdminMatrixBulkBody(BaseModel):
    updates: List[AdminMatrixBulkItem] = Field(default_factory=list)


_MATRIX_ENTITY_TYPES = ("users", "sessions", "folders", "workspaces", "analytics")
_MATRIX_ROLES = ("org_owner", "org_admin", "editor", "project_manager", "org_viewer", "auditor")


def _effective_matrix_permissions(org_id: str, principal_type: str, principal_id: str, entity_type: str, entity_id: str) -> Dict[str, bool]:
    keys = _admin_entity_permission_keys(entity_type)
    stored = list_admin_entity_permissions(
        org_id,
        entity_type=entity_type,
        entity_id=entity_id,
        principal_type=principal_type,
        principal_id=principal_id,
    )
    override = stored[0]["permissions"] if stored else {}
    if principal_type == "role":
        template = _admin_entity_permission_defaults(entity_type, principal_id)
        return {k: bool(override.get(k, template.get(k, False))) for k in keys}
    if override:
        return {k: bool(override.get(k, False)) for k in keys}
    # For users with no override, fall back to their org role default.
    if principal_type == "user":
        role = str(get_user_org_role(principal_id, org_id) or "org_viewer").strip()
        template = _admin_entity_permission_defaults(entity_type, role)
        return {k: bool(template.get(k, False)) for k in keys}
    return {k: False for k in keys}


def _matrix_principals(org_id: str) -> List[Dict[str, Any]]:
    principals: List[Dict[str, Any]] = []
    seen_users: Set[str] = set()
    for role in _MATRIX_ROLES:
        principals.append({
            "principal_type": "role",
            "principal_id": role,
            "name": role.replace("org_", "").replace("_", " ").title(),
            "email": "",
            "kind": "role",
        })
    for group in list_org_groups(org_id):
        principals.append({
            "principal_type": "group",
            "principal_id": str(group.get("id") or ""),
            "name": str(group.get("name") or ""),
            "email": "",
            "kind": "group",
        })
    for membership in list_org_memberships(org_id):
        user_id = str(membership.get("user_id") or "").strip()
        if not user_id or user_id in seen_users:
            continue
        user = find_user_by_id(user_id) or {}
        if not user:
            continue
        seen_users.add(user_id)
        principals.append({
            "principal_type": "user",
            "principal_id": user_id,
            "name": str(user.get("full_name") or "").strip() or user_id,
            "email": str(user.get("email") or "").strip(),
            "kind": "user",
            "role": str(membership.get("role") or "").strip(),
        })
    return principals


@router.get("/api/admin/permissions/principals")
def admin_permissions_principals(request: Request):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")
    return {"ok": True, "items": _matrix_principals(oid)}


def _matrix_entities(org_id: str, entity_type: str) -> List[Dict[str, Any]]:
    if entity_type == "workspaces":
        return [{"id": r["id"], "name": r["name"]} for r in list_org_workspaces(org_id)]
    if entity_type == "folders":
        return [{"id": r["id"], "name": r["name"]} for r in list_org_workspace_folders(org_id)]
    if entity_type == "sessions":
        rows = get_storage().list(limit=100, org_id=org_id, is_admin=True)
        return [
            {"id": _as_text(r.get("id")), "name": _as_text(r.get("title") or r.get("id"))}
            for r in rows
        ]
    if entity_type == "analytics":
        return [{"id": "dk", "name": "Demand Knowledge"}, {"id": "fk", "name": "Food Knowledge"}]
    return []


@router.get("/api/admin/permissions/matrix")
def admin_permissions_matrix(
    request: Request,
    principal_type: Optional[str] = None,
    principal_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    if principal_type and principal_id:
        entity_types = [entity_type] if entity_type else list(_MATRIX_ENTITY_TYPES)
        eid = entity_id or "*"
        perms = {}
        for etype in entity_types:
            perms[etype] = _effective_matrix_permissions(oid, principal_type, principal_id, etype, eid)
        return {
            "ok": True,
            "principal_type": principal_type,
            "principal_id": principal_id,
            "entity_id": eid,
            "permissions": perms,
        }

    principals = _matrix_principals(oid)

    # Advanced view: list all entity instances for one entity type.
    if entity_type and not entity_id:
        entities = [{"id": "*", "name": "Default"}, *_matrix_entities(oid, entity_type)]
        items = []
        for p in principals:
            perms = {}
            for e in entities:
                perms[e["id"]] = _effective_matrix_permissions(oid, p["principal_type"], p["principal_id"], entity_type, e["id"])
            items.append({**p, "permissions": perms})
        return {
            "ok": True,
            "entity_type": entity_type,
            "entities": entities,
            "items": items,
            "count": len(items),
        }

    # Simplified view: entity-type-level defaults (entity_id='*').
    entity_types = list(_MATRIX_ENTITY_TYPES)
    items = []
    for p in principals:
        perms = {}
        for etype in entity_types:
            perms[etype] = _effective_matrix_permissions(oid, p["principal_type"], p["principal_id"], etype, "*")
        items.append({**p, "permissions": perms})
    return {"ok": True, "entity_id": "*", "items": items, "count": len(items)}


@router.patch("/api/admin/permissions/matrix/{principal_type}/{principal_id}/{entity_type}/{entity_id}")
def admin_permissions_matrix_patch(
    request: Request,
    principal_type: str,
    principal_id: str,
    entity_type: str,
    entity_id: str,
    body: AdminMatrixPermissionUpdate,
):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    result = upsert_admin_entity_permission(
        org_id=oid,
        entity_type=entity_type,
        entity_id=entity_id,
        permissions=body.permissions,
        updated_by=uid or "",
        principal_type=principal_type,
        principal_id=principal_id,
    )
    _legacy_main._audit_log_safe(
        request,
        org_id=oid,
        action="admin.permissions.matrix.update",
        entity_type=entity_type,
        entity_id=entity_id,
        meta={"principal_type": principal_type, "principal_id": principal_id, "permissions": result["permissions"]},
    )
    return {"ok": True, "item": result}


@router.post("/api/admin/permissions/matrix/bulk")
def admin_permissions_matrix_bulk(request: Request, body: AdminMatrixBulkBody):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    updated: List[Dict[str, Any]] = []
    for item in body.updates:
        result = upsert_admin_entity_permission(
            org_id=oid,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            permissions=item.permissions,
            updated_by=uid or "",
            principal_type=item.principal_type,
            principal_id=item.principal_id,
        )
        updated.append(result)

    _legacy_main._audit_log_safe(
        request,
        org_id=oid,
        action="admin.permissions.matrix.bulk_update",
        entity_type="permissions",
        entity_id="bulk",
        meta={"count": len(updated)},
    )
    return {"ok": True, "updated": updated}


@router.get("/api/admin/invites/{invite_id}/permissions")
def admin_invite_permissions_get(request: Request, invite_id: str):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    permissions = get_admin_invite_permissions(invite_id)
    return {"ok": True, "invite_id": invite_id, "permissions": permissions}


@router.patch("/api/admin/invites/{invite_id}/permissions")
def admin_invite_permissions_patch(
    request: Request,
    invite_id: str,
    body: Dict[str, bool],
):
    uid, is_admin, oid, role, scope, err = _admin_context(request)
    if err is not None:
        return err
    if not _admin_permission_allowed(role) and not is_admin:
        return _legacy_main._enterprise_error(403, "forbidden", "insufficient_permissions")

    ok = set_admin_invite_permissions(invite_id, body)
    if not ok:
        return _legacy_main._enterprise_error(404, "not_found", "invite not found")

    _legacy_main._audit_log_safe(
        request,
        org_id=oid,
        action="admin.invite.permissions_update",
        entity_type="invite",
        entity_id=invite_id,
        meta={"permissions": body},
    )
    return {"ok": True, "invite_id": invite_id}
