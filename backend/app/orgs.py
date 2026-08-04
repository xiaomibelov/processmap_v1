from __future__ import annotations

import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, Query, Request, Response

from .auth import (
    AuthError,
    _rate_limit_check,
    ensure_invited_identity,
    find_user_by_id,
)
from .legacy.request_context import (
    enterprise_error as _enterprise_error,
    request_active_org_id as _request_active_org_id,
    request_auth_user as _request_auth_user,
    request_user_email as _request_user_email,
    request_user_meta as _request_user_meta,
)
from .models import CreateProjectIn, Session
from .redis_cache import invalidate_workspace_org
from .schemas.legacy_api import (
    CreatePathReportVersionIn,
    CreateSessionIn,
    OrgCreateIn,
    OrgInviteAcceptIn,
    OrgInviteCreateIn,
    OrgMemberPatchIn,
    OrgPatchIn,
    OrgReportBuildIn,
    ProjectMemberPatchIn,
    ProjectMemberUpsertIn,
    norm_project_session_mode as _norm_project_session_mode,
)
from .services.audit import _audit_log_safe
from .services.org_invites import (
    build_invite_create_audit_meta,
    normalize_invite_role,
    normalize_invite_ttl_days,
)
from .services.org_workspace import (
    enterprise_require_org_member as _enterprise_require_org_member,
    enterprise_require_org_role as _enterprise_require_org_role,
    org_role_for_request as _org_role_for_request,
    project_scope_for_request as _project_scope_for_request,
    rename_org_with_validation,
)
from .shared.coerce import (
    _env_bool,
    _env_int,
    _norm_project_sessions_view,
    _request_client_ip,
)
from .shared.payloads import (
    _build_invite_link,
    _pick_current_org_invite,
    _with_invite_links,
)
from .shared.text_utils import _clean_name
from .storage import (
    accept_org_invite,
    cleanup_audit_log,
    cleanup_org_invites,
    create_org_invite,
    create_org_record,
    delete_org_invite,
    delete_project_membership,
    get_default_org_id,
    get_org_git_mirror_config,
    get_org_invite_by_id,
    get_project_storage,
    get_storage,
    is_org_active,
    list_audit_log,
    list_org_invites,
    list_org_memberships,
    list_project_memberships,
    list_user_org_memberships,
    promote_regenerated_org_invite,
    resolve_active_org_id,
    revoke_org_invite,
    upsert_org_membership,
    upsert_project_membership,
)
from .utils.authz import (
    can_manage_workspace as _can_manage_workspace,
    enterprise_manage_project_members_guard as _enterprise_manage_project_members_guard,
    enterprise_require_project_access as _enterprise_require_project_access,
    is_role_allowed as _is_role_allowed,
    scope_allowed_project_ids as _scope_allowed_project_ids,
    session_access_from_request as _session_access_from_request,
)
from .utils.legacy_normalization import (
    norm_prep_questions as _norm_prep_questions,
    norm_roles as _norm_roles,
)
from .utils.response_builders import build_items_count_payload, build_items_payload


# ── Org role constants (moved verbatim from _legacy_main, PR-7) ────

_ORG_WRITE_ROLES = {"org_owner", "org_admin"}
_ORG_EDITOR_ROLES = {"org_owner", "org_admin", "project_manager", "editor"}
_ORG_READ_ROLES = {"org_owner", "org_admin", "project_manager", "editor", "viewer", "org_viewer", "auditor"}
_ORG_REPORT_DELETE_ROLES = {"org_owner", "org_admin", "project_manager"}
_ORG_MEMBER_MANAGE_ROLES = {"org_owner", "org_admin"}
_ORG_INVITE_MANAGE_ROLES = {"org_owner", "org_admin"}
_ORG_AUDIT_READ_ROLES = {"org_owner", "org_admin", "auditor", "project_manager"}



# ── Org membership / guards ──────────────────────────────────────

def _require_org_active_for_writes(request: Optional[Request], org_id: str) -> None:
    if not org_id:
        return
    user = _request_auth_user(request) if request is not None else {}
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if is_admin:
        return
    if not is_org_active(org_id):
        raise HTTPException(status_code=403, detail="organization_inactive")



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



# ── Invite email flow ────────────────────────────────────────────

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



