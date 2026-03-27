from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field
from starlette.responses import Response

from .. import _legacy_main
from ..auto_pass_jobs import redis_queue_enabled
from ..auth import AuthError, create_user, list_users as list_auth_users, update_user
from ..redis_client import get_client, runtime_status
from ..storage import (
    delete_org_membership,
    get_project_storage,
    get_storage,
    list_audit_log,
    list_org_invites,
    list_org_memberships,
    list_org_records,
    list_templates,
    list_user_org_memberships,
    upsert_org_membership,
)

router = APIRouter()

_ADMIN_ALLOWED_ROLES = {"org_owner", "org_admin", "project_manager", "auditor"}
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


class AdminUserMembershipIn(BaseModel):
    org_id: str
    role: str = "org_viewer"


class AdminUserCreateBody(BaseModel):
    email: str
    password: str
    is_admin: bool = False
    is_active: bool = True
    memberships: List[AdminUserMembershipIn] = Field(default_factory=list)


class AdminUserPatchBody(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    memberships: Optional[List[AdminUserMembershipIn]] = None


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
    if not (is_admin or _legacy_main._is_role_allowed(role_l, _ADMIN_ALLOWED_ROLES)):
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


def _normalize_admin_membership_role(raw: Any) -> str:
    key = _as_text(raw).lower()
    normalized = _ADMIN_USER_ROLE_ALIASES.get(key, "")
    if not normalized:
        raise ValueError("role must be org_admin, editor or org_viewer")
    return normalized


def _normalize_admin_memberships(rows: List[AdminUserMembershipIn], *, allow_empty: bool = False) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen: set[str] = set()
    for item in rows:
        org_id = _as_text(getattr(item, "org_id", ""))
        if not org_id:
            raise ValueError("org_id is required")
        if org_id in seen:
            continue
        role = _normalize_admin_membership_role(getattr(item, "role", "org_viewer"))
        out.append({"org_id": org_id, "role": role})
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
        items.append(
            {
                "org_id": org_id,
                "org_name": _as_text(org_name_by_id.get(org_id) or row.get("name") or org_id),
                "role": _as_text(row.get("role") or "org_viewer") or "org_viewer",
                "created_at": _as_int(row.get("created_at"), 0),
            }
        )
    return items


def _user_payload(row: Dict[str, Any], *, org_name_by_id: Dict[str, str]) -> Dict[str, Any]:
    user = _as_dict(row)
    user_id = _as_text(user.get("id"))
    memberships = _membership_payload_for_user(user_id, org_name_by_id=org_name_by_id)
    return {
        "id": user_id,
        "email": _as_text(user.get("email")).lower(),
        "is_active": bool(user.get("is_active", False)),
        "is_admin": bool(user.get("is_admin", False)),
        "created_at": _as_int(user.get("created_at"), 0),
        "memberships": memberships,
    }


def _replace_user_memberships(user_id: str, memberships: List[Dict[str, str]]) -> List[Dict[str, Any]]:
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
        upsert_org_membership(org_id, user_id, _as_text(row.get("role") or "org_viewer"))
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
    allowed_ids = set(_legacy_main._scope_allowed_project_ids(scope))
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


@router.get("/api/admin/users")
def admin_users(request: Request) -> Any:
    _uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    org_name_by_id = _org_name_by_id()
    items = [_user_payload(row, org_name_by_id=org_name_by_id) for row in list_auth_users()]
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
    return {
        "ok": True,
        "item": _user_payload(created, org_name_by_id=_org_name_by_id()),
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
    return {
        "ok": True,
        "item": _user_payload(updated, org_name_by_id=_org_name_by_id()),
    }


@router.get("/api/admin/projects")
def admin_projects(
    request: Request,
    q: str = Query(default=""),
) -> Any:
    _uid, _is_admin, _oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    workspace, ws_err = _workspace_payload(request, q=q, limit=500, offset=0)
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
    return {
        "ok": True,
        "items": items,
        "count": len(items),
    }


@router.get("/api/admin/sessions")
def admin_sessions(
    request: Request,
    q: str = Query(default=""),
    status: str = Query(default=""),
    owner_ids: str = Query(default=""),
) -> Any:
    _uid, _is_admin, _oid, _role, scope, err = _admin_context(request)
    if err is not None:
        return err
    workspace, ws_err = _workspace_payload(request, q=q, status=status, owner_ids=owner_ids, limit=500, offset=0)
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
        "count": len(items),
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


@router.get("/api/admin/audit")
def admin_audit(
    request: Request,
    q: str = Query(default=""),
    status: str = Query(default=""),
    action: str = Query(default=""),
    session_id: str = Query(default=""),
    project_id: str = Query(default=""),
    limit: int = Query(default=200),
) -> Any:
    _uid, _is_admin, oid, _role, _scope, err = _admin_context(request)
    if err is not None:
        return err
    rows = list_audit_log(
        oid or "",
        limit=max(1, min(int(limit or 200), 500)),
        action=_as_text(action) or None,
        project_id=_as_text(project_id) or None,
        session_id=_as_text(session_id) or None,
        status=_as_text(status).lower() or None,
    )
    query = _as_text(q).lower()
    if query:
        filtered = []
        for row in rows:
            item = _as_dict(row)
            hay = " ".join(
                [
                    _as_text(item.get("action")),
                    _as_text(item.get("actor_user_id")),
                    _as_text(item.get("project_id")),
                    _as_text(item.get("session_id")),
                    _as_text(item.get("entity_type")),
                    _as_text(item.get("entity_id")),
                ]
            ).lower()
            if query in hay:
                filtered.append(item)
        rows = filtered
    status_counts = Counter(_as_text(_as_dict(item).get("status")).lower() or "unknown" for item in rows)
    actors = {_as_text(_as_dict(item).get("actor_user_id")) for item in rows if _as_text(_as_dict(item).get("actor_user_id"))}
    return {
        "ok": True,
        "summary": {
            "total": len(rows),
            "ok": int(status_counts.get("ok", 0)),
            "failed": int(status_counts.get("fail", 0)),
            "unique_actors": len(actors),
        },
        "items": rows,
        "count": len(rows),
    }