# ── Workspace cache invalidation ─────────────────────────────────

def _resolved_org_for_cache(org_id: Any) -> str:
    return str(org_id or "").strip() or get_default_org_id()


def _invalidate_workspace_cache_for_org(org_id: Any) -> None:
    invalidate_workspace_org(_resolved_org_for_cache(org_id))



# ── HTTP handlers (decorators stripped; re-registered on the legacy
# app in _legacy_main.py at the original position) ────────────────

def list_orgs_endpoint(request: Request) -> Dict[str, Any]:
    user = _request_auth_user(request)
    user_id = str(user.get("id") or "").strip()
    is_admin = bool(user.get("is_admin", False))
    active_org_id = str(getattr(request.state, "active_org_id", "") or "").strip() or resolve_active_org_id(user_id, is_admin=is_admin)
    items = list_user_org_memberships(user_id, is_admin=is_admin)
    return build_items_payload(items, active_org_id=active_org_id, default_org_id=get_default_org_id())


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


def list_org_project_sessions(org_id: str, project_id: str, request: Request, mode: str | None = None, view: str | None = None) -> List[Dict[str, Any]]:
    import app._legacy_main as _lm
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
            out.append(_lm._session_api_dump(Session.model_validate(row)))
    return out


def create_org_project_session(
    org_id: str,
    project_id: str,
    inp: CreateSessionIn,
    request: Request,
    mode: str | None = Query(default="quick_skeleton"),
) -> Dict[str, Any]:
    import app._legacy_main as _lm
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
    _lm._invalidate_session_caches(sess, org_id=oid)
    return _lm._session_api_dump(sess)


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


def create_org_invite_endpoint(org_id: str, inp: OrgInviteCreateIn, request: Request):
    import app._legacy_main as _lm
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
            permissions=getattr(inp, "permissions", None),
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
            _lm._send_org_invite_email(
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


def accept_org_invite_endpoint(org_id: str, inp: OrgInviteAcceptIn, request: Request):
    oid = str(org_id or "").strip()
    token = str(getattr(inp, "token", "") or "").strip()
    return _accept_org_invite_response(request, org_id=oid, token=token)


def accept_invite_endpoint(inp: OrgInviteAcceptIn, request: Request):
    token = str(getattr(inp, "token", "") or "").strip()
    return _accept_org_invite_response(request, org_id=None, token=token)


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


def list_org_session_report_versions(
    org_id: str,
    session_id: str,
    request: Request,
    path_id: str = "",
    steps_hash: str = "",
):
    import app._legacy_main as _lm
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
    rows = _lm._list_path_report_versions_core(
        session_id=str(getattr(sess, "id", "") or session_id),
        path_id=pid,
        steps_hash=steps_hash,
        request=request,
        org_id=oid,
        is_admin=True,
    )
    _ = uid
    return rows


def build_org_session_report(
    org_id: str,
    session_id: str,
    inp: OrgReportBuildIn,
    request: Request,
):
    import app._legacy_main as _lm
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
    created = _lm._create_path_report_version_core(
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


def get_org_session_report_version(
    org_id: str,
    session_id: str,
    version_id: str,
    request: Request,
    path_id: str = "",
):
    import app._legacy_main as _lm
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
        by_path = _lm._get_report_versions_by_path(getattr(sess, "interview", {}))
        for candidate_pid, rows in by_path.items():
            if any(str((row or {}).get("id") or "").strip() == rid for row in (rows or [])):
                pid = str(candidate_pid or "").strip()
                break
    if not pid:
        return _enterprise_error(404, "not_found", "not_found")
    detail = _lm._get_path_report_version_detail_core(
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


def delete_org_session_report_version(
    org_id: str,
    session_id: str,
    version_id: str,
    request: Request,
    path_id: str = "",
):
    import app._legacy_main as _lm
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
        by_path = _lm._get_report_versions_by_path(getattr(sess, "interview", {}))
        for candidate_pid, rows in by_path.items():
            if any(str((row or {}).get("id") or "").strip() == rid for row in (rows or [])):
                pid = str(candidate_pid or "").strip()
                break
    if not pid:
        return _enterprise_error(404, "not_found", "not_found")
    try:
        response = _lm._delete_path_report_version_core(
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
